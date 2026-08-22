export function initialImageMediaState(sourceUrl) {
    return sourceUrl.trim() ? "loading" : "unavailable";
}
export function imageMediaStateAfterLoad(sourceUrl, naturalWidth) {
    if (!sourceUrl.trim())
        return "unavailable";
    return naturalWidth > 0 ? "ready" : "error";
}
export function imageMediaStateClass(state) {
    return `image-media-${state}`;
}
