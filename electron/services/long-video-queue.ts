import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionQueueTask, GenerationQueueTask, HistoryFile, Settings } from "../../src/types.js";
import type { QueueExecutorDependencies } from "../queue-executor.js";
import { outputDimensions, miniMaxH3ModelAssetNames, normalizeH3Steps } from "../../src/core/workflow.js";
import { videoLoraConfigurationIssues } from "../../src/core/video-loras.js";
import { h3VideoVaeFilename } from "../../src/core/h3-video-vae.js";
import { assertLongVideoExecutionSnapshot, compileLongVideoSamplingPrompts, freezeLongVideoExtensionPlan, type LongVideoExecutionSnapshot } from "../../src/core/long-video/execution.js";
import { compileLongVideoPrompts } from "../../src/core/long-video/script.js";
import { deriveContinuumReferenceRouting } from "../../src/core/long-video/reference-routing.js";
import { compileContinuumGroupWorkflow, isContinuumFl2vaModel, isContinuumReferenceModel } from "../../src/core/long-video/group-workflow.js";
import { PI_H3_MODEL_ID } from "../../src/core/catalog/models/minimax_h3_pi/definition.js";
import { PI_H3_SAMPLER, PI_H3_SCHEDULER } from "../../src/core/pi-h3.js";
import { promises as fs } from "node:fs";
import { uploadInput } from "./comfy-ui.js";
import { continuumParentTransport, runLongVideoExecution } from "./long-video-execution.js";
import { inspectLongVideoMedia, hashLongVideoFile } from "./long-video-media.js";
import { persistVideoHistoryResult } from "../queue-history.js";
import { queuePauseBoundaryAfterTaskCompletion } from "../../src/core/queue.js";
import { verifyLongVideoRunSource } from "./long-video-run-source.js";
import { longVideoOutputFps } from "../../src/core/long-video/delivery.js";
import { longVideoGuideCues, longVideoGuideIssue } from "../../src/core/long-video/timed-guides.js";

export class LongVideoPausedError extends Error {}
type Dependencies = Pick<QueueExecutorDependencies, "store" | "sendState" | "updateTask" | "updateTaskProgress" | "requireExistingVideoOutput" | "getComfyRuntimeState">;

