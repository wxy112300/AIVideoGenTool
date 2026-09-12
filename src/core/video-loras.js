import { H3_FL2VA_MODEL_ID, H3_SLA_TURBO_LORA_FILENAME, H3_SLA_TURBO_LORA_ID, H3_CAMERA_MOTION_LORA_FILENAME, H3_CAMERA_MOTION_LORA_ID, H3_CINEMATIC_REALISM_LORA_FILENAME, H3_CINEMATIC_REALISM_LORA_ID, H3_BETTER_HUMAN_MOTION_LORA_FILENAME, H3_BETTER_HUMAN_MOTION_LORA_ID, H3_EQUI360_LORA_FILENAME, H3_EQUI360_LORA_ID, H3_VR180_SBS_LORA_FILENAME, H3_VR180_SBS_LORA_ID, H3_AFTER_MIDNIGHT_LORA_FILENAME, H3_AFTER_MIDNIGHT_LORA_ID, H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME, H3_FACIAL_REALISM_CLOSEUP_LORA_ID, H3_REALISM_PEOPLE_LORA_FILENAME, H3_REALISM_PEOPLE_LORA_ID, H3_REF2V_TURBO_LORA_ID, H3_REF2V_TURBO_LORA_FILENAME, H3_PDD_COMFY_REVISION, H3_PDD_FL2VA_LORA_FILENAME, H3_PDD_FL2VA_LORA_ID, H3_PDD_LORA_IDS, H3_PDD_REF2VA_LORA_FILENAME, H3_PDD_REF2VA_LORA_ID, H3_TURBO_V4_LORA_FILENAME, H3_TURBO_V4_LORA_ID, H3_TURBO_LORA_FILENAME, H3_TURBO_LORA_ID, H3_TURBO_LORA_IDS, H3_TURBO_8STEP_V1_LORA_ID, LEGACY_H3_TURBO_MODEL_ID, LEGACY_H3_REF2V_TURBO_MODEL_ID, VIDEO_LORA_DEFINITIONS } from "./catalog/loras/definitions.js";
import { loraLocaleFor, loraRuleText } from "./catalog/loras/locales.js";
export { H3_FL2VA_MODEL_ID, H3_SLA_TURBO_LORA_FILENAME, H3_SLA_TURBO_LORA_ID, H3_CAMERA_MOTION_LORA_FILENAME, H3_CAMERA_MOTION_LORA_ID, H3_CINEMATIC_REALISM_LORA_FILENAME, H3_CINEMATIC_REALISM_LORA_ID, H3_BETTER_HUMAN_MOTION_LORA_FILENAME, H3_BETTER_HUMAN_MOTION_LORA_ID, H3_EQUI360_LORA_FILENAME, H3_EQUI360_LORA_ID, H3_VR180_SBS_LORA_FILENAME, H3_VR180_SBS_LORA_ID, H3_AFTER_MIDNIGHT_LORA_FILENAME, H3_AFTER_MIDNIGHT_LORA_ID, H3_FACIAL_REALISM_CLOSEUP_LORA_FILENAME, H3_FACIAL_REALISM_CLOSEUP_LORA_ID, H3_REALISM_PEOPLE_LORA_FILENAME, H3_REALISM_PEOPLE_LORA_ID, H3_REF2V_TURBO_LORA_FILENAME, H3_REF2V_TURBO_LORA_ID, H3_PDD_COMFY_REVISION, H3_PDD_FL2VA_LORA_FILENAME, H3_PDD_FL2VA_LORA_ID, H3_PDD_LORA_IDS, H3_PDD_REF2VA_LORA_FILENAME, H3_PDD_REF2VA_LORA_ID, H3_TURBO_V4_LORA_FILENAME, H3_TURBO_V4_LORA_ID, H3_TURBO_LORA_FILENAME, H3_TURBO_LORA_ID, H3_TURBO_LORA_IDS, H3_TURBO_8STEP_V1_LORA_ID, LEGACY_H3_REF2V_TURBO_MODEL_ID, LEGACY_H3_TURBO_MODEL_ID };
const allBuiltinVideoLoras = [...VIDEO_LORA_DEFINITIONS]
    .sort((left, right) => {
    const leftGroup = left.purpose === "performance" ? 0 : 1;
    const rightGroup = right.purpose === "performance" ? 0 : 1;
    return leftGroup - rightGroup || right.catalogOrder - left.catalogOrder;
})
    .map((definition) => ({
    ...videoLoraSelection(definition),
    ...(definition.retired ? { retired: true } : {}),
    guide: { ...loraLocaleFor(definition.id)?.guide },
    rules: definition.rules
}));
export const BUILTIN_VIDEO_LORAS = allBuiltinVideoLoras
    .filter((lora) => lora.retired !== true);
