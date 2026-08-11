import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppLogLevel, AppLogRecord, AppLogSnapshot } from "../../src/types.js";

export interface AppLoggerOptions {
  directory?: string;
  retentionDays?: number;
  maxFiles?: number;
  maxRecords?: number;
  now?: () => Date;
}

const logFilePattern = /^app-(\d{4}-\d{2}-\d{2})\.log$/u;
const defaultRetentionDays = 7;
const defaultMaxFiles = 14;
const defaultMaxRecords = 500;
const sensitiveKeyPattern = /(?:prompt|negative|text|content|body|token|secret|password|file|path|filename|image|video|url)/iu;
const windowsPathPattern = /(?:[A-Za-z]:\\|\\\\)[^\r\n"']+/gu;
const unixPathPattern = /(?:^|\s)(?:\/Users\/|\/home\/|\/tmp\/|\/var\/|\/mnt\/)[^\r\n"']+/gu;
const urlPattern = /https?:\/\/[^\s"']+/giu;
const logLinePattern = /^\[([^\]]+)\]\[([^\]]+)\]\s+([^:]+):\s+([\s\S]*?)(?:\s+\|\s+(.+))?$/u;
const legacyLogLinePattern = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+([\s\S]*?)(?:\s+\|\s+meta=(\{.*\}))?$/u;

function defaultDirectory(): string {
  return path.join(
    process.env.TEMP || process.env.TMP || os.tmpdir(),
    "ai-video-gen-tool",
    "logs"
  );
}

export function localDayStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDayStart(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return Number.NaN;
  return new Date(year, month - 1, date).getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeMessage(value: string): string {
  return value
    .replace(windowsPathPattern, "[path]")
    .replace(unixPathPattern, " [path]")
    .replace(urlPattern, "[url]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (sensitiveKeyPattern.test(key)) return "[redacted]";
  if (depth > 2) return "[truncated]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? sanitizeMessage(value) : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([entryKey, entryValue]) => [
          entryKey,
          sanitizeValue(entryKey, entryValue, depth + 1)
        ])
    );
  }
  return String(value).slice(0, 120);
}

function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const sanitized = Object.fromEntries(
    Object.entries(meta)
      .slice(0, 40)
      .map(([key, value]) => [key, sanitizeValue(key, value)])
  );
  return Object.keys(sanitized).length ? sanitized : undefined;
}

const displayScopeNames: Record<string, string> = {
  app: "App",
  assets: "Assets",
  comfy: "ComfyUI",
  environment: "Environment",
  performance: "Performance",
  process: "Process",
  prompt: "Prompt",
  queue: "Queue",
  renderer: "Renderer",
  service: "Service",
  ui: "UI",
  window: "Window"
};

function displayScope(scope: string): string {
  return displayScopeNames[scope.toLowerCase()] ??
    scope.charAt(0).toUpperCase() + scope.slice(1);
}

function displayEvent(event: string): string {
  return event
    .split(/[-_.]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function eventSlug(event: string): string {
  return event
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}-${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}:${pad(date.getMilliseconds(), 3)}`;
}

function formatMetaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatMetaValue(item)).join(",")}]`;
  }
  if (value && typeof value === "object") return "[object]";
  if (typeof value === "string") {
    const safe = value.replaceAll("\"", "'");
    return /[\s|=,[\]]/u.test(safe) ? `"${safe}"` : safe;
  }
  return String(value);
}

function formatMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([key, value]) => `${key.charAt(0).toUpperCase()}${key.slice(1)}=${formatMetaValue(value)}`)
    .join(" ");
}

function formatLogRecord(record: AppLogRecord): string {
  const level = record.level.toUpperCase();
  const target = `${displayScope(record.scope)}.${displayEvent(record.event)}`;
  const metadata = formatMeta(record.meta);
  return `[${formatTimestamp(record.timestamp)}][${level}] ${target}: ${record.message}${metadata ? ` | ${metadata}` : ""}`;
}

