const referenceRoles = new Set([
    "subject",
    "scene",
    "style",
    "motion",
    "camera",
    "voice",
    "keyframe",
    "other"
]);
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function normalizeH3ReferenceSlots(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        if (!isRecord(entry))
            return [];
        const mediaType = entry.mediaType === "video"
            ? "video"
            : "image";
        const legacyImagePath = typeof entry.imagePath === "string"
            ? entry.imagePath
            : "";
        const mediaPath = typeof entry.mediaPath === "string"
            ? entry.mediaPath
            : legacyImagePath;
        const role = referenceRoles.has(entry.role)
            ? entry.role
            : "subject";
        return [{
                id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
                mediaType,
                mediaPath,
                role,
                note: typeof entry.note === "string" ? entry.note : ""
            }];
    });
}
export function h3ReferenceSlotCounts(slots) {
    const imageCount = slots.filter((slot) => slot.mediaType === "image").length;
    const videoCount = slots.filter((slot) => slot.mediaType === "video").length;
    return { imageCount, videoCount, total: imageCount + videoCount };
}
/**
 * Motion Context reserves the first reference slot for the source video.
 * Older drafts may have started with an image slot, so prepend a source slot
 * instead of silently converting that image into the continuation context.
 */
export function ensureMotionContextSourceSlot(slots, sourceVideoPath) {
    const existing = slots.map((slot) => ({ ...slot }));
    const first = existing[0];
    // A video reference from the regular R2V composer can also be first, but it
    // is not the extension source unless it is explicitly marked for a motion
    // context (legacy source slots used roles such as `scene`) or already points
    // at the selected source file. A regular R2V video uses the default
    // `subject` role; keep it after the new locked source slot instead of
    // silently replacing user input.
    const firstIsSource = first?.mediaType === "video" && (first.role !== "subject" ||
        first.mediaPath === sourceVideoPath);
    const source = firstIsSource
        ? {
            ...first,
            mediaType: "video",
            mediaPath: sourceVideoPath,
            role: "motion"
        }
        : {
            id: crypto.randomUUID(),
            mediaType: "video",
            mediaPath: sourceVideoPath,
            role: "motion",
            note: ""
        };
    return firstIsSource
        ? [source, ...existing.slice(1)]
        : [source, ...existing];
}
export function motionContextReferenceSlotsReady(slots, sourceVideoPath) {
    const first = slots[0];
    const counts = h3ReferenceSlotCounts([...slots]);
    return Boolean(sourceVideoPath.trim()) &&
        first?.mediaType === "video" &&
        first.mediaPath === sourceVideoPath &&
        slots.every((slot) => Boolean(slot.mediaPath.trim())) &&
        counts.imageCount <= 9 &&
        counts.videoCount <= 3 &&
        counts.total <= 12;
}
