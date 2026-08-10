import { describe, expect, it } from "vitest";
import {
  buildQwenImageEdit2511Workflow,
  compileQwenImageEditPrompt,
  imageOutputCandidateFromValue,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511Capability,
  renderImageWorkflow,
  validateQwenImageEdit2511Workflow
} from "../src/core/image-workflow.js";
import type { ImageGenerationQueueTask, ImageReference } from "../src/types.js";

function picture(pictureNumber: number, absolutePath = `picture-${pictureNumber}.png`): ImageReference {
  return {
    id: `picture-${pictureNumber}`,
    pictureNumber,
    absolutePath,
    width: 1024,
    height: 1024
  };
}

describe("Qwen image edit workflow contract", () => {
  it("exposes the actual native template capability", () => {
    expect(qwenImageEdit2511Capability.maxPictures).toBe(3);
    expect(qwenImageEdit2511Capability.qualityProfiles.map((profile) => profile.id)).toEqual([
      "native",
      "lightning-4step"
    ]);
  });

  it("compiles stable Picture numbers to continuous model inputs", () => {
    const result = compileQwenImageEditPrompt(
      "把 Picture 3 的人物放到 Picture 1 的场景中，并参考 Picture 3 的姿态。",
      [picture(1), picture(3)]
    );

    expect(result.errors).toEqual([]);
    expect(result.prompt).toBe(
      "把 Picture 2 的人物放到 Picture 1 的场景中，并参考 Picture 2 的姿态。"
    );
    expect(result.pictures.map((item) => item.absolutePath)).toEqual([
      "picture-1.png",
      "picture-3.png"
    ]);
    expect(result.referencedPictureNumbers).toEqual([1, 3]);
  });

  it("blocks references to a deleted Picture instead of silently reassigning", () => {
    const result = compileQwenImageEditPrompt(
      "保留 Picture 2 的人物。",
      [picture(1), picture(3)]
    );

    expect(result.errors).toContain("Picture 2 引用了不存在的 Picture 2。");
    expect(result.prompt).toBe("保留 Picture 2 的人物。");
  });

  it("rejects more references than the native workflow can accept", () => {
    const result = compileQwenImageEditPrompt(
      "组合这些图片。",
      [picture(1), picture(2), picture(3), picture(4)]
    );

    expect(result.errors).toContain("当前 Qwen 2511 工作流最多支持 3 张 Picture。");
    expect(result.pictures).toHaveLength(3);
  });

  it("parses supported image output formats", () => {
    expect(imageOutputCandidateFromValue({ filename: "image.webp" })).toMatchObject({
      type: "output",
      format: "webp"
    });
    expect(imageOutputCandidateFromValue({ filename: "image.txt" })).toMatchObject({
      format: undefined
    });
    expect(imageOutputCandidateFromValue({ filename: "" })).toBeNull();
  });

  it("builds a native API workflow with continuous uploaded-image placeholders", () => {
    const task: ImageGenerationQueueTask = {
      id: "task-1",
      taskType: "image-generation",
      status: "waiting",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      projectId: "project-1",
      pictures: [picture(1), picture(3)],
      diffusionModelFilename: "qwen_image_edit_2511_bf16.safetensors",
      prompt: "把 Picture 3 的人物放到 Picture 1 的场景中。",
      promptVersion: 1,
      modelId: "qwen-image-edit-2511",
      workflowPath: "builtin:image/qwen-image-edit-2511",
      qualityProfile: "native",
      outputFormat: "png",
      outputCount: 1,
      runs: []
    };
    const workflow = buildQwenImageEdit2511Workflow(task, {
      id: "run-1",
      index: 0,
      seed: 123,
      status: "running"
    });

    expect(workflow["image-picture-1"]?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow["image-picture-3"]?.inputs.image).toBe("{{IMAGE_1}}");
    expect(workflow.positive?.class_type).toBe("TextEncodeQwenImageEditPlus");
    expect(workflow.positive?.inputs.image1).toEqual(["image-picture-1", 0]);
    expect(workflow.positive?.inputs.image2).toEqual(["image-picture-3", 0]);
    expect(workflow.model?.inputs.unet_name).toBe("qwen_image_edit_2511_bf16.safetensors");
    expect(workflow.negative?.class_type).toBe("TextEncodeQwenImageEditPlus");
    expect(workflow.sourceImage?.class_type).toBe("FluxKontextImageScale");
    expect(workflow.source?.class_type).toBe("VAEEncode");
    expect(workflow.positiveReference?.class_type).toBe("FluxKontextMultiReferenceLatentMethod");
    expect(workflow.sampler?.inputs.seed).toBe(123);
    expect(workflow.save?.class_type).toBe("SaveImage");
    expect(validateQwenImageEdit2511Workflow(workflow, "native", true)).toEqual([]);
    expect(validateQwenImageEdit2511Workflow(
      renderImageWorkflow(workflow, ["uploaded-picture-1.png", "uploaded-picture-3.png"])
    )).toEqual([]);
  });

  it("declares the native runtime node contract without the removed Flux reference node", () => {
    expect(qwenImageEdit2511RequiredNodeTypes).toContain("TextEncodeQwenImageEditPlus");
    expect(qwenImageEdit2511RequiredNodeTypes).toContain("FluxKontextImageScale");
    expect(qwenImageEdit2511RequiredNodeTypes).toContain("FluxKontextMultiReferenceLatentMethod");
  });

  it("rejects a workflow fixture with an unresolved image placeholder", () => {
    const workflow = buildQwenImageEdit2511Workflow({
      id: "task-1",
      taskType: "image-generation",
      status: "waiting",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      outputFilename: "QwenEdit-1",
      modelId: "qwen-image-edit-2511",
      workflowPath: "builtin:image/qwen-image-edit-2511",
      projectId: "project-1",
      pictures: [picture(1)],
      prompt: "编辑 Picture 1。",
      promptVersion: 1,
      qualityProfile: "native",
      outputFormat: "png",
      outputCount: 1,
      runs: []
    }, {
      id: "run-1",
      index: 0,
      seed: 123,
      status: "waiting"
    });

    expect(validateQwenImageEdit2511Workflow(workflow)).toContain(
      "图片工作流仍包含未上传的 IMAGE 占位符。"
    );
  });

  it("rejects a Qwen workflow without a base Picture", () => {
    const task = {
      id: "task-1",
      taskType: "image-generation" as const,
      status: "waiting" as const,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      projectId: "project-1",
      pictures: [],
      prompt: "生成一张图片。",
      promptVersion: 1,
      modelId: "qwen-image-edit-2511",
      workflowPath: "builtin:image/qwen-image-edit-2511",
      qualityProfile: "native",
      outputFormat: "png" as const,
      outputCount: 1,
      runs: []
    };

    expect(() => buildQwenImageEdit2511Workflow(task, {
      id: "run-1",
      index: 0,
      seed: 123,
      status: "waiting"
    })).toThrow("至少需要一张基础 Picture");
  });

  it("rejects an unfilled Slot before building the workflow", () => {
    const result = compileQwenImageEditPrompt(
      "保留基础画面。",
      [picture(1, "")]
    );

    expect(result.errors).toContain("Picture 1 尚未添加图片。");
    expect(result.pictures).toEqual([]);
  });

  it("renders uploaded Picture filenames without changing other workflow values", () => {
    const rendered = renderImageWorkflow({
      load: {
        class_type: "LoadImage",
        inputs: { image: "{{IMAGE_0}}" }
      },
      save: {
        class_type: "SaveImage",
        inputs: { filename_prefix: "Qwen" }
      }
    }, ["studio-input-a.png"]);

    expect(rendered.load?.inputs.image).toBe("studio-input-a.png");
    expect(rendered.save?.inputs.filename_prefix).toBe("Qwen");
  });
});
