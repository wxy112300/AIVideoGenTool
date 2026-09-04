import type {
  CustomNodeStatus,
  EnvironmentItem,
  EnvironmentScanResult,
  LlamaCppPythonStatus,
  ModelScanProfile,
  Settings
} from "../../../types";
import {
  h3VideoVaeAvailabilityFromModelProfiles,
  normalizeH3VideoVaeMode,
  resolveH3VideoVaeMode
} from "../../../core/h3-video-vae";
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
  queueRunning: boolean;
  hasRunningQueueTask: boolean;
}): SettingsDependencyActionState {
  const customNodeInstallFinalizing = options.customNodeInstallPhase === "restarting" ||
    options.customNodeInstallPhase === "scanning";
  return {
    nodeUpdatesAvailable: Boolean(
      options.environmentScan?.customNodes?.some((node) =>
        node.updateAvailable || node.runtimeRepairable
      )
    ),
    customNodeInstallFinalizing,
    customNodeInstallGloballyBlocked: Boolean(
      customNodeInstallFinalizing ||
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

export function isDlss5RuntimeUnavailable(
  runtime: EnvironmentScanResult["dlss5Runtime"]
): boolean {
  return Boolean(
    runtime && (
      runtime.state === "missing" ||
      runtime.state === "invalid" ||
      (runtime.state === "ready" && !runtime.srReady && !runtime.nrReady)
    )
  );
}

export function isAetherScaleRuntimeUnavailable(
  runtime: EnvironmentScanResult["aetherScaleRuntime"]
): boolean {
  return Boolean(
    runtime && (
      runtime.state === "missing" ||
      runtime.state === "invalid" ||
      runtime.state === "remote" ||
      (runtime.state === "ready" && !runtime.carrierReady)
    )
  );
}

export function deriveCustomNodeCardState(options: {
  node: CustomNodeStatus;
  queuedIndex: number;
  active: boolean;
  finalizing: boolean;
  inFinalizingBatch: boolean;
  globallyBlocked: boolean;
  runtimeUnavailable?: boolean;
}) {
  const queued = options.queuedIndex >= 0;
  const revisionUpdateAvailable = Boolean(
    options.node.installed &&
    options.node.appInstallable !== false &&
    options.node.updateAvailable &&
    options.node.detectedRevision &&
    options.node.installRevision &&
    options.node.detectedRevision.toLowerCase() !== options.node.installRevision.toLowerCase()
  );
  const phase: CustomNodeDisplayStatus | null = options.active
    ? "processing"
    : queued
      ? "queued"
      : options.finalizing && options.inFinalizingBatch
        ? "finalizing"
        : null;
  const runtimeUnavailable = options.node.installed && options.runtimeUnavailable === true;
  const status: CustomNodeDisplayStatus = phase ?? (
    revisionUpdateAvailable
      ? "update"
      : options.node.compatibilityState === "error"
      ? "compatibility-error"
      : options.node.updateAvailable && options.node.loaded
        ? "update"
        : runtimeUnavailable
          ? "runtime-missing"
        : options.node.installed && options.node.runtimeVerified && Boolean(options.node.runtimeMissingNodeTypes?.length)
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
    tone: runtimeUnavailable && phase === null
      ? "missing"
      : customNodeStatusTone(options.node, phase !== null),
    primaryOperation: !options.node.installed
      ? "install" as const
      : revisionUpdateAvailable
        ? "update" as const
        : runtimeUnavailable
          ? "repair" as const
        : options.node.runtimeRepairable || Boolean(options.node.loadError) ||
        options.node.compatibilityState === "error"
        ? "repair" as const
        : options.node.updateAvailable
          ? "update" as const
          : "reinstall" as const,
    installActionable: true,
    runtimeRepairable: options.node.runtimeRepairable === true,
    revisionUpdateAvailable,
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

export type H3VideoVaeStatus = "waiting" | "ready" | "fp16-only" | "int8-only" | "missing";

export interface H3VideoVaeSettingsState {
  fp16Available: boolean;
  int8ConvrotAvailable: boolean;
  available: boolean;
  selectedMode: Settings["h3VideoVaeMode"];
  status: H3VideoVaeStatus;
  tone: SettingsStatusTone;
}

export function deriveH3VideoVaeState(
  settings: Settings,
  environmentScan: EnvironmentScanResult | null
): H3VideoVaeSettingsState {
  const availability = h3VideoVaeAvailabilityFromModelProfiles(
    environmentScan?.modelProfiles ?? []
  );
  const requestedMode = normalizeH3VideoVaeMode(settings.h3VideoVaeMode);
  const resolvedMode = resolveH3VideoVaeMode(
    settings.h3VideoVaeMode,
    availability
  );
  // Keep Auto selected in the form even though the concrete backend is
  // resolved only when the next H3 task is claimed.
  const selectedMode = requestedMode === "auto"
    ? requestedMode
    : resolvedMode ?? requestedMode;
  const status: H3VideoVaeStatus = !environmentScan
    ? "waiting"
    : !availability.fp16 && !availability.int8Convrot
      ? "missing"
      : availability.fp16 && availability.int8Convrot
        ? "ready"
        : availability.fp16
          ? "fp16-only"
          : "int8-only";
  return {
    fp16Available: availability.fp16,
    int8ConvrotAvailable: availability.int8Convrot,
    available: availability.fp16 || availability.int8Convrot,
    selectedMode,
    status,
    tone: status === "missing" ? "missing" : status === "waiting" ? "warning" : "available"
  };
}
