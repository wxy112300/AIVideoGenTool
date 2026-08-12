import type {
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  H3PromptMode,
  H3PromptPreset,
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot,
  ImageEditDraft,
  ImageReferenceRole,
  PromptVersion,
  Settings,
  WorkflowCapabilities
} from "../../../types";
import { inferH3PromptMode, type H3PromptBuilderInput } from "../../../core/h3-prompt";
import { checkH3Prompt } from "../../../core/h3-prompt-check";
import {
  extensionSafetyForTask,
  frameInterpolationMultiplier,
  generationFrameCountForTask,
  isMiniMaxH3BoundaryExtensionModel,
  isMiniMaxH3Fl2vaModel,
  isMiniMaxH3Model,
  isMiniMaxH3R2vModel,
  outputFrameCountForTask
} from "../../../core/workflow";
import { promptSnippets } from "../../../core/prompt-suggestions";
import type { RendererContext } from "../../contracts";
import { countPromptWords, recommendedH3PromptWords } from "../../../core/prompt-count";
import type { CreateModelOptionViewModel } from "./fragments";

export const imagePromptPresetLabels: Record<"faithful" | "detail-enhance", string> = {
  faithful: "忠实整理",
  "detail-enhance": "细节增强"
};

export const imagePromptPresetDescriptions: Record<"faithful" | "detail-enhance", string> = {
  faithful: "只澄清用户明确的编辑意图，不新增未要求的主体、材质、光照、构图或故事。",
  "detail-enhance": "在不改变编辑范围的前提下，补充区域、材质、光照、透视和边缘融合等执行细节。"
};

const h3PromptPresetLabels: Record<H3PromptPreset, string> = {
  "official-storyboard": "通用影视时间线",
  "reference-faithful": "参考画面保真",
  "continuous-motion": "单镜头连续动作",
  "dialogue-sound": "对白与原生声音",
  "beat-storyboard": "节拍分镜与镜头节奏",
  "product-brand": "产品与品牌演示",
  "music-video": "音乐视频与歌词",
  "narrative-animation": "风格化动画叙事",
  "multi-reference": "多参考关系编排"
};

const h3PromptPresetOrder: H3PromptPreset[] = [
  "official-storyboard",
  "reference-faithful",
  "continuous-motion",
  "dialogue-sound",
  "beat-storyboard",
  "product-brand",
  "music-video",
  "narrative-animation",
  "multi-reference"
];

export const h3PromptPresetDescriptions: Record<H3PromptPreset, string> = {
  "official-storyboard": "按 H3 官方字段组织完整的视听时间线，适合一般视频请求。",
  "reference-faithful": "减少无依据的画面补写，优先保护参考图中的身份、构图和连续性。",
  "continuous-motion": "把动作写成一个无剪辑的连续镜头，强调因果、身体力学和收束状态。",
  "dialogue-sound": "优先处理对白、演唱、环境声、动作声和原生音乐的同步关系。",
  "beat-storyboard": "按时长拆解镜头节拍、动作节点、转场、镜头运动和声音落点。",
  "product-brand": "保护产品、界面、品牌素材和文案的真实性，强调功能动作与清晰收尾。",
  "music-video": "把歌曲、歌词、节拍、表演和空间化文字作为同一条时间线设计。",
  "narrative-animation": "强调角色锁定、因果故事、表演节奏、风格化运动和镜头连续性。",
  "multi-reference": "为 R2V 图片、视频和音频分配明确关系，并保持标签和复用关系稳定。"
};

export const h3ReferenceRoleLabels: Record<H3ReferenceRole, string> = {
  subject: "人物 / 主体",
  scene: "场景 / 环境",
  style: "风格 / 服装",
  motion: "动作 / 姿态",
  camera: "镜头 / 构图",
  voice: "声音关联",
  keyframe: "关键画面",
  other: "其它参考"
};

