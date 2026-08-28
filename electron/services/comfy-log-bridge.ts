import { promises as fs } from "node:fs";
import type { AppLogger } from "./app-logger.js";
import { latestComfyLogFile } from "./dependency-scanner.js";
import type { Settings } from "../../src/types.js";
import { findComfyRoot } from "./comfy-discovery.js";

const maxIncrementalReadBytes = 512 * 1024;
const maxFailureReadBytes = 1024 * 1024;
const maxIncrementalLines = 200;
const maxFailureLines = 600;

const relevantLinePattern = /(?:traceback|exception|error|failed|fatal|critical|warning|warn|out of memory|cuda|oom|llama|execution|executing|node|queue|loading|unload|model|cache|vision.?llm|prompt.?writer|h3 optimizations)/iu;
const errorLinePattern = /(?:traceback|exception|\berror\b|failed|fatal|critical|out of memory|cuda error|cuda out of memory|\boom\b|illegal instruction|invalid response|http 5\d\d)/iu;
const warningLinePattern = /(?:\bwarning\b|\bwarn\b|deprecated|retry|fallback|slow)/iu;
const ansiEscapePattern = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const pathPattern = /(?:[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var|mnt)\/)[^\s"'<>]+/gu;
const urlPattern = /https?:\/\/[^\s"'<>]+/giu;
const sensitiveValuePattern = /(["']?(?:prompt|negative_prompt|creative_brief|text|content|messages|image|video|filename|file_path)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\s}\]]+)/giu;

const lastFailureSnapshots = new Map<string, string>();

export async function resolveComfyLogRoot(
  settings: Settings,
  discoverRoot: (settings: Settings) => Promise<string> = findComfyRoot
): Promise<string> {
  return await discoverRoot(settings).catch(() => "") || settings.comfyInstallDirectory;
}

function sanitizeLogPath(value: string): string {
  const leadingWhitespace = value.match(/^\s/u)?.[0] ?? "";
  const normalized = value.trim().replaceAll("\\", "/").replace(/[)\],.;]+$/u, "");
  const basename = normalized.split("/").at(-1) ?? "";
  return `${leadingWhitespace}[path]${basename ? `/${basename}` : ""}`;
}

export interface ComfyLogBridgeContext {
  taskId?: string;
  promptId?: string;
  modelId?: string;
  operationId?: string;
}

export interface ComfyLogSyncResult {
  lines: number;
  errors: number;
  available: boolean;
  truncated: boolean;
}

export interface H3MemoryAppliedPlanEvidence {
  execution: "optimized" | "fallback";
  qkvProvider: string;
  memoryProvider: string;
  note: string;
}

export function parseH3MemoryAppliedPlan(
  line: string
): H3MemoryAppliedPlanEvidence | null {
  if (!line.includes("[H3 Optimizations] applied plan:")) return null;
  const qkvProvider = line.match(/\bqkv_provider=([^\s]+)/u)?.[1]?.replace(/^"|"$/gu, "");
  const memoryProvider = line.match(/\bmemory=([^\s]+)/u)?.[1]?.replace(/^"|"$/gu, "");
  if (!qkvProvider || !memoryProvider) return null;
  const fallback = qkvProvider === "standard_h3_qkv" || memoryProvider === "baseline";
  return {
    execution: fallback ? "fallback" : "optimized",
    qkvProvider,
    memoryProvider,
    note: fallback
      ? `H3 Memory 运行时回退：qkv_provider=${qkvProvider}，memory=${memoryProvider}。`
      : `H3 Memory 优化已启用：qkv_provider=${qkvProvider}，memory=${memoryProvider}。`
  };
}

function logLevelForLine(line: string): "info" | "warn" | "error" {
  if (errorLinePattern.test(line)) return "error";
  if (warningLinePattern.test(line)) return "warn";
  return "info";
}

export function forwardComfyProcessLogLine(
  logger: AppLogger,
  processId: number,
  stream: "stdout" | "stderr",
  rawLine: string
): void {
  const line = sanitizeComfyLogLine(rawLine);
  if (!line) return;
  const level = logLevelForLine(line);
  const meta = {
    source: "ComfyUI",
    childProcessId: processId,
    stream,
    sourceLine: true
  };
  if (level === "error") {
    logger.error("comfy", "process-output", `ComfyUI: ${line}`, meta);
  } else if (level === "warn") {
    logger.warn("comfy", "process-output", `ComfyUI: ${line}`, meta);
  } else {
    logger.info("comfy", "process-output", `ComfyUI: ${line}`, meta);
  }
}

/**
 * Keep traceback details useful without copying prompts, media payloads, or
 * machine-specific paths into the application's retained log files.
 */
export function sanitizeComfyLogLine(line: string): string {
  return line
    .replace(ansiEscapePattern, "")
    .replace(pathPattern, sanitizeLogPath)
    .replace(urlPattern, "[url]")
    .replace(sensitiveValuePattern, "$1[redacted]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1000);
}

function splitCompleteLines(text: string): { lines: string[]; remainder: string } {
  if (!text) return { lines: [], remainder: "" };
  const parts = text.split(/\r?\n/u);
  const endsWithNewline = /(?:\r\n|\n)$/u.test(text);
  return {
    lines: endsWithNewline ? parts.filter(Boolean) : parts.slice(0, -1).filter(Boolean),
    remainder: endsWithNewline ? "" : parts.at(-1) ?? ""
  };
}

async function readRange(
  filename: string,
  position: number,
  length: number
): Promise<{ text: string; bytesRead: number }> {
  if (length <= 0) return { text: "", bytesRead: 0 };
  const handle = await fs.open(filename, "r").catch(() => null);
  if (!handle) return { text: "", bytesRead: 0 };
  try {
    const buffer = Buffer.alloc(Math.min(length, maxFailureReadBytes));
    try {
      const result = await handle.read(buffer, 0, buffer.length, position);
      return {
        text: buffer.subarray(0, result.bytesRead).toString("utf8"),
        bytesRead: result.bytesRead
      };
    } catch {
      return { text: "", bytesRead: 0 };
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function contextMeta(context: ComfyLogBridgeContext, reason: string): Record<string, unknown> {
  return {
    source: "ComfyUI",
    reason,
    ...(context.taskId ? { taskId: context.taskId } : {}),
    ...(context.promptId ? { promptId: context.promptId } : {}),
    ...(context.modelId ? { modelId: context.modelId } : {}),
    ...(context.operationId ? { operationId: context.operationId } : {})
  };
}

/**
 * Tails the selected ComfyUI log and forwards useful lines to AppLogger.
 * It is deliberately opt-in per task so idle applications do not continuously
 * reread a potentially large ComfyUI log file.
 */
export class ComfyLogBridge {
  private filename = "";
  private offset = 0;
  private partial = "";
  private primed = false;

  constructor(
    private readonly logger: AppLogger,
    private readonly comfyRoot: string,
    private readonly context: ComfyLogBridgeContext = {},
    private readonly onIncrementalLine?: (line: string) => void
  ) {}

  async prime(): Promise<void> {
    const selected = await latestComfyLogFile(this.comfyRoot);
    this.filename = selected?.filename ?? "";
    this.offset = selected?.size ?? 0;
    this.partial = "";
    this.primed = true;
  }

  async syncIncremental(reason = "task"): Promise<ComfyLogSyncResult> {
    const selected = await latestComfyLogFile(this.comfyRoot);
    if (!selected) {
      return { lines: 0, errors: 0, available: false, truncated: false };
    }
    if (!this.primed || this.filename !== selected.filename || this.offset > selected.size) {
      this.filename = selected.filename;
      this.offset = this.primed ? 0 : selected.size;
      this.partial = "";
      this.primed = true;
      if (this.offset === selected.size) {
        return { lines: 0, errors: 0, available: true, truncated: false };
      }
    }
    const chunk = await readRange(
      selected.filename,
      this.offset,
      Math.min(maxIncrementalReadBytes, Math.max(0, selected.size - this.offset))
    );
    this.offset += chunk.bytesRead;
    const parsed = splitCompleteLines(this.partial + chunk.text);
    this.partial = parsed.remainder;
    const relevant = parsed.lines.filter((line) => relevantLinePattern.test(line));
    const lines = relevant.length > maxIncrementalLines
      ? relevant.slice(-maxIncrementalLines)
      : relevant;
    const errors = this.logLines(lines, reason, {
      ...contextMeta(this.context, reason),
      ...(relevant.length > lines.length ? { omittedLines: relevant.length - lines.length } : {})
    }, this.onIncrementalLine);
    return {
      lines: lines.length,
      errors,
      available: true,
      truncated: relevant.length > lines.length
    };
  }

  async captureFailure(reason = "failure"): Promise<ComfyLogSyncResult> {
    const selected = await latestComfyLogFile(this.comfyRoot);
    if (!selected) {
      return { lines: 0, errors: 0, available: false, truncated: false };
    }
    const start = Math.max(0, selected.size - maxFailureReadBytes);
    const chunk = await readRange(selected.filename, start, selected.size - start);
    const parsed = splitCompleteLines(chunk.text).lines;
    const lines = parsed.slice(-maxFailureLines);
    const fingerprint = lines.join("\n");
    if (!fingerprint || lastFailureSnapshots.get(selected.filename) === fingerprint) {
      return { lines: 0, errors: 0, available: true, truncated: parsed.length > lines.length };
    }
    lastFailureSnapshots.set(selected.filename, fingerprint);
    const errors = this.logLines(lines, reason, {
      ...contextMeta(this.context, reason),
      capturedLines: lines.length,
      ...(parsed.length > lines.length ? { omittedLines: parsed.length - lines.length } : {})
    });
    this.logger.warn(
      "comfy",
      "log-snapshot",
      `已同步 ComfyUI 最近日志（${reason}）`,
      {
        ...contextMeta(this.context, reason),
        capturedLines: lines.length,
        errorLines: errors,
        ...(parsed.length > lines.length ? { omittedLines: parsed.length - lines.length } : {})
      }
    );
    return {
      lines: lines.length,
      errors,
      available: true,
      truncated: parsed.length > lines.length
    };
  }

  private logLines(
    lines: string[],
    reason: string,
    meta: Record<string, unknown>,
    onLine?: (line: string) => void
  ): number {
    let errors = 0;
    for (const rawLine of lines) {
      const line = sanitizeComfyLogLine(rawLine);
      if (!line) continue;
      onLine?.(line);
      const level = logLevelForLine(line);
      if (level === "error") errors += 1;
      const lineMeta = { ...meta, sourceLine: true };
      if (level === "error") {
        this.logger.error("comfy", "log-line", `ComfyUI: ${line}`, lineMeta);
      } else if (level === "warn") {
        this.logger.warn("comfy", "log-line", `ComfyUI: ${line}`, lineMeta);
      } else {
        this.logger.info("comfy", "log-line", `ComfyUI: ${line}`, lineMeta);
      }
    }
    return errors;
  }
}

export async function captureComfyUiLogFailure(
  logger: AppLogger,
  settings: Settings,
  reason: string,
  context: ComfyLogBridgeContext = {}
): Promise<ComfyLogSyncResult> {
  const comfyRoot = await resolveComfyLogRoot(settings);
  return new ComfyLogBridge(logger, comfyRoot, context)
    .captureFailure(reason);
}
