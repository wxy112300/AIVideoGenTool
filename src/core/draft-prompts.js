function activeIndexForVersions(index, versions) {
    if (!versions.length)
        return 0;
    return Math.min(versions.length - 1, Math.max(0, Math.trunc(index ?? 0)));
}
export function copyPromptVersions(promptVersions) {
    return promptVersions.map((version) => ({
        ...version,
        id: crypto.randomUUID()
    }));
}
export function promptVersionsForDraft(draft) {
    if (draft.inputMode === "video" && draft.extensionPromptVersions?.length) {
        return draft.extensionPromptVersions;
    }
    return draft.promptVersions;
}
export function activePromptIndexForDraft(draft) {
    const versions = promptVersionsForDraft(draft);
    const index = draft.inputMode === "video"
        ? draft.extensionActivePromptVersion ?? draft.activePromptVersion
        : draft.activePromptVersion;
    return activeIndexForVersions(index, versions);
}
export function promptPatchForDraft(draft, promptVersions, activePromptVersion) {
    return draft.inputMode === "video"
        ? {
            extensionPromptVersions: promptVersions,
            extensionActivePromptVersion: activePromptVersion
        }
        : {
            promptVersions,
            activePromptVersion
        };
}
export function ensureDraftPromptState(draft) {
    if (draft.extensionPromptVersions?.length) {
        const activePromptVersion = activeIndexForVersions(draft.extensionActivePromptVersion, draft.extensionPromptVersions);
        return activePromptVersion === draft.extensionActivePromptVersion
            ? draft
            : { ...draft, extensionActivePromptVersion: activePromptVersion };
    }
    const sourceVersions = draft.promptVersions.length
        ? draft.promptVersions
        : [{
                id: crypto.randomUUID(),
                label: "新建",
                text: "",
                createdAt: new Date().toISOString()
            }];
    return {
        ...draft,
        extensionPromptVersions: copyPromptVersions(sourceVersions),
        extensionActivePromptVersion: activeIndexForVersions(draft.activePromptVersion, sourceVersions)
    };
}
export function clearPromptVersion(promptVersions, activePromptVersion) {
    const nextPromptVersions = [...promptVersions];
    const safeActivePromptVersion = activeIndexForVersions(activePromptVersion, nextPromptVersions);
    if (nextPromptVersions.length > 1) {
        nextPromptVersions.splice(safeActivePromptVersion, 1);
    }
    else if (nextPromptVersions[0]) {
        nextPromptVersions[0] = { ...nextPromptVersions[0], text: "" };
    }
    return {
        promptVersions: nextPromptVersions,
        activePromptVersion: Math.min(safeActivePromptVersion, Math.max(0, nextPromptVersions.length - 1))
    };
}
