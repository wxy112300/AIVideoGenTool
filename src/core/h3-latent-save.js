export const H3_LATENT_SAVE_MODES = [
    "all",
    "joint-av",
    "motion-context",
    "none"
];
/**
 * Normalize the unified H3 latent output preference while keeping old
 * persisted h3SaveJointAv records meaningful. The old Motion Context path
 * saved its context latent independently, so an old R2V task with JointAV
 * disabled maps to the new Motion Context-only state.
 */
export function normalizeH3LatentSaveMode(value, legacySaveJointAv, legacyMotionContextSaved = false) {
    // A few callers can still spread a new default draft and then overwrite
    // only the legacy boolean. Treat that inconsistent pair as the old shape so
    // the compatibility field remains useful during the transition.
    if (value === "all" && legacySaveJointAv === false) {
        return legacyMotionContextSaved ? "motion-context" : "none";
    }
    if (H3_LATENT_SAVE_MODES.includes(value)) {
        return value;
    }
    if (legacySaveJointAv === false) {
        return legacyMotionContextSaved ? "motion-context" : "none";
    }
    return "all";
}
export function h3LatentSaveModeFor(value, legacyMotionContextSaved = false) {
    return normalizeH3LatentSaveMode(value.h3LatentSaveMode, value.h3SaveJointAv, legacyMotionContextSaved);
}
export function h3LatentSaveModeSavesJointAv(mode) {
    return mode === "all" || mode === "joint-av";
}
export function h3LatentSaveModeSavesMotionContext(mode) {
    return mode === "all" || mode === "motion-context";
}
export function h3SaveJointAvForLatentSaveMode(mode) {
    return h3LatentSaveModeSavesJointAv(mode);
}
