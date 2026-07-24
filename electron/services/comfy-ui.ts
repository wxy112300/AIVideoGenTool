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
): Promise<{
  promptId: string;
  clientId: string;
  nodeTypes: Record<string, string>;
}> {
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
  const nodeTypes = Object.fromEntries(
    Object.entries(prompt as Record<string, unknown>).flatMap(([id, value]) => {
      const classType =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>).class_type
          : undefined;
      return typeof classType === "string" ? [[id, classType]] : [];
    })
  );
  return { promptId: result.prompt_id, clientId, nodeTypes };
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
  return "";
}

async function previewDataUrl(data: unknown): Promise<string | null> {
  const buffer =
    data instanceof ArrayBuffer
      ? data
      : data instanceof Blob
        ? await data.arrayBuffer()
        : null;
  if (!buffer || buffer.byteLength <= 8) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== 1) return null;
  const imageType = view.getUint32(4, false);
  const mime = imageType === 2 ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${Buffer.from(buffer.slice(8)).toString("base64")}`;
}

function nodeStage(classType: string | undefined): {
  progress: number;
  label: string;
} {
  if (!classType) return { progress: 2, label: "准备工作流" };
  if (classType.includes("Loader")) return { progress: 5, label: "加载模型" };
  if (classType === "CLIPTextEncode") return { progress: 10, label: "编码提示词" };
  if (classType === "KSampler") return { progress: 15, label: "扩散采样" };
  if (classType === "VRAM_Debug") return { progress: 91, label: "卸载扩散模型并释放显存" };
  if (classType.includes("VAEDecode")) return { progress: 92, label: "分块 VAE 解码" };
  if (classType === "CreateVideo") return { progress: 97, label: "生成视频帧" };
  if (classType === "SaveVideo") return { progress: 99, label: "编码并保存" };
  return { progress: 12, label: classType };
}

export class TaskStalledError extends Error {
  constructor() {
    super("任务连续 3 分钟没有任何进展，已停止队列并重启 ComfyUI 释放显存。");
    this.name = "TaskStalledError";
  }
}

function completedHistoryEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  if (!status || typeof status !== "object") return false;
  return (
    (status as { completed?: unknown }).completed === true &&
    (status as { status_str?: unknown }).status_str === "success"
  );
}

function historyFailure(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const status = (value as { status?: unknown }).status;
  if (!status || typeof status !== "object") return "";
  const statusString = (status as { status_str?: unknown }).status_str;
  if (statusString === "success") return "";
  return typeof statusString === "string"
    ? `ComfyUI 任务结束：${statusString}`
    : "ComfyUI 任务未成功完成";
}

export async function waitForTask(
  promptId: string,
  clientId: string,
  nodeTypes: Record<string, string>,
  settings: Settings,
  signal: AbortSignal,
  onProgress: (value: number, stage: string) => void,
  onPreview: (dataUrl: string) => void
): Promise<unknown> {
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  let socket: WebSocket | undefined;
  let executionError = "";
  let lastActivityAt = Date.now();
  try {
    socket = new WebSocket(socketUrl(baseUrl, clientId));
    socket.binaryType = "arraybuffer";
    socket.addEventListener("message", async (event) => {
      try {
        const text = await socketMessageText(event.data);
        if (!text) {
          const preview = await previewDataUrl(event.data);
          if (preview) {
            lastActivityAt = Date.now();
            onPreview(preview);
          }
          return;
        }
        const message = JSON.parse(text) as ComfySocketMessage;
        if (message.data?.prompt_id && message.data.prompt_id !== promptId) return;
        lastActivityAt = Date.now();
        if (message.type === "executing" && typeof message.data?.node === "string") {
          const stage = nodeStage(nodeTypes[message.data.node]);
          onProgress(stage.progress, stage.label);
        }
        if (
          message.type === "progress" &&
          typeof message.data?.value === "number" &&
          typeof message.data.max === "number" &&
          message.data.max > 0
        ) {
          const step = Math.min(1, Math.max(0, message.data.value / message.data.max));
          onProgress(15 + step * 75, `扩散采样 ${message.data.value}/${message.data.max}`);
        }
        if (message.type === "execution_error") {
          executionError =
            message.data?.exception_message || "ComfyUI 工作流执行失败";
        }
        if (message.type === "execution_interrupted") {
          executionError = "ComfyUI 任务已中止";
        }
      } catch {
        // Unknown extension messages are ignored.
      }
    });
  } catch {
    socket = undefined;
  }
  try {
    while (!signal.aborted) {
      if (executionError) throw new Error(executionError);
      if (Date.now() - lastActivityAt > 3 * 60_000) {
        throw new TaskStalledError();
      }
      const history = await jsonRequest<Record<string, unknown>>(
        `${baseUrl}/history/${encodeURIComponent(promptId)}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
      );
      if (promptId in history) {
        const entry = history[promptId];
        if (completedHistoryEntry(entry)) {
          onProgress(100, "已完成");
          return entry;
        }
        throw new Error(historyFailure(entry));
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
