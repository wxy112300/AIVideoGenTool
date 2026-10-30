import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import {
  AETHERSCALE_CARRIER_RUNTIME_FILES,
  AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST,
  AETHERSCALE_RUNTIME_BUNDLE_ID
} from "../src/core/catalog/index.js";
import {
  aetherScaleCarrierManifestPath,
  aetherScaleCarrierRuntimeDirectory,
  aetherScaleCarrierWorkerStatePath,
  createAetherScaleGpuPreferenceRecord,
  emptyAetherScaleRuntimeStatus,
  findUnexpectedAetherScaleStagedFiles,
  installAetherScaleRuntime,
  isAetherScaleRuntimeMutationAllowed,
  scanAetherScaleRuntime,
  shouldRestoreAetherScaleGpuPreference,
  terminateAetherScaleWorker,
  uninstallAetherScaleRuntime,
  validateAetherScaleArchiveEntries,
  type AetherScaleRuntimeInstallerDependencies
} from "../electron/services/aetherscale-runtime.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

const settings = {
  ...createDefaultState().settings,
  comfyUrl: "http://127.0.0.1:8188"
};

function fixtureDependencies(
  overrides: Partial<AetherScaleRuntimeInstallerDependencies> = {}
): AetherScaleRuntimeInstallerDependencies {
  return {
    platform: "win32",
    findComfyPython: async () => "C:\\ComfyUI\\python_embeded\\python.exe",
    findExecutable: async () => "fixture-curl.exe",
    downloadEnvironment: () => ({}),
    runLoggedProcess: async () => {
      throw new Error("fixture should use the injected downloader");
    },
    renameWithRetry: (source, target) => fs.rename(source, target),
    retryableRenameError: () => true,
    downloadFile: async (_url, destination) => {
      await fs.writeFile(destination, "truncated carrier archive", "utf8");
    },
    ...overrides
  };
}

