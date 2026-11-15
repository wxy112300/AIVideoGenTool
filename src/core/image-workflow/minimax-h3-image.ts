import type { ImageModelAdapter, ComfyApiWorkflow } from "./contracts.js";
import { compileImagePromptWithLimit, parseImageOutputs } from "./shared.js";
import { H3_IMAGE_ID, H3_IMAGE_MODEL, H3_IMAGE_VAE, H3_IMAGE_ENCODERS, H3_IMAGE_NODES, H3_IMAGE_W4A8_ID, H3_IMAGE_W4A8_MODEL } from "../minimax-h3-image-spec.js";

// Reviewed against ComfyUI 4d64a8bc nodes_minimax_h3.py and the official edit template.
export const minimaxH3ImageAdapter: ImageModelAdapter = {
  id: H3_IMAGE_ID, name: "MiniMax H3 Image", maxPictures: 16,
  supportedFormats: ["png"], requiresPrompt: true, supportsSeed: true,
  supportsTextOnly: true, supportsMask: false, supportsMarkup: false,
  supportsCustomOutputSize: true, customOutputMultiple: 32, outputMultiple: 32,
  textOnlyOutputWidth: 2048, textOnlyOutputHeight: 2048,
  qualityProfiles: [{ id: "native-6", label: "6 steps", steps: 6, cfg: 1, lightning: false }],
  compilePrompt(prompt, pictures, t) {
    const result = compileImagePromptWithLimit(prompt, pictures, 16, "MiniMax H3 Image", false, t);
    return { ...result, prompt: result.prompt.replace(/\bPicture (\d+)\b/gu, "<Picture $1>"),
      errors: [...result.errors, ...(!prompt.trim() ? ["MiniMax H3 Image: prompt required."] : []),
        ...(pictures.some(p => p.mask?.regionCount || p.markup?.objectCount) ? ["MiniMax H3 Image: Paint/Mask is unsupported."] : [])] };
  },
  buildWorkflow(task, run, t) {
    const compiled = this.compilePrompt(task.prompt, task.pictures, t);
    if (compiled.errors.length) throw new Error(compiled.errors.join(" "));
    if (task.qualityProfile !== "native-6" || task.imageLoras?.length) throw new Error("MiniMax H3 Image: use native-6 without LoRA.");
    const width = task.outputWidth || 2048, height = task.outputHeight || 2048;
    const graph: ComfyApiWorkflow = {
      model: { class_type: "UNETLoader", inputs: { unet_name: task.diffusionModelFilename || H3_IMAGE_MODEL, weight_dtype: "default" } },
      clip: { class_type: "CLIPLoader", inputs: { clip_name: H3_IMAGE_ENCODERS[0], type: "minimax", device: "default" } },
      vae: { class_type: "VAELoader", inputs: { vae_name: H3_IMAGE_VAE } },
      conditioning: { class_type: "MiniMaxH3ImageConditioning", inputs: { clip: ["clip", 0], vae: ["vae", 0], prompt: compiled.prompt, width, height } },
      negative: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["conditioning", 0] } },
      sampler: { class_type: "KSampler", inputs: { model: ["model", 0], positive: ["conditioning", 0], negative: ["negative", 0], latent_image: ["conditioning", 1], seed: run.seed, steps: 6, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
      decoded: { class_type: "VAEDecode", inputs: { samples: ["sampler", 0], vae: ["vae", 0] } },
      save: { class_type: "SaveImage", inputs: { images: ["decoded", 0], filename_prefix: [task.imageOutputSubfolder, `H3Image_${task.outputFilename}_${run.index + 1}`].filter(Boolean).join("/") } }
    };
    compiled.pictures.forEach((_picture, index) => {
      graph[`image-${index + 1}`] = { class_type: "LoadImage", inputs: { image: `{{IMAGE_${index}}}` } };
      graph.conditioning!.inputs[`images.image_${index + 1}`] = [`image-${index + 1}`, 0];
    });
    const errors = this.validateWorkflow(graph);
    if (errors.length) throw new Error(errors.join(" "));
    return graph;
  },
  validateWorkflow(graph, _quality, allowPlaceholders = true) {
    const errors = H3_IMAGE_NODES.filter(type => !Object.values(graph).some(n => n.class_type === type)).map(type => `MiniMax H3 Image: missing ${type}.`);
    const size = graph.conditioning?.inputs;
    if (!size || [size.width, size.height].some(v => typeof v !== "number" || !Number.isInteger(v) || v < 32 || v % 32 !== 0)) errors.push("MiniMax H3 Image: dimensions must be multiples of 32.");
    const sampler = graph.sampler?.inputs;
    if (!sampler || sampler.steps !== 6 || sampler.cfg !== 1 || sampler.sampler_name !== "euler" || sampler.scheduler !== "simple" || sampler.denoise !== 1) errors.push("MiniMax H3 Image: invalid sampling recipe.");
    if (Object.values(graph).filter(n => n.class_type === "LoadImage").length > 16) errors.push("MiniMax H3 Image: at most 16 images.");
    if (!allowPlaceholders && Object.values(graph).some(n => n.class_type === "LoadImage" && String(n.inputs.image).includes("{{"))) errors.push("MiniMax H3 Image: reference upload missing.");
    return errors;
  },
  validateRuntimeSchema(graph, info) {
    const errors: string[] = [];
    for (const node of Object.values(graph)) {
      const schema = info[node.class_type] as { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } } | undefined;
      if (!schema?.input) { errors.push(`MiniMax H3 Image: update ComfyUI 0.45.0+ (${node.class_type}).`); continue; }
      const sockets = { ...schema.input.required, ...schema.input.optional };
      for (const key of Object.keys(schema.input.required ?? {})) {
        if (!(key in node.inputs)) errors.push(`MiniMax H3 Image: missing ${node.class_type}.${key}.`);
      }
      for (const [key, value] of Object.entries(node.inputs)) {
        const spec = sockets[key];
        if (key.startsWith("images.image_") && node.class_type === "MiniMaxH3ImageConditioning" && sockets.images) continue;
        if (!spec) errors.push(`MiniMax H3 Image: unsupported ${node.class_type}.${key}.`);
        // Upload happens after schema validation; this enum only lists files
        // that were already on the server when object_info was requested.
        else if (node.class_type === "LoadImage" && key === "image" && typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/.test(value)) continue;
        else if (!Array.isArray(value) && Array.isArray(spec) && Array.isArray(spec[0]) && !spec[0].includes(value)) errors.push(`MiniMax H3 Image: unsupported ${node.class_type}.${key}=${String(value)}.`);
      }
    }
    return errors;
  },
  parseOutputs: parseImageOutputs
};

export const minimaxH3ImageW4a8Adapter: ImageModelAdapter = {
  ...minimaxH3ImageAdapter, id: H3_IMAGE_W4A8_ID, name: "MiniMax H3 Image · W4A8",
  buildWorkflow(task, run, t) {
    const graph = minimaxH3ImageAdapter.buildWorkflow({ ...task,
      diffusionModelFilename: task.diffusionModelFilename || H3_IMAGE_W4A8_MODEL
    }, run, t);
    // The low-VRAM recipe keeps NVFP4 encoder emulation off Ada's GPU path.
    graph.clip!.inputs.device = "cpu";
    return graph;
  }
};
