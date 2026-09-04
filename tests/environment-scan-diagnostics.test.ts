import { describe, expect, it } from "vitest";
import { buildEnvironmentScanDiagnostics } from "../src/infrastructure/environment-scan-diagnostics.js";
import type { EnvironmentScanResult } from "../src/types.js";

function scanFixture(): EnvironmentScanResult {
  return {
    scannedAt: "2026-08-22T12:00:00.000Z",
    userHome: "C:\\Users\\Example",
    comfyRoot: "C:\\ComfyUI",
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: "C:\\ComfyUI",
    comfySourceDirectory: "C:\\ComfyUI",
    comfyInstallType: "desktop",
    comfyInstallations: [],
    pythonRuntimes: [{
      path: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      version: "3.12.10",
      source: "comfy-venv",
      selected: true
    }],
    gpus: [{
      index: 0,
      name: "NVIDIA GeForce RTX 4090",
      driverVersion: "580.00",
      vramTotalBytes: 24 * 1024 ** 3
    }],
    modelDirectory: "C:\\ComfyUI\\models",
    outputDirectory: "C:\\ComfyUI\\output",
    llamaServer: { found: false, path: "", directory: "", source: "" },
    llamaCppPython: {
      packageName: "llama-cpp-python",
      pythonPath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      pythonVersion: "3.12.10",
      packageVersion: "0.3.46",
      torchVersion: "2.8.0+cu129",
      cudaVersion: "12.9",
      installed: true,
      importable: true,
      gpuOffload: false,
      ready: false,
      detail: "CUDA backend was not loaded",
      error: ""
    },
    comfyCompatibility: {
      version: "0.33.3",
      revision: "abc123",
      h3MinimumVersion: "0.31.0",
      h3MinimumRevision: "",
      h3RecommendedVersion: "0.33.1",
      h3CoreSupported: false,
      coreNodes: [{ id: "MiniMaxH3Loader", label: "H3 Loader", available: false }],
      promptCoreSupported: true,
      promptCoreNodes: [],
      checkedFrom: "api",
      updateMode: "desktop",
      updateHint: "",
      compatibilityState: "warning",
      compatibilityNotice: "Core commit is unknown"
    },
    attentionAcceleration: {
      pythonPath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      pythonVersion: "3.12.10",
      torchVersion: "2.8.0+cu129",
      torchvisionVersion: "0.23.0+cu129",
      torchaudioVersion: "2.8.0+cu129",
      cudaVersion: "12.9",
      gpuName: "NVIDIA GeForce RTX 4090",
      gpuArchitecture: "8.9",
      sageAttentionVersion: "",
      sageNativeReady: false,
      sageNativeError: "DLL load failed while importing _fused",
      tritonVersion: "",
      kjNodesInstalled: true,
      kjNodesCompatible: false,
      recommendedSageVersion: "",
      recommendedWheel: "",
      supported: true,
      ready: false,
      detail: "SageAttention is unavailable"
    },
    items: [
      { id: "node", label: "Node.js", ok: true, detail: "v22.0.0", status: "available" },
      { id: "git", label: "Git", ok: false, detail: "git.exe not found", status: "missing" }
    ],
    modelProfiles: [{
      id: "minimax-h3",
      name: "MiniMax H3",
      category: "video",
      badge: "H3",
      description: "",
      vram: "24 GB",
      available: false,
      integrated: true,
      missingCustomNodeIds: ["kjnodes"],
      missingCustomNodeNames: ["ComfyUI-KJNodes"],
      components: [{
        label: "H3 diffusion model",
        found: false,
        expected: "model.safetensors",
        matches: [],
        installGuide: {
          sourceLabel: "Model source",
          downloadUrl: "https://example.test/model",
          targetSubdirectory: "diffusion_models",
          recommendedFilename: "model.safetensors"
        }
      }]
    }],
    customNodes: [{
      id: "kjnodes",
      name: "ComfyUI-KJNodes",
      purpose: "",
      repositoryUrl: "https://example.test/kjnodes",
      installed: true,
      loaded: false,
      runtimeVerified: true,
      runtimeMissingNodeTypes: ["VRAM_Debug", "PathchSageAttentionKJ"],
      runtimeRepairable: true,
      loadError: "No baseline nodes registered",
      directory: "C:\\ComfyUI\\custom_nodes\\comfyui-kjnodes",
      required: false,
      version: "1.5.0",
      minimumVersion: "",
      recommendedVersion: "",
      latestVersion: "1.5.0",
      updateAvailable: false,
      compatibilityState: "error"
    }],
    dlss5Runtime: {
      state: "invalid",
      bundleId: "vapourkit-nightly-2026-08-31",
      nodeRevision: "310524aa283602832cbdd827ce4e35565c859a7e",
      runtimeDirectory: "C:\\ComfyUI\\custom_nodes\\ComfyUI-DLSS5\\runtime",
      configPath: "C:\\ComfyUI\\custom_nodes\\ComfyUI-DLSS5\\runtime\\config.json",
      manifestPath: "C:\\ComfyUI\\custom_nodes\\ComfyUI-DLSS5\\runtime\\install-manifest.json",
      source: "app-managed",
      installed: true,
      configValid: false,
      srReady: false,
      nrReady: false,
      runtimeValidated: false,
      pythonPath: "",
      srPluginPath: "",
      srRuntimePath: "",
      missingFiles: ["config.json"],
      unexpectedFiles: ["manual-note.txt"],
      error: "runtime/config.json 缺失或不是有效 JSON"
    },
    depthAnything: {
      repository: "depth-anything/Depth-Anything-V2-Small-hf",
      revision: "5426e4f0f36572d16453bbda7a8389317b1bef99",
      cacheDirectory: "C:\\ComfyUI\\models\\depthanything\\Depth-Anything-V2-Small-hf",
      source: "",
      modelFiles: [],
      foundFiles: [],
      missingFiles: ["model.safetensors"],
      available: false,
      pythonPath: "",
      runtimeVerified: false,
      error: ""
    },
    issues: [{
      id: "comfy-database",
      label: "ComfyUI database",
      detail: "Database migration failed",
      severity: "error",
      repairable: true,
      repairLabel: "Repair"
    }]
  };
}

