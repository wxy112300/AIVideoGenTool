import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { historyCoverCandidates, historyCoverSeed, scoreHistoryCoverPixels } from "../../src/core/history-cover.js";
import type { AssetVersion, HistoryAsset } from "../../src/types.js";
import type { HistoryQueryService } from "./history-query-service.js";

const execute = promisify(execFile);

/** CPU-only, one producer at a time, writing the existing v3 cache with the same source guard. */
export class LanBrowserCovers {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly jobs = new Map<string, Promise<string | null>>();
  private readonly failedUntil = new Map<string, number>();

  constructor(private readonly query: HistoryQueryService) {}

  async get(asset: HistoryAsset, version: AssetVersion, filename: string, signal: AbortSignal, wait = true): Promise<string | null> {
    const key = this.query.coverCacheKeyForVideoVersion(asset, version);
    const lookup = await this.query.lookupHistoryCover(key, filename);
    if (lookup.state === "hit") return this.cacheFilename(lookup.url);
    if (lookup.state !== "miss" || signal.aborted) return null;
    const existing = this.jobs.get(key);
    if (existing) return wait ? existing : null;
    if (this.jobs.size >= 12 || (this.failedUntil.get(key) ?? 0) > Date.now()) return null;
    for (const [failedKey, until] of this.failedUntil) if (until <= Date.now()) this.failedUntil.delete(failedKey);
    const job = this.tail.catch(() => undefined).then(async () => {
      if (signal.aborted) return null;
      // A desktop producer may have filled the same cache while this job waited.
      const latest = await this.query.lookupHistoryCover(key, filename);
      if (latest.state === "hit") return this.cacheFilename(latest.url);
      if (latest.state !== "miss") return null;
      let selected: number | null = null;
      let best = -80;
      for (const time of historyCoverCandidates(version.duration, historyCoverSeed(asset.id, version.id))) {
        signal.throwIfAborted();
        const pixels = await this.frame(filename, time, ["-vf", "scale=32:18", "-pix_fmt", "rgba", "-f", "rawvideo"], signal);
        const score = scoreHistoryCoverPixels(pixels);
        if (score !== null && score >= best) { best = score; selected = time; }
      }
      if (selected === null) { this.failedUntil.set(key, Date.now() + 30_000); return null; }
      const bytes = await this.frame(filename, selected, [
        "-vf", "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease",
        "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg"
      ], signal);
      signal.throwIfAborted();
      const saved = await this.query.saveHistoryCoverIfCurrent({
        key, sourcePath: filename, sourceRevision: latest.sourceRevision,
        data: Uint8Array.from(bytes).buffer
      });
      return saved.state === "saved" ? this.cacheFilename(saved.url) : null;
    }).catch(() => {
      if (!signal.aborted) this.failedUntil.set(key, Date.now() + 30_000);
      return null;
    }).finally(() => this.jobs.delete(key));
    this.jobs.set(key, job);
    this.tail = job;
    return wait ? job : null;
  }

  private cacheFilename(url: string): string | null {
    const match = new URL(url).pathname.match(/^\/([a-f0-9]{64})\.(jpg|png)$/);
    return match ? this.query.coverPathFromDigest(match[1]!, `.${match[2]!}`) : null;
  }

  private async frame(filename: string, time: number, output: string[], signal: AbortSignal): Promise<Buffer> {
    const result = await execute("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", String(time),
      "-i", filename, "-frames:v", "1", "-an", "-threads", "1", ...output, "pipe:1"
    ], { encoding: "buffer", signal, timeout: 12_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    return result.stdout;
  }
}
