import { randomUUID } from "node:crypto";
import path from "node:path";
import type { EnhanceRequest } from "../../src/types.js";
import { isH3NativeStateContinuationRequest } from "../../src/core/h3-auto-prompter.js";
import { preparePromptExtensionFrame, probeVideoDuration } from "./extension-media.js";

/** Keyframes are visual inspection only, not new execution references or an audio analysis. */
export async function withStrataReferenceMedia<T>(
  request: EnhanceRequest, signal: AbortSignal,
  run: (prepared: EnhanceRequest) => Promise<T>,
  deps: { prepareFrame?: typeof preparePromptExtensionFrame; duration?: typeof probeVideoDuration } = {}
): Promise<T> {
  const cleanup: Array<() => Promise<void>> = [];
  const images = [...new Set(request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))].filter(Boolean);
  const boundary = request.extensionSource ? images.shift() : undefined;
  const inspectionOnly = isH3NativeStateContinuationRequest(request);
  const labels = images.map((_filename, index) => inspectionOnly ? "visual inspection aid" : `<Picture ${index + 1}>`);
  if (boundary) {
    images.push(boundary);
    labels.push(request.h3PromptMode === "R2V" || inspectionOnly
      ? "continuation boundary, enhancer-only; not a Picture execution reference"
      : "<Picture 1>, exact continuation first-frame boundary");
  }
  const videos = [...new Set(request.referenceMediaPaths ?? [])].filter((filename) => /\.(?:mp4|mov|mkv|webm|avi|m4v)$/iu.test(filename));
  if (videos.length > 3) throw new Error("Strata 每次最多分析 3 份视频参考，请减少参考数量后重试。");
  try {
    for (const [index, filename] of videos.entries()) {
      signal.throwIfAborted();
      const source = request.extensionSource?.filePath === filename ? request.extensionSource : null;
      const start = source?.trimStartSeconds ?? 0;
      const end = source?.trimEndSeconds ?? await (deps.duration ?? probeVideoDuration)(filename, signal);
      if (!end || !Number.isFinite(end) || end <= start) throw new Error(`视频参考时长无效：${path.basename(filename)}`);
      for (const fraction of [0, 0.5, 1]) {
        signal.throwIfAborted();
        const sampleEnd = Math.max(start + Math.min(1 / 24, end - start), start + (end - start) * fraction);
        const frame = await (deps.prepareFrame ?? preparePromptExtensionFrame)(
          { filePath: filename, trimStartSeconds: start, trimEndSeconds: sampleEnd }, `strata-${randomUUID()}`, signal
        );
        cleanup.push(frame.cleanup);
        signal.throwIfAborted();
        images.push(frame.filePath);
        labels.push(`<Video ${index + 1}> sampled frame near ${sampleEnd.toFixed(2)}s, silent visual inspection; not a new Picture reference`);
      }
    }
    if (images.length > 12) throw new Error("参考图和视频采样帧合计超过 12 张，请减少参考数量后重试。");
    return await run({ ...request, imagePaths: images,
      referenceContext: [request.referenceContext, "Visual attachments in order (labels identify the attachments; do not renumber execution references):",
        ...labels.map((label, index) => `Attachment ${index + 1}: ${label}`),
        videos.length ? "Video samples contain no audio. Preserve user-provided speech and sound instructions; do not invent audio facts from silent frames." : ""
      ].filter(Boolean).join("\n") });
  } finally { await Promise.all(cleanup.map((release) => release().catch(() => undefined))); }
}
