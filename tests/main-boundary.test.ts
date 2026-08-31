import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(process.cwd());

function source(relativePath: string): string {
  return readFileSync(resolve(workspace, relativePath), "utf8");
}

const preloadSource = source("electron/preload.cts");
const mainSource = source("electron/main.ts");
const indexSource = source("index.html");
const eventBridgeSource = source("electron/services/studio-event-bridge.ts");
const queueSources = new Map([
  ["queue-enqueue", source("electron/queue-enqueue.ts")],
  ["queue-ipc", source("electron/queue-ipc.ts")],
  ["queue-control-ipc", source("electron/queue-control-ipc.ts")]
]);
const historySources = new Map([
  ["history-ipc", source("electron/history-ipc.ts")]
]);
const mediaSources = new Map([
  ["media-ipc", source("electron/media-ipc.ts")]
]);
const imageDocumentSources = new Map([
  ["image-document-ipc", source("electron/image-document-ipc.ts")]
]);
const draftSources = new Map([
  ["draft-ipc", source("electron/draft-ipc.ts")]
]);
const settingsSources = new Map([
  ["settings-ipc", source("electron/settings-ipc.ts")]
]);
const promptSources = new Map([
  ["prompt-ipc", source("electron/prompt-ipc.ts")]
]);
const environmentSources = new Map([
  ["environment-ipc", source("electron/environment-ipc.ts")]
]);
const appQuerySources = new Map([
  ["app-query-ipc", source("electron/app-query-ipc.ts")]
]);
const nativeHostSources = new Map([
  ["native-host-ipc", source("electron/native-host-ipc.ts")]
]);
const workflowSources = new Map([
  ["workflow-ipc", source("electron/workflow-ipc.ts")]
]);
const imageAssetSources = new Map([
  ["image-asset-ipc", source("electron/image-asset-ipc.ts")]
]);
const queueRuntimeSource = source("electron/services/queue-runtime-service.ts");
const registrationSources = new Map([
  ["main", mainSource],
  ...queueSources,
  ...historySources,
  ...mediaSources,
  ...imageDocumentSources,
  ...draftSources,
  ...settingsSources,
  ...promptSources,
  ...environmentSources,
  ...appQuerySources,
  ...nativeHostSources,
  ...workflowSources,
  ...imageAssetSources
]);

