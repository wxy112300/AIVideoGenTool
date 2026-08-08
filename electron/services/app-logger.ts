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
const logLinePattern = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+([\s\S]*?)(?:\s+\|\s+meta=(\{.*\}))?$/u;

function defaultDirectory(): string {
  return path.join(
    process.env.TEMP || process.env.TMP || os.tmpdir(),
    "ai-video-gen-tool",
    "logs"
  );
}

function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function formatLogRecord(record: AppLogRecord): string {
  const target = `${record.scope}.${record.event}`;
  const metadata = record.meta ? ` | meta=${JSON.stringify(record.meta)}` : "";
  return `[${record.timestamp}] [${record.level.toUpperCase()}] [${target}] ${record.message}${metadata}`;
}

function parseLogRecord(line: string): AppLogRecord | null {
  const match = line.match(logLinePattern);
  if (!match) return null;
  const level = match[2]?.toLowerCase();
  if (!level || !["debug", "info", "warn", "error", "fatal"].includes(level)) return null;
  const target = match[3] ?? "app.unknown";
  const separator = target.indexOf(".");
  let meta: Record<string, unknown> | undefined;
  if (match[5]) {
    try {
      const parsed = JSON.parse(match[5]) as unknown;
      if (isRecord(parsed)) meta = parsed;
    } catch {
      return null;
    }
  }
  return {
    timestamp: match[1] ?? "",
    level: level as AppLogLevel,
    scope: separator > 0 ? target.slice(0, separator) : target,
    event: separator > 0 ? target.slice(separator + 1) : "unknown",
    message: match[4] ?? "",
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
      const sanitizedMeta = sanitizeMeta(meta);
      const record: AppLogRecord = {
        timestamp: this.now().toISOString(),
        level,
        scope: sanitizeMessage(scope),
        event: sanitizeMessage(event),
        message: sanitizeMessage(message),
        ...(sanitizedMeta ? { meta: sanitizedMeta } : {})
      };
      const filename = path.join(this.directory, `app-${dayStamp(this.now())}.log`);
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
        if (record) entries.push({ record, line });
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
        const datedAt = date ? Date.parse(`${date}T00:00:00.000Z`) : Number.NaN;
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
