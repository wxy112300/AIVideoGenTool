import type {
  H3BaseResolution,
  H3HighResolution,
  H3HighResolutionEnvironment,
  H3HighResolutionReasonCode,
  NativeAvArtifactInspection,
  NativeAvContinuationArtifact
} from "../../src/types.js";

export type H3ExecutionStage =
  | "first-pass"
  | "second-sampling"
  | "extend-segment";

export interface H3FrozenTask {
  taskId: string;
  modelId: string;
  providerId: "h3-native-sidecar";
  requestedResolution: H3BaseResolution | H3HighResolution;
  firstPassResolution: H3BaseResolution;
  profileId: string;
  artifactPolicy: "save-final" | "save-first-and-final";
  sourceVersionId?: string;
  inputArtifact?: NativeAvContinuationArtifact;
}

export interface H3StageProgress {
  stage: H3ExecutionStage;
  progress: number;
  message?: string;
}

export interface H3StageRequest {
  stage: H3ExecutionStage;
  task: H3FrozenTask;
  signal: AbortSignal;
  onProgress?(progress: H3StageProgress): void;
}

export interface H3StageResult {
  providerJobId?: string;
  outputFiles?: string[];
  artifact?: NativeAvContinuationArtifact;
  metadata?: Record<string, unknown>;
}

export interface H3ProviderCheckpoint {
  taskId: string;
  stage: H3ExecutionStage;
  providerJobId?: string;
  metadata?: Record<string, unknown>;
}

export interface H3ProviderPreflight {
  ok: boolean;
  reasonCode?: H3HighResolutionReasonCode;
  detail?: string;
}

export interface H3ExecutionProvider {
  readonly providerId: "h3-native-sidecar";
  inspectEnvironment(): Promise<H3HighResolutionEnvironment>;
  preflight(task: H3FrozenTask): Promise<H3ProviderPreflight>;
  executeStage(request: H3StageRequest): Promise<H3StageResult>;
  validateArtifact(reference: NativeAvContinuationArtifact): Promise<NativeAvArtifactInspection>;
  recover(
    checkpoint: H3ProviderCheckpoint,
    request: Omit<H3StageRequest, "stage"> & { stage?: H3ExecutionStage }
  ): Promise<H3StageResult>;
  releaseRuntime(): Promise<void>;
}
