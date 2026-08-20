import type { Translator, TranslationParams } from "../core/i18n";
import type { AppApi, AppState, NotificationKind } from "../types";
import type { NotificationAction } from "./notifications";

export type Page =
  | "create"
  | "queue"
  | "history"
  | "history-detail"
  | "image-history-detail"
  | "settings";

export type HistoryKind = "video" | "image";
export type CreationMode = "image-to-video" | "video-extension" | "image-edit";
export type SettingsTab =
  | "system"
  | "acceleration"
  | "video"
  | "lora"
  | "image"
  | "nodes"
  | "prompt"
  | "upscale"
  | "logs";

export interface RendererRouteState {
  readonly page: Page;
  readonly creationMode: CreationMode;
  readonly historyKind: HistoryKind;
}

export interface RendererNotifyOptions {
  renderPage?: boolean;
  kind?: NotificationKind;
  durationMs?: number;
  actions?: ReadonlyArray<NotificationAction>;
}

export type RendererCleanup = () => void;

export interface RendererContext {
  readonly root: HTMLElement;
  readonly studio: AppApi;
  getState(): AppState | undefined;
  getRoute(): Readonly<RendererRouteState>;
  getTranslator(): Translator;
  t(key: string, params?: TranslationParams, fallback?: string): string;
  requestRender(): void;
  navigate(nextPage: Page): void;
  notify(message: string, options?: RendererNotifyOptions): void;
  reportUserAction(action: string, meta?: Record<string, unknown>): void;
}

export interface RendererPageModule {
  render(context: RendererContext): string;
  mount(root: HTMLElement, context: RendererContext): RendererCleanup;
}
