import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import type {
  AssetVersion,
  HistoryAsset,
  ImageAssetVersion,
  ImageHistoryProject
} from "../src/types.js";
import type { StateRepository } from "../electron/ports/state-repository.js";
import type { HistoryFileSystemPort } from "../electron/ports/history-file-system.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { HistoryDestructiveService } from "../electron/services/history-destructive-service.js";
import { HistoryMetadataService } from "../electron/services/history-metadata-service.js";
import {
  historyCoverDigest,
  HistoryQueryService
} from "../electron/services/history-query-service.js";
import { nativeHistoryFileSystem } from "../electron/services/native-history-file-system.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-services-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    )
  );
});

function repository(
  initial: ReturnType<typeof createDefaultState>,
  updates?: { count: number }
): StateRepository {
  let state = structuredClone(initial);
  return {
    load: async () => structuredClone(state),
    get: () => structuredClone(state),
    getSettings: () => structuredClone(state.settings),
    update: async (mutator) => {
      if (updates) updates.count += 1;
      mutator(state);
      return structuredClone(state);
    }
  };
}

function logger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as AppLogger;
}

function videoVersion(
  id: string,
  files: HistoryAsset["files"],
  kind: AssetVersion["kind"] = "original"
): AssetVersion {
  return {
    id,
    kind,
    createdAt: `2026-08-${id === "original" ? "20" : "21"}T00:00:00.000Z`,
    outputFilename: files[0]?.filename ?? `${id}.mp4`,
    modelId: "minimax_h3_fl2va",
    width: 640,
    height: 360,
    duration: 2,
    fps: 24,
    workflowPath: "workflow.json",
    comfyPromptId: `prompt-${id}`,
    comfyOutputs: {},
    files
  };
}

function videoAsset(
  id: string,
  versions: AssetVersion[],
  overrides: Partial<HistoryAsset> = {}
): HistoryAsset {
  const current = versions.at(-1) ?? videoVersion("original", []);
  return {
    mediaKind: "video",
    id,
    taskId: `task-${id}`,
    title: id,
    outputFilename: current.outputFilename,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    modelId: "minimax_h3_fl2va",
    favorite: false,
    rating: null,
    tags: [],
    duration: 2,
    resolution: 360,
    fps: 24,
    prompt: "history test",
    seed: 1,
    comfyPromptId: "prompt-asset",
    comfyOutputs: {},
    files: current.files,
    defaultVersionId: current.id,
    versions,
    ...overrides
  };
}

function imageVersion(
  id: string,
  file: ImageAssetVersion["file"],
  kind: ImageAssetVersion["kind"],
  versionNumber: number
): ImageAssetVersion {
  return {
    id,
    versionNumber,
    kind,
    createdAt: `2026-08-${String(19 + versionNumber).padStart(2, "0")}T00:00:00.000Z`,
    modelId: kind === "source" ? "" : "qwen-image",
    workflowPath: kind === "source" ? "" : "workflow.json",
    prompt: kind === "source" ? "" : "edit",
    promptVersion: kind === "source" ? 0 : 1,
    references: [],
    width: 100,
    height: 100,
    format: "png",
    file
  };
}

function imageProject(
  id: string,
  versions: ImageAssetVersion[],
  overrides: Partial<ImageHistoryProject> = {}
): ImageHistoryProject {
  return {
    mediaKind: "image",
    id,
    title: id,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    favorite: false,
    rating: null,
    tags: [],
    coverMode: "auto",
    nextVersionNumber: versions.length + 1,
    versions,
    ...overrides
  };
}

function queryFor(
  store: StateRepository,
  root: string
): HistoryQueryService {
  return new HistoryQueryService({
    store,
    logger: logger(),
    paths: { historyCoverDirectory: path.join(root, "covers") },
    fileSystem: nativeHistoryFileSystem,
    resolveTaskOutputDirectory: async () => store.get().settings.outputDirectory
  });
}

