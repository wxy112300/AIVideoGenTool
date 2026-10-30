import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isMossImageModel } from "../../src/core/moss-image-spec.js";
import { normalizeMossImagePromptOutput } from "../../src/core/moss-image-prompt.js";
import type {
  EnhanceRequest,
  H3PromptMode,
  H3PromptPreset,
  PromptEnhanceMode,
  Settings
} from "../../src/types.js";
import { h3PromptPresetForMode, h3PromptPresetTextForRequest } from "../../src/core/h3-prompt-presets.js";
import { h3SmallModelPromptContract } from "../../src/core/h3-official-spec.js";
import { h3VisualQualityKnowledge } from "../../src/core/prompts/h3/visual-quality.js";
import { h3PromptOutputLanguageInstruction, promptTargetLanguage } from "../../src/core/prompt-language.js";
import { h3ScalePreservationInstruction } from "../../src/core/h3-scale-preservation.js";
import {
  h3AutoPrompterContract,
  h3AutoPromptInstruction,
  h3PromptModeForRequest,
  h3ShotPolicyForRequest,
  isH3NativeStateContinuationRequest,
  isH3ReferenceAutoPrompt,
  validateH3ReferenceAutoPrompt
} from "../../src/core/h3-auto-prompter.js";
import {
  normalizeQwenImageEditPromptOutput
} from "../../src/core/qwen-image-prompt.js";
import {
  imageEditPromptContractForTarget,
  imageEditPromptUserContentForTarget
} from "../../src/core/image-prompt.js";
import {
  h3DurationPlan,
  h3DetailedExpansionGateInstruction,
  h3ExtensionContinuityInstruction,
  h3EffectiveDurationSeconds as h3EffectiveDurationNumber,
  h3ExplicitConstraintSummary,
  h3PromptControlInstruction,
  h3PromptPriorityInstruction,
  h3PromptExpansionTokenBudget,
  normalizeH3PromptOutput
} from "../../src/core/h3-prompt.js";
import { h3CameraIntentInstruction } from "../../src/core/h3-camera-intent.js";
import { h3LoraPromptInstruction } from "../../src/core/prompts/h3/loras.js";
import {
  extractH3DialogueLocks,
  extractH3VisibleTextLocks,
  h3ContentLockInstruction
} from "../../src/core/h3-dialogue.js";
import {
  applyPromptRevision,
  parsePromptAnnotations,
  promptAnnotationInstruction,
  promptRevisionInstruction,
  stripPromptAnnotations
} from "../../src/core/prompt-annotations.js";

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

interface LmStudioModelList {
  data?: Array<{ id?: string }>;
}

interface LmStudioNativeModelList {
  models?: Array<{
    loaded_instances?: Array<{ id?: string }>;
  }>;
}

export function lmStudioNativeApiBase(url: string): string {
  return `${new URL(url).origin}/api/v1`;
}

export function loadedLmStudioInstanceIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const models = (value as LmStudioNativeModelList).models;
  if (!Array.isArray(models)) return [];
  return models.flatMap((model) =>
    Array.isArray(model.loaded_instances)
      ? model.loaded_instances
          .map((instance) => instance.id?.trim() ?? "")
          .filter((id): id is string => Boolean(id))
      : []
  );
}

type ChatTextPart = { type: "text"; text: string };
type ChatImagePart = {
  type: "image_url";
  image_url: { url: string };
};
type ChatContent = string | Array<ChatTextPart | ChatImagePart>;

interface ChatMessage {
  role: "system" | "user";
  content: ChatContent;
}

export interface LmStudioChatRequest {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: ChatMessage[];
}

