import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { QueueEnqueueService, type QueueEnqueueServiceDependencies } from "../electron/queue-enqueue.js";
import { QueueMutationService } from "../electron/queue-mutation-service.js";
import { ImageAssetLibraryService } from "../electron/services/image-asset-library-service.js";
import type { ImageAssetLibraryFileSystemPort } from "../electron/ports/image-asset-library.js";
import type { StateRepository } from "../electron/ports/state-repository.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { createDefaultState } from "../src/core/defaults.js";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory.js";
import { H3_REFINER_ID, H3_REFINER_NODES } from "../src/core/h3-refiner.js";
import { TESSERA_ID, TESSERA_NODES } from "../src/core/tessera.js";
import { renderUpscaleWorkflow } from "../src/core/upscale.js";
import type { AppState, HistoryAsset, ImageAssetLibraryProgress, UpscaleRequest } from "../src/types.js";

function repository(state: AppState) {
  const update = vi.fn(async (mutator: (state: AppState) => void) => { mutator(state); return state; });
  return { get: () => state, getSettings: () => state.settings, load: async () => state, update } satisfies StateRepository;
}
const logger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() });
const languages = [
  ["zh-CN", "源作品或版本已不存在", "待编辑", "请先选择首帧", "请先添加", "队列运行期间", "整理完成", "处理中"],
  ["en-US", "source project or version", "task to edit", "first-frame image", "base image", "queue is running", "organization complete", "busy"],
  ["zh-TW", "源作品或版本已不存在", "要編輯", "請先選擇首影格", "請先新增", "佇列執行期間", "整理完成", "處理中"]
] as const;

it("reads the saved locale on existing queue services and rejects invalid input without writes", async () => {
  const state = createDefaultState(), store = repository(state), sendState = vi.fn();
  const service = new QueueEnqueueService({ store, logger: logger(), sendState } as QueueEnqueueServiceDependencies);
  const mutation = new QueueMutationService({ store, logger: logger(), sendState });
  for (const [locale, version, edit, first, base] of languages) {
    state.settings.uiLocale = locale;
    const before = structuredClone(state);
    await expect(service.enqueueUpscale({ sourceAssetId: "missing", sourceVersionId: "missing" } as UpscaleRequest)).rejects.toThrow(version);
    await expect(mutation.updateUpscale("missing", {})).rejects.toThrow(edit);
    const draft = { ...state.draft, modelId: "custom-model", startImagePath: "", endImagePath: "" };
    await expect(service.enqueue(draft)).rejects.toThrow(first);
    await expect(service.enqueueImage({ ...state.imageDraft, modelId: "qwen-image-edit-2511", pictures: [] })).rejects.toThrow(base);
    expect(store.update).not.toHaveBeenCalled(); expect(sendState).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  }
});