describe("environment scan diagnostics", () => {
  it("records environment versions and actionable scan findings", () => {
    const diagnostics = buildEnvironmentScanDiagnostics(scanFixture());

    expect(diagnostics.inventory).toMatchObject({
      comfyInstallType: "desktop",
      comfyCoreVersion: "0.33.3",
      comfyCoreRevision: "abc123",
      comfyCheckedFrom: "api",
      selectedPythonVersion: "3.12.10",
      torchVersion: "2.8.0+cu129",
      torchvisionVersion: "0.23.0+cu129",
      torchaudioVersion: "2.8.0+cu129",
      cudaVersion: "12.9",
      sageAttentionVersion: "not-installed",
      sageNativeReady: false,
      sageNativeError: "DLL load failed while importing _fused",
      tritonVersion: "not-installed",
      comfyKitchenVersion: "not-installed",
      llamaCppPythonVersion: "0.3.46",
      llamaPythonVersion: "3.12.10",
      llamaTorchVersion: "2.8.0+cu129",
      llamaCudaVersion: "12.9",
      llamaGpuOffload: false,
      llamaCppPythonReady: false,
      gpuDevices: ["0:NVIDIA GeForce RTX 4090; driver=580.00; vram=24GiB"],
      dlss5RuntimeState: "invalid",
      dlss5RuntimeSource: "app-managed",
      dlss5SrReady: false,
      dlss5NrReady: false,
      dlss5RuntimeValidated: false,
      dlss5RuntimeMissingFiles: ["config.json"],
      dlss5RuntimeUnexpectedFiles: ["manual-note.txt"],
      depthAnythingSource: "",
      depthAnythingAvailable: false,
      depthAnythingRevision: "5426e4f0f36572d16453bbda7a8389317b1bef99",
      depthAnythingRuntimeVerified: false,
      depthAnythingMissingFiles: ["model.safetensors"]
    });
    expect(diagnostics.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("system:git"),
      expect.stringContaining("comfy-core-node:MiniMaxH3Loader"),
      expect.stringContaining("custom-node:kjnodes"),
      expect.stringContaining("issue:comfy-database")
    ]));
    expect(diagnostics.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("comfy-core: Core commit is unknown"),
      expect.stringContaining("llama-cpp-python: CUDA backend was not loaded"),
      expect.stringContaining("attention-runtime: SageAttention is unavailable"),
      expect.stringContaining("model:minimax-h3"),
      expect.stringContaining("dlss5-runtime: runtime/config.json"),
      expect.stringContaining("depth-anything: guide model not ready")
    ]));
    expect(JSON.stringify(diagnostics)).not.toContain("C:\\\\Users\\\\Example");
    expect(JSON.stringify(diagnostics)).not.toContain("C:\\\\ComfyUI\\\\models");
  });
});
