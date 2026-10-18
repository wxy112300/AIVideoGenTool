/** Bound requests, retain decoded-source blobs across virtual tile remounts, never cache a miss. */
export class CoverLoader {
  private running = 0;
  private queue: Array<() => void> = [];
  private cache = new Map<string, { blob: Blob; expires: number }>();
  private bytes = 0;
  load(image: HTMLImageElement, url: string, failed: () => void): () => void {
    const controller = new AbortController();
    let objectUrl = "";
    let timer = 0;
    let attempt = 0;
    const display = (blob: Blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); image.src = objectUrl;
    };
    const run = () => {
      if (controller.signal.aborted) return;
      const cached = this.cache.get(url);
      if (cached && cached.expires > Date.now()) { display(cached.blob); return; }
      this.queue.push(() => {
        if (controller.signal.aborted) { this.pump(); return; }
        this.running++;
        void fetch(url, { signal: controller.signal }).then(async (response) => {
          if (response.status === 503 && attempt++ < 90) {
            // The host is filling its disk cache. Release the HTTP slot before retrying.
            timer = window.setTimeout(run, Math.min(1000, 250 + attempt * 50)); return;
          }
          if (!response.ok) throw new Error("Cover unavailable");
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const old = this.cache.get(url); if (old) this.bytes -= old.blob.size;
          this.cache.delete(url); this.cache.set(url, { blob, expires: Date.now() + 60_000 }); this.bytes += blob.size;
          while (this.cache.size > 128 || this.bytes > 24 * 1024 * 1024) {
            const key = this.cache.keys().next().value!; this.bytes -= this.cache.get(key)!.blob.size; this.cache.delete(key);
          }
          display(blob);
        }).catch(() => { if (!controller.signal.aborted) failed(); }).finally(() => { this.running--; this.pump(); });
      });
      this.pump();
    };
    run();
    return () => { controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }
  private pump(): void { while (this.running < 4 && this.queue.length) this.queue.shift()!(); }
}
