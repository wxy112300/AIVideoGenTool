import type {
  Draft,
  ExtensionQueueTask,
  GenerationQueueTask,
  H3ReferenceSlot
} from "../types.js";
import { videoPromptForLoras } from "./video-loras.js";
import {
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  outputDimensions
} from "./workflow.js";

/** Qwen3-VL uses 16px patches merged 2×2 before they enter the text stream. */
const VISION_FACTOR = 32;
const VISION_PATCH_SIZE = 16;
const VISION_MERGE_SIZE = 2;
const VISION_MIN_PIXELS = 3_136;
const VISION_MAX_PIXELS = 12_845_056;
const H3_REFERENCE_MAX_SHORT_EDGE = 2_048;

type H3ReferenceTokenSlot = Pick<
  H3ReferenceSlot,
  "mediaType" | "mediaPath" | "width" | "height"
>;

export interface H3TokenCountInput {
  modelId: string;
  taskType: "generation" | "extension";
  /** Text after any model-specific prompt prefixes have been applied. */
  prompt: string;
  ratio: Draft["ratio"];
  resolution: Draft["resolution"];
  sourceWidth: number;
  sourceHeight: number;
  startImagePath?: string;
  endImagePath?: string;
  h3ReferenceSlots?: ReadonlyArray<H3ReferenceTokenSlot>;
  referenceImageSize?: "match" | "max";
}

function positiveDimension(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Match Python's round-to-even behavior used by the ComfyUI H3 node. */
function roundToNearestInteger(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function qwenImageSize(width: number, height: number): [number, number] {
  let resizedHeight = Math.max(
    VISION_FACTOR,
    roundToNearestInteger(height / VISION_FACTOR) * VISION_FACTOR
  );
  let resizedWidth = Math.max(
    VISION_FACTOR,
    roundToNearestInteger(width / VISION_FACTOR) * VISION_FACTOR
  );
  const area = width * height;
  if (resizedHeight * resizedWidth > VISION_MAX_PIXELS) {
    const beta = Math.sqrt(area / VISION_MAX_PIXELS);
    resizedHeight = Math.max(
      VISION_FACTOR,
      Math.floor(height / beta / VISION_FACTOR) * VISION_FACTOR
    );
    resizedWidth = Math.max(
      VISION_FACTOR,
      Math.floor(width / beta / VISION_FACTOR) * VISION_FACTOR
    );
  } else if (resizedHeight * resizedWidth < VISION_MIN_PIXELS) {
    const beta = Math.sqrt(VISION_MIN_PIXELS / area);
    resizedHeight = Math.max(
      VISION_FACTOR,
      Math.ceil(height * beta / VISION_FACTOR) * VISION_FACTOR
    );
    resizedWidth = Math.max(
      VISION_FACTOR,
      Math.ceil(width * beta / VISION_FACTOR) * VISION_FACTOR
    );
  }
  return [resizedWidth, resizedHeight];
}

function qwenImageVisualTokens(width: number, height: number): number {
  const safeWidth = positiveDimension(width);
  const safeHeight = positiveDimension(height);
  if (safeWidth === undefined || safeHeight === undefined) return 0;
  const [resizedWidth, resizedHeight] = qwenImageSize(safeWidth, safeHeight);
  return (
    (resizedHeight / VISION_PATCH_SIZE) *
    (resizedWidth / VISION_PATCH_SIZE) /
    (VISION_MERGE_SIZE ** 2)
  );
}

function estimateTextRunTokens(length: number): number {
  return length > 0 ? Math.ceil(length / 4) : 0;
}

/**
 * Estimate raw Qwen BPE length without loading the user's ComfyUI tokenizer.
 * CJK characters and punctuation are kept conservative; Latin/numeric runs
 * use a four-character-per-token approximation. This is deliberately exposed
 * as an estimate rather than presented as cloud billing usage.
 */
export function estimateH3TextTokens(text: string): number {
  let tokens = 0;
  let latinRunLength = 0;
  const flushLatinRun = (): void => {
    tokens += estimateTextRunTokens(latinRunLength);
    latinRunLength = 0;
  };
  for (const character of text.trim()) {
    if (/\s/u.test(character)) {
      flushLatinRun();
      continue;
    }
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)) {
      flushLatinRun();
      tokens += 1;
      continue;
    }
    if (/[\p{Letter}\p{Number}]/u.test(character)) {
      latinRunLength += 1;
      continue;
    }
    flushLatinRun();
    tokens += 1;
  }
  flushLatinRun();
  return tokens;
}

