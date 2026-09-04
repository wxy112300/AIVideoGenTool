import type { IpcMain } from "electron";
import type {
  ConnectionKind,
  CustomNodeInstallMode,
  EnvironmentIssue,
  LocalServiceKind,
  Settings
} from "../src/types.js";
import type { EnvironmentQueryService } from "./services/environment-query-service.js";
import type { RuntimeAdminService } from "./services/runtime-admin-service.js";

export interface EnvironmentIpcDependencies {
  ipc: IpcMain;
  query: EnvironmentQueryService;
  admin: RuntimeAdminService;
}

function sendIfAlive(
  event: Electron.IpcMainInvokeEvent,
  channel: string,
  payload: unknown
): void {
  if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
}

export function registerEnvironmentIpc(deps: EnvironmentIpcDependencies): void {
  deps.ipc.handle(
    "connection:test",
    (_event, kind: ConnectionKind, settings: Settings) =>
      deps.query.testConnection(kind, settings)
  );
  deps.ipc.handle(
    "environment:scan",
    (_event, settings: Settings, requestedScope: unknown) =>
      deps.query.scan(settings, requestedScope)
  );
  deps.ipc.handle(
    "service:start",
    (_event, kind: LocalServiceKind, settings: Settings) =>
      deps.admin.start(kind, settings)
  );
  deps.ipc.handle(
    "service:force-stop-comfy",
    (_event, settings: Settings) => deps.admin.forceStopComfy(settings)
  );
  deps.ipc.handle(
    "service:restart",
    (_event, kind: LocalServiceKind, settings: Settings) =>
      deps.admin.restart(kind, settings)
  );
  deps.ipc.handle(
    "comfyui:update",
    (_event, settings: Settings) => deps.admin.update(settings)
  );
  deps.ipc.handle(
    "environment:repair",
    (_event, issueId: EnvironmentIssue["id"], settings: Settings) =>
      deps.admin.repair(issueId, settings)
  );
  deps.ipc.handle(
    "custom-node:install",
    (event, nodeId: string, settings: Settings, mode?: CustomNodeInstallMode) =>
      deps.admin.installCustomNode(
        nodeId,
        settings,
        mode,
        (message) => sendIfAlive(event, "dependency-install:log", {
          kind: "custom-node",
          id: nodeId,
          message
        })
      )
  );
  deps.ipc.handle(
    "custom-node:uninstall",
    (event, nodeId: string, settings: Settings) =>
      deps.admin.uninstallCustomNode(
        nodeId,
        settings,
        (message) => sendIfAlive(event, "dependency-install:log", {
          kind: "custom-node",
          id: nodeId,
          message
        })
      )
  );
  deps.ipc.handle(
    "llama-cpp-python:install",
    (event, settings: Settings) =>
      deps.admin.installLlamaCppPython(
        settings,
        (message) => sendIfAlive(event, "dependency-install:log", {
          kind: "python-runtime",
          id: "llama-cpp-python",
          message
        })
      )
  );
  deps.ipc.handle(
    "llama-cpp-python:uninstall",
    (event, settings: Settings) =>
      deps.admin.uninstallLlamaCppPython(
        settings,
        (message) => sendIfAlive(event, "dependency-install:log", {
          kind: "python-runtime",
          id: "llama-cpp-python",
          message
        })
      )
  );
  deps.ipc.handle(
    "attention-acceleration:install",
    (event, settings: Settings) =>
      deps.admin.installAttentionAcceleration(
        settings,
        (message) => sendIfAlive(event, "attention-acceleration:log", message)
      )
  );
  deps.ipc.handle(
    "depth-anything:install",
    (event, settings: Settings) =>
      deps.admin.installDepthAnything(
        settings,
        (message) => sendIfAlive(event, "dependency-install:log", {
          kind: "model-assets",
          id: "depth-anything-v2",
          message
        })
      )
  );
}
