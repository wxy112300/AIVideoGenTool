import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { STRATA_ENGINE_URL, STRATA_REVISION, STRATA_ENGINE_BYTES, STRATA_RELEASES, STRATA_LLAMA_REVISION } from "../src/core/catalog/dependencies/strata";
import { installStrataRuntime, strataManagedReceipt, verifyStrataEngineArchive, managedStrataDirectory, resolvedStrataDirectory, strataInstalledRelease, canUninstallStrata } from "../electron/services/strata-installation";
import { InstallationCancellation, installationSignal } from "../electron/services/installation-cancellation";

const fixtures: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const folder of fixtures.splice(0)) await fs.rm(folder, { recursive: true, force: true }); });
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-install-test-")); fixtures.push(folder);
  const root = path.join(folder, "runtime");
  const runtime = {
    managedDirectory: root, environment: () => ({}), findPython: vi.fn(async () => "python.exe"),
    download: vi.fn(async (_url: string, destination: string) => { await fs.writeFile(destination, "fixture"); }),
    verifyArchive: vi.fn(async () => undefined),
    run: vi.fn(async (_exe: string, args: string[], options: { cwd?: string }) => {
      if (args.includes("rev-parse")) return options.cwd?.endsWith("llama.cpp") ? STRATA_LLAMA_REVISION : STRATA_REVISION;
      if (args.includes("checkout") && options.cwd?.endsWith("llama.cpp")) {
        await fs.mkdir(path.join(options.cwd,"gguf-py/gguf"),{recursive:true});
        await fs.writeFile(path.join(options.cwd,"gguf-py/gguf/__init__.py"),"fixture");
      }
      if (args.includes("-EncodedCommand")) {
        const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
        expect(script).toContain("Expand-Archive -LiteralPath '");
        expect(script).toContain("$ErrorActionPreference='Stop'");
        await fs.mkdir(path.join(options.cwd!, "engine"), { recursive: true });
        for (const name of ["strata.exe", "strata-vision.exe", "BUILD.json"]) await fs.writeFile(path.join(options.cwd!, "engine", name), "fixture");
      }
      return "";
    })
  };
  return { folder, root, runtime };
}
describe("Strata software installer", () => {
  it("keeps a failed transfer in an asset-keyed cache for the next install and retains the previous software", async () => {
    const { root, runtime } = await fixture();
    expect((await installStrataRuntime(createDefaultSettings(), runtime)).ok).toBe(true);
    await fs.writeFile(path.join(root, "keep.txt"), "old software");
    const archive = runtime.download.mock.calls[0][1];
    runtime.download.mockImplementation(async (_url, destination) => { expect(destination).toBe(archive); await fs.writeFile(destination, "partial transfer"); throw new Error("curl 56: receiving failed"); });
    const failed = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(failed).toMatchObject({ ok: false, message: expect.stringContaining("curl 56") });
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("old software");
    expect(await fs.readFile(archive, "utf8")).toBe("partial transfer");
    runtime.download.mockImplementation(async (_url, destination) => { expect(destination).toBe(archive); expect(await fs.readFile(destination, "utf8")).toBe("partial transfer"); });
    expect((await installStrataRuntime(createDefaultSettings(), runtime)).ok).toBe(true);
  });
  it("keeps a recognized older managed install usable until the recommended update completes", async () => {
    const { folder } = await fixture(); vi.stubEnv("LOCALAPPDATA", folder);
    const old = STRATA_RELEASES[1], current = STRATA_RELEASES[0];
    const oldRoot = managedStrataDirectory(old), newRoot = managedStrataDirectory();
    const write = async (root: string, release: typeof STRATA_RELEASES[number], complete: boolean) => {
      await fs.mkdir(path.join(root, ".venv/Scripts"), { recursive: true });
      await fs.writeFile(path.join(root, ".venv/Scripts/python.exe"), "fixture");
      await fs.writeFile(path.join(root, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", ...release, ...(complete ? { installedAt: "fixture" } : {}) }));
    };
    await write(oldRoot, old, true);
    expect(resolvedStrataDirectory(createDefaultSettings())).toBe(oldRoot);
    expect(strataInstalledRelease(oldRoot)?.version).toBe("0.1.41");
    expect(await canUninstallStrata(createDefaultSettings())).toBe(true);
    await write(newRoot, current, false);
    expect(resolvedStrataDirectory(createDefaultSettings())).toBe(oldRoot);
    await write(newRoot, current, true);
    expect(resolvedStrataDirectory(createDefaultSettings())).toBe(newRoot);
    expect(await strataManagedReceipt(oldRoot)).toBe(true);
    expect(resolvedStrataDirectory({ strataInstallDirectory: oldRoot })).toBe(oldRoot);
  });
  it("retries a transient Windows backup lock without losing the managed installation", async () => {
    const { root, runtime } = await fixture();
    const installed = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(installed.ok, installed.log).toBe(true);
    await fs.writeFile(path.join(root, "keep.txt"), "old runtime");
    const rename = fs.rename.bind(fs);
    let blocked = false;
    const spy = vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (source === root && String(target).includes(".backup-") && !blocked) {
        blocked = true;
        throw Object.assign(new Error("transient Windows lock"), { code: "EPERM" });
      }
      return rename(source, target);
    });
    const result = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(result.ok, result.log).toBe(true);
    const backup = spy.mock.calls.find(([source, target]) => source === root && String(target).includes(".backup-"))![1];
    expect(await fs.readFile(path.join(String(backup), "keep.txt"), "utf8")).toBe("old runtime");
    expect(await strataManagedReceipt(root)).toBe(true);
  });
  it("does not invent a backup or attempt restoration when backing up never succeeded", async () => {
    const { root, runtime } = await fixture();
    const installed = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(installed.ok, installed.log).toBe(true);
    await fs.writeFile(path.join(root, "keep.txt"), "old runtime");
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (source === root && String(target).includes(".backup-")) {
        throw Object.assign(new Error("backup failed"), { code: "EIO" });
      }
      return rename(source, target);
    });
    const result = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(result).toMatchObject({ ok: false, message: "backup failed" });
    expect(result.log).not.toContain("恢复失败");
    expect(spy.mock.calls.some(([source]) => String(source).includes(".backup-"))).toBe(false);
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("old runtime");
    expect(await strataManagedReceipt(root)).toBe(true);
  });
  it("cancels pip and restores the previous installation before freeing the installation slot", async () => {
    const { root, runtime } = await fixture();
    const installed = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(installed.ok, installed.log).toBe(true);
    await fs.writeFile(path.join(root, "keep.txt"), "old runtime");
    const original = runtime.run.getMockImplementation()!;
    let started!: () => void;
    const ready = new Promise<void>((done) => { started = done; });
    runtime.run.mockImplementation(async (exe, args, options) => {
      if (args.includes("pip")) {
        const signal = installationSignal()!; started();
        await new Promise<void>((_done, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
      return original(exe, args, options);
    });
    const registry = new InstallationCancellation();
    const pending = registry.run("python-runtime:strata", () => installStrataRuntime(createDefaultSettings(), runtime));
    await ready;
    expect((await registry.cancel("python-runtime:strata")).cancelled).toBe(true);
    expect(await pending).toMatchObject({ ok: false, cancelled: true });
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("old runtime");
    expect(await strataManagedReceipt(root)).toBe(true);
  });
  it("releases the install lock after an invalid proxy/environment and permits retry", async () => {
    const { runtime } = await fixture();
    const invalid = await installStrataRuntime(createDefaultSettings(), { ...runtime, environment: () => { throw new Error("invalid proxy"); } });
    expect(invalid).toMatchObject({ ok: false, message: "invalid proxy" });
    expect((await installStrataRuntime(createDefaultSettings(), runtime)).ok).toBe(true);
  });
  it("installs pinned software only, into its own venv, and retains old installation on reinstall", async () => {
    const { root, runtime } = await fixture();
    const first = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(first.ok, first.log).toBe(true);
    expect(await strataManagedReceipt(root)).toBe(true);
    expect(runtime.download).toHaveBeenCalledWith(STRATA_ENGINE_URL, expect.any(String), expect.any(Object), expect.any(Function), expect.any(Function));
    const commands = runtime.run.mock.calls.map(([exe, args]) => `${exe} ${args.join(" ")}`).join("\n");
    expect(commands).toContain(`fetch --depth=1 origin ${STRATA_REVISION}`);
    expect(commands).toContain(".venv");
    expect(commands).toContain("nvidia-cublas==13.0.2.14");
    expect(commands).toContain(`fetch --depth=1 --filter=blob:none origin ${STRATA_LLAMA_REVISION}`);
    expect(commands).toContain("sparse-checkout set gguf-py");
    expect(commands).not.toMatch(/setup\.py|--serve|START-HERE|huggingface|8080/);
    const second = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(second.ok, second.log).toBe(true);
    expect(second.log).toContain("旧安装保留");
  });
  it("reports ordered installation stages and real download counters separately from logs", async () => {
    const { runtime } = await fixture();
    const events: import("../src/types").StrataInstallProgress[] = [];
    const originalDownload = runtime.download.getMockImplementation()!;
    const download = async (url: string, destination: string, _settings: import("../src/types").Settings, report?: (bytes: number) => void) => {
      report?.(Math.floor(STRATA_ENGINE_BYTES / 2));
      await originalDownload(url, destination);
      report?.(STRATA_ENGINE_BYTES);
    };
    const result = await installStrataRuntime(createDefaultSettings(), { ...runtime, download }, (_message, progress) => { if (progress) events.push(progress); });
    expect(result.ok).toBe(true);
    expect(events.map(event => event.stage)).toEqual(["prepare", "source", "download", "download", "download", "verify", "extract", "python", "packages", "check", "complete"]);
    expect(events.filter(event => event.stage === "download").map(event => event.percent)).toEqual([0, 49, 100]);
    expect(events.find(event => event.stage === "packages")?.percent).toBeUndefined();
  });
  it("rejects custom directories and unowned targets without touching files", async () => {
    const { root, runtime } = await fixture();
    expect((await installStrataRuntime({ ...createDefaultSettings(), strataInstallDirectory: "C:\\user-source" }, runtime)).ok).toBe(false);
    await fs.mkdir(root); await fs.writeFile(path.join(root, "user.txt"), "keep");
    expect((await installStrataRuntime(createDefaultSettings(), runtime)).ok).toBe(false);
    expect(await fs.readFile(path.join(root, "user.txt"), "utf8")).toBe("keep");
    expect(runtime.run).not.toHaveBeenCalled();
  });
  it("rejects a corrupt archive before running any downloaded code", async () => {
    const { root, runtime } = await fixture();
    runtime.verifyArchive = vi.fn(verifyStrataEngineArchive);
    const result = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(result.ok).toBe(false); expect(result.message).toContain("SHA-256");
    expect(result.log).toContain("未完成下载保留在");
    expect(await strataManagedReceipt(root)).toBe(false);
    expect(runtime.run.mock.calls.some(([, args]) => args.includes("pip"))).toBe(false);
    const cache = path.dirname(runtime.download.mock.calls[0][1]);
    expect((await fs.readdir(cache)).some(name => name.startsWith("engine.zip.invalid-"))).toBe(true);
    await expect(fs.stat(runtime.download.mock.calls[0][1])).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("restores a prior managed installation after isolated pip fails, retaining diagnostic logs", async () => {
    const { root, runtime } = await fixture();
    expect((await installStrataRuntime(createDefaultSettings(), runtime)).ok).toBe(true);
    await fs.writeFile(path.join(root, "keep.txt"), "old runtime");
    const original = runtime.run.getMockImplementation()!;
    runtime.run.mockImplementation(async (exe, args, options) => { if (args.includes("pip")) throw new Error("network unavailable"); return original(exe, args, options); });
    const result = await installStrataRuntime(createDefaultSettings(), runtime);
    expect(result.ok).toBe(false); expect(result.log).toContain("network unavailable");
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("old runtime");
    expect(await strataManagedReceipt(root)).toBe(true);
  });
});
