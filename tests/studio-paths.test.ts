import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStudioPaths } from "../electron/services/studio-paths.js";

describe("StudioPaths", () => {
  it("keeps application-owned paths under the Electron userData directory", () => {
    const userDataDirectory = "C:\\Users\\Test User\\AppData\\Roaming\\Local Video Studio";
    const paths = createStudioPaths(userDataDirectory);

    expect(paths).toEqual({
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
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it("does not silently accept a missing userData directory", () => {
    expect(() => createStudioPaths(" ")).toThrowError("Studio user data directory is required");
  });
});
