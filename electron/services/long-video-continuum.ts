/** Internal group executor. Queue/lease ownership is supplied by the caller. */
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import type { Settings } from "../../src/types.js";
import { compileContinuumGroupWorkflow, type ContinuumGroupProfile } from "../../src/core/long-video/group-workflow.js";
import { acceptContinuumGroupCheckpoint, type ContinuumGroupRequest } from "../../src/core/long-video/group-checkpoint.js";
import { assertImageWorkflowRuntimeCompatible, jsonRequest, waitForTask } from "./comfy-ui.js";

export async function submitContinuumGroup(settings: Settings, templatePath: string, request: ContinuumGroupRequest, profile: ContinuumGroupProfile, signal: AbortSignal, beforePost: () => Promise<void> = async () => {}) {
  const frozenRequest = structuredClone(request);
  const graph = compileContinuumGroupWorkflow(JSON.parse(await fs.readFile(templatePath, "utf8")), frozenRequest, structuredClone(profile));
  const base = settings.comfyUrl.replace(/\/+$/u, "");
  const objectInfo = await jsonRequest<Record<string, unknown>>(`${base}/object_info`, { signal });
  if (Array.isArray(graph["12"]?.inputs.guide)) {
    const sampler = objectInfo.H3ContinuumSamplerV38 as { input?: { optional?: Record<string, unknown> } } | undefined;
    const guideSchema = sampler?.input?.optional?.guide;
    if (!Array.isArray(guideSchema) || guideSchema[0] !== "H3_CONTINUUM_STILL_IMAGE_GUIDE" ||
        !objectInfo.LocalVideoStudioH3ContinuumTimedGuide) {
      throw new Error("Continuum runtime lacks timed keyframes; update the Local Video Studio H3 nodes and check Continuum Still Image Guide support.");
    }
  }
  assertImageWorkflowRuntimeCompatible(profile.h3?.modelId ?? "minimax_h3_fl2va", graph, objectInfo);
  const receiptSchema = objectInfo.LocalVideoStudioH3ContinuumGroupReceipt as { input?: { optional?: Record<string, unknown> } } | undefined;
  for (const input of ["expected_prefix_chunks", "expected_parent_revision_id", "sampling_evidence_version", ...(profile.executionMode === "full_run" ? ["execution_mode"] : [])]) {
    if (!receiptSchema?.input?.optional?.[input]) throw new Error("Continuum group runtime lacks the registered Run-lock guard; update app H3 nodes and restart");
  }
  const queue = await jsonRequest<{ queue_running?: unknown[]; queue_pending?: unknown[] }>(`${base}/queue`, { signal });
  if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending) || queue.queue_running.length || queue.queue_pending.length) {
    throw new Error("Continuum group requires an idle owned runtime");
  }
  const clientId = `local-video-studio-${crypto.randomUUID()}`;
  // The parent persists its intent before any request that can start sampling.
  await beforePost();
  signal.throwIfAborted();
  const result = await jsonRequest<{ prompt_id?: string }>(`${base}/prompt`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ prompt: graph, client_id: clientId })
  });
  if (!result.prompt_id) throw new Error("ComfyUI did not return a group prompt ID");
  return { promptId: result.prompt_id, clientId, nodeTypes: Object.fromEntries(Object.entries(graph).map(([id, node]) => [id, node.class_type])), request: frozenRequest };
}

export async function waitForContinuumGroup(submission: Awaited<ReturnType<typeof submitContinuumGroup>>, settings: Settings, signal: AbortSignal, onProgress: (value: number, stage: string) => void = () => {}) {
  const fullRun = submission.request.execution_mode === "full_run";
  let completedChunks = 0;
  let chunkFinished = false;
  let samplingSeen = false;
  const history = await waitForTask(
    submission.promptId, submission.clientId, submission.nodeTypes, settings,
    // A responsive Full Run can compute for longer than a fixed silence window.
    // Transport/process failures and explicit cancellation remain independently checked.
    fullRun ? Number.POSITIVE_INFINITY : 20, signal,
    (value, stage, _determinate, work) => {
      if (fullRun && samplingSeen && work?.unit === "step") return;
      onProgress(value, stage);
    },
    () => {}, undefined, undefined, undefined, undefined,
    event => {
      if (!fullRun || event.type !== "progress" || event.unit !== "step" ||
          !event.nodeId || !["H3ContinuumSamplerV38", "LocalVideoStudioH3ContinuumSamplerV38"].includes(submission.nodeTypes[event.nodeId]) ||
          !Number.isFinite(event.value) || !Number.isFinite(event.max) || event.max! <= 0) return;
      samplingSeen = true;
      const value = Math.max(0, Math.min(event.max!, event.value!));
      if (value < event.max!) chunkFinished = false;
      if (value === event.max! && !chunkFinished) {
        completedChunks = Math.min(submission.request.planned_chunks, completedChunks + 1);
        chunkFinished = true;
      }
      const fraction = Math.min(1, (completedChunks + (chunkFinished ? 0 : value / event.max!)) / submission.request.planned_chunks);
      onProgress(14 + fraction * 66, `Continuum ${completedChunks}/${submission.request.planned_chunks} · ${value}/${event.max}`);
    }
  );
  const outputs = (history as { outputs?: Record<string, { h3_continuum_group_receipt?: unknown[] }> }).outputs;
  const receipts = outputs?.["24"]?.h3_continuum_group_receipt;
  if (!Array.isArray(receipts) || receipts.length !== 1) throw new Error("Continuum group is missing a unique checkpoint receipt");
  return { receipt: acceptContinuumGroupCheckpoint(submission.request, receipts[0]), outputs };
}
