export function countPromptWords(text) {
    const normalized = text.trim();
    if (!normalized)
        return 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(normalized)) {
        if (segment.isWordLike)
            count += 1;
    }
    return count;
}
export function recommendedH3PromptWords(mode, durationSeconds = 5) {
    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 5;
    if (mode === "R2V")
        return Math.max(500, Math.round(350 + safeDuration * 30));
    return Math.max(280, Math.round(140 + safeDuration * 28));
}
