import { afterEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { JsonStore } from "../electron/store";
import { createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript, editLongVideoScript, freezeLongVideoScript } from "../src/core/long-video/script";
import type { LongVideoExecutionSnapshot, LongVideoMediaEvidence } from "../src/core/long-video/execution";
import type { LongVideoExecutionPorts } from "../electron/services/long-video-execution";
import { executeQueuedLongVideo, LongVideoPausedError } from "../electron/services/long-video-queue";

const execution = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../electron/services/long-video-execution.js", () => ({ runLongVideoExecution: execution.run, continuumParentTransport: () => ({}) }));
vi.mock("../electron/services/comfy-ui.js", async importOriginal => ({ ...await importOriginal<typeof import("../electron/services/comfy-ui")>(), uploadInput: vi.fn(async () => "uploaded-first.png") }));
const directories: string[] = [];
afterEach(async () => { execution.run.mockReset(); await Promise.all(directories.splice(0).map(d => fs.rm(d, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-parent-queue-")); directories.push(directory);
  const initial = createDefaultState();
  let i = 0; const id = () => `page-${++i}`;
  const base = createLongVideoScript(createLongVideoLayout(10, 2), id);
  const script = editLongVideoScript(base, base.segments.map((p, i) => ({ pageId: p.id, text: `Action ${i}` })), 0, "user", id);
  // Native factory supplies the established History-compatible task fields.
  const task = queueTaskFromDraft(initial.draft, initial);
  task.longVideoRoot = path.join(directory, "runs"); task.longVideoPlan = freezeLongVideoScript(script); task.duration = 10; task.status = "running";
  task.longVideoExecution = { schemaVersion: 1, taskId: task.id, executionId: task.id, projectId: `lvs_${task.id}`, runName: `lvs_${task.id}`,
    script: task.longVideoPlan, profile: { diffusionModel: "model", textEncoder: "clip", videoVae: "vae", width: 256, height: 256, seed: 42,
      steps: 20, sampler: "euler", scheduler: "simple", chunkSeconds: 5, prompts: ["Action 0", "Action 1"], firstImage: "first.png", attention: "sdpa" } };
  const movie = path.join(directory, "movie.mp4"); await fs.writeFile(movie, "validated fixture bytes");
  const file = { filename: "movie.mp4", absolutePath: movie, subfolder: "", type: "output" as const };
  const bytes = await fs.readFile(movie);
  const media: LongVideoMediaEvidence = { files: [{ path: movie, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
    videoFrames: 240, audioContentSamples: 480000, audioSampleRate: 48000, codecPaddingSamples: 0, fullDecode: true };
  initial.queue = [task]; initial.queueRunning = true;
  const filename = path.join(directory, "state.json"); await fs.writeFile(filename, JSON.stringify(initial));
  const store = new JsonStore(filename); await store.load();
  await store.update(s => { s.queue[0]!.status = "running"; s.queueRunning = true; });
  const deps = { store, sendState: vi.fn(), updateTask: vi.fn(), updateTaskProgress: vi.fn(), requireExistingVideoOutput: vi.fn(async () => [file]) };
  return { directory, filename, task, media, deps, signal: new AbortController().signal };
}
it("claims Sage Triton with Spectrum and freezes the chosen backend before executing groups", async () => {
  const f = await fixture();
  f.task.longVideoExecution = undefined;
  Object.assign(f.task, { modelId: "minimax_h3_fl2va", startImagePath: "first.png", endImagePath: "", videoLoras: [], h3ReferenceSlots: [],
    attentionMode: "sage-triton", spectrumMode: "balanced", h3SparseAttentionMode: "off", h3RuntimeMode: "compatibility", h3ComfyCompilerMode: "disabled", frameInterpolation: "off", resolution: 360 });
  execution.run.mockImplementation(async (_root: string, snapshot: LongVideoExecutionSnapshot) => {
    expect(snapshot.profile.attention).toBe("sage-triton");
    expect(snapshot.profile.spectrumMode).toBe("balanced");
    expect(snapshot.profile.firstImage).toBe("uploaded-first.png");
    return { phase: "published" };
  });
  await executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal);
  expect(execution.run).toHaveBeenCalledOnce();
  expect(f.deps.updateTask).toHaveBeenCalledWith(f.task.id, expect.objectContaining({ longVideoExecution: expect.objectContaining({ profile: expect.objectContaining({ attention: "sage-triton", spectrumMode: "balanced" }) }) }));
});

it("freezes the complete LoRA, SOL, Kitchen and launch configuration on claim", async () => {
  const f = await fixture(); f.task.longVideoExecution = undefined;
  const lora = { id: "style", name: "style", filename: "style.safetensors", strength: .7, purpose: "style" as const,
    modelFamily: "minimax-h3", compatibleModelIds: ["minimax_h3_fl2va"], compatibleInputModes: ["image" as const], promptPrefixes: ["film look"] };
  Object.assign(f.task, { modelId: "minimax_h3_fl2va", startImagePath: "first.png", endImagePath: "", h3ReferenceSlots: [], videoLoras: [lora],
    attentionMode: "comfy-kitchen", spectrumMode: "balanced", h3SparseAttentionMode: "sol-attn", h3RuntimeMode: "native", h3ComfyCompilerMode: "auto", frameInterpolation: "off", resolution: 360 });
  execution.run.mockImplementation(async (_root: string, snapshot: LongVideoExecutionSnapshot) => {
    expect(snapshot.profile).toMatchObject({ attention: "comfy-kitchen", spectrumMode: "balanced", h3: { videoLoras: [lora], sparseAttentionMode: "sol-attn", runtimeMode: "native", comfyCompilerMode: "auto" } });
    expect(snapshot.profile.prompts.every(p=>p.startsWith("film look"))).toBe(true);
    return { phase: "published" };
  });
  await executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal);
  expect(execution.run).toHaveBeenCalledOnce();
});

it("publishes one durable ordinary History movie with stable IDs when publication is retried", async () => {
  const f = await fixture();
  execution.run.mockImplementation(async (_root: string, snapshot: LongVideoExecutionSnapshot, ports: LongVideoExecutionPorts, signal: AbortSignal) => {
    await ports.assertLease();
    const final = { receipt: { accepted_chunks: 2, final_output: true }, outputs: {} } as Parameters<LongVideoExecutionPorts["publish"]>[4];
    const identity = { assetId: snapshot.taskId, versionId: snapshot.executionId };
    await ports.publish(snapshot, f.media, identity, signal, final);
    await ports.publish(snapshot, f.media, identity, signal, final); // persisted success with lost caller acknowledgement
    return { phase: "published" };
  });
  await executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal);
  const restored = await new JsonStore(f.filename).load();
  expect(restored.queue).toEqual([]); expect(restored.history).toHaveLength(1);
  const asset = restored.history[0]!; expect(asset.id).toBe(f.task.id); expect(asset.taskId).toBe(f.task.id);
  expect(asset.versions).toHaveLength(1); expect(asset.versions[0]!.id).toBe(f.task.id); expect(asset.versions[0]!.duration).toBe(10);
  expect(asset.versions[0]!.longVideoExecution).toEqual(f.task.longVideoExecution);
  expect(asset.versions[0]!.longVideoReceipt?.final_output).toBe(true);
});
it("refuses publication if a validated movie was replaced, leaving the task recoverable", async () => {
  const f = await fixture(); await fs.writeFile(f.media.files[0]!.path, "replaced fixture bytes");
  execution.run.mockImplementation(async (_root: string, snapshot: LongVideoExecutionSnapshot, ports: LongVideoExecutionPorts, signal: AbortSignal) => {
    await ports.publish(snapshot, f.media, { assetId: snapshot.taskId, versionId: snapshot.executionId }, signal, { receipt: {}, outputs: {} } as Parameters<LongVideoExecutionPorts["publish"]>[4]);
  });
  await expect(executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal)).rejects.toThrow(/changed/);
  expect(f.deps.store.get().history).toEqual([]); expect(f.deps.store.get().queue).toHaveLength(1);
});
it("stops before executing another group after the existing Queue pause flag", async () => {
  const f = await fixture(); await f.deps.store.update(s => { s.queueRunning = false; });
  await expect(executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal)).rejects.toBeInstanceOf(LongVideoPausedError);
  expect(execution.run).not.toHaveBeenCalled(); expect(f.deps.store.get().history).toEqual([]);
});
it("keeps actual local group progress separate from accepted-piece parent progress", async () => {
  const f = await fixture();
  execution.run.mockImplementation(async (_root: string, _snapshot: LongVideoExecutionSnapshot, ports: LongVideoExecutionPorts) => {
    await ports.onProgress?.(1, 2, 40, "sampling");
    await ports.onProgress?.(2, 2, 100, "group-accepted");
    return { phase: "published" };
  });
  await executeQueuedLongVideo(f.task, f.deps.store.get().settings, f.deps, f.signal);
  expect(f.deps.updateTaskProgress).toHaveBeenNthCalledWith(1, f.task.id, expect.objectContaining({ progress: 67, longVideoGroupProgress: 40, workProgress: expect.objectContaining({ value: 1, max: 2 }) }));
  expect(f.deps.updateTaskProgress).toHaveBeenNthCalledWith(2, f.task.id, expect.objectContaining({ progress: 95, longVideoGroupProgress: 100 }));
});
