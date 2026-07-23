import { describe, expect, it } from "vitest";
import type { QueueTask } from "../src/types";
import { renderWorkflow, validateApiWorkflow } from "../src/core/workflow";

const task: QueueTask = {
  id: "task-1",
  status: "waiting",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  outputFilename: "test.mp4",
  prompt: "人物自然转身",
  promptVersion: 1,
  startImagePath: "start.png",
  endImagePath: "",
  modelId: "sulphur2",
  workflowPath: "workflow.json",
  ratio: "16:9",
  resolution: 480,
  duration: 5,
  motion: "natural",
  seed: 42,
  keepSeedOnCopy: false
};

describe("renderWorkflow", () => {
  it("replaces nested values while preserving numeric token types", () => {
    const result = renderWorkflow(
      {
        "1": {
          class_type: "Example",
          inputs: {
            text: "{{PROMPT}}",
            seed: "{{SEED}}",
            filename_prefix: "studio/{{OUTPUT_FILENAME}}",
            untouched: "{{UNKNOWN}}"
          }
        }
      },
      task,
      { inputImage: "uploaded/start.png" }
    ) as Record<string, { inputs: Record<string, unknown> }>;

    expect(result["1"]!.inputs.text).toBe("人物自然转身");
    expect(result["1"]!.inputs.seed).toBe(42);
    expect(result["1"]!.inputs.filename_prefix).toBe("studio/test");
    expect(result["1"]!.inputs.untouched).toBe("{{UNKNOWN}}");
  });
});

describe("validateApiWorkflow", () => {
  it("accepts API-format nodes with required GUI placeholders", () => {
    const result = validateApiWorkflow({
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{PROMPT}}" }
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" }
      }
    });
    expect(result.valid).toBe(true);
    expect(result.nodeCount).toBe(2);
    expect(result.warnings).toHaveLength(2);
  });

  it("explains when a normal UI workflow was selected", () => {
    const result = validateApiWorkflow({
      last_node_id: 12,
      nodes: []
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("普通 UI workflow");
    expect(result.errors.join(" ")).toContain("{{PROMPT}}");
  });
});