async function lmStudioModelIds(settings: Settings): Promise<string[]> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const response = await fetch(`${cleanBaseUrl(settings.lmStudioUrl)}/models`, {
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(t(uiKeys.promptBackend.lmHttp, { status: response.status }));
  const body = (await response.json()) as LmStudioModelList;
  return (
    body.data
      ?.map((item) => item.id?.trim() ?? "")
      .filter((id): id is string => Boolean(id)) ?? []
  );
}

export async function unloadLmStudioModels(
  settings: Settings,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const baseUrl = lmStudioNativeApiBase(settings.lmStudioUrl);
  let listResponse: Response;
  try {
    listResponse = await fetchImpl(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    // If LM Studio is not running, it cannot be holding a loaded model.
    return 0;
  }
  if (!listResponse.ok) {
    throw new Error(t(uiKeys.promptBackend.lmListFailed, { status: listResponse.status }));
  }
  const instanceIds = loadedLmStudioInstanceIds(await listResponse.json());
  for (const instanceId of instanceIds) {
    const response = await fetchImpl(`${baseUrl}/models/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      throw new Error(
        t(uiKeys.promptBackend.lmUnloadFailed, { id: instanceId, status: response.status })
      );
    }
  }
  if (instanceIds.length === 0) return 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const response = await fetchImpl(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (
      response.ok &&
      loadedLmStudioInstanceIds(await response.json()).length === 0
    ) {
      return instanceIds.length;
    }
  }
  throw new Error(t(uiKeys.promptBackend.lmUnloadTimeout));
}

export async function releasePromptModelRuntime(settings: Settings): Promise<number> {
  return unloadLmStudioModels(settings);
}

export function selectLmStudioModel(
  configuredModel: string,
  availableModels: string[],
  mode: PromptEnhanceMode = "sulphur-native"
): string {
  const configured = configuredModel.trim();
  if (configured) return configured;
  const generationModels = availableModels.filter(
    (id) => !/(?:^|[-_/])(embed|embedding|rerank)(?:[-_/]|$)/i.test(id)
  );
  if (mode === "h3-vision" || mode === "image-edit") {
    return generationModels.find((id) => /qwen3(?:\.5|-vl)|qwen.*vision|qwen.*vl|gemma-[34]/i.test(id)) ?? "";
  }
  if (mode === "faithful") {
    return generationModels.find((id) => !/sulphur/i.test(id)) ?? "";
  }
  return (
    generationModels.find((id) => /sulphur/i.test(id)) ??
    generationModels[0] ??
    ""
  );
}

function faithfulSystemPrompt(request: EnhanceRequest, settings: Settings): string {
  const language =
    promptTargetLanguage(request, settings) === "zh"
      ? "使用中文输出。"
      : "Output in English.";
  return [
    "你是忠实的视频提示词编辑器，只能整理和细化用户已经明确提供的信息。",
    "绝对禁止新增或猜测人物身份、年龄、外貌、服装、地点、时间、天气、物品、背景、事件、情绪、声音或剧情。",
    "可以把已有动作整理为清晰的时间顺序，并仅在不改变含义时补充通用的镜头连续性表达。",
    "输入很短时也必须保持简洁；信息不足时保留原文，不得自行填空。",
    language,
    "只返回最终提示词，不要解释、标题、前缀或引号。"
  ].join("\n");
}

function faithfulUserPrompt(prompt: string, settings: Settings): string {
  const parsedPrompt = parsePromptAnnotations(prompt);
  const sourcePrompt = parsedPrompt.prompt.trim();
  const annotationInstruction = promptAnnotationInstruction(parsedPrompt);
  const language =
    promptTargetLanguage({ prompt, modelId: "" }, settings) === "zh"
      ? "请使用中文输出。"
      : "Output in English.";
  return [
    language,
    "不得加入原文没有出现的视觉、人物或剧情信息。",
    ...(annotationInstruction ? [annotationInstruction] : []),
    "原始提示词：",
    sourcePrompt
  ].join("\n");
}


function imageMimeType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/jpeg";
  }
}

function h3EffectiveDurationSeconds(seconds: number | undefined): string {
  const safe = Number.isFinite(seconds) && (seconds ?? 0) > 0 ? seconds! : 5;
  const requestedFrames = Math.max(5, Math.round(safe * 24));
  const alignedFrames = requestedFrames + ((5 - (requestedFrames % 17) + 17) % 17);
  return (alignedFrames / 24).toFixed(2);
}

async function nativeUserContent(
  prompt: string,
  imagePaths: string[] = []
): Promise<ChatContent> {
  const paths = [...new Set(imagePaths.filter(Boolean))];
  if (!paths.length) return prompt;
  try {
    const parts: Array<ChatTextPart | ChatImagePart> = [
      { type: "text", text: prompt }
    ];
    for (const imagePath of paths) {
      const bytes = await fs.readFile(imagePath);
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${imageMimeType(imagePath)};base64,${bytes.toString("base64")}`
        }
      });
    }
    return parts;
  } catch {
    // Text-only enhancement remains useful if the draft image was moved or deleted.
    return prompt;
  }
}

