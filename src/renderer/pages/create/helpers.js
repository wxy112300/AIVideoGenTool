import { inferH3PromptMode } from "../../../core/h3-prompt";
import { checkH3Prompt } from "../../../core/h3-prompt-check";
import { activePromptIndexForDraft, promptVersionsForDraft } from "../../../core/draft-prompts";
import { extensionSafetyForTask, frameInterpolationMultiplier, generationFrameCountForTask, isMiniMaxH3BoundaryExtensionModel, isMiniMaxH3Fl2vaModel, isMiniMaxH3Model, isMiniMaxH3R2vModel, outputFrameCountForTask } from "../../../core/workflow";
import { h3PromptPackFor, qwenImagePromptPackFor } from "../../prompt-packs";
import { escapeHtml } from "../../shared/dom";
import { uiKeys } from "../../../core/i18n-keys";
import { countPromptWords, h3PromptWordRange } from "../../../core/prompt-count";
import { modelCatalog } from "../../../core/catalog";
export const h3ReferenceRolePromptLabels = {
    subject: "subject",
    scene: "scene / environment",
    style: "style / clothing",
    motion: "motion / pose",
    camera: "camera / composition",
    voice: "voice association",
    keyframe: "keyframe",
    other: "other reference"
};
export const imageReferenceRolePromptLabels = {
    base: "base image",
    person: "person",
    object: "object",
    pose: "pose",
    style: "style",
    background: "background",
    auto: "automatic reference"
};
export function isPromptCancellationError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /提示词任务已取消|prompt task (?:was )?cancelled|operation was aborted/iu.test(message);
}
export function activePrompt(draft, locale = "zh-CN") {
    const promptVersions = promptVersionsForDraft(draft);
    const activePromptVersion = activePromptIndexForDraft(draft);
    return promptVersions[activePromptVersion] ??
        promptVersions.at(-1) ?? {
        id: crypto.randomUUID(),
        label: h3PromptPackFor(locale).ui.t("newVersion"),
        text: "",
        createdAt: new Date().toISOString()
    };
}
export function activeImagePrompt(draft, locale = "zh-CN") {
    return draft.promptVersions[draft.activePromptVersion] ??
        draft.promptVersions.at(-1) ?? {
        id: "image-prompt-fallback",
        label: qwenImagePromptPackFor(locale).ui.t("originalVersion"),
        text: "",
        createdAt: new Date().toISOString()
    };
}
export function h3PromptModeForDraft(draft) {
    return inferH3PromptMode(Boolean(draft.startImagePath), Boolean(draft.endImagePath), isMiniMaxH3R2vModel(draft.modelId));
}
export function interpolationEstimate(draft) {
    return {
        multiplier: frameInterpolationMultiplier(draft),
        generatedFrames: generationFrameCountForTask(draft),
        outputFrames: outputFrameCountForTask(draft)
    };
}
export function extensionSafetyForDraft(draft, settings) {
    return extensionSafetyForTask({
        ...draft,
        resolution: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
            ? draft.resolution
            : settings.ltxExtensionResolution,
        maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
            ? 362
            : settings.ltxExtensionFrames,
        overlapFrames: settings.ltxExtensionOverlapFrames,
        unloadBetweenStages: settings.ltxExtensionUnloadBetweenStages
    }, settings.uiLocale);
}
export function orderVideoProfiles(profiles) {
    return [...profiles].sort((left, right) => (modelCatalog.get(right.id)?.definition.order ?? (isMiniMaxH3Model(right.id) ? 1 : 0)) -
        (modelCatalog.get(left.id)?.definition.order ?? (isMiniMaxH3Model(left.id) ? 1 : 0)));
}
/**
 * A model selector is scoped to the current creation mode. In particular,
 * video extension is not a generic video capability: the selected model must
 * explicitly declare support for the extension workflow (or be backed by a
 * workflow that has already been inspected). Keeping this rule here prevents
 * unsupported models from appearing as selectable options and avoids a late
 * failure after the user has filled the rest of the form.
 */
