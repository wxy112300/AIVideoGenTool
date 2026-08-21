import type {
  CustomNodeStatus,
  EnvironmentItem,
  EnvironmentScanResult,
  LlamaCppPythonStatus,
  ModelScanProfile,
  Settings
} from "../../../types";
import {
  customNodeStatusTone,
  environmentItemStatusTone,
  modelProfileEvidence,
  modelProfileStatusTone,
  type SettingsStatusTone
} from "../../shared/status";
import type { CustomNodeInstallPhase } from "./node-install-queue";

export interface SettingsEnvironmentItemState extends EnvironmentItem {
  tone: SettingsStatusTone;
  liveState?: "running" | "unavailable";
}

export function deriveEnvironmentOverviewItems(
  environmentScan: EnvironmentScanResult | null,
  comfyConnected?: boolean
): SettingsEnvironmentItemState[] {
  return (environmentScan?.items ?? []).map((item) => {
    const hasLiveStatus = item.id === "comfyui-api" && comfyConnected != null;
    const projectedItem: EnvironmentItem = hasLiveStatus
      ? {
          ...item,
          ok: comfyConnected,
          status: comfyConnected ? "available" : "warning",
          detail: `${environmentScan?.comfyUrl}/system_stats`
        }
      : item;
    return {
      ...projectedItem,
      tone: environmentItemStatusTone(projectedItem),
      ...(hasLiveStatus ? { liveState: comfyConnected ? "running" : "unavailable" } : {})
    };
  });
}

export type PromptRuntimeLabel = "waiting" | "ready" | "cpu" | "unknown" | "missing";

export interface PromptRuntimeState {
  kind: "llama-cpp" | "qwen-vl" | "native-comfy";
  tone: SettingsStatusTone;
  label: PromptRuntimeLabel;
  llamaCppPython?: LlamaCppPythonStatus;
  promptWriterNode?: CustomNodeStatus;
  qwenVlProfile?: ModelScanProfile;
  qwenVlNode?: CustomNodeStatus;
}

export function derivePromptRuntimeState(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null,
  promptProfiles: readonly ModelScanProfile[],
  classifiers: {
    isQwenVlPeftPromptModel(modelId: string): boolean;
    isGemmaPromptModel(modelId: string): boolean;
    isComfyMultimodalPromptModel(modelId: string): boolean;
  }
): PromptRuntimeState {
  const selectedProfile = promptProfiles.find((profile) => profile.id === settings.promptModelId);
  const usesQwenVl = classifiers.isQwenVlPeftPromptModel(settings.promptModelId);
  const usesLlamaCpp = classifiers.isGemmaPromptModel(settings.promptModelId) ||
    classifiers.isComfyMultimodalPromptModel(settings.promptModelId);
  if (!usesQwenVl && !usesLlamaCpp) {
    const tone = selectedProfile ? modelProfileStatusTone(selectedProfile) : "warning";
    return {
      kind: "native-comfy",
      tone,
      label: !environmentScan
        ? "waiting"
        : tone === "available"
          ? "ready"
          : tone === "missing"
            ? "missing"
            : "unknown"
    };
  }
  if (usesLlamaCpp) {
    const llamaCppPython = environmentScan?.llamaCppPython;
    const tone: SettingsStatusTone = llamaCppPython?.nativeCrash
      ? "missing"
      : llamaCppPython?.ready
        ? "available"
        : !environmentScan || llamaCppPython?.installed
          ? "warning"
          : "missing";
    const label: PromptRuntimeLabel = !environmentScan
      ? "waiting"
      : llamaCppPython?.ready
        ? "ready"
        : llamaCppPython?.gpuOffload === false
          ? "cpu"
          : llamaCppPython?.installed
            ? "unknown"
            : "missing";
    return {
      kind: "llama-cpp",
      tone,
      label,
      llamaCppPython,
      promptWriterNode: environmentScan?.customNodes?.find(
        (node) => node.id === "minimax-h3-prompt-writer"
      )
    };
  }

  const qwenVlProfile = selectedProfile ?? promptProfiles.find(
    (profile) => classifiers.isQwenVlPeftPromptModel(profile.id)
  );
  const qwenVlNode = environmentScan?.customNodes?.find(
    (node) => node.id === "comfyui-qwenvl-lora"
  );
  const evidence = qwenVlProfile ? modelProfileEvidence(qwenVlProfile) : null;
  const missing = evidence?.files === "missing" ||
    evidence?.nodePackage === "missing" ||
    evidence?.nodePackage === "incompatible" ||
    evidence?.runtime === "missing";
  const ready = evidence?.runtime === "ready" && qwenVlNode?.loaded === true;
  const tone: SettingsStatusTone = !environmentScan || !qwenVlProfile || qwenVlProfile.integrated === false
    ? "warning"
    : missing
      ? "missing"
      : ready
        ? "available"
        : "warning";
  return {
    kind: "qwen-vl",
    tone,
    label: !environmentScan
      ? "waiting"
      : tone === "available"
        ? "ready"
        : tone === "missing"
          ? "missing"
          : "unknown",
    qwenVlProfile,
    qwenVlNode
  };
}

