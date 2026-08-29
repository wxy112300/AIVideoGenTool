import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  deriveAccelerationState,
  deriveCustomNodeCardState,
  derivePromptRuntimeState,
  deriveSettingsDependencyActionState,
  deriveSettingsDirectories,
  deriveH3VideoVaeState
} from "../src/renderer/pages/settings/selectors";
import type {
  CustomNodeStatus,
  EnvironmentScanResult,
  ModelScanProfile
} from "../src/types";

const isQwenVl = (modelId: string) => modelId === "qwen-vl";
const promptClassifiers = {
  isQwenVlPeftPromptModel: isQwenVl,
  isGemmaPromptModel: (modelId: string) => modelId === "gemma",
  isComfyMultimodalPromptModel: (modelId: string) => modelId === "multimodal"
};

function qwenProfile(overrides: Partial<ModelScanProfile> = {}): ModelScanProfile {
  return {
    id: "qwen-vl",
    name: "Qwen VL",
    category: "prompt",
    managedBy: "comfyui",
    badge: "test",
    description: "",
    vram: "",
    available: true,
    integrated: true,
    components: [],
    requiredCustomNodeIds: ["comfyui-qwenvl-lora"],
    customNodeCompatibility: "supported",
    runtimeVerified: true,
    runtimeReady: true,
    ...overrides
  };
}

function qwenNode(overrides: Partial<CustomNodeStatus> = {}): CustomNodeStatus {
  return {
    id: "comfyui-qwenvl-lora",
    name: "Qwen VL node",
    purpose: "",
    repositoryUrl: "",
    installed: true,
    loaded: true,
    runtimeVerified: true,
    loadError: "",
    directory: "",
    required: true,
    version: "",
    minimumVersion: "",
    recommendedVersion: "",
    latestVersion: "",
    updateAvailable: false,
    ...overrides
  };
}

