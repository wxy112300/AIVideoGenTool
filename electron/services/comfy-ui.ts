import { promises as fs } from "node:fs";
import path from "node:path";
import type { QueueTask, Settings } from "../../src/types.js";
import {
  missingWorkflowNodeTypes,
  renderWorkflow
} from "../../src/core/workflow.js";

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ComfyUI 返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }
  return (await response.json()) as T;
}

export async function testComfyUi(settings: Settings): Promise<string> {
  const stats = await jsonRequest<Record<string, unknown>>(
    `${cleanBaseUrl(settings.comfyUrl)}/system_stats`
  );
  return `已连接 · ${Object.keys(stats).length > 0 ? "服务状态正常" : "8188"}`;
}

async function uploadImage(baseUrl: string, filePath: string): Promise<string> {
  if (!filePath) return "";
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.set("image", new Blob([bytes]), path.basename(filePath));
  form.set("type", "input");
  form.set("overwrite", "false");
  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`上传参考图失败：HTTP ${response.status}`);
  const result = (await response.json()) as { name?: string; subfolder?: string };
  if (!result.name) throw new Error("ComfyUI 上传接口未返回文件名");
  return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
}

export async function submitTask(
  task: QueueTask,
  settings: Settings
): Promise<{ promptId: string; clientId: string }> {
  if (!task.workflowPath) {
    throw new Error("任务没有配置 ComfyUI API 工作流 JSON");
  }
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  const [sourceText, objectInfo] = await Promise.all([
    fs.readFile(task.workflowPath, "utf8"),
    jsonRequest<Record<string, unknown>>(`${baseUrl}/object_info`)
  ]);
  const source = JSON.parse(sourceText) as unknown;
  const missingNodes = missingWorkflowNodeTypes(source, objectInfo);
  if (missingNodes.length) {
    throw new Error(
      `当前 ComfyUI 缺少工作流节点：${missingNodes.join("、")}。请在设置页安装对应节点后重启服务。`
    );
  }
  const [inputImage, endImage] = await Promise.all([
    uploadImage(baseUrl, task.startImagePath),
    uploadImage(baseUrl, task.endImagePath)
  ]);
  const prompt = renderWorkflow(source, task, { inputImage, endImage });
  const clientId = `local-video-studio-${crypto.randomUUID()}`;
  const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId })
  });
  if (!result.prompt_id) throw new Error("ComfyUI 未返回 Prompt ID");
  return { promptId: result.prompt_id, clientId };
}

interface ComfySocketMessage {
  type?: string;
  data?: {
    prompt_id?: string;
    value?: number;
    max?: number;
    node?: string | null;
    exception_message?: string;
  };
}

function socketUrl(httpUrl: string, clientId: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws`;
  url.search = new URLSearchParams({ clientId }).toString();
  return url.toString();
}

async function socketMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data instanceof Blob) return data.text();
  return "";
}

export async function waitForTask(
  promptId: string,
  clientId: string,
  settings: Settings,
  signal: AbortSignal,
  onProgress: (value: number) => void
): Promise<unknown> {
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  let socket: WebSocket | undefined;
  let hasRealProgress = false;
  let executionError = "";
  try {
    socket = new WebSocket(socketUrl(baseUrl, clientId));
    socket.addEventListener("message", async (event) => {
      try {
        const text = await socketMessageText(event.data);
        if (!text) return;
        const message = JSON.parse(text) as ComfySocketMessage;
        if (message.data?.prompt_id && message.data.prompt_id !== promptId) return;
        if (
          message.type === "progress" &&
          typeof message.data?.value === "number" &&
          typeof message.data.max === "number" &&
          message.data.max > 0
        ) {
          hasRealProgress = true;
          onProgress(Math.min(99, Math.max(0, (message.data.value / message.data.max) * 100)));
        }
        if (message.type === "execution_error") {
          executionError =
            message.data?.exception_message || "ComfyUI 工作流执行失败";
        }
      } catch {
        // Binary preview frames and unknown extension messages are ignored.
      }
    });
  } catch {
    socket = undefined;
  }
  let syntheticProgress = 3;
  try {
    while (!signal.aborted) {
      if (executionError) throw new Error(executionError);
      const history = await jsonRequest<Record<string, unknown>>(
        `${baseUrl}/history/${encodeURIComponent(promptId)}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
      );
      if (promptId in history) {
        onProgress(100);
        return history[promptId];
      }
      if (!hasRealProgress) {
        syntheticProgress = Math.min(94, syntheticProgress + 2);
        onProgress(syntheticProgress);
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 2_000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(signal.reason);
          },
          { once: true }
        );
      });
    }
    throw signal.reason;
  } finally {
    socket?.close();
  }
}

export async function interrupt(settings: Settings): Promise<void> {
  const response = await fetch(`${cleanBaseUrl(settings.comfyUrl)}/interrupt`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`中止任务失败：HTTP ${response.status}`);
}
