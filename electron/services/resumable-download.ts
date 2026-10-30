import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { withDownloadFileProgress } from "./download-file-progress.js";

export function downloadFailure(error: unknown, t: Translate = createNativeTranslator(undefined).t): { code: number | null; detail: string; retryable: boolean } {
  const value = error as { message?: string; stdout?: string; stderr?: string; code?: number };
  const raw = [value?.stderr, value?.stdout, value?.message].filter(item => typeof item === "string").join("\n");
  const code = Number(raw.match(/curl:\s*\((\d+)\)/u)?.[1] ?? value?.code ?? raw.match(/命令退出，代码 (\d+)/u)?.[1]);
  const line = raw.split(/[\r\n]+/u).filter(item => /curl:\s*\(\d+\)/u.test(item)).at(-1) || value?.message || t(uiKeys.softwareDownload.failed);
  const detail = line.replace(/https?:\/\/\S+/giu, t(uiKeys.softwareDownload.address)).replace(/[\x00-\x1f\x7f]/gu, " ").slice(-800);
  return { code: Number.isFinite(code) ? code : null, detail,
    retryable: [6, 7, 18, 28, 35, 52, 55, 56, 92].includes(code)
      || (code === 22 && /(?:error:|HTTP\S*)\s*(?:408|429|500|502|503|504)\b/iu.test(raw)) };
}

/** Bounded GET retries. Each fresh curl reads the actual local offset; no nested --retry. */
export async function downloadWithResume(input: {
  url: string; destination: string; totalBytes: number; extraArgs?: string[]; signal?: AbortSignal;
  run(args: string[], timeoutMs: number): Promise<unknown>;
  onProgress?: (bytes: number) => void; onLog?: (message: string) => void;
  /** Isolated tests only; production uses a cancellable 1s/2s backoff. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0) throw new Error(t(uiKeys.softwareDownload.invalidSize));
  const deadline = Date.now() + 600_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    input.signal?.throwIfAborted();
    const stat = await fs.lstat(input.destination).catch((error) => {
      if (error.code === "ENOENT") return null; throw error;
    });
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > input.totalBytes)) throw new Error(t(uiKeys.softwareDownload.unsafeCache));
    const offset = stat?.size ?? 0;
    input.onProgress?.(offset);
    if (offset === input.totalBytes) { input.onLog?.(t(uiKeys.softwareDownload.cacheComplete)); return; }
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw new Error(t(uiKeys.softwareDownload.deadline));
    input.onLog?.(t(uiKeys.softwareDownload.attempt, { action: offset ? t(uiKeys.softwareDownload.resuming, { size: (offset / 1_000_000).toFixed(1) }) : t(uiKeys.softwareDownload.starting), attempt: attempt }));
    const args = ["-q", "--fail", "--location", "--silent", "--show-error", "--connect-timeout", "20",
      "--speed-limit", "1024", "--speed-time", "30", ...(input.extraArgs ?? []),
      "--continue-at", String(offset), "--output", input.destination, input.url];
    try {
      const transfer = () => input.run(args, timeout);
      if (input.onProgress) await withDownloadFileProgress(input.destination, input.totalBytes, input.onProgress, transfer, offset);
      else await transfer();
      input.signal?.throwIfAborted();
      const complete = await fs.lstat(input.destination);
      if (!complete.isFile() || complete.isSymbolicLink() || complete.nlink !== 1) throw new Error(t(uiKeys.softwareDownload.ownershipChanged));
      if (complete.size !== input.totalBytes) throw Object.assign(new Error(t(uiKeys.softwareDownload.incomplete)), { code: 18 });
      return;
    } catch (error) {
      input.signal?.throwIfAborted();
      const failure = downloadFailure(error, t);
      input.onLog?.(failure.detail);
      if (!failure.retryable || attempt === 3 || Date.now() >= deadline) {
        const rangeHint = failure.code === 33 ? t(uiKeys.softwareDownload.rangeRejected) : "";
        throw new Error(t(uiKeys.softwareDownload.transferFailed, { code: failure.code !== null ? t(uiKeys.softwareDownload.curlCode, { code: failure.code }) : "", detail: failure.detail, hint: rangeHint }));
      }
      input.onLog?.(t(uiKeys.softwareDownload.retrying));
      if (input.wait) await input.wait(attempt * 1000, input.signal);
      else await delay(attempt * 1000, undefined, { signal: input.signal });
    }
  }
}
