// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { completedGroupVersion } from "./harness/long-video-source";
import { longVideoContinuationDraft } from "../src/core/long-video/continuation-draft";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { createHistoryActions, type HistoryActionsOptions } from "../src/renderer/pages/history/actions";
import type { HistoryAsset } from "../src/types";
import { createTranslator } from "../src/core/i18n";
import type { RendererContext } from "../src/renderer/contracts";
import { randomizeQueuedTaskSeed } from "../src/core/queue";
import { applyH3AccelerationSettingsToWaitingTask } from "../src/core/h3-execution-policy";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import { longVideoBlockReason } from "../src/core/long-video/capability";
import { longVideoProfileIdentity } from "../src/core/long-video/run-source";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(() => { journey?.dispose(); journey = undefined; });
it("preserves Triton in an accepted Run and distinguishes it from CUDA Sage identity", () => {
  const state = createDefaultState(), version = completedGroupVersion();
  version.longVideoExecution!.profile.attention = "sage-triton";
  version.longVideoExecution!.profile.spectrumMode = "balanced";
  let n = 0;
  const draft = longVideoContinuationDraft(state.draft, "asset", version, version.files[0]!.absolutePath!, () => `page-${++n}`);
  expect(draft.longVideoRunSource!.profile.attention).toBe("sage-triton");
  expect(longVideoProfileIdentity(draft.longVideoRunSource!.profile)).not.toBe(longVideoProfileIdentity({ ...draft.longVideoRunSource!.profile, attention: "sage" }));
});
it("inherits Spectrum from an accepted Run and blocks changing it inside that Run", () => {
  const state = createDefaultState(), version = completedGroupVersion();
  version.longVideoExecution!.profile.spectrumMode = "balanced";
  let n = 0;
  const draft = longVideoContinuationDraft(state.draft, "asset", version, version.files[0]!.absolutePath!, () => `page-${++n}`);
  expect(draft.spectrumMode).toBe("balanced");
  const off = { ...draft, spectrumMode: "off" as const };
  expect(longVideoBlockReason(off, state.settings)).toBe(createTranslator(state.settings.uiLocale).t("create.editor.blockRunProfile"));
  const profile = version.longVideoExecution!.profile;
  expect(longVideoProfileIdentity(profile)).not.toBe(longVideoProfileIdentity({ ...profile, spectrumMode: "off" }));
  expect(longVideoProfileIdentity({ ...profile, spectrumMode: undefined })).toBe(longVideoProfileIdentity({ ...profile, spectrumMode: "off" }));
});
it("keeps a remembered editor from another model out of native enqueue", () => {
  const state = createDefaultState();
  const task = queueTaskFromDraft({ ...state.draft, longVideoEditor: { key: "minimax_h3_continuum:video", active: true, confirmed: true, seconds: 5, count: 1 } }, state);
  expect(task.longVideoPlan).toBeUndefined();
});
it("History Continue opens the group Run in Extend without randomizing the seed or importing a legacy AV", async () => {
  const state = createDefaultState(), version = completedGroupVersion();
  state.history = [{ id: "asset", modelId: version.modelId, versions: [version] } as HistoryAsset];
  const saveDraftImmediately = vi.fn(async draft => { state.draft = draft; });
  const selectDraftVideo = vi.fn(async () => undefined), navigateToCreationMode = vi.fn(), notify = vi.fn();
  const actions = createHistoryActions({ context: { getState: () => state, t: createTranslator().t, notify } as unknown as RendererContext,
    saveDraftImmediately, selectDraftVideo, navigateToCreationMode, reportUserAction: vi.fn() } as unknown as HistoryActionsOptions);
  await actions.continueVideoHistory("asset", version.id);
  expect(notify).not.toHaveBeenCalled(); expect(navigateToCreationMode).toHaveBeenCalledWith("video-extension");
  expect(selectDraftVideo.mock.calls[0]).toEqual([version.files[0]!.absolutePath, expect.objectContaining({ resetSeed: false, resetPrompt: true }), false]);
  expect(state.draft).toMatchObject({ modelId: "minimax_h3_continuum", inputMode: "video", seed: 42, sourceAssetId: "asset", sourceVersionId: version.id,
    longVideoEditor: { active: true, confirmed: false, seconds: 5, count: 1 }, longVideoRunSource: { receipt: { revision_id: "revision-2", accepted_chunks: 2 } } });
  expect(state.draft.h3ContinuumArtifact).toBeUndefined(); expect(state.draft.h3ContinuumSequence).toBeUndefined();
});
it("confirms the inherited chunk size, recovers missing future text and creates one real button task with frozen source settings", async () => {
  const version = completedGroupVersion(); let i = 0;
  const draft = longVideoContinuationDraft(createDefaultDraft(), "asset", version, version.files[0]!.absolutePath!, () => `new-${++i}`);
  const h = journey = await createJourney(draft);
  h.scan.customNodes.find(n => n.id === "h3-continuum")!.version = "3.10.2";
  h.scan.customNodes.find(n => n.id === "local-video-studio-h3-av")!.version = "0.4.0";
  expect(h.element<HTMLSelectElement>("#generation-mode").value).toBe("preview");
  expect(h.element<HTMLElement>(".settings-latent-save").hidden).toBe(true);
  expect(h.element<HTMLInputElement>("[data-preview-count-number]").disabled).toBe(true);
  h.element("[data-confirm-layout]").click();
  expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(true);
  h.element('.create-long-tabs [role="tab"]:nth-child(2)').click();
  h.input(".create-long-editor textarea", "The same red block stays still while the camera gently moves closer.");
  await vi.waitFor(() => expect(h.element<HTMLButtonElement>("#enqueue").disabled).toBe(false));
  h.element("#enqueue").click();
  await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
  const task = h.state().queue[0]!;
  expect(task).toMatchObject({ taskType: "extension", seed: 42, steps: 20, duration: 5, attentionMode: "pytorch", h3RuntimeMode: "compatibility", h3SaveJointAv: false,
    longVideoPlan: { layout: { origin: "extend", prefixChunks: 2, chunks: 1, totalChunks: 3 } }, longVideoRunSource: { sourceVersionId: version.id } });
  expect(h.state().settings.h3AttentionMode).not.toBe("pytorch");
  expect(randomizeQueuedTaskSeed([task], task.id)[0]!.seed).toBe(42);
  expect(applyH3AccelerationSettingsToWaitingTask(task, { ...h.state().settings, h3AttentionMode: "sage" })).toBe(false);
});
