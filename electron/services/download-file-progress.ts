import { promises as fs } from "node:fs";

/** Monitor real output bytes; never estimate the duration of an installation. */
export async function withDownloadFileProgress(
  destination: string,
  totalBytes: number,
  report: (receivedBytes: number) => void,
  download: () => Promise<unknown>,
  initialBytes = 0
): Promise<void> {
  let closed = false;
  let pending: Promise<void> | undefined;
  let lastBytes = -1;
  const sample = async () => {
    const stat = await fs.stat(destination).catch(() => null);
    if (closed || !stat?.isFile()) return;
    const bytes = Math.min(totalBytes, stat.size);
    if (bytes !== lastBytes) { lastBytes = bytes; report(bytes); }
  };
  report(Math.min(totalBytes, Math.max(0, initialBytes)));
  const timer = setInterval(() => {
    if (!pending) pending = sample().finally(() => { pending = undefined; });
  }, 250);
  try {
    await download();
    await pending;
    await sample();
  } finally {
    closed = true;
    clearInterval(timer);
    await pending;
  }
}
