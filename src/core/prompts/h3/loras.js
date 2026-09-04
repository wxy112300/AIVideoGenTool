export const h3LoraPromptLibrary = {
    "minimax-h3-facial-realism-closeup": {
        id: "minimax-h3-facial-realism-closeup",
        triggerWord: "Facial Realism",
        instruction: "When the request calls for a human face, favor believable close-up facial performance: natural skin texture, eyes, blinks, small gaze shifts, subtle expression changes, and restrained facial micro-motion. Protect the referenced person's identity and do not beautify, age, reshape, or invent facial details.",
        usage: "This is a quality/content adapter, not an acceleration or camera-motion adapter. Do not force a close-up when the user requests another framing; keep all requested action, camera, audio, and reference roles intact."
    },
    "minimax-h3-realism-people": {
        id: "minimax-h3-realism-people",
        triggerWord: "r34l1sm",
        instruction: "For human-centered shots, preserve believable skin, facial expression, hands, gestures, film lighting, and natural movement where relevant; do not turn a non-human or non-people request into a portrait.",
        usage: "This is a broad people-realism adapter. Keep any close-up emphasis subordinate to the user's requested framing, and do not invent camera motion or content that the user did not request."
    }
};
export function h3LoraPromptProfileFor(id) {
    return h3LoraPromptLibrary[id];
}
function selectionLabel(lora) {
    const name = lora.name.trim() || lora.id;
    const id = lora.id.trim() || "unknown";
    const strength = Number.isFinite(lora.strength) ? `, strength ${lora.strength}` : "";
    return `${name} [${id}, purpose ${lora.purpose}${strength}]`;
}
export function h3LoraPromptInstruction(loras) {
    const selected = (loras ?? [])
        .filter((lora) => lora.id.trim())
        .filter((lora, index, values) => values.findIndex((candidate) => candidate.id === lora.id) === index);
    if (!selected.length)
        return "";
    return [
        "Selected H3 LoRA context (execution metadata, not user-authored content):",
        "The user has enabled the following optional LoRA adapters. Tailor the generated H3 prompt only where an adapter supports the user's intent. Preserve explicit content, reference identity, framing, camera, timing, dialogue, audio, and mode constraints. Do not mention this metadata, explain the adapter, or emit workflow commentary in the final prompt. The application injects execution trigger words separately, so do not repeat trigger words as scene prose.",
        ...selected.map((lora) => {
            const profile = h3LoraPromptProfileFor(lora.id);
            const trigger = profile?.triggerWord || lora.promptPrefixes?.filter(Boolean).join(", ") || "";
            const metadata = `- Adapter: ${selectionLabel(lora)}${trigger ? `; canonical trigger: ${trigger}` : ""}`;
            if (!profile) {
                return `${metadata}\n  Guidance: Treat this as an optional adapter; preserve user intent and do not invent unsupported effects.`;
            }
            return [
                metadata,
                `  Guidance: ${profile.instruction}`,
                `  Usage: ${profile.usage}`
            ].join("\n");
        })
    ].join("\n\n");
}
