import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EnhanceRequest,
  PromptEnhanceMode,
  Settings
} from "../../src/types.js";

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
  const response = await fetch(`${cleanBaseUrl(settings.lmStudioUrl)}/models`, {
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`LM Studio 返回 HTTP ${response.status}`);
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
    throw new Error(`无法读取 LM Studio 已加载模型：HTTP ${listResponse.status}`);
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
        `卸载 LM Studio 模型 ${instanceId} 失败：HTTP ${response.status}`
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
  throw new Error("LM Studio 已接受卸载请求，但模型在 5 秒后仍占用内存");
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
  if (mode === "faithful") {
    return generationModels.find((id) => !/sulphur/i.test(id)) ?? "";
  }
  return (
    generationModels.find((id) => /sulphur/i.test(id)) ??
    generationModels[0] ??
    ""
  );
}

function faithfulSystemPrompt(settings: Settings): string {
  const language =
    settings.promptLanguage === "zh"
      ? "使用中文输出。"
      : settings.promptLanguage === "en"
        ? "Output in English."
        : "输出语言必须与用户输入保持一致。";
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
  const language =
    settings.promptLanguage === "zh" ||
    (settings.promptLanguage === "auto" && /[\u3400-\u9fff]/u.test(prompt))
      ? "请使用中文输出。"
      : settings.promptLanguage === "en"
        ? "Output in English."
        : "Keep the output language identical to the input.";
  return [
    language,
    "不得加入原文没有出现的视觉、人物或剧情信息。",
    "原始提示词：",
    prompt
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

async function nativeUserContent(
  prompt: string,
  imagePath?: string
): Promise<ChatContent> {
  if (!imagePath) return prompt;
  try {
    const bytes = await fs.readFile(imagePath);
    return [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: {
          url: `data:${imageMimeType(imagePath)};base64,${bytes.toString("base64")}`
        }
      }
    ];
  } catch {
    // Text-only enhancement remains useful if the draft image was moved or deleted.
    return prompt;
  }
}

export async function buildLmStudioChatRequest(
  request: EnhanceRequest,
  settings: Settings,
  model: string
): Promise<LmStudioChatRequest> {
  const mode: PromptEnhanceMode = request.mode ?? "sulphur-native";
  if (mode === "sulphur-native") {
    return {
      model,
      temperature: settings.promptCreativity,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: await nativeUserContent(request.prompt, request.imagePath)
        }
      ]
    };
  }
  return {
    model,
    temperature: Math.min(settings.promptCreativity, 0.2),
    max_tokens: 700,
    messages: [
      { role: "system", content: faithfulSystemPrompt(settings) },
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
  const models = await lmStudioModelIds(settings);
  return models.length > 0
    ? `已连接 · ${models.join(", ")}`
    : "已连接 · 当前未加载模型";
}

export async function enhancePrompt(
  request: EnhanceRequest,
  settings: Settings
): Promise<string> {
  if (!request.prompt.trim()) throw new Error("请先输入需要扩写的提示词");
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
    if (mode === "faithful") {
      throw new Error(
        "忠实扩写需要普通 Instruct/Chat 语言模型；当前只有 Sulphur 创意增强器。请切换为“Sulphur 原生增强”，或在 LM Studio 中再加载一个 Instruct 模型。"
      );
    }
    throw new Error(
      "提示词扩写失败：LM Studio 当前未加载生成模型，请在 Developer 页面加载提示词增强或聊天模型。"
    );
  }
  if (mode === "faithful" && /sulphur/i.test(model)) {
    throw new Error(
      "Sulphur 提示词增强器会主动补充画面细节，无法保证忠实扩写。请切换为“Sulphur 原生增强”，或在设置中选择普通 Instruct/Chat 模型。"
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
      `提示词扩写失败：LM Studio 返回 HTTP ${response.status}${
        detail ? `：${detail}` : ""
      }`
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LM Studio 没有返回扩写内容");
  return content;
}
