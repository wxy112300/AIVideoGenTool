import type { EnhanceRequest } from "../../src/types.js";
import { preparePromptExtensionFrame } from "./extension-media.js";

function extensionBoundaryContextFor(request: EnhanceRequest): string {
  const role = request.h3PromptMode === "R2V"
    ? "This image is a silent inspection aid, not an H3 execution reference: <Video 1> remains the locked source video and every existing reference label keeps its number. Do not create a <Picture N> label for extension-boundary.png."
    : "This image is the target continuation's concrete first-frame anchor, <Picture 1>. The final prompt must begin with the exact I2VA first-frame alignment declaration; do not invent another picture or renumber it.";
  return [
    "Continuation boundary grounding:",
    "The extracted continuation-boundary image is the exact final frame at the selected trim end of the source video and the exact opening state of the new target segment.",
    "Analyze its visible subjects, scene, composition, lighting, camera state, ongoing action, and role-action ownership before rewriting the continuation prompt.",
    role,
    "Continue naturally from that state and preserve the user's requested next action, subject assignments, camera direction, and order."
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