/** Uses the existing Queue lease and completion store transaction, never another worker. */
export async function executeQueuedLongVideo(task: GenerationQueueTask | ExtensionQueueTask, settings: Settings, deps: Dependencies, signal: AbortSignal): Promise<void> {
  if (!task.longVideoPlan || !task.longVideoRoot) throw new Error("Long-video task is missing its frozen layout/storage root");
  const templatePath = fileURLToPath(new URL("../../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url));
  const getTask = () => deps.store.get().queue.find(candidate => candidate.id === task.id);
  const assertLease = async () => {
    signal.throwIfAborted();
    const current = getTask();
    if (!current || current.status !== "running") throw new Error("Long-video Queue ownership changed");
    if (!deps.store.get().queueRunning) throw new LongVideoPausedError("已在完整物理组后暂停");
    const runtime = deps.getComfyRuntimeState?.();
    if (runtime && (runtime.ownership !== "app" || !["ready", "degraded"].includes(runtime.phase))) throw new Error("Long-video execution requires the app-owned local runtime");
  };
  await assertLease();
  let snapshot = task.longVideoExecution;
  if (!snapshot) {
    const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    if (task.taskType === "extension" && task.longVideoRunSource) {
      snapshot = freezeLongVideoExtensionPlan(task.id, task.id, task.longVideoPlan, task.longVideoRunSource, { frameInterpolation: task.frameInterpolation });
    } else {
    const modelId = task.modelId;
    const piH3 = modelId === PI_H3_MODEL_ID;
    const references = task.h3ReferenceSlots ?? [];
    const imageSlots = references.filter(slot => slot.mediaType === "image");
    const filled = references.filter(slot => slot.mediaPath.trim());
    const referenceModel = isContinuumReferenceModel(modelId);
    if (task.taskType !== "generation" || (!referenceModel && !isContinuumFl2vaModel(modelId)) ||
        (referenceModel && (filled.length > 9 || filled.some(slot => slot.mediaType !== "image"))) ||
        !["off", "balanced"].includes(task.spectrumMode ?? "off") || !["sage", "sage-triton", "comfy-kitchen", "pytorch"].includes(task.attentionMode ?? "")) {
      throw new Error("Long-video claimed configuration is unsupported; the saved choices have not been replaced");
    }
    const assets = miniMaxH3ModelAssetNames(task.modelId);
    if (!assets) throw new Error("Missing H3 model catalog identity");
    const issue = videoLoraConfigurationIssues({ modelId: task.modelId, inputMode: "image", videoLoras: task.videoLoras ?? [],
      spectrumMode: task.spectrumMode ?? "off", attentionMode: task.attentionMode ?? "sage", locale: settings.uiLocale }).find(i => i.severity === "error");
    if (issue) throw new Error(issue.message);
    const [width, height] = outputDimensions(task);
    const base = settings.comfyUrl.replace(/\/+$/u, "");
    const layout = task.longVideoPlan.layout;
    const guides = task.h3TimedGuides;
    if (guides?.length) {
      const guideIssue = longVideoGuideIssue(guides, layout);
      if (guideIssue) throw new Error(`Invalid Continuum output-timeline keyframes: ${guideIssue}`);
    }
    const guideCues = guides?.length ? longVideoGuideCues(guides, layout) : [];
    const opening = referenceModel ? undefined : guideCues.length ? guideCues.find(guide => guide.frame === 0)?.mediaPath : task.startImagePath;
    const firstImage = opening ? await uploadInput(base, opening, signal, "首帧") : undefined;
    const lastImage = !referenceModel && !guideCues.length && task.endImagePath
      ? await uploadInput(base, task.endImagePath, signal, "尾帧") : undefined;
    const referenceImages = referenceModel ? await Promise.all(imageSlots.map((slot, index) =>
      slot.mediaPath.trim() ? uploadInput(base, slot.mediaPath, signal, `Picture ${index + 1}`) : "")) : undefined;
    const timedGuides = await Promise.all(guideCues.map(async guide => ({
      picture: guide.picture,
      filename: referenceImages?.[guide.picture - 1] ?? ((guide.frame === 0 && firstImage) ||
        await uploadInput(base, guide.mediaPath, signal, `Picture ${guide.picture}`)),
      absoluteFrame: guide.frame
    })));
    const referenceRouting = referenceImages
      ? deriveContinuumReferenceRouting(compileLongVideoPrompts(task.longVideoPlan), referenceImages, timedGuides, layout.chunkSeconds)
      : undefined;
    snapshot = { schemaVersion: 1, taskId: task.id, executionId: task.id, projectId: `lvs_${task.id}`, runName: `lvs_${task.id}`,
      script: structuredClone(task.longVideoPlan), profile: { ...assets, executionMode: "full_run", videoVae: h3VideoVaeFilename(task.h3VideoVaeMode ?? "fp16"), width, height,
        seed: task.seed, steps: normalizeH3Steps(task.steps, task.modelId, task.videoLoras),
        sampler: piH3 ? PI_H3_SAMPLER : template["6"].inputs.sampler_name,
        scheduler: piH3 ? PI_H3_SCHEDULER : template["7"].inputs.scheduler,
        chunkSeconds: layout.chunkSeconds, prompts: [], firstImage,
        ...(lastImage ? { lastImage } : {}),
        ...(referenceImages ? { referenceImages } : {}),
        ...(referenceRouting ? { referenceRouting } : {}),
        ...(timedGuides.length ? { timedGuides } : {}),
        attention: task.attentionMode === "pytorch" ? "sdpa" : task.attentionMode ?? "sage", spectrumMode: task.spectrumMode, delivery: { frameInterpolation: task.frameInterpolation },
        h3: { modelId, videoLoras: structuredClone(task.videoLoras ?? []), sparseAttentionMode: task.h3SparseAttentionMode ?? "off",
          runtimeMode: task.h3RuntimeMode ?? "compatibility", comfyCompilerMode: task.h3ComfyCompilerMode ?? "disabled", spectrumModelAwareMode: task.spectrumModelAwareMode ?? "off" } } };
    snapshot.profile.prompts = compileLongVideoSamplingPrompts(snapshot.script, snapshot.profile);
    }
    assertLongVideoExecutionSnapshot(snapshot);
    const compiled = compileContinuumGroupWorkflow(template, { execution_id: task.id, step_id: "group-1", attempt_id: "attempt-1", project_id: snapshot.projectId,
      ...(snapshot.profile.executionMode === "full_run" ? { execution_mode: "full_run" as const } : {}),
      run_name: snapshot.runName, planned_chunks: snapshot.script.layout.totalChunks, expected_prefix_chunks: snapshot.parent?.receipt.accepted_chunks ?? 0,
      expected_parent_revision_id: snapshot.parent?.receipt.revision_id ?? "" }, snapshot.profile);
    snapshot.profile.sampler = String(compiled["6"].inputs.sampler_name);
    snapshot.profile.scheduler = snapshot.profile.h3?.modelId === PI_H3_MODEL_ID
      ? compiled["7"].class_type : String(compiled["7"].inputs.scheduler);
    snapshot.profile.steps = Number(compiled["7"].inputs.steps);
    await deps.updateTask(task.id, { longVideoExecution: snapshot } as Partial<GenerationQueueTask>);
  }
  let lastPromptId = task.comfyPromptId ?? "";
  const transport = continuumParentTransport(settings, templatePath);
  const result = await runLongVideoExecution(task.longVideoRoot, snapshot, {
    ...transport, assertLease,
    assertSource: async (source, sourceSignal) => { await verifyLongVideoRunSource(path.dirname(task.longVideoRoot!), source, sourceSignal); },
    onSubmitted: async submission => {
      lastPromptId = submission.promptId;
      await deps.updateTask(task.id, { comfyPromptId: submission.promptId });
    },
    onProgress: async (accepted, planned, groupProgress, stage) => {
      const prefix = snapshot.script.layout.prefixChunks;
      const fraction = snapshot.profile.executionMode === "full_run" && stage !== "group-accepted" ? groupProgress / 100 : (accepted - prefix + (stage === "group-accepted" ? 0 : groupProgress / 100)) / (planned - prefix);
      await deps.updateTaskProgress(task.id, { progress: Math.min(98, Math.round(fraction * 95)),
        stage: snapshot.profile.executionMode === "full_run" && stage !== "group-accepted" ? stage : `Continuum ${accepted}/${planned} · ${stage}`,
        longVideoGroupProgress: Number.isFinite(groupProgress) ? Math.max(0, Math.min(100, groupProgress)) : undefined,
        workProgress: { value: accepted - prefix, max: planned - prefix, unit: "piece", startedAt: task.startedAt ?? task.createdAt, sampledAt: new Date().toISOString() } });
    },
    validateFinal: async (frozen, final, currentSignal) => {
      const files = await deps.requireExistingVideoOutput({ outputs: final.outputs }, [settings.outputDirectory]);
      return inspectLongVideoMedia(frozen, files, currentSignal);
    },
    publish: async (frozen, media, identity, currentSignal, final) => {
      const files: HistoryFile[] = await deps.requireExistingVideoOutput({ outputs: final.outputs }, [settings.outputDirectory]);
      for (const file of media.files) if ((await fs.stat(file.path)).size !== file.bytes || await hashLongVideoFile(file.path, currentSignal) !== file.sha256) throw new Error("Validated output changed before History publication");
      const completedAt = new Date().toISOString();
      const state = await deps.store.update(state => {
        const existing = state.history.find(asset => asset.id === identity.assetId || asset.taskId === task.id);
        if (existing) {
          if (!existing.versions.some(version => version.id === identity.versionId)) throw new Error("Conflicting parent History identity");
          state.queue = state.queue.filter(candidate => candidate.id !== task.id); return;
        }
        const current = state.queue.find(candidate => candidate.id === task.id);
        if (current?.status !== "running") throw new Error("Long-video publication lost Queue ownership");
        const previousQueue = [...state.queue];
        let idIndex = 0;
        persistVideoHistoryResult(state, { task, completedAt, promptId: current.comfyPromptId ?? lastPromptId, comfyOutputs: { outputs: final.outputs }, files,
          actualDuration: media.videoFrames / longVideoOutputFps(frozen), id: () => [identity.versionId, identity.assetId][idIndex++]! });
        const asset = state.history.find(asset => asset.id === identity.assetId)!;
        asset.fps = longVideoOutputFps(frozen);
        asset.versions[0]!.fps = longVideoOutputFps(frozen);
        asset.versions[0]!.longVideoExecution = structuredClone(frozen);
        asset.versions[0]!.longVideoReceipt = structuredClone(final.receipt);
        const boundary = queuePauseBoundaryAfterTaskCompletion(previousQueue, state.queuePauseBoundary, task.id, state.queue);
        state.queuePauseBoundary = boundary.boundary;
        if (boundary.reached) state.queueRunning = false;
      });
      deps.sendState(state);
    }
  }, signal);
  if (result.phase === "uncertain-submission") throw new Error("Continuum 提交结果不明，已停止自动重采样；需核对实际 Run 与服务端任务。");
  if (result.phase === "needs-assembly") throw new Error("Continuum 已完成采样，但只有当前组输出；已保留检查点，需完整 Run 合成。");
}