function h3VisionSystemPrompt(mode: H3PromptMode, preset: H3PromptPreset): string {
  return [
    "You are a MiniMax H3 visual prompt editor, not a generic creative copywriter.",
    "The user may provide a short idea in any language. Expand it into the required H3 fields without asking the user to draft the sections.",
    h3SmallModelPromptContract(mode, preset)
  ].join("\n");
}

function h3VisionUserPrompt(request: EnhanceRequest, presetText: string, locale: Settings["uiLocale"] = "zh-CN"): string {
  const mode = h3PromptModeForRequest(request);
  const preset = h3PromptPresetForMode(mode, request.h3PromptPreset);
  const duration = h3EffectiveDurationSeconds(request.h3DurationSeconds);
  const referenceContext = request.referenceContext?.trim();
  if (request.promptStrategy === "targeted-revision") {
    return promptRevisionInstruction(request.prompt, referenceContext, presetText, locale);
  }
  const parsedPrompt = parsePromptAnnotations(request.prompt);
  const sourcePrompt = parsedPrompt.prompt.trim();
  const shotPolicy = h3ShotPolicyForRequest(request);
  const nativeStateContinuation = isH3NativeStateContinuationRequest(request);
  const priorityInstruction = h3PromptPriorityInstruction(shotPolicy);
  const controlInstruction = h3PromptControlInstruction({
    rawPrompt: request.prompt,
    mode,
    preset,
    referenceContext,
    hasReferenceMedia: Boolean(request.imagePath || (request.imagePaths?.length ?? 0) > 0)
  });
  const hardConstraints = h3ExplicitConstraintSummary(sourcePrompt);
  const contentLocks = h3ContentLockInstruction(sourcePrompt);
  const annotationInstruction = promptAnnotationInstruction(parsedPrompt);
  const scaleContext = [
    ...parsedPrompt.annotations.map((annotation) => annotation.text),
    referenceContext ?? ""
  ].filter(Boolean).join("\n");
  const cameraIntent = h3CameraIntentInstruction(sourcePrompt, scaleContext);
  const scaleInstruction = h3ScalePreservationInstruction(sourcePrompt, mode, scaleContext);
  return [
    priorityInstruction,
    request.extensionSource
      ? h3ExtensionContinuityInstruction(mode, shotPolicy, nativeStateContinuation, request.continuumPreviousChunk)
      : "",
    ...(preset === "detailed-cinematic"
      ? [h3DetailedExpansionGateInstruction(mode, Number(duration), sourcePrompt)]
      : []),
    controlInstruction,
    h3VisualQualityKnowledge,
    h3PromptOutputLanguageInstruction(request),
    ...(annotationInstruction ? [annotationInstruction] : []),
    ...(isH3ReferenceAutoPrompt(request)
        ? [h3AutoPromptInstruction(request)]
        : [
           "User request (preserve its concrete words and meaning):",
           sourcePrompt
         ]),
    h3LoraPromptInstruction(request.videoLoras),
    ...(cameraIntent ? [cameraIntent] : []),
    ...(hardConstraints ? [hardConstraints] : []),
    ...(contentLocks ? [contentLocks] : []),
    ...(scaleInstruction ? [scaleInstruction] : []),
    ...(isH3ReferenceAutoPrompt(request)
      ? [h3AutoPrompterContract(mode, Number(duration), referenceContext, preset)]
      : []),
    `H3 mode: ${mode}. Effective duration: ${duration} seconds.`,
    mode === "T2VA"
      ? "No image reference is attached; the user intent above is the source material for the T2VA timeline."
      : "The attached image(s) are the reference material in the order described below.",
    ...(referenceContext ? [`Reference map:\n${referenceContext}`] : []),
    h3DurationPlan(mode, Number(duration), preset),
    `Selected H3 preset (low-priority style hint only): ${preset}.\n${presetText.trim()}`
  ].filter(Boolean).join("\n\n");
}