function requiredBuiltinVideoLora(id) {
    const lora = allBuiltinVideoLoras.find((candidate) => candidate.id === id);
    if (!lora)
        throw new Error(`Missing built-in video LoRA definition: ${id}`);
    return lora;
}
export const H3_TURBO_LORA = requiredBuiltinVideoLora(H3_TURBO_LORA_ID);
export const H3_SLA_TURBO_LORA = requiredBuiltinVideoLora(H3_SLA_TURBO_LORA_ID);
export const H3_CAMERA_MOTION_LORA = requiredBuiltinVideoLora(H3_CAMERA_MOTION_LORA_ID);
export const H3_CINEMATIC_REALISM_LORA = requiredBuiltinVideoLora(H3_CINEMATIC_REALISM_LORA_ID);
export const H3_BETTER_HUMAN_MOTION_LORA = requiredBuiltinVideoLora(H3_BETTER_HUMAN_MOTION_LORA_ID);
export const H3_EQUI360_LORA = requiredBuiltinVideoLora(H3_EQUI360_LORA_ID);
export const H3_VR180_SBS_LORA = requiredBuiltinVideoLora(H3_VR180_SBS_LORA_ID);
export const H3_TURBO_V4_LORA = requiredBuiltinVideoLora(H3_TURBO_V4_LORA_ID);
export const H3_TURBO_8STEP_V1_LORA = requiredBuiltinVideoLora(H3_TURBO_8STEP_V1_LORA_ID);
export const H3_REF2V_TURBO_LORA = requiredBuiltinVideoLora(H3_REF2V_TURBO_LORA_ID);
export const H3_PDD_FL2VA_LORA = requiredBuiltinVideoLora(H3_PDD_FL2VA_LORA_ID);
export const H3_PDD_REF2VA_LORA = requiredBuiltinVideoLora(H3_PDD_REF2VA_LORA_ID);
export const H3_AFTER_MIDNIGHT_LORA = requiredBuiltinVideoLora(H3_AFTER_MIDNIGHT_LORA_ID);
export const H3_REALISM_PEOPLE_LORA = requiredBuiltinVideoLora(H3_REALISM_PEOPLE_LORA_ID);
export const H3_FACIAL_REALISM_CLOSEUP_LORA = requiredBuiltinVideoLora(H3_FACIAL_REALISM_CLOSEUP_LORA_ID);
const LEGACY_H3_TURBO_V11_LORA_ID = "minimax-h3-lightx2v-turbo-4step-768p-v1.1";
const LEGACY_H3_EQUI360_LORA_FILENAME = "h3-equi360-lora-step2500.safetensors";
const REMOVED_VIDEO_LORA_NAMES = {
    "minimax-h3-turbo-ckpt850-ema": "MiniMax H3 Turbo ckpt850 EMA · 4-step motion fallback",
    "minimax-h3-lightx2v-turbo-4step": "LightX2V Turbo 4-Step · legacy v0.1",
    "minimax-h3-lightx2v-turbo-4step-768p-v1": "LightX2V Turbo 4-Step v1.0 · 768p",
    "minimax-h3-pink-fluffy-bunny-nsfw": "PinkFluffyBunny NSFW"
};
const legacyTurboLoraIdSet = new Set([
    ...H3_TURBO_LORA_IDS,
    LEGACY_H3_TURBO_V11_LORA_ID
]);
export function isH3TurboLoraId(id) {
    return legacyTurboLoraIdSet.has(id);
}
export function isH3SlaTurboLoraId(id) {
    return id === H3_SLA_TURBO_LORA_ID;
}
export function isH3TurboFourStepLoraId(id) {
    return id === H3_TURBO_LORA_ID || id === LEGACY_H3_TURBO_V11_LORA_ID;
}
export function isRemovedVideoLoraId(id) {
    return Object.prototype.hasOwnProperty.call(REMOVED_VIDEO_LORA_NAMES, id);
}
export function isH3TurboV4LoraId(id) {
    return id === H3_TURBO_V4_LORA_ID;
}
export function isH3Ref2vTurboLoraId(id) {
    return id === H3_REF2V_TURBO_LORA_ID;
}
export function isH3PddLoraId(id) {
    return H3_PDD_LORA_IDS.includes(id);
}
export function isH3PddFl2vaLoraId(id) {
    return id === H3_PDD_FL2VA_LORA_ID;
}
export function isH3PddRef2vaLoraId(id) {
    return id === H3_PDD_REF2VA_LORA_ID;
}
function isH3LowStepLoraId(id) {
    return isH3TurboLoraId(id) || isH3PddLoraId(id);
}
export function h3TurboLoraForSelection(loras, modelId = "") {
    return (loras ?? [])
        .map((lora) => videoLoraDefinition(lora.id))
        .find((lora) => Boolean(lora && isH3TurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, modelId)));
}
export function detectedVideoLoraFilename(profile) {
    const match = profile?.components.flatMap((component) => component.matches)[0];
    if (!match)
        return "";
    const normalized = match.replaceAll("\\", "/");
    const markerIndex = normalized.toLowerCase().lastIndexOf("loras/");
    return markerIndex >= 0 ? normalized.slice(markerIndex + "loras/".length) : "";
}
export function profileProvidesVideoLora(profile, filename) {
    if (!profile?.available)
        return false;
    const expected = `loras/${filename}`.replaceAll("\\", "/").toLowerCase();
    return profile.components.some((component) => component.matches.some((match) => {
        const normalized = match.replaceAll("\\", "/").toLowerCase();
        return normalized === expected || normalized.endsWith(`/${expected}`);
    }));
}
export function videoLoraSelection(definition, strength = definition.strength, filename = definition.filename) {
    return {
        id: definition.id,
        name: definition.name,
        filename,
        strength,
        modelFamily: definition.modelFamily,
        compatibleModelIds: [...definition.compatibleModelIds],
        compatibleInputModes: [...definition.compatibleInputModes],
        purpose: definition.purpose,
        promptPrefixes: [...(definition.promptPrefixes ?? [])]
    };
}
export function videoLoraDefinition(id) {
    return allBuiltinVideoLoras.find((lora) => lora.id === id);
}
export function videoLoraConfigurationIssues(context) {
    const issues = [];
    const selectedIds = new Set(context.videoLoras.map((lora) => lora.id));
    const settingValues = {
        spectrumMode: context.spectrumMode,
        attentionMode: context.attentionMode
    };
    const seen = new Set();
    const push = (issue) => {
        if (seen.has(issue.code))
            return;
        seen.add(issue.code);
        issues.push(issue);
    };
    context.videoLoras.forEach((lora) => {
        if (lora.historyOnly === true)
            return;
        if (!videoLoraCompatibleWithDraft(lora, context.modelId, context.inputMode)) {
            push({
                code: `compatibility:${lora.id}`,
                severity: "error",
                loraIds: [lora.id],
                message: loraRuleText(lora.id, "incompatible", context.locale).replace("{name}", lora.name)
            });
        }
        const definition = videoLoraDefinition(lora.id);
        if (!definition)
            return;
        if (definition.retired) {
            push({
                code: `retired:${lora.id}`,
                severity: "error",
                loraIds: [lora.id],
                message: loraRuleText(lora.id, "retired", context.locale).replace("{name}", lora.name)
            });
        }
        if (context.ratio !== undefined &&
            context.ratio !== "21:9" &&
            (lora.id === H3_EQUI360_LORA_ID || lora.id === H3_VR180_SBS_LORA_ID)) {
            push({
                code: `ratio:${lora.id}`,
                severity: "warning",
                loraIds: [lora.id],
                message: loraRuleText(lora.id, "ratio21By9", context.locale)
                    .replace("{name}", lora.name)
                    .replace("{ratio}", context.ratio)
            });
        }
        definition.rules.settingConflicts.forEach((conflict) => {
            if (!conflict.values.includes(settingValues[conflict.setting]))
                return;
            push({
                code: `setting:${lora.id}:${conflict.setting}`,
                severity: conflict.severity,
                loraIds: [lora.id],
                message: conflict.localeKey
                    ? loraRuleText(lora.id, conflict.localeKey, context.locale)
                    : conflict.message ?? loraRuleText(lora.id, "incompatible", context.locale)
            });
        });
        definition.rules.combinations.forEach((combination) => {
            if (!selectedIds.has(combination.loraId))
                return;
            const pair = [lora.id, combination.loraId].sort();
            push({
                code: `combination:${pair.join(":")}`,
                severity: combination.severity,
                loraIds: pair,
                message: combination.localeKey
                    ? loraRuleText(lora.id, combination.localeKey, context.locale)
                    : combination.message ?? loraRuleText(lora.id, "incompatible", context.locale)
            });
        });
    });
    const selectedTurboLoras = context.videoLoras.filter((lora) => isH3LowStepLoraId(lora.id) && videoLoraCompatibleWithModel(lora, context.modelId));
    for (let index = 1; index < selectedTurboLoras.length; index += 1) {
        const previous = selectedTurboLoras[index - 1];
        const current = selectedTurboLoras[index];
        const pair = [previous.id, current.id].sort();
        push({
            code: `combination:${pair.join(":")}`,
            severity: "error",
            loraIds: pair,
            message: loraRuleText(current.id, "turboVariant", context.locale)
        });
    }
    for (let index = 1; index < context.videoLoras.length; index += 1) {
        const previous = videoLoraDefinition(context.videoLoras[index - 1].id);
        const current = videoLoraDefinition(context.videoLoras[index].id);
        if (!previous || !current || previous.rules.orderPriority <= current.rules.orderPriority)
            continue;
        push({
            code: `order:${previous.id}:${current.id}`,
            severity: "warning",
            loraIds: [previous.id, current.id],
            message: loraRuleText(current.id, "orderSuggestion", context.locale)
                .replace("{current}", current.name)
                .replace("{previous}", previous.name)
        });
    }
    return issues;
}
export function reorderVideoLoras(loras, id, direction) {
    const currentIndex = loras.findIndex((lora) => lora.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= loras.length) {
        return loras.map((lora) => ({ ...lora }));
    }
    const reordered = loras.map((lora) => ({ ...lora }));
    const current = reordered[currentIndex];
    const target = reordered[targetIndex];
    reordered[currentIndex] = target;
    reordered[targetIndex] = current;
    return reordered;
}
/** Keep the draft from holding more than one Turbo variant at a time. */
export function videoLorasAfterAdding(loras, addition) {
    const turboIndex = loras.findIndex((lora) => isH3LowStepLoraId(lora.id));
    const retained = isH3LowStepLoraId(addition.id)
        ? loras.filter((lora) => !isH3LowStepLoraId(lora.id))
        : [...loras];
    const next = [...retained];
    if (isH3LowStepLoraId(addition.id) && turboIndex >= 0) {
        next.splice(Math.min(turboIndex, next.length), 0, addition);
    }
    else {
        next.push(addition);
    }
    return next.map((lora) => ({
        ...lora,
        compatibleModelIds: [...lora.compatibleModelIds],
        compatibleInputModes: [...lora.compatibleInputModes],
        ...(lora.promptPrefixes ? { promptPrefixes: [...lora.promptPrefixes] } : {})
    }));
}
export function baseVideoModelId(modelId) {
    if (modelId === LEGACY_H3_TURBO_MODEL_ID)
        return H3_FL2VA_MODEL_ID;
    if (modelId === LEGACY_H3_REF2V_TURBO_MODEL_ID)
        return "minimax_h3_ref2va";
    return modelId;
}
export function normalizeVideoLoras(value, legacyModelId = "") {
    const items = Array.isArray(value) ? value : [];
    const normalized = items.flatMap((item) => {
        if (!item || typeof item !== "object")
            return [];
        const candidate = item;
        if (typeof candidate.id !== "string" || !candidate.id.trim())
            return [];
        const rawId = candidate.id.trim();
        if (candidate.historyOnly === true || isRemovedVideoLoraId(rawId))
            return [];
        const canonicalId = rawId === LEGACY_H3_TURBO_V11_LORA_ID ? H3_TURBO_LORA_ID : rawId;
        if (typeof candidate.name !== "string" || !candidate.name.trim() ||
            typeof candidate.filename !== "string" || !candidate.filename.trim())
            return [];
        const builtin = allBuiltinVideoLoras.find((lora) => lora.id === canonicalId);
        const definition = builtin ?? {
            id: canonicalId,
            name: candidate.name.trim(),
            filename: candidate.filename.trim(),
            strength: 1,
            modelFamily: typeof candidate.modelFamily === "string" ? candidate.modelFamily : "unknown",
            compatibleModelIds: Array.isArray(candidate.compatibleModelIds)
                ? candidate.compatibleModelIds.filter((id) => typeof id === "string")
                : [],
            compatibleInputModes: Array.isArray(candidate.compatibleInputModes)
                ? candidate.compatibleInputModes.filter((mode) => mode === "image" || mode === "video")
                : ["image"],
            purpose: candidate.purpose ?? "style",
            promptPrefixes: Array.isArray(candidate.promptPrefixes)
                ? candidate.promptPrefixes.filter((prefix) => typeof prefix === "string")
                : []
        };
        const normalizedFilename = builtin && (rawId === LEGACY_H3_TURBO_V11_LORA_ID ||
            (rawId === H3_EQUI360_LORA_ID && candidate.filename.trim() === LEGACY_H3_EQUI360_LORA_FILENAME))
            ? builtin.filename
            : candidate.filename.trim();
        const normalizedItem = videoLoraSelection(definition, typeof candidate.strength === "number" && Number.isFinite(candidate.strength)
            ? Math.max(0, Math.min(2, candidate.strength))
            : builtin?.strength ?? 1, normalizedFilename);
        return [normalizedItem];
    });
    if (legacyModelId === LEGACY_H3_TURBO_MODEL_ID &&
        !normalized.some((item) => item.id === H3_TURBO_LORA_ID)) {
        normalized.push(videoLoraSelection(H3_TURBO_LORA));
    }
    if (legacyModelId === LEGACY_H3_REF2V_TURBO_MODEL_ID &&
        !normalized.some((item) => item.id === H3_REF2V_TURBO_LORA_ID)) {
        normalized.push(videoLoraSelection(H3_REF2V_TURBO_LORA));
    }
    return normalized.filter((lora, index) => normalized.findIndex((candidate) => candidate.id === lora.id) === index);
}
/** Preserve removed LoRAs in history as name-only snapshots without reintroducing them to creation. */
export function normalizeHistoryVideoLoras(value, legacyModelId = "") {
    const items = Array.isArray(value) ? value : [];
    const normalizedActive = normalizeVideoLoras(items, legacyModelId);
    const activeById = new Map(normalizedActive.map((lora) => [lora.id, lora]));
    const result = [];
    const seen = new Set();
    for (const item of items) {
        if (!item || typeof item !== "object")
            continue;
        const candidate = item;
        if (typeof candidate.id !== "string" || !candidate.id.trim())
            continue;
        const rawId = candidate.id.trim();
        if (isRemovedVideoLoraId(rawId)) {
            if (seen.has(rawId))
                continue;
            seen.add(rawId);
            result.push({
                id: rawId,
                name: typeof candidate.name === "string" && candidate.name.trim()
                    ? candidate.name.trim()
                    : REMOVED_VIDEO_LORA_NAMES[rawId] ?? rawId,
                filename: "",
                strength: 0,
                historyOnly: true,
                modelFamily: "history",
                compatibleModelIds: [],
                compatibleInputModes: [],
                purpose: "style",
                promptPrefixes: []
            });
            continue;
        }
        const canonicalId = rawId === LEGACY_H3_TURBO_V11_LORA_ID ? H3_TURBO_LORA_ID : rawId;
        const active = activeById.get(canonicalId);
        if (!active || seen.has(canonicalId))
            continue;
        seen.add(canonicalId);
        result.push({ ...active });
    }
    for (const active of normalizedActive) {
        if (seen.has(active.id))
            continue;
        seen.add(active.id);
        result.push({ ...active });
    }
    return result;
}
/** Strip history-only snapshots before copying a history record into a creation draft. */
export function videoLorasForCreation(value) {
    return normalizeVideoLoras(value);
}
export function videoLoraCompatibleWithModel(lora, modelId) {
    return lora.compatibleModelIds.length === 0 ||
        lora.compatibleModelIds.includes(baseVideoModelId(modelId));
}
export function videoLoraCompatibleWithDraft(lora, modelId, inputMode) {
    return videoLoraCompatibleWithModel(lora, modelId) &&
        lora.compatibleInputModes.includes(inputMode);
}
export function hasVideoLora(loras, id) {
    return Boolean(loras?.some((lora) => lora.id === id));
}
export function isH3TurboEnabled(value) {
    return value.modelId === LEGACY_H3_TURBO_MODEL_ID ||
        value.modelId === LEGACY_H3_REF2V_TURBO_MODEL_ID ||
        Boolean(h3TurboLoraForSelection(value.videoLoras, baseVideoModelId(value.modelId)));
}
export function isH3Ref2vTurboEnabled(value) {
    return value.modelId === LEGACY_H3_REF2V_TURBO_MODEL_ID ||
        Boolean((value.videoLoras ?? []).some((lora) => isH3Ref2vTurboLoraId(lora.id) && videoLoraCompatibleWithModel(lora, baseVideoModelId(value.modelId))));
}
export function bundledWorkflowModelId(value) {
    if (isH3Ref2vTurboEnabled(value))
        return baseVideoModelId(value.modelId);
    return isH3TurboEnabled(value)
        ? LEGACY_H3_TURBO_MODEL_ID
        : baseVideoModelId(value.modelId);
}
export function videoLoraFilename(loras, id) {
    return loras?.find((lora) => lora.id === id)?.filename ?? "";
}
export function promptContainsVideoLoraTrigger(prompt, trigger) {
    const normalizedPrompt = prompt.replace(/\s+/gu, " ").trim().toLowerCase();
    const normalizedTrigger = trigger.replace(/\s+/gu, " ").trim().toLowerCase();
    if (!normalizedTrigger)
        return true;
    let searchFrom = 0;
    while (searchFrom < normalizedPrompt.length) {
        const index = normalizedPrompt.indexOf(normalizedTrigger, searchFrom);
        if (index < 0)
            return false;
        const before = normalizedPrompt[index - 1];
        const after = normalizedPrompt[index + normalizedTrigger.length];
        const isTokenCharacter = (value) => Boolean(value && /[\p{L}\p{N}]/u.test(value));
        if (!isTokenCharacter(before) && !isTokenCharacter(after))
            return true;
        searchFrom = index + normalizedTrigger.length;
    }
    return false;
}
function promptWithTriggersInFirstH3Shot(prompt, triggerText) {
    const section = /(?:integrated_multimodal_description|detailed_description)\s*:/iu.exec(prompt);
    if (!section)
        return undefined;
    const sectionBodyStart = section.index + section[0].length;
    const firstShot = /\[Shot 1\]\s*/iu.exec(prompt.slice(sectionBodyStart));
    if (!firstShot)
        return undefined;
    const insertionIndex = sectionBodyStart + firstShot.index + firstShot[0].length;
    return `${prompt.slice(0, insertionIndex)}${triggerText}, ${prompt.slice(insertionIndex)}`;
}
export function videoPromptForLoras(prompt, loras) {
    const prefixes = [...new Set((loras ?? []).flatMap((lora) => lora.promptPrefixes ?? videoLoraDefinition(lora.id)?.promptPrefixes ?? []).map((prefix) => prefix.trim()).filter(Boolean))];
    const normalizedPrompt = prompt.trim();
    const missingPrefixes = prefixes.filter((prefix) => !promptContainsVideoLoraTrigger(normalizedPrompt, prefix));
    if (!missingPrefixes.length)
        return normalizedPrompt;
    const triggerText = missingPrefixes.join(", ");
    const structuredPrompt = promptWithTriggersInFirstH3Shot(normalizedPrompt, triggerText);
    if (structuredPrompt)
        return structuredPrompt;
    const referencePreamble = normalizedPrompt.match(/^(For the target video, at 0\.00 seconds[^\n]*? is (?:fully|partially) referenced\.|How the reference pictures align with the target video[^\n]*\.)(?:\s*\n\s*)?/iu);
    if (!referencePreamble) {
        return normalizedPrompt ? `${triggerText}, ${normalizedPrompt}` : triggerText;
    }
    const body = normalizedPrompt.slice(referencePreamble[0].length).trim();
    return body
        ? `${referencePreamble[1]}\n\n${triggerText}, ${body}`
        : `${referencePreamble[1]}\n\n${triggerText}`;
}
