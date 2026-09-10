import type { H3LatentSaveMode } from "../types.js";

export const H3_LATENT_SAVE_MODES = [
  "all",
  "joint-av",
  "motion-context",
  "none"
] as const satisfies ReadonlyArray<H3LatentSaveMode>;

/**
 * Normalize the unified H3 latent output preference while keeping old
 * persisted h3SaveJointAv records meaningful. The old Motion Context path
 * saved its context latent independently, so an old R2V task with JointAV
 * disabled maps to the new Motion Context-only state.
 */
export function normalizeH3LatentSaveMode(
  value: unknown,
  legacySaveJointAv?: boolean,
  legacyMotionContextSaved = false
): H3LatentSaveMode {
  // A few callers can still spread a new default draft and then overwrite
  // only the legacy boolean. Treat that inconsistent pair as the old shape so
  // the compatibility field remains useful during the transition.
  if (value === "all" && legacySaveJointAv === false) {
    return legacyMotionContextSaved ? "motion-context" : "none";
  }
  if (H3_LATENT_SAVE_MODES.includes(value as H3LatentSaveMode)) {
    return value as H3LatentSaveMode;
  }
  if (legacySaveJointAv === false) {
    return legacyMotionContextSaved ? "motion-context" : "none";
  }
  return "all";
}

export function h3LatentSaveModeFor(
  value: { h3LatentSaveMode?: unknown; h3SaveJointAv?: boolean },
  legacyMotionContextSaved = false
): H3LatentSaveMode {
  return normalizeH3LatentSaveMode(
    value.h3LatentSaveMode,
    value.h3SaveJointAv,
    legacyMotionContextSaved
  );
}

export function h3LatentSaveModeSavesJointAv(mode: H3LatentSaveMode): boolean {
  return mode === "all" || mode === "joint-av";
}

export function h3LatentSaveModeSavesMotionContext(mode: H3LatentSaveMode): boolean {
  return mode === "all" || mode === "motion-context";
}

export function h3SaveJointAvForLatentSaveMode(mode: H3LatentSaveMode): boolean {
  return h3LatentSaveModeSavesJointAv(mode);
}