export function modelSupportsCreateInputMode(modelId, inputMode, selected, workflowPath, workflowCapabilities, bundledWorkflows) {
    const definition = modelCatalog.get(modelId)?.definition;
    const declaredInputModes = definition?.inputModes;
    if (declaredInputModes && !declaredInputModes.includes(inputMode))
        return false;
    if (inputMode !== "video")
        return true;
    const declaredExtensionSupport = definition?.capabilities?.supportsVideoExtension;
    if (declaredExtensionSupport !== undefined)
        return declaredExtensionSupport;
    // Older catalog entries and user-supplied workflows may not have a catalog
    // capability. Preserve the already validated workflow fallback for those
    // entries, but never infer extension support from a display name alone.
    if (isMiniMaxH3BoundaryExtensionModel(modelId) || isMiniMaxH3R2vModel(modelId)) {
        return true;
    }
    return selected
        ? workflowCapabilities[workflowPath]?.supportsVideoExtension === true
        : bundledWorkflows[`${modelId}:${inputMode}`]?.supportsVideoExtension === true;
}
export function createModelOptionViewModels(draft, environmentScan, workflowCapabilities, bundledWorkflows, t) {
    const scanned = environmentScan
        ? orderVideoProfiles(environmentScan.modelProfiles.filter((profile) => profile.category === "video"))
        : undefined;
    const profiles = scanned?.length
        ? scanned
        : modelCatalog.list("video").map((entry) => ({
            id: entry.definition.id,
            name: modelCatalog.localized(entry.definition.id)?.name ?? entry.definition.id,
            available: true,
            integrated: true
        }));
    return profiles
        .filter((profile) => modelSupportsCreateInputMode(profile.id, draft.inputMode, draft.modelId === profile.id, draft.workflowPath, workflowCapabilities, bundledWorkflows))
        .map((profile) => {
        const selected = draft.modelId === profile.id;
        const supportsVideoExtension = modelSupportsCreateInputMode(profile.id, draft.inputMode, selected, draft.workflowPath, workflowCapabilities, bundledWorkflows);
        const unavailable = !profile.available ||
            profile.integrated === false ||
            (draft.inputMode === "video" && !supportsVideoExtension);
        const suffix = !profile.available
            ? t(uiKeys.create.modelStatus.missingComponent)
            : profile.integrated === false
                ? t(uiKeys.create.modelStatus.workflowPending)
                : draft.inputMode === "video" && !supportsVideoExtension
                    ? t(uiKeys.create.modelStatus.extensionCheckFailed)
                    : "";
        const catalogCapabilities = modelCatalog.get(profile.id)?.definition.capabilities;
        const modeLabel = draft.inputMode === "video"
            ? catalogCapabilities?.supportsReferenceSlots
                ? t(uiKeys.create.modelStatus.motionContextRecommended)
                : catalogCapabilities?.supportsEndFrame
                    ? t(uiKeys.create.modelStatus.endFrameCompatible)
                    : ""
            : "";
        return {
            id: profile.id,
            name: profile.name,
            selected,
            unavailable,
            modeLabel,
            suffix
        };
    });
}
export function promptSnippetOptions(escapeHtml, locale = "zh-CN") {
    const snippets = h3PromptPackFor(locale).snippets;
    return [...new Set(snippets.map((snippet) => snippet.group))]
        .map((group) => `<optgroup label="${escapeHtml(group)}">${snippets
        .filter((snippet) => snippet.group === group)
        .map((snippet) => `<option value="${escapeHtml(snippet.id)}">${escapeHtml(snippet.label)}</option>`)
        .join("")}</optgroup>`)
        .join("");
}
export function insertPromptSnippet(promptInput, snippet) {
    if (!snippet)
        return;
    const start = promptInput.selectionStart;
    const end = promptInput.selectionEnd;
    const before = promptInput.value.slice(0, start);
    const after = promptInput.value.slice(end);
    const prefix = before && !/\s$/u.test(before) ? "\n" : "";
    const suffix = after && !/^\s/u.test(after) ? "\n" : "";
    promptInput.focus();
    promptInput.setRangeText(`${prefix}${snippet}${suffix}`, start, end, "end");
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));
}
export function imageFileIsSupported(file) {
    return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}
