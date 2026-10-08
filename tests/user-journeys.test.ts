// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { h3PromptModeForDraft } from "../src/renderer/pages/create/helpers";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => {
  journey?.dispose(); journey = undefined;
  // Let the coordinator's owned debounce settle before another journey mounts.
  await new Promise(resolve => setTimeout(resolve, 370));
  vi.restoreAllMocks();
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("user journeys: actual Create DOM + coordinator + snapshot (synthetic ports)", () => {
  it("empty prompt blocks the actual button; typing restores enqueue and later draft edits do not mutate the task", async () => {
    const h = journey = await createJourney();
    h.element("#clear-prompt").click(); await settle();
    expect(h.element("#enqueue").disabled).toBe(true);
    expect(h.element("#enqueue").dataset.enqueueBlockReason).toBeTruthy();
    h.element("#enqueue").click();
    expect(h.application.enqueue).not.toHaveBeenCalled();
    h.input("#prompt-input", "A red balloon rises above a quiet field.");
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    const snapshot = structuredClone(h.state().queue[0]);
    h.input("#prompt-input", "A completely different scene.");
    expect(h.state().queue[0]).toEqual(snapshot);
    expect(h.state().queue[0]?.prompt).toBe("A red balloon rises above a quiet field.");
  });

  it("picking and removing first/last frames changes H3 modes and preserves reachable T2V submission", async () => {
    const h = journey = await createJourney();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("T2VA");
    h.element("#pick-start").click(); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("I2VA");
    h.element("#toggle-end").click(); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("FL2VA");
    h.element('[data-clear-frame="start"]').click(); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("L2VA");
    h.element('[data-clear-frame="end"]').click(); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("T2VA");
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]?.workflowPath).toContain("t2va");
  });

  it("switching to R2V replaces frame controls; an empty Slot blocks and picking media restores enqueue", async () => {
    const h = journey = await createJourney();
    h.input("#model", "minimax_h3_ref2va", "change"); await settle();
    expect(h.root.querySelector("#pick-start")).toBeNull();
    expect(h.element("#enqueue").disabled).toBe(true);
    // The selected model may create its initial empty slot; otherwise add it via UI.
    if (!h.root.querySelector("[data-pick-h3-slot]")) h.element("#add-h3-reference-slot-empty").click();
    await settle();
    h.element("[data-pick-h3-slot]").click(); await settle();
    expect(h.state().draft.h3ReferenceSlots[0]?.mediaPath).toBe("fixture.png");
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    h.element("[data-clear-h3-slot]").click(); await settle();
    expect(h.element("#enqueue").disabled).toBe(true);
    expect(h.state().queue[0]?.h3ReferenceSlots[0]?.mediaPath).toBe("fixture.png");
  });

  it("image without instructions requests reference-auto; user text is passed unchanged on the next enhancement", async () => {
    const h = journey = await createJourney({ startImagePath: "fixture.png" });
    h.element("#clear-prompt").click(); await settle();
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledTimes(1));
    expect(h.enhancePrompt.mock.calls[0]?.[0]).toMatchObject({ prompt: "", promptStrategy: "reference-auto", h3PromptMode: "I2VA", imagePaths: ["fixture.png"] });
    await settle();
    h.input("#prompt-input", "Keep the camera fixed. Only the left hand moves.");
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledTimes(2));
    expect(h.enhancePrompt.mock.calls[1]?.[0]).toMatchObject({ prompt: "Keep the camera fixed. Only the left hand moves.", promptStrategy: undefined });
  });

  it("no media and no prompt cannot invoke enhancement; an extension source uses R2V context instead of T2V", async () => {
    const h = journey = await createJourney();
    h.element("#clear-prompt").click(); await settle();
    h.element("#enhance-prompt").click(); await settle();
    expect(h.enhancePrompt).not.toHaveBeenCalled();
    h.element('[data-input-mode="video"]').click(); await settle();
    await h.coordinator.selectDraftVideo("fixture.mp4", { assetId: "asset", versionId: "version", duration: 5, width: 864, height: 480, resetPrompt: true });
    h.render();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("R2V");
    expect(h.element("#spectrum-mode").disabled).toBe(true);
    expect(h.root.querySelector("[data-remove-h3-slot] ")).toBeNull();
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledTimes(1));
    expect(h.enhancePrompt.mock.calls[0]?.[0]).toMatchObject({ origin: "video-extension", promptStrategy: "reference-auto", h3PromptMode: "R2V", extensionSource: { filePath: "fixture.mp4", trimEndSeconds: 5 } });
  });

  it("keeps a managed source without an accepted Run prefix blocked and lets the user recover through Motion Context", async () => {
    const reason = "该视频没有已接受的 Continuum Run 前缀";
    const h = journey = await createJourney({ inputMode: "video", modelId: "minimax_h3_ref2va", h3ContinuumMode: "managed", sourceVideoPath: "fixture.mp4", sourceVideoDuration: 5, trimEndSeconds: 5, sourceWidth: 864, sourceHeight: 480 });
    h.setInspection({ route: "managed", status: "missing", reason });
    h.input("#model", "minimax_h3_continuum", "change");
    await vi.waitFor(() => expect(h.element("#enqueue").dataset.enqueueBlockReason).toContain(reason));
    expect(h.element("#enqueue").disabled).toBe(true);
    h.element("#enqueue").click();
    expect(h.application.enqueue).not.toHaveBeenCalled();
    expect(h.state().queue).toHaveLength(0);
    h.input("#model", "minimax_h3_ref2va", "change");
    await vi.waitFor(() => expect(h.element("#enqueue").disabled).toBe(false));
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]).toMatchObject({ taskType: "extension", modelId: "minimax_h3_ref2va", sourceVideoPath: "fixture.mp4" });
    expect(h.state().queue[0]?.h3ContinuumSequence).toBeUndefined();
  });

  it("Continuum replaces Motion Context controls and keeps a missing AV source blocked until inspection recovers", async () => {
    const h = journey = await createJourney({ inputMode: "video", modelId: "minimax_h3_ref2va", sourceVideoPath: "fixture.mp4", sourceVideoDuration: 5, trimEndSeconds: 5, sourceWidth: 864, sourceHeight: 480 });
    expect(h.root.querySelector("[data-drop-h3-motion-context-latent]")).not.toBeNull();
    expect(h.element("#enqueue").disabled).toBe(false); // video context does not require a saved latent
    h.input("#model", "minimax_h3_continuum", "change"); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("I2VA");
    expect(h.root.querySelector("[data-drop-h3-motion-context-latent]")).toBeNull();
    expect(h.element("#enqueue").disabled).toBe(true);
    h.element("#enqueue").click(); expect(h.application.enqueue).not.toHaveBeenCalled();
    h.setInspection({ route: "bootstrap", status: "available", reason: "Fixture: paired AV validated" });
    h.element("[data-drop-h3-continuum-av]").click(); await settle();
    await vi.waitFor(() => expect(h.element("#enqueue").disabled).toBe(false));
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]).toMatchObject({ taskType: "extension", modelId: "minimax_h3_continuum", h3ContinuumArtifactPath: "fixture.safetensors" });
  });
});
