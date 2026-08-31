import type { IpcMain } from "electron";
import type {
  ImageCropSaveRequest,
  ImageMaskSaveRequest,
  ImageMarkupSaveRequest
} from "../src/types.js";
import type { ImageDocumentService } from "./services/image-document-service.js";

export interface ImageDocumentIpcDependencies {
  ipc: IpcMain;
  service: ImageDocumentService;
}

export function registerImageDocumentIpc(deps: ImageDocumentIpcDependencies): void {
  deps.ipc.handle("image-markup:read", async (_event, documentPath: string) =>
    deps.service.readMarkup(documentPath)
  );
  deps.ipc.handle("image-markup:save", async (_event, request: ImageMarkupSaveRequest) =>
    deps.service.saveMarkup(request)
  );
  deps.ipc.handle("image-crop:save", async (_event, request: ImageCropSaveRequest) =>
    deps.service.saveCrop(request)
  );
}

export function registerImageMaskIpc(deps: ImageDocumentIpcDependencies): void {
  deps.ipc.handle("image-mask:save", async (_event, request: ImageMaskSaveRequest) =>
    deps.service.saveMask(request)
  );
}
