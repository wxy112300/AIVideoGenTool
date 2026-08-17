import type {
  Draft,
  H3StepCount,
  UiLocale,
  VideoLoraSelection
} from "../types.js";
import { modelCatalog } from "./catalog/index.js";
import {
  isH3Ref2vTurboEnabled,
  isH3TurboEnabled,
  videoLoraConfigurationIssues
} from "./video-loras.js";
import type { VideoLoraConfigurationIssue } from "./video-loras.js";

export type VideoPolicySpectrumReason = "unsupported-model" | "motion-context" | null;
export type VideoPolicyStepMode = "standard" | "turbo";

export interface VideoGenerationPolicy {
  isH3: boolean;
  turboEnabled: boolean;
  steps: {
    mode: VideoPolicyStepMode;
    options: readonly H3StepCount[];
    defaultValue: H3StepCount;
    maxValue: H3StepCount;
  };
  spectrum: {
    supportedByModel: boolean;
    allowed: boolean;
    reason: VideoPolicySpectrumReason;
  };
  issues: VideoLoraConfigurationIssue[];
}

export interface VideoGenerationPolicyInput {
  modelId: string;
  inputMode: Draft["inputMode"];
  spectrumMode?: string;
  attentionMode?: string;
  videoLoras?: readonly VideoLoraSelection[];
  locale?: UiLocale;
}

const standardStepOptions: readonly H3StepCount[] = [20, 16, 12];
const turboStepOptions: readonly H3StepCount[] = [4, 6, 8];

export function resolveVideoGenerationPolicy(
  input: VideoGenerationPolicyInput
): VideoGenerationPolicy {
  const definition = modelCatalog.get(input.modelId)?.definition;
  const isH3 = definition?.family === "minimax-h3";
  const turboEnabled = isH3TurboEnabled({
    modelId: input.modelId,
    videoLoras: input.videoLoras
  });
  const ref2vTurboEnabled = isH3Ref2vTurboEnabled({
    modelId: input.modelId,
    videoLoras: input.videoLoras
  });
  const supportedByModel = definition?.capabilities?.supportsSpectrum === true;
  const motionContext = input.inputMode === "video" && definition?.variant === "r2v";
  const reason: VideoPolicySpectrumReason = !supportedByModel
    ? "unsupported-model"
    : motionContext
      ? "motion-context"
      : null;
  return {
    isH3,
    turboEnabled,
    steps: {
      mode: turboEnabled ? "turbo" : "standard",
      options: definition?.capabilities?.generationSteps ??
        (turboEnabled ? turboStepOptions : standardStepOptions),
      defaultValue: ref2vTurboEnabled
        ? 4
        : definition?.capabilities?.defaultGenerationSteps ??
          (turboEnabled ? 8 : 20),
      maxValue: definition?.capabilities?.maxGenerationSteps ??
        (turboEnabled ? 8 : 20)
    },
    spectrum: {
      supportedByModel,
      allowed: reason === null,
      reason
    },
    issues: videoLoraConfigurationIssues({
      modelId: input.modelId,
      inputMode: input.inputMode,
      spectrumMode: input.spectrumMode ?? "off",
      attentionMode: input.attentionMode ?? "sage",
      videoLoras: input.videoLoras ?? [],
      locale: input.locale
    })
  };
}

export function normalizeVideoSteps(
  value: unknown,
  policy: VideoGenerationPolicy
): H3StepCount {
  const normalized = (value === 4 || value === 6 || value === 8 || value === 10 ||
    value === 12 || value === 16 || value === 20) &&
    policy.steps.options.includes(value as H3StepCount)
    ? value
    : policy.steps.defaultValue;
  return normalized > policy.steps.maxValue
    ? policy.steps.maxValue
    : normalized as H3StepCount;
}

export function shouldApplySpectrum(input: VideoGenerationPolicyInput): boolean {
  return input.spectrumMode === "balanced" &&
    resolveVideoGenerationPolicy(input).spectrum.allowed;
}
