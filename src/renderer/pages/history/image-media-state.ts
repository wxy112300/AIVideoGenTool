export type ImageMediaState = "loading" | "ready" | "unavailable" | "error";

export function initialImageMediaState(sourceUrl: string): ImageMediaState {
  return sourceUrl.trim() ? "loading" : "unavailable";
}

export function imageMediaStateAfterLoad(
  sourceUrl: string,
  naturalWidth: number
): ImageMediaState {
  if (!sourceUrl.trim()) return "unavailable";
  return naturalWidth > 0 ? "ready" : "error";
}

export function imageMediaStateClass(state: ImageMediaState): string {
  return `image-media-${state}`;
}
