import type { Draft } from "../types.js";
import { modelCatalog } from "./catalog/index.js";
import { normalizeH3MemoryOptions } from "./h3-memory-policy.js";
import {
  baseVideoModelId,
  normalizeVideoLoras,
  videoLoraCompatibleWithDraft
} from "./video-loras.js";
import {
  normalizeVideoSteps,
  resolveVideoGenerationPolicy
} from "./video-policy.js";

export function normalizeH3FrameSettings(
  draft: Pick<Draft, "modelId" | "fps" | "frameInterpolation">
): Pick<Draft, "fps" | "frameInterpolation"> {
  return modelCatalog.isFamily(draft.modelId, "minimax-h3")
    ? { fps: 24, frameInterpolation: "off" }
    : { fps: draft.fps, frameInterpolation: draft.frameInterpolation };
}

export function videoModelSupportsDraftInput(
  modelId: string,
  inputMode: Draft["inputMode"]
): boolean {
  const declaredInputModes = modelCatalog.get(modelId)?.definition.inputModes;
  return !declaredInputModes || declaredInputModes.includes(inputMode);
}

export function normalizeVideoDraft(draft: Draft): Draft {
  const legacyModelId = draft.modelId;
  const modelId = baseVideoModelId(legacyModelId);
  const ratio = !modelCatalog.isFamily(modelId, "minimax-h3") && draft.ratio === "21:9"
    ? "source"
    : draft.ratio;
  const compatibleVideoLoras = normalizeVideoLoras(draft.videoLoras, legacyModelId)
    .filter((lora) => videoLoraCompatibleWithDraft(lora, modelId, draft.inputMode));
  const videoLoras = modelCatalog.get(modelId)?.definition.runtimeProfile === "h3-q3-3080"
    ? []
    : compatibleVideoLoras;
  const policy = resolveVideoGenerationPolicy({
    modelId,
    inputMode: draft.inputMode,
    spectrumMode: draft.spectrumMode,
    videoLoras
  });
  const spectrumMode = policy.spectrum.allowed ? draft.spectrumMode : "off";
  const spectrumAutomaticallyDisabled = draft.spectrumMode !== "off" && spectrumMode === "off";

  return {
    ...draft,
    modelId,
    ratio,
    videoLoras,
    steps: policy.isH3 ? normalizeVideoSteps(draft.steps, policy) : draft.steps,
    ...normalizeH3FrameSettings({ ...draft, modelId }),
    spectrumMode,
    spectrumModeUserSet: spectrumAutomaticallyDisabled ? false : draft.spectrumModeUserSet,
    spectrumModelAwareMode: spectrumMode === "off" ? "off" : draft.spectrumModelAwareMode,
    ...normalizeH3MemoryOptions(draft)
  };
}