export interface SettingsDirectoryState {
  comfyInstallations: EnvironmentScanResult["comfyInstallations"];
  comfyInstallDirectory: string;
  comfyCoreDirectory: string;
  comfyDataDirectory: string;
  modelDirectory: string;
  autoVideoOutputDirectory: string;
  autoImageOutputDirectory: string;
  autoImageInputLibraryDirectory: string;
  videoOutputDirectory: string;
  imageOutputDirectory: string;
  imageInputLibraryDirectory: string;
}

export function deriveSettingsDirectories(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null
): SettingsDirectoryState {
  const installations = environmentScan?.comfyInstallations ?? [];
  const comfyInstallDirectory = environmentScan?.comfyInstallDirectory ||
    settings.comfyInstallDirectory;
  const selectedInstallation = installations.find(
    (installation) => installation.selected || (
      Boolean(comfyInstallDirectory) &&
      installation.directory.toLowerCase() === comfyInstallDirectory.toLowerCase()
    )
  ) ?? installations[0];
  const comfyDataDirectory = environmentScan?.comfyRoot || "";
  const comfyOutputRoot = comfyDataDirectory
    ? `${comfyDataDirectory.replace(/[\\/]+$/u, "")}\\output`
    : environmentScan?.outputDirectory || "";
  const autoVideoOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Videos`
    : "";
  const autoImageOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Images`
    : "";
  const autoImageInputLibraryDirectory = comfyDataDirectory
    ? `${comfyDataDirectory.replace(/[\\/]+$/u, "")}\\input\\LocalVideoStudio`
    : "";
  return {
    comfyInstallations: installations,
    comfyInstallDirectory,
    comfyCoreDirectory: environmentScan?.comfySourceDirectory ||
      selectedInstallation?.sourceDirectory || "",
    comfyDataDirectory,
    modelDirectory: settings.modelDirectory || environmentScan?.modelDirectory || "",
    autoVideoOutputDirectory,
    autoImageOutputDirectory,
    autoImageInputLibraryDirectory,
    videoOutputDirectory: settings.outputDirectory || autoVideoOutputDirectory,
    imageOutputDirectory: settings.imageOutputDirectory || autoImageOutputDirectory,
    imageInputLibraryDirectory: settings.imageInputLibraryDirectory || autoImageInputLibraryDirectory
  };
}

export interface SettingsDependencyActionState {
  nodeUpdatesAvailable: boolean;
  customNodeInstallFinalizing: boolean;
  customNodeInstallGloballyBlocked: boolean;
}

export function deriveSettingsDependencyActionState(options: {
  environmentScan: EnvironmentScanResult | null;
  customNodeInstallPhase: CustomNodeInstallPhase;
  workflowDependencyInstalling: string;
  queueRunning: boolean;
  hasRunningQueueTask: boolean;
}): SettingsDependencyActionState {
  const customNodeInstallFinalizing = options.customNodeInstallPhase === "restarting" ||
    options.customNodeInstallPhase === "scanning";
  return {
    nodeUpdatesAvailable: Boolean(
      options.environmentScan?.customNodes?.some((node) => node.updateAvailable)
    ),
    customNodeInstallFinalizing,
    customNodeInstallGloballyBlocked: Boolean(
      customNodeInstallFinalizing ||
      options.workflowDependencyInstalling ||
      options.queueRunning ||
      options.hasRunningQueueTask
    )
  };
}

export function deriveVramReserveBytes(value: number): number {
  const reserveGb = Number.isFinite(value)
    ? Math.max(0.5, Math.min(1, value))
    : 1;
  return reserveGb * 1024 ** 3;
}

export function deriveSettingsGpuState(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null
) {
  return {
    devices: environmentScan?.gpus ?? [],
    item: environmentScan?.items?.find((item) => item.id === "nvidia"),
    reserveVramBytes: deriveVramReserveBytes(settings.vramReserveGb)
  };
}

