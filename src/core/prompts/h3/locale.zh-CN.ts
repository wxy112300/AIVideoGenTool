import type { H3PromptPreset, H3ReferenceRole } from "../../../types.js";
import type { PromptPresetLocale, PromptSnippetLocale, PromptUiLocale } from "../types.js";

export const uiLocale: PromptUiLocale = {
  newVersion: "新建",
  previousVersion: "上一版提示词",
  nextVersion: "下一版提示词",
  enhanceMode: "扩写方式",
  sulphurNativeEnhance: "Sulphur 原生增强（推荐）",
  faithfulEnhance: "忠实扩写（需 Instruct 模型）",
  optimizing: "优化中…",
  optimizePrompt: "优化提示词",
  autoPrompt: "增强提示词",
  autoPromptHint: "当前提示词为空，将根据参考媒体随机设计一版动作与镜头。",
  autoPromptMissingMedia: "空 Prompt 自动起稿需要至少一份参考图片或视频。",
  annotationRevisionMissing: "批注修订需要至少一条批注，例如在目标句后添加（批注：把这里改成……）。",
  snippetPicker: "快速插入",
  snippetPlaceholder: "选择画质、镜头、动作、声音或对白预设",
  insertSnippet: "插入",
  extensionR2vTitle: "H3 R2V Motion Context（推荐）",
  extensionBoundaryTitle: "H3 结尾帧接续（兼容）",
  extensionR2vLatentDescription: "携带上一段最后 22 帧的运动与 32 kHz 音频；头部上下文会自动同步裁掉。已找到上一段 latent，将跳过有损重编码。 Spectrum 会被强制关闭。",
  extensionR2vFallbackDescription: "携带上一段最后 22 帧的运动与 32 kHz 音频；头部上下文会自动同步裁掉。当前使用像素/音频回退，完成后会保存 latent 供下一次接续。 Spectrum 会被强制关闭。",
  extensionBoundaryDescription: "从保留片段的最后一帧生成新段并保留 H3 原生音轨；不依赖额外节点，但边界动作可能发生变化。",
  manualEditVersion: "手动编辑",
  expandedVersion: "扩写 {count}",
  wordCount: "当前 {count} 词",
  wordCountGuidance: "当前 {count} 词 · 参考范围 {min}–{max} 词",
  imageWordCount: "当前 {count} 词",
  promptCheckTitle: "H3 提示词检查"
};

export const presetLocale: Record<H3PromptPreset, PromptPresetLocale> = {
  "official-storyboard": { label: "通用影视时间线", description: "按 H3 官方字段组织完整的视听时间线，适合一般视频请求。" },
  "detailed-cinematic": { label: "影视细节扩写", description: "在保留原意和参考素材的基础上，补全动作、镜头、画面、材质、光照、音效与时间线细节。" },
  "reference-faithful": { label: "参考画面保真", description: "减少无依据的画面补写，优先保护参考图中的身份、构图和连续性。" },
  "continuous-motion": { label: "单镜头连续动作", description: "把动作写成一个无剪辑的连续镜头，强调因果、身体力学和收束状态。" },
  "dialogue-sound": { label: "对白与原生声音", description: "优先处理对白、演唱、环境声、动作声和原生音乐的同步关系。" },
  "beat-storyboard": { label: "节拍分镜与镜头节奏", description: "按时长拆解镜头节拍、动作节点、转场、镜头运动和声音落点。" },
  "product-brand": { label: "产品与品牌演示", description: "保护产品、界面、品牌素材和文案的真实性，强调功能动作与清晰收尾。" },
  "music-video": { label: "音乐视频与歌词", description: "把歌曲、歌词、节拍、表演和空间化文字作为同一条时间线设计。" },
  "narrative-animation": { label: "风格化动画叙事", description: "强调角色锁定、因果故事、表演节奏、风格化运动和镜头连续性。" },
  "annotation-revision": { label: "批注修订", description: "把当前 Prompt 当作已确认稿件，只按（批注：……）等标记修改对应句子，其余内容保持不变。" },
  "multi-reference": { label: "多参考关系编排", description: "为 R2V 图片、视频和音频分配明确关系，并保持标签和复用关系稳定。" }
};

export const referenceRoleLocale: Record<H3ReferenceRole, string> = {
  subject: "人物 / 主体",
  scene: "场景 / 环境",
  style: "风格 / 服装",
  motion: "动作 / 姿态",
  camera: "镜头 / 构图",
  voice: "声音关联",
  keyframe: "关键画面",
  other: "其它参考"
};

export const snippetLocale: Record<string, PromptSnippetLocale> = {
  "visual-photorealistic-quality": { group: "画质与实拍光学", label: "真实皮肤与织物质感（去塑料感）" },
  "visual-macro-closeup": { group: "画质与实拍光学", label: "人物极近微距（100mm · 毛孔/唇纹/眼眸）" },
  "capture-35mm-natural": { group: "画质与实拍光学", label: "35mm 电影自然光" },
  "capture-85mm-portrait": { group: "画质与实拍光学", label: "85mm 人像质感与柔和散景" },
  "capture-smartphone-1x": { group: "画质与实拍光学", label: "手机 1x 纪实抓拍" },
  "capture-documentary-handheld": { group: "画质与实拍光学", label: "纪录片手持自然光" },
  "camera-continuous-take": { group: "镜头与运镜", label: "一镜到底 · 禁止切镜头" },
  "camera-static": { group: "镜头与运镜", label: "固定机位" },
  "camera-push-in": { group: "镜头与运镜", label: "慢速推近" },
  "camera-pull-out-reveal": { group: "镜头与运镜", label: "后退拉远并展开环境" },
  "camera-tracking": { group: "镜头与运镜", label: "平稳跟拍" },
  "camera-orbit": { group: "镜头与运镜", label: "平滑 180° 环绕" },
  "camera-low-angle-macro": { group: "镜头与运镜", label: "极低贴地微距广角" },
  "shot-close-up": { group: "切镜与景别", label: "切镜至近景 [Shot 2]" },
  "sound-no-music": { group: "声音与对白", label: "不要背景音乐 (N/A)" },
  "sound-ambience": { group: "声音与对白", label: "自然环境声与底噪" },
  "dialogue-mandarin": { group: "声音与对白", label: "中文对白模板" },
  "dialogue-english": { group: "声音与对白", label: "英文对白模板" },
  "motion-breeze": { group: "细节与文字", label: "微风吹动发丝与衣料" },
  "screen-text": { group: "细节与文字", label: "锁定画面文字" }
};