it("keeps asset-library queue and mutual-exclusion guards recoverable in every saved language", async () => {
  const state = createDefaultState(), store = repository(state), sendState = vi.fn();
  const progress: ImageAssetLibraryProgress[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const scan = { libraryDirectory: "fixture", totalReferences: 0, managedReferences: 0, archiveCandidates: 0, missingReferences: [], orphanFiles: [], archiveBytes: 0, orphanBytes: 0 };
  const result = { scan, archivedFiles: 0, reorganizedFiles: 0, updatedReferences: 0, cleanedFiles: 0, cleanedDirectories: 0, cleanedBytes: 0 };
  const fileSystem = {
    organize: vi.fn(async () => ({ state: structuredClone(state), result })),
    cleanup: vi.fn(async () => result),
    scan: vi.fn(async () => { await pending; return scan; })
  } satisfies ImageAssetLibraryFileSystemPort;
  const service = new ImageAssetLibraryService({ store, logger: logger(), sendState,
    resolveLibraryDirectory: async () => "fixture", fileSystem,
    events: { publish: (_event, value) => { progress.push(value as ImageAssetLibraryProgress); } } });
  for (const [locale, , , , , running, done] of languages) {
    state.settings.uiLocale = locale; state.queueRunning = true;
    await expect(service.organize()).rejects.toThrow(running);
    await expect(service.cleanup(["使用者/原圖.png"])).rejects.toThrow(running);
    expect(service.isRunning()).toBe(false);
    state.queueRunning = false;
    await expect(service.organize()).resolves.toMatchObject({ ...result, operationId: expect.any(String) });
    expect(progress.at(-1)).toMatchObject({ phase: "completed", current: 1, total: 1, message: expect.stringContaining(done) });
  }
  const scanning = service.scan();
  try {
    for (const [locale, , , , , , , busy] of languages) {
      state.settings.uiLocale = locale;
      await expect(service.organize()).rejects.toThrow(busy);
      expect(service.isRunning()).toBe(true);
    }
  } finally { release(); await scanning; }
  expect(service.isRunning()).toBe(false);
  expect(fileSystem.organize).toHaveBeenCalledTimes(3); expect(fileSystem.cleanup).not.toHaveBeenCalled();
});

function refinerFixture(modelId: string) {
  const state = createDefaultState();
  state.history = [{ id: "a", prompt: '保留招牌「春日」。', versions: [{ id: "v", outputFilename: "原片.mp4" }] } as HistoryAsset];
  const request: UpscaleRequest = { modelId, sourceAssetId: "a", sourceVersionId: "v", sourceFilePath: "使用者/原片.mp4",
    sourceFilename: "原片.mp4", sourceWidth: 1920, sourceHeight: 1080, duration: 5, fps: 30, targetHeight: 2160, tileMode: "safe", faceRestore: false };
  const info = Object.fromEntries([...H3_REFINER_NODES, ...TESSERA_NODES].map(node => [node, {}]));
  info.ModelAttentionBackend = { input: { required: { attention: [["pytorch attention"]] } } };
  info.LocalVideoStudioH3RefinerPrepare = { input: { required: { images: ["IMAGE"], fps: ["FLOAT"], width: ["INT"], height: ["INT"] } } };
  info.LocalVideoStudioH3RefinerOutput = { input: { required: { images: ["IMAGE"], frame_count: ["INT"], width: ["INT"], height: ["INT"] } } };
  info.LocalVideoStudioH3RefinerLoraGuard = { input: { required: { base: ["MODEL"], model: ["MODEL"], adapter: ["STRING"] } } };
  return { state, request, info };
}

it.each([H3_REFINER_ID, TESSERA_ID])("preserves %s execution snapshots and graphs while localizing nested source and node failures", modelId => {
  const { state, request, info } = refinerFixture(modelId);
  const clock = { id: () => "same-id", now: () => new Date("2026-11-03T00:00:00Z"), random: () => .5 };
  const task = upscaleTaskFromRequest(request, state, clock), before = structuredClone(task);
  const models = { seedVr2: "", realEsrgan: "" };
  const graph = renderUpscaleWorkflow(task, "上傳/原片.mp4", models, info);
  for (const [locale, missing, source] of [["zh-CN", "缺少节点", "源视频时长"], ["en-US", "missing nodes", "source duration"], ["zh-TW", "缺少節點", "源影片時長"]] as const) {
    const t = createNativeTranslator(locale).t;
    expect(upscaleTaskFromRequest(request, state, clock, t)).toEqual(task);
    expect(renderUpscaleWorkflow(task, "上傳/原片.mp4", models, info, undefined, t)).toEqual(graph);
    expect(() => renderUpscaleWorkflow(task, "上傳/原片.mp4", models, {}, undefined, t)).toThrow(missing);
    const invalid = { ...task, duration: 0 };
    expect(() => renderUpscaleWorkflow(invalid, "上傳/原片.mp4", models, info, undefined, t)).toThrow(source);
    expect(() => upscaleTaskFromRequest({ ...request, duration: 0 }, state, clock, t)).toThrow(source);
    expect(task).toEqual(before);
  }
});

it("localizes native Tessera readiness checks before enqueue and retains source bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-localized-tessera-"));
  try {
    const { state, request } = refinerFixture(TESSERA_ID), filename = path.join(root, "原片.mp4");
    await fs.writeFile(filename, "original bytes");
    state.history[0]!.versions[0] = { ...state.history[0]!.versions[0]!, width: 1920, height: 1080, duration: 5, fps: 30,
      files: [{ filename: "原片.mp4", absolutePath: filename, type: "output", subfolder: "" }] };
    request.sourceFilePath = filename;
    const store = repository(state), sendState = vi.fn();
    const service = new QueueEnqueueService({ store, logger: logger(), sendState,
      getCachedEnvironmentScanForQueue: () => undefined } as QueueEnqueueServiceDependencies);
    for (const [locale, message] of [["zh-CN", "Tessera 尚未就绪"], ["en-US", "Tessera is not ready"], ["zh-TW", "Tessera 尚未就緒"]] as const) {
      state.settings.uiLocale = locale;
      await expect(service.enqueueUpscale(request)).rejects.toThrow(message);
      expect(state.queue).toEqual([]); expect(store.update).not.toHaveBeenCalled(); expect(sendState).not.toHaveBeenCalled();
    }
    expect(await fs.readFile(filename, "utf8")).toBe("original bytes");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
