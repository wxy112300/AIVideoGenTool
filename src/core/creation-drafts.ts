import type { AppState, Draft } from "../types.js";

type CreationDraftState = Pick<
  AppState,
  "draft" | "imageToVideoDraft" | "videoExtensionDraft"
>;

function cloneDraft(draft: Draft): Draft {
  return structuredClone(draft);
}

export function snapshotCreationDraft(
  state: CreationDraftState,
  draft: Draft
): void {
  if (draft.inputMode === "video") {
    state.videoExtensionDraft = cloneDraft(draft);
  } else {
    state.imageToVideoDraft = cloneDraft(draft);
  }
}

export function activateCreationDraft(
  state: CreationDraftState,
  draft: Draft
): void {
  snapshotCreationDraft(state, state.draft);
  state.draft = cloneDraft(draft);
  snapshotCreationDraft(state, state.draft);
}

export function creationDraftForMode(
  state: CreationDraftState,
  inputMode: Draft["inputMode"]
): Draft | undefined {
  const draft = inputMode === "video"
    ? state.videoExtensionDraft
    : state.imageToVideoDraft;
  return draft ? cloneDraft(draft) : undefined;
}

export function patchCreationDraftForMode(
  state: CreationDraftState,
  inputMode: Draft["inputMode"],
  update: (draft: Draft) => Partial<Draft>,
  activate: boolean
): Draft | undefined {
  const targetDraft = creationDraftForMode(state, inputMode);
  if (!targetDraft) return undefined;
  const nextDraft = { ...targetDraft, ...update(targetDraft) };
  if (activate) activateCreationDraft(state, nextDraft);
  else snapshotCreationDraft(state, nextDraft);
  return nextDraft;
}

export function preserveLocalCreationDrafts(
  incomingState: AppState,
  localState: AppState
): AppState {
  return {
    ...incomingState,
    draft: localState.draft,
    imageToVideoDraft: localState.imageToVideoDraft,
    videoExtensionDraft: localState.videoExtensionDraft
  };
}