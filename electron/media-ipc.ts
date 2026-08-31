import { protocol, shell, type IpcMain } from "electron";
import path from "node:path";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { safeLogErrorMessage } from "../src/infrastructure/app-logger.js";
import { copyFileToWindowsClipboard } from "./services/windows-clipboard.js";
import type { MediaReadService } from "./services/media-read-service.js";
import type { StudioPaths } from "./services/studio-paths.js";

export interface MediaIpcDependencies {
  ipc: IpcMain;
  protocol: typeof protocol;
  service: MediaReadService;
  logger: AppLogger;
  paths: Pick<StudioPaths, "clipboardFilesDirectory">;
}

export function registerMediaProtocol(
  deps: Pick<MediaIpcDependencies, "protocol" | "service">
): void {
  deps.protocol.handle("studio-media", (request) => deps.service.handleProtocolRequest({
    url: request.url,
    method: request.method,
    headers: request.headers
  }));
}

export function registerMediaIpc(deps: MediaIpcDependencies): void {
  deps.ipc.handle("file:read-image", async (_event, filename: string) =>
    deps.service.readImage(filename)
  );
  deps.ipc.handle("file:show-in-folder", async (_event, filename: string) => {
    const requestedFilename = typeof filename === "string" ? filename : "";
    const resolved = await deps.service.resolveSourcePath(requestedFilename);
    if (!resolved) {
      deps.logger.warn("history", "show-file-missing", "History file could not be found in its recorded location", {
        filename: requestedFilename
      });
      return false;
    }
    shell.showItemInFolder(resolved);
    deps.logger.info("history", "show-file-succeeded", "History file revealed in Explorer", {
      filename: resolved,
      repairedPath: !requestedFilename || path.resolve(requestedFilename) !== resolved
    });
    return true;
  });
  deps.ipc.handle("file:open-system-player", async (_event, filename: string) => {
    const requestedFilename = typeof filename === "string" ? filename : "";
    const resolved = await deps.service.resolveSourcePath(requestedFilename);
    if (!resolved) {
      deps.logger.warn("history", "open-system-player-missing", "History file could not be found for system player", {
        filename: requestedFilename
      });
      return {
        ok: false,
        message: "视频文件不存在，可能已被移动、重命名或删除。"
      };
    }
    let errorMessage = "";
    try {
      errorMessage = await shell.openPath(resolved);
    } catch (error) {
      deps.logger.warn("history", "open-system-player-failed", "System player could not open history file", {
        filename: resolved,
        error: safeLogErrorMessage(error)
      });
      return {
        ok: false,
        message: "系统播放器无法打开该视频文件。"
      };
    }
    if (errorMessage) {
      deps.logger.warn("history", "open-system-player-failed", "System player could not open history file", {
        filename: resolved,
        error: errorMessage
      });
      return {
        ok: false,
        message: "系统播放器无法打开该视频文件。"
      };
    }
    deps.logger.info("history", "open-system-player-succeeded", "History file opened with the system player", {
      filename: resolved,
      repairedPath: !requestedFilename || path.resolve(requestedFilename) !== resolved
    });
    return {
      ok: true,
      message: "已使用系统播放器打开视频。"
    };
  });
  deps.ipc.handle("file:copy", async (_event, filename: string) => {
    if (process.platform !== "win32") {
      return { ok: false, message: "复制文件目前仅支持 Windows。" };
    }
    const requestedFilename = typeof filename === "string" ? filename : "";
    const resolved = await deps.service.resolveSourcePath(requestedFilename);
    if (!resolved) {
      deps.logger.warn("history", "copy-file-missing", "History file could not be found for clipboard copy", {
        filename: requestedFilename
      });
      return {
        ok: false,
        message: "视频文件不存在，可能已被移动、重命名或删除。"
      };
    }
    try {
      await copyFileToWindowsClipboard(resolved, deps.paths.clipboardFilesDirectory);
      deps.logger.info("history", "copy-file-succeeded", "History file copied to the Windows clipboard", {
        filename: resolved,
        repairedPath: !requestedFilename || path.resolve(requestedFilename) !== resolved
      });
      return {
        ok: true,
        message: requestedFilename && path.resolve(requestedFilename) === resolved
          ? "视频文件已复制，可在资源管理器中粘贴。"
          : "已自动找到视频的实际文件并复制，可在资源管理器中粘贴。"
      };
    } catch (error) {
      deps.logger.warn("history", "copy-file-failed", "Windows clipboard file copy failed", {
        filename: resolved,
        error: safeLogErrorMessage(error)
      });
      return {
        ok: false,
        message: "剪贴板暂时被其他程序占用，请稍后再试。"
      };
    }
  });
}
