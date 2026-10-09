import { qwenImageEdit2511Capability, qwenImageDiffusionModel, qwenImageTextEncoder, qwenImageVae, qwenImageLightningLora } from "./capabilities.js";
import { qwenImageEdit2511RequiredNodeTypes, qwenImageEdit2511LightningNodeTypes } from "./node-requirements.js";
import { compileImagePromptWithLimit, exactImageDimension, imageReferenceInputs } from "./shared.js";
export function compileQwenImageEditPrompt(prompt, pictures) {
    return compileImagePromptWithLimit(prompt, pictures, qwenImageEdit2511Capability.maxPictures, "Qwen 2511", true);
}
export function validateQwenImageEdit2511Workflow(workflow, qualityProfile = "native", allowImagePlaceholders = false) {
    const nodeTypes = new Set(Object.values(workflow).map((node) => node.class_type));
    const required = [
        ...qwenImageEdit2511RequiredNodeTypes,
        ...(qualityProfile === "lightning-4step" ? qwenImageEdit2511LightningNodeTypes : [])
    ];
    const errors = required
        .filter((nodeType) => !nodeTypes.has(nodeType))
        .map((nodeType) => `图片工作流缺少节点 ${nodeType}。`);
    const inputNodes = Object.values(workflow).filter((node) => node.class_type === "LoadImage");
    if (inputNodes.length < 1 || inputNodes.length > qwenImageEdit2511Capability.maxPictures) {
        errors.push(`图片工作流必须包含 1–${qwenImageEdit2511Capability.maxPictures} 个 LoadImage 节点。`);
    }
    const unresolvedPlaceholders = Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{IMAGE_\d+\}\}$/u.test(value)));
    if (unresolvedPlaceholders.length && !allowImagePlaceholders) {
        errors.push("图片工作流仍包含未上传的 IMAGE 占位符。");
    }
    return [...new Set(errors)];
}
export function buildQwenImageEdit2511Workflow(task, run) {
    const compiled = compileQwenImageEditPrompt(task.prompt, task.pictures);
    if (compiled.errors.length) {
        throw new Error(compiled.errors.join(" "));
    }
    if (!compiled.pictures.length) {
        throw new Error("Qwen Image Edit 至少需要一张基础 Picture。");
    }
    const quality = qwenImageEdit2511Capability.qualityProfiles.find((profile) => profile.id === task.qualityProfile) ?? qwenImageEdit2511Capability.qualityProfiles[0];
    const pictureNodes = Object.fromEntries(compiled.pictures.map((picture, index) => [
        `image-${picture.id}`,
        {
            class_type: "LoadImage",
            inputs: { image: `{{IMAGE_${index}}}` }
        }
    ]));
    const positiveInputs = {
        clip: ["clip", 0],
        prompt: compiled.prompt,
        vae: ["gpuVae", 0],
        ...imageReferenceInputs(compiled.pictures, "image")
    };
    const negativeInputs = {
        clip: ["clip", 0],
        prompt: "",
        vae: ["gpuVae", 0],
        ...imageReferenceInputs(compiled.pictures, "image")
    };
    const outputWidth = exactImageDimension(task.outputWidth, compiled.pictures[0]?.width ?? 0);
    const outputHeight = exactImageDimension(task.outputHeight, compiled.pictures[0]?.height ?? 0);
    const outputPrefix = [
        task.imageOutputSubfolder?.replace(/[\\/]+/gu, "/").replace(/^\/+|\/+$/gu, ""),
        `QwenEdit_${task.outputFilename}_${run.index + 1}`
    ].filter(Boolean).join("/");
    const modelNode = {
        ...pictureNodes,
        clip: {
            class_type: "CLIPLoader",
            inputs: {
                clip_name: qwenImageTextEncoder,
                type: "qwen_image",
                device: "cpu"
            }
        },
        vae: {
            class_type: "VAELoader",
            inputs: { vae_name: qwenImageVae }
        },
        gpuVae: {
            class_type: "LocalVideoStudioRequireGpuVAE",
            inputs: { vae: ["vae", 0] }
        },
        model: {
            class_type: "UNETLoader",
            inputs: {
                unet_name: task.diffusionModelFilename || qwenImageDiffusionModel,
                weight_dtype: "default"
            }
        },
        positive: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: positiveInputs
        },
        negative: {
            class_type: "TextEncodeQwenImageEditPlus",
            inputs: negativeInputs
        },
        positiveReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["positive", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        negativeReference: {
            class_type: "FluxKontextMultiReferenceLatentMethod",
            inputs: {
                conditioning: ["negative", 0],
                reference_latents_method: "index_timestep_zero"
            }
        },
        sampling: {
            class_type: "ModelSamplingAuraFlow",
            inputs: {
                model: ["model", 0],
                shift: 3.1
            }
        },
        cfgNorm: {
            class_type: "CFGNorm",
            inputs: {
                model: quality.lightning ? ["lightningModel", 0] : ["sampling", 0],
                strength: 1
            }
        },
        sourceImage: {
            class_type: "FluxKontextImageScale",
            inputs: {
                image: [`image-${compiled.pictures[0]?.id ?? "missing"}`, 0]
            }
        },
        source: {
            class_type: "VAEEncode",
            inputs: {
                pixels: ["sourceImage", 0],
                vae: ["gpuVae", 0]
            }
        },
        sampler: {
            class_type: "KSampler",
            inputs: {
                model: quality.lightning
                    ? ["lightningModel", 0]
                    : ["cfgNorm", 0],
                positive: ["positiveReference", 0],
                negative: ["negativeReference", 0],
                latent_image: ["source", 0],
                seed: run.seed,
                steps: quality.steps,
                cfg: quality.cfg,
                sampler_name: "euler",
                scheduler: "simple",
                denoise: 1
            }
        },
        decoded: {
            class_type: "VAEDecode",
            inputs: {
                samples: ["sampler", 0],
                vae: ["gpuVae", 0]
            }
        },
        exactSize: {
            class_type: "ImageScale",
            inputs: {
                image: ["decoded", 0],
                upscale_method: "lanczos",
                width: outputWidth,
                height: outputHeight,
                crop: "disabled"
            }
        },
        save: {
            class_type: "SaveImage",
            inputs: {
                images: ["exactSize", 0],
                filename_prefix: outputPrefix
            }
        }
    };
    if (quality.lightning) {
        modelNode.lightningModel = {
            class_type: "LoraLoaderModelOnly",
            inputs: {
                model: ["sampling", 0],
                lora_name: qwenImageLightningLora,
                strength_model: 1
            }
        };
    }
    const validationErrors = validateQwenImageEdit2511Workflow(modelNode, quality.id, true);
    if (validationErrors.length)
        throw new Error(validationErrors.join(" "));
    return modelNode;
}
