import type { IpcMain } from "electron";
import type {
  CreationDraftSnapshots,
  Draft,
  ImageEditDraft
} from "../src/types.js";
import type { DraftService } from "./services/draft-service.js";

export interface DraftIpcDependencies {
  ipc: IpcMain;
  service: DraftService;
}

export function registerDraftIpc(deps: DraftIpcDependencies): void {
  deps.ipc.handle(
    "draft:save",
    async (_event, draft: Draft, snapshots?: CreationDraftSnapshots) =>
      deps.service.saveDraft(draft, snapshots)
  );
  deps.ipc.handle(
    "image-draft:save",
    async (_event, draft: ImageEditDraft) => deps.service.saveImageDraft(draft)
  );
}
