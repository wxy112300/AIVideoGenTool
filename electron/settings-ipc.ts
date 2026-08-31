import type { IpcMain } from "electron";
import type { Settings, SettingsSaveMode } from "../src/types.js";
import type { SettingsService } from "./services/settings-service.js";

export interface SettingsIpcDependencies {
  ipc: IpcMain;
  service: SettingsService;
}

export function registerSettingsIpc(deps: SettingsIpcDependencies): void {
  deps.ipc.handle(
    "settings:save",
    async (_event, settings: Settings, mode: SettingsSaveMode = "apply") =>
      deps.service.save(settings, mode)
  );
}
