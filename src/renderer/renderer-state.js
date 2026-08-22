export let state;
export let page = "create";
export let creationMode = "image-to-video";
export let historyKind = "video";
export function setRendererState(nextState) {
    state = nextState;
    return state;
}
export function setPage(nextPage) {
    page = nextPage;
    return page;
}
export function setCreationMode(nextMode) {
    creationMode = nextMode;
    return creationMode;
}
export function setHistoryKind(nextKind) {
    historyKind = nextKind;
    return historyKind;
}
