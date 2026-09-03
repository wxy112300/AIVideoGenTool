import type { AppApi } from "../types";

/**
 * Renderer-facing application commands and state queries. The concrete
 * Electron transport remains behind createElectronRendererClient().
 */
const applicationMethodNames = [
  "getState",
  "getComfyRuntimeState",
  "getPromptRuntimeState",
  "getAppVersion",
  "setSettingsDirty",
  "saveDraft",
  "saveImageDraft",
  "saveSettings",
  "setQueueH3LivePreview",
  "inspectWorkflow",
  "getBundledWorkflow",
  "getPerformanceMetrics",
  "readAppLogs",
  "reportRendererError",
  "reportUserAction",
  "reportNotification",
  "preflightPromptModel",
  "enhancePrompt",
  "cancelPrompt",
  "startPromptModel",
  "releasePromptModel",
  "testConnection",
  "scanEnvironment",
  "startLocalService",
  "restartLocalService",
  "forceStopComfyProcesses",
  "updateComfyUi",
  "repairEnvironmentIssue",
  "installCustomNode",
  "uninstallCustomNode",
  "installLlamaCppPython",
  "uninstallLlamaCppPython",
  "installAttentionAcceleration",
  "enqueue",
  "enqueueExtension",
  "enqueueImageEdit",
  "enqueueUpscale",
  "updateUpscaleTask",
  "removeTask",
  "startQueue",
  "continueQueue",
  "pauseQueue",
  "setQueuePauseBoundaryAfterTask",
  "setQueuePauseBoundary",
  "clearQueuePauseBoundary",
  "cancelTask",
  "moveTask",
  "reorderTask",
  "duplicateTask",
  "randomizeTaskSeed",
  "resetTask",
  "deleteHistoryAsset",
  "deleteHistoryVersion",
  "deleteHistoryJointAv",
  "inspectH3NativeAvArtifact",
  "updateHistoryMetadata",
  "setImageHistoryCover",
  "deleteImageHistoryVersion"
] as const satisfies ReadonlyArray<keyof AppApi>;

const eventMethodNames = [
  "onStateChanged",
  "onComfyRuntimeStateChanged",
  "onPromptRuntimeStateChanged",
  "onTaskPreview",
  "onPromptProgress",
  "onWindowCloseRequest",
  "onAttentionInstallLog",
  "onDependencyInstallLog",
  "onHistoryMigrationProgress",
  "onImageAssetLibraryProgress"
] as const satisfies ReadonlyArray<keyof AppApi>;

const assetMethodNames = [
  "readImageMarkup",
  "saveImageMarkup",
  "saveImageMask",
  "saveImageCrop",
  "readImage",
  "readHistoryCover",
  "saveHistoryCover",
  "scanImageAssetLibrary",
  "organizeImageAssetLibrary",
  "cleanupImageAssetLibrary"
] as const satisfies ReadonlyArray<keyof AppApi>;

const hostCapabilityMethodNames = [
  "respondWindowClose",
  "pickImage",
  "pickVideo",
  "getDroppedFilePath",
  "saveClipboardImage",
  "pickWorkflow",
  "pickPython",
  "openAppLogDirectory",
  "pickDirectory",
  "showItemInFolder",
  "openDirectory",
  "copyFile",
  "openSystemPlayer",
  "openExternal"
] as const satisfies ReadonlyArray<keyof AppApi>;

export const rendererApiInventory = {
  application: applicationMethodNames,
  events: eventMethodNames,
  assets: assetMethodNames,
  hostCapabilities: hostCapabilityMethodNames
} as const;

export type RendererApplicationApi = Pick<AppApi, (typeof applicationMethodNames)[number]>;
export type RendererEventsApi = Pick<AppApi, (typeof eventMethodNames)[number]>;
export type RendererAssetsApi = Pick<AppApi, (typeof assetMethodNames)[number]>;
export type RendererHostCapabilities = Pick<AppApi, (typeof hostCapabilityMethodNames)[number]>;

export type RendererClient =
  & RendererApplicationApi
  & RendererEventsApi
  & RendererAssetsApi
  & RendererHostCapabilities;

export type RendererEventClient = RendererEventsApi & Pick<RendererApplicationApi, "reportRendererError">;

/**
 * Narrow dependency views used by renderer composition and page migration.
 * Each view intentionally references the same client object; no method is
 * wrapped or rebound a second time at this boundary.
 */
export interface RendererDependencies {
  readonly application: RendererApplicationApi;
  readonly events: RendererEventsApi;
  readonly assets: RendererAssetsApi;
  readonly hostCapabilities: RendererHostCapabilities;
}

export function createRendererDependencies(client: RendererClient): RendererDependencies {
  return {
    application: client,
    events: client,
    assets: client,
    hostCapabilities: client
  };
}

export type RendererApiMethodName = keyof RendererClient & keyof AppApi & string;

const rendererApiMethodNames = [
  ...applicationMethodNames,
  ...eventMethodNames,
  ...assetMethodNames,
  ...hostCapabilityMethodNames
] as RendererApiMethodName[];

/** Compile-time guard: adding an AppApi method requires classifying it here. */
export const rendererApiInventoryIsComplete: Exclude<keyof AppApi, RendererApiMethodName> extends never
  ? true
  : false = true;

type RendererFunction = (...args: unknown[]) => unknown;

/**
 * Build the renderer client from the existing preload API without changing
 * arguments, return values, rejected errors, or event cleanup functions.
 */
export function createElectronRendererClient(preloadApi: AppApi): RendererClient {
  const client = {} as Record<RendererApiMethodName, RendererFunction>;
  for (const methodName of rendererApiMethodNames) {
    const method = preloadApi[methodName] as unknown as RendererFunction;
    client[methodName] = (...args) => Reflect.apply(method, preloadApi, args);
  }
  return client as RendererClient;
}

/**
 * Test/default fake: only explicitly configured methods are callable. This
 * keeps missing renderer dependencies visible instead of silently no-oping.
 */
export function createThrowingRendererClient(
  overrides: Partial<RendererClient> = {}
): RendererClient {
  const target = { ...overrides } as RendererClient;
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property !== "string" || property in current) {
        return Reflect.get(current, property, receiver);
      }
      return (..._args: unknown[]) => {
        throw new Error(`Unconfigured renderer client method: ${property}`);
      };
    }
  });
}