describe("AetherScale carrier runtime", () => {
  it.each([
    ["en-US", "Remote ComfyUI supports connections only. The app will not install local AetherScale carrier runtime.", "Remote ComfyUI supports connections only. The app will not uninstall local AetherScale carrier runtime.", "The AetherScale carrier worker termination target is not the current ComfyUI data directory. No action taken.", "AetherScale carrier archive contains unsafe paths. Extraction refused."],
    ["zh-TW", "遠端 ComfyUI 僅支援連線，應用程式不會安裝本機 AetherScale carrier runtime。", "遠端 ComfyUI 僅支援連線，應用程式不會解除安裝本機 AetherScale carrier runtime。", "AetherScale carrier worker 終止目標不是目前的 ComfyUI 資料目錄，未執行操作。", "AetherScale carrier 封存檔包含不安全路徑，已拒絕解壓縮。"]
  ] as const)("localizes %s guards before any download or process operation", async (uiLocale, install, uninstall, worker, unsafe) => {
    let ran = false;
    const deps = fixtureDependencies({
      downloadFile: async () => { ran = true; },
      runLoggedProcess: async () => { ran = true; return ""; }
    });
    const remote = { ...settings, uiLocale, comfyUrl: "https://comfy.example.test" };
    expect(await installAetherScaleRuntime(remote, "", "", deps)).toMatchObject({ ok: false, message: install });
    expect(await uninstallAetherScaleRuntime(remote, "", "", deps)).toMatchObject({ ok: false, message: uninstall });
    const t = createNativeTranslator(uiLocale).t;
    expect(await terminateAetherScaleWorker("", "", undefined, t)).toMatchObject({ ok: false, verified: false, message: worker });
    expect(() => validateAetherScaleArchiveEntries(["../outside.dll"], t)).toThrow(unsafe);
    expect(ran).toBe(false);
  });

  it.each([
    ["en-US", "The AetherScale carrier download appears truncated:", "carrier_manifest.json is missing or does not match the pinned bundle"],
    ["zh-TW", "AetherScale carrier 下載疑似截斷：", "carrier_manifest.json 缺少或與目前固定的 bundle 不符"]
  ] as const)("preserves user files with %s installation and scan diagnostics", async (uiLocale, truncated, manifest) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aether-runtime-language-"));
    temporaryDirectories.push(root);
    const node = path.join(root, "custom_nodes", "ComfyUI-AetherScale");
    const runtime = aetherScaleCarrierRuntimeDirectory(root, node);
    await fs.mkdir(runtime, { recursive: true });
    const userFile = path.join(runtime, "使用者設定.json");
    await fs.writeFile(userFile, "user settings");
    let ran = false;
    const result = await installAetherScaleRuntime({ ...settings, uiLocale }, root, node,
      fixtureDependencies({ runLoggedProcess: async () => { ran = true; return ""; } }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain(truncated);
    expect(result.log).toContain(result.message);
    expect(await fs.readFile(userFile, "utf8")).toBe("user settings");
    expect((await fs.readdir(node)).some(name => name.startsWith(".aetherscale-carrier-staging-"))).toBe(false);
    const original = await scanAetherScaleRuntime(root, node, "fixture-python.exe", "win32");
    const localized = await scanAetherScaleRuntime(root, node, "fixture-python.exe", "win32", createNativeTranslator(uiLocale).t);
    expect(localized).toEqual({ ...original, error: localized.error });
    expect(localized.error).toContain(manifest);
    expect(localized.carrierReady).toBe(false);
    expect(ran).toBe(false);
  });

  it("records the six audited members and the pinned bundle", () => {
    expect(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST).toHaveLength(6);
    expect(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.map((file) => file.filename))
      .toEqual([...AETHERSCALE_CARRIER_RUNTIME_FILES]);
    expect(AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.every((file) =>
      file.archiveMember.startsWith("bin/runtime/") &&
      file.bytes > 0 &&
      /^[a-f0-9]{64}$/u.test(file.sha256)
    )).toBe(true);
    const reshade = AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.find((file) => file.filename === "ReShade.ini");
    const carrierBinary = AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.find((file) => file.filename === "nvngx.dll");
    expect(reshade && isAetherScaleRuntimeMutationAllowed(reshade, true)).toBe(true);
    expect(carrierBinary && isAetherScaleRuntimeMutationAllowed(carrierBinary, true)).toBe(false);
    expect(reshade && isAetherScaleRuntimeMutationAllowed(reshade, false)).toBe(false);
    expect(AETHERSCALE_RUNTIME_BUNDLE_ID).toBe("aetherscale-carrier-v1-node-0.5.5");
  });

  it("requires the exact audited archive members and rejects traversal", () => {
    const members = AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST.map((file) => file.archiveMember);
    expect(validateAetherScaleArchiveEntries(members)).toEqual(members);
    expect(() => validateAetherScaleArchiveEntries([
      ...members.slice(0, -1),
      "../escape.dll"
    ])).toThrow("不安全路径");
    expect(() => validateAetherScaleArchiveEntries(members.slice(0, -1)))
      .toThrow("固定白名单成员");
  });

  it("accepts the six extracted carrier files at the staged runtime root", () => {
    expect(findUnexpectedAetherScaleStagedFiles(AETHERSCALE_CARRIER_RUNTIME_FILES)).toEqual([]);
    expect(findUnexpectedAetherScaleStagedFiles([
      ...AETHERSCALE_CARRIER_RUNTIME_FILES,
      "runtime/dxgi.dll"
    ])).toEqual(["runtime/dxgi.dll"]);
  });

  it("reports a manual or incomplete runtime without claiming readiness", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-aetherscale-runtime-"));
    temporaryDirectories.push(root);
    const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-AetherScale");
    const runtimeDirectory = aetherScaleCarrierRuntimeDirectory(root, nodeDirectory);
    await fs.mkdir(runtimeDirectory, { recursive: true });
    await fs.writeFile(path.join(runtimeDirectory, "nvngx.dll"), "not a PE", "utf8");
    const status = await scanAetherScaleRuntime(root, nodeDirectory, "fixture-python.exe", "win32");
    expect(status).toMatchObject({
      state: "invalid",
      provider: "aetherscale-carrier",
      bundleId: AETHERSCALE_RUNTIME_BUNDLE_ID,
      source: "manual",
      carrierReady: false,
      runtimeValidated: false,
      pythonPath: "fixture-python.exe"
    });
    expect(status.missingFiles).toEqual(expect.arrayContaining([
      "dxgi.dll",
      "nvngx_dlss.dll",
      "nvngx_dlssnr.dll",
      "renodx-dlss5.addon64",
      "ReShade.ini"
    ]));
    expect(status.manifestPath).toBe(aetherScaleCarrierManifestPath(root, nodeDirectory));
  });

  it("fails before promotion when the pinned archive is truncated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-aetherscale-runtime-"));
    temporaryDirectories.push(root);
    const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-AetherScale");
    await fs.mkdir(nodeDirectory, { recursive: true });
    const result = await installAetherScaleRuntime(
      settings,
      root,
      nodeDirectory,
      fixtureDependencies()
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("截断");
    expect(await fs.stat(aetherScaleCarrierRuntimeDirectory(root, nodeDirectory))
      .catch(() => null)).toBeNull();
  });

  it("refuses updates and termination when worker ownership state is unverifiable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-aetherscale-runtime-"));
    temporaryDirectories.push(root);
    const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-AetherScale");
    const statePath = aetherScaleCarrierWorkerStatePath(root, nodeDirectory);
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({
      pid: 424242,
      parent_pid: 424241,
      worker: path.join(root, "unexpected", "nvngx.dll"),
      runtime: aetherScaleCarrierRuntimeDirectory(root, nodeDirectory),
      started_at: Date.now() / 1000
    }));
    let downloaded = false;
    const deps = fixtureDependencies({
      downloadFile: async () => {
        downloaded = true;
      }
    });
    const result = await installAetherScaleRuntime(settings, root, nodeDirectory, deps);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("worker");
    expect(downloaded).toBe(false);
    expect(await terminateAetherScaleWorker(root, nodeDirectory)).toMatchObject({
      ok: false,
      verified: false
    });
    expect(await fs.stat(statePath)).toBeTruthy();
  });

  it("keeps cancellation and remote endpoint operations side-effect free", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-aetherscale-runtime-"));
    temporaryDirectories.push(root);
    const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-AetherScale");
    await fs.mkdir(nodeDirectory, { recursive: true });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await installAetherScaleRuntime(
      settings,
      root,
      nodeDirectory,
      fixtureDependencies(),
      undefined,
      controller.signal
    );
    expect(cancelled.ok).toBe(false);
    expect(cancelled.message).toContain("取消");
    const remote = await installAetherScaleRuntime(
      { ...settings, comfyUrl: "https://comfy.example.test" },
      root,
      nodeDirectory,
      fixtureDependencies()
    );
    expect(remote.ok).toBe(false);
    expect(remote.message).toContain("远程 ComfyUI");
  });

  it("restores only a registry value still owned by the app", () => {
    const record = createAetherScaleGpuPreferenceRecord(
      "C:\\ComfyUI\\custom_nodes\\ComfyUI-AetherScale\\runtime\\carrier\\runtime\\nvngx.dll",
      "GpuPreference=1;"
    );
    expect(record.workerPath).toMatch(/nvngx\.dll$/iu);
    expect(shouldRestoreAetherScaleGpuPreference(record, "GpuPreference=2;")).toBe(true);
    expect(shouldRestoreAetherScaleGpuPreference(record, "GpuPreference=1;")).toBe(false);
    expect(emptyAetherScaleRuntimeStatus("", "remote", "remote").state).toBe("remote");
  });
});
