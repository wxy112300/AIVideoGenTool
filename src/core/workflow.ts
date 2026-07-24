import type { QueueTask } from "../types.js";

export interface WorkflowContext {
  inputImage: string;
  endImage: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
}

export interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  placeholders: string[];
  nodeCount: number;
}

export function frameCountForTask(task: QueueTask, fps: number): number {
  const requested = Math.max(1, Math.round(task.duration * fps));
  if (!["wan22_5b", "hunyuan15"].includes(task.modelId)) return requested;
  return Math.max(1, Math.round((requested - 1) / 4) * 4 + 1);
}

export function missingWorkflowNodeTypes(
  source: unknown,
  objectInfo: unknown
): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) {
    return [];
  }
  const available = new Set(Object.keys(objectInfo as Record<string, unknown>));
  return [
    ...new Set(
      Object.values(source as Record<string, unknown>)
        .map((node) =>
          node && typeof node === "object" && !Array.isArray(node)
            ? (node as Record<string, unknown>).class_type
            : undefined
        )
        .filter((value): value is string => typeof value === "string")
        .filter((value) => !available.has(value))
    )
  ].sort();
}

const ratios: Record<string, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
  source: [16, 9]
};

export function outputDimensions(task: QueueTask): [number, number] {
  const [rw, rh] = ratios[task.ratio] ?? ratios.source!;
  const height = Math.max(64, Math.round(task.resolution / 16) * 16);
  const width = Math.max(64, Math.round((height * rw) / rh / 16) * 16);
  return [width, height];
}

export function renderWorkflow(
  source: unknown,
  task: QueueTask,
  context: Partial<WorkflowContext> = {}
): unknown {
  const [width, height] = outputDimensions(task);
  const fps = context.fps ?? task.fps ?? 8;
  const tokens: Record<string, string | number> = {
    PROMPT: task.prompt,
    NEGATIVE_PROMPT: "",
    SEED: task.seed,
    INPUT_IMAGE: context.inputImage ?? "",
    END_IMAGE: context.endImage ?? "",
    WIDTH: context.width ?? width,
    HEIGHT: context.height ?? height,
    DURATION: task.duration,
    FPS: fps,
    FRAMES: context.frames ?? frameCountForTask(task, fps),
    OUTPUT_FILENAME: task.outputFilename.replace(/\.mp4$/i, "")
  };

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          visit(child)
        ])
      );
    }
    if (typeof value !== "string") return value;
    const exact = value.match(/^\{\{([A-Z_]+)\}\}$/);
    if (exact?.[1] && exact[1] in tokens) return tokens[exact[1]];
    return value.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
      key in tokens ? String(tokens[key]) : match
    );
  };

  return visit(source);
}

export function validateApiWorkflow(source: unknown): WorkflowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const placeholders = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      valid: false,
      errors: ["工作流根节点必须是 ComfyUI API 格式的对象"],
      warnings,
      placeholders: [],
      nodeCount: 0
    };
  }

  const entries = Object.entries(source as Record<string, unknown>);
  if (Array.isArray((source as Record<string, unknown>).nodes)) {
    errors.push("检测到普通 UI workflow；请使用 Export Workflow (API) 导出");
  }
  if (entries.length === 0) errors.push("工作流没有节点");
  for (const [nodeId, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`节点 ${nodeId} 不是对象`);
      continue;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.class_type !== "string" || !node.class_type) {
      errors.push(`节点 ${nodeId} 缺少 class_type；可能导出了普通 UI workflow`);
    }
    if (!node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) {
      errors.push(`节点 ${nodeId} 缺少 inputs`);
    }
  }

  const serialized = JSON.stringify(source);
  for (const match of serialized.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
    if (match[1]) placeholders.add(match[1]);
  }
  if (!placeholders.has("PROMPT")) {
    errors.push("缺少 {{PROMPT}}，GUI 无法注入当前提示词");
  }
  if (!placeholders.has("INPUT_IMAGE")) {
    errors.push("缺少 {{INPUT_IMAGE}}，GUI 无法注入首帧");
  }
  if (!placeholders.has("SEED")) warnings.push("缺少 {{SEED}}，任务 Seed 不会传入工作流");
  if (!placeholders.has("OUTPUT_FILENAME")) {
    warnings.push("缺少 {{OUTPUT_FILENAME}}，ComfyUI 将自行决定输出文件名");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders: [...placeholders].sort(),
    nodeCount: entries.length
  };
}