export function updatePromptWordCounter(promptText, mode, durationSeconds, ui = h3PromptPackFor("zh-CN").ui) {
    const counter = document.querySelector("#prompt-word-counter");
    if (!counter)
        return;
    const count = countPromptWords(promptText);
    if (!mode) {
        counter.className = "prompt-word-counter";
        counter.textContent = ui.t("wordCount", { count });
        return;
    }
    const range = h3PromptWordRange(mode, durationSeconds);
    counter.className = "prompt-word-counter";
    counter.textContent = ui.t("wordCountGuidance", {
        count,
        min: range.min,
        max: range.max
    });
}
export function updateImagePromptWordCounter(promptText, ui = h3PromptPackFor("zh-CN").ui) {
    const counter = document.querySelector("#image-prompt-word-counter");
    if (!counter)
        return;
    counter.className = "prompt-word-counter";
    counter.textContent = ui.t("imageWordCount", { count: countPromptWords(promptText) });
}
export function resizePromptInput(promptInput) {
    promptInput.style.height = "auto";
    const styles = window.getComputedStyle(promptInput);
    const minHeight = Number.parseFloat(styles.minHeight) || 0;
    const maxHeight = Number.parseFloat(styles.maxHeight);
    const contentHeight = promptInput.scrollHeight;
    const height = Number.isFinite(maxHeight)
        ? Math.min(contentHeight, maxHeight)
        : contentHeight;
    promptInput.style.height = `${Math.max(minHeight, height)}px`;
    promptInput.style.overflowY = Number.isFinite(maxHeight) && contentHeight > maxHeight
        ? "auto"
        : "hidden";
}
export function h3PromptCheckMarkup(promptText, hasEndImage, mode, hasImageReference, hasVideoReference, durationSeconds, escapeHtml, ui = h3PromptPackFor("zh-CN").ui) {
    const result = checkH3Prompt(promptText, {
        hasEndImage,
        mode,
        hasImageReference,
        hasVideoReference,
        durationSeconds
    });
    return `<div id="h3-prompt-check" class="h3-prompt-check ${result.valid ? "valid" : "warning"}" aria-live="polite">
    <div class="h3-prompt-check-heading"><strong>${ui.t("promptCheckTitle")}</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}
export function h3PromptPresetOptions(selected, includeMultiReference, locale = "zh-CN") {
    const pack = h3PromptPackFor(locale);
    return pack.presetOrder
        .filter((preset) => includeMultiReference || preset !== "multi-reference")
        .map((preset) => `<option value="${preset}" data-description="${escapeHtml(pack.presetDescriptions[preset])}" title="${escapeHtml(pack.presetDescriptions[preset])}" ${selected === preset ? "selected" : ""}>${escapeHtml(pack.presetLabels[preset])}</option>`)
        .join("");
}
export function newH3ReferenceSlot(mediaPath = "", mediaType = "image") {
    return {
        id: crypto.randomUUID(),
        mediaType,
        mediaPath,
        role: "subject",
        note: ""
    };
}
export function h3ReferenceTag(slots, slotId) {
    const index = slots.findIndex((slot) => slot.id === slotId);
    if (index < 0)
        return "<Picture 1>";
    const slot = slots[index];
    const ordinal = slots
        .slice(0, index + 1)
        .filter((item) => item.mediaType === slot.mediaType)
        .length;
    return `<${slot.mediaType === "video" ? "Video" : "Picture"} ${ordinal}>`;
}
export async function loadImagePreview(context, filename, targetId, patchDraft) {
    if (!filename)
        return;
    const dataUrl = await context.studio.readImage(filename);
    const image = context.root.querySelector(`#${targetId}`);
    if (!image || !dataUrl)
        return;
    image.addEventListener("load", () => {
        if (!image.naturalWidth || !image.naturalHeight)
            return;
        image.closest(".drop-zone")?.style.setProperty("--image-ratio", `${image.naturalWidth} / ${image.naturalHeight}`);
        const state = context.getState();
        if (targetId === "start-preview" &&
            state &&
            (state.draft.sourceWidth !== image.naturalWidth ||
                state.draft.sourceHeight !== image.naturalHeight)) {
            patchDraft({
                sourceWidth: image.naturalWidth,
                sourceHeight: image.naturalHeight
            });
            context.requestRender();
        }
    }, { once: true });
    image.src = dataUrl;
}
