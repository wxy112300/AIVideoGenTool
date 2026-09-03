import type {
  EnvironmentScanResult,
  H3BaseResolution,
  H3HighResolution
} from "../types.js";
import { customNodeDefinition, modelCatalog } from "./catalog/index.js";

/** H3 high-resolution targets are delivery targets, not base draft presets. */
export const H3_NATIVE_HIGH_RESOLUTIONS = [1080, 1440] as const satisfies readonly H3HighResolution[];
/** The first pass remains a normal H3 ComfyUI generation. */
export const H3_NATIVE_FIRST_PASS_RESOLUTIONS = [720, 768] as const satisfies readonly H3BaseResolution[];
export const H3_COMFY_SECOND_SAMPLING_NODE_ID = "h3-latent-upscaler" as const;
export const H3_COMFY_SERIALIZER_NODE_ID = "local-video-studio-h3-av" as const;
export const H3_COMFY_REQUIRED_NODE_IDS = [
  H3_COMFY_SECOND_SAMPLING_NODE_ID,
  H3_COMFY_SERIALIZER_NODE_ID
] as const;

export type H3ComfyCapabilityReasonCode =
  | "model-incompatible"
  | "comfy-core-unavailable"
  | "node-missing"
  | "node-revision-mismatch"
  | "object-info-unverified"
  | "workflow-static-unverified"
  | "runtime-unverified"
  | "artifact-missing"
  | "artifact-incompatible"
  | "target-not-supported"
  | "target-not-higher"
  | "conditioning-unavailable";

/** Evidence is deliberately explicit: disk presence and a real run are separate axes. */
export interface H3ComfyCapabilityEvidence {
  environment: EnvironmentScanResult | null;
  staticWorkflowValidated?: boolean;
  realRunValidated?: boolean;
}

export interface H3CapabilityProfile {
  providerId: "comfyui";
  profileId: "unavailable" | "unverified" | "h3-comfyui-two-pass";
  ready: boolean;
  verified: boolean;
  firstPassResolutions: readonly H3BaseResolution[];
  secondSamplingResolutions: readonly H3HighResolution[];
  reasonCode: H3ComfyCapabilityReasonCode;
  missingNodeIds: readonly string[];
  detail?: string;
}

export interface H3NativeResolutionOption {
  value: H3HighResolution;
  enabled: boolean;
  reasonCode?: H3ComfyCapabilityReasonCode;
}

export interface H3NativeSecondSamplingAvailability {
  enabled: boolean;
  reasonCode?: H3ComfyCapabilityReasonCode;
}

export interface H3NativeSecondSamplingAvailabilityInput {
  modelId: string;
  sourceShortEdge: number;
  targetShortEdge: number;
  hasCommittedArtifact: boolean;
  artifactCompatible: boolean;
  conditioningRebuildable: boolean;
  environment: EnvironmentScanResult | null;
  staticWorkflowValidated?: boolean;
  realRunValidated?: boolean;
}

function isH3Model(modelId: string): boolean {
  return modelCatalog.isFamily(modelId, "minimax-h3");
}

function isBaseResolution(value: number): value is H3BaseResolution {
  return [360, 480, 540, 720, 768].includes(value);
}

function isHighResolution(value: number): value is H3HighResolution {
  return (H3_NATIVE_HIGH_RESOLUTIONS as readonly number[]).includes(value);
}

function evidenceFor(
  input: H3ComfyCapabilityEvidence | EnvironmentScanResult | null
): H3ComfyCapabilityEvidence {
  if (!input) return { environment: null };
  return "environment" in input
    ? input
    : { environment: input };
}

function modelBaseResolutions(modelId: string): H3BaseResolution[] {
  const resolutions = modelCatalog.get(modelId)?.definition.capabilities?.resolutions ?? [];
  return resolutions.filter(isBaseResolution);
}

function profileReason(
  environment: EnvironmentScanResult | null,
  evidence: H3ComfyCapabilityEvidence,
  missingNodeIds: readonly string[]
): H3ComfyCapabilityReasonCode {
  if (!environment) return "runtime-unverified";
  if (!environment.comfyCompatibility?.h3CoreSupported) return "comfy-core-unavailable";
  if (missingNodeIds.length > 0) return "node-missing";
  const customNodes = environment.customNodes ?? [];
  const revisionMismatch = customNodes.some((node) =>
    H3_COMFY_REQUIRED_NODE_IDS.includes(node.id as typeof H3_COMFY_REQUIRED_NODE_IDS[number]) &&
    node.compatibilityState === "error" && /revision/iu.test(node.compatibilityNotice || node.loadError)
  );
  if (revisionMismatch) return "node-revision-mismatch";
  const objectInfoUnverified = H3_COMFY_REQUIRED_NODE_IDS.some((id) => {
    const node = customNodes.find((candidate) => candidate.id === id);
    return !node?.runtimeVerified || !node.loaded;
  });
  if (objectInfoUnverified) return "object-info-unverified";
  if (evidence.staticWorkflowValidated !== true) return "workflow-static-unverified";
  if (evidence.realRunValidated !== true) return "runtime-unverified";
  return "runtime-unverified";
}

