import type { ImageModelAdapter } from "./contracts.js";
import {
  birefnetBackgroundRemovalCapability,
  flux2Klein4bCapability,
  hidreamO1Capability,
  lamaInpaintCapability,
  omnigen2Capability,
  qwenImage21Capability,
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
  buildQwenImage21GgufWorkflow,
  buildQwenImage21GgufQ6Workflow,
  compileQwenImage21Prompt,
  validateQwenImage21GgufRuntimeSchema,
  validateQwenImage21GgufWorkflow,
  validateQwenImage21GgufQ6Workflow,
  validateQwenImage21RuntimeSchema,
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

const parseOutputs = parseImageOutputs;

export const qwenImageEdit2511Adapter: ImageModelAdapter = {
  ...qwenImageEdit2511Capability,
  compilePrompt: compileQwenImageEditPrompt,
  buildWorkflow: buildQwenImageEdit2511Workflow,
  validateWorkflow: validateQwenImageEdit2511Workflow,
  parseOutputs
};

export const qwenImage21Adapter: ImageModelAdapter = {
  ...qwenImage21Capability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21Workflow,
  validateWorkflow: validateQwenImage21Workflow,
  validateRuntimeSchema: validateQwenImage21RuntimeSchema,
  parseOutputs
};

export const qwenImage21UncensoredGgufAdapter: ImageModelAdapter = {
  ...qwenImage21UncensoredGgufCapability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21GgufWorkflow,
  validateWorkflow: validateQwenImage21GgufWorkflow,
  validateRuntimeSchema: validateQwenImage21GgufRuntimeSchema,
  parseOutputs
};

export const qwenImage21UncensoredGgufQ6Adapter: ImageModelAdapter = {
  ...qwenImage21UncensoredGgufQ6Capability,
  compilePrompt: compileQwenImage21Prompt,
  buildWorkflow: buildQwenImage21GgufQ6Workflow,
  validateWorkflow: validateQwenImage21GgufQ6Workflow,
  validateRuntimeSchema: validateQwenImage21GgufRuntimeSchema,
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

export const omnigen2Adapter: ImageModelAdapter = {
  ...omnigen2Capability,
  compilePrompt: compileOmniGen2Prompt,
  buildWorkflow: buildOmniGen2Workflow,
  validateWorkflow: validateOmniGen2Workflow,
  parseOutputs
};

export const lamaInpaintAdapter: ImageModelAdapter = {
  ...lamaInpaintCapability,
  compilePrompt: compileLamaInpaintInput,
  buildWorkflow: buildLamaInpaintWorkflow,
  validateWorkflow: validateLamaInpaintWorkflow,
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
  [qwenImage21Adapter.id]: qwenImage21Adapter,
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

export function imageModelUnavailableReason(modelId: string): string {
  if (isRetiredImageModelId(modelId)) {
    const name = modelCatalog.get(modelId)?.definition.family === "minimax-h3-image"
      ? "H3 图片"
      : modelCatalog.localized(modelId)?.name ?? modelId;
    return name + "功能已移除，请调整任务并选择 Qwen Image 2.1；旧任务和历史记录仍保留。";
  }
  return `当前没有 ${modelId} 的图片工作流适配器。`;
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