export async function buildLmStudioChatRequest(
  request: EnhanceRequest,
  settings: Settings,
  model: string
): Promise<LmStudioChatRequest> {
  const mode: PromptEnhanceMode = request.mode ?? "sulphur-native";
  if (mode === "image-edit") {
    const imagePaths = request.imagePaths?.length
      ? request.imagePaths
      : request.imagePath
        ? [request.imagePath]
        : [];
    return {
      model,
      temperature: Math.min(settings.promptCreativity, 0.35),
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: imageEditPromptContractForTarget(
            request.imageTargetModelId,
            request.imageEditEnhanceMode === "faithful" ? "faithful" : "detail-enhance",
            request.imageEditPresetText
          )
        },
        {
          role: "user",
          content: await nativeUserContent(imageEditPromptUserContentForTarget(request), imagePaths)
        }
      ]
    };
  }
  if (mode === "h3-vision") {
    const imagePaths = request.imagePaths?.length
      ? request.imagePaths
      : request.imagePath
        ? [request.imagePath]
        : [];
    const h3Mode = h3PromptModeForRequest(request);
    const h3Preset = h3PromptPresetForMode(h3Mode, request.h3PromptPreset);
    return {
      model,
      temperature: 0.35,
      max_tokens: h3PromptExpansionTokenBudget(
        h3Mode,
        request.h3DurationSeconds ?? 5,
        h3Preset
      ),
      messages: [
        {
          role: "system",
          content: request.promptStrategy === "targeted-revision"
            ? "You are a precise prompt revision engine. Return only the requested EDIT_TARGET replacement blocks and no commentary."
            : h3VisionSystemPrompt(h3Mode, h3Preset)
        },
        {
          role: "user",
          content: await nativeUserContent(
            h3VisionUserPrompt(
              request,
              h3PromptPresetTextForRequest(h3Preset, settings.h3PromptPresets[h3Preset]),
              settings.uiLocale
            ),
            imagePaths
          )
        }
      ]
    };
  }
  if (mode === "sulphur-native") {
    const parsedPrompt = parsePromptAnnotations(request.prompt);
    const sourcePrompt = parsedPrompt.prompt.trim();
    const annotationInstruction = promptAnnotationInstruction(parsedPrompt);
    const userPrompt = annotationInstruction
      ? [annotationInstruction, "Draft prompt:", sourcePrompt].filter(Boolean).join("\n\n")
      : sourcePrompt;
    return {
      model,
      temperature: settings.promptCreativity,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: await nativeUserContent(
            userPrompt,
            request.imagePaths?.length
              ? request.imagePaths
              : request.imagePath ? [request.imagePath] : []
          )
        }
      ]
    };
  }
  return {
    model,
    temperature: Math.min(settings.promptCreativity, 0.2),
    max_tokens: 700,
    messages: [
      { role: "system", content: faithfulSystemPrompt(request, settings) },
      { role: "user", content: faithfulUserPrompt(request.prompt, settings) }
    ]
  };
}

