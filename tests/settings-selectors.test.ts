import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  deriveAccelerationState,
  deriveCoreNodeState,
  deriveCustomNodeCardState,
  derivePromptRuntimeState,
  deriveSettingsDependencyActionState,
  deriveSettingsDirectories
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
      workflowDependencyInstalling: "",
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

  it("keeps unknown core nodes neutral until compatibility is checked", () => {
    expect(deriveCoreNodeState(null)).toMatchObject({
      known: false,
      h3Tone: "warning",
      promptTone: "warning"
    });
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
});
