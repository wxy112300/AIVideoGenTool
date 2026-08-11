import { describe, expect, it } from "vitest";
import {
  buildFlux2Klein4bWorkflow,
  buildQwenImageEdit2511Workflow,
  compileFlux2Klein4bPrompt,
  compileQwenImageEditPrompt,
  flux2Klein4bCapability,
  flux2Klein4bRequiredNodeTypes,
  imageLightningComponentFound,
  imageMarkupPromptContext,
  imageOutputCandidateFromValue,
  imageOutputDimensions,
  imageResolutionOptionsFor,
  imageReferenceInputPath,
  normalizeImageTargetResolution,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511Capability,
  renderImageWorkflow,
  validateFlux2Klein4bWorkflow,
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
  it("keeps Lightning optional for native quality and detects it for 4-step mode", () => {
    expect(imageLightningComponentFound([
      { label: "Qwen Image VAE", found: true },
      { label: "Qwen Image Edit 2511 Lightning LoRA（可选）", found: false }
    ])).toBe(false);
    expect(imageLightningComponentFound([
      { label: "Qwen Image Edit 2511 Lightning LoRA（可选）", found: true }
    ])).toBe(true);
  });

  it("offers source-relative output presets without exposing an upscale target", () => {
    expect(imageResolutionOptionsFor(2816, 1152).map((option) => option.value)).toEqual([
      "source",
      1152,
      1080,
      720,
      640,
      480
    ]);
    expect(imageOutputDimensions(2816, 1152, 1080)).toEqual([2640, 1080]);
    expect(normalizeImageTargetResolution(2160, 2816, 1152)).toBe("source");
    expect(imageResolutionOptionsFor(1024, 1024).map((option) => option.value)).toEqual([
      "source",
      720,
      640,
      480
    ]);
  });

  it("exposes the actual native template capability", () => {
    expect(qwenImageEdit2511Capability.maxPictures).toBe(3);
    expect(qwenImageEdit2511Capability.qualityProfiles.map((profile) => profile.id)).toEqual([
      "balanced-20",
      "native",
      "lightning-4step"
    ]);
    expect(qwenImageEdit2511Capability.qualityProfiles[0]).toMatchObject({
      steps: 20,
      cfg: 4,
      lightning: false
    });
    expect(qwenImageEdit2511Capability.supportedFormats).toEqual(["png"]);
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

  it("uses a marked rendering for the same Picture slot and adds a cleanup contract", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "A：只移除红框内的水印",
        revision: 2,
        objectCount: 1,
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    };

    const result = compileQwenImageEditPrompt("修复 Picture 1。", [marked]);

    expect(result.pictures).toHaveLength(1);
    expect(imageReferenceInputPath(result.pictures[0]!)).toBe("guide.png");
    expect(result.prompt).toContain("Visual annotation instructions:");
    expect(result.prompt).toContain("remove every annotation from the final image");
    expect(result.prompt).toContain("A：只移除红框内的水印");
    expect(imageMarkupPromptContext([picture(1)])).toBe("");
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
      outputFilename: "QwenEdit-1",
      projectId: "project-1",
      pictures: [picture(1), picture(3)],
      diffusionModelFilename: "qwen_image_edit_2511_bf16.safetensors",
      imageOutputSubfolder: "Images",
      outputWidth: 1024,
      outputHeight: 1024,
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
    expect(workflow.clip?.inputs.device).toBe("cpu");
    expect(workflow.positive?.inputs.image1).toEqual(["image-picture-1", 0]);
    expect(workflow.positive?.inputs.image2).toEqual(["image-picture-3", 0]);
    expect(workflow.model?.inputs.unet_name).toBe("qwen_image_edit_2511_bf16.safetensors");
    expect(workflow.negative?.class_type).toBe("TextEncodeQwenImageEditPlus");
    expect(workflow.sourceImage?.class_type).toBe("FluxKontextImageScale");
    expect(workflow.source?.class_type).toBe("VAEEncode");
    expect(workflow.cfgNorm?.class_type).toBe("CFGNorm");
    expect(workflow.cfgNorm?.inputs.strength).toBe(1);
    expect(workflow.exactSize?.class_type).toBe("ImageScale");
    expect(workflow.exactSize?.inputs.width).toBe(1024);
    expect(workflow.exactSize?.inputs.height).toBe(1024);
    expect(workflow.save?.inputs.filename_prefix).toContain("Images/QwenEdit_");
    expect(workflow.positiveReference?.class_type).toBe("FluxKontextMultiReferenceLatentMethod");
    expect(workflow.positiveReference?.inputs.reference_latents_method).toBe("index_timestep_zero");
    expect(workflow.negativeReference?.inputs.reference_latents_method).toBe("index_timestep_zero");
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
      outputFilename: "QwenEdit-1",
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

describe("FLUX.2 Klein 4B image edit workflow contract", () => {
  it("exposes a consumer-GPU single-reference capability", () => {
    expect(flux2Klein4bCapability.maxPictures).toBe(1);
    expect(flux2Klein4bCapability.qualityProfiles.map((profile) => profile.id)).toEqual([
      "native",
      "high-quality"
    ]);
    expect(flux2Klein4bCapability.qualityProfiles[0]).toMatchObject({
      id: "native",
      steps: 20,
      cfg: 5
    });
    expect(flux2Klein4bCapability.qualityProfiles[1]).toMatchObject({
      id: "high-quality",
      steps: 50,
      cfg: 4
    });
    expect(flux2Klein4bRequiredNodeTypes).toContain("ReferenceLatent");
    expect(flux2Klein4bRequiredNodeTypes).toContain("SamplerCustomAdvanced");
  });

  it("compiles only Picture 1 and rejects extra references", () => {
    const result = compileFlux2Klein4bPrompt(
      "编辑 Picture 1，并参考 Picture 2。",
      [picture(1), picture(2)]
    );

    expect(result.errors).toContain("当前 FLUX.2 Klein 4B 工作流最多支持 1 张 Picture。");
    expect(result.pictures).toHaveLength(1);
  });

  it("builds the official reference-latent sampler graph", () => {
    const task: ImageGenerationQueueTask = {
      id: "klein-task-1",
      taskType: "image-generation",
      status: "waiting",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      outputFilename: "KleinEdit-1",
      modelId: "flux2-klein-4b",
      workflowPath: "builtin:image/flux2-klein-4b",
      projectId: "klein-project-1",
      pictures: [picture(1)],
      imageOutputSubfolder: "Images",
      outputWidth: 1057,
      outputHeight: 895,
      prompt: "编辑 Picture 1。",
      promptVersion: 1,
      qualityProfile: "high-quality",
      outputFormat: "png",
      outputCount: 1,
      runs: []
    };
    const workflow = buildFlux2Klein4bWorkflow(task, {
      id: "klein-run-1",
      index: 0,
      seed: 42,
      status: "running"
    });

    expect(workflow.input?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.clip?.inputs).toMatchObject({
      clip_name: "qwen_3_4b.safetensors",
      type: "flux2",
      device: "cpu"
    });
    expect(workflow.scaledImage?.class_type).toBe("ImageScaleToTotalPixels");
    expect(workflow.positiveReference?.class_type).toBe("ReferenceLatent");
    expect(workflow.negativeReference?.class_type).toBe("ReferenceLatent");
    expect(workflow.scheduler?.inputs.steps).toBe(50);
    expect(workflow.guider?.inputs.cfg).toBe(4);
    expect(workflow.exactSize?.inputs.width).toBe(1057);
    expect(workflow.exactSize?.inputs.height).toBe(895);
    expect(workflow.save?.inputs.filename_prefix).toContain("Images/Flux2Klein_");
    expect(validateFlux2Klein4bWorkflow(workflow, "high-quality", true)).toEqual([]);
  });
});
