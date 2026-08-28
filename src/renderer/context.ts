import { createTranslator, type TranslationParams, type Translator } from "../core/i18n";
import type { AppApi, AppState, EnhanceRequest } from "../types";
import type {
  CreationMode,
  HistoryKind,
  Page,
  RendererContext,
  RendererNotifyOptions,
  RendererRouteState
} from "./contracts";

export interface RendererContextOptions {
  root: HTMLElement;
  studio: AppApi;
  enhancePrompt(request: EnhanceRequest): Promise<string>;
  getState: () => AppState | undefined;
  getRoute: () => RendererRouteState;
  requestRender: () => void;
  navigate: (nextPage: Page) => void;
  notify: (message: string, options?: RendererNotifyOptions) => void;
  reportUserAction: (action: string, meta?: Record<string, unknown>) => void;
}

export function createRendererContext(options: RendererContextOptions): RendererContext {
  const getTranslator = (): Translator =>
    createTranslator(options.getState()?.settings.uiLocale);

  return {
    root: options.root,
    studio: options.studio,
    enhancePrompt: options.enhancePrompt,
    getState: options.getState,
    getRoute: options.getRoute,
    getTranslator,
    t(key, params, fallback) {
      return getTranslator().t(key, params, fallback);
    },
    requestRender: options.requestRender,
    navigate: options.navigate,
    notify: options.notify,
    reportUserAction: options.reportUserAction
  };
}

export function routeState(
  page: Page,
  creationMode: CreationMode,
  historyKind: HistoryKind
): RendererRouteState {
  return { page, creationMode, historyKind };
}
