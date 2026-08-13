import { describe, expect, it } from "vitest";
import {
  birefnetBackgroundRemovalCapability,
  birefnetRequiredNodeTypes,
  buildBirefnetBackgroundRemovalWorkflow,
  buildFlux2Klein4bWorkflow,
  buildQwenImageEdit2511Workflow,
  buildQwenImageEdit2511CropStitchWorkflow,
  cachedImageProfileAllowsEnqueue,
  compileFlux2Klein4bPrompt,
  compileQwenImageEditPrompt,
  compileQwenImageEditCropStitchPrompt,
  flux2Klein4bCapability,
  flux2Klein4bRequiredNodeTypes,
  firstSupportedImageModelId,
  imageLightningComponentFound,
  imageMarkupPromptContext,
  imageOutputCandidateFromValue,
  imageOutputDimensions,
  imageResolutionOptionsFor,
  imageReferenceInputPath,
  buildLamaInpaintWorkflow,
  compileLamaInpaintInput,
  lamaInpaintCapability,
  normalizeImageTargetResolution,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511CropStitchRequiredNodeTypes,
  qwenImageEdit2511Capability,
  qwenImageEdit2511CropStitchCapability,
  renderImageWorkflow,
  validateFlux2Klein4bWorkflow,
  validateLamaInpaintWorkflow,
  validateQwenImageEdit2511Workflow,
  validateQwenImageEdit2511CropStitchWorkflow,
  validateBirefnetWorkflow
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

describe("image enqueue readiness", () => {
  it("requires an offline scan with model files and required node directories present", () => {
    expect(cachedImageProfileAllowsEnqueue(undefined)).toBe(false);
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: true, missingCustomNodeIds: []
    })).toBe(true);
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: false, missingCustomNodeIds: []
    })).toBe(false);
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: true, missingCustomNodeIds: ["inpaint-nodes"]
    })).toBe(false);
    expect(cachedImageProfileAllowsEnqueue({
      category: "video", integrated: true, available: true, missingCustomNodeIds: []
    })).toBe(false);
  });

  it("does not treat an image history source marker as a runnable model", () => {
    expect(firstSupportedImageModelId(
      "source",
      "flux2-klein-4b",
      "qwen-image-edit-2511"
    )).toBe("flux2-klein-4b");
    expect(firstSupportedImageModelId("source", "unknown-model")).toBe(
      "qwen-image-edit-2511"
    );
  });
});

describe("LaMa mask-only image workflow", () => {
  const maskedPicture = (): ImageReference => ({
    ...picture(1),
    mask: {
      documentPath: "mask.fabric.json",
      maskPath: "mask.png",
      revision: 1,
      regionCount: 2,
      updatedAt: "2026-08-13T00:00:00.000Z"
    }
  });

  it("requires a saved mask but no prompt", () => {
    expect(compileLamaInpaintInput("", [picture(1)]).errors).toContain(
      "请先在原图上绘制并保存 Mask。"
    );
    expect(compileLamaInpaintInput("", [maskedPicture()])).toMatchObject({
      prompt: "",
      errors: []
    });
    expect(lamaInpaintCapability).toMatchObject({
      maxPictures: 1,
      requiresPrompt: false,
      requiresMask: true,
      sourceResolutionOnly: true
    });
  });

  it("builds and renders separate source and mask inputs", () => {
    const task: ImageGenerationQueueTask = {
      id: "lama-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "LaMa-test", projectId: "project", pictures: [maskedPicture()],
      prompt: "", promptVersion: 1, modelId: "lama-inpaint",
      workflowPath: "builtin:image/lama-inpaint", qualityProfile: "natural",
      outputFormat: "png", outputCount: 1, runs: []
    };
    const workflow = buildLamaInpaintWorkflow(task, {
      id: "run", index: 0, seed: 7, status: "running"
    });
    expect(workflow.source?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.mask?.inputs.image).toBe("{{MASK_0}}");
    expect(workflow.inpainted?.inputs.image).toEqual(["source", 0]);
    expect(workflow.inpainted?.inputs.mask).toEqual(["expandedMask", 0]);
    expect(validateLamaInpaintWorkflow(
      renderImageWorkflow(workflow, ["source.png"], ["mask.png"])
    )).toEqual([]);
  });
});

describe("BiRefNet deterministic background-removal workflow", () => {
  it("is a single-image, promptless, source-sized deterministic operation", () => {
    expect(birefnetBackgroundRemovalCapability).toMatchObject({
      maxPictures: 1,
      deterministic: true,
      operation: "background-removal",
      requiresPrompt: false,
      supportsSeed: false,
      sourceResolutionOnly: true
    });
  });

  it("builds the native ComfyUI BiRefNet alpha workflow without SAM", () => {
    const task: ImageGenerationQueueTask = {
      id: "birefnet-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "BiRefNet-test", projectId: "project", pictures: [picture(1)],
      prompt: "", promptVersion: 1, modelId: "birefnet-background-removal",
      workflowPath: "builtin:image/birefnet-background-removal", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    };
    const workflow = buildBirefnetBackgroundRemovalWorkflow(task, {
      id: "run", index: 0, seed: 7, status: "running"
    });
    expect(Object.values(workflow).map((node) => node.class_type)).toEqual(
      expect.arrayContaining([...birefnetRequiredNodeTypes])
    );
    expect(workflow.input?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.backgroundModel?.inputs.bg_removal_name).toBe("birefnet.safetensors");
    expect(workflow.transparentImage?.inputs.alpha).toEqual(["alphaMask", 0]);
    expect(workflow.save?.inputs.images).toEqual(["transparentImage", 0]);
    expect(validateBirefnetWorkflow(renderImageWorkflow(workflow, ["source.png"]))).toEqual([]);
  });
});

