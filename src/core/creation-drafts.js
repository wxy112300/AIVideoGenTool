function cloneDraft(draft) {
    return structuredClone(draft);
}
export function snapshotCreationDraft(state, draft) {
    if (draft.inputMode === "video") {
        state.videoExtensionDraft = cloneDraft(draft);
    }
    else {
        state.imageToVideoDraft = cloneDraft(draft);
    }
}
export function activateCreationDraft(state, draft) {
    snapshotCreationDraft(state, state.draft);
    state.draft = cloneDraft(draft);
    snapshotCreationDraft(state, state.draft);
}
export function creationDraftForMode(state, inputMode) {
    const draft = inputMode === "video"
        ? state.videoExtensionDraft
        : state.imageToVideoDraft;
    return draft ? cloneDraft(draft) : undefined;
}
export function patchCreationDraftForMode(state, inputMode, update, activate) {
    const targetDraft = creationDraftForMode(state, inputMode);
    if (!targetDraft)
        return undefined;
    const nextDraft = { ...targetDraft, ...update(targetDraft) };
    if (activate)
        activateCreationDraft(state, nextDraft);
    else
        snapshotCreationDraft(state, nextDraft);
    return nextDraft;
}
export function preserveLocalCreationDrafts(incomingState, localState) {
    return {
        ...incomingState,
        draft: localState.draft,
        imageToVideoDraft: localState.imageToVideoDraft,
        videoExtensionDraft: localState.videoExtensionDraft
    };
}
