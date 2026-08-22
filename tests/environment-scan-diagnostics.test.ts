import { describe, expect, it } from "vitest";
import { buildEnvironmentScanDiagnostics } from "../electron/services/environment-scan-diagnostics.js";
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
      cudaVersion: "12.9",
      gpuName: "NVIDIA GeForce RTX 4090",
      gpuArchitecture: "8.9",
      sageAttentionVersion: "",
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
    workflowDependencies: [{
      id: "minimax_h3_i2v",
      name: "MiniMax H3 workflow",
      purpose: "",
      installed: false,
      path: "C:\\ComfyUI\\workflows\\h3.json",
      sourceUrl: "https://example.test/workflow"
    }],
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
      cudaVersion: "12.9",
      sageAttentionVersion: "not-installed",
      tritonVersion: "not-installed",
      comfyKitchenVersion: "not-installed",
      llamaCppPythonVersion: "0.3.46",
      llamaPythonVersion: "3.12.10",
      llamaTorchVersion: "2.8.0+cu129",
      llamaCudaVersion: "12.9",
      llamaGpuOffload: false,
      llamaCppPythonReady: false,
      gpuDevices: ["0:NVIDIA GeForce RTX 4090; driver=580.00; vram=24GiB"]
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
      expect.stringContaining("workflow:minimax_h3_i2v")
    ]));
    expect(JSON.stringify(diagnostics)).not.toContain("C:\\\\Users\\\\Example");
    expect(JSON.stringify(diagnostics)).not.toContain("C:\\\\ComfyUI\\\\models");
  });
});
