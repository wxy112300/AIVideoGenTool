import { describe, expect, it } from "vitest";
import {
  birefnetBackgroundRemovalCapability,
  birefnetRequiredNodeTypes,
  buildBirefnetBackgroundRemovalWorkflow,
  buildFlux2Klein4bWorkflow,
  applyH3ImageVramCleanup,
  buildMinimaxH3ImageI2IWorkflow,
  buildMinimaxH3ReferenceEditWorkflow,
  buildHiDreamO1Workflow,
  buildOmniGen2Workflow,
  buildZImageTurboWorkflow,
  buildZImageWorkflow,
  buildQwenImageEdit2511Workflow,
  buildQwenImageEdit2511CropStitchWorkflow,
  buildQwenImage21Workflow,
  buildQwenImage21GgufWorkflow,
  cachedImageProfileAllowsEnqueue,
  compileFlux2Klein4bPrompt,
  compileMinimaxH3ImageI2IPrompt,
  compileMinimaxH3ReferenceEditPrompt,
  compileHiDreamO1Prompt,
  compileOmniGen2Prompt,
  compileZImagePrompt,
  compileQwenImageEditPrompt,
  compileQwenImageEditCropStitchPrompt,
  compileQwenImage21Prompt,
  flux2Klein4bCapability,
  flux2Klein4bRequiredNodeTypes,
  hidreamO1Capability,
  hidreamO1RequiredNodeTypes,
  minimaxH3ImageI2ICapability,
  minimaxH3ImageI2IRequiredNodeTypes,
  minimaxH3ReferenceEditCapability,
  minimaxH3ReferenceEditRequiredNodeTypes,
  omnigen2Capability,
  omnigen2RequiredNodeTypes,
  zImageCapability,
  zImageRequiredNodeTypes,
  zImageTurboCapability,
  zImageTurboRequiredNodeTypes,
  firstSupportedImageModelId,
  imageLightningComponentFound,
  imageAspectRatioOptionsFor,
  imageMarkupPromptContext,
  imageOutputCandidateFromValue,
  imageOutputDimensions,
  h3ImageOutputDimensions,
  h3ImageRecipeFor,
  imageResolutionOptionsFor,
  normalizeImageAspectRatio,
  imageReferenceInputPath,
  buildLamaInpaintWorkflow,
  compileLamaInpaintInput,
  lamaInpaintCapability,
  normalizeImageTargetResolution,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511CropStitchRequiredNodeTypes,
  qwenImageEdit2511Capability,
  qwenImageEdit2511CropStitchCapability,
  qwenImage21Capability,
  qwenImage21UncensoredGgufCapability,
  qwenImage21GgufRequiredNodeTypes,
  qwenImage21GgufTextToImageRequiredNodeTypes,
  qwenImage21RequiredNodeTypes,
  qwenImage21TextToImageRequiredNodeTypes,
  renderImageWorkflow,
  validateFlux2Klein4bWorkflow,
  validateMinimaxH3ImageI2IWorkflow,
  validateMinimaxH3ImageRuntimeSchema,
  validateMinimaxH3ReferenceEditWorkflow,
  validateHiDreamO1Workflow,
  validateOmniGen2Workflow,
  validateZImageTurboWorkflow,
  validateZImageWorkflow,
  validateLamaInpaintWorkflow,
  validateQwenImageEdit2511Workflow,
  validateQwenImageEdit2511CropStitchWorkflow,
  validateQwenImage21RuntimeSchema,
  validateQwenImage21Workflow,
  validateQwenImage21GgufRuntimeSchema,
  validateQwenImage21GgufWorkflow,
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
  it("requires file/package readiness while allowing pending runtime evidence", () => {
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
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: true, missingCustomNodeIds: [], productGate: "locked"
    })).toBe(false);
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: true, missingCustomNodeIds: [], productGate: "open",
      runtimeVerified: false, runtimeReady: false
    })).toBe(true);
    expect(cachedImageProfileAllowsEnqueue({
      category: "image", integrated: true, available: true, missingCustomNodeIds: [], productGate: "open",
      runtimeVerified: true, runtimeReady: true
    })).toBe(true);
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

