import type { AppState } from "../types";
import type { CreationMode, HistoryKind, Page } from "./contracts";

export let state: AppState;
export let page: Page = "create";
export let creationMode: CreationMode = "image-to-video";
export let historyKind: HistoryKind = "video";

export function setRendererState(nextState: AppState): AppState {
  state = nextState;
  return state;
}

export function setPage(nextPage: Page): Page {
  page = nextPage;
  return page;
}

export function setCreationMode(nextMode: CreationMode): CreationMode {
  creationMode = nextMode;
  return creationMode;
}

export function setHistoryKind(nextKind: HistoryKind): HistoryKind {
  historyKind = nextKind;
  return historyKind;
}
