import type {
  H3HighResolutionEnvironment,
  NativeAvArtifactInspection,
  NativeAvContinuationArtifact
} from "../../src/types.js";
import type {
  H3ExecutionProvider,
  H3FrozenTask,
  H3ProviderCheckpoint,
  H3ProviderPreflight,
  H3ExecutionStage,
  H3StageRequest,
  H3StageResult
} from "../ports/h3-execution-provider.js";
import { NativeAvArtifactService } from "./native-av-artifact.js";

export interface H3NativeSidecarTransport {
  inspectEnvironment(): Promise<H3HighResolutionEnvironment>;
  preflight(task: H3FrozenTask): Promise<H3ProviderPreflight>;
  executeStage(request: H3StageRequest): Promise<H3StageResult>;
  recover(
    checkpoint: H3ProviderCheckpoint,
    request: Omit<H3StageRequest, "stage"> & { stage?: H3StageRequest["stage"] }
  ): Promise<H3StageResult>;
  releaseRuntime(): Promise<void>;
}

/**
 * The product owns the queue and this narrow transport owns only one stage.
 * Until a licensed/clean-room sidecar is installed, every execution method
 * fails closed. This is intentional: a ComfyUI MP4 or Motion Context cache is
 * not a Native H3 provider result.
 */
export class UnavailableH3NativeSidecarTransport implements H3NativeSidecarTransport {
  async inspectEnvironment(): Promise<H3HighResolutionEnvironment> {
    return {
      providerId: "h3-native-sidecar",
      state: "stopped",
      verified: false,
      reasonCode: "provider-not-installed",
      detail: "H3 Native sidecar 尚未安装或未配置；不会把普通 ComfyUI 输出当作 provider。",
      providerVersion: "未安装（上游 release manifest v1.0.0）",
      providerRevision: "未绑定（审计 HEAD afac23294d05）",
      providerSource: "X-MinimaxH3 Native Engine（外部 sidecar；非应用内置）",
      providerInstallGuideUrl: "https://github.com/PullMyBoots/X-MinimaxH3/blob/afac23294d05a9807a9a1b80a0a25e90c4a86b42/README.zh-CN.md",
      providerInstallable: false,
      providerInstallNote: "当前没有已授权、可由本应用分发的 Native Engine 安装包；需外部 sidecar 或 clean-room provider。"
    };
  }

  async preflight(_task: H3FrozenTask): Promise<H3ProviderPreflight> {
    return {
      ok: false,
      reasonCode: "provider-not-installed",
      detail: "H3 Native sidecar 尚未安装或未通过 runtime smoke。"
    };
  }

  async executeStage(_request: H3StageRequest): Promise<H3StageResult> {
    throw new H3ProviderError("provider-not-installed", "H3 Native sidecar 尚未安装，拒绝执行原生 AV 阶段。");
  }

  async recover(
    _checkpoint: H3ProviderCheckpoint,
    _request: Omit<H3StageRequest, "stage"> & { stage?: H3StageRequest["stage"] }
  ): Promise<H3StageResult> {
    throw new H3ProviderError("provider-not-installed", "H3 Native sidecar 尚未安装，无法恢复原生 AV 阶段。");
  }

  async releaseRuntime(): Promise<void> {
    // No process was started, so release is deliberately a no-op.
  }
}

export class H3ProviderError extends Error {
  constructor(
    readonly reasonCode: NonNullable<H3ProviderPreflight["reasonCode"]>,
    message: string
  ) {
    super(message);
    this.name = "H3ProviderError";
  }
}

export interface H3NativeSidecarProviderDependencies {
  artifactService: NativeAvArtifactService;
  resolveVideoOutputDirectory(): Promise<string>;
  transport?: H3NativeSidecarTransport;
}

function expectedInputRolesForStage(
  stage: H3ExecutionStage
): readonly NativeAvContinuationArtifact["role"][] {
  if (stage === "second-sampling") return ["first-pass-clean-av"];
  if (stage === "extend-segment") return ["final-clean-av", "extend-segment-clean-av"];
  return [];
}

function expectedOutputRoleForStage(
  stage: H3ExecutionStage
): NativeAvContinuationArtifact["role"] {
  if (stage === "first-pass") return "first-pass-clean-av";
  if (stage === "second-sampling") return "final-clean-av";
  return "extend-segment-clean-av";
}

function artifactInspectionError(
  inspection: NativeAvArtifactInspection,
  fallback: string
): H3ProviderError {
  return new H3ProviderError(
    inspection.status === "missing" ? "artifact-missing" : "artifact-incompatible",
    inspection.reason ?? fallback
  );
}

export class H3NativeSidecarProvider implements H3ExecutionProvider {
  readonly providerId = "h3-native-sidecar" as const;
  private readonly transport: H3NativeSidecarTransport;