async function lmStudioErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function testLmStudio(settings: Settings): Promise<string> {
  const t = createNativeTranslator(settings.uiLocale).t;
  const models = await lmStudioModelIds(settings);
  return models.length > 0
    ? t(uiKeys.promptBackend.lmConnected, { models: models.join(", ") })
    : t(uiKeys.promptBackend.lmNoModels);
}

export async function enhancePrompt(
  request: EnhanceRequest,
  settings: Settings
): Promise<string> {
  const t = createNativeTranslator(settings.uiLocale).t;
  if (!settings.promptUseLmStudio) {
    throw new Error(t(uiKeys.promptBackend.lmDisabled));
  }
  if (!request.prompt.trim() && !isH3ReferenceAutoPrompt(request)) throw new Error(t(uiKeys.promptBackend.promptRequired));
  validateH3ReferenceAutoPrompt(request, settings.uiLocale);
  const mode: PromptEnhanceMode = request.mode ?? "sulphur-native";
  const availableModels = settings.lmStudioModel.trim()
    ? []
    : await lmStudioModelIds(settings);
  const model = selectLmStudioModel(
    settings.lmStudioModel,
    availableModels,
    mode
  );
  if (!model) {
    if (mode === "h3-vision") {
      throw new Error(
        t(uiKeys.promptBackend.lmVisionRequired)
      );
    }
    if (mode === "faithful") {
      throw new Error(
        t(uiKeys.promptBackend.lmFaithfulRequired)
      );
    }
    throw new Error(
      t(uiKeys.promptBackend.lmGenerationModelMissing)
    );
  }
  if ((mode === "h3-vision" || mode === "image-edit") && /sulphur/i.test(model)) {
    throw new Error(
      t(uiKeys.promptBackend.lmSulphurUnsupported, { mode: mode === "image-edit" ? t(uiKeys.promptBackend.imageEditMode) : t(uiKeys.promptBackend.h3VisionMode) })
    );
  }
  if (mode === "faithful" && /sulphur/i.test(model)) {
    throw new Error(
      t(uiKeys.promptBackend.lmSulphurFaithfulness)
    );
  }
  const response = await fetch(
    `${cleanBaseUrl(settings.lmStudioUrl)}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        await buildLmStudioChatRequest(request, settings, model)
      ),
      signal: AbortSignal.timeout(90_000)
    }
  );
  if (!response.ok) {
    const detail = await lmStudioErrorDetail(response);
    throw new Error(
      t(uiKeys.promptBackend.lmExpansionHttp, { status: response.status, detail: detail ? t(uiKeys.promptBackend.detailSuffix, { detail }) : "" })
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(t(uiKeys.promptBackend.lmEmpty));
  const normalized = content
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/^```(?:text|markdown)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  if (mode === "image-edit") return isMossImageModel(request.imageTargetModelId)
    ? normalizeMossImagePromptOutput(normalized)
    : normalizeQwenImageEditPromptOutput(stripPromptAnnotations(normalized));
  if (mode !== "h3-vision") return stripPromptAnnotations(normalized);
  if (request.promptStrategy === "targeted-revision") {
    return applyPromptRevision(request.prompt, normalized, settings.uiLocale);
  }
  const h3Mode = h3PromptModeForRequest(request);
  const nativeStateContinuation = isH3NativeStateContinuationRequest(request);
  const sourcePrompt = stripPromptAnnotations(request.prompt);
  return normalizeH3PromptOutput(
    normalized,
    h3Mode,
    request.h3DurationSeconds ?? 5,
    extractH3DialogueLocks(sourcePrompt),
    extractH3VisibleTextLocks(sourcePrompt),
    sourcePrompt,
    request.prompt,
    nativeStateContinuation,
    nativeStateContinuation,
    request.continuumPreviousChunk,
    request.h3PromptPreset,
    settings.uiLocale
  );
}
