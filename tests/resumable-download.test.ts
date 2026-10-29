import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadWithResume, downloadFailure } from "../electron/services/resumable-download.js";
import { runLoggedProcess } from "../electron/services/environment.js";
import { prepareStrataDownloadCache } from "../electron/services/strata-download-cache.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-resume-")); roots.push(root); return { root, destination: path.join(root, "engine.zip") }; }
const wait = async () => undefined;
const fail = (code: number, detail = "Recv failure: Connection was reset") => Object.assign(new Error(`命令退出，代码 ${code}`), { stdout: `curl: (${code}) ${detail}` });

describe("resumable software download", () => {
  it("shares one ten-minute deadline across all three attempts", async () => {
    const { destination } = await fixture(); let now = 1000; vi.spyOn(Date, "now").mockImplementation(() => now);
    const budgets: number[] = [];
    const run = vi.fn(async (_args: string[], timeout: number) => { budgets.push(timeout); now += 200_000; throw fail(56); });
    await expect(downloadWithResume({ url: "https://example.invalid/file", destination, totalBytes: 9, run, wait })).rejects.toThrow("curl 56");
    expect(budgets).toEqual([600_000, 400_000, 200_000]);
  });
  it("resumes real bytes after curl56, then reuses the partial across a separate user retry without resetting progress", async () => {
    const { destination } = await fixture(), onProgress = vi.fn();
    await fs.writeFile(destination, "1234");
    const run = vi.fn(async (args: string[]) => { expect(args[args.indexOf("--continue-at") + 1]).toBe(String((await fs.stat(destination)).size)); await fs.appendFile(destination, "5"); throw fail(56); });
    await expect(downloadWithResume({ url: "https://example.invalid/fixed.zip", destination, totalBytes: 10, run, wait, onProgress })).rejects.toThrow("Recv failure");
    expect(run).toHaveBeenCalledTimes(3); expect((await fs.stat(destination)).size).toBe(7);
    expect(onProgress.mock.calls.flat()).not.toContain(0);
    const finish = vi.fn(async (args: string[]) => { expect(args[args.indexOf("--continue-at") + 1]).toBe("7"); await fs.appendFile(destination, "890"); });
    await downloadWithResume({ url: "https://example.invalid/fixed.zip", destination, totalBytes: 10, run: finish, wait });
    expect(await fs.readFile(destination, "utf8")).toBe("1234555890");
    const noNetwork = vi.fn(); await downloadWithResume({ url: "https://example.invalid/fixed.zip", destination, totalBytes: 10, run: noNetwork, wait }); expect(noNetwork).not.toHaveBeenCalled();
  });
  it.each([33, 60, 22])("does not retry range/certificate/404 failures or throw away the partial (%s)", async code => {
    const { destination } = await fixture(); await fs.writeFile(destination, "keep");
    const run = vi.fn(async () => { throw fail(code, code === 22 ? "The requested URL returned error: 404" : "resume/certificate failed"); });
    await expect(downloadWithResume({ url: "https://example.invalid/file", destination, totalBytes: 9, run, wait })).rejects.toThrow(`curl ${code}`);
    expect(run).toHaveBeenCalledOnce(); expect(await fs.readFile(destination, "utf8")).toBe("keep");
  });
  it("cancels while waiting to retry and leaves the partial untouched", async () => {
    const { destination } = await fixture(), controller = new AbortController(); await fs.writeFile(destination, "keep");
    const run = vi.fn(async () => { throw fail(56); });
    const waiting = vi.fn(async (_ms: number, signal?: AbortSignal) => { controller.abort(new Error("cancelled")); signal?.throwIfAborted(); });
    await expect(downloadWithResume({ url: "https://example.invalid/file", destination, totalBytes: 9, run, wait: waiting, signal: controller.signal })).rejects.toThrow("cancelled");
    expect(run).toHaveBeenCalledOnce(); expect(await fs.readFile(destination, "utf8")).toBe("keep");
  });
  it("shows bounded curl detail, hides credential URLs, and retries only transient HTTP failures", () => {
    expect(downloadFailure(fail(56, "Recv failure https://user:password@private.invalid/?secret=abc"))).toMatchObject({ code: 56, retryable: true, detail: "curl: (56) Recv failure [下载地址]" });
    expect(downloadFailure(fail(22, "The requested URL returned error: 503")).retryable).toBe(true);
    expect(downloadFailure(fail(22, "The requested URL returned error: 404")).retryable).toBe(false);
  });
  it("rejects a linked partial without touching its target or launching curl", async () => {
    const { root, destination } = await fixture(), target = path.join(root, "target"); await fs.writeFile(target, "keep"); await fs.link(target, destination);
    const run = vi.fn(); await expect(downloadWithResume({ url: "https://example.invalid/file", destination, totalBytes: 9, run })).rejects.toThrow("未覆盖");
    expect(run).not.toHaveBeenCalled(); expect(await fs.readFile(target, "utf8")).toBe("keep");
  });
});

