import type {
  H3ReferenceRole,
  ImageReferenceRole,
  H3PromptPreset,
  ImagePromptPreset,
  UiLocale
} from "../../types.js";

export interface PromptPresetLocale {
  label: string;
  description: string;
}

export interface PromptSnippetLocale {
  group: string;
  label: string;
}

export type H3PromptUiKey =
  | "newVersion"
  | "previousVersion"
  | "nextVersion"
  | "enhanceMode"
  | "sulphurNativeEnhance"
  | "faithfulEnhance"
  | "optimizing"
  | "optimizePrompt"
  | "autoPrompt"
  | "autoPromptHint"
  | "autoPromptMissingMedia"
  | "snippetPicker"
  | "snippetPlaceholder"
  | "insertSnippet"
  | "extensionR2vTitle"
  | "extensionBoundaryTitle"
  | "extensionR2vLatentDescription"
  | "extensionR2vFallbackDescription"
  | "extensionBoundaryDescription"
  | "manualEditVersion"
  | "expandedVersion"
  | "wordCount"
  | "wordCountGuidance"
  | "imageWordCount"
  | "promptCheckTitle";

export type PromptUiLocale = Record<H3PromptUiKey, string>;

export interface PromptUi {
  readonly locale: UiLocale;
  t(key: H3PromptUiKey, params?: Record<string, string | number>): string;
}

export type ImagePromptUiKey = "originalVersion";
export type ImagePromptUiLocale = Record<ImagePromptUiKey, string>;

export interface ImagePromptUi {
  readonly locale: UiLocale;
  t(key: ImagePromptUiKey, params?: Record<string, string | number>): string;
}

export interface PromptSnippetDefinition {
  id: string;
  groupId: string;
  text: string;
}

export interface LocalizedPromptSnippet {
  id: string;
  group: string;
  label: string;
  text: string;
}

export interface H3PromptPack {
  locale: UiLocale;
  presetOrder: readonly H3PromptPreset[];
  defaultPresets: Record<H3PromptPreset, string>;
  presetLabels: Record<H3PromptPreset, string>;
  presetDescriptions: Record<H3PromptPreset, string>;
  snippets: readonly LocalizedPromptSnippet[];
  ui: PromptUi;
  referenceRoleLabels: Record<H3ReferenceRole, string>;
}

export interface ImagePromptPack {
  locale: UiLocale;
  defaultPresets: Record<ImagePromptPreset, string>;
  presetLabels: Record<ImagePromptPreset, string>;
  presetDescriptions: Record<ImagePromptPreset, string>;
  referenceRoleLabels: Record<ImageReferenceRole, string>;
  ui: ImagePromptUi;
}
