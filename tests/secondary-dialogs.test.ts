import { describe, expect, it } from "vitest";
import { renderImageAssetLibraryDialog } from "../src/renderer/shell/secondary-dialogs";

describe("secondary dialog markup", () => {
  it("renders a preview target for each cleanable image asset", () => {
    const sourcePath = "C:\\ComfyUI\\input\\LocalVideoStudio\\sources\\sample.png";
    const markup = renderImageAssetLibraryDialog({
      dialog: {
        scan: {
          libraryDirectory: "C:\\ComfyUI\\input\\LocalVideoStudio",
          totalReferences: 1,
          managedReferences: 1,
          archiveCandidates: 0,
          missingReferences: [],
          orphanFiles: [{ absolutePath: sourcePath, relativePath: "sources/sample.png", size: 2048 }],
          archiveBytes: 0,
          orphanBytes: 2048
        },
        busy: false,
        error: "",
        confirmCleanup: false,
        selectedPaths: [sourcePath],
        lastResult: null
      },
      progress: null,
      icon: (name) => `<i data-lucide="${name}"></i>`,
      escapeHtml: (value) => String(value),
      formatAssetBytes: (bytes) => `${bytes} B`,
      t: (key) => key
    });

    expect(markup).toContain('class="asset-library-file-preview"');
    expect(markup).toContain(`data-asset-preview-source="${sourcePath}"`);
    expect(markup).toContain('alt="" aria-hidden="true"');
  });
});
