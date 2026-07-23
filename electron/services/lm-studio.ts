import type { EnhanceRequest, Settings } from "../../src/types.js";

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function testLmStudio(settings: Settings): Promise<string> {
  const response = await fetch(`${cleanBaseUrl(settings.lmStudioUrl)}/models`, {
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`LM Studio 返回 HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = body.data?.map((item) => item.id).filter(Boolean) ?? [];
  return models.length > 0 ? `已连接 · ${models.join(", ")}` : "已连接 · 当前未加载模型";
}

export async function enhancePrompt(
  request: EnhanceRequest,
  settings: Settings
): Promise<string> {
  const response = await fetch(`${cleanBaseUrl(settings.lmStudioUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.lmStudioModel || "local-model",
      temperature: 0.72,
      messages: [
        { role: "system", content: settings.promptSystemTemplate },
        {
          role: "user",
          content: `目标视频模型：${request.modelId}\n原始提示词：${request.prompt}`
        }
      ]
    }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) {
    throw new Error(`提示词扩写失败：LM Studio 返回 HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LM Studio 没有返回扩写内容");
  return content;
}