function parseMeta(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  const meta: Record<string, unknown> = {};
  const pattern = /([A-Za-z][A-Za-z0-9]*)=(?:"((?:[^"\\]|\\.)*)"|(\[[^\]]*\])|(\S+))/gu;
  for (const match of text.matchAll(pattern)) {
    const key = match[1];
    if (!key) continue;
    const raw = match[2] ?? match[3] ?? match[4] ?? "";
    if (match[3]) {
      meta[key.charAt(0).toLowerCase() + key.slice(1)] = raw === "[]"
        ? []
        : raw.slice(1, -1).split(",").filter(Boolean);
    } else if (raw === "true" || raw === "false") {
      meta[key.charAt(0).toLowerCase() + key.slice(1)] = raw === "true";
    } else if (raw !== "" && Number.isFinite(Number(raw))) {
      meta[key.charAt(0).toLowerCase() + key.slice(1)] = Number(raw);
    } else {
      meta[key.charAt(0).toLowerCase() + key.slice(1)] = raw;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

function parseLogRecord(line: string): AppLogRecord | null {
  const modern = line.match(logLinePattern);
  if (modern) {
    const level = modern[2]?.trim().toLowerCase();
    if (!level || !["debug", "info", "warn", "error", "fatal"].includes(level)) return null;
    const target = modern[3] ?? "App.Unknown";
    const separator = target.indexOf(".");
    const displayScopeValue = separator > 0 ? target.slice(0, separator) : target;
    const displayEventValue = separator > 0 ? target.slice(separator + 1) : "Unknown";
    const scope = Object.entries(displayScopeNames).find(([, name]) => name === displayScopeValue)?.[0] ?? displayScopeValue.toLowerCase();
    return {
      timestamp: modern[1] ?? "",
      level: level as AppLogLevel,
      scope,
      event: eventSlug(displayEventValue),
      message: modern[4] ?? "",
      ...(parseMeta(modern[5]) ? { meta: parseMeta(modern[5]) } : {})
    };
  }

  const legacy = line.match(legacyLogLinePattern);
  if (!legacy) return null;
  const level = legacy[2]?.toLowerCase();
  if (!level || !["debug", "info", "warn", "error", "fatal"].includes(level)) return null;
  const target = legacy[3] ?? "app.unknown";
  const separator = target.indexOf(".");
  let meta: Record<string, unknown> | undefined;
  if (legacy[5]) {
    try {
      const parsed = JSON.parse(legacy[5]) as unknown;
      if (isRecord(parsed)) meta = parsed;
    } catch {
      return null;
    }
  }
  return {
    timestamp: legacy[1] ?? "",
    level: level as AppLogLevel,
    scope: separator > 0 ? target.slice(0, separator) : target,
    event: separator > 0 ? target.slice(separator + 1) : "unknown",
    message: legacy[4] ?? "",
    ...(meta ? { meta } : {})
  };
}

export function safeLogErrorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeMessage(error.message || error.name);
  if (typeof error === "string") return sanitizeMessage(error);
  try {
    return sanitizeMessage(JSON.stringify(error));
  } catch {
    return "Unknown error";
  }
}

export function appLogDirectory(): string {
  return defaultDirectory();
}

let sharedLogger: AppLogger | undefined;

export function getApplicationLogger(): AppLogger {
  sharedLogger ??= new AppLogger();
  return sharedLogger;
}

export class AppLogger {
  readonly directory: string;
  readonly retentionDays: number;
  private readonly maxFiles: number;
  private readonly maxRecords: number;
  private readonly now: () => Date;
  private writesSinceCleanup = 0;

  constructor(options: AppLoggerOptions = {}) {
    this.directory = options.directory || defaultDirectory();
    this.retentionDays = Math.max(1, options.retentionDays ?? defaultRetentionDays);
    this.maxFiles = Math.max(1, options.maxFiles ?? defaultMaxFiles);
    this.maxRecords = Math.max(1, options.maxRecords ?? defaultMaxRecords);
    this.now = options.now ?? (() => new Date());
    this.ensureDirectory();
    this.cleanup();
  }

  debug(scope: string, event: string, message: string, meta?: Record<string, unknown>): void {
    this.write("debug", scope, event, message, meta);
  }

  info(scope: string, event: string, message: string, meta?: Record<string, unknown>): void {
    this.write("info", scope, event, message, meta);
  }

  warn(scope: string, event: string, message: string, meta?: Record<string, unknown>): void {
    this.write("warn", scope, event, message, meta);
  }

  error(scope: string, event: string, message: string, meta?: Record<string, unknown>): void {
    this.write("error", scope, event, message, meta);
  }

  fatal(scope: string, event: string, message: string, meta?: Record<string, unknown>): void {
    this.write("fatal", scope, event, message, meta);
  }

  write(
    level: AppLogLevel,
    scope: string,
    event: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    try {
      this.ensureDirectory();
      const writtenAt = this.now();
      const sanitizedMeta = sanitizeMeta(meta);
      const record: AppLogRecord = {
        timestamp: writtenAt.toISOString(),
        level,
        scope: sanitizeMessage(scope),
        event: sanitizeMessage(event),
        message: sanitizeMessage(message),
        ...(sanitizedMeta ? { meta: sanitizedMeta } : {})
      };
      const filename = path.join(this.directory, `app-${localDayStamp(writtenAt)}.log`);
      appendFileSync(filename, `${formatLogRecord(record)}\n`, "utf8");
      this.writesSinceCleanup += 1;
      if (this.writesSinceCleanup >= 50) {
        this.writesSinceCleanup = 0;
        this.cleanup();
      }
    } catch {
      // Logging must never crash or block the application.
    }
  }

  recent(limit = this.maxRecords): AppLogSnapshot {
    this.ensureDirectory();
    const recordLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(this.maxRecords, Math.floor(limit)))
      : this.maxRecords;
    const entries: Array<{ record: AppLogRecord; line: string }> = [];
    const filenames = this.logFiles().reverse();
    for (const filename of filenames) {
      const lines = readFileSync(path.join(this.directory, filename), "utf8")
        .split(/\r?\n/u)
        .filter(Boolean)
        .reverse();
      for (const line of lines) {
        const record = parseLogRecord(line);
        if (record) entries.push({ record, line: formatLogRecord(record) });
        if (entries.length >= recordLimit) break;
      }
      if (entries.length >= recordLimit) break;
    }
    const selected = entries.slice(0, recordLimit).reverse();
    return {
      directory: this.directory,
      retentionDays: this.retentionDays,
      records: selected.map((entry) => entry.record),
      text: selected.map((entry) => entry.line).join("\n")
    };
  }

  cleanup(): void {
    this.ensureDirectory();
    const cutoff = this.now().getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
    const files = this.logFiles()
      .map((filename) => {
        const fullPath = path.join(this.directory, filename);
        const date = filename.match(logFilePattern)?.[1];
        const datedAt = date ? localDayStart(date) : Number.NaN;
        return {
          filename,
          fullPath,
          modifiedAt: Number.isFinite(datedAt) ? datedAt : statSync(fullPath).mtimeMs
        };
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    for (const [index, file] of files.entries()) {
      if (file.modifiedAt < cutoff || index >= this.maxFiles) {
        rmSync(file.fullPath, { force: true });
      }
    }
  }

  private ensureDirectory(): void {
    if (!existsSync(this.directory)) mkdirSync(this.directory, { recursive: true });
  }

  private logFiles(): string[] {
    return readdirSync(this.directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && logFilePattern.test(entry.name))
      .map((entry) => entry.name);
  }
}
