import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  archiveImagePaths,
  cleanupImageAssetLibrary,
  isPathInsideImageLibrary,
  organizeImageAssetLibrary,
  scanImageAssetLibrary
} from "../src/infrastructure/image-asset-library.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-assets-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("image asset library", () => {
  it("archives video draft and video history input images while leaving video slots untouched", async () => {
    const root = await temporaryRoot();
    const external = path.join(root, "external");
    const library = path.join(root, "input", "LocalVideoStudio");
    const firstFrame = path.join(external, "first.png");
    const lastFrame = path.join(external, "last.png");
    const referenceImage = path.join(external, "reference.jpg");
    const referenceVideo = path.join(external, "reference.mp4");
    await fs.mkdir(external, { recursive: true });
    await fs.writeFile(firstFrame, "first-frame");
    await fs.writeFile(lastFrame, "last-frame");
    await fs.writeFile(referenceImage, "reference-image");
    await fs.writeFile(referenceVideo, "reference-video");

    const state = createDefaultState();
    state.draft.startImagePath = firstFrame;
    state.history = [{
      mediaKind: "video",
      id: "video-history-1",
      taskId: "video-task-1",
      title: "Video history",
      outputFilename: "video.mp4",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      modelId: "minimax_h3_ref2va",
      duration: 5,
      resolution: 720,
      fps: 24,
      prompt: "test",
      seed: 42,
      inputMode: "image",
      startImagePath: firstFrame,
      endImagePath: lastFrame,
      h3ReferenceSlots: [
        { id: "image-slot", mediaType: "image", mediaPath: referenceImage, role: "subject", note: "" },
        { id: "video-slot", mediaType: "video", mediaPath: referenceVideo, role: "motion", note: "" }
      ],
      comfyPromptId: "prompt-1",
      comfyOutputs: {},
      files: [],
      versions: []
    }];

    const before = await scanImageAssetLibrary(state, library);
    expect(before.totalReferences).toBe(3);
    expect(before.archiveCandidates).toBe(3);

    const prepared = await organizeImageAssetLibrary(state, library);
    const history = prepared.state.history[0]!;
    expect(prepared.result.archivedFiles).toBe(3);
    expect(prepared.result.updatedReferences).toBe(4);
    expect(prepared.state.draft.startImagePath).toBe(history.startImagePath);
    expect(history.startImagePath).toMatch(/[\\/]sources[\\/][a-f0-9]{64}\.png$/u);
    expect(history.endImagePath).toMatch(/[\\/]sources[\\/][a-f0-9]{64}\.png$/u);
    expect(history.h3ReferenceSlots?.[0]?.mediaPath).toMatch(/[\\/]sources[\\/][a-f0-9]{64}\.jpg$/u);
    expect(history.h3ReferenceSlots?.[1]?.mediaPath).toBe(referenceVideo);
    await expect(fs.readFile(firstFrame, "utf8")).resolves.toBe("first-frame");
  });

  it("archives duplicate path inputs once and returns a replacement for each reference", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "external", "shared.png");
    const library = path.join(root, "input", "LocalVideoStudio");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, "shared-image");

    const archived = await archiveImagePaths([source, source], library);
    expect(archived).toHaveLength(2);
    expect(archived[0]).toBe(archived[1]);
    await expect(fs.readFile(archived[0]!, "utf8")).resolves.toBe("shared-image");
  });

  it("archives references by content hash and rewrites duplicate references", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "external", "source.png");
    const library = path.join(root, "input", "LocalVideoStudio");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, Buffer.from("same-image"));
    const state = createDefaultState();
    state.imageDraft.pictures = [1, 2].map((pictureNumber) => ({
      id: `picture-${pictureNumber}`,
      pictureNumber,
      absolutePath: source,
      width: 100,
      height: 100
    }));

    const prepared = await organizeImageAssetLibrary(state, library);
    const [first, second] = prepared.state.imageDraft.pictures;
    expect(prepared.result.archivedFiles).toBe(1);
    expect(prepared.result.updatedReferences).toBe(2);
    expect(first?.absolutePath).toBe(second?.absolutePath);
    expect(first?.originalPath).toBe(source);
    expect(first?.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first?.managedRelativePath).toMatch(/^sources\/[a-f0-9]{64}\.png$/u);
    await expect(fs.readFile(first!.absolutePath, "utf8")).resolves.toBe("same-image");
    await expect(fs.readFile(source, "utf8")).resolves.toBe("same-image");
  });

  it("flattens legacy hash-prefix folders and removes them after confirmed cleanup", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "input", "LocalVideoStudio");
    const contents = Buffer.from("legacy-image");
    const hash = createHash("sha256").update(contents).digest("hex");
    const legacy = path.join(library, "sources", hash.slice(0, 2), `${hash}.png`);
    await fs.mkdir(path.dirname(legacy), { recursive: true });
    await fs.writeFile(legacy, contents);
    const state = createDefaultState();
    state.imageDraft.pictures = [{
      id: "legacy-picture",
      pictureNumber: 1,
      absolutePath: legacy,
      width: 100,
      height: 100
    }];

    const before = await scanImageAssetLibrary(state, library);
    expect(before.archiveCandidates).toBe(1);
    const prepared = await organizeImageAssetLibrary(state, library);
    const flattened = path.join(library, "sources", `${hash}.png`);
    expect(prepared.result.reorganizedFiles).toBe(1);
    expect(prepared.state.imageDraft.pictures[0]?.absolutePath).toBe(flattened);
    await expect(fs.readFile(flattened)).resolves.toEqual(contents);
    await expect(fs.readFile(legacy)).resolves.toEqual(contents);

    const cleanup = await cleanupImageAssetLibrary(prepared.state, library, [legacy]);
    expect(cleanup.cleanedFiles).toBe(1);
    expect(cleanup.cleanedDirectories).toBe(1);
    await expect(fs.stat(path.dirname(legacy))).rejects.toThrow();
  });

  it("only deletes revalidated orphan files inside the managed library", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "input", "LocalVideoStudio");
    const orphan = path.join(library, "sources", "aa", "orphan.png");
    const outside = path.join(root, "outside.png");
    await fs.mkdir(path.dirname(orphan), { recursive: true });
    await fs.writeFile(orphan, "orphan");
    await fs.writeFile(outside, "outside");
    const state = createDefaultState();

    const scan = await scanImageAssetLibrary(state, library);
    expect(scan.orphanFiles.map((file) => file.absolutePath)).toContain(orphan);
    const result = await cleanupImageAssetLibrary(state, library, [orphan, outside]);
    expect(result.cleanedFiles).toBe(1);
    await expect(fs.stat(orphan)).rejects.toThrow();
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("outside");
    expect(isPathInsideImageLibrary(library, outside)).toBe(false);
  });

  it("protects and organizes images referenced only by saved creation drafts", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "library");
    await fs.mkdir(library);
    const imageSource = path.join(library, "saved-image.png");
    const extensionSource = path.join(library, "saved-extension.png");
    const orphan = path.join(library, "unused.png");
    for (const filename of [imageSource, extensionSource, orphan]) await fs.writeFile(filename, path.basename(filename));
    const state = createDefaultState();
    state.imageToVideoDraft = { ...structuredClone(state.draft), startImagePath: imageSource };
    state.videoExtensionDraft = { ...structuredClone(state.draft), endImagePath: extensionSource };

    const scan = await scanImageAssetLibrary(state, library);
    expect(scan.orphanFiles.map(file => file.absolutePath)).toEqual([orphan]);
    const cleaned = await cleanupImageAssetLibrary(state, library, [imageSource, extensionSource, orphan]);
    expect(cleaned.cleanedFiles).toBe(1);
    await expect(fs.readFile(imageSource, "utf8")).resolves.toBe("saved-image.png");
    await expect(fs.readFile(extensionSource, "utf8")).resolves.toBe("saved-extension.png");

    const organized = await organizeImageAssetLibrary(state, library);
    expect(organized.state.imageToVideoDraft!.startImagePath).not.toBe(imageSource);
    expect(organized.state.videoExtensionDraft!.endImagePath).not.toBe(extensionSource);
    await expect(fs.readFile(organized.state.imageToVideoDraft!.startImagePath, "utf8")).resolves.toBe("saved-image.png");
    await expect(fs.readFile(organized.state.videoExtensionDraft!.endImagePath, "utf8")).resolves.toBe("saved-extension.png");
    expect(organized.state.draft.startImagePath).toBe(state.draft.startImagePath);
    expect(organized.state.draft.endImagePath).toBe(state.draft.endImagePath);
  });

  it("preserves an orphan that gains a draft reference after the scan", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "input", "LocalVideoStudio");
    const newlyReferenced = path.join(library, "sources", "aa", "still-used.png");
    const orphan = path.join(library, "sources", "bb", "orphan.png");
    await fs.mkdir(path.dirname(newlyReferenced), { recursive: true });
    await fs.mkdir(path.dirname(orphan), { recursive: true });
    await fs.writeFile(newlyReferenced, "now referenced");
    await fs.writeFile(orphan, "still orphaned");
    const state = createDefaultState();

    const staleScan = await scanImageAssetLibrary(state, library);
    expect(staleScan.orphanFiles.map((file) => file.absolutePath)).toEqual(
      expect.arrayContaining([newlyReferenced, orphan])
    );

    state.imageDraft.pictures = [{
      id: "new-library-reference",
      pictureNumber: 1,
      absolutePath: newlyReferenced,
      width: 64,
      height: 64
    }];
    const result = await cleanupImageAssetLibrary(state, library, [newlyReferenced, orphan]);

    expect(result.cleanedFiles).toBe(1);
    await expect(fs.readFile(newlyReferenced, "utf8")).resolves.toBe("now referenced");
    await expect(fs.stat(orphan)).rejects.toThrow();
    expect(result.scan.orphanFiles.map((file) => file.absolutePath)).not.toContain(newlyReferenced);
  });
});