function collectChannels(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

function collectInvokeRegistrations(): Map<string, string[]> {
  const registrations = new Map<string, string[]>();
  for (const [owner, text] of registrationSources) {
    for (const channel of collectChannels(
      text,
      /(?:ipcMain|ipc)\.handle\(\s*"([^"]+)"/g
    )) {
      const owners = registrations.get(channel) ?? [];
      owners.push(owner);
      registrations.set(channel, owners);
    }
  }
  return registrations;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("main/preload boundary characterization", () => {
  it("maps every preload invoke channel to exactly one registration owner", () => {
    const preloadInvokes = collectChannels(
      preloadSource,
      /ipcRenderer\.invoke\(\s*"([^"]+)"/g
    );
    const invokeChannels = new Set(preloadInvokes);
    const registrations = collectInvokeRegistrations();

    expect(invokeChannels.size).toBe(79);
    expect(preloadInvokes.length).toBe(invokeChannels.size);
    expect(sorted(invokeChannels)).toEqual(sorted(registrations.keys()));

    const duplicateOwners = [...registrations.entries()]
      .filter(([, owners]) => owners.length !== 1)
      .map(([channel, owners]) => `${channel}: ${owners.join(", ")}`);
    expect(duplicateOwners).toEqual([]);

    const specializedOwners: Record<string, string[]> = {
      "queue-enqueue": [
        "queue:enqueue",
        "queue:enqueue-extension",
        "queue:enqueue-image",
        "queue:enqueue-upscale"
      ],
      "queue-ipc": [
        "queue:update-upscale",
        "queue:remove",
        "queue:move",
        "queue:reorder",
        "queue:duplicate",
        "queue:randomize-seed",
        "queue:set-pause-boundary-after-task",
        "queue:set-pause-boundary",
        "queue:clear-pause-boundary",
        "queue:reset"
      ],
      "queue-control-ipc": [
        "queue:start",
        "queue:continue",
        "queue:pause",
        "queue:cancel"
      ],
      "history-ipc": [
        "history-cover:read",
        "history-cover:save",
        "history:delete",
        "history:update-metadata",
        "history:delete-version",
        "image-history:set-cover",
        "image-history:delete-version"
      ],
      "media-ipc": [
        "file:read-image",
        "file:show-in-folder",
        "file:open-system-player",
        "file:copy"
      ],
      "image-document-ipc": [
        "image-markup:read",
        "image-markup:save",
        "image-mask:save",
        "image-crop:save"
      ],
      "draft-ipc": [
        "draft:save",
        "image-draft:save"
      ],
      "settings-ipc": [
        "settings:save"
      ],
      "prompt-ipc": [
        "prompt:preflight",
        "prompt:start",
        "prompt:enhance",
        "prompt:cancel",
        "prompt:release"
      ],
      "environment-ipc": [
        "connection:test",
        "environment:scan",
        "service:start",
        "service:restart",
        "service:force-stop-comfy",
        "comfyui:update",
        "environment:repair",
        "custom-node:install",
        "custom-node:uninstall",
        "llama-cpp-python:install",
        "llama-cpp-python:uninstall",
        "attention-acceleration:install"
      ],
      "app-query-ipc": [
        "state:get",
        "comfy-runtime:get",
        "prompt-runtime:get",
        "app:version",
        "logs:read",
        "logs:renderer-error",
        "logs:user-action",
        "logs:notification",
        "performance:get"
      ],
      "native-host-ipc": [
        "file:pick-image",
        "file:pick-video",
        "file:pick-workflow",
        "file:pick-python",
        "file:pick-directory",
        "file:open-directory",
        "file:save-clipboard-image",
        "shell:open-external",
        "logs:open-directory"
      ],
      "workflow-ipc": [
        "workflow:inspect",
        "workflow:get-bundled"
      ],
      "image-asset-ipc": [
        "image-assets:scan",
        "image-assets:organize",
        "image-assets:cleanup"
      ]
    };
    const specializedChannels = new Set(Object.values(specializedOwners).flat());
    for (const [owner, channels] of Object.entries(specializedOwners)) {
      for (const channel of channels) {
        expect(registrations.get(channel), `${channel} owner`).toEqual([owner]);
      }
    }

    const mainOwnedChannels = [...invokeChannels].filter(
      (channel) => !specializedChannels.has(channel)
    );
    expect(mainOwnedChannels.every((channel) =>
      registrations.get(channel)?.[0] === "main"
    )).toBe(true);

    // These cross-domain assertions make a missing or accidentally relocated
    // registration fail with a useful channel/owner diff, rather than only a
    // total-count failure.
    expect(registrations.get("state:get")).toEqual(["app-query-ipc"]);
    expect(registrations.get("file:pick-image")).toEqual(["native-host-ipc"]);
    expect(registrations.get("history:delete")).toEqual(["history-ipc"]);
    expect(registrations.get("history-cover:read")).toEqual(["history-ipc"]);
    expect(registrations.get("draft:save")).toEqual(["draft-ipc"]);
    expect(registrations.get("image-draft:save")).toEqual(["draft-ipc"]);
    expect(registrations.get("settings:save")).toEqual(["settings-ipc"]);
    expect(registrations.get("service:start")).toEqual(["environment-ipc"]);

    expect(mainSource).not.toContain("registerQueueEnqueueIpc");
    expect(mainSource).not.toContain("registerQueueControlIpc");
    expect(mainSource).not.toContain("registerQueueMutationIpc");
    expect(mainSource).not.toContain("new QueueWorkerController");
    expect(mainSource).not.toContain("createQueueExecutor");
    expect(mainSource).not.toContain('ipcMain.handle("history:delete"');
    expect(mainSource).not.toContain('ipcMain.handle("history:update-metadata"');
    expect(mainSource).not.toContain('ipcMain.handle("history:delete-version"');
    expect(mainSource).not.toContain('ipcMain.handle("image-history:set-cover"');
    expect(mainSource).not.toContain('ipcMain.handle("image-history:delete-version"');
    expect(mainSource).not.toContain('ipcMain.handle("draft:save"');
    expect(mainSource).not.toContain('ipcMain.handle("image-draft:save"');
    expect(mainSource).not.toContain('ipcMain.handle("settings:save"');
    expect(mainSource).toContain("registerImageAssetIpc");
    expect(mainSource).not.toContain("imageAssetLibraryRunning");
    expect(imageAssetSources.get("image-asset-ipc")).not.toContain("store.update");
    for (const channel of specializedOwners["prompt-ipc"] ?? []) {
      expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
    }
    for (const channel of specializedOwners["environment-ipc"] ?? []) {
      expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
    }
    for (const channel of specializedOwners["media-ipc"] ?? []) {
      expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
    }
    for (const channel of specializedOwners["image-document-ipc"] ?? []) {
      expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
    }
    for (const owner of ["app-query-ipc", "native-host-ipc", "workflow-ipc"] as const) {
      for (const channel of specializedOwners[owner] ?? []) {
        expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
      }
    }
    for (const channel of specializedOwners["image-asset-ipc"] ?? []) {
      expect(mainSource).not.toContain(`ipcMain.handle("${channel}"`);
    }

    const droppedFilePath = /getDroppedFilePath:\s*\(file\)\s*=>\s*webUtils\.getPathForFile\(file\)/.exec(
      preloadSource
    );
    expect(droppedFilePath?.[0]).toBeTruthy();
    expect(droppedFilePath?.[0]).not.toContain("ipcRenderer.invoke");
  });

  it("keeps all event sender/listener channels and directional install logs", () => {
    const expectedEvents = new Set([
      "state:changed",
      "comfy-runtime:changed",
      "prompt-runtime:changed",
      "task:preview",
      "prompt:progress",
      "window:close-requested",
      "attention-acceleration:log",
      "dependency-install:log",
      "history-migration:progress",
      "image-assets:progress"
    ]);
    const listenerChannels = new Set(collectChannels(
      preloadSource,
      /ipcRenderer\.on\(\s*"([^"]+)"/g
    ));
    const webContentsChannels = new Set(collectChannels(
      mainSource,
      /webContents\.send\(\s*"([^"]+)"/g
    ));
    const senderChannels = new Set([
      ...collectChannels(mainSource, /event\.sender\.send\(\s*"([^"]+)"/g),
      ...collectChannels(
        environmentSources.get("environment-ipc") ?? "",
        /sendIfAlive\(event,\s*"([^"]+)"/g
      )
    ]);
    const bridgeChannels = new Set(collectChannels(
      eventBridgeSource,
      /^\s*"([^"]+)"(?:,)?$/gm
    ));
    const removeListenerChannels = new Set(collectChannels(
      preloadSource,
      /ipcRenderer\.removeListener\(\s*"([^"]+)"/g
    ));

    expect(listenerChannels).toEqual(expectedEvents);
    expect(new Set([...webContentsChannels, ...senderChannels, ...bridgeChannels])).toEqual(expectedEvents);
    expect(removeListenerChannels).toEqual(expectedEvents);

    expect(webContentsChannels).toEqual(new Set(["window:close-requested"]));
    expect(senderChannels).toEqual(new Set([
      "attention-acceleration:log",
      "dependency-install:log"
    ]));
    expect(bridgeChannels).toEqual(new Set([
      "state:changed",
      "comfy-runtime:changed",
      "prompt-runtime:changed",
      "task:preview",
      "prompt:progress",
      "history-migration:progress",
      "image-assets:progress"
    ]));
    expect(environmentSources.get("environment-ipc")).toContain('sendIfAlive(event, "attention-acceleration:log"');
    expect(environmentSources.get("environment-ipc")).toContain('sendIfAlive(event, "dependency-install:log"');
    expect(mainSource).not.toContain('mainWindow?.webContents.send("attention-acceleration:log"');
    expect(mainSource).not.toContain('mainWindow?.webContents.send("dependency-install:log"');
  });

  it("keeps queue command services independent from Electron transport and native image state", () => {
    const controlServiceSource = source("electron/queue-control-service.ts");
    const mutationServiceSource = source("electron/queue-mutation-service.ts");
    const enqueueSource = source("electron/queue-enqueue.ts");
    expect(controlServiceSource).not.toContain('from "electron"');
    expect(mutationServiceSource).not.toContain('from "electron"');
    expect(enqueueSource).not.toContain("nativeImage");
    expect(enqueueSource).toContain("ImageInspectionPort");
    expect(enqueueSource).toContain("service.enqueue");
  });

  it("keeps queue runtime orchestration out of main and behind one capability", () => {
    expect(queueRuntimeSource).not.toContain('from "electron"');
    expect(queueRuntimeSource).toContain("class QueueRuntimeService");
    expect(mainSource).toContain("new QueueRuntimeService");
    expect(mainSource).not.toContain("async function ensureComfyUiReady");
    expect(mainSource).not.toContain("async function stabilizeH3RuntimeBetweenTasks");
    expect(mainSource).not.toContain("async function prepareQueueRuntimeForTask");
    expect(mainSource).not.toContain("async function cleanupCancelledQueueTask");
    expect(mainSource).not.toContain("resolveH3VideoVaeModeForQueueTask");
    expect(source("electron/application-runtime.ts")).toContain("runtime: QueueRuntimeCapability");
    expect(source("electron/services/queue-service.ts")).toContain("queueRuntime: QueueRuntimeCapability");
  });

  it("keeps History application services independent from Electron transport", () => {
    const querySource = source("electron/services/history-query-service.ts");
    const metadataSource = source("electron/services/history-metadata-service.ts");
    const destructiveSource = source("electron/services/history-destructive-service.ts");
    expect(querySource).not.toContain('from "electron"');
    expect(metadataSource).not.toContain('from "electron"');
    expect(destructiveSource).not.toContain('from "electron"');
    expect(mainSource).toContain("registerHistoryIpc");
  });

  it("keeps Draft and Settings application services independent from Electron transport", () => {
    const draftServiceSource = source("electron/services/draft-service.ts");
    const settingsServiceSource = source("electron/services/settings-service.ts");
    expect(draftServiceSource).not.toContain('from "electron"');
    expect(settingsServiceSource).not.toContain('from "electron"');
    expect(mainSource).toContain("registerDraftIpc");
    expect(mainSource).toContain("registerSettingsIpc");
  });

  it("keeps Prompt and Environment application services independent from Electron transport", () => {
    const promptServiceSource = source("electron/services/prompt-application-service.ts");
    const environmentQuerySource = source("electron/services/environment-query-service.ts");
    const runtimeAdminSource = source("electron/services/runtime-admin-service.ts");
    expect(promptServiceSource).not.toContain('from "electron"');
    expect(environmentQuerySource).not.toContain('from "electron"');
    expect(runtimeAdminSource).not.toContain('from "electron"');
    expect(mainSource).toContain("registerPromptIpc");
    expect(mainSource).toContain("registerEnvironmentIpc");
  });

  it("keeps Media and Image Document application services independent from Electron transport", () => {
    const mediaServiceSource = source("electron/services/media-read-service.ts");
    const imageDocumentServiceSource = source("electron/services/image-document-service.ts");
    expect(mediaServiceSource).not.toContain('from "electron"');
    expect(imageDocumentServiceSource).not.toContain('from "electron"');
    expect(mainSource).toContain("registerMediaIpc");
    expect(mainSource).toContain("registerMediaProtocol");
    expect(mainSource).toContain("registerImageDocumentIpc");
    expect(mainSource).toContain("registerImageMaskIpc");
  });

  it("keeps Lifecycle Coordinator independent from Electron transport", () => {
    const lifecycleSource = source("electron/services/lifecycle-coordinator.ts");
    expect(lifecycleSource).not.toContain('from "electron"');
    expect(lifecycleSource).toContain("class LifecycleCoordinator");
    expect(mainSource).toContain("activeApplicationRuntime().stop()");
  });

  it("keeps ApplicationRuntime independent and makes main an adapter composition root", () => {
    const runtimeSource = source("electron/application-runtime.ts");
    expect(runtimeSource).not.toContain('from "electron"');
    expect(runtimeSource).not.toContain("requestSingleInstanceLock");
    expect(runtimeSource).toContain("export class ApplicationRuntime");
    expect(mainSource).toContain("const runtime = new ApplicationRuntime");
    expect(mainSource).toContain("await runtime.start");
    expect(mainSource).not.toContain("new PromptApplicationService");
    expect(mainSource).not.toContain("new RuntimeAdminService");
    expect(mainSource).not.toContain("new QueueService");
    expect(appQuerySources.get("app-query-ipc")).toContain("await deps.waitForInitialState()");
    expect(mainSource).toContain("runtime.waitForInitialState()");
    expect(mainSource).toContain('"startup-failed"');
  });

  it("keeps a visible static startup shell before renderer state is available", () => {
    expect(indexSource).toContain('<div id="app" aria-busy="true">');
    expect(indexSource).toContain('class="startup-shell"');
    expect(indexSource).toContain('data-startup-message');
    expect(indexSource).toContain("正在准备本地工作区");
  });

  it("characterizes safe startup and shutdown ordering without launching services", () => {
    const startupStart = mainSource.indexOf("app.whenReady().then(async () =>");
    const startupEnd = mainSource.indexOf('app.on("window-all-closed"', startupStart);
    expect(startupStart).toBeGreaterThanOrEqual(0);
    expect(startupEnd).toBeGreaterThan(startupStart);
    const startup = mainSource.slice(startupStart, startupEnd);
    const startupSteps = [
      'appLogger.info("app", "ready"',
      "const studioPaths = createStudioPaths",
      "const stateRepository = new JsonStore",
      "const runtime = new ApplicationRuntime",
      "applicationRuntime = runtime",
      "await runtime.start({",
      "onServicesReady",
      "registerMediaProtocol(",
      "registerIpc(",
      "createWindow()",
      'app.on("activate"'
    ];
    const startupPositions = startupSteps.map((step) => startup.indexOf(step));
    expect(startupPositions.every((position) => position >= 0)).toBe(true);
    expect(startupPositions).toEqual([...startupPositions].sort((left, right) => left - right));

    const runtimeStartPosition = startup.indexOf("await runtime.start({");
    const activatePosition = startup.indexOf('app.on("activate"');
    expect(activatePosition).toBeGreaterThan(runtimeStartPosition);
    const createWindowStart = mainSource.indexOf("function createWindow(): void");
    const createWindowEnd = mainSource.indexOf("async function updateTask(", createWindowStart);
    expect(createWindowStart).toBeGreaterThanOrEqual(0);
    expect(createWindowEnd).toBeGreaterThan(createWindowStart);
    const createWindow = mainSource.slice(createWindowStart, createWindowEnd);
    expect(createWindow).toContain("void mainWindow.loadURL");
    expect(createWindow).toContain("void mainWindow.loadFile");
    expect(createWindow).toContain('once("dom-ready"');
    expect(createWindow).toContain('once("did-finish-load"');

    const finishStart = mainSource.indexOf("async function finishWindowClose()");
    const closeHandlerStart = mainSource.indexOf("async function handleWindowClose()");
    expect(finishStart).toBeGreaterThanOrEqual(0);
    expect(closeHandlerStart).toBeGreaterThan(finishStart);
    const finish = mainSource.slice(finishStart, closeHandlerStart);
    const shutdownSteps = [
      "await activeApplicationRuntime().stop()",
      "allowWindowClose = true",
      "mainWindow?.destroy()",
      "app.quit()"
    ];
    const shutdownPositions = shutdownSteps.map((step) => finish.indexOf(step));
    expect(shutdownPositions.every((position) => position >= 0)).toBe(true);
    expect(shutdownPositions).toEqual([...shutdownPositions].sort((left, right) => left - right));

    const closeListenerStart = mainSource.indexOf('mainWindow.on("close"');
    const closeListenerEnd = mainSource.indexOf('mainWindow.on("closed"', closeListenerStart);
    const closeListener = mainSource.slice(closeListenerStart, closeListenerEnd);
    expect(closeListener).toContain("event.preventDefault()");
    expect(closeListener).toContain("void handleWindowClose()");
    expect(mainSource).toContain('response === "force-exit"');
    expect(mainSource).toContain("await interruptForExit(true");
    expect(mainSource).toContain("await interruptForExit(false");
  });
});
