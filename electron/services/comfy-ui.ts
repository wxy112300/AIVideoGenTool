import { promises as fs } from "node:fs";
import path from "node:path";
import type { QueueTask, Settings } from "../../src/types.js";
import {
  missingWorkflowNodeTypes,
  renderWorkflow,
  workflowSupportsEndImage
} from "../../src/core/workflow.js";
import { renderUpscaleWorkflow } from "../../src/core/upscale.js";
import {
  prepareExtensionContext,
  prepareH3BoundaryFrame
} from "./extension-media.js";

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout
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

export function safeComfyUploadFilename(
  filePath: string,
  uploadId = crypto.randomUUID()
): string {
  const extension = path.extname(filePath).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
  const safeId = uploadId.replace(/[^a-zA-Z0-9-]/g, "") || "file";
  return `studio-input-${safeId}${safeExtension}`;
}

async function uploadInput(
  baseUrl: string,
  filePath: string,
  signal: AbortSignal,
  label: string
): Promise<string> {
  if (!filePath) return "";
  const bytes = await fs.readFile(filePath, { signal });
  const form = new FormData();
  form.set("image", new Blob([bytes]), safeComfyUploadFilename(filePath));
  form.set("type", "input");
  form.set("overwrite", "false");
  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)])
  });
  if (!response.ok) throw new Error(`上传${label}失败：HTTP ${response.status}`);
  const result = (await response.json()) as { name?: string; subfolder?: string };
  if (!result.name) throw new Error("ComfyUI 上传接口未返回文件名");
  return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
}

