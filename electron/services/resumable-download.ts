import { promises as fs } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { withDownloadFileProgress } from "./download-file-progress.js";

export function downloadFailure(error: unknown): { code: number | null; detail: string; retryable: boolean } {
  const value = error as { message?: string; stdout?: string; stderr?: string; code?: number };
  const raw = [value?.stderr, value?.stdout, value?.message].filter(item => typeof item === "string").join("\n");
  const code = Number(raw.match(/curl:\s*\((\d+)\)/u)?.[1] ?? raw.match(/命令退出，代码 (\d+)/u)?.[1] ?? value?.code);
  const line = raw.split(/[\r\n]+/u).filter(item => /curl:\s*\(\d+\)/u.test(item)).at(-1) || value?.message || "下载失败";
  const detail = line.replace(/https?:\/\/\S+/giu, "[下载地址]").replace(/[\x00-\x1f\x7f]/gu, " ").slice(-800);
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
}): Promise<void> {
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0) throw new Error("下载大小无效。");
  const deadline = Date.now() + 600_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    input.signal?.throwIfAborted();
    const stat = await fs.lstat(input.destination).catch((error) => {
      if (error.code === "ENOENT") return null; throw error;
    });
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > input.totalBytes)) throw new Error("下载缓存不是独立的有效文件，未覆盖原文件。");
    const offset = stat?.size ?? 0;
    input.onProgress?.(offset);
    if (offset === input.totalBytes) { input.onLog?.("下载缓存字节已齐，继续校验 SHA-256"); return; }
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw new Error("引擎下载已达到10分钟上限，半包保留，可再次点击更新续传。");
    input.onLog?.(`${offset ? `从 ${(offset / 1_000_000).toFixed(1)} MB 继续下载` : "开始下载引擎"}（尝试 ${attempt}/3）`);
    const args = ["-q", "--fail", "--location", "--silent", "--show-error", "--connect-timeout", "20",
      "--speed-limit", "1024", "--speed-time", "30", ...(input.extraArgs ?? []),
      "--continue-at", String(offset), "--output", input.destination, input.url];
    try {
      const transfer = () => input.run(args, timeout);
      if (input.onProgress) await withDownloadFileProgress(input.destination, input.totalBytes, input.onProgress, transfer, offset);
      else await transfer();
      input.signal?.throwIfAborted();
      const complete = await fs.lstat(input.destination);
      if (!complete.isFile() || complete.isSymbolicLink() || complete.nlink !== 1) throw new Error("下载缓存归属改变，未开始安装。");
      if (complete.size !== input.totalBytes) throw Object.assign(new Error("引擎下载未完整结束"), { code: 18 });
      return;
    } catch (error) {
      input.signal?.throwIfAborted();
      const failure = downloadFailure(error);
      input.onLog?.(failure.detail);
      if (!failure.retryable || attempt === 3 || Date.now() >= deadline) {
        const rangeHint = failure.code === 33 ? "；服务器未接受续传，已保留半包，未强制重下" : "";
        throw new Error(`引擎下载失败${failure.code !== null ? `（curl ${failure.code}）` : ""}：${failure.detail}${rangeHint}。下载缓存已保留，可再次点击更新。`);
      }
      input.onLog?.("网络接收失败，保留已下载字节后重试");
      if (input.wait) await input.wait(attempt * 1000, input.signal);
      else await delay(attempt * 1000, undefined, { signal: input.signal });
    }
  }
}
