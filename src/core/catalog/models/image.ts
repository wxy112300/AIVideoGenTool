import {
  birefnetRequiredNodeTypes,
  flux2Klein4bRequiredNodeTypes,
  lamaInpaintRequiredNodeTypes,
  qwenImageEdit2511RequiredNodeTypes,
  qwenImageEdit2511CropStitchRequiredNodeTypes
} from "../../image-workflow.js";
import { component, entry, guide } from "./catalog-helpers.js";
import type { CatalogModelEntry } from "../types.js";

export const imageModelEntries: CatalogModelEntry[] = [
  entry({
    id: "birefnet-background-removal", family: "birefnet", category: "image", adapterId: "birefnet-background-removal", order: 120, inputModes: ["image"],
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
    id: "lama-inpaint", family: "lama", category: "image", adapterId: "lama-inpaint", order: 110, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1 },
    scan: { managedBy: "comfyui", vram: "轻量局部修补 · 原图尺寸", integrated: true, requiredCustomNodeIds: ["inpaint-nodes"], runtimeNodeTypes: lamaInpaintRequiredNodeTypes, components: [
      component("Big LaMa 局部修补模型", "inpaint/big-lama.pt", /inpaint\/big-lama\.pt$/i, guide("Sanster / Big LaMa", "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt", "inpaint", "big-lama.pt", "仅移除 Mask 覆盖内容并修复背景；无需 Prompt。"))
    ] }
  }, { name: "LaMa · 局部移除", badge: "单图 + Mask · 原图尺寸", description: "涂抹需要移除的区域，使用 Big LaMa 自动修复背景；不读取 Prompt。" }, { name: "LaMa · object removal", badge: "One image + mask · source size", description: "Remove masked content and reconstruct the background with Big LaMa. No prompt is sent." }, { name: "LaMa · 局部移除", badge: "單圖 + Mask · 原圖尺寸", description: "塗抹需要移除的區域，使用 Big LaMa 自動修復背景；不讀取 Prompt。" }),
  entry({
    id: "qwen-image-edit-2511", family: "qwen-image-edit", category: "image", adapterId: "qwen-image-edit-2511", promptPackId: "qwen-image-edit", order: 100, inputModes: ["image"],
    capabilities: { maxReferenceImages: 3, resolutions: [2160, 1152, 1080, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "INT8 + CPU/offload · 速度较慢", integrated: true, runtimeNodeTypes: qwenImageEdit2511RequiredNodeTypes, components: [
      component("Qwen Image Edit 2511 扩散模型", "diffusion_models/qwen_image_edit_2511_{bf16|int8_convrot|fp8mixed}.safetensors", /diffusion_models\/qwen_image_edit_2511_(?:bf16|int8_convrot|fp8mixed)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-Edit_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors", "diffusion_models", "qwen_image_edit_2511_int8_convrot.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", /text_encoders\/qwen_2\.5_vl_7b_fp8_scaled\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("Qwen Image VAE", "vae/qwen_image_vae.safetensors", /vae\/qwen_image_vae\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "vae", "qwen_image_vae.safetensors")),
      component("Qwen Image Edit 2511 Lightning LoRA（可选）", "loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", /loras\/Qwen-Image-Edit-2511-Lightning-4steps-V1\.0-bf16\.safetensors$/i, guide("lightx2v / Qwen-Image-Edit-2511-Lightning", "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors?download=true", "loras", "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "仅使用 Qwen Lightning 4 步质量档时需要。"), true)
    ] }
  }, { name: "Qwen-Image-Edit-2511 · 图片处理", badge: "最多 3 Picture · 原生质量", description: "Qwen 2511 多图编辑模型；使用 CPU 文本编码器、CPU VAE 和激进 DynamicVRAM 卸载。" }, { name: "Qwen-Image-Edit-2511 · image editing", badge: "Up to 3 pictures · native", description: "Qwen 2511 multi-image editing with CPU/offload-oriented runtime settings." }, { name: "Qwen-Image-Edit-2511 · 圖片處理", badge: "最多 3 Picture · 原生品質", description: "Qwen 2511 多圖編輯模型；使用 CPU 文字編碼器、CPU VAE 和積極 DynamicVRAM 卸載。" }),
  entry({
    id: "qwen-image-edit-2511-crop-stitch", family: "qwen-image-edit", category: "image", adapterId: "qwen-image-edit-2511-crop-stitch", promptPackId: "qwen-image-edit", order: 95, inputModes: ["image"],
    capabilities: { maxReferenceImages: 1, resolutions: [2160, 1152, 1080, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "Qwen 局部采样 · Crop/Stitch · 原图输出", integrated: true, requiredCustomNodeIds: ["inpaint-cropandstitch"], runtimeNodeTypes: qwenImageEdit2511CropStitchRequiredNodeTypes, components: [
      component("Qwen Image Edit 2511 扩散模型", "diffusion_models/qwen_image_edit_2511_{bf16|int8_convrot|fp8mixed}.safetensors", /diffusion_models\/qwen_image_edit_2511_(?:bf16|int8_convrot|fp8mixed)\.safetensors$/i, guide("Comfy-Org / Qwen-Image-Edit_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors", "diffusion_models", "qwen_image_edit_2511_int8_convrot.safetensors")),
      component("Qwen 2.5 VL 7B 文本编码器", "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", /text_encoders\/qwen_2\.5_vl_7b_fp8_scaled\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", "text_encoders", "qwen_2.5_vl_7b_fp8_scaled.safetensors")),
      component("Qwen Image VAE", "vae/qwen_image_vae.safetensors", /vae\/qwen_image_vae\.safetensors$/i, guide("Comfy-Org / Qwen-Image_ComfyUI", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors", "vae", "qwen_image_vae.safetensors"))
    ] }
  }, { name: "Qwen · 局部融合修复", badge: "单图 + Mask · Crop/Stitch", description: "只对 Mask 区域及其必要的边缘上下文进行局部重绘，再无缝拼回原图；未标记内容保持不变。需要安装 ComfyUI Inpaint Crop & Stitch 节点。" }, { name: "Qwen · Local fusion repair", badge: "One image + mask · Crop/Stitch", description: "Repaints only the masked area and the minimum context needed for natural blending, then stitches it back into the source image. Requires ComfyUI Inpaint Crop & Stitch." }, { name: "Qwen · 局部融合修復", badge: "單圖 + Mask · Crop/Stitch", description: "只對 Mask 區域及必要的邊緣上下文局部重繪，再無縫拼回原圖；未標記內容保持不變。需要安裝 ComfyUI Inpaint Crop & Stitch 節點。" }),
  entry({
    id: "flux2-klein-4b", family: "flux2-klein", category: "image", adapterId: "flux2-klein-4b", order: 90, inputModes: ["image"], capabilities: { maxReferenceImages: 1 },
    scan: { managedBy: "comfyui", vram: "FP8 · 单图编辑", integrated: true, runtimeNodeTypes: flux2Klein4bRequiredNodeTypes, components: [
      component("FLUX.2 Klein 4B FP8 扩散模型", "diffusion_models/flux-2-klein-base-4b-fp8.safetensors", /diffusion_models\/flux-2-klein-base-4b-fp8\.safetensors$/i, guide("Black Forest Labs / FLUX.2 Klein 4B FP8", "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors", "diffusion_models", "flux-2-klein-base-4b-fp8.safetensors")),
      component("Qwen3 4B FLUX.2 文本编码器", "text_encoders/qwen_3_4b.safetensors", /text_encoders\/qwen_3_4b\.safetensors$/i, guide("Comfy-Org / FLUX.2 Klein", "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors", "text_encoders", "qwen_3_4b.safetensors")),
      component("FLUX.2 VAE", "vae/flux2-vae.safetensors", /vae\/flux2-vae\.safetensors$/i, guide("Comfy-Org / FLUX.2", "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors", "vae", "flux2-vae.safetensors"))
    ] }
  }, { name: "FLUX.2 Klein 4B · 图片处理", badge: "FP8 · 单图编辑", description: "Black Forest Labs 的轻量图片生成/编辑模型；初版按官方 ComfyUI blueprint 接入单图编辑。" }, { name: "FLUX.2 Klein 4B · image editing", badge: "FP8 · single image", description: "A lightweight Black Forest Labs image generation/editing model integrated through the ComfyUI blueprint." }, { name: "FLUX.2 Klein 4B · 圖片處理", badge: "FP8 · 單圖編輯", description: "Black Forest Labs 的輕量圖片生成／編輯模型；初版依官方 ComfyUI blueprint 接入單圖編輯。" })
];
