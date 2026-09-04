import { promises as nodeFs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import type { BundledWorkflow, Draft, Settings } from "../src/types.js";
import {
  extensionWorkflowSafetyErrors,
  isMiniMaxH3ContinuumModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3R2vModel,
  workflowSupportsEndImage,
  workflowSupportsExtensionForModel,
  workflowSupportsH3BoundaryExtension,
  workflowSupportsH3ContinuumExtension,
  workflowSupportsH3MotionContextExtension
} from "../src/core/workflow.js";
import { workflowMetadataForFilename } from "../src/core/workflow-metadata.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";

type WorkflowFileSystem = Pick<typeof nodeFs, "stat" | "readFile">;

export interface WorkflowIpcDependencies {
  ipc: IpcMain;
  fileSystem: WorkflowFileSystem;
  logger: Pick<AppLogger, "info">;
  workflowRoots: readonly string[];
  getLtxExtensionModelProfile: () => Settings["ltxExtensionModelProfile"];
}

function ltxVariantFor(
  profile: Settings["ltxExtensionModelProfile"]
): { variant: "q2" | "dev"; label: string } {
  return profile === "q2_distilled"
    ? { variant: "q2", label: "Q2_K distilled · 8GB 兼容" }
    : profile === "q3_k_m"
      ? { variant: "dev", label: "Q3_K_M dev · 均衡" }
      : { variant: "dev", label: "Q4_K_M dev · 质量" };
}

function attachWorkflowMetadata(workflow: BundledWorkflow): BundledWorkflow {
  const metadata = workflowMetadataForFilename(workflow.path);
  return metadata ? { ...workflow, metadata } : workflow;
}

async function readJson(
  fileSystem: WorkflowFileSystem,
  filename: string
): Promise<unknown> {
  return JSON.parse(await fileSystem.readFile(filename, "utf8")) as unknown;
}

async function findWorkflow(
  deps: WorkflowIpcDependencies,
  filename: string
): Promise<string | null> {
  for (const root of deps.workflowRoots) {
    const candidate = path.join(root, filename);
    if (await deps.fileSystem.stat(candidate).catch(() => null)) return candidate;
  }
  return null;
}

async function inspectWorkflow(
  deps: WorkflowIpcDependencies,
  workflowPath: string,
  modelId?: string
): Promise<{ supportsEndImage: boolean; supportsVideoExtension: boolean }> {
  const startedAt = Date.now();
  const source = await readJson(deps.fileSystem, workflowPath);
  const result = {
    supportsEndImage: workflowSupportsEndImage(source),
    supportsVideoExtension: modelId
      ? workflowSupportsExtensionForModel(source, modelId)
      : extensionWorkflowSafetyErrors(source).length === 0
  };
  deps.logger.info("workflow", "inspected", "Workflow inspected", {
    durationMs: Date.now() - startedAt,
    modelId,
    supportsEndImage: result.supportsEndImage,
    supportsVideoExtension: result.supportsVideoExtension
  });
  return result;
}

async function bundledWorkflowFor(
  deps: WorkflowIpcDependencies,
  modelId: string,
  inputMode: Draft["inputMode"] = "image"
): Promise<BundledWorkflow | null> {
  const { variant: ltxVariant, label: ltxProfileLabel } = ltxVariantFor(
    deps.getLtxExtensionModelProfile()
  );
  if (inputMode === "video") {
    if (modelId === "minimax_h3_fl2va_q3_gguf") {
      const filename = "minimax_h3_i2v_gguf_q3_api.json";
      const candidate = await findWorkflow(deps, filename);
      if (!candidate) return null;
      const source = await readJson(deps.fileSystem, candidate);
      return attachWorkflowMetadata({
        modelId,
        label: "内置 · MiniMax H3 Q3 GGUF · 3080 低显存实验（不支持续写）",
        path: candidate,
        supportsEndImage: workflowSupportsEndImage(source),
        supportsVideoExtension: false
      });
    }
    if (isMiniMaxH3R2vModel(modelId)) {
      const filename = "minimax_h3_r2v_extend_api.json";
      const candidate = await findWorkflow(deps, filename);
      if (!candidate) return null;
      const source = await readJson(deps.fileSystem, candidate);
      return attachWorkflowMetadata({
        modelId,
        label: "内置 · MiniMax H3 R2V Motion Context · 运动与音频连续",
        path: candidate,
        supportsEndImage: false,
        supportsVideoExtension: workflowSupportsH3MotionContextExtension(source)
      });
    }
    if (isMiniMaxH3ContinuumModel(modelId)) {
      const filename = "minimax_h3_continuum_extend_api.json";
      const candidate = await findWorkflow(deps, filename);
      if (!candidate) return null;
      const source = await readJson(deps.fileSystem, candidate);
      return attachWorkflowMetadata({
        modelId,
        label: "内置 · MiniMax H3 Continuum · Native AV 接续",
        path: candidate,
        supportsEndImage: false,
        supportsVideoExtension: workflowSupportsH3ContinuumExtension(source)
      });
    }
    if (isMiniMaxH3Fl2vaModel(modelId)) {
      const filename = "minimax_h3_i2v_api.json";
      const candidate = await findWorkflow(deps, filename);
      if (!candidate) return null;
      const source = await readJson(deps.fileSystem, candidate);
      return attachWorkflowMetadata({
        modelId,
        label: "内置 · MiniMax H3 结尾帧接续 · 原生音视频",
        path: candidate,
        supportsEndImage: workflowSupportsEndImage(source),
        supportsVideoExtension: workflowSupportsH3BoundaryExtension(source)
      });
    }
    if (modelId !== "sulphur2") return null;
    const filename = `sulphur2_ltx23_extend_gguf_${ltxVariant}_api.json`;
    const candidate = await findWorkflow(deps, filename);
    if (!candidate) return null;
    const source = await readJson(deps.fileSystem, candidate);
    return attachWorkflowMetadata({
      modelId,
      label: `内置 · Sulphur 2 原生续写 · ${ltxProfileLabel}`,
      path: candidate,
      supportsEndImage: false,
      supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
    });
  }

  const definitions: Record<string, { filename: string; label: string }> = {
    minimax_h3_fl2va: {
      filename: "minimax_h3_i2v_api.json",
      label: "内置 · MiniMax H3 FL2VA · 原生 24 FPS 音视频"
    },
    minimax_h3_fl2va_int4: {
      filename: "minimax_h3_i2v_api.json",
      label: "内置 · MiniMax H3 FL2VA INT4 · 原生 24 FPS 音视频"
    },
    minimax_h3_fl2va_q3_gguf: {
      filename: "minimax_h3_i2v_gguf_q3_api.json",
      label: "内置 · MiniMax H3 Q3 GGUF · 低显存实验"
    },
    minimax_h3_fl2va_turbo: {
      filename: "minimax_h3_fl2va_turbo_api.json",
      label: "内置 · MiniMax H3 LightX2V Turbo FL2VA · 首尾帧音视频"
    },
    minimax_h3_ref2va: {
      filename: "minimax_h3_r2v_api.json",
      label: "内置 · MiniMax H3 R2V · 多参考音视频"
    },
    minimax_h3_ref2va_int4: {
      filename: "minimax_h3_r2v_api.json",
      label: "内置 · MiniMax H3 R2V INT4 · 多参考音视频"
    },
    sulphur2: {
      filename: `sulphur2_ltx23_i2v_gguf_${ltxVariant}_api.json`,
      label: `内置 · Sulphur 2 图生视频 · ${ltxProfileLabel}`
    },
    wan22_5b: {
      filename: "wan22_5b_i2v_api.json",
      label: "内置 · Wan 2.2 5B 图生视频"
    },
    hunyuan15: {
      filename: "hunyuan15_i2v_api.json",
      label: "内置 · HunyuanVideo 1.5 图生视频"
    },
    hunyuan15_sr: {
      filename: "hunyuan15_sr_i2v_api.json",
      label: "内置 · HunyuanVideo 1.5 双阶段 1080p 图生视频"
    },
    wan22_14b_nsfw: {
      filename: "wan22_14b_i2v_api.json",
      label: "内置 · Wan 2.2 I2V 14B + NSFW"
    },
    wan22_remix: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · Wan 2.2 Remix v3"
    },
    wan22_smoothmix: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · Wan 2.2 SmoothMix I2V"
    },
    wan22_dasiwa: {
      filename: "wan22_14b_gguf_i2v_api.json",
      label: "内置 · DaSiWa SynthSeduction v9"
    }
  };
  const definition = definitions[modelId];
  if (!definition) return null;
  const candidate = await findWorkflow(deps, definition.filename);
  if (!candidate) return null;
  const source = await readJson(deps.fileSystem, candidate);
  return attachWorkflowMetadata({
    modelId,
    label: definition.label,
    path: candidate,
    supportsEndImage: workflowSupportsEndImage(source),
    supportsVideoExtension: extensionWorkflowSafetyErrors(source).length === 0
  });
}

export function registerWorkflowIpc(deps: WorkflowIpcDependencies): void {
  deps.ipc.handle("workflow:inspect", (_event, workflowPath: string, modelId?: string) =>
    inspectWorkflow(deps, workflowPath, modelId)
  );
  deps.ipc.handle("workflow:get-bundled", (_event, modelId: string, inputMode?: Draft["inputMode"]) =>
    bundledWorkflowFor(deps, modelId, inputMode)
  );
}