describe("asset-keyed Strata software cache", () => {
  const asset = { url: "https://example.invalid/fixed.zip", bytes: 20, sha256: "a".repeat(64), revision: "b".repeat(40) };
  it("resumes tar.gz components in their own cache without adopting a legacy ZIP", async () => {
    const { root } = await fixture(), stage = path.join(root, ".install-legacy"); await fs.mkdir(stage);
    await fs.writeFile(path.join(stage, "engine.zip"), Buffer.from([0x50, 0x4b, 3, 4]));
    const run = vi.fn(), expected = { ...asset, url: "https://example.invalid/engine.tar.gz" };
    const archive = await prepareStrataDownloadCache(root, { run, log: vi.fn() }, expected);
    expect(archive).toMatch(/engine\.tar\.gz$/u);
    expect(run).not.toHaveBeenCalled();
    await fs.writeFile(archive, "partial tar");
    expect(await prepareStrataDownloadCache(root, { run, log: vi.fn() }, expected)).toBe(archive);
    expect(await fs.readFile(archive, "utf8")).toBe("partial tar");
  });
  it("copies only a pinned official Git-stage partial, preserves it and reuses the cache on later clicks", async () => {
    const { root } = await fixture(), stage = path.join(root, ".install-legacy"); await fs.mkdir(stage);
    const source = path.join(stage, "engine.zip"); await fs.writeFile(source, Buffer.from([0x50, 0x4b, 3, 4, 1, 2]));
    const run = vi.fn(async (_exe: string, args: string[]) => args.includes("rev-parse") ? asset.revision : "https://github.com/Niko1221/Strata.git");
    const log = vi.fn(), archive = await prepareStrataDownloadCache(root, { run, log }, asset);
    expect(await fs.readFile(archive)).toEqual(await fs.readFile(source)); expect(log).toHaveBeenCalledWith(expect.stringContaining("原文件保留"));
    const noGit = vi.fn(); expect(await prepareStrataDownloadCache(root, { run: noGit, log }, asset)).toBe(archive); expect(noGit).not.toHaveBeenCalled();
  });
  it.each(["revision", "origin"])("does not adopt a partial from an untrusted %s", async kind => {
    const { root } = await fixture(), stage = path.join(root, ".install-other"); await fs.mkdir(stage); await fs.writeFile(path.join(stage, "engine.zip"), Buffer.from([0x50,0x4b,3,4]));
    const run = async (_exe: string, args: string[]) => args.includes("rev-parse") ? kind === "revision" ? "wrong" : asset.revision : "https://example.invalid/other.git";
    const archive = await prepareStrataDownloadCache(root, { run, log: vi.fn() }, asset); await expect(fs.stat(archive)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses cache-directory junctions instead of writing into an unrelated folder", async () => {
    const { root } = await fixture(), outside = path.join(root, "unrelated"); await fs.mkdir(outside); await fs.symlink(outside, path.join(root, "downloads"), process.platform === "win32" ? "junction" : "dir");
    await expect(prepareStrataDownloadCache(root, { run: vi.fn(), log: vi.fn() }, asset)).rejects.toThrow("未写入"); expect(await fs.readdir(outside)).toEqual([]);
  });
});

const curl = process.platform === "win32" ? "curl.exe" : "curl";
let curlAvailable = false; try { execFileSync(curl, ["--version"], { windowsHide: true, stdio: "ignore" }); curlAvailable = true; } catch { /* Explicit skipped native test on hosts without curl. */ }
describe.skipIf(!curlAvailable)("native curl against isolated loopback HTTP", () => {
  it("recovers an interrupted body by issuing a Range request with identical final bytes", async () => {
    const { destination } = await fixture(), body = Buffer.alloc(8192, 42), ranges: (string | undefined)[] = [];
    const server = http.createServer((req, res) => {
      ranges.push(req.headers.range);
      if (ranges.length === 1) { res.writeHead(200, { "Content-Length": body.length }); res.write(body.subarray(0, 2048), () => setTimeout(() => res.destroy(), 10)); }
      else { const offset = Number(req.headers.range?.match(/bytes=(\d+)-/u)?.[1]); res.writeHead(206, { "Content-Length": body.length - offset, "Content-Range": `bytes ${offset}-${body.length-1}/${body.length}` }); res.end(body.subarray(offset)); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/engine`;
      await downloadWithResume({ url, destination, totalBytes: body.length, run: (args, timeoutMs) => runLoggedProcess(curl, args, { timeoutMs }), wait });
      expect(ranges).toEqual([undefined, "bytes=2048-"]); expect(createHash("sha256").update(await fs.readFile(destination)).digest("hex")).toBe(createHash("sha256").update(body).digest("hex"));
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("keeps the local partial unchanged if the server ignores Range", async () => {
    const { destination } = await fixture(); await fs.writeFile(destination, "keep");
    const server = http.createServer((_req, res) => { res.writeHead(200, { "Content-Length": 9 }); res.end("123456789"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      await expect(downloadWithResume({ url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/engine`, destination, totalBytes: 9,
        run: (args, timeoutMs) => runLoggedProcess(curl, args, { timeoutMs }), wait })).rejects.toThrow("未接受续传");
      expect(await fs.readFile(destination, "utf8")).toBe("keep");
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("cancels an active native transfer and preserves bytes for the next user click", async () => {
    const { destination } = await fixture(), controller = new AbortController(); let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const server = http.createServer((_req, res) => { res.writeHead(200, { "Content-Length": 65536 }); res.write(Buffer.alloc(32768), () => started()); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const run = vi.fn((args: string[], timeoutMs: number) => runLoggedProcess(curl, args, { timeoutMs, signal: controller.signal }));
      const result = downloadWithResume({ url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/engine`, destination, totalBytes: 65536, signal: controller.signal, run, wait }).then(() => null, error => error as Error);
      await ready;
      try { await vi.waitFor(async () => expect((await fs.stat(destination)).size).toBeGreaterThan(0)); }
      finally { controller.abort(new Error("user cancel")); }
      expect((await result)?.message).toContain("user cancel");
      expect(run).toHaveBeenCalledOnce(); expect((await fs.stat(destination)).size).toBe(32768);
    } finally { controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
