import type { ImageModelAdapter } from "./contracts.js";
import { createTranslator, type Translator } from "../i18n.js";
import { uiKeys } from "../i18n-keys.js";
import {
  birefnetBackgroundRemovalCapability,
  flux2Klein4bCapability,
  hidreamO1Capability,
  lamaInpaintCapability,
  omnigen2Capability,
  qwenImage21Capability,
  qwenImage21TurboCapability,
  qwenImage21UncensoredGgufCapability,
  qwenImage21UncensoredGgufQ6Capability,
  qwenImageEdit2511Capability,
  zImageCapability,
  zImageTurboCapability
} from "./capabilities.js";
import { parseImageOutputs } from "./shared.js";
import {
  compileQwenImageEditPrompt,
  buildQwenImageEdit2511Workflow,
  validateQwenImageEdit2511Workflow
} from "./qwen.js";
import {
  buildQwenImage21Workflow,
  buildQwenImage21TurboWorkflow,
  buildQwenImage21GgufWorkflow,
  buildQwenImage21GgufQ6Workflow,
  compileQwenImage21Prompt,
  validateQwenImage21GgufRuntimeSchema,
  validateQwenImage21GgufWorkflow,
  validateQwenImage21GgufQ6Workflow,
  validateQwenImage21RuntimeSchema,
  validateQwenImage21TurboWorkflow,
  validateQwenImage21TurboRuntimeSchema,
  validateQwenImage21Workflow
} from "./qwen-image-2-1.js";
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
  compileOmniGen2Prompt,
  buildOmniGen2Workflow,
  validateOmniGen2Workflow
} from "./omnigen2.js";
import {
  compileBirefnetInput,
  buildBirefnetBackgroundRemovalWorkflow,
  validateBirefnetWorkflow,
  compileLamaInpaintInput,
  buildLamaInpaintWorkflow,
  validateLamaInpaintWorkflow
} from "./legacy.js";
import { modelCatalog } from "../catalog/index.js";
import { mossImageAdapter, mossNsfwAdapter } from "./moss-image.js";

const parseOutputs = parseImageOutputs;

export const qwenImageEdit2511Adapter: ImageModelAdapter = {
  ...qwenImageEdit2511Capability,
  compilePrompt: compileQwenImageEditPrompt,
  buildWorkflow: buildQwenImageEdit2511Workflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateQwenImageEdit2511Workflow(workflow, quality, allow, t),
  parseOutputs
};

export const qwenImage21Adapter: ImageModelAdapter = {
  ...qwenImage21Capability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21Workflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateQwenImage21Workflow(workflow, quality, allow, t),
  validateRuntimeSchema: validateQwenImage21RuntimeSchema,
  parseOutputs
};

export const qwenImage21TurboAdapter: ImageModelAdapter = {
  ...qwenImage21TurboCapability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21TurboWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateQwenImage21TurboWorkflow(workflow, quality, allow, t),
  validateRuntimeSchema: validateQwenImage21TurboRuntimeSchema,
  parseOutputs
};

export const qwenImage21UncensoredGgufAdapter: ImageModelAdapter = {
  ...qwenImage21UncensoredGgufCapability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21GgufWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateQwenImage21GgufWorkflow(workflow, quality, allow, t),
  validateRuntimeSchema: validateQwenImage21GgufRuntimeSchema,
  parseOutputs
};

export const qwenImage21UncensoredGgufQ6Adapter: ImageModelAdapter = {
  ...qwenImage21UncensoredGgufQ6Capability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21GgufQ6Workflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateQwenImage21GgufQ6Workflow(workflow, quality, allow, t),
  validateRuntimeSchema: validateQwenImage21GgufRuntimeSchema,
  parseOutputs
};

export const flux2Klein4bAdapter: ImageModelAdapter = {
  ...flux2Klein4bCapability,
  compilePrompt: compileFlux2Klein4bPrompt,
  buildWorkflow: buildFlux2Klein4bWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateFlux2Klein4bWorkflow(workflow, quality, allow, t),
  parseOutputs
};

