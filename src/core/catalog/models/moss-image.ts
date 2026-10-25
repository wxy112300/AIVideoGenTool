import type { CatalogModelComponent, CatalogModelEntry } from "../types.js";
import { component, entry, guide } from "./catalog-helpers.js";
import {
  MOSS_IMAGE_ID, MOSS_NSFW_ID, MOSS_IMAGE_MODEL, MOSS_NSFW_MODEL,
  MOSS_TEXT_ENCODER, MOSS_VAE, MOSS_REQUIRED_NODE_TYPES, MOSS_MINIMUM_COMFY_VERSION
} from "../../moss-image-spec.js";

const officialFiles: Record<string, { revision: string; bytes: number; sha256: string }> = {
  [MOSS_IMAGE_MODEL]: { revision: "df1af64f1dfac80d7e556168d969f0c4abe22c84", bytes: 5413698958,
    sha256: "b4d1475bc7eeffd7b809e82ea13a1fba1fb85c4e18365af3813722faa5c0fe4f" },
  [MOSS_TEXT_ENCODER]: { revision: "9df12d99a97c9818afc555125829f9ed40b87b24", bytes: 7343591088,
    sha256: "4cc6a1543ad2061806da46f35f90cadb4801dcba246c44782cf42ec0feb6407c" },
  [MOSS_VAE]: { revision: "f28da8f93449c16cfa7efa07dcd1303a1c0c44d1", bytes: 249521340,
    sha256: "d8d52ba036475f5fb07c8b435e176d3d97ebfa82f0d1a1c317f9cc1e25bd013b" }
};
function officialComponent(label: string, directory: string, filename: string): CatalogModelComponent {
  const identity = officialFiles[filename]!;
  return component(label, `${directory}/${filename}`,
    new RegExp(`${directory}[\\\\/]${filename.replace(/[.]/gu, "\\.")}$`, "i"),
    { ...guide("Comfy-Org / MOSS-Image", `https://huggingface.co/Comfy-Org/MOSS-Image/resolve/${identity.revision}/${directory}/${filename}`, directory, filename,
      "ComfyUI 官方 MOSS 模板权重；两个 MOSS 版本共用编码器与 VAE。"), ...identity, license: "Apache-2.0" });
}
const sharedComponents = [
  officialComponent("MOSS Qwen3.5 9B 文本编码器", "text_encoders", MOSS_TEXT_ENCODER),
  officialComponent("MOSS FLUX.2 VAE", "vae", MOSS_VAE)
];
const nsfwModel = component("PornMaster MOSS 扩散模型", `diffusion_models/${MOSS_NSFW_MODEL}`,
  /diffusion_models[\\/]pornmasterMoss_v1\.safetensors$/iu,
  { ...guide("iamddtla / PornMaster Moss V1", "https://civitai.com/api/download/models/3413227?fileId=3305738",
    "diffusion_models", MOSS_NSFW_MODEL,
    "成人向 SFT LoRA 合并 INT8 checkpoint；下载可能需要 Civitai 登录。遵守作者模型页许可：https://civitai.com/models/3008033 。作者工作流需要登录，当前采用官方 MOSS 配方，实际效果待验证。"),
    version: "V1", revision: "3413227", bytes: 5413723432,
    sha256: "1fef4582c4d052baa1d63195512e0483417cd813bb3a3842773fea25c2b5f568",
    license: "Civitai author permissions (model 3008033); no derivatives / attribution required" });

// Prioritize current primary generators using public evaluation evidence and use
// cases; keep the community derivative beside MOSS, without inheriting its scores.
// This navigation priority is not a shared, independently measured quality rank.
export const mossImageModelEntries: CatalogModelEntry[] = [
  entry({ id: MOSS_IMAGE_ID, family: "moss-image", category: "image", adapterId: MOSS_IMAGE_ID,
    promptPackId: "moss-image", order: 999, inputModes: ["image"],
    capabilities: { maxReferenceImages: 0, resolutions: [1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "4090 24GB · INT8 DiT + W4A8 编码器 · 25 / 50 步 · 建议约 1MP 起步", integrated: true,
      minimumComfyVersion: MOSS_MINIMUM_COMFY_VERSION, runtimeNodeTypes: MOSS_REQUIRED_NODE_TYPES,
      components: [officialComponent("MOSS SFT 扩散模型", "diffusion_models", MOSS_IMAGE_MODEL), ...sharedComponents] } },
    { name: "MOSS Image SFT · INT8", badge: "文生图 · 布局", description: "4090 主力候选：自然语言、标签与 JSON 布局生成，适合文字排版和对象布局。共用提示词增强、尺寸、Seed 与批量；不支持参考图、Paint、Mask 或透明输出。实际速度与画质待本机验证。" },
    { name: "MOSS Image SFT · INT8", badge: "Text to image · Layout", description: "4090 candidate: natural-language, tag and JSON layout generation. Supports prompt enhancement, size, seed and batch. No reference images, Paint, masks or alpha output. Local speed and quality remain unverified." },
    { name: "MOSS Image SFT · INT8", badge: "文生圖 · 佈局", description: "4090 主力候選：自然語言、標籤與 JSON 佈局生成，適合文字排版和物件佈局。共用提示詞增強、尺寸、Seed 與批次；不支援參考圖、Paint、Mask 或透明輸出。實際速度與畫質待本機驗證。" }),
  entry({ id: MOSS_NSFW_ID, family: "moss-image", category: "image", adapterId: MOSS_NSFW_ID,
    promptPackId: "moss-image", order: 998, inputModes: ["image"],
    capabilities: { maxReferenceImages: 0, resolutions: [1536, 1152, 1080, 1024, 768, 720, 640, 480] },
    scan: { managedBy: "comfyui", vram: "4090 24GB · INT8 · 共用 MOSS 编码器 / VAE · 25 / 50 步", integrated: true,
      minimumComfyVersion: MOSS_MINIMUM_COMFY_VERSION, runtimeNodeTypes: MOSS_REQUIRED_NODE_TYPES, components: [nsfwModel, ...sharedComponents] } },
    { name: "MOSS · PornMaster V1 · INT8", badge: "社区 · NSFW", description: "成人向社区候选：MOSS SFT 上合并作者训练的 LoRA，独立 INT8 权重。沿用文生图能力；不支持参考编辑。按来源、完整权重和兼容性筛选，尚无本机画质对比。" },
    { name: "MOSS · PornMaster V1 · INT8", badge: "Community · NSFW", description: "Adult-oriented community candidate: author-trained LoRAs merged into MOSS SFT, supplied as an INT8 checkpoint. Text to image only. Selected for provenance and compatibility; local comparative quality is unverified." },
    { name: "MOSS · PornMaster V1 · INT8", badge: "社群 · NSFW", description: "成人向社群候選：MOSS SFT 上合併作者訓練的 LoRA，獨立 INT8 權重。沿用文生圖能力；不支援參考編輯。依來源、完整權重和相容性篩選，尚無本機畫質比較。" })
];