function imageBlockTokens(
  label: string,
  width: number,
  height: number
): number {
  // MiniMaxH3Tokenizer emits: label + vision_start + visual tokens + vision_end.
  return estimateH3TextTokens(label) + qwenImageVisualTokens(width, height) + 2;
}

function referenceImageTokens(
  slot: H3ReferenceTokenSlot,
  targetWidth: number,
  targetHeight: number,
  ordinal: number,
  referenceImageSize: "match" | "max"
): number {
  const width = positiveDimension(slot.width) ?? targetWidth;
  const height = positiveDimension(slot.height) ?? targetHeight;
  const scale = referenceImageSize === "max"
    ? Math.min(1, H3_REFERENCE_MAX_SHORT_EDGE / Math.min(width, height))
    : Math.min(1, Math.sqrt((targetWidth * targetHeight) / (width * height)));
  const resizedWidth = Math.max(
    VISION_FACTOR,
    roundToNearestInteger(width * scale / VISION_FACTOR) * VISION_FACTOR
  );
  const resizedHeight = Math.max(
    VISION_FACTOR,
    roundToNearestInteger(height * scale / VISION_FACTOR) * VISION_FACTOR
  );
  return imageBlockTokens(
    `<Picture ${ordinal}>: `,
    resizedWidth,
    resizedHeight
  );
}

function targetDimensions(input: H3TokenCountInput): [number, number] {
  return outputDimensions({
    modelId: input.modelId,
    ratio: input.ratio,
    resolution: input.resolution,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight
  });
}

export function h3TokenCountForInput(
  input: H3TokenCountInput
): number | undefined {
  if (!isMiniMaxH3Model(input.modelId)) return undefined;
  const [targetWidth, targetHeight] = targetDimensions(input);
  let count = estimateH3TextTokens(input.prompt);
  if (isMiniMaxH3R2vModel(input.modelId)) {
    let imageOrdinal = 0;
    for (const slot of input.h3ReferenceSlots ?? []) {
      // Reference-video frame metadata is not part of the persisted slot
      // snapshot yet, so count only the reference images we can resolve.
      if (slot.mediaType !== "image" || !slot.mediaPath.trim()) continue;
      imageOrdinal += 1;
      count += referenceImageTokens(
        slot,
        targetWidth,
        targetHeight,
        imageOrdinal,
        input.referenceImageSize ?? "match"
      );
    }
  } else {
    const keyframePaths = input.taskType === "extension"
      ? ["h3-extension-boundary"]
      : [input.startImagePath, input.endImagePath].filter(Boolean);
    keyframePaths.forEach((_, index) => {
      count += imageBlockTokens(
        `<Picture ${index + 1}>: `,
        targetWidth,
        targetHeight
      );
    });
  }
  // ComfyUI falls back to one pad token for an entirely empty H3 text stream.
  return Math.max(1, Math.trunc(count));
}

export function h3TokenCountForDraft(
  draft: Draft,
  prompt: string
): number | undefined {
  return h3TokenCountForInput({
    modelId: draft.modelId,
    taskType: draft.inputMode === "video" ? "extension" : "generation",
    prompt: videoPromptForLoras(prompt, draft.videoLoras),
    ratio: draft.ratio,
    resolution: draft.resolution,
    sourceWidth: draft.sourceWidth,
    sourceHeight: draft.sourceHeight,
    startImagePath: draft.startImagePath,
    endImagePath: draft.endImagePath,
    h3ReferenceSlots: draft.h3ReferenceSlots
  });
}

export function h3TokenCountForTask(
  task: GenerationQueueTask | ExtensionQueueTask,
  referenceImageSize: "match" | "max" = "match"
): number | undefined {
  return h3TokenCountForInput({
    modelId: task.modelId,
    taskType: task.taskType,
    prompt: videoPromptForLoras(task.prompt, task.videoLoras),
    ratio: task.ratio,
    resolution: task.resolution,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    startImagePath: task.taskType === "generation" ? task.startImagePath : undefined,
    endImagePath: task.taskType === "generation" ? task.endImagePath : undefined,
    h3ReferenceSlots: task.h3ReferenceSlots,
    referenceImageSize
  });
}
