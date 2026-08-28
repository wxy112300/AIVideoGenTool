import { stripPromptAnnotations } from "../../prompt-annotations.js";
const qwenImagePromptPresetDefaults = {
    faithful: "Rewrite the user's image-edit instruction as one concise, direct English paragraph. Preserve the exact requested operation, subject identity, attributes, quantities, positions, reference-image roles, proper nouns, visible text, and explicit constraints. Clarify grammar and relationships only. Do not infer or add unsupported people, objects, backgrounds, styles, materials, lighting, composition changes, or story. Keep every quoted or visible text string in its original language and capitalization inside English double quotes. When multiple images are supplied, identify which Picture N contributes each requested element.",
    "detail-enhance": "Rewrite the user's image-edit instruction as one concise, direct English paragraph. Preserve the requested subject, identity, composition, edit scope, reference roles, proper nouns, visible text, and explicit constraints. Add only minimal details needed for visual feasibility: the affected region, spatial relationship, scale, orientation, material, lighting, perspective, contact shadow, edge blending, and unchanged areas. For add, delete, or replace operations, name the target and the requested result clearly. For people, preserve identity and important appearance unless changed. For style transfer, describe only the requested style features. When multiple images are supplied, identify each Picture N's contribution. Do not add unrelated content, generic quality slogans, H3 video structure, audio, or a timeline."
};
export function createDefaultQwenImagePromptPresets() {
    return { ...qwenImagePromptPresetDefaults };
}
export function normalizeQwenImagePromptPresets(value) {
    const defaults = createDefaultQwenImagePromptPresets();
    const source = value && typeof value === "object"
        ? value
        : {};
    return {
        faithful: typeof source.faithful === "string" && source.faithful.trim()
            ? source.faithful.trim()
            : defaults.faithful,
        "detail-enhance": typeof source["detail-enhance"] === "string" && source["detail-enhance"].trim()
            ? source["detail-enhance"].trim()
            : defaults["detail-enhance"]
    };
}
export function qwenImageEditPromptContract(preset, presetText = "", outputMode = "plain") {
    const modeRule = preset === "faithful"
        ? "Faithful mode: preserve the user's exact intent, operation, target, attributes, quantity, position, reference roles, proper nouns, visible text, and explicit constraints. Only clarify grammar and relationships. Do not infer unsupported visual details."
        : "Detail-enhance mode: preserve the user's intent and edit scope, then add only minimal execution details that improve visual feasibility, such as affected region, spatial relationship, scale, orientation, material, lighting, perspective, contact shadow, edge blending, and unchanged areas.";
    return [
        "You are an image-edit prompt optimizer for Qwen-Image-Edit-2511.",
        outputMode === "writer"
            ? "Produce exactly one concise, direct English paragraph inside the detailed_description field for the image-editing model."
            : "Return exactly one concise, direct English paragraph that can be sent to the image-editing model.",
        modeRule,
        "For add, delete, or replace operations, state the operation, target, requested result, and position or quantity only when supplied or necessary.",
        "For text editing, preserve every requested text string exactly, including its original language and capitalization, and wrap it in English double quotes. Do not translate or invent visible text.",
        "For people or recurring subjects, preserve identity and important appearance unless the user explicitly requests a change.",
        "For multiple images, refer to the supplied references as Picture 1, Picture 2, and so on, and state which image contributes each requested element when relevant.",
        "For style transfer or restoration, describe only the requested style or restoration change and preserve unrelated content.",
        outputMode === "writer"
            ? "Return the paragraph in a detailed_description field so the host can extract it. Keep any other required wrapper fields empty or N/A. Do not put H3 video, audio, or timeline content into the paragraph."
            : "Do not output headings, lists, JSON, Markdown, H3 fields, shots, timestamps, camera timelines, dialogue, audio, music, negative prompts, or generic quality slogans.",
        ...(presetText.trim() ? [`Apply this user-configured preset rule as additional guidance:\n${presetText.trim()}`] : [])
    ].join("\n");
}
export function qwenImageEditPromptUserContent(request) {
    const referenceContext = request.referenceContext?.trim();
    return [
        "Rewrite the user's image-edit instruction according to the image-edit contract.",
        ...(referenceContext ? [`Reference map:\n${referenceContext}`] : []),
        "User's original instruction:",
        request.prompt.trim(),
        "Output only the final English image-edit prompt. Preserve any proper nouns and visible text in their original wording."
    ].join("\n\n");
}
export function normalizeQwenImageEditPromptOutput(value) {
    const fenced = value
        .replace(/<think>[\s\S]*?<\/think>/giu, "")
        .replace(/^```(?:text|markdown)?\s*/iu, "")
        .replace(/\s*```$/u, "")
        .trim();
    const field = fenced.match(/(?:^|\n)\s*(?:[*#\s]*)(?:detailed_description|integrated_multimodal_description)\s*:\s*([\s\S]*?)(?=\n\s*(?:[*#\s]*)(?:subject_definitions|summary|retention_analysis|overall_soundscape|non_diegetic_music)\s*:|$)/iu);
    const prompt = field?.[1]?.trim() || fenced;
    return stripPromptAnnotations(prompt.replace(/\s+/gu, " ").trim());
}