/**
 * Resolve H3 high-resolution capability from the selected ComfyUI evidence.
 * A model file or numeric target alone can never make this profile ready.
 */
export function h3CapabilityProfileFor(
  modelId: string,
  input: H3ComfyCapabilityEvidence | EnvironmentScanResult | null
): H3CapabilityProfile {
  const evidence = evidenceFor(input);
  const environment = evidence.environment;
  const modelResolutions = modelBaseResolutions(modelId);
  if (!isH3Model(modelId)) {
    return {
      providerId: "comfyui",
      profileId: "unavailable",
      ready: false,
      verified: false,
      firstPassResolutions: [],
      secondSamplingResolutions: [],
      reasonCode: "model-incompatible",
      missingNodeIds: []
    };
  }

  const missingNodeIds = H3_COMFY_REQUIRED_NODE_IDS.filter((id) => {
    const definition = customNodeDefinition(id);
    const node = environment?.customNodes?.find((candidate) => candidate.id === id);
    return !definition || !node?.installed;
  });
  const reasonCode = profileReason(environment, evidence, missingNodeIds);
  const firstPassResolutions = H3_NATIVE_FIRST_PASS_RESOLUTIONS.filter((value) =>
    modelResolutions.includes(value)
  );
  const ready = reasonCode === "runtime-unverified" &&
    evidence.staticWorkflowValidated === true &&
    evidence.realRunValidated === true &&
    H3_COMFY_REQUIRED_NODE_IDS.every((id) => {
      const node = environment?.customNodes?.find((candidate) => candidate.id === id);
      return Boolean(node?.installed && node.loaded && node.runtimeVerified && node.compatibilityState !== "error");
    });

  return {
    providerId: "comfyui",
    profileId: ready ? "h3-comfyui-two-pass" : "unverified",
    ready,
    verified: evidence.realRunValidated === true,
    firstPassResolutions,
    secondSamplingResolutions: ready ? [...H3_NATIVE_HIGH_RESOLUTIONS] : [],
    reasonCode: ready ? "runtime-unverified" : reasonCode,
    missingNodeIds,
    ...(environment?.comfyCompatibility.compatibilityNotice
      ? { detail: environment.comfyCompatibility.compatibilityNotice }
      : {})
  };
}

export function h3NativeResolutionOptionsFor(
  modelId: string,
  input: H3ComfyCapabilityEvidence | EnvironmentScanResult | null
): readonly H3NativeResolutionOption[] {
  const profile = h3CapabilityProfileFor(modelId, input);
  return H3_NATIVE_HIGH_RESOLUTIONS.map((value) => {
    if (!profile.ready) return { value, enabled: false, reasonCode: profile.reasonCode };
    if (!profile.secondSamplingResolutions.includes(value)) {
      return { value, enabled: false, reasonCode: "target-not-supported" };
    }
    return { value, enabled: true };
  });
}

export function isH3NativeHighResolution(value: number): value is H3HighResolution {
  return isHighResolution(value);
}

export function h3NativeSecondSamplingAvailabilityFor(
  input: H3NativeSecondSamplingAvailabilityInput
): H3NativeSecondSamplingAvailability {
  if (!isH3Model(input.modelId)) {
    return { enabled: false, reasonCode: "model-incompatible" };
  }
  if (!isHighResolution(input.targetShortEdge)) {
    return { enabled: false, reasonCode: "target-not-supported" };
  }
  if (input.targetShortEdge <= Math.max(1, input.sourceShortEdge)) {
    return { enabled: false, reasonCode: "target-not-higher" };
  }
  if (!input.hasCommittedArtifact) {
    return { enabled: false, reasonCode: "artifact-missing" };
  }
  if (!input.artifactCompatible) {
    return { enabled: false, reasonCode: "artifact-incompatible" };
  }
  if (!input.conditioningRebuildable) {
    return { enabled: false, reasonCode: "conditioning-unavailable" };
  }
  const option = h3NativeResolutionOptionsFor(input.modelId, {
    environment: input.environment,
    staticWorkflowValidated: input.staticWorkflowValidated,
    realRunValidated: input.realRunValidated
  }).find((candidate) => candidate.value === input.targetShortEdge);
  return option?.enabled
    ? { enabled: true }
    : { enabled: false, reasonCode: option?.reasonCode ?? "runtime-unverified" };
}