  constructor(private readonly deps: H3NativeSidecarProviderDependencies) {
    this.transport = deps.transport ?? new UnavailableH3NativeSidecarTransport();
  }

  inspectEnvironment(): Promise<H3HighResolutionEnvironment> {
    return this.transport.inspectEnvironment();
  }

  async preflight(task: H3FrozenTask): Promise<H3ProviderPreflight> {
    return this.preflightForStage(task);
  }

  private async preflightForStage(
    task: H3FrozenTask,
    stage?: H3StageRequest["stage"]
  ): Promise<H3ProviderPreflight> {
    if (task.providerId !== this.providerId) {
      return {
        ok: false,
        reasonCode: "profile-unsupported",
        detail: `任务 provider=${task.providerId} 与 H3 Native provider 不匹配。`
      };
    }
    if (stage === "second-sampling" && !task.inputArtifact) {
      return {
        ok: false,
        reasonCode: "artifact-missing",
        detail: "原生二采必须显式提供已提交的 clean joint AV artifact。"
      };
    }
    if (task.inputArtifact) {
      const inspection = await this.validateArtifact(task.inputArtifact);
      if (inspection.status !== "available") {
        return { ok: false, reasonCode: inspection.status === "missing" ? "artifact-missing" : "artifact-incompatible", detail: inspection.reason ?? "输入 AV artifact 校验失败。" };
      }
      if (stage) {
        const expectedRoles = expectedInputRolesForStage(stage);
        const inputRole = inspection.artifact?.role;
        if (expectedRoles.length > 0 && (!inputRole || !expectedRoles.includes(inputRole))) {
          return {
            ok: false,
            reasonCode: "artifact-incompatible",
            detail: `stage=${stage} 不接受 role=${inspection.artifact?.role ?? "unknown"} 的 AV artifact。`
          };
        }
      }
    }
    return this.transport.preflight(task);
  }

  async executeStage(request: H3StageRequest): Promise<H3StageResult> {
    const preflight = await this.preflightForStage(request.task, request.stage);
    if (!preflight.ok) {
      throw new H3ProviderError(
        preflight.reasonCode ?? "runtime-unverified",
        preflight.detail ?? "H3 Native provider preflight 未通过。"
      );
    }
    const result = await this.transport.executeStage(request);
    return this.validateStageResult(request, result);
  }

  async validateArtifact(
    reference: NativeAvContinuationArtifact
  ): Promise<NativeAvArtifactInspection> {
    const outputDirectory = await this.deps.resolveVideoOutputDirectory();
    if (!outputDirectory.trim()) {
      return {
        status: "missing",
        reason: "当前没有可解析的视频输出目录。"
      };
    }
    return this.deps.artifactService.inspect(reference, outputDirectory);
  }

  async recover(
    checkpoint: H3ProviderCheckpoint,
    request: Omit<H3StageRequest, "stage"> & { stage?: H3StageRequest["stage"] }
  ): Promise<H3StageResult> {
    const stage = request.stage ?? checkpoint.stage;
    const preflight = await this.preflightForStage(request.task, stage);
    if (!preflight.ok) {
      throw new H3ProviderError(
        preflight.reasonCode ?? "runtime-unverified",
        preflight.detail ?? "H3 Native provider recovery preflight 未通过。"
      );
    }
    const stageRequest = { ...request, stage } as H3StageRequest;
    const result = await this.transport.recover(checkpoint, stageRequest);
    return this.validateStageResult(stageRequest, result);
  }

  releaseRuntime(): Promise<void> {
    return this.transport.releaseRuntime();
  }

  private async validateStageResult(
    request: H3StageRequest,
    result: H3StageResult
  ): Promise<H3StageResult> {
    const artifactRequired = request.stage !== "first-pass" ||
      request.task.artifactPolicy === "save-first-and-final";
    if (!result.artifact) {
      if (artifactRequired) {
        throw new H3ProviderError(
          "artifact-missing",
          `stage=${request.stage} 未返回已提交的 clean joint AV artifact。`
        );
      }
      return result;
    }
    const inspection = await this.validateArtifact(result.artifact);
    if (inspection.status !== "available") {
      throw artifactInspectionError(inspection, `stage=${request.stage} 的 AV artifact 校验失败。`);
    }
    if (inspection.artifact?.role !== expectedOutputRoleForStage(request.stage)) {
      throw new H3ProviderError(
        "artifact-incompatible",
        `stage=${request.stage} 返回了不匹配的 artifact role=${inspection.artifact?.role ?? "unknown"}。`
      );
    }
    return {
      ...result,
      artifact: inspection.artifact ?? result.artifact
    };
  }
}
