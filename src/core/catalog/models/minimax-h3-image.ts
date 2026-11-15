import { component, entry, guide } from "./catalog-helpers.js";
import { H3_IMAGE_NODES, H3_IMAGE_W4A8_ID, H3_IMAGE_W4A8_MODEL } from "../../minimax-h3-image-spec.js";

// Official ComfyUI repack, queried 2026-11-11. Runtime evidence is separate.
const revision = "892de7cb61df49753bf15145a711154803a355cb";
const base = `https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/${revision}`;
const license = "MiniMax-H3-Image Community License Agreement";
function artifact(label: string, directory: string, filename: string, bytes: number, sha256: string) {
  return component(label, `${directory}/${filename}`,
    new RegExp(`${directory}[\\\\/]${filename.replace(/\./gu, "\\.")}$`, "iu"),
    { ...guide("Comfy-Org / MiniMax-H3-Image", `${base}/${directory}/${filename}`, directory, filename,
      "ComfyUI 0.45.0+. License: https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE"),
      revision, bytes, sha256, license });
}

const int8Encoder = artifact("H3 Qwen3-VL 32B INT8 encoder", "text_encoders",
  "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", 27141342152,
  "bc2ced0fbea64757fa9acddccfc0b3f4819d1dcf1da6c124d690d368be283923");
const fp4Encoder = artifact("H3 Qwen3-VL 32B NVFP4 AWQ encoder", "text_encoders",
  "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15687142551,
  "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6");

export const minimaxH3Image = entry({
  id: "minimax-h3-image", family: "minimax-h3-image", category: "image", retired: true,
  adapterId: "minimax-h3-image", promptPackId: "minimax-h3-image", order: 996, inputModes: ["image"],
  capabilities: { maxReferenceImages: 16 },
  scan: {
    managedBy: "comfyui", integrated: true, minimumComfyVersion: "0.45.0", runtimeNodeTypes: H3_IMAGE_NODES,
    vram: "INT8 · 6 steps · 4–20 MP · VRAM unverified",
    components: [
      artifact("MiniMax H3 Image INT8 diffusion model", "diffusion_models",
        "minimax_h3_image_pruned_int8_convrot.safetensors", 20979314802,
        "83eb140f1ff95c068f8a6886e6d3f3d0d4ab2e07bb2fe6d2ef992a51146ee622"),
      { ...int8Encoder, alternativeGroup: "h3-image-encoder" },
      { ...fp4Encoder, alternativeGroup: "h3-image-encoder" },
      artifact("MiniMax H3 Image FP16 VAE", "vae",
        "minimax_h3_image_vae_fp16.safetensors", 1168505312,
        "d80e9c2e5cfc9844869961ff5a58c9a9e52182df6bfb30b26018dd7f348721af")
    ]
  }
}, {
  name: "MiniMax H3 Image · INT8", badge: "6 步 · 最多 16 图",
  description: "官方文生图与多图编辑，原生 6 步、最多 16 张参考图，支持 4K 输出。需 ComfyUI 0.45.0+。",
  limitations: ["原生约 16MP；建议从 4MP 验证。实际显存、速度与画质待实测。"]
}, {
  name: "MiniMax H3 Image · INT8", badge: "6 steps · up to 16 images",
  description: "Official text-to-image and editing, 6 steps, up to 16 references and 4K output. Requires ComfyUI 0.45.0+.",
  limitations: ["Native output around 16 MP; start validation at 4 MP. Local memory, speed and quality remain unverified."]
}, {
  name: "MiniMax H3 Image · INT8", badge: "6 步 · 最多 16 圖",
  description: "官方文生圖與多圖編輯，原生 6 步、最多 16 張參考圖，支援 4K 輸出。需 ComfyUI 0.45.0+。",
  limitations: ["原生約 16MP；建議從 4MP 驗證。實際顯存、速度與畫質待實測。"]
});

const w4a8Revision = "35a0b704c06446f5292e3f50e03a5f5620496c2d";
export const minimaxH3ImageW4a8 = entry({
  ...minimaxH3Image.definition, id: H3_IMAGE_W4A8_ID, adapterId: H3_IMAGE_W4A8_ID, retired: false, order: 996.5,
  scan: {
    ...minimaxH3Image.definition.scan!,
    vram: "W4A8 + CPU NVFP4 AWQ · RTX 4090 · 2K/4K text-to-image tested",
    components: [
      component("MiniMax H3 Image W4A8 diffusion model", `diffusion_models/${H3_IMAGE_W4A8_MODEL}`,
        /diffusion_models[\\/]minimax_h3_image_pruned_w4a8\.safetensors$/iu,
        { ...guide("Comfy-Org / MiniMax-H3-Image", `https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/${w4a8Revision}/diffusion_models/${H3_IMAGE_W4A8_MODEL}`,
          "diffusion_models", H3_IMAGE_W4A8_MODEL, "ComfyUI 0.45.0+; CPU NVFP4 encoder. Local RTX 4090 2K/4K text-to-image tested; edit artifacts observed, multi-reference unverified."),
          revision: w4a8Revision, bytes: 12549794530,
          sha256: "517cc19b85348386f4df7c806dce80d839d0899e7cdaa3e1dbb09de964381dbb", license }),
      fp4Encoder,
      minimaxH3Image.definition.scan!.components[3]!
    ]
  }
}, {
  name: "MiniMax H3 Image · W4A8", badge: "4090 优先 · 6 步",
  description: "W4A8 + CPU NVFP4 编码器。4090 的 2K/4K 文生图已实测；编辑样例存在伪影。",
  limitations: ["本机整机内存峰值约 61GiB；多图编辑未实测。"]
}, {
  name: "MiniMax H3 Image · W4A8", badge: "4090 preferred · 6 steps",
  description: "W4A8 with CPU NVFP4 encoding. RTX 4090 2K/4K text-to-image tested; editing artifacts observed.",
  limitations: ["Observed whole-system RAM peak around 61GiB; multi-reference editing untested."]
}, {
  name: "MiniMax H3 Image · W4A8", badge: "4090 優先 · 6 步",
  description: "W4A8 + CPU NVFP4 編碼器。4090 的 2K/4K 文生圖已實測；編輯樣例存在偽影。",
  limitations: ["本機整機記憶體峰值約 61GiB；多圖編輯未實測。"]
});