export const h3ReferenceRolePromptLabels: Record<H3ReferenceRole, string> = {
  subject: "subject",
  scene: "scene / environment",
  style: "style / clothing",
  motion: "motion / pose",
  camera: "camera / composition",
  voice: "voice association",
  keyframe: "keyframe",
  other: "other reference"
};

export const imageReferenceRoleLabels: Record<ImageReferenceRole, string> = {
  base: "基础画面",
  person: "人物",
  object: "物体",
  pose: "姿态",
  style: "风格",
  background: "背景",
  auto: "自动"
};

export const imageReferenceRolePromptLabels: Record<ImageReferenceRole, string> = {
  base: "base image",
  person: "person",
  object: "object",
  pose: "pose",
  style: "style",
  background: "background",
  auto: "automatic reference"
};

export function activePrompt(draft: Draft): PromptVersion {
  return draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: crypto.randomUUID(),
      label: "新建",
      text: "",
      createdAt: new Date().toISOString()
    };
}

export function activeImagePrompt(draft: ImageEditDraft): PromptVersion {
  return draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: "image-prompt-fallback",
      label: "原始",
      text: "",
      createdAt: new Date().toISOString()
    };
}

export function h3PromptModeForDraft(draft: Draft): H3PromptMode {
  return inferH3PromptMode(
    Boolean(draft.startImagePath),
    Boolean(draft.endImagePath),
    isMiniMaxH3R2vModel(draft.modelId)
  );
}

export function interpolationEstimate(draft: Draft): {
  multiplier: 1 | 2 | 4;
  generatedFrames: number;
  outputFrames: number;
} {
  return {
    multiplier: frameInterpolationMultiplier(draft),
    generatedFrames: generationFrameCountForTask(draft),
    outputFrames: outputFrameCountForTask(draft)
  };
}

export function extensionSafetyForDraft(draft: Draft, settings: Settings) {
  return extensionSafetyForTask({
    ...draft,
    resolution: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? draft.resolution
      : settings.ltxExtensionResolution,
    maxGeneratedFrames: isMiniMaxH3Fl2vaModel(draft.modelId) || isMiniMaxH3R2vModel(draft.modelId)
      ? 362
      : settings.ltxExtensionFrames,
    overlapFrames: settings.ltxExtensionOverlapFrames,
    unloadBetweenStages: settings.ltxExtensionUnloadBetweenStages
  });
}

export function orderVideoProfiles<T extends { id: string }>(profiles: ReadonlyArray<T>): T[] {
  return [...profiles].sort((left, right) =>
    Number(isMiniMaxH3Model(right.id)) - Number(isMiniMaxH3Model(left.id))
  );
}

