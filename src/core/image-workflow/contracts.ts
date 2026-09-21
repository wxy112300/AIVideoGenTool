import type {
  H3ImageRecipeSnapshot,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  ImageOutputFormat,
  ImageReferenceSnapshot
} from "../../types.js";

export interface ImageQualityProfile {
  id: string;
  label: string;
  steps: number;
  cfg: number;
  /** Optional second guidance value used by dual-guidance edit models. */
  imageGuidance?: number;
  lightning: boolean;
}
export interface ImageModelCapability {
  id: string;
  name: string;
  maxPictures: number;
  supportedFormats: ImageOutputFormat[];
  qualityProfiles: ImageQualityProfile[];
  /** The operation uses a deterministic, single-pass workflow rather than sampling. */
  deterministic?: boolean;
  operation?: "edit" | "inpaint" | "background-removal" | "harmonize";
  requiresPrompt?: boolean;
  requiresMask?: boolean;
  supportsSeed?: boolean;
  sourceResolutionOnly?: boolean;
  /** Allows a reference-image workflow to opt into the official custom canvas path. */
  supportsCustomOutputSize?: boolean;
  /** Alignment multiple for that custom reference-image canvas. */
  customOutputMultiple?: number;
  /** Allows the image page to submit a prompt without a reference Picture. */
  supportsTextOnly?: boolean;
  /** The model can consume a saved binary mask when a reference Picture exists. */
  supportsMask?: boolean;
  /** The model can use the annotation canvas as visual guidance. */
  supportsMarkup?: boolean;
  /** The annotation canvas is sent as paired visual reference images. */
  supportsMarkupReferenceGuide?: boolean;
  /** Fallback canvas used before a text-only task has a source image. */
  textOnlyOutputWidth?: number;
  textOnlyOutputHeight?: number;
  /** Optional model-side component needed only for reference/control inputs. */
  referenceModelComponentLabel?: string;
  /** Optional scan component required only for a named quality profile. */
  qualityProfileComponentLabels?: Readonly<Record<string, string>>;
}

export interface CompiledImagePrompt {
  prompt: string;
  pictures: ImageReferenceSnapshot[];
  referencedPictureNumbers: number[];
  /** Visible Picture numbers are stable persisted labels; H3 runtime uses continuous slots. */
  runtimePictureNumberMap?: Array<{
    visiblePictureNumber: number;
    runtimePictureNumber: number;
  }>;
  runtimeReferencedPictureNumbers?: number[];
  errors: string[];
}

export type ComfyApiWorkflow = Record<string, {
  class_type: string;
  inputs: Record<string, unknown>;
}>;

export interface ImageOutputCandidate {
  filename: string;
  subfolder: string;
  type: string;
  format?: ImageOutputFormat;
}

export interface ImageModelAdapter extends ImageModelCapability {
  compilePrompt(prompt: string, pictures: ImageReferenceSnapshot[]): CompiledImagePrompt;
  buildWorkflow(task: ImageGenerationQueueTask, run: ImageGenerationRun): ComfyApiWorkflow;
  validateWorkflow(
    workflow: ComfyApiWorkflow,
    qualityProfile?: string,
    allowImagePlaceholders?: boolean,
    recipe?: H3ImageRecipeSnapshot
  ): string[];
  /** Validate model-specific runtime sockets and enum values before uploads. */
  validateRuntimeSchema?(
    workflow: ComfyApiWorkflow,
    objectInfo: Record<string, unknown>
  ): string[];
  parseOutputs(history: unknown): ImageOutputCandidate[];
}
