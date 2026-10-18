import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const mediaTypes: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
  ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".gif": "image/gif",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".bmp": "image/bmp"
};

/** Transport-neutral range serving. The caller owns asset lookup and authorization. */
export function mediaFileResponse(
  filename: string,
  size: number,
  request: { method: string; headers: { get(name: string): string | null } },
  options: { createReadStream?: typeof createReadStream; desktopCors?: boolean } = {}
): Response {
  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  const invalid = () => new Response("Range not satisfiable", {
    status: 416, headers: { "Content-Range": `bytes */${size}` }
  });
  if (range && (!match || (!match[1] && !match[2]))) return invalid();
  let start = 0;
  let end = size - 1;
  if (match?.[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  } else if (match?.[2]) {
    start = Math.max(0, size - Number(match[2]));
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return invalid();
  end = Math.min(end, size - 1);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": mediaTypes[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": String(end - start + 1)
  });
  if (options.desktopCors) {
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set("Access-Control-Allow-Origin", "*");
  }
  if (match) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  if (request.method === "HEAD") return new Response(null, { status: match ? 206 : 200, headers });
  const stream = Readable.toWeb((options.createReadStream ?? createReadStream)(filename, { start, end }));
  return new Response(stream as BodyInit, { status: match ? 206 : 200, headers });
}
