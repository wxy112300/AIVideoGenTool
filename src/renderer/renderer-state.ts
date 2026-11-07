import type { AppState } from "../types";
import type { CreationMode, HistoryKind, Page } from "./contracts";
import { applyAppearance } from "./shared/ui/appearance";
import { normalizeUiLocale } from "../core/i18n";

export let state: AppState;
export let page: Page = "create";
export let creationMode: CreationMode = "image-to-video";
export let historyKind: HistoryKind = "video";

export function setRendererState(nextState: AppState): AppState {
  state = nextState;
  if (typeof document !== "undefined") {
    const locale = normalizeUiLocale(state.settings.uiLocale);
    if (document.documentElement.lang !== locale) document.documentElement.lang = locale;
  }
  applyAppearance(state.settings.appearance);
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
