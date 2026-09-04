import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
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