export async function submitTask(
  task: QueueTask,
  settings: Settings,
  signal: AbortSignal
): Promise<{
  promptId: string;
  clientId: string;
  nodeTypes: Record<string, string>;
}> {
  if (!task.workflowPath) {
    throw new Error("任务没有配置 ComfyUI API 工作流 JSON");
  }
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  const [objectInfo, systemStats] = await Promise.all([
    jsonRequest<Record<string, unknown>>(
      `${baseUrl}/object_info`,
      { signal }
    ),
    jsonRequest<{
      devices?: Array<{ vram_total?: number }>;
    }>(`${baseUrl}/system_stats`, { signal }).catch(() => ({
      devices: []
    }))
  ]);
  const vramTotalBytes = Math.max(
    0,
    ...(systemStats.devices ?? []).map((device) =>
      typeof device.vram_total === "number" ? device.vram_total : 0
    )
  );
  let prompt: unknown;
  if (task.taskType === "generation" || task.taskType === "extension") {
    const sourceText = await fs.readFile(task.workflowPath, {
      encoding: "utf8",
      signal
    });
    const source = JSON.parse(sourceText) as unknown;
    if (task.taskType === "extension") {
      const h3Boundary = task.modelId === "minimax_h3_fl2va";
      const prepared = h3Boundary
        ? await prepareH3BoundaryFrame(task, signal)
        : await prepareExtensionContext(task, signal);
      try {
        const uploadedInput = await uploadInput(
          baseUrl,
          prepared.filePath,
          signal,
          h3Boundary ? "H3 接续边界帧" : "续写上下文"
        );
        prompt = renderWorkflow(source, task, {
          ...(h3Boundary
            ? { inputImage: uploadedInput }
            : { sourceVideo: uploadedInput }),
          vramTotalBytes
        });
      } finally {
        await prepared.cleanup();
      }
    } else {
      const supportsEndImage = workflowSupportsEndImage(source);
      const [inputImage, endImage] = await Promise.all([
        uploadInput(baseUrl, task.startImagePath, signal, "首帧"),
        supportsEndImage && task.endImagePath
          ? uploadInput(baseUrl, task.endImagePath, signal, "尾帧")
          : Promise.resolve("")
      ]);
      prompt = renderWorkflow(source, task, {
        inputImage,
        endImage,
        vramTotalBytes
      });
    }
  } else {
    const sourceVideo = await uploadInput(
      baseUrl,
      task.sourceFilePath,
      signal,
      "源视频"
    );
    prompt = renderUpscaleWorkflow(task, sourceVideo, {
      seedVr2: settings.seedVr2Model,
      realEsrgan: settings.realEsrganModel
    });
  }
  const missingNodes = missingWorkflowNodeTypes(prompt, objectInfo);
  if (missingNodes.length) {
    throw new Error(
      `当前 ComfyUI 缺少工作流节点：${missingNodes.join("、")}。请在设置页安装对应节点后重启服务。`
    );
  }
  const clientId = `local-video-studio-${crypto.randomUUID()}`;
  const result = await jsonRequest<{ prompt_id?: string }>(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
    signal
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
    output?: unknown;
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

export async function executedPreviewDataUrl(
  baseUrl: string,
  value: unknown,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = (value as { output?: unknown }).output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const images = (output as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  const image = images.find(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as { filename?: unknown }).filename === "string"
  ) as
    | { filename: string; subfolder?: unknown; type?: unknown }
    | undefined;
  if (!image) return null;

  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
    type: typeof image.type === "string" ? image.type : "temp"
  });
  const response = await fetcher(`${cleanBaseUrl(baseUrl)}/view?${query}`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) return null;
  const contentType = response.headers.get("content-type");
  const mime =
    contentType?.startsWith("image/")
      ? contentType.split(";")[0]!
      : /\.png$/i.test(image.filename)
        ? "image/png"
        : "image/jpeg";
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function nodeStage(classType: string | undefined): {
  progress: number;
  label: string;
} {
  if (!classType) return { progress: 2, label: "准备工作流" };
  if (classType.includes("Loader")) return { progress: 5, label: "加载模型" };
  if (classType === "CLIPTextEncode") return { progress: 10, label: "编码提示词" };
  if (classType === "KSampler" || classType === "KSamplerAdvanced") {
    return { progress: 15, label: "扩散采样" };
  }
  if (classType === "LTXVExtendSampler" || classType === "LTXVLoopingSampler") {
    return { progress: 15, label: "LTX 视频续写" };
  }
  if (classType === "VRAM_Debug") return { progress: 91, label: "卸载扩散模型并释放显存" };
  if (classType.includes("VAEDecode")) return { progress: 92, label: "分块 VAE 解码" };
  if (classType === "RIFE VFI") return { progress: 95, label: "RIFE 视频插帧" };
  if (classType === "ImageFromBatch") return { progress: 96, label: "裁剪到目标帧数" };
  if (classType === "CreateVideo") return { progress: 97, label: "生成视频帧" };
  if (classType === "SaveVideo") return { progress: 99, label: "编码并保存" };
  return { progress: 12, label: classType };
}

function queueNodeForPrompt(value: unknown, promptId: string): string {
  if (!Array.isArray(value)) return "";
  const running = value.find(
    (entry) => Array.isArray(entry) && entry[1] === promptId
  );
  if (!Array.isArray(running) || !Array.isArray(running[4])) return "";
  return running[4].find((nodeId): nodeId is string => typeof nodeId === "string") ?? "";
}

export class TaskStalledError extends Error {
  constructor(minutes: number, reason = "未上报节点进展") {
    super(`任务连续 ${minutes} 分钟${reason}，已停止队列并重启 ComfyUI 释放显存。`);
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

export function historyEntryClientId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const prompt = (value as { prompt?: unknown }).prompt;
  if (!Array.isArray(prompt) || !prompt[3] || typeof prompt[3] !== "object") {
    return "";
  }
  const clientId = (prompt[3] as { client_id?: unknown }).client_id;
  return typeof clientId === "string" ? clientId : "";
}

export function historyEntryHasUnfinishedBatch(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const outputs = (value as { outputs?: unknown }).outputs;
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    return false;
  }
  return Object.values(outputs).some((output) => {
    if (!output || typeof output !== "object" || Array.isArray(output)) return false;
    const unfinished = (output as { unfinished_batch?: unknown }).unfinished_batch;
    return Array.isArray(unfinished) && unfinished.includes(true);
  });
}

export function historyFailure(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const status = (value as { status?: unknown }).status;
  if (!status || typeof status !== "object") return "";
  const statusString = (status as { status_str?: unknown }).status_str;
  if (statusString === "success") return "";
  const messages = (status as { messages?: unknown }).messages;
  if (Array.isArray(messages)) {
    for (const message of [...messages].reverse()) {
      if (!Array.isArray(message) || message[0] !== "execution_error") continue;
      const details = message[1];
      if (!details || typeof details !== "object") continue;
      const exceptionMessage = (details as { exception_message?: unknown })
        .exception_message;
      const exceptionType = (details as { exception_type?: unknown })
        .exception_type;
      const text = [exceptionType, exceptionMessage]
        .filter((item): item is string => typeof item === "string" && Boolean(item))
        .join(": ");
      if (text) return text;
    }
  }
  return typeof statusString === "string"
    ? `ComfyUI 任务结束：${statusString}`
    : "ComfyUI 任务未成功完成";
}

export async function waitForTask(
  promptId: string,
  clientId: string,
  nodeTypes: Record<string, string>,
  settings: Settings,
  activityTimeoutMinutes: number,
  signal: AbortSignal,
  onProgress: (value: number, stage: string) => void,
  onPreview: (dataUrl: string) => void,
  isComputeActive: () => boolean = () => false
): Promise<unknown> {
  const baseUrl = cleanBaseUrl(settings.comfyUrl);
  let socket: WebSocket | undefined;
  let executionError = "";
  let lastActivityAt = Date.now();
  let lastServiceResponseAt = Date.now();
  const activityTimeoutMs = activityTimeoutMinutes * 60_000;
  const serviceSilenceLimit = () =>
    isComputeActive()
      ? Math.min(activityTimeoutMs, 20 * 60_000)
      : 3 * 60_000;
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
        if (
          message.data?.prompt_id &&
          message.data.prompt_id !== promptId
        ) {
          return;
        }
        if (
          message.type === "executing" ||
          message.type === "progress" ||
          message.type === "executed" ||
          message.type === "execution_error" ||
          message.type === "execution_interrupted"
        ) {
          lastActivityAt = Date.now();
        }
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
        if (message.type === "executed") {
          const preview = await executedPreviewDataUrl(
            baseUrl,
            message.data
          );
          if (preview) onPreview(preview);
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
      if (Date.now() - lastServiceResponseAt > serviceSilenceLimit()) {
        throw new TaskStalledError(3, "无法连接 ComfyUI");
      }
      if (Date.now() - lastActivityAt > activityTimeoutMs) {
        throw new TaskStalledError(activityTimeoutMinutes);
      }
      let history: Record<string, unknown>;
      try {
        history = await jsonRequest<Record<string, unknown>>(
          `${baseUrl}/history?max_items=200`,
          { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
        );
        lastServiceResponseAt = Date.now();
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (Date.now() - lastServiceResponseAt > serviceSilenceLimit()) {
          throw new TaskStalledError(3, "无法连接 ComfyUI");
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      try {
        const queue = await jsonRequest<{ queue_running?: unknown[] }>(
          `${baseUrl}/queue`,
          { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }
        );
        lastServiceResponseAt = Date.now();
        const nodeId = queueNodeForPrompt(queue.queue_running, promptId);
        if (nodeId) {
          const stage = nodeStage(nodeTypes[nodeId]);
          onProgress(stage.progress, stage.label);
        }
      } catch {
      }
      const entries = Object.values(history).filter(
        (entry) => historyEntryClientId(entry) === clientId
      );
      for (const entry of entries) {
        const failure = historyFailure(entry);
        if (failure) throw new Error(failure);
      }
      const completed = entries.find(
        (entry) =>
          completedHistoryEntry(entry) && !historyEntryHasUnfinishedBatch(entry)
      );
      if (completed) {
        onProgress(100, "已完成");
        return completed;
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

export async function freeMemory(settings: Settings): Promise<void> {
  const response = await fetch(`${cleanBaseUrl(settings.comfyUrl)}/free`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`释放显存失败：HTTP ${response.status}`);
}
