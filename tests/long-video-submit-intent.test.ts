import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import type { Settings } from "../src/types";
import { jsonRequest } from "../electron/services/comfy-ui";
import { submitContinuumGroup } from "../electron/services/long-video-continuum";

vi.mock("../electron/services/comfy-ui", () => ({ jsonRequest: vi.fn(), assertImageWorkflowRuntimeCompatible: vi.fn(), waitForTask: vi.fn() }));
const request = { execution_id: "execution", step_id: "group-1", attempt_id: "attempt-1", project_id: "project", run_name: "run", planned_chunks: 2, expected_prefix_chunks: 0, expected_parent_revision_id: "" };
const profile = { diffusionModel: "model", textEncoder: "clip", videoVae: "vae", width: 256, height: 256, seed: 42, steps: 8,
  sampler: "euler", scheduler: "simple", chunkSeconds: 5, prompts: ["first", "second"], firstImage: "uploaded.png", attention: "sdpa" as const };
const settings = { comfyUrl: "http://127.0.0.1:8199" } as Settings;
const template = path.resolve("workflows/minimax_h3_continuum_v38_managed_extend_api.json");
beforeEach(() => {
  vi.mocked(jsonRequest).mockReset();
  vi.mocked(jsonRequest).mockResolvedValueOnce({ LocalVideoStudioH3ContinuumGroupReceipt: { input: { optional: {
    expected_prefix_chunks: ["INT"], expected_parent_revision_id: ["STRING"], sampling_evidence_version: ["INT"]
  } } } }).mockResolvedValueOnce({ queue_running: [], queue_pending: [] }).mockResolvedValueOnce({ prompt_id: "prompt-1" });
});
describe("durable parent sampling intent", () => {
  it("awaits the durable intent after preflight and before the only POST", async () => {
    let release!: () => void;
    const beforePost = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const submitted = submitContinuumGroup(settings, template, request, profile, new AbortController().signal, beforePost);
    await vi.waitFor(() => expect(beforePost).toHaveBeenCalledTimes(1));
    expect(jsonRequest).toHaveBeenCalledTimes(2);
    release(); expect((await submitted).promptId).toBe("prompt-1");
    expect(vi.mocked(jsonRequest).mock.calls[2]![1]?.method).toBe("POST");
  });
  it("never POSTs when persisting intent fails", async () => {
    await expect(submitContinuumGroup(settings, template, request, profile, new AbortController().signal, async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
    expect(jsonRequest).toHaveBeenCalledTimes(2);
  });
  it("never POSTs when cancellation arrives while intent is being persisted", async () => {
    const controller = new AbortController();
    await expect(submitContinuumGroup(settings, template, request, profile, controller.signal, async () => { controller.abort(); })).rejects.toThrow();
    expect(jsonRequest).toHaveBeenCalledTimes(2);
  });
});
