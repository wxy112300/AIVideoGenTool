import {
  birefnetRequiredNodeTypes,
  flux2Klein4bRequiredNodeTypes,
  hidreamO1RequiredNodeTypes,
  lamaInpaintRequiredNodeTypes,
  minimaxH3ImageI2IRequiredNodeTypes,
  minimaxH3ReferenceEditRequiredNodeTypes,
  omnigen2RequiredNodeTypes,
  qwenImage21GgufRequiredNodeTypes,
  qwenImage21RequiredNodeTypes,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511CropStitchRequiredNodeTypes,
  zImageRequiredNodeTypes,
  zImageTurboRequiredNodeTypes
} from "../../image-workflow/node-requirements.js";
import { component, entry, guide } from "./catalog-helpers.js";
import {
  h3Fl2vaInt8Model,
  h3Fl2vaTurbo8LoraComponent,
  h3Fl2vaVideoVae,
  h3Nvfp4TextEncoder,
  h3Ref2vaInt8Model,
  h3Ref2vaTurbo8LoraComponent
} from "./minimax_h3_shared.js";
import type { CatalogModelEntry } from "../types.js";

export const imageModelEntries: CatalogModelEntry[] = [
  entry({
    id: "minimax-h3-image-i2i", family: "minimax-h3-image", category: "image", adapterId: "minimax-h3-image-i2i", order: 950, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1 },
    scan: { managedBy: "comfyui", vram: "H3 视频 VAE · 5 帧静态包 · Base 20 步 / Turbo 8 步", integrated: true, productGate: "open", productGateReason: "已开放正式测试；仍需目标 /object_info、节点加载和所选质量档资产", requiredCustomNodeIds: ["minimax-h3-image-studio"], runtimeNodeTypes: minimaxH3ImageI2IRequiredNodeTypes, components: [
      h3Fl2vaInt8Model,
      h3Nvfp4TextEncoder,
      h3Fl2vaVideoVae,
      h3Fl2vaTurbo8LoraComponent
    ] }
  }, {
    name: "H3 · 源图 I2I（FL2VA）", badge: "外部节点 · 1 Picture · 5 帧", description: "MiniMax H3 FL2VA 源图图像编辑；固定使用标准视频 VAE 的 5 帧静态包，Picture 1 是唯一源图，支持 Base 20 步与 FL2VA Turbo 8 步。"
  }, {
    name: "H3 · source I2I (FL2VA)", badge: "External node · 1 picture · 5 frames", description: "MiniMax H3 FL2VA anchored image editing. Uses a five-frame still packet through the standard video VAE; Picture 1 is the only source, with Base 20-step and FL2VA Turbo 8-step profiles."
  }, {
    name: "H3 · 源圖 I2I（FL2VA）", badge: "外部節點 · 1 Picture · 5 幀", description: "MiniMax H3 FL2VA 源圖圖片編輯；固定使用標準影片 VAE 的 5 幀靜態包，Picture 1 是唯一源圖，支援 Base 20 步與 FL2VA Turbo 8 步。"
  }),
  entry({
    id: "minimax-h3-reference-edit", family: "minimax-h3-image", category: "image", adapterId: "minimax-h3-reference-edit", order: 940, inputModes: ["image"],
    capabilities: { maxReferenceImages: 9 },
    scan: { managedBy: "comfyui", vram: "H3 视频 VAE · 5 帧静态包 · Base 20 步 / REF2VA Turbo 8 步", integrated: true, productGate: "open", productGateReason: "已开放正式测试；仍需目标 /object_info、节点加载和所选质量档资产", requiredCustomNodeIds: ["minimax-h3-image-studio"], runtimeNodeTypes: minimaxH3ReferenceEditRequiredNodeTypes, components: [
      h3Ref2vaInt8Model,
      h3Nvfp4TextEncoder,
      h3Fl2vaVideoVae,
      h3Ref2vaTurbo8LoraComponent
    ] }
  }, {
    name: "H3 · 参考编辑（REF2VA）", badge: "外部节点 · 1–9 Picture · 5 帧", description: "MiniMax H3 REF2VA 多参考图像编辑；Picture 1 为基准图，Picture 2–9 按稳定顺序作为角色、物体、姿态或风格参考，支持 Base 20 步与 REF2VA Turbo 8 步。"
  }, {
    name: "H3 · reference edit (REF2VA)", badge: "External node · 1–9 pictures · 5 frames", description: "MiniMax H3 REF2VA multi-reference image editing. Picture 1 is the base image; Pictures 2–9 remain in stable order for identity, object, pose, or style references, with Base 20-step and REF2VA Turbo 8-step profiles."
  }, {
    name: "H3 · 參考編輯（REF2VA）", badge: "外部節點 · 1–9 Picture · 5 幀", description: "MiniMax H3 REF2VA 多參考圖片編輯；Picture 1 為基準圖，Picture 2–9 按穩定順序作為角色、物體、姿態或風格參考，支援 Base 20 步與 REF2VA Turbo 8 步。"
  }),
  entry({
    id: "omnigen2", family: "omnigen2", category: "image", adapterId: "omnigen2", order: 900, inputModes: ["image"],
    capabilities: { maxReferenceImages: 2, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "FP16 · 4090 24GB · 20–50 步 · 约 1MP 参考编码", integrated: true, runtimeNodeTypes: omnigen2RequiredNodeTypes, components: [
      component(
        "OmniGen2 4B 扩散模型",
        "diffusion_models/omnigen2_fp16.safetensors",
        /diffusion_models[\\/]omnigen2_fp16\.safetensors$/i,
        guide(
          "Comfy-Org / Omnigen2_ComfyUI_repackaged",
          "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/omnigen2_fp16.safetensors",
          "diffusion_models",
          "omnigen2_fp16.safetensors",
          "官方 ComfyUI 原生 OmniGen2 扩散模型。"
        )
      ),
      component(
        "OmniGen2 Qwen 2.5 VL 文本编码器",
        "text_encoders/qwen_2.5_vl_fp16.safetensors",
        /text_encoders[\\/]qwen_2\.5_vl_fp16\.safetensors$/i,
        guide(
          "Comfy-Org / Omnigen2_ComfyUI_repackaged",
          "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/resolve/main/split_files/text_encoders/qwen_2.5_vl_fp16.safetensors",
          "text_encoders",
          "qwen_2.5_vl_fp16.safetensors",
          "官方 OmniGen2 Qwen 2.5 VL 文本编码器。"
        )
      ),
      component(
        "OmniGen2 AE VAE",
        "vae/ae.safetensors",
        /vae[\\/]ae\.safetensors$/i,
        guide(
          "Comfy-Org / Lumina_Image_2.0_Repackaged",
          "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors",
          "vae",
          "ae.safetensors",
          "官方 OmniGen2 模板使用的 AE VAE。"
        )
      )
    ] }
  }, {
    name: "OmniGen2 · 文生图/参考编辑", badge: "原生 · 20/50 步 · 最多 2 图", description: "OmniGen2 原生多模态图片工作流；无参考图走文生图，有参考图走 instruction edit/多图组合，支持标注引导、Mask 区域回填和裁剪输入。"
  }, {
    name: "OmniGen2 · text-to-image/reference edit", badge: "Native · 20/50 steps · up to 2 images", description: "Native OmniGen2 multimodal image workflow. Text-only prompts use T2I; one or two references use instruction editing or multi-image composition, with annotation guidance, mask compositing, and crop input support."
  }, {
    name: "OmniGen2 · 文生圖／參考編輯", badge: "原生 · 20/50 步 · 最多 2 圖", description: "OmniGen2 原生多模態圖片工作流；無參考圖走文生圖，有參考圖走 instruction edit／多圖組合，支援標註引導、Mask 區域回填和裁剪輸入。"
  }),
  entry({
    id: "hidream-o1-image", family: "hidream-o1", category: "image", adapterId: "hidream-o1-image", order: 800, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "FP8 scaled · 4090 24GB · Full 50 步", integrated: true, runtimeNodeTypes: hidreamO1RequiredNodeTypes, components: [
      component(
        "HiDream-O1-Image Full 扩散模型",
        "checkpoints/hidream_o1_image_{fp8_scaled|mxfp8|bf16}.safetensors",
        /checkpoints[\\/]hidream_o1_image_(?:fp8_scaled|mxfp8|bf16)\.safetensors$/i,
        guide(
          "Comfy-Org / HiDream-O1-Image",
          "https://huggingface.co/Comfy-Org/HiDream-O1-Image/resolve/main/checkpoints/hidream_o1_image_fp8_scaled.safetensors",
          "checkpoints",
          "hidream_o1_image_fp8_scaled.safetensors",
          "4090 优先使用 FP8 scaled；MXFP8/BF16 是可选精度变体。Full 模型用于编辑，官方建议 50 步。"
        )
      )
    ] }
  }, {
    name: "HiDream-O1-Image · 原生生成/参考编辑", badge: "FP8 · Full 50 步 · 2048", description: "HiDream-O1-Image 原生像素空间工作流；无参考图走文生图，有参考图走官方单图 instruction edit，支持 Mask 合成回填、标注引导和裁剪输入。"
  }, {
    name: "HiDream-O1-Image · native generation/reference edit", badge: "FP8 · Full 50 steps · 2048", description: "Native pixel-space HiDream-O1-Image workflow. Text-only prompts use T2I; one reference uses the official instruction-edit path, with mask compositing, annotation guidance, and crop input support."
  }, {
    name: "HiDream-O1-Image · 原生生成／參考編輯", badge: "FP8 · Full 50 步 · 2048", description: "HiDream-O1-Image 原生像素空間工作流；無參考圖走文生圖，有參考圖走官方單圖 instruction edit，支援 Mask 合成回填、標註引導和裁剪輸入。"
  }),
  entry({
    id: "birefnet-background-removal", family: "birefnet", category: "image", adapterId: "birefnet-background-removal", order: 200, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1 },
    scan: { managedBy: "comfyui", vram: "原生 BiRefNet · 单图 · 透明 PNG", integrated: true, runtimeNodeTypes: birefnetRequiredNodeTypes, components: [
      component(
        "BiRefNet 背景移除模型",
        "background_removal/birefnet.safetensors",
        /background_removal[\\/]birefnet\.safetensors$/i,
        guide(
          "Comfy-Org / BiRefNet",
          "https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors?download=true",
          "background_removal",
          "birefnet.safetensors",
          "ComfyUI 原生背景移除模型；输出带透明通道的 PNG。无需 SAM 或第三方节点。"
        )
      )
    ] }
  }, {
    name: "BiRefNet · 自动抠图", badge: "原生 · 透明 PNG", description: "ComfyUI 原生 BiRefNet 背景移除；单张图片自动分离人物或主体并输出透明 PNG，不读取 Prompt。"
  }, {
    name: "BiRefNet · background removal", badge: "Native · transparent PNG", description: "Native ComfyUI BiRefNet background removal. Separates a person or clear subject from one image and saves a transparent PNG without a prompt."
  }, {
    name: "BiRefNet · 自動摳圖", badge: "原生 · 透明 PNG", description: "ComfyUI 原生 BiRefNet 背景移除；單張圖片自動分離人物或主體並輸出透明 PNG，不讀取 Prompt。"
  }),
  entry({
    id: "lama-inpaint", family: "lama", category: "image", adapterId: "lama-inpaint", order: 100, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1 },
    scan: { managedBy: "comfyui", vram: "轻量局部修补 · 原图尺寸", integrated: true, requiredCustomNodeIds: ["inpaint-nodes"], runtimeNodeTypes: lamaInpaintRequiredNodeTypes, components: [
      component("Big LaMa 局部修补模型", "inpaint/big-lama.pt", /inpaint\/big-lama\.pt$/i, guide("Sanster / Big LaMa", "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt", "inpaint", "big-lama.pt", "仅移除 Mask 覆盖内容并修复背景；无需 Prompt。"))
    ] }
  }, { name: "LaMa · 局部移除", badge: "单图 + Mask · 原图尺寸", description: "涂抹需要移除的区域，使用 Big LaMa 自动修复背景；不读取 Prompt。" }, { name: "LaMa · object removal", badge: "One image + mask · source size", description: "Remove masked content and reconstruct the background with Big LaMa. No prompt is sent." }, { name: "LaMa · 局部移除", badge: "單圖 + Mask · 原圖尺寸", description: "塗抹需要移除的區域，使用 Big LaMa 自動修復背景；不讀取 Prompt。" }),
  entry({
    id: "z-image-turbo", family: "z-image", variant: "turbo", category: "image", adapterId: "z-image-turbo", order: 400, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "BF16 · 4090 24GB · 8 步", integrated: true, runtimeNodeTypes: zImageTurboRequiredNodeTypes, components: [
      component("Z-Image-Turbo 扩散模型", "diffusion_models/z_image_turbo_bf16.safetensors", /diffusion_models[\\/]z_image_turbo_bf16\.safetensors$/i, guide("Comfy-Org / z_image_turbo", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors", "diffusion_models", "z_image_turbo_bf16.safetensors")),
      component("Z-Image Qwen3 4B 文本编码器", "text_encoders/qwen_3_4b.safetensors", /text_encoders[\\/]qwen_3_4b\.safetensors$/i, guide("Comfy-Org / z_image_turbo", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors", "text_encoders", "qwen_3_4b.safetensors")),
      component("Z-Image AE VAE", "vae/ae.safetensors", /vae[\\/]ae\.safetensors$/i, guide("Comfy-Org / z_image_turbo", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors", "vae", "ae.safetensors")),
      component("Z-Image-Turbo Fun ControlNet Union（参考图可选）", "model_patches/Z-Image-Turbo-Fun-Controlnet-Union.safetensors", /model_patches[\\/]Z-Image-Turbo-Fun-Controlnet-Union\.safetensors$/i, guide("Alibaba PAI / Z-Image-Turbo-Fun-Controlnet-Union", "https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors", "model_patches", "Z-Image-Turbo-Fun-Controlnet-Union.safetensors", "仅在 Turbo 有参考图、标注或 Mask 时使用；无参考图的 8 步文生图不需要。"), true)
    ] }
  }, { name: "Z-Image-Turbo · 快速生成/参考控制", badge: "8 步 · T2I + 单图控制", description: "Z-Image-Turbo 的 8 步快速路径；无参考图直接文生图，有参考图使用官方 Fun ControlNet，可配合标注或 Mask。" }, { name: "Z-Image-Turbo · fast generation/control", badge: "8 steps · T2I + single-image control", description: "Fast 8-step Z-Image-Turbo generation. Text-only runs use the native path; reference runs use the official Fun ControlNet patch." }, { name: "Z-Image-Turbo · 快速生成／參考控制", badge: "8 步 · T2I + 單圖控制", description: "Z-Image-Turbo 的 8 步快速路徑；無參考圖直接文生圖，有參考圖使用官方 Fun ControlNet，可配合標註或 Mask。" }),
  entry({
    id: "z-image", family: "z-image", category: "image", adapterId: "z-image", order: 700, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "BF16 · 原生 30–40 步 · 4090 24GB", integrated: true, runtimeNodeTypes: zImageRequiredNodeTypes, components: [
      component("Z-Image 扩散模型", "diffusion_models/z_image_bf16.safetensors", /diffusion_models[\\/]z_image_bf16\.safetensors$/i, guide("Comfy-Org / z_image", "https://huggingface.co/Comfy-Org/z_image/resolve/main/split_files/diffusion_models/z_image_bf16.safetensors", "diffusion_models", "z_image_bf16.safetensors")),
      component("Z-Image Qwen3 4B 文本编码器", "text_encoders/qwen_3_4b.safetensors", /text_encoders[\\/]qwen_3_4b\.safetensors$/i, guide("Comfy-Org / z_image_turbo", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors", "text_encoders", "qwen_3_4b.safetensors")),
      component("Z-Image AE VAE", "vae/ae.safetensors", /vae[\\/]ae\.safetensors$/i, guide("Comfy-Org / z_image_turbo", "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors", "vae", "ae.safetensors"))
    ] }
  }, { name: "Z-Image · 原生生成/图生图", badge: "30–40 步 · T2I + img2img", description: "Z-Image 原生高质量路径；没有参考图时文生图，有参考图时按单图 img2img，带 Mask 时走原生 VAE Inpaint。" }, { name: "Z-Image · native generation/img2img", badge: "30–40 steps · T2I + img2img", description: "Native high-quality Z-Image path. Text-only prompts use T2I; one reference uses img2img, with optional native VAE inpainting." }, { name: "Z-Image · 原生生成／圖生圖", badge: "30–40 步 · T2I + img2img", description: "Z-Image 原生高品質路徑；沒有參考圖時文生圖，有參考圖時按單圖 img2img，帶 Mask 時走原生 VAE Inpaint。" }),
  entry({
    id: "qwen-image-2-1", family: "qwen-image", category: "image", adapterId: "qwen-image-2-1", promptPackId: "qwen-image-2-1", order: 1000, inputModes: ["image"],
    capabilities: { maxReferenceImages: 10 },
    scan: { managedBy: "comfyui", vram: "INT8 ConvRot + BF16 VAE · RTX 4090 24GB 目标 · 首期 1 MP，2K 待 smoke", integrated: true, runtimeNodeTypes: qwenImage21RequiredNodeTypes, components: [
      component("Qwen Image 2.1 扩散模型", "diffusion_models/qwen_image_2.1_{bf16|int8_convrot}.safetensors", /diffusion_models[\\/]qwen_image_2\.1_(?:bf16|int8_convrot)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-2.1", "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors", "diffusion_models", "qwen_image_2.1_int8_convrot.safetensors", "4090 优先使用官方 INT8 ConvRot；BF16 变体保留为可选精度路线。")),
      component("Qwen3-VL 8B 文本编码器", "text_encoders/qwen3vl_8b_{bf16|int8_convrot}.safetensors", /text_encoders[\\/]qwen3vl_8b_(?:bf16|int8_convrot)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-2.1", "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors", "text_encoders", "qwen3vl_8b_int8_convrot.safetensors", "与 2.1 扩散模型配套的 Qwen3-VL 8B；4090 优先使用 INT8 ConvRot。")),
      component("Qwen Image 2.1 VAE", "vae/qwen_image_2.1_vae_bf16.safetensors", /vae[\\/]qwen_image_2\.1_vae_bf16\.safetensors$/i, guide("Comfy-Org / Qwen-Image-2.1", "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors", "vae", "qwen_image_2.1_vae_bf16.safetensors"))
    ] }
  }, { name: "Qwen Image 2.1 · 官方文生图/图片编辑", badge: "原生 · T2I + 最多 10 图 · 25/40 步", description: "Qwen Image 2.1 官方 ComfyUI 统一路径：无参考图时走原生 T2I，有参考图时走最多 10 个图像输入的编辑路径；Paint 标注作为额外视觉引导，不是 Mask-conditioned inpaint。" }, { name: "Qwen Image 2.1 · official T2I/editing", badge: "Native · T2I + up to 10 images · 25/40 steps", description: "Unified official ComfyUI path for Qwen Image 2.1: text-only prompts use native T2I, while supplied images use the edit path with up to 10 image inputs. Paint annotations are visual guides, not mask-conditioned inpainting." }, { name: "Qwen Image 2.1 · 官方文生圖/圖片編輯", badge: "原生 · T2I + 最多 10 圖 · 25/40 步", description: "Qwen Image 2.1 官方 ComfyUI 統一路徑：無參考圖時走原生 T2I，有參考圖時走最多 10 個圖像輸入的編輯路徑；Paint 標註是額外視覺引導，不是 Mask-conditioned inpaint。" }),
  entry({
    id: "qwen-image-2-1-uncensored-gguf", family: "qwen-image", category: "image", adapterId: "qwen-image-2-1-uncensored-gguf", promptPackId: "qwen-image-2-1", order: 995, inputModes: ["image"],
    capabilities: { maxReferenceImages: 10 },
    scan: { managedBy: "comfyui", vram: "Q4_K_M/Q5_K_M/Q6_K GGUF + Qwen3-VL 8B · RTX 4090 24GB 目标 · Q4_K_M 默认", integrated: true, requiredCustomNodeIds: ["comfyui-gguf"], runtimeNodeTypes: qwenImage21GgufRequiredNodeTypes, components: [
      component("Qwen Image 2.1 Uncensored GGUF 扩散模型", "unet/qwen-image-2.1-{Q4_0|Q4_K_M|Q5_K_M|Q6_K}.gguf", /(?:^|[\\/])unet[\\/]qwen-image-2\.1-(?:Q4_0|Q4_K_M|Q5_K_M|Q6_K)\.gguf$/i, guide("abenzerps / Qwen-Image-2.1-Uncensored-GGUF", "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/resolve/main/qwen-image-2.1-Q4_K_M.gguf?download=true", "unet", "qwen-image-2.1-Q4_K_M.gguf", "4090 优先使用 Q4_K_M；Q5_K_M/Q6_K 可按显存和质量取舍。当前不登记 Q8_0：模型卡注明现阶段在 ComfyUI 采样存在 tensor shape mismatch。")),
      component("Qwen3-VL 8B 文本编码器", "text_encoders/qwen3vl_8b_{bf16|int8_convrot}.safetensors", /text_encoders[\\/]qwen3vl_8b_(?:bf16|int8_convrot)\.safetensors$/i, guide("abenzerps / Qwen-Image-2.1-Uncensored-GGUF", "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors?download=true", "text_encoders", "qwen3vl_8b_int8_convrot.safetensors", "与官方 Qwen Image 2.1 相同的 Qwen3-VL 8B 文本编码器；INT8 ConvRot 更适合 4090 的系统内存/显存平衡。")),
      component("Qwen Image 2.1 VAE", "vae/qwen_image_2.1_vae_bf16.safetensors", /vae[\\/]qwen_image_2\.1_vae_bf16\.safetensors$/i, guide("abenzerps / Qwen-Image-2.1-Uncensored-GGUF", "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors?download=true", "vae", "qwen_image_2.1_vae_bf16.safetensors"))
    ] }
  }, { name: "Qwen Image 2.1 · Uncensored GGUF", badge: "GGUF · Q4_K_M 默认 · T2I + 最多 10 图", description: "Qwen Image 2.1 的独立 GGUF 量化路径：无参考图走 T2I，有参考图复用官方多图编辑与 Paint 引导；需要维护版 ComfyUI-GGUF，模型卡当前不建议 Q8_0。" }, { name: "Qwen Image 2.1 · Uncensored GGUF", badge: "GGUF · Q4_K_M default · T2I + up to 10 images", description: "Independent GGUF quantized path for Qwen Image 2.1: text-only prompts use T2I, while references reuse the official multi-image edit and Paint guidance path. Requires the maintained ComfyUI-GGUF package; Q8_0 is currently excluded per the model card." }, { name: "Qwen Image 2.1 · Uncensored GGUF", badge: "GGUF · Q4_K_M 預設 · T2I + 最多 10 圖", description: "Qwen Image 2.1 的獨立 GGUF 量化路徑：無參考圖走 T2I，有參考圖復用官方多圖編輯與 Paint 引導；需要維護版 ComfyUI-GGUF，模型卡目前不建議 Q8_0。" }),
  entry({
    id: "qwen-image-edit-2511", family: "qwen-image-edit", category: "image", adapterId: "qwen-image-edit-2511", promptPackId: "qwen-image-edit", order: 500, inputModes: ["image"],
    capabilities: { maxReferenceImages: 3, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "INT8 + GPU VAE · RTX 4090", integrated: true, requiredCustomNodeIds: ["local-video-studio-h3-av"], runtimeNodeTypes: qwenImageEdit2511RequiredNodeTypes, components: [
      component("Qwen Image Edit 2511 扩散模型", "diffusion_models/qwen_image_edit_2511_{bf16|int8_convrot|fp8mixed}.safetensors", /diffusion_models\/qwen_image_edit_2511_(?:bf16|int8_convrot|fp8mixed)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-Edit_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors", "diffusion_models", "qwen_image_edit_2511_int8_convrot.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", /text_encoders\/qwen_2\.5_vl_7b_fp8_scaled\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("Qwen Image VAE", "vae/qwen_image_vae.safetensors", /vae\/qwen_image_vae\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "vae", "qwen_image_vae.safetensors")),
      component("Qwen Image Edit 2511 Lightning LoRA（可选）", "loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", /loras\/Qwen-Image-Edit-2511-Lightning-4steps-V1\.0-bf16\.safetensors$/i, guide("lightx2v / Qwen-Image-Edit-2511-Lightning", "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors?download=true", "loras", "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "仅使用 Qwen Lightning 4 步质量档时需要。"), true)
    ] }
  }, { name: "Qwen-Image-Edit-2511 · 图片处理", badge: "最多 3 Picture · 原生质量", description: "Qwen 2511 多图编辑模型；文本编码器可卸载，VAE 固定使用 GPU，不自动回退到 CPU。" }, { name: "Qwen-Image-Edit-2511 · image editing", badge: "Up to 3 pictures · native", description: "Qwen 2511 multi-image editing with model memory controls and GPU-only VAE execution." }, { name: "Qwen-Image-Edit-2511 · 圖片處理", badge: "最多 3 Picture · 原生品質", description: "Qwen 2511 多圖編輯模型；文字編碼器可卸載，VAE 固定使用 GPU，不自動回退到 CPU。" }),
  entry({
    id: "qwen-image-edit-2511-crop-stitch", family: "qwen-image-edit", category: "image", adapterId: "qwen-image-edit-2511-crop-stitch", promptPackId: "qwen-image-edit", order: 300, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "Qwen 局部采样 · GPU VAE · Crop/Stitch", integrated: true, requiredCustomNodeIds: ["local-video-studio-h3-av", "inpaint-cropandstitch"], runtimeNodeTypes: qwenImageEdit2511CropStitchRequiredNodeTypes, components: [
      component("Qwen Image Edit 2511 扩散模型", "diffusion_models/qwen_image_edit_2511_{bf16|int8_convrot|fp8mixed}.safetensors", /diffusion_models\/qwen_image_edit_2511_(?:bf16|int8_convrot|fp8mixed)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-Edit_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors", "diffusion_models", "qwen_image_edit_2511_int8_convrot.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", /text_encoders\/qwen_2\.5_vl_7b_fp8_scaled\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("Qwen Image VAE", "vae/qwen_image_vae.safetensors", /vae\/qwen_image_vae\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "vae", "qwen_image_vae.safetensors"))
    ] }
  }, { name: "Qwen · 局部融合修复", badge: "单图 + Mask · Crop/Stitch", description: "只对 Mask 区域及其必要的边缘上下文进行局部重绘，再无缝拼回原图；未标记内容保持不变。需要安装 ComfyUI Inpaint Crop & Stitch 节点。" }, { name: "Qwen · Local fusion repair", badge: "One image + mask · Crop/Stitch", description: "Repaints only the masked area and the minimum context needed for natural blending, then stitches it back into the source image. Requires ComfyUI Inpaint Crop & Stitch." }, { name: "Qwen · 局部融合修復", badge: "單圖 + Mask · Crop/Stitch", description: "只對 Mask 區域及必要的邊緣上下文局部重繪，再無縫拼回原圖；未標記內容保持不變。需要安裝 ComfyUI Inpaint Crop & Stitch 節點。" }),
  entry({
        id: "flux2-klein-4b", family: "flux2-klein", category: "image", adapterId: "flux2-klein-4b", order: 600, inputModes: ["image"], capabilities: { maxReferenceImages: 1, resolutions: [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "FP8 · 单图编辑", integrated: true, runtimeNodeTypes: flux2Klein4bRequiredNodeTypes, components: [
      component("FLUX.2 Klein 4B FP8 扩散模型", "diffusion_models/flux-2-klein-base-4b-fp8.safetensors", /diffusion_models\/flux-2-klein-base-4b-fp8\.safetensors$/i, guide("Black Forest Labs / FLUX.2 Klein 4B FP8", "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors", "diffusion_models", "flux-2-klein-base-4b-fp8.safetensors")),
      component("Qwen3 4B FLUX.2 文本编码器", "text_encoders/qwen_3_4b.safetensors", /text_encoders\/qwen_3_4b\.safetensors$/i, guide("Comfy-Org / FLUX.2 Klein", "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors", "text_encoders", "qwen_3_4b.safetensors")),
      component("FLUX.2 VAE", "vae/flux2-vae.safetensors", /vae\/flux2-vae\.safetensors$/i, guide("Comfy-Org / FLUX.2", "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors", "vae", "flux2-vae.safetensors"))
    ] }
  }, { name: "FLUX.2 Klein 4B · 图片处理", badge: "FP8 · 单图编辑", description: "Black Forest Labs 的轻量图片生成/编辑模型；初版按官方 ComfyUI blueprint 接入单图编辑。" }, { name: "FLUX.2 Klein 4B · image editing", badge: "FP8 · single image", description: "A lightweight Black Forest Labs image generation/editing model integrated through the ComfyUI blueprint." }, { name: "FLUX.2 Klein 4B · 圖片處理", badge: "FP8 · 單圖編輯", description: "Black Forest Labs 的輕量圖片生成／編輯模型；初版依官方 ComfyUI blueprint 接入單圖編輯。" })
];
