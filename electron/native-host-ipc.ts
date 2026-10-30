import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { safeLogErrorMessage, type AppLogger } from "../src/infrastructure/app-logger.js";
import type { StudioPaths } from "./services/studio-paths.js";
import type { UiLocale } from "../src/types.js";
import { uiKeys } from "../src/core/i18n-keys.js";
import { createNativeTranslator } from "./ui-translator.js";

type NativeFileSystem = Pick<typeof nodeFs, "mkdir" | "stat" | "writeFile">;
type NativeDialog = Pick<Electron.Dialog, "showOpenDialog">;
type NativeShell = Pick<Electron.Shell, "openPath" | "openExternal">;

export interface NativeHostIpcDependencies {
  ipc: IpcMain;
  dialog: NativeDialog;
  shell: NativeShell;
  fileSystem: NativeFileSystem;
  logger: Pick<AppLogger, "directory" | "info" | "warn">;
  paths: Pick<StudioPaths, "clipboardInputsDirectory">;
  getCrashDumpsDirectory: () => string;
  getUiLocale?: () => UiLocale | undefined;
}

export function registerNativeHostIpc(deps: NativeHostIpcDependencies): void {
  const t: ReturnType<typeof createNativeTranslator>["t"] = (...args) =>
    createNativeTranslator(deps.getUiLocale?.()).t(...args);
  deps.ipc.handle("file:pick-image", async () => {
    const result = await deps.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: t(uiKeys.nativeDialog.images), extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:pick-video", async () => {
    const result = await deps.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: t(uiKeys.nativeDialog.videos), extensions: ["mp4", "webm", "mov", "m4v", "mkv"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:pick-h3-native-av", async () => {
    const result = await deps.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "H3 Native AV", extensions: ["safetensors"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:pick-workflow", async () => {
    const result = await deps.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: t(uiKeys.nativeDialog.workflow), extensions: ["json"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:pick-python", async () => {
    const result = await deps.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: t(uiKeys.nativeDialog.python), extensions: ["exe"] }]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:pick-directory", async (_event, defaultPath?: string, createIfMissing = false) => {
    const candidate = typeof defaultPath === "string" ? defaultPath.trim() : "";
    const candidatePath = candidate ? path.resolve(candidate) : "";
    if (createIfMissing && candidatePath) {
      await deps.fileSystem.mkdir(candidatePath, { recursive: true }).catch(() => undefined);
    }
    const candidateStat = candidatePath ? await deps.fileSystem.stat(candidatePath).catch(() => null) : null;
    const result = await deps.dialog.showOpenDialog({
      defaultPath: candidateStat?.isDirectory() ? candidatePath : undefined,
      properties: ["openDirectory"]
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  deps.ipc.handle("file:open-directory", async (_event, directory: string) => {
    const requestedDirectory = typeof directory === "string" ? directory.trim() : "";
    if (!requestedDirectory) return false;
    const directoryPath = path.resolve(requestedDirectory);
    try {
      await deps.fileSystem.mkdir(directoryPath, { recursive: true });
      const directoryStat = await deps.fileSystem.stat(directoryPath);
      if (!directoryStat.isDirectory()) return false;
      const errorMessage = await deps.shell.openPath(directoryPath);
      if (errorMessage) {
        deps.logger.warn("settings", "open-model-directory-failed", "Model directory could not be opened", {
          directory: directoryPath,
          error: errorMessage
        });
        return false;
      }
      deps.logger.info("settings", "open-model-directory-succeeded", "Model directory opened", {
        directory: directoryPath
      });
      return true;
    } catch (error) {
      deps.logger.warn("settings", "open-model-directory-failed", "Model directory could not be opened", {
        directory: directoryPath,
        error: safeLogErrorMessage(error)
      });
      return false;
    }
  });
  deps.ipc.handle(
    "file:save-clipboard-image",
    async (_event, data: ArrayBuffer, mimeType: string) => {
      const extensions: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/bmp": ".bmp"
      };
      const extension = extensions[mimeType.toLowerCase()];
      if (!extension) throw new Error(t(uiKeys.mediaAction.clipboardFormat));
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
        throw new Error(t(uiKeys.mediaAction.clipboardEmpty));
      }
      if (data.byteLength > 50 * 1024 * 1024) {
        throw new Error(t(uiKeys.mediaAction.clipboardTooLarge));
      }
      const directory = deps.paths.clipboardInputsDirectory;
      await deps.fileSystem.mkdir(directory, { recursive: true });
      const filename = path.join(
        directory,
        `clipboard-${Date.now()}-${randomUUID()}${extension}`
      );
      await deps.fileSystem.writeFile(filename, new Uint8Array(data));
      return filename;
    }
  );
  deps.ipc.handle("shell:open-external", async (_event, value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      await deps.shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });
  deps.ipc.handle(
    "logs:open-directory",
    async (_event, kind: "logs" | "crashDumps") => {
      const directory = kind === "logs"
        ? deps.logger.directory
        : deps.getCrashDumpsDirectory();
      const error = await deps.shell.openPath(directory);
      return !error;
    }
  );
}
