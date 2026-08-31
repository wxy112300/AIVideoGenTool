import path from "node:path";

/**
 * Paths owned by the application rather than by Electron's window or runtime
 * shell.  The values are constructed once after Electron resolves userData
 * and then passed to the application handlers that need them.
 */
export interface StudioPaths {
  readonly userDataDirectory: string;
  readonly stateFile: string;
  readonly historyCoverDirectory: string;
  readonly videoHistoryMigrationJournal: string;
  readonly imageGuidesDirectory: string;
  readonly imageMasksDirectory: string;
  readonly imageCropsDirectory: string;
  readonly clipboardInputsDirectory: string;
  readonly clipboardFilesDirectory: string;
}

export function createStudioPaths(userDataDirectory: string): StudioPaths {
  if (typeof userDataDirectory !== "string" || !userDataDirectory.trim()) {
    throw new Error("Studio user data directory is required");
  }

  return Object.freeze({
    userDataDirectory,
    stateFile: path.join(userDataDirectory, "studio-state.json"),
    historyCoverDirectory: path.join(userDataDirectory, "history-covers", "v3"),
    videoHistoryMigrationJournal: path.join(userDataDirectory, "video-history-migration.json"),
    imageGuidesDirectory: path.join(userDataDirectory, "image-guides"),
    imageMasksDirectory: path.join(userDataDirectory, "image-masks"),
    imageCropsDirectory: path.join(userDataDirectory, "image-crops"),
    clipboardInputsDirectory: path.join(userDataDirectory, "clipboard-inputs"),
    clipboardFilesDirectory: path.join(userDataDirectory, "clipboard-files")
  });
}