describe("settings selectors", () => {
  it("keeps an offline Qwen runtime neutral and pending", () => {
    const settings = { ...createDefaultState().settings, promptModelId: "qwen-vl" };
    expect(derivePromptRuntimeState(settings, null, [], promptClassifiers)).toMatchObject({
      kind: "qwen-vl",
      tone: "warning",
      label: "waiting"
    });
  });

  it("distinguishes missing Qwen nodes from a runtime-ready profile", () => {
    const settings = { ...createDefaultState().settings, promptModelId: "qwen-vl" };
    const missingProfile = qwenProfile({
      missingCustomNodeIds: ["comfyui-qwenvl-lora"],
      customNodeCompatibility: "error"
    });
    const missingScan = {
      modelProfiles: [missingProfile],
      customNodes: [qwenNode({ installed: false, loaded: false })]
    } as EnvironmentScanResult;
    expect(derivePromptRuntimeState(settings, missingScan, [missingProfile], promptClassifiers)).toMatchObject({
      tone: "missing",
      label: "missing"
    });

    const readyProfile = qwenProfile();
    const readyScan = {
      modelProfiles: [readyProfile],
      customNodes: [qwenNode()]
    } as EnvironmentScanResult;
    expect(derivePromptRuntimeState(settings, readyScan, [readyProfile], promptClassifiers)).toMatchObject({
      tone: "available",
      label: "ready"
    });
  });

  it("does not bind native Comfy prompt models to llama-cpp dependencies", () => {
    const settings = { ...createDefaultState().settings, promptModelId: "native-qwen" };
    const nativeProfile = qwenProfile({
      id: "native-qwen",
      requiredCustomNodeIds: [],
      runtimeVerified: true,
      runtimeReady: true
    });
    const scan = {
      modelProfiles: [nativeProfile],
      customNodes: []
    } as EnvironmentScanResult;
    expect(derivePromptRuntimeState(
      settings,
      scan,
      [nativeProfile],
      promptClassifiers
    )).toMatchObject({
      kind: "native-comfy",
      tone: "available",
      label: "ready"
    });
  });

  it("derives all automatic media directories from the selected ComfyUI data root", () => {
    const settings = createDefaultState().settings;
    const scan = {
      comfyRoot: "D:\\ComfyUI",
      comfyInstallDirectory: "D:\\Comfy",
      comfySourceDirectory: "D:\\Comfy\\core",
      comfyInstallations: [],
      modelDirectory: "D:\\ComfyUI\\models",
      outputDirectory: "D:\\ComfyUI\\output"
    } as EnvironmentScanResult;
    expect(deriveSettingsDirectories(settings, scan)).toMatchObject({
      autoVideoOutputDirectory: "D:\\ComfyUI\\output\\Videos",
      autoImageOutputDirectory: "D:\\ComfyUI\\output\\Images",
      autoImageInputLibraryDirectory: "D:\\ComfyUI\\input\\LocalVideoStudio"
    });
  });

  it("blocks node actions while a batch is finalizing", () => {
    expect(deriveSettingsDependencyActionState({
      environmentScan: null,
      customNodeInstallPhase: "scanning",
      queueRunning: false,
      hasRunningQueueTask: false
    })).toMatchObject({
      customNodeInstallFinalizing: true,
      customNodeInstallGloballyBlocked: true
    });
  });

  it("keeps custom-node status precedence outside the template", () => {
    const state = deriveCustomNodeCardState({
      node: qwenNode({ compatibilityState: "error", updateAvailable: true }),
      queuedIndex: -1,
      active: false,
      finalizing: false,
      inFinalizingBatch: false,
      globallyBlocked: false
    });
    expect(state).toMatchObject({
      status: "compatibility-error",
      tone: "missing",
      installActionable: true
    });
  });

  it("makes a fully unregistered installed node package repairable", () => {
    const state = deriveCustomNodeCardState({
      node: qwenNode({
        installed: true,
        loaded: false,
        runtimeVerified: true,
        runtimeMissingNodeTypes: ["NodeA", "NodeB"],
        runtimeRepairable: true
      }),
      queuedIndex: -1,
      active: false,
      finalizing: false,
      inFinalizingBatch: false,
      globallyBlocked: false
    });
    expect(state).toMatchObject({
      status: "runtime-missing",
      installActionable: true,
      runtimeRepairable: true
    });
  });

  it("shows an uninstalled node as missing even when the running service is stale", () => {
    const state = deriveCustomNodeCardState({
      node: qwenNode({
        installed: false,
        loaded: false,
        runtimeVerified: true,
        runtimeMissingNodeTypes: ["NodeA", "NodeB"],
        runtimeRepairable: true
      }),
      queuedIndex: -1,
      active: false,
      finalizing: false,
      inFinalizingBatch: false,
      globallyBlocked: false
    });
    expect(state.status).toBe("missing");
    expect(state.primaryOperation).toBe("install");
  });

  it("derives the selected acceleration Python independently from markup", () => {
    const settings = {
      ...createDefaultState().settings,
      comfyPythonPath: "D:\\ComfyUI\\.venv\\Scripts\\python.exe"
    };
    const scan = {
      pythonRuntimes: [{
        path: settings.comfyPythonPath,
        version: "3.12",
        source: "comfy-venv",
        selected: true
      }]
    } as EnvironmentScanResult;
    expect(deriveAccelerationState(settings, scan)).toMatchObject({
      effectivePythonPath: settings.comfyPythonPath,
      pythonSelection: "comfy-venv",
      tone: "warning"
    });
  });

  it("limits the H3 video VAE selector to scanned files and falls back safely", () => {
    const profile = (fp16: boolean, int8Convrot: boolean): ModelScanProfile => ({
      id: "minimax_h3_fl2va",
      name: "MiniMax H3",
      category: "video",
      managedBy: "comfyui",
      badge: "test",
      description: "",
      vram: "",
      available: true,
      integrated: true,
      components: [
        {
          label: "FP16 VAE",
          found: fp16,
          alternativeGroup: "minimax-h3-video-vae",
          expected: "vae/minimax_h3_video_vae_fp16.safetensors",
          matches: fp16 ? ["vae/minimax_h3_video_vae_fp16.safetensors"] : [],
          installGuide: {
            sourceLabel: "test",
            downloadUrl: "https://example.test/fp16",
            targetSubdirectory: "vae",
            recommendedFilename: "minimax_h3_video_vae_fp16.safetensors"
          }
        },
        {
          label: "INT8 ConvRot VAE",
          found: int8Convrot,
          alternativeGroup: "minimax-h3-video-vae",
          expected: "vae/minimax_h3_video_vae_int8_convrot.safetensors",
          matches: int8Convrot ? ["vae/minimax_h3_video_vae_int8_convrot.safetensors"] : [],
          installGuide: {
            sourceLabel: "test",
            downloadUrl: "https://example.test/int8",
            targetSubdirectory: "vae",
            recommendedFilename: "minimax_h3_video_vae_int8_convrot.safetensors"
          }
        }
      ]
    });
    const scan = (modelProfiles: ModelScanProfile[]): EnvironmentScanResult => ({
      modelProfiles
    } as EnvironmentScanResult);

    const fp16Only = deriveH3VideoVaeState({
      ...createDefaultState().settings,
      h3VideoVaeMode: "int8-convrot"
    }, scan([profile(true, false)]));
    expect(fp16Only).toMatchObject({
      available: true,
      status: "fp16-only",
      fp16Available: true,
      int8ConvrotAvailable: false,
      selectedMode: "fp16"
    });
    const int8Only = deriveH3VideoVaeState({
      ...createDefaultState().settings,
      h3VideoVaeMode: "fp16"
    }, scan([profile(false, true)]));
    expect(int8Only).toMatchObject({
      available: true,
      status: "int8-only",
      selectedMode: "int8-convrot"
    });
    const both = deriveH3VideoVaeState({
      ...createDefaultState().settings,
      h3VideoVaeMode: "auto"
    }, scan([profile(true, true)]));
    expect(both).toMatchObject({
      available: true,
      status: "ready",
      selectedMode: "auto"
    });
    const missing = deriveH3VideoVaeState(
      createDefaultState().settings,
      scan([profile(false, false)])
    );
    expect(missing).toMatchObject({
      available: false,
      status: "missing"
    });
    const waiting = deriveH3VideoVaeState(createDefaultState().settings, null);
    expect(waiting).toMatchObject({
      available: false,
      status: "waiting"
    });
  });
});
