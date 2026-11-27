/** Pure Continuum V3.9 per-chunk reference routing helpers. */

export interface ContinuumReferenceRouting {
  mode: "per_chunk";
  /** Fixed R1..R9 selectors ("all", "off", or comma-separated 1-based chunk indices). */
  selectors: Record<string, string>;
}

const REFERENCE_SLOT_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"] as const;
const EXPLICIT_V39_TAG = /(?<![A-Za-z0-9_])@R([1-9])(?![A-Za-z0-9_])/gu;
const PICTURE_TAG = /<Picture ([1-9])>/gu;

export function hasExplicitV39ReferenceTags(prompts: readonly string[]): boolean {
  return prompts.some(prompt => /(?<![A-Za-z0-9_])@R[1-9](?![A-Za-z0-9_])/u.test(prompt));
}

export function extractChunkReferenceOrdinals(prompt: string): Set<number> {
  const ordinals = new Set<number>();
  for (const match of prompt.matchAll(PICTURE_TAG)) ordinals.add(Number(match[1]));
  for (const match of prompt.matchAll(EXPLICIT_V39_TAG)) ordinals.add(Number(match[1]));
  return ordinals;
}

/** Rewrite <Picture 1..9> into fixed V3.9 @R1..@R9 tags without renumbering slots. */
export function rewritePromptPicturesToV39Tags(prompt: string): string {
  return prompt.replace(PICTURE_TAG, (_tag, ordinal: string) => `@R${ordinal}`);
}

/**
 * Derive Continuum V3.9 per-chunk routing from raw chunk prompts and reference slots.
 *
 * Returns undefined (staying on V3.8 all-chunks) when:
 * - fewer than 2 filled reference images exist and no explicit @R1..@R9 tags are used; or
 * - every filled reference image applies to all chunks and no explicit @R1..@R9 tags are used.
 *
 * Any filled reference image that is never mentioned in any chunk defaults to "all"
 * so silent style/scene references still apply everywhere.
 */
export function deriveContinuumReferenceRouting(
  rawPrompts: readonly string[],
  referenceImages: readonly string[] | undefined,
  timedGuides?: readonly { picture: number; absoluteFrame: number }[],
  chunkSeconds?: number
): ContinuumReferenceRouting | undefined {
  if (!referenceImages?.length || !rawPrompts.length) return undefined;
  const slots = referenceImages.slice(0, 9);
  const filledCount = slots.filter(filename => Boolean(filename?.trim())).length;
  if (!filledCount) return undefined;
  const explicitV39 = hasExplicitV39ReferenceTags(rawPrompts);
  if (filledCount < 2 && !explicitV39) return undefined;

  const totalChunks = rawPrompts.length;
  const mentionedChunks = new Map<number, Set<number>>();
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const chunkNumber = chunkIndex + 1;
    for (const ordinal of extractChunkReferenceOrdinals(rawPrompts[chunkIndex] ?? "")) {
      if (ordinal < 1 || ordinal > 9 || !slots[ordinal - 1]?.trim()) continue;
      const set = mentionedChunks.get(ordinal) ?? new Set<number>();
      set.add(chunkNumber);
      mentionedChunks.set(ordinal, set);
    }
  }
  if (timedGuides?.length && Number.isFinite(chunkSeconds) && (chunkSeconds ?? 0) > 0) {
    const framesPerChunk = Math.round(chunkSeconds! * 24);
    for (const guide of timedGuides) {
      if (guide.picture < 1 || guide.picture > 9 || !slots[guide.picture - 1]?.trim()) continue;
      const chunkNumber = Math.max(1, Math.min(totalChunks, Math.floor(guide.absoluteFrame / Math.max(1, framesPerChunk)) + 1));
      const set = mentionedChunks.get(guide.picture) ?? new Set<number>();
      set.add(chunkNumber);
      mentionedChunks.set(guide.picture, set);
    }
  }

  const selectors: Record<string, string> = {};
  let hasScopedSubset = false;
  for (let index = 0; index < REFERENCE_SLOT_IDS.length; index++) {
    const slotId = REFERENCE_SLOT_IDS[index]!;
    const ordinal = index + 1;
    if (!slots[index]?.trim()) {
      selectors[slotId] = "off";
      continue;
    }
    const chunks = mentionedChunks.get(ordinal);
    if (!chunks || chunks.size === 0 || chunks.size >= totalChunks) {
      selectors[slotId] = "all";
    } else {
      hasScopedSubset = true;
      selectors[slotId] = [...chunks].sort((a, b) => a - b).join(",");
    }
  }

  if (!hasScopedSubset && !explicitV39) return undefined;
  return { mode: "per_chunk", selectors };
}

export function assertContinuumReferenceRouting(
  routing: ContinuumReferenceRouting,
  referenceImages: readonly string[] | undefined,
  plannedChunks: number
): void {
  if (!routing || routing.mode !== "per_chunk" || !routing.selectors || typeof routing.selectors !== "object") {
    throw new Error("Invalid Continuum V3.9 reference routing mode");
  }
  if (!referenceImages?.length || referenceImages.length > 9) {
    throw new Error("Continuum V3.9 reference routing requires 1-9 fixed reference slots");
  }
  const keys = Object.keys(routing.selectors);
  if (keys.length !== REFERENCE_SLOT_IDS.length || REFERENCE_SLOT_IDS.some(id => !(id in routing.selectors))) {
    throw new Error("Continuum V3.9 reference routing must define R1..R9 selectors");
  }
  for (let index = 0; index < REFERENCE_SLOT_IDS.length; index++) {
    const slotId = REFERENCE_SLOT_IDS[index]!;
    const selector = routing.selectors[slotId];
    const hasImage = Boolean(referenceImages[index]?.trim());
    if (typeof selector !== "string" || !selector.trim()) {
      throw new Error(`Continuum V3.9 selector ${slotId} is invalid`);
    }
    if (!hasImage) {
      if (selector !== "off") throw new Error(`Unfilled Continuum V3.9 slot ${slotId} must be off`);
      continue;
    }
    if (selector === "all" || selector === "off") continue;
    const parts = selector.split(",").map(item => item.trim());
    if (!parts.length || parts.some(item => !/^[1-9]\d*$/u.test(item))) {
      throw new Error(`Continuum V3.9 selector ${slotId} has invalid chunk list`);
    }
    const numbers = parts.map(Number);
    if (numbers.some(n => n < 1 || n > plannedChunks)) {
      throw new Error(`Continuum V3.9 selector ${slotId} exceeds planned chunks`);
    }
  }
}
