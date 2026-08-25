export function zImagePromptContract(preset, presetText = "", outputMode = "plain") {
    const modeRule = preset === "faithful"
        ? "Faithful mode: preserve the user's exact operation, subject identity, attributes, quantity, visible text, composition, and explicit constraints. Clarify only what is needed to execute the request."
        : "Detail-enhance mode: preserve the user's edit scope, then add only useful visual execution details such as viewpoint, camera distance, spatial relationships, scale, material, lighting, perspective, depth, texture, and natural edge blending.";
    return [
        "You are an image-generation and image-edit prompt optimizer for Z-Image and Z-Image-Turbo.",
        outputMode === "writer"
            ? "Write exactly one concise, direct English paragraph inside the detailed_description field for the image model."
            : "Return exactly one concise, direct English paragraph that can be sent to the image model.",
        "The target is a single visual result. If no reference image is supplied, write a text-to-image prompt. If one reference image is supplied, describe the requested transformation relative to Picture 1 and do not invent additional reference images.",
        "For viewpoint changes, state the new camera angle, viewing direction, subject pose/orientation, framing, and the spatial relationships that must remain coherent. For added detail or restoration, specify the affected region and the material, texture, lighting, shadow, perspective, and depth cues that make the change belong in the scene.",
        "When a Mask is supplied, treat it as a location-only edit boundary: change the masked region and the minimum feathered surroundings while preserving unmasked pixels, identity, composition, and visible text. When annotation notes or an annotation guide are supplied, use them only to locate the requested targets and never reproduce marks, boxes, arrows, labels, notes, or annotation text.",
        "Preserve proper nouns, numbers, logos, and visible text exactly unless the user explicitly requests a text change.",
        modeRule,
        outputMode === "writer"
            ? "Return the paragraph in a detailed_description field. Keep unrelated H3 video, audio, timeline, dialogue, and shot fields empty or N/A."
            : "Do not output headings, lists, JSON, Markdown, camera timelines, dialogue, audio, negative prompts, or generic quality slogans.",
        ...(presetText.trim() ? [`Apply this user-configured preset rule as additional guidance:\n${presetText.trim()}`] : [])
    ].join("\n");
}
export function zImagePromptUserContent(request) {
    const referenceContext = request.referenceContext?.trim();
    const hasReference = Boolean(request.imagePaths?.length || request.imagePath);
    return [
        "Rewrite the user's instruction according to the Z-Image prompt contract.",
        `Routing: ${hasReference ? "one reference image is supplied as Picture 1" : "no reference image is supplied; use text-to-image wording"}.`,
        ...(referenceContext ? [`Reference map:\n${referenceContext}`] : []),
        "User's original instruction:",
        request.prompt.trim(),
        "Output only the final English image prompt. Preserve proper nouns and visible text exactly."
    ].join("\n\n");
}
