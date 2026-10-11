import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import { promptModelBackend, promptRuntimeForSettings, promptModelSupportsImageEdit } from "../src/core/prompt-models.js";
import { promptModelStatus } from "../src/renderer/shared/status.js";
import { strataPreparationProfiles } from "../src/core/strata-preparation.js";
import { buildStrataPromptRequest, enhancePromptWithStrata, strataImageContent, strataPromptPolicy } from "../electron/services/strata-prompt.js";
import { PromptApplicationService } from "../electron/services/prompt-application-service.js";
import { PromptRuntimeManager } from "../electron/services/prompt-runtime-manager.js";
import { scanEnvironment } from "../electron/services/environment.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import type { StateRepository } from "../electron/ports/state-repository.js";
import type { EnvironmentScanResult, EnhanceRequest, PromptProgress } from "../src/types.js";
import type { StrataServiceSnapshot } from "../electron/services/strata-service.js";

vi.mock("../electron/services/environment.js", async (original) => ({
  ...await original<typeof import("../electron/services/environment.js")>(), scanEnvironment: vi.fn()
}));
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
beforeEach(() => vi.mocked(scanEnvironment).mockReset());
const modelId = "strata/qwen3.8-flash-next-iq3_xxs";
const request: EnhanceRequest = { prompt: "Change the red car to blue.", modelId: "qwen-image-edit", mode: "image-edit", origin: "image-edit" };
async function imageFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-image-")); roots.push(root);
  const filename = path.join(root, "reference.png");
  await fs.writeFile(filename, Buffer.from([137,80,78,71,13,10,26,10,0,0]));
  return filename;
}
function fixture() {
  const state = createDefaultState(); state.settings.promptModelId = modelId;
  const profiles = strataPreparationProfiles();
  profiles.forEach((profile) => { profile.available = true; profile.components.forEach((component) => component.found = true); });
  const scan = { modelDirectory: "selected/shared/models", modelProfiles: profiles, gpus: [],
    strataPreparation: { managedInstalled: true } } as unknown as EnvironmentScanResult;
  vi.mocked(scanEnvironment).mockResolvedValue(scan);
  const manager = new PromptRuntimeManager({ phase: "stopped", ownership: "none", endpoint: "http://127.0.0.1:8188", message: "", updatedAt: "", operationId: 0 });
  let snapshot: StrataServiceSnapshot = { phase: "stopped", port: null, pid: null, modelLoaded: null, message: "", log: "" };
  const owner = {
    snapshot: () => snapshot, isBusy: () => false, runningWorker: null,
    ensurePromptReady: vi.fn(async (_settings, _policy, options) => {
      options.signal.throwIfAborted(); options.onLog?.("SHA-256 · shard · 25%");
      snapshot = { ...snapshot, phase: "ready", pid: 123, port: 43127, modelLoaded: true }; return snapshot;
    }),
    chat: vi.fn(async (_request, signal, onText) => { signal.throwIfAborted(); onText?.("The blue car."); return "The blue car."; }),
    stop: vi.fn(async () => { snapshot = { ...snapshot, phase: "stopped", pid: null, port: null, modelLoaded: null }; return snapshot; })
  };
  const progress: PromptProgress[] = [];
  const service = new PromptApplicationService({
    store: { get: () => state } as StateRepository,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppLogger,
    promptRuntimeManager: manager, externalRuntime: owner, strata: owner,
    isQueueBusy: () => state.queueRunning, sendProgress: (value) => progress.push(value), errorMeta: () => ({})
  });
  return { service, state, owner, scan, manager, progress };
}

