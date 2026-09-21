import { stripPromptAnnotations } from "../../prompt-annotations.js";
const qwenImage21PromptPresetDefaults = {
    faithful: "Rewrite the user's image-generation or image-edit instruction as one concise, direct English paragraph for Qwen Image 2.1. Preserve the exact requested operation, subject identity, attributes, quantities, positions, reference-image roles, proper nouns, visible text, and explicit constraints. When reference images are supplied, use <image1>, <image2>, and so on in input order; for text-only prompts, do not invent reference-image tokens. Clarify grammar and relationships only. Do not infer or add unsupported people, objects, backgrounds, styles, materials, lighting, composition changes, or story. Keep every quoted or visible text string in its original language and capitalization inside English double quotes.",
    "detail-enhance": "Rewrite the user's image-generation or image-edit instruction as one concise, direct English paragraph for Qwen Image 2.1. Preserve the requested subject, identity, composition, edit scope, reference roles, proper nouns, visible text, and explicit constraints. When reference images are supplied, use <image1>, <image2>, and so on to identify them; for text-only prompts, do not invent reference-image tokens. Add only minimal details needed for visual feasibility: affected region, spatial relationship, scale, orientation, material, lighting, perspective, contact shadow, edge blending, and unchanged areas. Do not add unrelated content, generic quality slogans, H3 video structure, audio, or a timeline."
};
export function createDefaultQwenImage21PromptPresets() {
    return { ...qwenImage21PromptPresetDefaults };
}
export function normalizeQwenImage21PromptPresets(value) {
    const defaults = createDefaultQwenImage21PromptPresets();
    const source = value && typeof value === "object" ? value : {};
    return {
        faithful: typeof source.faithful === "string" && source.faithful.trim() ? source.faithful.trim() : defaults.faithful,
        "detail-enhance": typeof source["detail-enhance"] === "string" && source["detail-enhance"].trim() ? source["detail-enhance"].trim() : defaults["detail-enhance"]
    };
}
export function qwenImage21PromptContract(preset, presetText = "", outputMode = "plain") {
    const modeRule = preset === "faithful"
        ? "Faithful mode: preserve the user's exact intent, operation, target, attributes, quantity, position, reference roles, proper nouns, visible text, and explicit constraints. Only clarify grammar and relationships. Do not infer unsupported visual details."
        : "Detail-enhance mode: preserve the user's intent and edit scope, then add only minimal execution details that improve visual feasibility, such as affected region, spatial relationship, scale, orientation, material, lighting, perspective, contact shadow, edge blending, and unchanged areas.";
    return [
        "You are an image-generation and image-edit prompt optimizer for Qwen Image 2.1.",
        outputMode === "writer" ? "Produce exactly one concise, direct English paragraph inside the detailed_description field for the image model." : "Return exactly one concise, direct English paragraph that can be sent to the image model.",
        modeRule,
        "For add, delete, or replace operations, state the operation, target, requested result, and position or quantity only when supplied or necessary.",
        "For text editing, preserve every requested text string exactly, including its original language and capitalization, and wrap it in English double quotes. Do not translate or invent visible text.",
        "For people or recurring subjects, preserve identity and important appearance unless the user explicitly requests a change.",
        "When references are supplied, use the official Qwen Image 2.1 tokens <image1>, <image2>, and so on in input order. State which image contributes each requested element when relevant. When no reference is supplied, write a self-contained text-to-image prompt and do not invent image tokens.",
        "Treat any paired Paint annotation image as location-only guidance. Never reproduce colored marks, arrows, boxes, labels, or annotation text in the output.",
        outputMode === "writer" ? "Return the paragraph in a detailed_description field so the host can extract it. Keep any other required wrapper fields empty or N/A. Do not put H3 video, audio, or timeline content into the paragraph." : "Do not output headings, lists, JSON, Markdown, H3 fields, shots, timestamps, camera timelines, dialogue, audio, music, negative prompts, or generic quality slogans.",
        ...(presetText.trim() ? [`Apply this user-configured preset rule as additional guidance:\n${presetText.trim()}`] : [])
    ].join("\n");
}
export function qwenImage21PromptUserContent(request) {
    const referenceContext = request.referenceContext?.trim();
    const hasReferences = Boolean(referenceContext) || (request.imagePaths?.length ?? 0) > 0;
    return [
        hasReferences ? "Rewrite the user's image-edit instruction according to the Qwen Image 2.1 edit contract." : "Rewrite the user's text-to-image instruction according to the Qwen Image 2.1 T2I contract. No reference image is supplied.",
        ...(referenceContext ? [`Reference map:\n${referenceContext}`] : []),
        hasReferences ? "Use <image1>, <image2>, and so on for supplied images in input order." : "Do not add <image1>, <image2>, or any other reference-image token.",
        "User's original instruction:",
        request.prompt.trim(),
        hasReferences ? "Output only the final English image-edit prompt. Preserve proper nouns and visible text in their original wording." : "Output only the final English image-generation prompt. Preserve proper nouns and visible text in their original wording."
    ].join("\n\n");
}
export function normalizeQwenImage21PromptOutput(value) {
    const fenced = value.replace(/<think>[\s\S]*?<\/think>/giu, "").replace(/^```(?:text|markdown)?\s*/iu, "").replace(/\s*```$/u, "").trim();
    const field = fenced.match(/(?:^|\n)\s*(?:[*#\s]*)(?:detailed_description|integrated_multimodal_description)\s*:\s*([\s\S]*?)(?=\n\s*(?:[*#\s]*)(?:subject_definitions|summary|retention_analysis|overall_soundscape|non_diegetic_music)\s*:|$)/iu);
    const prompt = field?.[1]?.trim() || fenced;
    return stripPromptAnnotations(prompt.replace(/\s+/gu, " ").trim());
}
