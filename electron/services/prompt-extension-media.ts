import type { EnhanceRequest } from "../../src/types.js";
import { isH3NativeStateContinuationRequest } from "../../src/core/h3-auto-prompter.js";
import { preparePromptExtensionFrame } from "./extension-media.js";

function extensionBoundaryContextFor(request: EnhanceRequest): string {
  const nativeStateContinuation = isH3NativeStateContinuationRequest(request);
  const role = nativeStateContinuation
    ? "This image is a silent visual inspection aid for the native continuation boundary, not an H3 execution reference. The sampler receives the preceding JointAV latent state directly. The final prompt uses the T2VA field shape: do not create <Picture N> or <Video N> labels and do not add an image-alignment declaration."
    : request.h3PromptMode === "R2V"
    ? "This image is a silent inspection aid, not an H3 execution reference: <Video 1> remains the locked source video and every existing reference label keeps its number. Do not create a <Picture N> label for extension-boundary.png."
    : "This image is the target continuation's concrete first-frame anchor, <Picture 1>. The final prompt must begin with the exact I2VA first-frame alignment declaration; do not invent another picture or renumber it.";
  return [
    "Continuation boundary grounding:",
    nativeStateContinuation
      ? "The extracted continuation-boundary image depicts the exact final visible state before native continuation. Inspect it as an in-progress boundary, then start the generated timeline with the next physical increment rather than holding, replaying, or re-establishing that frame."
      : "The extracted continuation-boundary image is the exact final frame at the selected trim end of the source video and the exact opening state of the new target segment.",
    "Analyze its visible subjects, scene, composition, lighting, camera state, ongoing action, and role-action ownership before rewriting the continuation prompt.",
    role,
    "Keep each established subject's identity, role, action ownership, relative scale, pose, contact, and screen direction distinct. Continue the existing camera framing, height, viewing direction, and physical trajectory while preserving the user's requested next action and order."
  ].join(" ");
}

export interface PromptExtensionMediaDependencies {
  prepareFrame?: typeof preparePromptExtensionFrame;
}

export async function withPromptExtensionMedia<T>(
  request: EnhanceRequest,
  operationId: string,
  signal: AbortSignal,
  run: (preparedRequest: EnhanceRequest) => Promise<T>,
  dependencies: PromptExtensionMediaDependencies = {}
): Promise<T> {
  if (!request.extensionSource) return run(request);
  const prepared = await (dependencies.prepareFrame ?? preparePromptExtensionFrame)(
    request.extensionSource,
    operationId,
    signal
  );
  const imagePaths = [
    prepared.filePath,
    ...(request.imagePaths ?? (request.imagePath ? [request.imagePath] : []))
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  const referenceMediaPaths = [
    ...(request.referenceMediaPaths ?? []),
    prepared.filePath
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  const preparedRequest: EnhanceRequest = {
    ...request,
    imagePath: prepared.filePath,
    imagePaths,
    referenceMediaPaths,
    referenceContext: [extensionBoundaryContextFor(request), request.referenceContext?.trim()]
      .filter(Boolean)
      .join("\n\n")
  };
  try {
    return await run(preparedRequest);
  } finally {
    await prepared.cleanup().catch(() => undefined);
  }
}