export function deriveCoreNodeState(environmentScan: EnvironmentScanResult | null) {
  const known = Boolean(environmentScan?.comfyCompatibility?.checkedFrom);
  const h3Nodes = environmentScan?.comfyCompatibility?.coreNodes ?? [];
  const h3Ready = environmentScan?.comfyCompatibility?.h3CoreSupported ?? false;
  const promptNodes = environmentScan?.comfyCompatibility?.promptCoreNodes ?? [];
  const promptReady = promptNodes.length > 0 && promptNodes.every((node) => node.available);
  const workflowDependencies = environmentScan?.workflowDependencies ?? [];
  const customNodes = environmentScan?.customNodes ?? [];
  return {
    known,
    h3Nodes,
    h3Ready,
    h3Tone: h3Ready ? "available" as const : known ? "missing" as const : "warning" as const,
    promptNodes,
    promptReady,
    promptTone: promptReady ? "available" as const : known ? "missing" as const : "warning" as const,
    workflowDependencies,
    customNodes,
    availableCount: customNodes.filter((node) => node.installed).length +
      (h3Ready ? 1 : 0) +
      (promptReady ? 1 : 0) +
      workflowDependencies.filter((workflow) => workflow.installed).length,
    totalCount: customNodes.length + 2 + workflowDependencies.length
  };
}

export function coreNodeRowTone(available: boolean, known: boolean): "found" | "warning" | "missing" {
  return available ? "found" : known ? "missing" : "warning";
}

export type CustomNodeDisplayStatus =
  | "processing"
  | "queued"
  | "finalizing"
  | "compatibility-error"
  | "update"
  | "runtime-missing"
  | "file-ready"
  | "compatibility-warning"
  | "runtime-ready"
  | "repair"
  | "missing";

export function deriveCustomNodeCardState(options: {
  node: CustomNodeStatus;
  queuedIndex: number;
  active: boolean;
  finalizing: boolean;
  inFinalizingBatch: boolean;
  globallyBlocked: boolean;
}) {
  const queued = options.queuedIndex >= 0;
  const phase: CustomNodeDisplayStatus | null = options.active
    ? "processing"
    : queued
      ? "queued"
      : options.finalizing && options.inFinalizingBatch
        ? "finalizing"
        : null;
  const status: CustomNodeDisplayStatus = phase ?? (
    options.node.compatibilityState === "error"
      ? "compatibility-error"
      : options.node.updateAvailable && options.node.loaded
        ? "update"
        : options.node.runtimeVerified && Boolean(options.node.runtimeMissingNodeTypes?.length)
          ? "runtime-missing"
          : options.node.loaded && !options.node.runtimeVerified && !options.node.compatibilityNotice
            ? "file-ready"
            : options.node.compatibilityState === "warning"
              ? "compatibility-warning"
              : options.node.loaded
                ? options.node.runtimeVerified ? "runtime-ready" : "file-ready"
                : options.node.installed ? "repair" : "missing"
  );
  return {
    queued,
    phase,
    status,
    tone: customNodeStatusTone(options.node, phase !== null),
    installActionable: !options.node.installed || options.node.updateAvailable,
    installBlocked: options.globallyBlocked || options.active || queued
  };
}

export function deriveAccelerationState(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null
) {
  const attention = environmentScan?.attentionAcceleration;
  const pythonRuntimes = environmentScan?.pythonRuntimes ?? [];
  const detectedPythonPath = attention?.pythonPath ||
    pythonRuntimes.find((runtime) => runtime.selected)?.path ||
    pythonRuntimes[0]?.path || "";
  const effectivePythonPath = settings.comfyPythonPath || detectedPythonPath;
  const selectedPythonRuntime = pythonRuntimes.find(
    (runtime) => runtime.path.toLowerCase() === effectivePythonPath.toLowerCase()
  );
  const status = attention?.ready
    ? "ready" as const
    : attention?.supported === false
      ? "unsupported" as const
      : "pending" as const;
  return {
    attention,
    status,
    tone: status === "ready" ? "available" as const : status === "unsupported" ? "missing" as const : "warning" as const,
    canInstall: attention?.supported === true,
    installAction: status === "ready" ? "repair" as const : "install" as const,
    pythonRuntimes,
    effectivePythonPath,
    pythonSelection: settings.comfyPythonPath
      ? selectedPythonRuntime?.source === "comfy-venv" ? "comfy-venv" as const : "selected" as const
      : "auto" as const
  };
}
