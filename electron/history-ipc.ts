import type { IpcMain } from "electron";
import type { HistoryMetadataPatch } from "../src/types.js";
import type { HistoryDestructiveService } from "./services/history-destructive-service.js";
import type { HistoryMetadataService } from "./services/history-metadata-service.js";
import type { HistoryQueryService } from "./services/history-query-service.js";

export interface HistoryIpcDependencies {
  ipc: IpcMain;
  query: HistoryQueryService;
  metadata: HistoryMetadataService;
  destructive: HistoryDestructiveService;
}

export function registerHistoryIpc(deps: HistoryIpcDependencies): void {
  deps.ipc.handle("history-cover:read", async (_event, key: string, sourcePath: string) =>
    deps.query.readHistoryCover(key, sourcePath)
  );
  deps.ipc.handle(
    "history-cover:save",
    async (
      _event,
      key: string,
      sourcePath: string,
      data: ArrayBuffer | Uint8Array
    ) => deps.query.saveHistoryCover(key, sourcePath, data)
  );
  deps.ipc.handle("history:delete", async (_event, assetId: string) =>
    deps.destructive.deleteHistory(assetId)
  );
  deps.ipc.handle(
    "history:update-metadata",
    async (_event, assetId: string, patch: HistoryMetadataPatch) =>
      deps.metadata.updateMetadata(assetId, patch)
  );
  deps.ipc.handle("history:delete-version", async (_event, assetId: string, versionId: string) =>
    deps.destructive.deleteVideoVersion(assetId, versionId)
  );
  deps.ipc.handle("image-history:set-cover", async (_event, projectId: string, versionId?: string) =>
    deps.metadata.setImageCover(projectId, versionId)
  );
  deps.ipc.handle(
    "image-history:delete-version",
    async (_event, projectId: string, versionId: string) =>
      deps.destructive.deleteImageVersion(projectId, versionId)
  );
}
