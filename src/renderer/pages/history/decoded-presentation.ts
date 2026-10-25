/** Decode separately so replacing a cache preview never exposes an undecoded image. */
export function presentDecodedImage(image: HTMLImageElement, url: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || !image.isConnected) return Promise.resolve(false);
  const candidate = new Image();
  candidate.src = url;
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); signal.removeEventListener("abort", abort);
      if (ok && !signal.aborted && image.isConnected) { image.src = url; resolve(true); }
      else resolve(false);
    };
    const abort = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), 10_000);
    signal.addEventListener("abort", abort, { once: true });
    void candidate.decode().then(() => finish(candidate.naturalWidth > 0), () => finish(false));
  });
}
