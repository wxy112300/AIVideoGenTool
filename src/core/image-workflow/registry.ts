import type { ImageModelAdapter } from "./contracts.js";
import {
  birefnetBackgroundRemovalCapability,
  flux2Klein4bCapability,
  hidreamO1Capability,
  lamaInpaintCapability,
  qwenImageEdit2511Capability,
  qwenImageEdit2511CropStitchCapability,
  zImageCapability,
  zImageTurboCapability
} from "./capabilities.js";
import { parseImageOutputs } from "./shared.js";
import {
  compileQwenImageEditPrompt,
  compileQwenImageEditCropStitchPrompt,
  buildQwenImageEdit2511Workflow,
  buildQwenImageEdit2511CropStitchWorkflow,
  validateQwenImageEdit2511Workflow,
  validateQwenImageEdit2511CropStitchWorkflow
} from "./qwen.js";
import {
  compileFlux2Klein4bPrompt,
  buildFlux2Klein4bWorkflow,
  validateFlux2Klein4bWorkflow
} from "./flux2-klein.js";
import {
  compileZImagePrompt,
  buildZImageWorkflow,
  validateZImageWorkflow,
  buildZImageTurboWorkflow,
  validateZImageTurboWorkflow
} from "./z-image.js";
import {
  compileHiDreamO1Prompt,
  buildHiDreamO1Workflow,
  validateHiDreamO1Workflow
} from "./hidream-o1.js";
import {
  compileBirefnetInput,
  buildBirefnetBackgroundRemovalWorkflow,
  validateBirefnetWorkflow,
  compileLamaInpaintInput,
  buildLamaInpaintWorkflow,
  validateLamaInpaintWorkflow
} from "./legacy.js";

const parseOutputs = parseImageOutputs;

export const qwenImageEdit2511Adapter: ImageModelAdapter = {
  ...qwenImageEdit2511Capability,
  compilePrompt: compileQwenImageEditPrompt,
  buildWorkflow: buildQwenImageEdit2511Workflow,
  validateWorkflow: validateQwenImageEdit2511Workflow,
  parseOutputs
};

export const flux2Klein4bAdapter: ImageModelAdapter = {
  ...flux2Klein4bCapability,
  compilePrompt: compileFlux2Klein4bPrompt,
  buildWorkflow: buildFlux2Klein4bWorkflow,
  validateWorkflow: validateFlux2Klein4bWorkflow,
  parseOutputs
};

export const zImageAdapter: ImageModelAdapter = {
  ...zImageCapability,
  compilePrompt: compileZImagePrompt,
  buildWorkflow: buildZImageWorkflow,
  validateWorkflow: validateZImageWorkflow,
  parseOutputs
};

export const zImageTurboAdapter: ImageModelAdapter = {
  ...zImageTurboCapability,
  compilePrompt: compileZImagePrompt,
  buildWorkflow: buildZImageTurboWorkflow,
  validateWorkflow: validateZImageTurboWorkflow,
  parseOutputs
};

export const hidreamO1Adapter: ImageModelAdapter = {
  ...hidreamO1Capability,
  compilePrompt: compileHiDreamO1Prompt,
  buildWorkflow: buildHiDreamO1Workflow,
  validateWorkflow: validateHiDreamO1Workflow,
  parseOutputs
};

export const lamaInpaintAdapter: ImageModelAdapter = {
  ...lamaInpaintCapability,
  compilePrompt: compileLamaInpaintInput,
  buildWorkflow: buildLamaInpaintWorkflow,
  validateWorkflow: validateLamaInpaintWorkflow,
  parseOutputs
};

export const qwenImageEdit2511CropStitchAdapter: ImageModelAdapter = {
  ...qwenImageEdit2511CropStitchCapability,
  compilePrompt: compileQwenImageEditCropStitchPrompt,
  buildWorkflow: buildQwenImageEdit2511CropStitchWorkflow,
  validateWorkflow: validateQwenImageEdit2511CropStitchWorkflow,
  parseOutputs
};

export const birefnetBackgroundRemovalAdapter: ImageModelAdapter = {
  ...birefnetBackgroundRemovalCapability,
  compilePrompt: compileBirefnetInput,
  buildWorkflow: buildBirefnetBackgroundRemovalWorkflow,
  validateWorkflow: validateBirefnetWorkflow,
  parseOutputs
};

export const imageModelAdapters: Record<string, ImageModelAdapter> = {
  [qwenImageEdit2511Adapter.id]: qwenImageEdit2511Adapter,
  [qwenImageEdit2511CropStitchAdapter.id]: qwenImageEdit2511CropStitchAdapter,
  [flux2Klein4bAdapter.id]: flux2Klein4bAdapter,
  [zImageAdapter.id]: zImageAdapter,
  [zImageTurboAdapter.id]: zImageTurboAdapter,
  [hidreamO1Adapter.id]: hidreamO1Adapter,
  [lamaInpaintAdapter.id]: lamaInpaintAdapter,
  [birefnetBackgroundRemovalAdapter.id]: birefnetBackgroundRemovalAdapter
};

export function imageModelAdapterFor(modelId: string): ImageModelAdapter | undefined {
  return imageModelAdapters[modelId];
}
export function firstSupportedImageModelId(
  ...candidates: Array<string | undefined>
): string {
  return candidates.find((candidate) => candidate && imageModelAdapterFor(candidate)) ??
    qwenImageEdit2511Adapter.id;
}

export function imageModelCapabilityFor(modelId: string) {
  return imageModelAdapters[modelId] ?? qwenImageEdit2511Capability;
}
