import type { QueueTask } from "../types.js";

export interface WorkflowContext {
  inputImage: string;
  endImage: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
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
  const fps = context.fps ?? 24;
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
    FRAMES: context.frames ?? Math.max(1, Math.round(task.duration * fps)),
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