function destructiveFor(
  store: StateRepository,
  query: HistoryQueryService,
  fileSystem: HistoryFileSystemPort = nativeHistoryFileSystem,
  sendState = vi.fn()
): HistoryDestructiveService {
  return new HistoryDestructiveService({
    store,
    logger: logger(),
    sendState,
    fileSystem,
    resolveHistoryFile: (file, settings) => query.resolveHistoryFile(file, settings),
    coverCacheKeysForHistoryItem: (item) => query.coverCacheKeysForHistoryItem(item),
    coverCacheKeyForVideoVersion: (asset, version) =>
      query.coverCacheKeyForVideoVersion(asset, version),
    coverCacheKeyForImageVersion: (project, version) =>
      query.coverCacheKeyForImageVersion(project, version),
    removeCoverCacheKeys: (keys) => query.removeCoverCacheKeys(keys),
    errorMeta: () => ({})
  });
}

describe("History application services", () => {
  it("restores recorded output paths through the query service", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "output");
    const filename = path.join(output, "studio", "result.mp4");
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, "video");
    const state = createDefaultState();
    state.settings.outputDirectory = output;
    const file = { filename: "result.mp4", subfolder: "studio", type: "output" };
    state.history = [videoAsset("asset-1", [videoVersion("original", [file])])];
    const store = repository(state);
    const query = queryFor(store, root);

    await query.restoreHistoryOutputPaths();

    expect(store.get().history[0]?.files[0]?.absolutePath).toBe(filename);
    expect(store.get().history[0]?.versions[0]?.files[0]?.absolutePath).toBe(filename);
  });

  it("skips persistence when history and coupled queue paths are already restored", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "output");
    const filename = path.join(output, "studio", "result.mp4");
    const file = {
      filename: "result.mp4",
      subfolder: "studio",
      type: "output",
      absolutePath: filename
    };
    const state = createDefaultState();
    state.settings.outputDirectory = output;
    state.history = [videoAsset("asset-1", [videoVersion("original", [file])])];
    const updates = { count: 0 };
    const store = repository(state, updates);
    const query = queryFor(store, root);

    await query.restoreHistoryOutputPaths();

    expect(updates.count).toBe(0);
  });

  it("keeps cover cache freshness and atomic save behavior behind the query service", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source.mp4");
    await fs.writeFile(source, "video");
    const state = createDefaultState();
    const store = repository(state);
    const query = queryFor(store, root);
    const key = "history-cover-key";

    await expect(query.saveHistoryCover(key, source, new Uint8Array([1, 2, 3])))
      .resolves.toBe(true);
    const cached = await query.readHistoryCover(key, source);

    expect(cached).toMatch(/^studio-media:\/\/cover\/[a-f0-9]{64}\.jpg\?v=\d+$/u);
    expect(await fs.readdir(path.join(root, "covers"))).toHaveLength(2);
  });

  it("updates curation metadata and image cover selection directly", async () => {
    const state = createDefaultState();
    const image = imageProject("project-1", [
      imageVersion("v1", { filename: "one.png", subfolder: "", type: "output" }, "edit", 1)
    ]);
    state.history = [videoAsset("asset-1", [videoVersion("original", [])])];
    state.imageHistory = [image];
    const store = repository(state);
    const sendState = vi.fn();
    const metadata = new HistoryMetadataService({ store, logger: logger(), sendState });

    await metadata.updateMetadata("asset-1", {
      favorite: true,
      rating: 4.5,
      tags: [" H3 ", "h3", "  test  shot "]
    });
    await metadata.setImageCover("project-1", "v1");

    const next = store.get();
    expect(next.history[0]).toMatchObject({ favorite: true, rating: 4.5, tags: ["H3", "test shot"] });
    expect(next.imageHistory[0]).toMatchObject({ coverMode: "pinned", coverVersionId: "v1" });
    expect(sendState).toHaveBeenCalledTimes(2);
  });

  it("deletes a whole image project while preserving its source and cover cleanup", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "source.png");
    const editPath = path.join(root, "edit.png");
    await fs.writeFile(sourcePath, "source");
    await fs.writeFile(editPath, "edit");
    const sourceFile = { filename: "source.png", subfolder: "", type: "input", absolutePath: sourcePath };
    const editFile = { filename: "edit.png", subfolder: "", type: "output", absolutePath: editPath };
    const project = imageProject("project-1", [
      imageVersion("source", sourceFile, "source", 1),
      imageVersion("edit", editFile, "edit", 2)
    ], { coverMode: "pinned", coverVersionId: "edit" });
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.imageHistory = [project];
    const store = repository(state);
    const query = queryFor(store, root);
    const coverKey = query.coverCacheKeyForImageVersion(project, project.versions[1]!);
    const coverPath = query.coverPathFromDigest(historyCoverDigest(coverKey), ".png");
    await fs.mkdir(path.dirname(coverPath), { recursive: true });
    await fs.writeFile(coverPath, "cover");
    await fs.writeFile(`${path.join(path.dirname(coverPath), historyCoverDigest(coverKey))}.json`, "{}");

    await destructiveFor(store, query).deleteHistory("project-1");

    expect(store.get().imageHistory).toEqual([]);
    await expect(fs.readFile(sourcePath, "utf8")).resolves.toBe("source");
    await expect(fs.stat(editPath)).rejects.toThrow();
    await expect(fs.stat(coverPath)).rejects.toThrow();
  });

  it("does not delete a shared image file when removing one version", async () => {
    const root = await temporaryRoot();
    const sharedPath = path.join(root, "shared.png");
    await fs.writeFile(sharedPath, "shared");
    const sourceFile = { filename: "source.png", subfolder: "", type: "input", absolutePath: path.join(root, "source.png") };
    const sharedFile = { filename: "shared.png", subfolder: "", type: "output", absolutePath: sharedPath };
    const project = imageProject("project-1", [
      imageVersion("source", sourceFile, "source", 1),
      imageVersion("edit-1", sharedFile, "edit", 2),
      imageVersion("edit-2", sharedFile, "edit", 3)
    ], { coverMode: "pinned", coverVersionId: "edit-1" });
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.imageHistory = [project];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteImageVersion("project-1", "edit-1");

    expect(store.get().imageHistory[0]?.versions.map((version) => version.id)).toEqual(["source", "edit-2"]);
    expect(store.get().imageHistory[0]).toMatchObject({ coverMode: "auto", coverVersionId: undefined });
    await expect(fs.readFile(sharedPath, "utf8")).resolves.toBe("shared");
  });

  it("keeps history metadata when a partial file deletion fails", async () => {
    const root = await temporaryRoot();
    const firstPath = path.join(root, "first.mp4");
    const secondPath = path.join(root, "second.mp4");
    await fs.writeFile(firstPath, "first");
    await fs.writeFile(secondPath, "second");
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    const asset = videoAsset("asset-1", [videoVersion("original", [
      { filename: "first.mp4", subfolder: "", type: "output", absolutePath: firstPath },
      { filename: "second.mp4", subfolder: "", type: "output", absolutePath: secondPath }
    ])]);
    state.history = [asset];
    const store = repository(state);
    let unlinkCount = 0;
    const failingFileSystem: HistoryFileSystemPort = {
      ...nativeHistoryFileSystem,
      async unlink(filename) {
        unlinkCount += 1;
        if (unlinkCount === 2) {
          const error = Object.assign(new Error("access denied"), { code: "EACCES" });
          throw error;
        }
        await nativeHistoryFileSystem.unlink(filename);
      }
    };
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query, failingFileSystem).deleteHistory("asset-1"))
      .rejects.toThrow("无法删除视频文件");
    expect(store.get().history).toHaveLength(1);
    await expect(fs.stat(firstPath)).rejects.toThrow();
    await expect(fs.readFile(secondPath, "utf8")).resolves.toBe("second");
  });
});
