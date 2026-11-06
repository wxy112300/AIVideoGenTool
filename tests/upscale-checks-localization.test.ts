import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { QueueMutationService } from "../electron/queue-mutation-service.js";
import { persistVideoHistoryResult } from "../electron/queue-history.js";
import { assertDlss5ExecutionReady, assertAetherScaleExecutionReady, assertKonohamaruExecutionReady, submitTask, waitForTask } from "../electron/services/comfy-ui.js";
import { executeNativeSeedVr2Upscale } from "../electron/services/seedvr2-upscale.js";
import { getComputeResourceSnapshot } from "../electron/services/performance.js";
import { createDefaultState } from "../src/core/defaults.js";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory.js";
import { renderUpscaleWorkflow, createDlss5UpscaleFilename, createAetherScaleUpscaleFilename, createKonohamaruUpscaleFilename, uniqueDlss5UpscaleFilename, uniqueAetherScaleUpscaleFilename } from "../src/core/upscale.js";
import { DEFAULT_DLSS5_UPSCALE_OPTIONS, validateDlss5Workflow, validateDlss5ObjectInfoSchema } from "../src/core/dlss5.js";
import { AETHERSCALE_V055_OBJECT_INFO, defaultAetherScaleOptions, validateAetherScaleWorkflow, validateAetherScaleObjectInfoSchema } from "../src/core/aetherscale.js";
import { defaultKonohamaruOptions, validateKonohamaruWorkflow, validateKonohamaruObjectInfoSchema } from "../src/core/konohamaru-dlss5.js";
import { dlss5ObjectInfo, konohamaruObjectInfo } from "./fixtures/upscale-object-info.js";
import type { UpscaleQueueTask, UpscaleRequest } from "../src/types.js";