export function createModelOptionViewModels(
  draft: Draft,
  environmentScan: EnvironmentScanResult | null,
  workflowCapabilities: Readonly<Record<string, WorkflowCapabilities>>,
  bundledWorkflows: Readonly<Record<string, BundledWorkflow>>
): CreateModelOptionViewModel[] {
  const scanned = environmentScan
    ? orderVideoProfiles(
        environmentScan.modelProfiles.filter((profile) => profile.category === "video")
      )
    : undefined;
  const profiles = scanned?.length
    ? scanned
    : [
        { id: "minimax_h3_fl2va", name: "MiniMax H3 Image to Video", available: true, integrated: true },
        { id: "minimax_h3_fl2va_int4", name: "MiniMax H3 Image to Video · INT4 低显存", available: true, integrated: true },
        { id: "minimax_h3_fl2va_q3_gguf", name: "MiniMax H3 Image to Video · Q3 GGUF · 低显存实验", available: true, integrated: true },
        { id: "minimax_h3_ref2va", name: "MiniMax H3 R2V · 多参考", available: true, integrated: true },
        { id: "minimax_h3_ref2va_int4", name: "MiniMax H3 R2V · 多参考 INT4", available: true, integrated: true },
        { id: "sulphur2", name: "Sulphur 2 GGUF", available: true, integrated: true }
      ];
  return profiles.map((profile) => {
    const selected = draft.modelId === profile.id;
    const supportsVideoExtension =
      draft.inputMode === "video" && (
        isMiniMaxH3BoundaryExtensionModel(profile.id) || isMiniMaxH3R2vModel(profile.id)
      )
        ? true
        : selected
          ? workflowCapabilities[draft.workflowPath]?.supportsVideoExtension === true
          : bundledWorkflows[`${profile.id}:${draft.inputMode}`]?.supportsVideoExtension === true;
    const unavailable = !profile.available ||
      profile.integrated === false ||
      (draft.inputMode === "video" && !supportsVideoExtension);
    const suffix = !profile.available
      ? " · 缺组件"
      : profile.integrated === false
        ? " · 已扫描，工作流待接入"
        : draft.inputMode === "video" && !supportsVideoExtension
          ? " · 未通过续写检查"
          : "";
    const modeLabel = draft.inputMode === "video"
      ? isMiniMaxH3R2vModel(profile.id)
        ? " · Motion Context 推荐"
        : isMiniMaxH3Fl2vaModel(profile.id)
          ? " · 尾帧兼容"
          : ""
      : "";
    return {
      id: profile.id,
      name: profile.name,
      selected,
      unavailable,
      modeLabel,
      suffix
    };
  });
}

export function promptSnippetOptions(escapeHtml: (value: unknown) => string): string {
  return [...new Set(promptSnippets.map((snippet) => snippet.group))]
    .map((group) => `<optgroup label="${escapeHtml(group)}">${promptSnippets
      .filter((snippet) => snippet.group === group)
      .map((snippet) => `<option value="${escapeHtml(snippet.id)}">${escapeHtml(snippet.label)}</option>`)
      .join("")}</optgroup>`)
    .join("");
}

export function insertPromptSnippet(
  promptInput: HTMLTextAreaElement,
  snippet: string
): void {
  if (!snippet) return;
  const start = promptInput.selectionStart;
  const end = promptInput.selectionEnd;
  const before = promptInput.value.slice(0, start);
  const after = promptInput.value.slice(end);
  const prefix = before && !/\s$/u.test(before) ? "\n" : "";
  const suffix = after && !/^\s/u.test(after) ? "\n" : "";
  promptInput.focus();
  promptInput.setRangeText(
    `${prefix}${snippet}${suffix}`,
    start,
    end,
    "end"
  );
  promptInput.dispatchEvent(new Event("input", { bubbles: true }));
}

