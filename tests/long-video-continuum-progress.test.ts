import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { waitForContinuumGroup } from "../electron/services/long-video-continuum";
import { waitForTask } from "../electron/services/comfy-ui";

vi.mock("../electron/services/comfy-ui", () => ({ waitForTask: vi.fn() }));
vi.mock("../src/core/long-video/group-checkpoint", () => ({ acceptContinuumGroupCheckpoint: (_request: unknown, receipt: unknown) => receipt }));
beforeEach(() => { vi.mocked(waitForTask).mockReset(); });

const submission = (fullRun = true) => ({
  promptId: "prompt", clientId: "client", nodeTypes: { "12": "H3ContinuumSamplerV38", "16": "VideoCombine" },
  request: { execution_id: "execution", step_id: "step", attempt_id: "attempt", project_id: "project", run_name: "run", planned_chunks: 2, expected_prefix_chunks: 0, expected_parent_revision_id: "", ...(fullRun ? { execution_mode: "full_run" as const } : {}) }
});
const history = { outputs: { "24": { h3_continuum_group_receipt: [{ complete: true }] } } };

it("counts repeated step cycles across Full Run without treating the first chunk as the whole film", async () => {
  const progress = vi.fn();
  vi.mocked(waitForTask).mockImplementation(async (...args) => {
    expect(args[4]).toBe(Number.POSITIVE_INFINITY);
    args[6](8, "loading", true);
    const step = (value: number, nodeId = "12") => args[12]?.({ type: "progress", atMs: 1, nodeId, value, max: 20, unit: "step" });
    step(10, "16"); // Unrelated nodes cannot advance the chunk count.
    step(10);
    args[6](47, "generic single-chunk progress", true, { value: 10, max: 20, unit: "step", startedAt: "", sampledAt: "" });
    step(20); step(20); // Duplicate terminal event is still one completed chunk.
    step(10); step(20);
    args[6](90, "decode", true);
    return history;
  });
  await waitForContinuumGroup(submission(), createDefaultSettings(), new AbortController().signal, progress);
  expect(progress.mock.calls).toEqual([
    [8, "loading"], [30.5, "Continuum 0/2 · 10/20"],
    [47, "Continuum 1/2 · 20/20"], [47, "Continuum 1/2 · 20/20"],
    [63.5, "Continuum 1/2 · 10/20"], [80, "Continuum 2/2 · 20/20"], [90, "decode"]
  ]);
});

it("keeps legacy Review timeout and forwards its existing progress", async () => {
  const progress = vi.fn();
  vi.mocked(waitForTask).mockImplementation(async (...args) => {
    expect(args[4]).toBe(20);
    args[12]?.({ type: "progress", atMs: 1, nodeId: "12", value: 10, max: 20, unit: "step" });
    args[6](47, "sampling", true);
    return history;
  });
  await waitForContinuumGroup(submission(false), createDefaultSettings(), new AbortController().signal, progress);
  expect(progress.mock.calls).toEqual([[47, "sampling"]]);
});
