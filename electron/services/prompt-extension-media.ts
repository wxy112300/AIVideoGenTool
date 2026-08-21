import type { EnhanceRequest } from "../../src/types.js";
import { preparePromptExtensionFrame } from "./extension-media.js";

const extensionBoundaryContext = [
  "Continuation boundary grounding:",
  "The extracted continuation-boundary image is the exact final frame at the selected trim end of the source video; single-image backends receive it as the primary image, while reference-mapped backends receive it as the final attachment named extension-boundary.png.",
  "Analyze its visible subjects, scene, composition, lighting, camera state, and ongoing action before rewriting the continuation prompt.",
  "Continue naturally from that state. Do not treat this boundary frame as a separate user reference or renumber any existing <Picture N> labels."
].join(" ");

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
    referenceContext: [extensionBoundaryContext, request.referenceContext?.trim()]
      .filter(Boolean)
      .join("\n\n")
  };
  try {
    return await run(preparedRequest);
  } finally {
    await prepared.cleanup().catch(() => undefined);
  }
}