describe("Qwen image edit workflow contract", () => {
  it("exposes a single-picture Crop/Stitch fusion capability", () => {
    expect(qwenImageEdit2511CropStitchCapability).toMatchObject({
      maxPictures: 1,
      operation: "harmonize",
      requiresPrompt: true,
      requiresMask: true,
      supportsSeed: true,
      sourceResolutionOnly: true
    });
    expect(qwenImageEdit2511CropStitchRequiredNodeTypes).toEqual(
      expect.arrayContaining(["InpaintCropImproved", "InpaintStitchImproved", "LoadImageMask"])
    );
  });

  it("adds a preservation contract without sending annotation markup as content", () => {
    const marked = {
      ...picture(1),
      mask: {
        documentPath: "mask.fabric.json",
        maskPath: "mask.png",
        revision: 1,
        regionCount: 1,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }
    };
    const result = compileQwenImageEditCropStitchPrompt(
      "修复 Picture 1 中合成边缘的光影和色温。",
      [marked]
    );
    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(1);
    expect(result.prompt).toContain("Fusion repair contract");
    expect(result.prompt).toContain("Preserve every unmasked pixel");
  });

  it("builds a local crop, Qwen sampler, and stitch graph", () => {
    const task: ImageGenerationQueueTask = {
      id: "fusion-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "Fusion-test", projectId: "project", pictures: [{
        ...picture(1),
        mask: {
          documentPath: "mask.fabric.json", maskPath: "mask.png", revision: 1,
          regionCount: 1, updatedAt: "2026-08-13T00:00:00.000Z"
        }
      }],
      diffusionModelFilename: "qwen_image_edit_2511_int8_convrot.safetensors",
      imageOutputSubfolder: "Images", outputWidth: 1024, outputHeight: 1024,
      prompt: "修复 Picture 1 的融合边缘。", promptVersion: 1,
      modelId: "qwen-image-edit-2511-crop-stitch",
      workflowPath: "builtin:image/qwen-image-edit-2511-crop-stitch",
      qualityProfile: "native", outputFormat: "png", outputCount: 1, runs: []
    };
    const workflow = buildQwenImageEdit2511CropStitchWorkflow(task, {
      id: "run", index: 0, seed: 12, status: "running"
    });
    expect(workflow.source?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.mask?.inputs.image).toBe("{{MASK_0}}");
    expect(workflow.crop?.class_type).toBe("InpaintCropImproved");
    expect(workflow.crop?.inputs.mask).toEqual(["mask", 0]);
    expect(workflow.stitched?.inputs.stitcher).toEqual(["crop", 0]);
    expect(workflow.stitched?.inputs.inpainted_image).toEqual(["cropOutput", 0]);
    expect(workflow.sampler?.inputs.steps).toBe(40);
    expect(validateQwenImageEdit2511CropStitchWorkflow(
      renderImageWorkflow(workflow, ["source.png"], ["mask.png"])
    )).toEqual([]);
  });

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

  it("keeps the clean source and sends markup as a separate location-only guide", () => {
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

    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(2);
    expect(result.pictures.map(imageReferenceInputPath)).toEqual(["original.png", "guide.png"]);
    expect(result.prompt).toContain("Visual annotation reference contract:");
    expect(result.prompt).toContain("Picture 1 is the clean source");
    expect(result.prompt).toContain("Picture 2 is only its temporary annotation guide");
    expect(result.prompt).toContain("Never reproduce any colored mark");
    expect(result.prompt).toContain("A：只移除红框内的水印");
    expect(imageMarkupPromptContext([picture(1)])).toBe("");
  });

  it("renumbers later clean references after an inserted markup guide", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "A：替换标记区域",
        revision: 1,
        objectCount: 1,
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    };

    const result = compileQwenImageEditPrompt(
      "把 Picture 2 的物体放到 Picture 1 的标记位置。",
      [marked, picture(2)]
    );

    expect(result.errors).toEqual([]);
    expect(result.prompt).toContain("把 Picture 3 的物体放到 Picture 1 的标记位置。");
    expect(result.pictures.map(imageReferenceInputPath)).toEqual([
      "original.png",
      "guide.png",
      "picture-2.png"
    ]);
  });

  it("reports when clean pictures plus markup guides exceed native inputs", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "A：替换标记区域",
        revision: 1,
        objectCount: 1,
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    };

    const result = compileQwenImageEditPrompt("编辑 Picture 1。", [
      marked,
      picture(2),
      picture(3)
    ]);

    expect(result.errors).toContain(
      "Canvas 标记会额外占用 1 个标注参考输入；当前 Qwen 2511 最多接收 3 张模型输入，请减少普通参考图或清除部分标记。"
    );
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
