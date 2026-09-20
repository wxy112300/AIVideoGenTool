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
import { HistoryArtifactService } from "../electron/services/history-artifact-service.js";
import type { NativeAvArtifactService } from "../electron/services/native-av-artifact.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-services-"));
  temporaryRoots.push(root);
  return root;
}

function motionContextPayload(
  options: { format?: string; audioTime?: number } = {}
): Buffer {
  const videoShape = [1, 24, 2, 30, 54];
  const audioShape = [1, 32, 2, options.audioTime ?? 8];
  const videoBytes = videoShape.reduce((total, value) => total * value, 1) * 2;
  const audioBytes = audioShape.reduce((total, value) => total * value, 1) * 2;
  const header = Buffer.from(JSON.stringify({
    __metadata__: { format: options.format ?? "h3_motion_context_av_v1" },
    audio: { dtype: "BF16", shape: audioShape, data_offsets: [videoBytes, videoBytes + audioBytes] },
    video: { dtype: "F16", shape: videoShape, data_offsets: [0, videoBytes] }
  }), "utf8");
  const payload = Buffer.alloc(8 + header.byteLength + videoBytes + audioBytes);
  payload.writeBigUInt64LE(BigInt(header.byteLength), 0);
  header.copy(payload, 8);
  return payload;
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
  it("checks old AV on disk before submission without mutating history", async () => {
    const root = await temporaryRoot();
    const sourceVideoPath = path.join(root, "source.mp4");
    await fs.writeFile(sourceVideoPath, "video");
    const state = createDefaultState();
    const updates = { count: 0 };
    const inspectPath = vi.fn(async () => ({ status: "missing", reason: "payload missing" }));
    const service = new HistoryArtifactService({
      store: repository(state, updates),
      artifactService: { inspectPath } as unknown as NativeAvArtifactService,
      resolveVideoOutputDirectory: async () => root
    });
    const result = await service.inspectExtensionSource({
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_continuum",
      sourceVideoPath,
      h3ContinuumMode: "managed",
      h3ContinuumArtifactPath: path.join(root, "old.safetensors")
    });
    expect(result).toMatchObject({ route: "bootstrap", status: "missing", reason: "payload missing" });
    expect(inspectPath).toHaveBeenCalledOnce();
    expect(updates.count).toBe(0);
    expect(await service.inspectExtensionSource({
      ...state.draft, modelId: "minimax_h3_continuum", sourceVideoPath, h3ContinuumMode: "managed"
    })).toMatchObject({ route: "managed", status: "missing" });
  });

  it("preflights a Motion Context latent through its real v1 video/audio schema", async () => {
    const root = await temporaryRoot();
    const sourceVideoPath = path.join(root, "source.mp4");
    const latentPath = path.join(root, "h3-motion-context", "clip_00001.safetensors");
    await fs.mkdir(path.dirname(latentPath), { recursive: true });
    await fs.writeFile(sourceVideoPath, "video");
    await fs.writeFile(latentPath, motionContextPayload());
    const state = createDefaultState();
    const service = new HistoryArtifactService({
      store: repository(state),
      artifactService: {} as NativeAvArtifactService,
      resolveVideoOutputDirectory: async () => root
    });

    const result = await service.inspectExtensionSource({
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath,
      sourceVideoDuration: 5,
      sourceWidth: 864,
      sourceHeight: 480,
      resolution: 480,
      h3ContextLatentPath: latentPath
    });

    expect(result).toMatchObject({
      route: "motion-context",
      status: "available",
      payloadPath: latentPath,
      motionContext: {
        format: "h3_motion_context_av_v1",
        videoShape: [1, 24, 2, 30, 54],
        audioShape: [1, 32, 2, 8],
        frameCount: 5,
        contextFrames: 22
      }
    });
  });

  it("rejects a Motion Context latent with an invalid audio/video contract", async () => {
    const root = await temporaryRoot();
    const sourceVideoPath = path.join(root, "source.mp4");
    const latentPath = path.join(root, "h3-motion-context", "invalid.safetensors");
    await fs.mkdir(path.dirname(latentPath), { recursive: true });
    await fs.writeFile(sourceVideoPath, "video");
    await fs.writeFile(latentPath, motionContextPayload({ audioTime: 9 }));
    const state = createDefaultState();
    const service = new HistoryArtifactService({
      store: repository(state),
      artifactService: {} as NativeAvArtifactService,
      resolveVideoOutputDirectory: async () => root
    });

    const result = await service.inspectExtensionSource({
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_ref2va",
      sourceVideoPath,
      sourceVideoDuration: 5,
      sourceWidth: 864,
      sourceHeight: 480,
      resolution: 480,
      h3ContextLatentPath: latentPath
    });

    expect(result).toMatchObject({ route: "motion-context", status: "invalid" });
    expect(result.reason).toContain("audio shape");
  });

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

  it("drops transient Konohamaru previews when restoring durable history files", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "output");
    const filename = path.join(output, "Videos", "result.mp4");
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, "video");
    const temporary = {
      filename: "temporary.mp4",
      subfolder: "dlss5-video-output-abc",
      type: "temp",
      absolutePath: path.join(root, "temp", "temporary.mp4")
    };
    const durable = {
      filename: "result.mp4",
      subfolder: "Videos",
      type: "output"
    };
    const state = createDefaultState();
    state.settings.outputDirectory = output;
    const version = {
      ...videoVersion("original", [temporary, durable]),
      comfyOutputs: {
        outputs: {
          "2": { images: [temporary] },
          "3": { images: [durable] }
        }
      }
    };
    state.history = [videoAsset("asset-1", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await query.restoreHistoryOutputPaths();

    expect(store.get().history[0]?.versions[0]?.files).toEqual([{
      ...durable,
      absolutePath: filename
    }]);
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

  it("returns a source revision and rejects a save after the source changes", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source.mp4");
    await fs.writeFile(source, "video");
    const store = repository(createDefaultState());
    const query = queryFor(store, root);
    const key = "history-cover-revision-key";

    const initial = await query.lookupHistoryCover(key, source);
    expect(initial.state).toBe("miss");
    if (initial.state !== "miss") return;

    await expect(query.saveHistoryCoverIfCurrent({
      key,
      sourcePath: source,
      sourceRevision: initial.sourceRevision,
      data: new Uint8Array([1, 2, 3]).buffer
    })).resolves.toMatchObject({ state: "saved" });

    await fs.writeFile(source, "video-updated");
    await expect(query.saveHistoryCoverIfCurrent({
      key,
      sourcePath: source,
      sourceRevision: initial.sourceRevision,
      data: new Uint8Array([4, 5, 6]).buffer
    })).resolves.toEqual({ state: "stale" });
    await expect(query.readHistoryCover(key, source)).resolves.toBeNull();
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

  it("deletes a committed JointAV pair with its video history record", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "result.mp4");
    const manifestPath = path.join(artifactDirectory, "h3av_artifact-001.json");
    const payloadPath = path.join(artifactDirectory, "h3av_artifact-001.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "result.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: {
          filename: "h3av_artifact-001.json",
          subfolder: "h3-native-av",
          type: "output",
          absolutePath: manifestPath
        },
        payload: {
          filename: "h3av_artifact-001.safetensors",
          subfolder: "h3-native-av",
          type: "output",
          absolutePath: payloadPath
        }
      }
    } as AssetVersion["h3ContinuationData"];
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteHistory("asset-1");

    expect(store.get().history).toEqual([]);
    await expect(fs.stat(videoPath)).rejects.toThrow();
    await expect(fs.stat(manifestPath)).rejects.toThrow();
    await expect(fs.stat(payloadPath)).rejects.toThrow();
  });

  it("uses the resolver for whole History auxiliary files outside the configured output root", async () => {
    const root = await temporaryRoot();
    const configuredOutput = path.join(root, "configured-output");
    const resolvedOutput = path.join(root, "resolved-output");
    const videoPath = path.join(resolvedOutput, "result.mp4");
    const artifactDirectory = path.join(resolvedOutput, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "resolved.json");
    const payloadPath = path.join(artifactDirectory, "resolved.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "result.mp4",
      subfolder: "",
      type: "output"
    }]);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: { filename: "resolved.json", subfolder: "h3-native-av", type: "output" },
        payload: { filename: "resolved.safetensors", subfolder: "h3-native-av", type: "output" }
      }
    } as AssetVersion["h3ContinuationData"];
    const state = createDefaultState();
    state.settings.outputDirectory = configuredOutput;
    state.history = [videoAsset("asset-resolver-delete", [version])];
    const store = repository(state);
    const query = queryFor(store, root);
    vi.spyOn(query, "resolveHistoryFile").mockImplementation(async (file) => {
      const candidate = path.join(resolvedOutput, file.subfolder, file.filename);
      return (await fs.stat(candidate).catch(() => undefined))?.isFile() ? candidate : null;
    });

    await destructiveFor(store, query).deleteHistory("asset-resolver-delete");

    expect(store.get().history).toEqual([]);
    await expect(fs.stat(videoPath)).rejects.toThrow();
    await expect(fs.stat(manifestPath)).rejects.toThrow();
    await expect(fs.stat(payloadPath)).rejects.toThrow();
  });

  it("deletes only the selected video version's committed JointAV pair", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const originalVideoPath = path.join(root, "original.mp4");
    const upscaleVideoPath = path.join(root, "upscale.mp4");
    const manifestPath = path.join(artifactDirectory, "h3av_artifact-002.json");
    const payloadPath = path.join(artifactDirectory, "h3av_artifact-002.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(originalVideoPath, "original"),
      fs.writeFile(upscaleVideoPath, "upscale"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const original = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: originalVideoPath
    }]);
    original.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: {
          filename: "h3av_artifact-002.json",
          subfolder: "h3-native-av",
          type: "output",
          absolutePath: manifestPath
        },
        payload: {
          filename: "h3av_artifact-002.safetensors",
          subfolder: "h3-native-av",
          type: "output",
          absolutePath: payloadPath
        }
      }
    } as AssetVersion["h3ContinuationData"];
    const upscale = videoVersion("upscale", [{
      filename: "upscale.mp4",
      subfolder: "",
      type: "output",
      absolutePath: upscaleVideoPath
    }], "upscale");
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [original, upscale])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteVideoVersion("asset-1", "original");

    expect(store.get().history[0]?.versions.map((version) => version.id)).toEqual(["upscale"]);
    await expect(fs.stat(originalVideoPath)).rejects.toThrow();
    await expect(fs.stat(manifestPath)).rejects.toThrow();
    await expect(fs.stat(payloadPath)).rejects.toThrow();
    await expect(fs.readFile(upscaleVideoPath, "utf8")).resolves.toBe("upscale");
  });

  it("resolves a stale recorded video path before deleting a version", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "output");
    const videosDirectory = path.join(output, "Videos");
    const currentVideoPath = path.join(videosDirectory, "original.mp4");
    const upscaleVideoPath = path.join(videosDirectory, "upscale.mp4");
    await fs.mkdir(videosDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(currentVideoPath, "original"),
      fs.writeFile(upscaleVideoPath, "upscale")
    ]);
    const original = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "Videos",
      type: "output",
      absolutePath: path.join(root, "old-output", "Videos", "original.mp4")
    }]);
    const upscale = videoVersion("upscale", [{
      filename: "upscale.mp4",
      subfolder: "Videos",
      type: "output",
      absolutePath: upscaleVideoPath
    }], "upscale");
    const state = createDefaultState();
    state.settings.outputDirectory = output;
    state.history = [videoAsset("asset-1", [original, upscale])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteVideoVersion("asset-1", "original");

    expect(store.get().history[0]?.versions.map((version) => version.id)).toEqual(["upscale"]);
    await expect(fs.stat(currentVideoPath)).rejects.toThrow();
    await expect(fs.readFile(upscaleVideoPath, "utf8")).resolves.toBe("upscale");
  });

  it("refuses version deletion while an extension draft still uses its video", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "output");
    const videosDirectory = path.join(output, "Videos");
    const currentVideoPath = path.join(videosDirectory, "original.mp4");
    const upscaleVideoPath = path.join(videosDirectory, "upscale.mp4");
    await fs.mkdir(videosDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(currentVideoPath, "original"),
      fs.writeFile(upscaleVideoPath, "upscale")
    ]);
    const original = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "Videos",
      type: "output",
      absolutePath: currentVideoPath
    }]);
    const upscale = videoVersion("upscale", [{
      filename: "upscale.mp4",
      subfolder: "Videos",
      type: "output",
      absolutePath: upscaleVideoPath
    }], "upscale");
    const state = createDefaultState();
    state.settings.outputDirectory = output;
    state.history = [videoAsset("asset-1", [original, upscale])];
    state.videoExtensionDraft = {
      ...state.draft,
      inputMode: "video",
      sourceVideoPath: currentVideoPath
    };
    const store = repository(state);
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query).deleteVideoVersion("asset-1", "original"))
      .rejects.toThrow("仍被其他版本、队列或草稿引用");
    await expect(fs.readFile(currentVideoPath, "utf8")).resolves.toBe("original");
    expect(store.get().history[0]?.versions.map((version) => version.id)).toEqual(["original", "upscale"]);
  });

  it("deletes JointAV without deleting the version video", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "original.mp4");
    const manifestPath = path.join(artifactDirectory, "h3av-delete.json");
    const payloadPath = path.join(artifactDirectory, "h3av-delete.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: { filename: "h3av-delete.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
        payload: { filename: "h3av-delete.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
      }
    } as AssetVersion["h3ContinuationData"];
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteJointAv("asset-1", "original");

    await expect(fs.readFile(videoPath, "utf8")).resolves.toBe("video");
    await expect(fs.stat(manifestPath)).rejects.toThrow();
    await expect(fs.stat(payloadPath)).rejects.toThrow();
    expect(store.get().history[0]?.versions[0]?.h3ContinuationData).toMatchObject({
      status: "missing"
    });
  });

  it("downgrades availability when JointAV deletion removes only part of the pair", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "original.mp4");
    const manifestPath = path.join(artifactDirectory, "h3av-partial.json");
    const payloadPath = path.join(artifactDirectory, "h3av-partial.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: { filename: "h3av-partial.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
        payload: { filename: "h3av-partial.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
      }
    } as AssetVersion["h3ContinuationData"];
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-partial", [version])];
    const store = repository(state);
    const query = queryFor(store, root);
    let unlinkCount = 0;
    const partialFileSystem: HistoryFileSystemPort = {
      ...nativeHistoryFileSystem,
      async unlink(filename) {
        unlinkCount += 1;
        if (unlinkCount === 2) {
          throw Object.assign(new Error("access denied"), { code: "EACCES" });
        }
        await nativeHistoryFileSystem.unlink(filename);
      }
    };

    await expect(destructiveFor(store, query, partialFileSystem).deleteJointAv("asset-partial", "original"))
      .rejects.toThrow("无法删除JointAV 文件");
    expect(store.get().history[0]?.versions[0]?.h3ContinuationData).toMatchObject({
      status: "invalid",
      reason: expect.stringContaining("删除不完整")
    });
    expect(store.get().history[0]?.versions[0]?.h3AvAsset).toBeUndefined();
    await expect(fs.readFile(videoPath, "utf8")).resolves.toBe("video");
    await expect(fs.stat(payloadPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("downgrades availability when a missing manifest is followed by a blocked payload", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "original.mp4");
    const payloadPath = path.join(artifactDirectory, "h3av-missing-manifest.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: { filename: "h3av-missing-manifest.json", subfolder: "h3-native-av", type: "output", absolutePath: path.join(artifactDirectory, "h3av-missing-manifest.json") },
        payload: { filename: "h3av-missing-manifest.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
      }
    } as AssetVersion["h3ContinuationData"];
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-missing-manifest", [version])];
    const store = repository(state);
    const query = queryFor(store, root);
    const failingFileSystem: HistoryFileSystemPort = {
      ...nativeHistoryFileSystem,
      async unlink(filename) {
        if (filename === payloadPath) {
          throw Object.assign(new Error("access denied"), { code: "EACCES" });
        }
        await nativeHistoryFileSystem.unlink(filename);
      }
    };

    await expect(destructiveFor(store, query, failingFileSystem).deleteJointAv("asset-missing-manifest", "original"))
      .rejects.toThrow("无法删除JointAV 文件");
    expect(store.get().history[0]?.versions[0]?.h3ContinuationData).toMatchObject({
      status: "invalid",
      reason: expect.stringContaining("删除不完整")
    });
    await expect(fs.readFile(videoPath, "utf8")).resolves.toBe("video");
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
  });

  it("keeps artifact and asset identity when both JointAV files are missing", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-both-missing.json");
    const payloadPath = path.join(artifactDirectory, "h3av-both-missing.safetensors");
    const version = videoVersion("original", []);
    const artifact = {
      manifest: { filename: "h3av-both-missing.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-both-missing.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    version.h3ContinuationData = { status: "available", artifact };
    version.h3AvAsset = { assetId: "missing-joint-av-asset", ownerPath: artifact.payload } as never;
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-both-missing", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query).deleteJointAv("asset-both-missing", "original"))
      .rejects.toThrow("无法完成安全删除");
    const retainedVersion = store.get().history[0]?.versions[0];
    expect(retainedVersion?.h3ContinuationData).toMatchObject({
      status: "invalid",
      artifact: { payload: { absolutePath: payloadPath } }
    });
    expect(retainedVersion?.h3AvAsset?.assetId).toBe("missing-joint-av-asset");
  });

  it("keeps a whole History record invalid and inspectable after unresolved auxiliary deletion", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "original.mp4");
    const payloadPath = path.join(artifactDirectory, "h3av-history-partial.safetensors");
    const manifestPath = path.join(artifactDirectory, "h3av-history-partial.json");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    const artifact = {
      manifest: { filename: "h3av-history-partial.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-history-partial.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    version.h3ContinuationData = { status: "available", artifact };
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-history-partial", [version])];
    const store = repository(state);
    const failingFileSystem: HistoryFileSystemPort = {
      ...nativeHistoryFileSystem,
      async unlink(filename) {
        if (filename === payloadPath) {
          throw Object.assign(new Error("access denied"), { code: "EACCES" });
        }
        await nativeHistoryFileSystem.unlink(filename);
      }
    };
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query, failingFileSystem).deleteHistory("asset-history-partial"))
      .rejects.toThrow("无法删除视频文件");
    const retainedVersion = store.get().history[0]?.versions[0];
    expect(retainedVersion?.h3ContinuationData).toMatchObject({
      status: "invalid",
      artifact: { payload: { absolutePath: payloadPath } }
    });
    await expect(fs.stat(videoPath)).rejects.toThrow();
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
  });

  it("keeps a selected video version invalid and inspectable after partial auxiliary deletion", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "original.mp4");
    const otherVideoPath = path.join(root, "other.mp4");
    const payloadPath = path.join(artifactDirectory, "h3av-version-partial.safetensors");
    const manifestPath = path.join(artifactDirectory, "h3av-version-partial.json");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(otherVideoPath, "other"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const target = videoVersion("original", [{
      filename: "original.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    const artifact = {
      manifest: { filename: "h3av-version-partial.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-version-partial.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    target.h3ContinuationData = { status: "available", artifact };
    const other = videoVersion("other", [{
      filename: "other.mp4",
      subfolder: "",
      type: "output",
      absolutePath: otherVideoPath
    }], "upscale");
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-version-partial", [target, other])];
    const store = repository(state);
    const failingFileSystem: HistoryFileSystemPort = {
      ...nativeHistoryFileSystem,
      async unlink(filename) {
        if (filename === payloadPath) {
          throw Object.assign(new Error("access denied"), { code: "EACCES" });
        }
        await nativeHistoryFileSystem.unlink(filename);
      }
    };
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query, failingFileSystem).deleteVideoVersion(
      "asset-version-partial",
      "original"
    )).rejects.toThrow("无法删除视频文件");
    const retainedTarget = store.get().history[0]?.versions.find((version) => version.id === "original");
    expect(retainedTarget?.h3ContinuationData).toMatchObject({
      status: "invalid",
      artifact: { payload: { absolutePath: payloadPath } }
    });
    expect(store.get().history[0]?.versions).toHaveLength(2);
    await expect(fs.stat(videoPath)).rejects.toThrow();
    await expect(fs.readFile(otherVideoPath, "utf8")).resolves.toBe("other");
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
  });

  it("refuses JointAV deletion when another History version references the same pair", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-shared.json");
    const payloadPath = path.join(artifactDirectory, "h3av-shared.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const artifact = {
      manifest: { filename: "h3av-shared.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-shared.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const first = videoVersion("original", []);
    first.h3ContinuationData = { status: "available", artifact };
    const second = videoVersion("upscale", [], "upscale");
    second.h3ContinuationData = { status: "available", artifact };
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [first, second])];
    const store = repository(state);
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query).deleteJointAv("asset-1", "original"))
      .rejects.toThrow("仍被其他版本、队列或草稿引用");
    await expect(fs.readFile(manifestPath, "utf8")).resolves.toBe("manifest");
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
    expect(store.get().history[0]?.versions[0]?.h3ContinuationData?.status).toBe("available");
  });

  it("normalizes relative and cached absolute AV references through the resolver", async () => {
    const root = await temporaryRoot();
    const ownerDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(ownerDirectory, "h3av-resolved.json");
    const payloadPath = path.join(ownerDirectory, "h3av-resolved.safetensors");
    await fs.mkdir(ownerDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const targetArtifact = {
      manifest: { filename: "h3av-resolved.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-resolved.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const sharedArtifact = {
      manifest: { filename: "h3av-resolved.json", subfolder: "h3-native-av", type: "output" },
      payload: { filename: "h3av-resolved.safetensors", subfolder: "h3-native-av", type: "output" }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const target = videoVersion("original", []);
    target.h3ContinuationData = { status: "available", artifact: targetArtifact };
    const other = videoVersion("upscale", [], "upscale");
    other.h3ContinuationData = { status: "available", artifact: sharedArtifact };
    const state = createDefaultState();
    state.history = [videoAsset("asset-1", [target, other])];
    const store = repository(state);
    const query = queryFor(store, root);
    const resolve = query.resolveHistoryFile.bind(query);
    vi.spyOn(query, "resolveHistoryFile").mockImplementation(async (file, settings) => {
      if (file.filename === "h3av-resolved.json" || file.filename === "h3av-resolved.safetensors") {
        return file.filename.endsWith(".json") ? manifestPath : payloadPath;
      }
      return resolve(file, settings);
    });
    const unlink = vi.spyOn(nativeHistoryFileSystem, "unlink");

    await expect(destructiveFor(store, query).deleteJointAv("asset-1", "original"))
      .rejects.toThrow("仍被其他版本、队列或草稿引用");
    expect(unlink).not.toHaveBeenCalled();
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
    unlink.mockRestore();
  });

  it("protects a shared AV referenced by a queued Native upscale input", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-queue.json");
    const payloadPath = path.join(artifactDirectory, "h3av-queue.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const artifact = {
      manifest: { filename: "h3av-queue.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-queue.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const version = videoVersion("original", []);
    version.h3ContinuationData = { status: "available", artifact };
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [version])];
    state.queue = [{
      id: "upscale-reference",
      taskType: "upscale",
      status: "waiting",
      sourceAssetId: "asset-1",
      sourceVersionId: version.id,
      sourceFilePath: "source.mp4",
      sourceFilename: "source.mp4",
      h3NativeInput: { artifact }
    } as never];
    const store = repository(state);
    const query = queryFor(store, root);
    const unlink = vi.spyOn(nativeHistoryFileSystem, "unlink");

    await expect(destructiveFor(store, query).deleteJointAv("asset-1", version.id))
      .rejects.toThrow("queue:upscale-reference");
    expect(unlink).not.toHaveBeenCalled();
    unlink.mockRestore();
  });

  it("rechecks latest History references after resolver work completes", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-race.json");
    const payloadPath = path.join(artifactDirectory, "h3av-race.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const artifact = {
      manifest: { filename: "h3av-race.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-race.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const target = videoVersion("original", []);
    target.h3ContinuationData = { status: "available", artifact };
    const initial = createDefaultState();
    initial.settings.outputDirectory = root;
    initial.history = [videoAsset("asset-1", [target])];
    let live = structuredClone(initial);
    const store: StateRepository = {
      load: async () => structuredClone(live),
      get: () => structuredClone(live),
      getSettings: () => structuredClone(live.settings),
      update: async (mutator) => {
        mutator(live);
        return structuredClone(live);
      }
    };
    const query = queryFor(store, root);
    const resolve = query.resolveHistoryFile.bind(query);
    let injected = false;
    vi.spyOn(query, "resolveHistoryFile").mockImplementation(async (file, settings) => {
      const resolved = await resolve(file, settings);
      if (!injected && file.filename === "h3av-race.safetensors") {
        injected = true;
        const added = videoVersion("race-reference", []);
        added.h3ContinuationData = { status: "available", artifact };
        live.history[0]!.versions.push(added);
      }
      return resolved;
    });
    const unlink = vi.spyOn(nativeHistoryFileSystem, "unlink");

    await expect(destructiveFor(store, query).deleteJointAv("asset-1", target.id))
      .rejects.toThrow("仍被其他版本、队列或草稿引用");
    expect(unlink).not.toHaveBeenCalled();
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
    unlink.mockRestore();
  });

  it("refuses JointAV deletion when a non-active creation draft references it", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-draft.json");
    const payloadPath = path.join(artifactDirectory, "h3av-draft.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const artifact = {
      manifest: { filename: "h3av-draft.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-draft.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const version = videoVersion("original", []);
    version.h3ContinuationData = { status: "available", artifact };
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [version])];
    state.videoExtensionDraft = {
      ...state.draft,
      inputMode: "video",
      h3ContinuumArtifact: artifact,
      h3ContinuumArtifactPath: payloadPath
    };
    const store = repository(state);
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query).deleteJointAv("asset-1", "original"))
      .rejects.toThrow("draft:video-extension-draft");
    await expect(fs.stat(manifestPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(fs.stat(payloadPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("protects sequence-only queue and draft asset references without file paths", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-sequence-only.json");
    const payloadPath = path.join(artifactDirectory, "h3av-sequence-only.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const assetId = "sequence-only-asset";
    const artifact = {
      manifest: { filename: "h3av-sequence-only.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-sequence-only.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as unknown as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    const version = videoVersion("original", []);
    version.h3ContinuationData = { status: "available", artifact };
    version.h3AvAsset = { assetId, storageKind: "app-canonical", ownerPath: artifact.payload } as never;
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-sequence-only", [version])];
    state.queue = [{
      id: "sequence-only-queue",
      taskType: "generation",
      status: "waiting",
      h3ContinuumSequence: { chunks: [{ assetId }] }
    } as never];
    state.videoExtensionDraft = {
      ...state.draft,
      inputMode: "video",
      h3ContinuumSequence: { chunks: [{ assetId }] }
    };
    const store = repository(state);
    const query = queryFor(store, root);
    const unlink = vi.spyOn(nativeHistoryFileSystem, "unlink");

    await expect(destructiveFor(store, query).deleteJointAv("asset-sequence-only", "original"))
      .rejects.toThrow("仍被其他版本、队列或草稿引用");
    expect(unlink).not.toHaveBeenCalled();
    unlink.mockRestore();
  });

  it("never exposes a managed Run owner to ordinary JointAV deletion", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const manifestPath = path.join(artifactDirectory, "h3av-managed.json");
    const payloadPath = path.join(artifactDirectory, "h3av-managed.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("managed", []);
    version.h3ContinuationData = {
      status: "available",
      artifact: {
        manifest: { filename: "h3av-managed.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
        payload: { filename: "h3av-managed.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
      }
    } as AssetVersion["h3ContinuationData"];
    version.h3AvAsset = {
      schemaVersion: 1,
      assetId: "managed-asset-1",
      storageKind: "continuum-run-chunk",
      ownerPath: version.h3ContinuationData.artifact!.payload,
      payloadBytes: 1,
      payloadSha256: "a".repeat(64),
      videoTensorSha256: "b".repeat(64),
      audioTensorSha256: "c".repeat(64),
      videoShape: [1, 24, 2, 30, 54],
      videoDtype: "F16",
      audioShape: [1, 32, 2, 8],
      audioDtype: "F16",
      width: 864,
      height: 480,
      fps: 24,
      frameCount: 5,
      producer: {
        workflowId: "managed",
        workflowRevision: "managed",
        producerNodeId: "managed",
        producerNodeVersion: "3.8.2",
        executionModelId: "minimax_h3_continuum",
        diffusionModelFilename: "diffusion",
        textEncoderFilename: "text",
        videoVaeFilename: "video",
        audioVaeFilename: "audio",
        loraFilenames: [],
        width: 864,
        height: 480,
        fps: 24,
        frameCount: 5
      },
      capabilities: ["continuum-managed-chunk"],
      createdAt: "2026-09-19T00:00:00.000Z"
    };
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-managed", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await expect(destructiveFor(store, query).deleteJointAv("asset-managed", "managed"))
      .rejects.toThrow("官方 Run Storage owner");
    await expect(fs.stat(manifestPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(fs.stat(payloadPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("keeps a managed Run artifact read-only when deleting the whole History record", async () => {
    const root = await temporaryRoot();
    const artifactDirectory = path.join(root, "h3-native-av");
    const videoPath = path.join(root, "managed.mp4");
    const manifestPath = path.join(artifactDirectory, "h3av-managed-history.json");
    const payloadPath = path.join(artifactDirectory, "h3av-managed-history.safetensors");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(manifestPath, "manifest"),
      fs.writeFile(payloadPath, "payload")
    ]);
    const version = videoVersion("managed", [{
      filename: "managed.mp4",
      subfolder: "",
      type: "output",
      absolutePath: videoPath
    }]);
    const artifact = {
      manifest: { filename: "h3av-managed-history.json", subfolder: "h3-native-av", type: "output", absolutePath: manifestPath },
      payload: { filename: "h3av-managed-history.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: payloadPath }
    } as NonNullable<AssetVersion["h3ContinuationData"]>["artifact"];
    version.h3ContinuationData = { status: "available", artifact };
    version.h3AvAsset = {
      assetId: "managed-history-asset",
      storageKind: "continuum-run-chunk",
      ownerPath: artifact.payload
    } as never;
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-managed-history", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteHistory("asset-managed-history");

    expect(store.get().history).toEqual([]);
    await expect(fs.stat(videoPath)).rejects.toThrow();
    await expect(fs.readFile(manifestPath, "utf8")).resolves.toBe("manifest");
    await expect(fs.readFile(payloadPath, "utf8")).resolves.toBe("payload");
  });

  it("deletes Motion Context latent without deleting the version video", async () => {
    const root = await temporaryRoot();
    const contextDirectory = path.join(root, "h3-motion-context", "task-1");
    const videoPath = path.join(root, "original.mp4");
    const contextPath = path.join(contextDirectory, "clip_00001.safetensors");
    await fs.mkdir(contextDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(contextPath, "latent")
    ]);
    const version = videoVersion("original", [
      { filename: "original.mp4", subfolder: "", type: "output", absolutePath: videoPath },
      {
        filename: "clip_00001.safetensors",
        subfolder: "h3-motion-context/task-1",
        type: "output",
        format: "safetensors",
        absolutePath: contextPath,
        sizeBytes: 6
      }
    ]);
    version.h3ContextLatentPath = contextPath;
    const state = createDefaultState();
    state.settings.outputDirectory = root;
    state.history = [videoAsset("asset-1", [version])];
    const store = repository(state);
    const query = queryFor(store, root);

    await destructiveFor(store, query).deleteMotionContext("asset-1", "original");

    await expect(fs.readFile(videoPath, "utf8")).resolves.toBe("video");
    await expect(fs.stat(contextPath)).rejects.toThrow();
    expect(store.get().history[0]?.versions[0]?.h3ContextLatentPath).toBeUndefined();
    expect(store.get().history[0]?.versions[0]?.files).toEqual([
      { filename: "original.mp4", subfolder: "", type: "output", absolutePath: videoPath }
    ]);
  });

  it("deletes Motion Context latent at the resolver's actual output root", async () => {
    const root = await temporaryRoot();
    const configuredOutput = path.join(root, "configured-output");
    const actualOutput = path.join(root, "actual-output");
    const contextPath = path.join(actualOutput, "h3-motion-context", "task-2", "clip_00001.safetensors");
    const videoPath = path.join(root, "original-external.mp4");
    await fs.mkdir(path.dirname(contextPath), { recursive: true });
    await Promise.all([
      fs.writeFile(videoPath, "video"),
      fs.writeFile(contextPath, "latent")
    ]);
    const contextFile = {
      filename: "clip_00001.safetensors",
      subfolder: "h3-motion-context/task-2",
      type: "output",
      format: "safetensors"
    };
    const version = videoVersion("external", [
      { filename: "original-external.mp4", subfolder: "", type: "output", absolutePath: videoPath },
      { ...contextFile, absolutePath: contextPath }
    ]);
    version.h3ContextLatentPath = contextPath;
    const state = createDefaultState();
    state.settings.outputDirectory = configuredOutput;
    state.history = [videoAsset("asset-external-motion", [version])];
    const store = repository(state);
    const query = queryFor(store, root);
    const resolveHistoryFile = query.resolveHistoryFile.bind(query);
    vi.spyOn(query, "resolveHistoryFile").mockImplementation(async (file) =>
      file.filename === contextFile.filename ? contextPath : resolveHistoryFile(file, state.settings)
    );

    await destructiveFor(store, query).deleteMotionContext("asset-external-motion", "external");

    await expect(fs.stat(contextPath)).rejects.toThrow();
    expect(store.get().history[0]?.versions[0]?.h3ContextLatentPath).toBeUndefined();
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
