export function hidreamO1PromptContract(preset, presetText = "", outputMode = "plain") {
    const modeRule = preset === "faithful"
        ? "Faithful mode: preserve the user's exact operation, subject identity, attributes, quantity, visible text, composition, and explicit constraints. Clarify only what is needed to execute the request."
        : "Detail-enhance mode: preserve the user's edit scope, then add useful visual execution details such as camera angle, viewing direction, framing, spatial relationships, scale, material, lighting, shadow, perspective, depth, texture, and natural edge blending. Do not add unrelated objects or style changes.";
    return [
        "You are an image-generation and image-edit prompt optimizer for HiDream-O1-Image Full.",
        outputMode === "writer"
            ? "Write exactly one concise, self-contained English paragraph inside the detailed_description field for the image model."
            : "Return exactly one concise, self-contained English paragraph that can be sent to the image model.",
        "The target is one visual result. With no reference image, write a text-to-image prompt. With one reference image, describe the requested instruction edit relative to Picture 1 and never invent additional reference images.",
        "HiDream-O1-Image is strong at long text and layout: preserve requested visible text exactly and, when text is involved, specify the exact wording, font or lettering style, color, size, alignment, and placement.",
        "For viewpoint changes, state the new camera angle, viewing direction, subject pose or orientation, framing, and spatial relationships that must remain physically coherent. For added detail or restoration, specify the affected region and the material, texture, lighting, shadow, perspective, depth, and edge-blending cues that make the change belong in the scene.",
        "When a Mask is supplied, treat it as a location-only edit boundary. Change the masked region and the minimum surrounding pixels needed for a natural result, while preserving unmasked content, identity, composition, and visible text. When annotation notes or a rendered annotation guide are supplied, use them only to locate targets and never reproduce colored marks, boxes, arrows, labels, notes, or annotation text.",
        "Preserve proper nouns, numbers, logos, and visible text exactly unless the user explicitly requests a text change.",
        modeRule,
        outputMode === "writer"
            ? "Return the paragraph in a detailed_description field. Keep unrelated H3 video, audio, timeline, dialogue, and shot fields empty or N/A."
            : "Do not output headings, lists, JSON, Markdown, camera timelines, dialogue, audio, negative prompts, or generic quality slogans.",
        ...(presetText.trim() ? [`Apply this user-configured preset rule as additional guidance:\n${presetText.trim()}`] : [])
    ].join("\n");
}
export function hidreamO1PromptUserContent(request) {
    const referenceContext = request.referenceContext?.trim();
    const hasReference = Boolean(request.imagePaths?.length || request.imagePath);
    return [
        "Rewrite the user's instruction according to the HiDream-O1-Image prompt contract.",
        `Routing: ${hasReference ? "one reference image is supplied as Picture 1; write an instruction edit relative to it" : "no reference image is supplied; use text-to-image wording"}.`,
        ...(referenceContext ? [`Reference map:\n${referenceContext}`] : []),
        "User's original instruction:",
        request.prompt.trim(),
        "Output only the final English image prompt. Preserve proper nouns, numbers, and visible text exactly."
    ].join("\n\n");
}
