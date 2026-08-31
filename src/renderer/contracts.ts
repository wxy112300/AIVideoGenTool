import type { Translator, TranslationParams } from "../core/i18n";
import type { AppState, EnhanceRequest, NotificationKind } from "../types";
import type { NotificationAction } from "./notifications";
import type { RendererDependencies } from "./studio-client";

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
  | "comfyui"
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
  readonly application: RendererDependencies["application"];
  readonly events: RendererDependencies["events"];
  readonly assets: RendererDependencies["assets"];
  readonly hostCapabilities: RendererDependencies["hostCapabilities"];
  enhancePrompt(request: EnhanceRequest): Promise<string>;
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
