import type { UiLocale } from "../../types.js";

export type CatalogModelCategory = "video" | "image" | "upscale" | "interpolation" | "prompt" | "lora";
export type CatalogModelInputMode = "image" | "video";
export type CatalogModelVariant = "fl2va" | "r2v" | "turbo";
export type CatalogPromptPackId = "h3" | "qwen-image-edit";

export interface CatalogInstallGuide {
  sourceLabel: string;
  downloadUrl: string;
  targetSubdirectory: string;
  recommendedFilename: string;
  notes?: string;
}

export interface CatalogModelComponent {
  label: string;
  expected: string;
  patterns: readonly RegExp[];
  optional?: boolean;
  installGuide?: CatalogInstallGuide;
}

export interface CatalogModelScanDefinition {
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  vram: string;
  integrated?: boolean;
  runtimeNodeTypes?: readonly string[];
  components: readonly CatalogModelComponent[];
}

export interface CatalogModelCapabilities {
  supportsEndFrame?: boolean;
  supportsVideoExtension?: boolean;
  supportsSpectrum?: boolean;
  supportsReferenceSlots?: boolean;
  maxReferenceImages?: number;
  maxDurationSeconds?: number;
  maxGeneratedFrames?: number;
  resolutions?: readonly number[];
}

export interface CatalogModelDefinition {
  id: string;
  family: string;
  variant?: CatalogModelVariant;
  category: CatalogModelCategory;
  adapterId: string;
  promptPackId?: CatalogPromptPackId;
  order: number;
  inputModes: readonly CatalogModelInputMode[];
  retired?: boolean;
  capabilities?: CatalogModelCapabilities;
  scan?: CatalogModelScanDefinition;
  scanVariants?: Readonly<Record<string, CatalogModelScanDefinition>>;
}

export interface CatalogModelLocale {
  name: string;
  shortName?: string;
  badge?: string;
  description?: string;
  supportSummary?: string;
  limitations?: readonly string[];
}

export interface CatalogModelEntry {
  definition: CatalogModelDefinition;
  locales: Partial<Record<UiLocale, CatalogModelLocale>>;
}