vi.mock("../electron/services/comfy-ui.js", async original => ({ ...await original<typeof import("../electron/services/comfy-ui.js")>(), submitTask: vi.fn(), waitForTask: vi.fn() }));
vi.mock("../electron/services/performance.js", async original => ({ ...await original<typeof import("../electron/services/performance.js")>(), getComputeResourceSnapshot: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const providers = [
  { model: "dlss5-sr", interpolation: false, info: dlss5ObjectInfo, validate: validateDlss5Workflow, schema: (info: unknown, t: ReturnType<typeof createNativeTranslator>["t"]) => validateDlss5ObjectInfoSchema(info, t), assertReady: assertDlss5ExecutionReady },
  { model: "aetherscale-dlss5", interpolation: false, info: AETHERSCALE_V055_OBJECT_INFO, validate: validateAetherScaleWorkflow, schema: (info: unknown, t: ReturnType<typeof createNativeTranslator>["t"]) => validateAetherScaleObjectInfoSchema(info, t), assertReady: assertAetherScaleExecutionReady },
  ...[false, true].map(interpolation => ({ model: "dlss5-konohamaru", interpolation, info: konohamaruObjectInfo, validate: validateKonohamaruWorkflow,
    schema: (info: unknown, t: ReturnType<typeof createNativeTranslator>["t"]) => validateKonohamaruObjectInfoSchema(info, { frameInterpolation: interpolation }, t), assertReady: assertKonohamaruExecutionReady }))
];
const locales = [["zh-CN", "缺少节点", "连接无效", "不符", "必须"], ["en-US", "missing nodes", "invalid edges", "does not match", "must"], ["zh-TW", "缺少節點", "連接無效", "不符", "必須"]] as const;
const clock = { id: () => "same-task", now: () => new Date("2026-11-03T00:00:00Z"), random: () => .5 };

it("localizes filename guards without changing filenames or duplicate numbering", () => {
  for (const [locale, invalid] of [["zh-CN", "无效"], ["en-US", "invalid"], ["zh-TW", "無效"]] as const) {
    const t = createNativeTranslator(locale).t;
    const dlss = createDlss5UpscaleFilename("原片.mp4", 2, t), aether = createAetherScaleUpscaleFilename("原片.mp4", "performance_2x", t);
    expect(dlss).toBe("原片-dlss-2x-v01.mp4"); expect(aether).toBe("原片-aether-2x-v01.mp4");
    expect(uniqueDlss5UpscaleFilename("原片.mp4", 2, [dlss], t)).toBe("原片-dlss-2x-v02.mp4");
    expect(uniqueAetherScaleUpscaleFilename("原片.mp4", "performance_2x", [aether], t)).toBe("原片-aether-2x-v02.mp4");
    expect(() => createDlss5UpscaleFilename("原片.mp4", 9 as never, t)).toThrow(locale === "en-US" ? "must be" : locale === "zh-CN" ? "必须" : "必須");
    expect(() => createAetherScaleUpscaleFilename("原片.mp4", "bad-mode" as never, t)).toThrow(invalid);
    expect(() => createKonohamaruUpscaleFilename("原片.mp4", "bad-mode" as never, "off", t)).toThrow(invalid);
  }
});

it("keeps missing-parent History protection in the saved language without inventing a derived project", () => {
  for (const [locale, message] of [["zh-CN", "源作品已不存在"], ["en-US", "source project no longer exists"], ["zh-TW", "來源作品已不存在"]] as const) {
    const state = createDefaultState(); state.settings.uiLocale = locale;
    const task = upscaleTaskFromRequest(requestFor("dlss5-sr"), state, clock), id = vi.fn(() => "new-version");
    expect(() => persistVideoHistoryResult(state, { task, completedAt: clock.now().toISOString(), promptId: "prompt", files: [], comfyOutputs: {}, id })).toThrow(message);
    expect(state.history).toEqual([]); expect(id).not.toHaveBeenCalled();
  }
});

function requestFor(model: string, interpolation = false): UpscaleRequest {
  return { modelId: model, sourceAssetId: "作品", sourceVersionId: "原版", sourceFilePath: "使用者/原片.mp4", sourceFilename: "原片.mp4",
    sourceWidth: 832, sourceHeight: 480, duration: 5, fps: 24, tileMode: "safe", faceRestore: false,
    ...(model === "dlss5-sr" ? { targetScale: 2 as const, dlss5: structuredClone(DEFAULT_DLSS5_UPSCALE_OPTIONS) }
      : model === "aetherscale-dlss5" ? { aetherScale: defaultAetherScaleOptions(1664, 960) }
      : { konohamaru: defaultKonohamaruOptions("quality_1_5x", interpolation, 120) }) };
}

it.each(providers)("keeps $model interpolation=$interpolation graphs, snapshots and schema identity unchanged across languages", provider => {
  const state = createDefaultState(), request = requestFor(provider.model, provider.interpolation);
  const task = upscaleTaskFromRequest(request, state, clock), before = structuredClone(task), schemaBefore = structuredClone(provider.info);
  const models = { seedVr2: "", realEsrgan: "" }, graph = renderUpscaleWorkflow(task, "uploaded/原片.mp4", models, provider.info);
  const missing = provider.schema({}, createNativeTranslator("zh-CN").t);
  for (const [locale, nodes, edges, geometry] of locales) {
    const t = createNativeTranslator(locale).t;
    expect(upscaleTaskFromRequest(request, state, clock, t)).toEqual(task);
    expect(renderUpscaleWorkflow(task, "uploaded/原片.mp4", models, provider.info, undefined, t)).toEqual(graph);
    expect(provider.validate(graph, provider.info, t)).toMatchObject({ valid: true, errors: [] });
    const absent = provider.schema({}, t);
    expect(absent.valid).toBe(false); expect(absent.missingNodes).toEqual(missing.missingNodes); expect(absent.errors.join(" ")).toContain(nodes);
    const broken = structuredClone(graph), save = Object.values(broken).find(node => ["SaveVideo", "VHS_VideoCombine"].includes(node.class_type))!;
    save.inputs["video" in save.inputs ? "video" : "images"] = ["missing-node", 99];
    const rejected = provider.validate(broken, provider.info, t);
    expect(rejected.valid).toBe(false); expect(rejected.invalidEdges.length).toBeGreaterThan(0); expect(rejected.errors.join(" ")).toContain(edges);
    expect(() => renderUpscaleWorkflow({ ...task, targetWidth: task.targetWidth + 2 }, "uploaded/原片.mp4", models, provider.info, undefined, t)).toThrow(locale === "en-US" ? /do(?:es)? not match/ : geometry);
    expect(task).toEqual(before); expect(provider.info).toEqual(schemaBefore);
  }
});

it.each(providers.filter(provider => !provider.interpolation))("uses saved language in $model runtime schema guards before any HTTP or model preparation", async provider => {
  const state = createDefaultState(), task = upscaleTaskFromRequest(requestFor(provider.model), state, clock), before = structuredClone(task);
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  for (const [locale, missing] of locales) {
    const settings = { ...state.settings, uiLocale: locale, comfyUrl: "https://remote.example.test" };
    await expect(provider.assertReady(task, settings, {})).rejects.toThrow(missing);
    expect(task).toEqual(before); expect(request).not.toHaveBeenCalled();
  }
});

it.each(providers.filter(provider => !provider.interpolation))("rejects malformed $model edits in the saved language without changing the queued snapshot", async provider => {
  const state = createDefaultState(), task = upscaleTaskFromRequest(requestFor(provider.model), state, clock); state.queue = [task];
  const update = vi.fn(), sendState = vi.fn();
  const service = new QueueMutationService({ store: { get: () => state, getSettings: () => state.settings, load: async () => state, update }, logger: { info: vi.fn() } as never, sendState });
  const patch = structuredClone(task);
  if (patch.dlss5) patch.targetScale = 5 as never;
  else if (patch.aetherScale) patch.aetherScale.warmupFrames = -1;
  else patch.konohamaru!.nrIntensity = 99;
  for (const [locale, , , , must] of locales) {
    state.settings.uiLocale = locale; const before = structuredClone(state);
    await expect(service.updateUpscale(task.id, patch)).rejects.toThrow(must);
    expect(state).toEqual(before); expect(update).not.toHaveBeenCalled(); expect(sendState).not.toHaveBeenCalled();
  }
});

it.each([
  ["zh-CN", "规划 SeedVR2", "提交工作流", "等待 ComfyUI", "没有返回可用视频文件"],
  ["en-US", "Planning SeedVR2", "Submitting workflow", "Waiting for ComfyUI", "did not return a usable video file"],
  ["zh-TW", "規劃 SeedVR2", "提交工作流程", "等待 ComfyUI", "未回傳可用影片檔案"]
] as const)("localizes %s SeedVR2 segment stages while preserving the segment request and incomplete-output protection", async (locale, planning, submitting, waiting, missing) => {
  const state = createDefaultState(); state.settings.uiLocale = locale;
  const task = upscaleTaskFromRequest({ ...requestFor("seedvr2-native-int8"), targetHeight: 2160, konohamaru: undefined,
    sourceWidth: 768, sourceHeight: 1152, duration: 28 }, state, clock);
  const working = structuredClone(task), stages: string[] = [], progress: Array<{ progress: number; stage: string }> = [];
  vi.mocked(getComputeResourceSnapshot).mockResolvedValue(undefined as never);
  vi.mocked(submitTask).mockResolvedValue({ promptId: "segment-prompt", clientId: "client", nodeTypes: {}, uploadedUpscaleSource: "uploaded/原片.mp4" } as never);
  vi.mocked(waitForTask).mockImplementation(async (_prompt, _client, _nodes, _settings, _timeout, _signal, onProgress) => { onProgress(40, "原始節點狀態"); return { outputs: {} } as never; });
  await expect(executeNativeSeedVr2Upscale(task, {
    settings: state.settings, logger: { info: vi.fn() } as never, signal: new AbortController().signal,
    updateTask: async (_id, patch) => { Object.assign(working, patch); if (patch.stage) stages.push(patch.stage); return state; },
    updateTaskProgress: async (_id, patch) => { progress.push({ progress: patch.progress!, stage: patch.stage! }); },
    getTask: () => working, requireExistingVideoOutput: async () => [], isComputeActive: () => false, onPreview: vi.fn()
  })).rejects.toThrow(missing);
  expect(stages[0]).toContain(planning); expect(stages.some(stage => stage.includes(submitting))).toBe(true); expect(stages.some(stage => stage.includes(waiting))).toBe(true);
  expect(progress[0]!.stage).toContain("原始節點狀態"); expect(progress[0]!.progress).toBeGreaterThan(0); expect(progress[0]!.progress).toBeLessThan(94);
  expect(submitTask).toHaveBeenCalledTimes(1);
  expect(vi.mocked(submitTask).mock.calls[0]![0]).toMatchObject({ id: task.id, seed: task.seed, sourceFilePath: task.sourceFilePath, sourceAssetId: task.sourceAssetId, sourceVersionId: task.sourceVersionId });
  expect(vi.mocked(submitTask).mock.calls[0]![3]).toMatchObject({ nativeSeedVr2Segment: { startTime: 0 } });
  expect(working.seedVr2Checkpoint?.completed).toEqual([]); expect(task).not.toHaveProperty("seedVr2Checkpoint");
});