describe("Strata product prompt integration (synthetic ports, no GPU)", () => {
  it("routes only catalog IDs and keeps legacy provider settings from hijacking Strata", () => {
    expect(promptModelBackend(modelId)).toBe("strata");
    expect(promptModelBackend("strata/unknown")).toBeNull();
    expect(promptRuntimeForSettings({ promptModelId: modelId, promptRuntime: "lmstudio", promptUseLmStudio: true })).toBe("strata");
    expect(promptModelSupportsImageEdit(modelId)).toBe(true);
    expect(promptRuntimeForSettings({ promptModelId: "qwen/qwen3.5-4b" })).toBe("comfyui");
  });
  it("requires software and files while keeping runtime evidence unverified", () => {
    const f = fixture();
    expect(promptModelStatus(f.state.settings, f.scan).ready).toBe(true);
    expect(f.scan.modelProfiles[0].runtimeVerified).toBe(false);
    f.scan.strataPreparation!.managedInstalled = false;
    expect(promptModelStatus(f.state.settings, f.scan)).toMatchObject({ ready: false, detail: expect.stringContaining("Strata") });
    f.scan.modelProfiles[0].available = false;
    expect(promptModelStatus(f.state.settings, f.scan).ready).toBe(false);
  });
  it("uses the existing enhance operation, shared model root, progress and release handoff", async () => {
    const f = fixture(), before = structuredClone(f.state);
    expect(await f.service.enhance(request)).toBe("The blue car.");
    expect(f.owner.ensurePromptReady).toHaveBeenCalledWith(f.state.settings, strataPromptPolicy(f.state.settings),
      expect.objectContaining({ resolvedModelDirectory: "selected/shared/models", signal: expect.any(AbortSignal) }));
    expect(f.owner.chat.mock.calls[0][0]).toMatchObject({ modelId, maxTokens: 4096, messages: [{ role: "user" }] });
    expect(f.manager.snapshot()).toMatchObject({ service: { backend: "strata", phase: "ready" }, model: { phase: "resident", modelId },
      operation: { phase: "terminal", origin: "image-edit", terminalStatus: "completed" } });
    expect(f.progress.some((event) => event.stage === "loading-model" && event.detail?.includes("25%"))).toBe(true);
    expect(f.progress.at(-1)?.status).toBe("completed");
    expect(f.state).toEqual(before); // Renderer alone creates versions; the backend never mutates draft/queue/history.
    await f.service.releaseRuntime(f.state.settings);
    expect(f.owner.stop).toHaveBeenCalledOnce();
    expect(f.manager.snapshot().model.phase).toBe("unloaded");
  });
  it("starts through real model loading, with operation/progress and no chat request", async () => {
    const f = fixture();
    expect(await f.service.start()).toMatchObject({ ok: true, message: expect.stringContaining("Strata") });
    expect(f.owner.ensurePromptReady).toHaveBeenCalledOnce(); expect(f.owner.chat).not.toHaveBeenCalled();
    expect(f.progress.at(-1)?.status).toBe("completed");
    await f.service.releaseForUser();
  });
  it("can cancel first-use preparation through the existing cancel API", async () => {
    const f = fixture();
    f.owner.ensurePromptReady.mockImplementationOnce(async (_settings, _policy, options) => {
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
      options.signal.throwIfAborted(); throw new Error("unreachable");
    });
    const start = f.service.start();
    await vi.waitFor(() => expect(f.owner.ensurePromptReady).toHaveBeenCalled());
    expect(await f.service.cancel()).toMatchObject({ ok: true });
    expect(await start).toMatchObject({ ok: false });
    expect(f.manager.snapshot()).toMatchObject({ model: { phase: "unloaded" }, operation: { terminalStatus: "cancelled" } });
    expect(f.service.isPromptBusy()).toBe(false);
  });
  it("rejects partial output on cancellation without saving or retaining a model", async () => {
    const f = fixture(), before = structuredClone(f.state);
    f.owner.chat.mockImplementationOnce(async (_request, signal, onText) => {
      onText?.("partial");
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      signal.throwIfAborted(); return "unreachable";
    });
    const enhance = f.service.enhance(request); const rejected = expect(enhance).rejects.toThrow("取消");
    await vi.waitFor(() => expect(f.owner.chat).toHaveBeenCalled());
    expect(await f.service.cancel()).toMatchObject({ ok: true });
    await rejected;
    expect(f.progress.at(-1)?.status).toBe("cancelled"); expect(f.state).toEqual(before);
    expect(f.manager.snapshot().model.phase).toBe("unloaded");
  });
  it("keeps failed cleanup occupancy and exposes retry release", async () => {
    const f = fixture(); await f.service.start();
    f.owner.stop.mockRejectedValueOnce(new Error("still running"));
    expect(await f.service.releaseForUser()).toMatchObject({ ok: false });
    expect(f.manager.snapshot()).toMatchObject({ service: { phase: "degraded" }, model: { phase: "unknown", modelId } });
    expect(await f.service.releaseForUser()).toMatchObject({ ok: true });
    expect(f.manager.snapshot().model.phase).toBe("unloaded");
  });
  it("does not accept stream or validation failure as a new result", async () => {
    const f = fixture(), before = structuredClone(f.state);
    f.owner.chat.mockRejectedValueOnce(new Error("token limit"));
    await expect(f.service.enhance(request)).rejects.toThrow("token limit");
    expect(f.state).toEqual(before); expect(f.progress.at(-1)?.status).toBe("failed");
    expect(f.manager.snapshot().model.phase).toBe("unloaded");
  });
  it("preserves the queue gate and rejects unsupported GPU/driver before preparing", async () => {
    const f = fixture(); f.state.queueRunning = true;
    expect(await f.service.start()).toMatchObject({ ok: false });
    await expect(f.service.enhance(request)).rejects.toThrow("任务");
    expect(f.owner.ensurePromptReady).not.toHaveBeenCalled();
    f.state.queueRunning = false; f.scan.gpus = [{ index: 0, name: "GPU", driverVersion: "579", vramTotalBytes: 24 * 1024 ** 3 }];
    expect(await f.service.start()).toMatchObject({ ok: false, message: expect.stringContaining("580") });
    expect(f.owner.ensurePromptReady).not.toHaveBeenCalled();
  });
  it("ignores ComfyUI failure only during Strata ownership and restores ComfyUI facts on switching", () => {
    const f = fixture(); f.manager.selectBackend("strata");
    const lease = f.manager.beginOperation("video-extension", true);
    f.manager.observeService({ phase: "error", ownership: "none", endpoint: "comfy", message: "", updatedAt: "", operationId: 90 });
    expect(lease.signal.aborted).toBe(false); expect(f.manager.snapshot().operation.phase).not.toBe("terminal");
    f.manager.finishOperation(lease.operationId, "completed"); f.manager.selectBackend("comfyui");
    expect(f.manager.snapshot().service.phase).toBe("error");
  });
});

