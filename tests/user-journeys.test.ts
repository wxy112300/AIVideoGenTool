// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { h3PromptModeForDraft } from "../src/renderer/pages/create/helpers";
import { strataPreparationProfiles } from "../src/core/strata-preparation";
import { normalizeMultimodalPromptOutput } from "../electron/services/multimodal-prompt";
import { buildStrataPromptRequest } from "../electron/services/strata-prompt";
import { promptVersionsForDraft } from "../src/core/draft-prompts";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => {
  journey?.dispose(); journey = undefined;
  // Let the coordinator's owned debounce settle before another journey mounts.
  await new Promise(resolve => setTimeout(resolve, 370));
  vi.restoreAllMocks();
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("user journeys: actual Create DOM + coordinator + snapshot (synthetic ports)", () => {
  it.each(["image", "video"] as const)("Strata R2V %s input: missing-file recovery and real Enhance click reach layered thinking without a queue", async inputMode => {
    const h = journey = await createJourney({ modelId: "minimax_h3_ref2va", duration: 15 });
    if (inputMode === "video") {
      h.element('[data-input-mode="video"]').click(); await settle();
      await h.coordinator.selectDraftVideo("fixture.mp4", { assetId: "asset", versionId: "version", duration: 8,
        width: 864, height: 480, resetPrompt: true });
      h.render();
    } else {
      if (!h.root.querySelector("[data-pick-h3-slot]")) h.element("#add-h3-reference-slot-empty").click();
      await settle(); h.element("[data-pick-h3-slot]").click(); await settle();
    }
    const promptModelId = "strata/qwen3.8-flash-next-iq3_xxs";
    h.state().settings.promptModelId = promptModelId;
    const profile = strataPreparationProfiles().find(profile => profile.id === promptModelId)!;
    h.scan.modelProfiles.push(profile);
    h.scan.strataPreparation = { managedInstalled: true } as typeof h.scan.strataPreparation;
    h.render();
    h.input("#prompt-enhance-mode", "detailed-cinematic", "change");
    h.input("#prompt-input", "Continue the subject's turn and keep the camera tracking smoothly.");
    expect(h.element("#enhance-prompt").disabled).toBe(true);
    h.element("#enhance-prompt").click(); expect(h.enhancePrompt).not.toHaveBeenCalled();
    profile.available = true; profile.components.forEach(component => component.found = true); h.render();
    expect(h.element("#enhance-prompt").disabled).toBe(false);
    let compiled: Awaited<ReturnType<typeof buildStrataPromptRequest>> | undefined;
    h.enhancePrompt.mockImplementationOnce(async request => {
      // File extraction/IPC are separate service tests; the real UI request reaches the production builder here.
      compiled = await buildStrataPromptRequest({ ...request, imagePaths: ["boundary-or-reference.png"] },
        h.state().settings, new AbortController().signal,
        async () => ({ type: "image_url", image_url: { url: "data:image/png;base64,fixture" } }));
      return normalizeMultimodalPromptOutput("subject_definitions: One subject.\nsummary: Continue the turn.\nretention_analysis: fully_preserved\ndetailed_description: [Shot 1] The subject continues turning while the camera tracks smoothly.\noverall_soundscape: Footsteps.\nnon_diegetic_music: N/A", request);
    });
    const before = promptVersionsForDraft(h.state().draft).length;
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
    await settle();
    expect(promptVersionsForDraft(h.state().draft).length).toBe(before + 1);
    expect(compiled).toMatchObject({ reasoning: { effort: "medium", budgetTokens: 2048 }, temperature: 1,
      messages: [{ role: "system" }, { role: "user" }] });
    expect(h.enhancePrompt.mock.calls[0][0]).toMatchObject({ h3PromptMode: "R2V", h3PromptPreset: "detailed-cinematic",
      ...(inputMode === "video" ? { extensionSource: { filePath: "fixture.mp4", trimEndSeconds: 8 } } : {}) });
    expect(promptVersionsForDraft(h.state().draft).at(-1)?.id).toBeTruthy();
    expect(h.state().queue).toHaveLength(0);
  });
  it("edits tenths of a second with live H3 frame alignment and freezes the decimal duration on enqueue", async () => {
    const h = journey = await createJourney({ prompt: "", duration: 5 });
    h.element("#clear-prompt").click();
    await settle();
    expect(h.element("#enqueue").disabled).toBe(true);
    h.input("#resolution", "640", "change");
    expect(h.state().draft.resolution).toBe(640);
    expect(h.element<HTMLInputElement>("#duration").step).toBe("0.1");
    expect(h.element<HTMLInputElement>("#duration-number").step).toBe("0.1");
    h.input("#duration", "5.1");
    expect(h.state().draft.duration).toBe(5.1);
    expect(h.element<HTMLInputElement>("#duration-number").value).toBe("5.1");
    expect(h.element("#duration-frames").textContent).toBe("124 模型帧");
    h.input("#duration", "5.2");
    expect(h.element("#duration-frames").textContent).toBe("141 模型帧");
    const number = h.element<HTMLInputElement>("#duration-number");
    number.focus();
    h.input("#duration-number", "");
    expect(number.value).toBe("");
    expect(h.state().draft.duration).toBe(5.2);
    h.input("#duration-number", "5.10");
    expect(document.activeElement).toBe(number);
    expect(number.value).toBe("5.10");
    expect(h.element("#duration-frames").textContent).toBe("124 模型帧");
    h.input("#duration-number", "5.2", "change");
    await settle();
    h.input("#prompt-input", "A balloon slowly rises above a field.");
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]).toMatchObject({ duration: 5.2, resolution: 640 });
    expect(h.state().queue[0]?.id).toBeTruthy();
    h.input("#duration-number", "99", "change");
    await settle();
    expect(h.state().draft.duration).toBe(30);
    expect(h.element("#duration-frames").textContent).toBe("736 模型帧");
    expect(h.state().queue[0]?.duration).toBe(5.2);
    h.input("#resolution", "540", "change");
    expect(h.state().queue[0]?.resolution).toBe(640);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(2));
    expect(h.state().queue[1]).toMatchObject({ duration: 30 });
  });

  it("warns strictly above 15.1 requested seconds without blocking enqueue or replacing focused input", async () => {
    const h = journey = await createJourney({ duration: 15.1 });
    h.element("#clear-prompt").click();
    await settle();
    expect(h.element("[data-h3-duration-warning]").hidden).toBe(true);
    expect(h.element("#enqueue").disabled).toBe(true);
    const number = h.element<HTMLInputElement>("#duration-number");
    number.focus();
    h.input("#duration-number", "15.2");
    expect(h.element("[data-h3-duration-warning]").hidden).toBe(false);
    expect(document.activeElement).toBe(number);
    expect(h.element("#duration-number")).toBe(number);
    const warning = h.element("[data-h3-duration-warning]");
    warning.focus();
    warning.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(warning.getAttribute("aria-expanded")).toBe("true");
    expect(warning.querySelector('[role="tooltip"]')?.textContent).toContain("可继续生成");
    h.input("#prompt-input", "A balloon slowly rises above a field.");
    expect(h.element("#enqueue").disabled).toBe(false);
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]).toMatchObject({ duration: 15.2, id: expect.any(String) });
    h.input("#duration-number", "15.1");
    expect(h.element("[data-h3-duration-warning]").hidden).toBe(true);
    expect(h.element("[data-h3-duration-warning]").getAttribute("aria-expanded")).toBe("false");
    expect(h.state().queue[0]).toMatchObject({ duration: 15.2 });
  });

  it("warns from the added duration rather than the source or combined length in Extend", async () => {
    const scenario = journey = await createJourney({ inputMode: "video", modelId: "minimax_h3_ref2va",
      sourceVideoPath: "fixture.mp4", sourceVideoDuration: 40, trimEndSeconds: 40,
      sourceWidth: 864, sourceHeight: 480, duration: 5 });
    expect(scenario.element("[data-h3-duration-warning]").hidden).toBe(true);
    scenario.input("#duration-number", "15.1");
    expect(scenario.element("[data-h3-duration-warning]").hidden).toBe(true);
    scenario.input("#duration-number", "15.2");
    expect(scenario.element("[data-h3-duration-warning]").hidden).toBe(false);
    expect(scenario.element("#enqueue").disabled).toBe(false);
    scenario.render();
    expect(scenario.element("[data-h3-duration-warning]").hidden).toBe(false);
  });

  it("saves an under-length detailed result with a warning through the actual Enhance button", async () => {
    const h = journey = await createJourney();
    h.input("#prompt-enhance-mode", "detailed-cinematic", "change");
    const source = "Please design an explicit cinematic expansion according to the reference: a woman waves her hand.";
    const paraphrase = "The female performer lifts her palm and gently greets the viewer.";
    h.input("#prompt-input", source);
    const before = structuredClone(h.state().draft.promptVersions);
    const output = (count: number) => `integrated_multimodal_description: [Shot 1] ${paraphrase} ${Array.from({ length: count }, (_, index) => `detail${index}`).join(" ")}\noverall_soundscape: N/A\nnon_diegetic_music: N/A`;
    h.enhancePrompt.mockImplementationOnce(async (request) => normalizeMultimodalPromptOutput(output(20), request));
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
    await settle();
    expect(h.state().draft.promptVersions).toHaveLength(before.length + 1);
    expect(h.state().draft.promptVersions.slice(0, before.length)).toEqual(before);
    expect(h.state().draft.promptVersions.at(-1)?.text).toContain(paraphrase);
    expect(h.element<HTMLTextAreaElement>("#prompt-input").value).toContain(paraphrase);
    expect(h.context.notify).toHaveBeenLastCalledWith(expect.stringContaining("低于建议"), { kind: "warning" });
    expect(h.state().draft.promptVersions.at(-1)?.text).not.toContain("低于建议");
    expect(h.state().queue).toHaveLength(0);
    h.enhancePrompt.mockImplementationOnce(async (request) => normalizeMultimodalPromptOutput(output(600), request));
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.state().draft.promptVersions.length).toBe(before.length + 2));
    expect(h.state().draft.promptVersions.at(-1)?.id).toBeTruthy();
    expect(h.state().draft.promptVersions.at(-1)?.text).toContain(paraphrase);
    expect(h.context.notify).toHaveBeenLastCalledWith(expect.any(String), { kind: "task-complete" });
    expect(h.state().queue).toHaveLength(0);
  });
  it.each(["strata/qwen3.8-flash-next-iq3_xxs", "strata/qwen3.8-flash-next-ud-q4_k_xl"])("%s missing files block Enhance; recovery enables the actual button and saves only a complete result", async modelId => {
    const h = journey = await createJourney();
    h.state().settings.promptModelId = modelId;
    const profile = strataPreparationProfiles().find(profile => profile.id === modelId)!;
    h.scan.modelProfiles.push(profile);
    h.scan.strataPreparation = { managedInstalled: true } as typeof h.scan.strataPreparation;
    h.render(); h.input("#prompt-input", "A red balloon rises.");
    expect(h.element("#enhance-prompt").disabled).toBe(true);
    h.element("#enhance-prompt").click(); expect(h.enhancePrompt).not.toHaveBeenCalled();
    profile.available = true; profile.components.forEach((component) => component.found = true);
    h.render();
    expect(h.element("#enhance-prompt").disabled).toBe(false);
    const before = structuredClone(h.state().draft.promptVersions);
    h.enhancePrompt.mockRejectedValueOnce(new Error("Strata output truncated"));
    h.element("#enhance-prompt").click(); await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
    await settle();
    expect(h.state().draft.promptVersions).toEqual(before);
    h.element("#enhance-prompt").click();
    await vi.waitFor(() => expect(h.state().draft.promptVersions.length).toBe(before.length + 1));
    expect(h.state().draft.promptVersions.at(-1)?.text).toBe("The subject slowly turns toward the camera, with natural motion and steady framing.");
    expect(h.state().draft.promptVersions.at(-1)?.id).toBeTruthy();
  });
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
    h.input("#duration-number", "30", "change");
    expect(h.element("#duration-frames").textContent).toBe("770 模型帧");
    expect(h.element("[data-h3-duration-warning]").hidden).toBe(false);
    h.input("#model", "minimax_h3_continuum", "change"); await settle();
    expect(h3PromptModeForDraft(h.state().draft)).toBe("T2VA");
    h.input("#duration-number", "30", "change");
    expect(h.element("#duration-frames").textContent).toBe("736 模型帧");
    expect(h.element("[data-h3-duration-warning]").hidden).toBe(false);
    expect(h.root.querySelector("[data-drop-h3-motion-context-latent]")).toBeNull();
    expect(h.element("#enqueue").disabled).toBe(true);
    h.element("#enqueue").click(); expect(h.application.enqueue).not.toHaveBeenCalled();
    h.setInspection({ route: "bootstrap", status: "available", reason: "Fixture: paired AV validated" });
    h.element("[data-drop-h3-continuum-av]").click(); await settle();
    await vi.waitFor(() => expect(h.element("#enqueue").disabled).toBe(false));
    h.element("#enqueue").click();
    await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
    expect(h.state().queue[0]).toMatchObject({ taskType: "extension", modelId: "minimax_h3_continuum", duration: 30, maxGeneratedFrames: 736, h3ContinuumArtifactPath: "fixture.safetensors" });
  });
});
