import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { queueTaskFromDraft } from "../src/core/queue-task-factory.js";
import { adjustQueuePauseBoundary } from "../src/core/queue.js";
import { cleanupCancelledQueueTask, recoverQueueFailure } from "../electron/queue-recovery.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { attachH3JointAvSerializer, continuumTimelinePromptForTask, continuumFirstFrameTask } from "../src/core/workflow.js";
import { normalizeMiniMaxH3ModelPatchChain as normalizeLegacy } from "../src/core/h3-memory-workflow.js";
import { normalizeMiniMaxH3ModelPatchChain } from "../src/core/h3-model-patch-workflow.js";
import { promptVersionDisplayLabel } from "../src/renderer/shared/prompt-version-label.js";
import type { AppState, QueueTask, ExtensionQueueTask } from "../src/types.js";

const mocks = vi.hoisted(() => ({ forceStop: vi.fn(async () => ({ ok: true, message: "stopped" })) }));
vi.mock("../electron/services/environment.js", () => ({ forceStopComfyProcesses: mocks.forceStop, restartLocalService: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const locales = [
  ["zh-CN", "自动重试", "切换为", "达到上限", "自动恢复失败", "未连接", "任务已取消"],
  ["en-US", "Auto retry", "switched to", "retry limit", "Automatic recovery failed", "not connected", "Task cancelled"],
  ["zh-TW", "自動重試", "切換為", "已達上限", "自動復原失敗", "未連線", "任務已取消"]
] as const;

function fixture(locale: typeof locales[number][0]) {
  const state = createDefaultState(); state.settings.uiLocale = locale;
  state.settings.autoRetryFailedTasks = true; state.settings.autoRetryCount = 2;
  const task = queueTaskFromDraft({ ...state.draft, workflowPath: "workflow.json" }, state);
  task.attentionMode = "sage"; task.status = "running"; task.prompt = "保留使用者正文。";
  state.queue = [task, { ...structuredClone(task), id: "next-task", status: "waiting" }]; state.queueRunning = false; state.queuePauseBoundary = 2;
  const updateTask = vi.fn(async (id: string, patch: Partial<QueueTask>) => {
    const previous = state.queue.map(item => ({ ...item })), boundary = state.queuePauseBoundary;
    Object.assign(state.queue.find(item => item.id === id)!, patch);
    state.queuePauseBoundary = adjustQueuePauseBoundary(previous, boundary, state.queue); return state;
  });
  const restart = vi.fn(async () => ({ ok: true, message: "原始外部恢复信息" }));
  const deps = { store: { get: () => state, getSettings: () => state.settings, load: async () => state, update: async (mutator: (value: AppState) => void) => { mutator(state); return state; } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, sendState: vi.fn(), updateTask,
    settingsForTask: (_task: QueueTask, settings: AppState["settings"]) => settings, errorMeta: () => ({}), restartComfyUi: restart,
    interruptComfyUi: vi.fn(async () => undefined), freeComfyMemory: vi.fn(async () => undefined) };
  return { state, task, deps, restart, updateTask };
}

it.each(locales)("keeps %s CUDA fallback, retry limits and pause boundaries while localizing new recovery messages", async (locale, retry, switched, limit) => {
  const { state, task, deps, restart } = fixture(locale), error = new Error("illegal memory access · 使用者原始诊断");
  const recover = () => recoverQueueFailure(deps, { task, error, aborted: false, stalled: false });
  const order = state.queue.map(item => item.id);
  await recover();
  expect(task).toMatchObject({ status: "waiting", automaticRetryAttempt: 1, attentionMode: "sage-triton" });
  expect(task.h3ExecutionPolicy?.reasons).toContain("attention-fallback:sage->sage-triton");
  expect(task.stage).toContain(retry); expect(task.error).toContain(switched); expect(task.error).toContain(error.message);
  task.status = "running"; await recover();
  expect(task).toMatchObject({ automaticRetryAttempt: 2, attentionMode: "pytorch" });
  expect(task.h3ExecutionPolicy?.reasons).toContain("attention-fallback:sage-triton->pytorch");
  task.status = "running"; await recover();
  expect(task.status).toBe("failed"); expect(task.error).toContain(limit); expect(task.automaticRetryAttempt).toBe(2);
  expect(state.queue.map(item => item.id)).toEqual(order); expect(state.queueRunning).toBe(false);
  expect(task.prompt).toBe("保留使用者正文。"); expect(restart).toHaveBeenCalledTimes(3); expect(mocks.forceStop).toHaveBeenCalledTimes(3);
});

it.each(locales)("preserves %s failed recovery details and ignores a stale cancellation", async (locale, _retry, _switched, _limit, failed, disconnected, cancelled) => {
  const { state, task, deps, restart, updateTask } = fixture(locale);
  restart.mockResolvedValue({ ok: false, message: "EACCES · 原始磁碟訊息" });
  await recoverQueueFailure(deps, { task, error: new Error("illegal memory access"), aborted: false, stalled: false });
  expect(state.queueRunning).toBe(false); expect(task.error).toContain(failed); expect(task.error).toContain("EACCES · 原始磁碟訊息");
  expect(task.automaticRetryAttempt).toBeUndefined();
  updateTask.mockClear();
  const cancelDeps = { logger: deps.logger, updateTask, getComfyRuntimeState: () => ({ phase: "stopped", ownership: "none", endpoint: "http://localhost:8188", message: "raw", updatedAt: "now", operationId: 1 } as const) };
  await cleanupCancelledQueueTask(cancelDeps, task.id, state.settings, null);
  expect(task.stage).toContain(disconnected); expect(task.error).toBe(cancelled); expect(updateTask).toHaveBeenCalledTimes(1);
  updateTask.mockClear(); const before = structuredClone(task);
  await cleanupCancelledQueueTask({ ...cancelDeps, isCancellationCurrent: () => false }, task.id, state.settings, null);
  expect(updateTask).not.toHaveBeenCalled(); expect(task).toEqual(before);
});

it("keeps ordinary Continuum prompt bodies and serializer graphs identical across languages while localizing refusal", () => {
  const task = { prompt: "保留此段文字。", h3ContinuumSequence: { acceptedChunks: 1, globalPromptPreamble: "使用者全域说明", chunks: [{ status: "accepted", prompt: { finalPrompt: "上一段原文。" } }] } } as ExtensionQueueTask;
  const before = structuredClone(task), expected = continuumTimelinePromptForTask(task, 4);
  const source = { "1": { class_type: "EmptyLatentImage", inputs: {} }, "2": { class_type: "VAEDecode", inputs: { samples: ["1", 0] } } };
  const baseline = structuredClone(source); attachH3JointAvSerializer(baseline, "使用者/存档.safetensors");
  for (const [locale, body, first, unique] of [["zh-CN", "非空 Chunk body", "首帧来源", "唯一最终"], ["en-US", "non-empty Chunk body", "first-frame source", "unique final"], ["zh-TW", "非空 Chunk body", "首影格來源", "唯一最終"]] as const) {
    expect(continuumTimelinePromptForTask(task, 4, locale)).toBe(expected);
    expect(() => continuumTimelinePromptForTask({ ...task, prompt: "[Chunk 2] nested" }, 4, locale)).toThrow(body);
    expect(() => continuumFirstFrameTask(task, locale)).toThrow(first);
    expect(() => attachH3JointAvSerializer({}, "使用者/存档.safetensors", locale)).toThrow(unique);
    const graph = structuredClone(source); attachH3JointAvSerializer(graph, "使用者/存档.safetensors", locale); expect(graph).toEqual(baseline);
    expect(task).toEqual(before);
  }
});

it("uses the existing legacy Attention locale seam and localizes the upgraded policy refusal without changing reason IDs", () => {
  for (const [locale, different, unavailable] of [["zh-CN", "不同的模型补丁链", "执行策略不可用"], ["en-US", "different model patch chains", "execution policy is unavailable"], ["zh-TW", "不同的模型補丁鏈", "執行策略不可用"]] as const) {
    const graph = { "1": { class_type: "UNETLoader", inputs: {} }, "2": { class_type: "PathchSageAttentionKJ", inputs: { model: ["1", 0] } },
      "8": { class_type: "BasicScheduler", inputs: { model: ["2", 0] } }, "10": { class_type: "BasicGuider", inputs: { model: ["1", 0] } } };
    const before = structuredClone(graph);
    expect(() => normalizeLegacy(graph, { locale })).toThrow(different); expect(graph).toEqual(before);
    expect(() => normalizeMiniMaxH3ModelPatchChain({}, { modelId: "unknown-model", inputMode: "image", spectrumEnabled: true, locale })).toThrow(unavailable);
    expect(() => normalizeMiniMaxH3ModelPatchChain({}, { modelId: "unknown-model", inputMode: "image", spectrumEnabled: true, locale })).toThrow("spectrum-unsupported");
  }
});

it("localizes exact shipped labels in either language without rewriting drafts or matching custom lookalikes", () => {
  const state = createDefaultState(), before = structuredClone(state);
  for (const [locale, fresh, manual, expanded, image] of [["zh-CN", "新建", "手动编辑", "扩写 3", "图片优化 2"], ["en-US", "New prompt", "Manual edit", "Expanded 3", "Image optimization 2"], ["zh-TW", "新建", "手動編輯", "擴寫 3", "圖片最佳化 2"]] as const) {
    const t = createNativeTranslator(locale).t;
    for (const source of ["新建", "New prompt"]) expect(promptVersionDisplayLabel(source, t)).toBe(fresh);
    for (const source of ["手动编辑", "手動編輯", "Manual edit"]) expect(promptVersionDisplayLabel(source, t)).toBe(manual);
    for (const source of ["扩写 3", "擴寫 3", "Expanded 3"]) expect(promptVersionDisplayLabel(source, t)).toBe(expanded);
    for (const source of ["图片优化 2", "圖片最佳化 2", "Image optimization 2"]) expect(promptVersionDisplayLabel(source, t)).toBe(image);
    for (const custom of ["新建的作品", "Manual edit · user", "Expanded 03", "Image optimization 0", "扩写 3：使用者標題"]) expect(promptVersionDisplayLabel(custom, t)).toBe(custom);
    expect(state).toEqual(before);
  }
});