describe("Strata Pack, image and output contracts", () => {
  it("keeps ordered FL2VA images, user intent, custom preset and locked multilingual dialogue", async () => {
    const settings = createDefaultState().settings; settings.promptModelId = modelId;
    const req: EnhanceRequest = { prompt: 'A woman says in Japanese: "大丈夫？" Keep the camera fixed.',
      modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptMode: "FL2VA", h3PromptPreset: "detailed-cinematic",
      imagePaths: ["first.png", "last.png"], referenceContext: "<Picture 1> = first frame; <Picture 2> = last frame" };
    const encode = vi.fn(async (filename: string) => ({ type: "image_url" as const, image_url: { url: filename } }));
    const chat = await buildStrataPromptRequest(req, settings, new AbortController().signal, encode);
    expect(encode.mock.calls.map(([filename]) => filename)).toEqual(["first.png", "last.png"]);
    expect(chat.maxTokens).toBe(8192);
    expect(JSON.stringify(chat.messages)).toContain("大丈夫？");
    expect(JSON.stringify(chat.messages)).toContain("Keep the camera fixed.");
    expect(JSON.stringify(chat.messages)).toContain("<Picture 2>");
    expect(JSON.stringify(chat.messages)).not.toContain("VisionLLM language-check compatibility");
  });
  it("does not truncate overlong inputs and does not enlarge context from H3 GPU settings", async () => {
    const f = fixture();
    await expect(buildStrataPromptRequest({ ...request, prompt: "字".repeat(40000) }, f.state.settings, new AbortController().signal)).rejects.toThrow("上下文");
    expect(strataPromptPolicy({ vramReserveGb: 20 })).toEqual(strataPromptPolicy({ vramReserveGb: 2 }));
  });
  it("encodes supported local images and rejects unsupported/cancelled reads", async () => {
    const filename = await imageFixture(), signal = new AbortController().signal;
    expect(await strataImageContent(filename, signal)).toMatchObject({ type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) } });
    await fs.writeFile(filename, "not an image");
    await expect(strataImageContent(filename, signal)).rejects.toThrow("格式");
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    await expect(strataImageContent(filename, controller.signal)).rejects.toThrow("cancelled");
  });
  it("normalizes an H3 envelope and refuses a short detailed-cinematic result", async () => {
    const settings = createDefaultState().settings; settings.promptModelId = modelId;
    const req: EnhanceRequest = { prompt: "A woman waves.", modelId: "minimax_h3_fl2va", mode: "h3-vision", h3PromptMode: "T2VA", h3PromptPreset: "detailed-cinematic" };
    const chat = vi.fn(async () => "integrated_multimodal_description: [Shot 1] The woman waves.\noverall_soundscape: N/A\nnon_diegetic_music: N/A");
    await expect(enhancePromptWithStrata(req, settings, { chat }, new AbortController().signal, vi.fn())).rejects.toThrow();
  });
});