export function imageFileIsSupported(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

export function updatePromptWordCounter(
  promptText: string,
  mode: H3PromptMode | undefined,
  durationSeconds: number
): void {
  const counter = document.querySelector<HTMLElement>("#prompt-word-counter");
  if (!counter) return;
  const count = countPromptWords(promptText);
  if (!mode) {
    counter.className = "prompt-word-counter";
    counter.textContent = `当前 ${count} 词`;
    return;
  }
  const limit = recommendedH3PromptWords(mode, durationSeconds);
  const overLimit = count > limit;
  counter.className = `prompt-word-counter ${overLimit ? "warning" : ""}`;
  counter.textContent = overLimit
    ? `当前 ${count} 词 · 已超过建议 ${limit} 词，仍可继续输入`
    : `当前 ${count} 词 · 建议不超过 ${limit} 词`;
}

export function updateImagePromptWordCounter(promptText: string): void {
  const counter = document.querySelector<HTMLElement>("#image-prompt-word-counter");
  if (!counter) return;
  counter.className = "prompt-word-counter";
  counter.textContent = `当前 ${countPromptWords(promptText)} 词`;
}

export function resizePromptInput(promptInput: HTMLTextAreaElement): void {
  promptInput.style.height = "auto";
  const styles = window.getComputedStyle(promptInput);
  const minHeight = Number.parseFloat(styles.minHeight) || 0;
  const maxHeight = Number.parseFloat(styles.maxHeight);
  const contentHeight = promptInput.scrollHeight;
  const height = Number.isFinite(maxHeight)
    ? Math.min(contentHeight, maxHeight)
    : contentHeight;
  promptInput.style.height = `${Math.max(minHeight, height)}px`;
  promptInput.style.overflowY = Number.isFinite(maxHeight) && contentHeight > maxHeight
    ? "auto"
    : "hidden";
}

export function h3PromptCheckMarkup(
  promptText: string,
  hasEndImage: boolean,
  mode: H3PromptMode | undefined,
  hasImageReference: boolean,
  hasVideoReference: boolean,
  durationSeconds: number,
  escapeHtml: (value: unknown) => string
): string {
  const result = checkH3Prompt(promptText, {
    hasEndImage,
    mode,
    hasImageReference,
    hasVideoReference,
    durationSeconds
  });
  return `<div id="h3-prompt-check" class="h3-prompt-check ${result.valid ? "valid" : "warning"}" aria-live="polite">
    <div class="h3-prompt-check-heading"><strong>H3 提示词检查</strong><span>${escapeHtml(result.summary)}</span></div>
    ${result.items.length ? `<ul>${result.items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export function h3PromptPresetOptions(
  selected: H3PromptPreset,
  includeMultiReference: boolean
): string {
  return h3PromptPresetOrder
    .filter((preset) => includeMultiReference || preset !== "multi-reference")
    .map((preset) => `<option value="${preset}" ${selected === preset ? "selected" : ""}>${h3PromptPresetLabels[preset]}</option>`)
    .join("");
}

export function createDefaultH3PromptBuilder(): H3PromptBuilderInput {
  return {
    style: "",
    subject: "",
    action: "",
    continuity: "",
    physicalLock: "",
    cameraMotion: "static",
    cameraAmplitude: "small",
    cameraSpeed: "slow",
    framing: "",
    diegeticSound: "",
    finalState: "",
    soundscape: "",
    music: "N/A",
    dialogueSpeaker: "S1",
    dialogueLanguage: "Chinese",
    dialogueDelivery: "a clear, natural voice",
    dialogueText: "",
    onScreenText: ""
  };
}

export function newH3ReferenceSlot(
  mediaPath = "",
  mediaType: H3ReferenceMediaType = "image"
): H3ReferenceSlot {
  return {
    id: crypto.randomUUID(),
    mediaType,
    mediaPath,
    role: "subject",
    note: ""
  };
}

export function h3ReferenceTag(slots: H3ReferenceSlot[], slotId: string): string {
  const index = slots.findIndex((slot) => slot.id === slotId);
  if (index < 0) return "<Picture 1>";

  const slot = slots[index]!;
  const ordinal = slots
    .slice(0, index + 1)
    .filter((item) => item.mediaType === slot.mediaType)
    .length;
  return `<${slot.mediaType === "video" ? "Video" : "Picture"} ${ordinal}>`;
}

export async function loadImagePreview(
  context: RendererContext,
  filename: string,
  targetId: string,
  patchDraft: (patch: Partial<Draft>) => void
): Promise<void> {
  if (!filename) return;
  const dataUrl = await context.studio.readImage(filename);
  const image = context.root.querySelector<HTMLImageElement>(`#${targetId}`);
  if (!image || !dataUrl) return;
  image.addEventListener("load", () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    image.closest<HTMLElement>(".drop-zone")?.style.setProperty(
      "--image-ratio",
      `${image.naturalWidth} / ${image.naturalHeight}`
    );
    const state = context.getState();
    if (
      targetId === "start-preview" &&
      state &&
      (state.draft.sourceWidth !== image.naturalWidth ||
        state.draft.sourceHeight !== image.naturalHeight)
    ) {
      patchDraft({
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight
      });
    }
  }, { once: true });
  image.src = dataUrl;
}
