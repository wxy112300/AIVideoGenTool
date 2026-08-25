import { restoreH3DialogueLocks, restoreH3VisibleTextLocks } from "./h3-dialogue.js";
export function inferH3PromptMode(hasStartImage, hasEndImage, isR2V = false) {
    if (isR2V)
        return "R2V";
    if (hasStartImage && hasEndImage)
        return "FL2VA";
    if (hasStartImage)
        return "I2VA";
    if (hasEndImage)
        return "L2VA";
    return "T2VA";
}
export function h3EffectiveDurationSeconds(durationSeconds) {
    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 5;
    const requestedFrames = Math.max(5, Math.round(safeDuration * 24));
    const alignedFrames = requestedFrames +
        ((5 - (requestedFrames % 17) + 17) % 17);
    return alignedFrames / 24;
}
export function h3ExplicitConstraintSummary(promptText) {
    const prompt = promptText.trim();
    if (!prompt)
        return "";
    const constraints = [];
    const completeSilence = /(?:\b(?:no|without)\s+(?:any\s+)?(?:sound|audio)\b|\b(?:silent|silence|muted?)\b|完全静音|全程静音|不要任何声音|没有任何声音|无任何声音|静音)/iu.test(prompt);
    const noMusic = /(?:\b(?:no|without)\s+(?:any\s+)?(?:background\s+)?(?:music|bgm|score|soundtrack)\b|\b(?:music|bgm|score|soundtrack)\s*[:=]\s*(?:none|off|disabled)\b|(?:无|不要|不需要|不加|取消)(?:背景)?(?:音乐|配乐|BGM|音轨))/iu.test(prompt);
    const noDialogue = /(?:\b(?:no|without)\s+(?:any\s+)?(?:dialogue|speech|talking|spoken\s+words|vocals?)\b|无对白|不要对白|无对话|不要说话|不要人声|无旁白)/iu.test(prompt);
    const noVisibleText = /(?:\b(?:no|without)\s+(?:any\s+)?(?:on[- ]screen\s+)?(?:text|subtitles?)\b|不要字幕|不要文字|无字幕|无文字|不要屏幕文字)/iu.test(prompt);
    const oneShot = /(?:\b(?:one|single)\s+(?:continuous\s+)?(?:shot|take)\b|\bcontinuous\s+shot\b|\bno\s+(?:cuts?|scene\s+changes?)\b|\bwithout\s+(?:cuts?|scene\s+changes?)\b|一镜到底|单镜头|一个镜头|连续镜头|不切镜|不要剪辑|无剪辑|不换镜头|不要切换镜头)/iu.test(prompt);
    if (completeSilence) {
        constraints.push("Audio hard constraint: the target is completely silent. Keep the visual and action timeline in integrated_multimodal_description, but remove all audio events from it and set overall_soundscape and non_diegetic_music to N/A; do not add dialogue, singing, music, ambience, or sound effects.");
    }
    else {
        if (noMusic) {
            constraints.push("Music hard constraint: no non-diegetic background music, score, or soundtrack. Set non_diegetic_music to N/A; do not replace it with quiet, minimal, ambient, or low-volume music. Keep dialogue, ambience, and sound effects only when separately requested or causally required by the user's request.");
        }
        if (noDialogue) {
            constraints.push("Speech hard constraint: no spoken dialogue, narration, or singing. Do not invent a speaker or any <d> block.");
        }
    }
    if (noVisibleText) {
        constraints.push("Visible-text hard constraint: do not add subtitles, captions, signs, logos, labels, or other readable on-screen text unless the user explicitly asks for one.");
    }
    if (oneShot) {
        constraints.push("Single-shot hard constraint: output exactly one [Shot 1] with no [Shot 2] or later shots, no cuts, no scene changes, and no montage. Camera movement and action changes must happen inside the same continuous shot.");
    }
    if (!constraints.length)
        return "";
    return [
        "Explicit hard constraints extracted from the user's request (non-negotiable; preserve them even when a preset suggests otherwise):",
        ...constraints.map((constraint) => `- ${constraint}`)
    ].join("\n");
}
export function h3DurationPlan(mode, durationSeconds) {
    const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
    const beatCount = effectiveDuration <= 6
        ? 3
        : effectiveDuration <= 9
            ? 4
            : effectiveDuration <= 12
                ? 5
                : 6;
    const ranges = Array.from({ length: beatCount }, (_, index) => {
        const start = effectiveDuration * index / beatCount;
        const end = index === beatCount - 1
            ? effectiveDuration
            : effectiveDuration * (index + 1) / beatCount;
        return `${start.toFixed(2)}-${end.toFixed(2)}s`;
    }).join(", ");
    const pathRule = mode === "FL2VA"
        ? "Connect the first-frame state to the last-frame state across all beats; do not resolve the action early."
        : mode === "L2VA"
            ? "Begin from a plausible preceding state and reserve the final beat for convergence on the last frame."
            : mode === "I2VA"
                ? "Begin at the first-frame state and develop new action through the final beat."
                : mode === "R2V"
                    ? "Use the reference relationships throughout the timeline and make the final beat a clear settled result."
                    : "Build the complete audiovisual progression from opening state to final result.";
    return `Duration contract: the effective H3 duration is ${effectiveDuration.toFixed(2)} seconds. Do not compress this request into a 5-second event or finish the main action early. Plan ${beatCount} sequential development beats across the full clip (${ranges}); these ranges are planning scaffolding, not equal-time quotas. Allocate actual time according to the requested action's distance, scale, pace, acceleration, deceleration, reaction, and settling time. A walk or run from A to B must have enough continuous time to travel; never pack preparation, travel, impact, reaction, and the final hold into an implausibly short interval. Each beat must add a visible, audible, or behavioral change, and the final beat must settle at ${effectiveDuration.toFixed(2)} seconds. If the request contains more actions than the duration can support, preserve their order and user-required actions, simplify only assistant-added details, and do not invent impossible speed. ${pathRule}`;
}
export function h3AlignmentInstruction(mode, durationSeconds) {
    const effectiveDuration = h3EffectiveDurationSeconds(durationSeconds);
    if (mode === "I2VA") {
        return "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
    }
    if (mode === "FL2VA") {
        return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`;
    }
    if (mode === "L2VA") {
        return `How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`;
    }
    return "";
}
export function h3PromptSectionSkeleton(mode, durationSeconds) {
    const alignment = h3AlignmentInstruction(mode, durationSeconds);
    const sections = mode === "R2V"
        ? [
            "subject_definitions:",
            "summary:",
            "retention_analysis:",
            "detailed_description:",
            "overall_soundscape:",
            "non_diegetic_music:"
        ]
        : [
            "integrated_multimodal_description:",
            "overall_soundscape:",
            "non_diegetic_music:"
        ];
    return [
        ...(alignment ? [alignment, ""] : []),
        ...sections
    ].join("\n");
}
function stripLeadingH3AlignmentInstructions(promptText) {
    let prompt = promptText
        .replace(/<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>/giu, "")
        .trim();
    prompt = prompt.replace(/^```(?:text|markdown)?\s*/iu, "");
    prompt = prompt.replace(/\s*```$/u, "").trim();
    const alignmentLine = /^(?:For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.|How the reference pictures align with the target video —[^\r\n]+)\s*/iu;
    return prompt.replace(alignmentLine, "").trim();
}
function stripH3OutputPreamble(promptText, mode) {
    const firstSection = mode === "R2V"
        ? "subject_definitions"
        : "integrated_multimodal_description";
    const section = new RegExp(`^[*# \\t]*${firstSection}[ \\t]*:`, "imu").exec(promptText);
    return section?.index === undefined
        ? promptText.trim()
        : promptText.slice(section.index).trim();
}
export function normalizeH3PromptOutput(promptText, mode, durationSeconds, dialogueLocks = [], visibleTextLocks = []) {
    const cleanedBody = stripH3OutputPreamble(stripLeadingH3AlignmentInstructions(promptText), mode);
    const body = restoreH3VisibleTextLocks(restoreH3DialogueLocks(cleanedBody, dialogueLocks), visibleTextLocks);
    const alignment = h3AlignmentInstruction(mode, durationSeconds);
    if (!alignment)
        return body;
    return `${alignment}\n\n${body}`.trim();
}
