import { describe, expect, it, vi } from "vitest";
import { InstallationCancellation, installationSignal, hasActiveInstallations, withSoftwareMaintenance } from "../electron/services/installation-cancellation";
import { runLoggedProcess } from "../electron/services/environment";
import { downloadFileWithCurl } from "../electron/services/environment";
import { createDefaultSettings } from "../src/core/defaults";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("installation cancellation", () => {
  it("excludes software cache maintenance and installation without cancelling either operation", async () => {
    const registry = new InstallationCancellation();
    await withSoftwareMaintenance(async () => {
      expect(await registry.run("node", async () => ({ ok: true, message: "should not run" }))).toMatchObject({ ok: false });
    });
    let finish!: () => void;
    const pending = registry.run("node", async () => { await new Promise<void>(resolve => { finish = resolve; }); return { ok: true, message: "done" }; });
    await Promise.resolve(); expect(hasActiveInstallations()).toBe(true);
    await expect(withSoftwareMaintenance(async () => {})).rejects.toThrow("安装或清理");
    finish(); await pending; expect(hasActiveInstallations()).toBe(false);
    await expect(withSoftwareMaintenance(async () => "ready")).resolves.toBe("ready");
  });
  it("inherits owner shutdown cancellation and releases its slot only after installer recovery", async () => {
    const registry = new InstallationCancellation(), parent = new AbortController();
    let began!: () => void, recover!: () => void;
    const ready = new Promise<void>((done) => { began = done; });
    const recovered = new Promise<void>((done) => { recover = done; });
    const pending = registry.run("python-runtime:strata", async () => {
      const signal = installationSignal()!; began();
      await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }));
      await recovered; signal.throwIfAborted(); return { ok: true, message: "unreachable" };
    }, parent.signal);
    await ready; parent.abort(new Error("owner exit"));
    expect(await registry.run("python-runtime:strata", async () => ({ ok: true, message: "duplicate" }))).toMatchObject({ ok: false });
    recover(); expect(await pending).toMatchObject({ ok: false, cancelled: true });
    expect(await registry.run("python-runtime:strata", async () => ({ ok: true, message: "retry" }))).toMatchObject({ ok: true });
  });
  it("aborts an actual curl download against a local held response without retrying after cancellation", async () => {
    let ready!: () => void;
    const started = new Promise<void>((done) => { ready = done; });
    let requests = 0;
    const server = createServer((_request, response) => { requests++; response.writeHead(200, { "Content-Length": 100000 }); response.write(Buffer.alloc(32768)); ready(); });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-install-cancel-download-"));
    const registry = new InstallationCancellation();
    const progress = vi.fn();
    const endpoint = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/fixture`;
    const pending = registry.run("download", async () => {
      await downloadFileWithCurl(endpoint, path.join(folder, "fixture.partial"), { ...createDefaultSettings(), proxyEnabled: false }, { totalBytes: 100000, onProgress: progress });
      return { ok: true, message: "download complete" };
    });
    try {
      await started;
      await vi.waitFor(() => expect(progress.mock.calls.some(([bytes]) => bytes > 0 && bytes < 100000)).toBe(true));
      expect((await registry.cancel("download")).cancelled).toBe(true);
      expect(await pending).toMatchObject({ ok: false, cancelled: true });
      expect(requests).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await fs.rm(folder, { recursive: true, force: true });
    }
  }, 15000);
  it("targets one installation, waits for recovery, and rejects duplicate requests until cleanup", async () => {
    const registry = new InstallationCancellation();
    let started!: () => void, recover!: () => void;
    const ready = new Promise<void>((done) => { started = done; });
    const recovered = new Promise<void>((done) => { recover = done; });
    const operation = registry.run("python-runtime:strata", async () => {
      const signal = installationSignal()!;
      started();
      await new Promise<void>((done) => signal.addEventListener("abort", () => done(), { once: true }));
      await recovered;
      return { ok: false, message: "old install restored", log: "backup restored" };
    });
    await ready;
    expect((await registry.cancel("custom-node:other")).ok).toBe(false);
    let ended = false;
    const cancelled = registry.cancel("python-runtime:strata").then((result) => { ended = true; return result; });
    await Promise.resolve();
    expect(ended).toBe(false);
    const duplicate = vi.fn(async () => ({ ok: true, message: "duplicate" }));
    expect((await registry.run("python-runtime:strata", duplicate)).ok).toBe(false);
    expect(duplicate).not.toHaveBeenCalled();
    recover();
    expect(await operation).toMatchObject({ ok: false, cancelled: true, log: "backup restored" });
    expect(await cancelled).toMatchObject({ ok: true, cancelled: true });
    expect((await registry.run("python-runtime:strata", duplicate)).ok).toBe(true);
  });

  it("stops a real owned process tree before resolving cancellation, retaining output", async () => {
    const registry = new InstallationCancellation();
    let childPid = 0, ready!: () => void;
    const started = new Promise<void>((done) => { ready = done; });
    const script = "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000);";
    const operation = registry.run("custom-node:fixture", async () => {
      try {
        await runLoggedProcess(process.execPath, ["-e", script], { timeoutMs: 10000, onLog: (line) => { if (/^\d+$/.test(line)) { childPid = Number(line); ready(); } } });
        return { ok: true, message: "completed" };
      } catch (error) { return { ok: false, message: String(error), log: (error as Error & { stdout?: string }).stdout }; }
    });
    await started;
    try {
      expect((await registry.cancel("custom-node:fixture")).cancelled).toBe(true);
      expect(await operation).toMatchObject({ cancelled: true, log: String(childPid) });
      if (process.platform === "win32") expect(() => process.kill(childPid, 0)).toThrow();
    } finally { try { process.kill(childPid); } catch {} }
  }, 15000);

  it("does not launch another command after abort, or relabel a committed success", async () => {
    const registry = new InstallationCancellation();
    const operation = registry.run("fixture", async () => {
      installationSignal()!.addEventListener("abort", () => undefined);
      await new Promise<void>((done) => installationSignal()!.addEventListener("abort", () => done(), { once: true }));
      await expect(runLoggedProcess("nonexistent-install-command", [], {})).rejects.toThrow("用户取消安装");
      return { ok: true, message: "already committed" };
    });
    await Promise.resolve();
    expect((await registry.cancel("fixture")).ok).toBe(false);
    expect(await operation).toMatchObject({ ok: true, message: "already committed" });
  });
});