describe("MiniMax H3 image workflows", () => {
  const run = { id: "h3-image-run", index: 0, seed: 17, status: "running" as const };
  const imageTask = (
    modelId: "minimax-h3-image-i2i" | "minimax-h3-reference-edit",
    qualityProfile: string,
    pictures: ImageReference[],
    extra: Partial<ImageGenerationQueueTask> = {}
  ): ImageGenerationQueueTask => ({
    id: `task-${modelId}`,
    taskType: "image-generation",
    status: "waiting",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    outputFilename: "H3Image-test",
    projectId: "project",
    pictures,
    prompt: "Change the jacket color while preserving the subject.",
    promptVersion: 1,
    modelId,
    workflowPath: `builtin:image/${modelId}`,
    qualityProfile,
    outputFormat: "png",
    outputCount: 1,
    runs: [],
    ...extra
  });

  it("keeps FL2VA anchored to exactly Picture 1 and its own Turbo adapter", () => {
    expect(minimaxH3ImageI2ICapability).toMatchObject({
      id: "minimax-h3-image-i2i",
      maxPictures: 1,
      requiresPrompt: true,
      supportsMask: false,
      supportsMarkup: false
    });
    expect(minimaxH3ImageI2IRequiredNodeTypes).toEqual(
      expect.arrayContaining(["H3ImageToImagePrepare", "H3ImageFrameSelector", "SaveImage"])
    );
    expect(compileMinimaxH3ImageI2IPrompt("Brighten <Picture 1>.", [picture(1)]).errors)
      .toEqual([]);
    expect(compileMinimaxH3ImageI2IPrompt("Brighten <Picture 2>.", [picture(1)]).errors[0])
      .toContain("不存在的 Picture 2");
    expect(compileMinimaxH3ImageI2IPrompt("Brighten it.", [picture(1), picture(2)]).errors[0])
      .toContain("必须恰好包含一张 Picture 1");

    const workflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "fl2va-turbo-8", [picture(1)], {
        h3ImageOptions: {
          frameProfile: "recommended-5",
          frameSelection: "decode-recommended",
          sourceFit: "crop-center",
          referenceDetail: "match-generation-area",
          sourceFidelity: 0.8
        }
      }),
      run
    );
    expect(Object.values(workflow).map((node) => node.class_type)).toEqual(
      expect.arrayContaining([...minimaxH3ImageI2IRequiredNodeTypes, "LoraLoaderModelOnly"])
    );
    expect(workflow.model?.inputs.unet_name).toBe("minimax_h3_fl2va_pruned_int8_convrot.safetensors");
    expect(workflow.turbo?.inputs.lora_name).toBe("minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors");
    expect(workflow.prepare?.class_type).toBe("H3ImageToImagePrepare");
    expect(workflow.prepare?.inputs.source_fidelity).toBe(0.8);
    expect(workflow.selector?.inputs.strategy).toBe("decode_recommended");
    expect(workflow.save?.inputs.images).toEqual(["selector", 0]);
    expect(validateMinimaxH3ImageI2IWorkflow(workflow, "fl2va-turbo-8", true)).toEqual([]);
    expect(() => buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "unregistered-quality", [picture(1)]),
      run
    )).toThrow("H3 图片质量档 unregistered-quality 未登记");
  });

  it("releases the diffusion stack before H3ImageDecode when KJNodes is loaded", () => {
    const workflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "base-quality-20", [picture(1)]),
      run
    );
    expect(applyH3ImageVramCleanup(workflow, {})).toBe(false);
    expect(workflow.decode?.inputs.samples).toEqual(["sampler", 0]);

    expect(applyH3ImageVramCleanup(workflow, { VRAM_Debug: {} })).toBe(true);
    expect(workflow.vram_cleanup).toMatchObject({
      class_type: "VRAM_Debug",
      inputs: {
        empty_cache: true,
        gc_collect: true,
        unload_all_models: true,
        any_input: ["sampler", 0]
      }
    });
    expect(workflow.decode?.inputs.samples).toEqual(["vram_cleanup", 0]);
    expect(applyH3ImageVramCleanup(workflow, { VRAM_Debug: {} })).toBe(false);
  });

  it("keeps REF2VA Pictures ordered through nine sockets and uses the REF2VA adapter", () => {
    expect(minimaxH3ReferenceEditCapability).toMatchObject({
      id: "minimax-h3-reference-edit",
      maxPictures: 9,
      requiresPrompt: true,
      supportsMask: false,
      supportsMarkup: false
    });
    expect(minimaxH3ReferenceEditRequiredNodeTypes).toEqual(
      expect.arrayContaining(["H3ReferenceEditPrepare", "H3ImageFrameSelector", "SaveImage"])
    );
    const pictures = [
      picture(1),
      { ...picture(3), role: "style" as const, note: "lighting palette only" },
      { ...picture(8), role: "person" as const, note: "identity only" }
    ];
    const compiled = compileMinimaxH3ReferenceEditPrompt(
      "Use <Picture 8> for the face and <Picture 3> for lighting.",
      pictures
    );
    expect(compiled.errors).toEqual([]);
    expect(compiled.pictures.map((item) => item.pictureNumber)).toEqual([1, 3, 8]);
    expect(compiled.prompt).toContain("<Picture 3> (UI Picture 8) = person or identity; responsibility: identity only.");
    expect(compiled.prompt).toContain("<Picture 2> (UI Picture 3) = style or lighting; responsibility: lighting palette only.");
    expect(compiled.prompt).toContain("Use <Picture 3> for the face and <Picture 2> for lighting.");
    expect(compiled.runtimePictureNumberMap).toEqual([
      { visiblePictureNumber: 1, runtimePictureNumber: 1 },
      { visiblePictureNumber: 3, runtimePictureNumber: 2 },
      { visiblePictureNumber: 8, runtimePictureNumber: 3 }
    ]);
    expect(compiled.runtimeReferencedPictureNumbers).toEqual([2, 3]);

    const workflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", pictures),
      run
    );
    expect(workflow.model?.inputs.unet_name).toBe("minimax_h3_ref2va_pruned_int8_convrot.safetensors");
    expect(workflow.turbo?.inputs.lora_name).toBe("minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors");
    expect(workflow.prepare?.class_type).toBe("H3ReferenceEditPrepare");
    expect(workflow.prepare?.inputs.reference_image_2).toEqual(["reference_2", 0]);
    expect(workflow.prepare?.inputs.reference_image_3).toEqual(["reference_3", 0]);
    expect(workflow.prepare?.inputs.reference_image_8).toBeUndefined();
    expect(workflow.prepare?.inputs.reference_detail).toBe("match_generation_area");
    expect(validateMinimaxH3ReferenceEditWorkflow(workflow, "ref2va-turbo-8-768p", true)).toEqual([]);

    const missingRole = compileMinimaxH3ReferenceEditPrompt("Edit the image.", [
      picture(1),
      picture(2)
    ]);
    expect(missingRole.errors[0]).toContain("Picture 2 缺少参考职责");
  });

  it("keeps continuous runtime Picture numbers stable and maps the nine-image boundary once", () => {
    const pictures = Array.from({ length: 9 }, (_, index) => ({
      ...picture(index + 1),
      role: index === 0 ? "base" as const : "object" as const,
      ...(index === 0 ? {} : { note: `reference ${index + 1}` })
    }));
    const compiled = compileMinimaxH3ReferenceEditPrompt(
      "Use <Picture 2> and <Picture 9>.",
      pictures
    );
    expect(compiled.errors).toEqual([]);
    expect(compiled.prompt).toContain("Use <Picture 2> and <Picture 9>.");
    expect(compiled.runtimePictureNumberMap?.at(-1)).toEqual({
      visiblePictureNumber: 9,
      runtimePictureNumber: 9
    });
    expect(compiled.runtimeReferencedPictureNumbers).toEqual([2, 9]);
    const workflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", pictures),
      run
    );
    expect(Object.keys(workflow.prepare?.inputs ?? {})
      .filter((key) => key.startsWith("reference_image_")))
      .toEqual(Array.from({ length: 8 }, (_, index) => `reference_image_${index + 2}`));
    expect(validateMinimaxH3ReferenceEditWorkflow(workflow, "ref2va-turbo-8-768p", true)).toEqual([]);
  });

  it("recomputes only runtime slots after a sparse Picture is deleted and restored", () => {
    const base = picture(1);
    const style = { ...picture(3), role: "style" as const, note: "lighting only" };
    const identity = { ...picture(8), role: "person" as const, note: "identity only" };
    const initial = [base, style, identity];
    const afterDelete = [base, identity];
    const afterRestore = [base, style, identity];

    const deletedPrompt = compileMinimaxH3ReferenceEditPrompt(
      "Use <Picture 8> for identity.",
      afterDelete
    );
    expect(deletedPrompt.errors).toEqual([]);
    expect(deletedPrompt.runtimePictureNumberMap).toEqual([
      { visiblePictureNumber: 1, runtimePictureNumber: 1 },
      { visiblePictureNumber: 8, runtimePictureNumber: 2 }
    ]);
    expect(deletedPrompt.prompt).toContain("Use <Picture 2> for identity.");
    const deletedWorkflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", afterDelete),
      run
    );
    expect(Object.keys(deletedWorkflow.prepare?.inputs ?? {})
      .filter((key) => key.startsWith("reference_image_")))
      .toEqual(["reference_image_2"]);

    const restoredPrompt = compileMinimaxH3ReferenceEditPrompt(
      "Use <Picture 8> for identity and <Picture 3> for lighting.",
      afterRestore
    );
    expect(restoredPrompt.errors).toEqual([]);
    expect(restoredPrompt.runtimePictureNumberMap).toEqual([
      { visiblePictureNumber: 1, runtimePictureNumber: 1 },
      { visiblePictureNumber: 3, runtimePictureNumber: 2 },
      { visiblePictureNumber: 8, runtimePictureNumber: 3 }
    ]);
    expect(restoredPrompt.prompt).toContain("Use <Picture 3> for identity and <Picture 2> for lighting.");
    const restoredWorkflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", initial),
      run
    );
    expect(Object.keys(restoredWorkflow.prepare?.inputs ?? {})
      .filter((key) => key.startsWith("reference_image_")))
      .toEqual(["reference_image_2", "reference_image_3"]);
  });

  it("rejects REF2VA runtime reference socket holes", () => {
    const workflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", [
        picture(1),
        { ...picture(2), role: "style", note: "lighting" },
        { ...picture(3), role: "pose", note: "composition" }
      ]),
      run
    );
    const prepare = workflow.prepare;
    if (!prepare) throw new Error("test fixture did not build a REF2VA Prepare node");
    delete prepare.inputs.reference_image_2;
    expect(validateMinimaxH3ReferenceEditWorkflow(workflow, "ref2va-turbo-8-768p", true))
      .toContain("H3 REF2VA runtime reference sockets 必须从 reference_image_2 起连续，不能有空洞。");
  });

  it("uses frozen Base, FL2VA Turbo, and REF2VA Turbo recipes with a tested legacy fallback", () => {
    const baseFrozen = h3ImageRecipeFor(
      "minimax-h3-image-i2i",
      "base-quality-20",
      "frozen-base-checkpoint.safetensors"
    )!;
    const baseWorkflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "base-quality-20", [picture(1)], {
        diffusionModelFilename: "frozen-base-checkpoint.safetensors",
        h3ImageRecipe: baseFrozen
      }),
      run
    );
    expect(baseWorkflow.model?.inputs.unet_name).toBe("frozen-base-checkpoint.safetensors");
    expect(baseWorkflow.turbo).toBeUndefined();
    expect(validateMinimaxH3ImageI2IWorkflow(
      baseWorkflow,
      "base-quality-20",
      true,
      baseFrozen
    )).toEqual([]);

    const frozen = h3ImageRecipeFor(
      "minimax-h3-image-i2i",
      "fl2va-turbo-8",
      "frozen-fl2va-checkpoint.safetensors"
    )!;
    const workflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "fl2va-turbo-8", [picture(1)], {
        diffusionModelFilename: "frozen-fl2va-checkpoint.safetensors",
        h3ImageRecipe: frozen
      }),
      run
    );
    expect(workflow.model?.inputs.unet_name).toBe("frozen-fl2va-checkpoint.safetensors");
    expect(workflow.turbo?.inputs.lora_name).toBe(frozen.loraFilename);
    expect(workflow.sampling?.inputs.sampling_profile).toBe(frozen.samplingProfile);
    expect(validateMinimaxH3ImageI2IWorkflow(
      workflow,
      "fl2va-turbo-8",
      true,
      frozen
    )).toEqual([]);

    const historicalRecipe = {
      ...frozen,
      loraFilename: "historical-fl2va-turbo-adapter.safetensors"
    };
    const historicalWorkflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "fl2va-turbo-8", [picture(1)], {
        diffusionModelFilename: "frozen-fl2va-checkpoint.safetensors",
        h3ImageRecipe: historicalRecipe
      }),
      run
    );
    expect(historicalWorkflow.turbo?.inputs.lora_name).toBe(historicalRecipe.loraFilename);
    expect(validateMinimaxH3ImageI2IWorkflow(
      historicalWorkflow,
      "fl2va-turbo-8",
      true,
      historicalRecipe
    )).toEqual([]);

    const refFrozen = h3ImageRecipeFor(
      "minimax-h3-reference-edit",
      "ref2va-turbo-8-768p",
      "frozen-ref2va-checkpoint.safetensors"
    )!;
    const refWorkflow = buildMinimaxH3ReferenceEditWorkflow(
      imageTask("minimax-h3-reference-edit", "ref2va-turbo-8-768p", [
        picture(1),
        { ...picture(3), role: "style", note: "lighting only" }
      ], {
        diffusionModelFilename: "frozen-ref2va-checkpoint.safetensors",
        h3ImageRecipe: refFrozen
      }),
      run
    );
    expect(refWorkflow.model?.inputs.unet_name).toBe("frozen-ref2va-checkpoint.safetensors");
    expect(refWorkflow.turbo?.inputs.lora_name).toBe(refFrozen.loraFilename);
    expect(validateMinimaxH3ReferenceEditWorkflow(
      refWorkflow,
      "ref2va-turbo-8-768p",
      true,
      refFrozen
    )).toEqual([]);

    const legacyWorkflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "base-quality-20", [picture(1)], {
        diffusionModelFilename: "legacy-custom-checkpoint.safetensors"
      }),
      run
    );
    expect(legacyWorkflow.model?.inputs.unet_name).toBe("legacy-custom-checkpoint.safetensors");
    expect(validateMinimaxH3ImageI2IWorkflow(legacyWorkflow, "base-quality-20", true)).toEqual([]);

    const crossRoute = h3ImageRecipeFor(
      "minimax-h3-reference-edit",
      "ref2va-turbo-8-768p",
      "wrong-route.safetensors"
    )!;
    expect(() => buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "fl2va-turbo-8", [picture(1)], {
        diffusionModelFilename: "wrong-route.safetensors",
        h3ImageRecipe: crossRoute
      }),
      run
    )).toThrow("H3 图片冻结 recipe 校验失败");

    const corrupt = { ...frozen, samplingProfile: "corrupted sampling profile" };
    expect(() => buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "fl2va-turbo-8", [picture(1)], {
        diffusionModelFilename: "frozen-fl2va-checkpoint.safetensors",
        h3ImageRecipe: corrupt
      }),
      run
    )).toThrow("H3 图片冻结 recipe 校验失败");
  });

  it("calculates the fixed H3 canvas from source ratio on the 32-pixel grid", () => {
    for (const [width, height] of [[1920, 1080], [1080, 1920], [1024, 1024]] as const) {
      const [outputWidth, outputHeight] = h3ImageOutputDimensions(width, height);
      expect(outputWidth % 32).toBe(0);
      expect(outputHeight % 32).toBe(0);
      expect(outputWidth / outputHeight).toBeCloseTo(width / height, 0.1);
      expect(outputWidth * outputHeight).toBeGreaterThan(900_000);
      expect(outputWidth * outputHeight).toBeLessThan(1_150_000);
    }
  });

  it("fails closed when a runtime H3 enum is absent or does not contain the used value", () => {
    const workflow = buildMinimaxH3ImageI2IWorkflow(
      imageTask("minimax-h3-image-i2i", "base-quality-20", [picture(1)]),
      run
    );
    const objectInfo: Record<string, unknown> = {
      UNETLoader: { input: { required: { unet_name: [["minimax_h3_fl2va_pruned_int8_convrot.safetensors"]], weight_dtype: [["default"]] } } },
      CLIPLoader: { input: { required: { clip_name: [["qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"],], type: [["minimax"]], device: [["default"]] } } },
      VAELoader: { input: { required: { vae_name: [["minimax_h3_video_vae_fp16.safetensors"]] } } },
      LoadImage: { input: { required: { image: "STRING" } } },
      H3ImageResolutionPreset: { input: { required: { aspect_ratio: [["source image"]], resolution_profile: [["native detail | 0.98 MP"]], source_image: "IMAGE" } } },
      H3ImageToImagePrepare: { input: { required: { clip: "CLIP", vae: "VAE", source_image: "IMAGE", edit_instruction: "STRING", width: "INT", height: "INT", quality_profile: [["recommended | 5 frames"]], source_fidelity: "FLOAT", source_fit: [["crop_center", "contain_pad", "stretch"]], optimize_for_still: "BOOLEAN" } } },
      RandomNoise: { input: { required: { noise_seed: "INT" } } },
      BasicGuider: { input: { required: { model: "MODEL", conditioning: "CONDITIONING" } } },
      H3ImageSamplingPreset: { input: { required: { model: "MODEL", sampling_profile: [["base quality | RES 20 steps", "Turbo v1.0 | 8 steps", "REF2VA Turbo v1.0 768p | 8 steps"]] } } },
      SamplerCustomAdvanced: { input: { required: { noise: "NOISE", guider: "GUIDER", sampler: "SAMPLER", sigmas: "SIGMAS", latent_image: "LATENT" } } },
      H3ImageDecode: { input: { required: { samples: "LATENT", vae: "VAE" } } },
      H3ImageFrameSelector: { input: { required: { frames: "IMAGE", strategy: [["decode_recommended"]], manual_index: "INT", skip_first_frames: "INT", candidate_start: "FLOAT", candidate_end: "FLOAT", similarity_weight: "FLOAT", top_k: "INT", source_image: "IMAGE", recommended_index: "INT" } } },
      SaveImage: { input: { required: { images: "IMAGE", filename_prefix: "STRING" } } }
    };
    expect(validateMinimaxH3ImageRuntimeSchema(workflow, objectInfo)).toEqual([]);
    const invalidSchema = {
      ...objectInfo,
      H3ImageSamplingPreset: { input: { required: { model: "MODEL", sampling_profile: [["legacy"]] } } }
    };
    expect(validateMinimaxH3ImageRuntimeSchema(workflow, invalidSchema)).toContain(
      "H3ImageSamplingPreset.sampling_profile 不接受 base quality | RES 20 steps。"
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
      deterministic: true,
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

describe("Z-Image generation and reference workflow contract", () => {
  const run = { id: "run", index: 0, seed: 7, status: "running" as const };

  it("supports text-only generation with the official native graph", () => {
    expect(zImageCapability).toMatchObject({
      maxPictures: 1,
      supportsTextOnly: true,
      supportsMask: true,
      supportsMarkup: true
    });
    expect(zImageRequiredNodeTypes).toEqual(
      expect.arrayContaining(["EmptySD3LatentImage", "CLIPTextEncode", "VAEEncodeForInpaint"])
    );
    const workflow = buildZImageWorkflow({
      id: "z-image-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "ZImage-test", projectId: "project", pictures: [],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "A quiet mountain village at dawn.", promptVersion: 1, modelId: "z-image",
      workflowPath: "builtin:image/z-image", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);

    expect(workflow.input).toBeUndefined();
    expect(workflow.latent?.class_type).toBe("EmptySD3LatentImage");
    expect(workflow.sampler?.inputs.steps).toBe(30);
    expect(validateZImageWorkflow(workflow)).toEqual([]);
  });

  it("routes a reference and saved mask through the Base inpaint graph", () => {
    const masked = {
      ...picture(1),
      mask: {
        documentPath: "mask.fabric.json",
        maskPath: "mask.png",
        revision: 1,
        regionCount: 1,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }
    };
    const workflow = buildZImageWorkflow({
      id: "z-image-mask-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "ZImage-mask", projectId: "project", pictures: [masked],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "Replace the marked sign with a wooden door.", promptVersion: 1, modelId: "z-image",
      workflowPath: "builtin:image/z-image", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);
    expect(workflow.source?.class_type).toBe("VAEEncodeForInpaint");
    expect(workflow.mask?.inputs.image).toBe("{{MASK_0}}");
    expect(validateZImageWorkflow(
      renderImageWorkflow(workflow, ["source.png"], ["mask.png"])
    )).toEqual([]);
  });

  it("uses one annotated visual guide instead of inventing a second picture", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "Only change the marked window.",
        revision: 2,
        objectCount: 1,
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    };
    const result = compileZImagePrompt("Add a flower box to Picture 1.", [marked]);
    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(1);
    expect(result.pictures[0]?.absolutePath).toBe("guide.png");
    expect(result.prompt).toContain("Annotation and Mask contract");
    expect(result.prompt).toContain("Only change the marked window.");
  });

  it("uses the official Turbo control patch only for reference runs", () => {
    expect(zImageTurboCapability.qualityProfiles[0]).toMatchObject({ steps: 8, cfg: 1 });
    expect(zImageTurboRequiredNodeTypes).toEqual(
      expect.arrayContaining(["Canny", "ModelPatchLoader", "ZImageFunControlnet", "ConditioningZeroOut"])
    );
    const baseTask: ImageGenerationQueueTask = {
      id: "z-turbo-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z",
      outputFilename: "ZImageTurbo-test", projectId: "project", pictures: [],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "A clean studio product photo.", promptVersion: 1, modelId: "z-image-turbo",
      workflowPath: "builtin:image/z-image-turbo", qualityProfile: "turbo-8",
      outputFormat: "png", outputCount: 1, runs: []
    };
    const textOnly = buildZImageTurboWorkflow(baseTask, run);
    expect(textOnly.patch).toBeUndefined();
    expect(validateZImageTurboWorkflow(textOnly)).toEqual([]);

    const reference = buildZImageTurboWorkflow({
      ...baseTask,
      pictures: [picture(1)],
      prompt: "Change the camera to a low angle while keeping the subject."
    }, run);
    expect(reference.patch?.inputs.name).toBe("Z-Image-Turbo-Fun-Controlnet-Union.safetensors");
    expect(reference.controlGuide?.class_type).toBe("Canny");
    expect(reference.control?.inputs.image).toEqual(["controlGuide", 0]);
    expect(validateZImageTurboWorkflow(
      renderImageWorkflow(reference, ["source.png"])
    )).toEqual([]);
  });

  it("provides a 1024 square fallback before a text-only source exists", () => {
    expect(imageOutputDimensions(0, 0, "source", 1024, 1024)).toEqual([1024, 1024]);
    expect(imageResolutionOptionsFor(0, 0, 1024, 1024)[0]).toMatchObject({
      label: "默认 · 1024×1024",
      width: 1024,
      height: 1024
    });
    expect(imageResolutionOptionsFor(0, 0, 1024, 1024).map((option) => option.value)).toEqual([
      "source",
      2160,
      1536,
      1152,
      1080,
      1024,
      768,
      720,
      640,
      480
    ]);
    expect(imageAspectRatioOptionsFor(0, 0, 1024, 1024).map((option) => option.value)).toEqual([
      "source",
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3"
    ]);
    expect(imageOutputDimensions(0, 0, 1024, 1024, 1024, "16:9")).toEqual([1824, 1024]);
    expect(normalizeImageAspectRatio("invalid")).toBe("source");
  });
});

describe("HiDream-O1-Image generation and reference workflow contract", () => {
  const run = { id: "run", index: 0, seed: 19, status: "running" as const };

  it("uses the native Full pixel-space graph for text-only generation", () => {
    expect(hidreamO1Capability).toMatchObject({
      maxPictures: 1,
      supportsTextOnly: true,
      supportsMask: true,
      supportsMarkup: true,
      textOnlyOutputWidth: 2048,
      textOnlyOutputHeight: 2048
    });
    expect(hidreamO1Capability.qualityProfiles[0]).toMatchObject({
      id: "native", steps: 50, cfg: 5
    });
    expect(hidreamO1RequiredNodeTypes).toEqual(expect.arrayContaining([
      "CheckpointLoaderSimple", "ModelNoiseScale", "HiDreamO1PatchSeamSmoothing",
      "EmptyHiDreamO1LatentImage", "SamplerCustom", "ImageCompositeMasked"
    ]));
    const workflow = buildHiDreamO1Workflow({
      id: "hidream-text-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      outputFilename: "HiDream-test", projectId: "project", pictures: [],
      outputWidth: 2048, outputHeight: 2048,
      prompt: "A quiet mountain village at dawn.", promptVersion: 1, modelId: "hidream-o1-image",
      workflowPath: "builtin:image/hidream-o1-image", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);

    expect(workflow.input).toBeUndefined();
    expect(workflow.checkpoint?.inputs.ckpt_name).toBe("hidream_o1_image_fp8_scaled.safetensors");
    expect(workflow.scaledModel?.inputs.noise_scale).toBe(8);
    expect(workflow.seamSmoothing?.inputs.passes).toBe("ramp_2_4");
    expect(workflow.latent?.class_type).toBe("EmptyHiDreamO1LatentImage");
    expect(workflow.latent?.inputs.width).toBe(2048);
    expect(workflow.scheduler?.inputs.steps).toBe(50);
    expect(workflow.sampler?.inputs.cfg).toBe(5);
    expect(validateHiDreamO1Workflow(workflow)).toEqual([]);
  });

  it("routes one reference through the official autogrow input and keeps Mask compositing local", () => {
    const masked = {
      ...picture(1),
      mask: {
        documentPath: "mask.fabric.json",
        maskPath: "mask.png",
        revision: 1,
        regionCount: 1,
        updatedAt: "2026-08-25T00:00:00.000Z"
      }
    };
    const workflow = buildHiDreamO1Workflow({
      id: "hidream-mask-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      outputFilename: "HiDream-mask", projectId: "project", pictures: [masked],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "Replace the marked sign with a wooden door.", promptVersion: 1, modelId: "hidream-o1-image",
      workflowPath: "builtin:image/hidream-o1-image", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);

    expect(workflow.input?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.reference?.inputs["images.image_1"]).toEqual(["input", 0]);
    expect(workflow.sampler?.inputs.positive).toEqual(["reference", 0]);
    expect(workflow.sampler?.inputs.negative).toEqual(["reference", 1]);
    expect(workflow.mask?.inputs.image).toBe("{{MASK_0}}");
    expect(workflow.composite?.class_type).toBe("ImageCompositeMasked");
    expect(workflow.composite?.inputs.destination).toEqual(["sourceImage", 0]);
    expect(workflow.composite?.inputs.source).toEqual(["exactSize", 0]);
    expect(workflow.composite?.inputs.mask).toEqual(["mask", 0]);
    expect(workflow.save?.inputs.images).toEqual(["composite", 0]);
    expect(validateHiDreamO1Workflow(
      renderImageWorkflow(workflow, ["source.png"], ["mask.png"])
    )).toEqual([]);
  });

  it("uses one rendered annotation guide when there is no binary Mask", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "Only change the marked window.",
        revision: 2,
        objectCount: 1,
        updatedAt: "2026-08-25T00:00:00.000Z"
      }
    };
    const result = compileHiDreamO1Prompt("Add a flower box to Picture 1.", [marked]);
    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(1);
    expect(result.pictures[0]?.absolutePath).toBe("guide.png");
    expect(result.prompt).toContain("HiDream-O1-Image reference and local-edit contract");
    expect(result.prompt).toContain("Only change the marked window.");
  });
});

describe("OmniGen2 generation and multi-reference workflow contract", () => {
  const run = { id: "run", index: 0, seed: 29, status: "running" as const };

  it("uses the official dual-guidance T2I graph without a reference image", () => {
    expect(omnigen2Capability).toMatchObject({
      id: "omnigen2",
      maxPictures: 2,
      supportsTextOnly: true,
      supportsMask: true,
      supportsMarkup: true
    });
    expect(omnigen2Capability.qualityProfiles[0]).toMatchObject({
      id: "native", steps: 20, cfg: 5, imageGuidance: 2
    });
    expect(omnigen2RequiredNodeTypes).toEqual(expect.arrayContaining([
      "UNETLoader", "CLIPLoader", "ReferenceLatent", "DualCFGGuider", "SamplerCustomAdvanced"
    ]));
    const workflow = buildOmniGen2Workflow({
      id: "omnigen2-text-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      outputFilename: "OmniGen2-test", projectId: "project", pictures: [],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "A quiet mountain village at dawn.", promptVersion: 1, modelId: "omnigen2",
      workflowPath: "builtin:image/omnigen2", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);

    expect(workflow.input1).toBeUndefined();
    expect(workflow.clip?.inputs).toMatchObject({
      clip_name: "qwen_2.5_vl_fp16.safetensors", type: "omnigen2", device: "default"
    });
    expect(workflow.latent?.inputs).toMatchObject({ width: 1024, height: 1024 });
    expect(workflow.guider?.inputs).toMatchObject({
      cfg_conds: 5, cfg_cond2_negative: 2, style: "regular"
    });
    expect(workflow.scheduler?.inputs).toMatchObject({ scheduler: "simple", steps: 20, denoise: 1 });
    expect(validateOmniGen2Workflow(workflow)).toEqual([]);
  });

  it("chains two reference latents and composites a saved Mask over Picture 1", () => {
    const masked = {
      ...picture(1),
      mask: {
        documentPath: "mask.fabric.json",
        maskPath: "mask.png",
        revision: 1,
        regionCount: 1,
        updatedAt: "2026-08-25T00:00:00.000Z"
      }
    };
    const workflow = buildOmniGen2Workflow({
      id: "omnigen2-edit-task", taskType: "image-generation", status: "waiting",
      createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
      outputFilename: "OmniGen2-edit", projectId: "project", pictures: [masked, picture(2)],
      outputWidth: 1024, outputHeight: 1024,
      prompt: "Use Picture 1 as the base and transfer the object from Picture 2 into it.", promptVersion: 1, modelId: "omnigen2",
      workflowPath: "builtin:image/omnigen2", qualityProfile: "native",
      outputFormat: "png", outputCount: 1, runs: []
    }, run);

    expect(workflow.input1?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow.input2?.inputs.image).toBe("{{IMAGE_1}}");
    expect(workflow.scaledImage1?.inputs.megapixels).toBe(1);
    expect(workflow.positiveReference2?.inputs.conditioning).toEqual(["positiveReference1", 0]);
    expect(workflow.negativeReference2?.inputs.conditioning).toEqual(["negativeReference1", 0]);
    expect(workflow.latent?.inputs.width).toEqual(["imageSize", 0]);
    expect(workflow.mask?.inputs.image).toBe("{{MASK_0}}");
    expect(workflow.composite?.inputs.destination).toEqual(["sourceImage", 0]);
    expect(workflow.save?.inputs.images).toEqual(["composite", 0]);
    expect(validateOmniGen2Workflow(
      renderImageWorkflow(workflow, ["source.png", "object.png"], ["mask.png"])
    )).toEqual([]);
  });

  it("uses a rendered annotation guide without exceeding the two-picture native limit", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "Only change the marked window.",
        revision: 2,
        objectCount: 1,
        updatedAt: "2026-08-25T00:00:00.000Z"
      }
    };
    const result = compileOmniGen2Prompt("Add a flower box to Picture 1.", [marked]);
    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(1);
    expect(result.pictures[0]?.absolutePath).toBe("guide.png");
    expect(result.prompt).toContain("OmniGen2 reference and local-edit contract");
    expect(result.prompt).toContain("Only change the marked window.");
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

  it("offers common output presets and keeps the ratio independent from resolution", () => {
    expect(imageResolutionOptionsFor(2816, 1152).map((option) => option.value)).toEqual([
      "source",
      2160,
      1536,
      1152,
      1080,
      1024,
      768,
      720,
      640,
      480
    ]);
    expect(imageOutputDimensions(2816, 1152, 1080)).toEqual([2640, 1080]);
    expect(normalizeImageTargetResolution(2160, 2816, 1152)).toBe(2160);
    expect(imageOutputDimensions(2816, 1152, 1024, 0, 0, "16:9")).toEqual([1824, 1024]);
    expect(imageResolutionOptionsFor(1024, 1024).map((option) => option.value)).toEqual([
      "source",
      2160,
      1536,
      1152,
      1080,
      1024,
      768,
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
      },
      crop: {
        documentPath: "crop.json",
        croppedPath: "cropped.png",
        x: 10,
        y: 10,
        width: 800,
        height: 600,
        sourceWidth: 1024,
        sourceHeight: 768,
        revision: 1,
        updatedAt: "2026-08-11T00:00:00.000Z"
      }
    };

    const result = compileQwenImageEditPrompt("修复 Picture 1。", [marked]);

    expect(result.errors).toEqual([]);
    expect(result.pictures).toHaveLength(2);
    expect(result.pictures.map(imageReferenceInputPath)).toEqual(["cropped.png", "guide.png"]);
    expect(result.prompt).toContain("Visual annotation reference contract:");
    expect(result.prompt).toContain("Picture 1 is the clean source");
    expect(result.prompt).toContain("Picture 2 is only its temporary annotation guide");
    expect(result.prompt).toContain("Never reproduce any colored mark");
    expect(result.prompt).toContain("A：只移除红框内的水印");
    expect(imageMarkupPromptContext([picture(1)])).toBe("");
  });

  it("uses the non-destructive crop derivative as the workflow input", () => {
    expect(imageReferenceInputPath({
      absolutePath: "original.png",
      crop: {
        documentPath: "crop.json",
        croppedPath: "cropped.png",
        x: 12,
        y: 8,
        width: 640,
        height: 480,
        sourceWidth: 1280,
        sourceHeight: 960,
        revision: 1,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }
    })).toBe("cropped.png");
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
    expect(workflow.gpuVae).toMatchObject({
      class_type: "LocalVideoStudioRequireGpuVAE",
      inputs: { vae: ["vae", 0] }
    });
    for (const nodeId of ["positive", "negative", "source", "decoded"]) {
      expect(workflow[nodeId]?.inputs.vae).toEqual(["gpuVae", 0]);
    }
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
    expect(qwenImageEdit2511RequiredNodeTypes).toContain("LocalVideoStudioRequireGpuVAE");
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

describe("Qwen Image 2.1 official image-edit workflow contract", () => {
  const run = { id: "qwen-21-run", index: 0, seed: 42, status: "running" as const };
  const imageTask = (
    pictures: ImageReference[],
    extra: Partial<ImageGenerationQueueTask> = {}
  ): ImageGenerationQueueTask => ({
    id: "task-qwen-21",
    taskType: "image-generation",
    status: "waiting",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    outputFilename: "QwenImage21-test",
    projectId: "project-qwen-21",
    pictures,
    imageOutputSubfolder: "Images",
    outputWidth: 1024,
    outputHeight: 1024,
    prompt: "把 Picture 2 的衣服放到 Picture 1 的人物上，保留 Picture 1 的脸和姿势。",
    promptVersion: 1,
    modelId: "qwen-image-2-1",
    workflowPath: "builtin:image/qwen-image-2-1",
    qualityProfile: "preview-25",
    outputFormat: "png",
    outputCount: 1,
    runs: [],
    ...extra
  });

  it("registers the official native capability separately from Qwen 2511", () => {
    expect(qwenImage21Capability).toMatchObject({
      id: "qwen-image-2-1",
      maxPictures: 10,
      operation: "edit",
      requiresPrompt: true,
      supportsTextOnly: true,
      supportsMask: false,
      supportsMarkup: true,
      supportsMarkupReferenceGuide: true,
      textOnlyOutputWidth: 1024,
      textOnlyOutputHeight: 1024,
      sourceResolutionOnly: true,
      supportsCustomOutputSize: true,
      customOutputMultiple: 32
    });
    expect(qwenImage21Capability.qualityProfiles.map((profile) => [profile.id, profile.steps, profile.cfg])).toEqual([
      ["preview-25", 25, 1],
      ["native", 40, 1]
    ]);
    expect(qwenImage21RequiredNodeTypes).toEqual(expect.arrayContaining([
      "TextEncodeQwenImage21",
      "QwenImage21Cache",
      "ComfySwitchNode",
      "SaveImageAdvanced"
    ]));
    expect(qwenImage21TextToImageRequiredNodeTypes).toEqual(expect.arrayContaining([
      "TextEncodeQwenImage21",
      "EmptyLatentImage",
      "KSampler",
      "SaveImageAdvanced"
    ]));
  });

  it("registers the independent Uncensored GGUF capability and loader contract", () => {
    expect(qwenImage21UncensoredGgufCapability).toMatchObject({
      id: "qwen-image-2-1-uncensored-gguf",
      maxPictures: 10,
      supportsTextOnly: true,
      supportsCustomOutputSize: true,
      customOutputMultiple: 32
    });
    expect(qwenImage21GgufRequiredNodeTypes).toEqual(expect.arrayContaining([
      "UnetLoaderGGUF",
      "TextEncodeQwenImage21",
      "QwenImage21Cache",
      "SaveImageAdvanced"
    ]));
    expect(qwenImage21GgufTextToImageRequiredNodeTypes).toEqual(expect.arrayContaining([
      "UnetLoaderGGUF",
      "EmptyLatentImage",
      "KSampler",
      "SaveImageAdvanced"
    ]));
  });

  it("compiles stable Picture references to official image tokens", () => {
    const result = compileQwenImage21Prompt(
      "把 Picture 3 的人物放到 Picture 1 的场景中，并参考 Picture 3 的姿态。",
      [picture(1), picture(3)]
    );

    expect(result.errors).toEqual([]);
    expect(result.prompt).toContain("<image2>");
    expect(result.prompt).toContain("<image1>");
    expect(result.prompt).not.toContain("Picture 3 的人物");
    expect(result.referencedPictureNumbers).toEqual([1, 3]);
  });

  it("keeps Paint annotation guides as extra visual references, not masks", () => {
    const marked = {
      ...picture(1, "original.png"),
      markup: {
        documentPath: "guide.fabric.json",
        renderedPath: "guide.png",
        summary: "只修改红框内的标牌文字",
        revision: 1,
        objectCount: 1,
        updatedAt: "2026-09-20T00:00:00.000Z"
      }
    };
    const result = compileQwenImage21Prompt("编辑 Picture 1。", [marked]);

    expect(result.errors).toEqual([]);
    expect(result.pictures.map(imageReferenceInputPath)).toEqual(["original.png", "guide.png"]);
    expect(result.prompt).toContain("<image1> is the clean source");
    expect(result.prompt).toContain("<image2> is only its temporary annotation guide");
  });

  it("builds the official API graph with autogrow image sockets and cfg 1", () => {
    const workflow = buildQwenImage21Workflow(imageTask([picture(1), picture(3)], {
      prompt: "把 Picture 3 的衣服放到 Picture 1 的人物上，保留 Picture 1 的脸和姿势。"
    }), run);

    expect(workflow["image-picture-1"]?.inputs.image).toBe("{{IMAGE_0}}");
    expect(workflow["image-picture-3"]?.inputs.image).toBe("{{IMAGE_1}}");
    expect(workflow.positive?.class_type).toBe("TextEncodeQwenImage21");
    expect(workflow.positive?.inputs["images.image_1"]).toEqual(["image-picture-1", 0]);
    expect(workflow.positive?.inputs["images.image_2"]).toEqual(["image-picture-3", 0]);
    expect(workflow.positive?.inputs.negative_prompt).toBe("");
    expect(workflow.positive?.inputs.resolution).toBe(0);
    expect(workflow.cache).toMatchObject({
      class_type: "QwenImage21Cache",
      inputs: { device: "auto", dtype: "default" }
    });
    expect(workflow.sampler).toMatchObject({
      class_type: "KSampler",
      inputs: { cfg: 1, steps: 25, sampler_name: "euler", scheduler: "simple", denoise: 1 }
    });
    expect(workflow.sizeSwitch?.inputs.on_false).toEqual(["positive", 2]);
    expect(workflow.save).toMatchObject({
      class_type: "SaveImageAdvanced",
      inputs: { format: "png", "format.bit_depth": "8-bit", "format.input_color_space": "sRGB" }
    });
    expect(validateQwenImage21Workflow(workflow, "preview-25", true)).toEqual([]);
    expect(validateQwenImage21Workflow(renderImageWorkflow(workflow, ["target.png", "reference.png"]))).toEqual([]);
  });

  it("switches the official edit graph to a custom canvas when size is selected", () => {
    const workflow = buildQwenImage21Workflow(imageTask([picture(1)], {
      prompt: "Keep Picture 1 unchanged except for the requested lighting.",
      aspectRatio: "16:9",
      targetResolution: 720,
      outputWidth: 1280,
      outputHeight: 736
    }), run);

    expect(workflow.positive?.inputs.resolution).toBe(960);
    expect(workflow.sizeSwitch?.inputs).toMatchObject({
      on_true: ["empty", 0],
      switch: true
    });
    expect(workflow.empty?.inputs).toMatchObject({ width: 1280, height: 736, batch_size: 1 });
    expect(workflow.sampler?.inputs.latent_image).toEqual(["sizeSwitch", 0]);
    expect(validateQwenImage21Workflow(workflow, "preview-25", true)).toEqual([]);
  });

  it("uses the official T2I graph when no reference image is supplied", () => {
    const workflow = buildQwenImage21Workflow(imageTask([], {
      prompt: "A quiet mountain lake at sunrise, cinematic landscape photography."
    }), run);

    expect(Object.values(workflow).filter((node) => node.class_type === "LoadImage")).toHaveLength(0);
    expect(workflow.positive?.inputs).toMatchObject({
      negative_prompt: "",
      resolution: 1024
    });
    expect(workflow.positive?.inputs.vae).toBeUndefined();
    expect(Object.keys(workflow.positive?.inputs ?? {}).some((key) => key.startsWith("images."))).toBe(false);
    expect(workflow).not.toHaveProperty("sizeSwitch");
    expect(workflow).not.toHaveProperty("cache");
    expect(workflow.sampler?.inputs.model).toEqual(["model", 0]);
    expect(workflow.sampler?.inputs.latent_image).toEqual(["empty", 0]);
    expect(workflow.empty?.inputs).toMatchObject({ width: 1024, height: 1024, batch_size: 1 });
    expect(validateQwenImage21Workflow(workflow, "preview-25", true)).toEqual([]);
  });

  it("uses the GGUF T2I graph without requiring a reference image", () => {
    const workflow = buildQwenImage21GgufWorkflow(imageTask([], {
      modelId: "qwen-image-2-1-uncensored-gguf",
      workflowPath: "builtin:image/qwen-image-2-1-uncensored-gguf",
      prompt: "A quiet mountain lake at sunrise, cinematic landscape photography."
    }), run);

    expect(workflow.model).toMatchObject({
      class_type: "UnetLoaderGGUF",
      inputs: { unet_name: "qwen-image-2.1-Q4_K_M.gguf" }
    });
    expect(Object.values(workflow).filter((node) => node.class_type === "LoadImage")).toHaveLength(0);
    expect(workflow.sampler?.inputs.model).toEqual(["model", 0]);
    expect(validateQwenImage21GgufWorkflow(workflow, "preview-25", true)).toEqual([]);
    expect(validateQwenImage21GgufRuntimeSchema(
      { model: workflow.model! },
      { UnetLoaderGGUF: { input: { required: { unet_name: [["qwen-image-2.1-Q4_K_M.gguf"]] } } } }
    )).toEqual([]);
  });

  it("keeps the GGUF reference path compatible with the official multi-image graph", () => {
    const workflow = buildQwenImage21GgufWorkflow(imageTask([picture(1), picture(2)], {
      modelId: "qwen-image-2-1-uncensored-gguf",
      workflowPath: "builtin:image/qwen-image-2-1-uncensored-gguf"
    }), run);

    expect(workflow.model?.class_type).toBe("UnetLoaderGGUF");
    expect(workflow.cache?.class_type).toBe("QwenImage21Cache");
    expect(workflow.positive?.inputs["images.image_2"]).toEqual(["image-picture-2", 0]);
    expect(workflow.sizeSwitch?.inputs.on_false).toEqual(["positive", 2]);
    expect(validateQwenImage21GgufWorkflow(workflow, "preview-25", true)).toEqual([]);
  });

  it("uses the queued T2I canvas dimensions selected by the user", () => {
    const workflow = buildQwenImage21Workflow(imageTask([], {
      prompt: "A quiet mountain lake at sunrise, cinematic landscape photography.",
      outputWidth: 1280,
      outputHeight: 720
    }), run);

    expect(workflow.empty?.inputs).toMatchObject({ width: 1280, height: 720, batch_size: 1 });
    expect(workflow.sampler?.inputs.latent_image).toEqual(["empty", 0]);
    expect(validateQwenImage21Workflow(workflow, "preview-25", true)).toEqual([]);
  });

  it("opens the official ten-input edit capacity, including the tenth image socket", () => {
    const pictures = Array.from({ length: 10 }, (_, index) => picture(index + 1));
    const workflow = buildQwenImage21Workflow(imageTask(pictures, {
      prompt: "Combine the supplied images while preserving the requested subject relationships."
    }), run);

    expect(Object.values(workflow).filter((node) => node.class_type === "LoadImage")).toHaveLength(10);
    expect(workflow.positive?.inputs["images.image_10"]).toEqual(["image-picture-10", 0]);
    expect(validateQwenImage21Workflow(workflow, "preview-25", true)).toEqual([]);
  });

  it("accepts ComfyUI's dotted autogrow keys against the images input group", () => {
    const workflow = buildQwenImage21Workflow(imageTask([picture(1)], { prompt: "编辑 Picture 1。" }), run);
    const enumInputs = new Set([
      "UNETLoader.unet_name", "UNETLoader.weight_dtype",
      "CLIPLoader.clip_name", "CLIPLoader.type", "CLIPLoader.device",
      "VAELoader.vae_name", "QwenImage21Cache.device", "QwenImage21Cache.dtype",
      "KSampler.sampler_name", "KSampler.scheduler",
      "SaveImageAdvanced.format", "SaveImageAdvanced.format.bit_depth", "SaveImageAdvanced.format.input_color_space"
    ]);
    const objectInfo = Object.fromEntries(Object.values(workflow).map((node) => {
      if (node.class_type === "SaveImageAdvanced") {
        return [node.class_type, {
          input: {
            required: {
              images: ["IMAGE", {}],
              filename_prefix: ["STRING", {}],
              format: ["COMFY_DYNAMICCOMBO_V3", {
                options: [{
                  key: "png",
                  inputs: {
                    required: {
                      bit_depth: ["COMBO", { options: ["8-bit", "16-bit"] }],
                      input_color_space: ["COMBO", { options: ["sRGB"] }]
                    }
                  }
                }]
              }]
            }
          }
        }];
      }
      const required: Record<string, unknown> = {};
      for (const [inputName, inputValue] of Object.entries(node.inputs)) {
        const baseName = inputName.split(".", 1)[0]!;
        const key = `${node.class_type}.${baseName}`;
        required[baseName] = enumInputs.has(key) ? [[String(inputValue)]] : ["ANY"];
      }
      return [node.class_type, { input: { required } }];
    }));

    expect(validateQwenImage21RuntimeSchema(workflow, objectInfo)).toEqual([]);
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
