import type { IpcMain } from "electron";
import type { ImageAssetLibraryOperationResult } from "./services/image-asset-library-service.js";
import type { ImageAssetLibraryScan } from "../src/types.js";

export interface ImageAssetLibraryApplicationPort {
  scan(): Promise<ImageAssetLibraryScan>;
  organize(): Promise<ImageAssetLibraryOperationResult>;
  cleanup(paths: string[]): Promise<ImageAssetLibraryOperationResult>;
}

export interface ImageAssetLibraryIpcDependencies {
  ipc: IpcMain;
  service: ImageAssetLibraryApplicationPort;
}

export function registerImageAssetIpc(deps: ImageAssetLibraryIpcDependencies): void {
  deps.ipc.handle("image-assets:scan", () => deps.service.scan());
  deps.ipc.handle("image-assets:organize", () => deps.service.organize());
  deps.ipc.handle("image-assets:cleanup", (_event, paths: string[]) =>
    deps.service.cleanup(Array.isArray(paths) ? paths : [])
  );
}