export const zImageAdapter: ImageModelAdapter = {
  ...zImageCapability,
  compilePrompt: compileZImagePrompt,
  buildWorkflow: buildZImageWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateZImageWorkflow(workflow, quality, allow, t),
  parseOutputs
};

export const zImageTurboAdapter: ImageModelAdapter = {
  ...zImageTurboCapability,
  compilePrompt: compileZImagePrompt,
  buildWorkflow: buildZImageTurboWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateZImageTurboWorkflow(workflow, quality, allow, t),
  parseOutputs
};

export const hidreamO1Adapter: ImageModelAdapter = {
  ...hidreamO1Capability,
  compilePrompt: compileHiDreamO1Prompt,
  buildWorkflow: buildHiDreamO1Workflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateHiDreamO1Workflow(workflow, quality, allow, t),
  parseOutputs
};

export const omnigen2Adapter: ImageModelAdapter = {
  ...omnigen2Capability,
  compilePrompt: compileOmniGen2Prompt,
  buildWorkflow: buildOmniGen2Workflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateOmniGen2Workflow(workflow, quality, allow, t),
  parseOutputs
};

export const lamaInpaintAdapter: ImageModelAdapter = {
  ...lamaInpaintCapability,
  compilePrompt: compileLamaInpaintInput,
  buildWorkflow: buildLamaInpaintWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateLamaInpaintWorkflow(workflow, quality, allow, t),
  parseOutputs
};

export const birefnetBackgroundRemovalAdapter: ImageModelAdapter = {
  ...birefnetBackgroundRemovalCapability,
  compilePrompt: compileBirefnetInput,
  buildWorkflow: buildBirefnetBackgroundRemovalWorkflow,
  validateWorkflow: (workflow, quality, allow, _recipe, t) => validateBirefnetWorkflow(workflow, quality, allow, t),
  parseOutputs
};

export const imageModelAdapters: Record<string, ImageModelAdapter> = {
  [mossImageAdapter.id]: mossImageAdapter,
  [mossNsfwAdapter.id]: mossNsfwAdapter,
  [qwenImageEdit2511Adapter.id]: qwenImageEdit2511Adapter,
  [qwenImage21Adapter.id]: qwenImage21Adapter,
  [qwenImage21TurboAdapter.id]: qwenImage21TurboAdapter,
  [qwenImage21UncensoredGgufAdapter.id]: qwenImage21UncensoredGgufAdapter,
  [qwenImage21UncensoredGgufQ6Adapter.id]: qwenImage21UncensoredGgufQ6Adapter,
  [flux2Klein4bAdapter.id]: flux2Klein4bAdapter,
  [zImageAdapter.id]: zImageAdapter,
  [zImageTurboAdapter.id]: zImageTurboAdapter,
  [hidreamO1Adapter.id]: hidreamO1Adapter,
  [omnigen2Adapter.id]: omnigen2Adapter,
  [lamaInpaintAdapter.id]: lamaInpaintAdapter,
  [birefnetBackgroundRemovalAdapter.id]: birefnetBackgroundRemovalAdapter
};

export function imageModelAdapterFor(modelId: string): ImageModelAdapter | undefined {
  return imageModelAdapters[modelId];
}
export function isRetiredImageModelId(modelId: string): boolean {
  const definition = modelCatalog.get(modelId)?.definition;
  return definition?.category === "image" && definition.retired === true;
}

export function imageModelUnavailableReason(modelId: string, translator: Translator = createTranslator()): string {
  const { t, locale } = translator;
  if (isRetiredImageModelId(modelId)) {
    const name = modelCatalog.get(modelId)?.definition.family === "minimax-h3-image"
      ? t(uiKeys.imageAvailability.h3Image)
      : modelCatalog.localized(modelId, locale)?.name ?? modelId;
    return t(uiKeys.imageAvailability.retired, { name });
  }
  return t(uiKeys.imageAvailability.adapterMissing, { model: modelId });
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
