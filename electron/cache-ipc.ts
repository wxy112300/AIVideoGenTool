import type { IpcMain } from "electron";
import type { AppCacheClearResult, AppCacheSnapshot, Settings } from "../src/types.js";
import { createManagedSoftwareCache } from "./services/managed-software-cache.js";
import { getApplicationLogger } from "../src/infrastructure/app-logger.js";
import { hasActiveInstallations } from "./services/installation-cancellation.js";
import {
  createAppCacheService,
  type AppCacheSession
} from "./services/cache-service.js";

export interface CacheIpcDependencies {
  ipc: IpcMain;
  session: AppCacheSession;
  canClearTemporary(): boolean;
  getSettings(): Settings;
}

export function registerCacheIpc(deps: CacheIpcDependencies): void {
  const service = createAppCacheService({
    session: deps.session,
    canClearTemporary: () => deps.canClearTemporary() && !hasActiveInstallations(),
    software: createManagedSoftwareCache({ getSettings: deps.getSettings, log: message => getApplicationLogger()?.info("cache", "software-cleanup", message) })
  });
  deps.ipc.handle("cache:get", async (): Promise<AppCacheSnapshot> => service.inspect());
  deps.ipc.handle("cache:clear", async (event): Promise<AppCacheClearResult> => service.clear({
    onProgress: (progress) => {
      try {
        event.sender.send("cache:progress", progress);
      } catch {
        // The renderer may close while a large cache cleanup is still running.
      }
    }
  }));
}
