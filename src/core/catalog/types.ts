import type { H3StepCount, UiLocale } from "../../types.js";

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
  /** Exact upstream release/tag/commit used by this dependency record. */
  version?: string;
  revision?: string;
  bytes?: number;
  sha256?: string;
  license?: string;
}

export interface CatalogModelComponent {
  label: string;
  expected: string;
  patterns: readonly RegExp[];
  optional?: boolean;
  /** Components in the same group are interchangeable for availability checks. */
  alternativeGroup?: string;
  installGuide?: CatalogInstallGuide;
}

export interface CatalogModelScanDefinition {
  managedBy?: "comfyui" | "lmstudio" | "llama-server";
  vram: string;
  integrated?: boolean;
  /** Custom-node packages that must exist on disk before this model can be queued. */
  requiredCustomNodeIds?: readonly string[];
  runtimeNodeTypes?: readonly string[];
  components: readonly CatalogModelComponent[];
}

export interface CatalogModelCapabilities {
  supportsEndFrame?: boolean;
  supportsVideoExtension?: boolean;
  supportsSpectrum?: boolean;
  supportsLivePreview?: boolean;
  supportsReferenceSlots?: boolean;
  maxReferenceImages?: number;
  maxDurationSeconds?: number;
  maxGeneratedFrames?: number;
  resolutions?: readonly number[];
  generationSteps?: readonly H3StepCount[];
  defaultGenerationSteps?: H3StepCount;
  maxGenerationSteps?: H3StepCount;
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
  runtimeProfile?: "h3-q3-3080";
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
