// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { duplicateQueueTask, randomizeQueuedTaskSeed } from "../src/core/queue";
import { applyH3AccelerationSettingsToWaitingTask } from "../src/core/h3-execution-policy";
import type { GenerationQueueTask } from "../src/types";
import { longVideoBlockReason } from "../src/core/long-video/capability";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(() => { journey?.dispose(); journey = undefined; });
it.each(["rife2x", "rife4x"] as const)("retains saved 1080p and %s through enqueue without exposing an H3 interpolation control", async interpolation => {
  const h = journey = await createJourney();
  h.scan.customNodes.find(n => n.id === "h3-continuum")!.version = "3.10.2";
  h.scan.customNodes.find(n => n.id === "local-video-studio-h3-av")!.version = "0.4.0";
  h.input("#generation-mode", "preview", "change");
  expect(h.root.querySelector("#frame-interpolation")).toBeNull();
  h.input("#resolution", "1080", "change");
  h.state().draft.frameInterpolation = interpolation; // Restored legacy draft, not a current UI option.
  h.render();
  expect(h.root.querySelector("#frame-interpolation")).toBeNull();
  h.input("[data-preview-duration-number]", "10"); h.input("[data-preview-count-number]", "2"); h.element("[data-confirm-layout]").click();
  for (const [index, text] of ["The car turns left.", "The car stops."].entries()) {
    h.element(`.create-long-tabs [role="tab"]:nth-child(${index + 2})`).click(); h.input(".create-long-editor textarea", text);
  }
  expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(true);
  h.element("#pick-start").click();
  await vi.waitFor(() => expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(false));
  h.element("#enqueue").click();
  await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
  const task = h.state().queue[0] as GenerationQueueTask;
  expect(task.id).toBeTruthy(); expect(task.resolution).toBe(1080); expect(task.frameInterpolation).toBe(interpolation);
  expect(task.longVideoPlan!.layout.targetFrames).toBe(240);
});
it.each((["off", "balanced"] as const).flatMap(spectrumMode => (["sage", "sage-triton", "pytorch"] as const).map(attention => ({ spectrumMode, attention }))))("recovers missing input gates with Spectrum $spectrumMode and $attention and reaches one real button-created frozen parent task", async ({ spectrumMode, attention }) => {
  const h = journey = await createJourney({ spectrumMode });
  h.state().settings.h3AttentionMode = attention;
  h.scan.customNodes.find(n => n.id === "h3-continuum")!.version = "3.10.2";
  h.scan.customNodes.find(n => n.id === "local-video-studio-h3-av")!.version = "0.4.0";
  h.input("#generation-mode", "preview", "change");
  h.input("[data-preview-duration-number]", "10"); h.input("[data-preview-count-number]", "2"); h.element("[data-confirm-layout]").click();
  expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(true);
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click(); h.input(".create-long-editor textarea", "A red ball rolls slowly to the left. Static camera.");
  h.element('.create-long-tabs [role="tab"]:nth-child(3)').click(); h.input(".create-long-editor textarea", "The same red ball comes to rest. Static camera.");
  expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(true);
  h.element("#pick-start").click();
  await vi.waitFor(() => expect(h.state().draft.startImagePath).toBe("fixture.png"));
  await vi.waitFor(() => expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(false));
  h.element("#enqueue").click();
  await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
  const task = h.state().queue[0] as GenerationQueueTask;
  expect(task.id).toBeTruthy(); expect(task.duration).toBe(10); expect(task.longVideoPlan!.pages[1]!.text).toContain("rolls slowly");
  expect(task.h3SaveJointAv).toBe(false);
  expect(task.spectrumMode).toBe(spectrumMode);
  expect(task.attentionMode).toBe(attention);
  expect(longVideoBlockReason(h.state().draft, { ...h.state().settings, h3SparseAttentionMode: "sol-attn", h3ComfyCompilerMode: "auto", h3RuntimeMode: "native", h3AttentionMode: "comfy-kitchen" })).toBeNull();
  expect(longVideoBlockReason(h.state().draft, { ...h.state().settings, h3SparseAttentionMode: "vsa" })).toContain("FastH3");
  h.input(".create-long-editor textarea", "Later draft changes.");
  expect(task.longVideoPlan!.pages[2]!.text).toContain("comes to rest");
  const started = { ...task, longVideoExecution: { executionId: task.id } as NonNullable<GenerationQueueTask["longVideoExecution"]> };
  expect(randomizeQueuedTaskSeed([started], started.id)[0]!.seed).toBe(started.seed);
  expect(applyH3AccelerationSettingsToWaitingTask(started, { ...h.state().settings, h3AttentionMode: "pytorch" })).toBe(false);
  const copied = duplicateQueueTask({ ...h.state(), queue: [started] }, started.id).at(-1) as GenerationQueueTask;
  expect(copied.id).not.toBe(started.id); expect(copied.longVideoExecution).toBeUndefined();
  expect(copied.longVideoPlan).toEqual(started.longVideoPlan);
});
