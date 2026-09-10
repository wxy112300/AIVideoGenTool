import type { IpcMain } from "electron";
import type { AppCacheClearResult, AppCacheSnapshot } from "../src/types.js";
import {
  createAppCacheService,
  type AppCacheSession
} from "./services/cache-service.js";

export interface CacheIpcDependencies {
  ipc: IpcMain;
  session: AppCacheSession;
  canClearTemporary(): boolean;
}

export function registerCacheIpc(deps: CacheIpcDependencies): void {
  const service = createAppCacheService({
    session: deps.session,
    canClearTemporary: deps.canClearTemporary
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
