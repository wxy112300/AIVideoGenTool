import type { Settings } from "../types.js";

export const modelDownloadSources = [
  { id: "huggingface", label: "Hugging Face", origin: "https://huggingface.co", filesOnly: false },
  { id: "hf-mirror", label: "HF-Mirror · hf-mirror.com", origin: "https://hf-mirror.com", filesOnly: false },
  { id: "hf-mirror-net", label: "HF-Mirror · hf-mirror.net", origin: "https://hf-mirror.net", filesOnly: true },
  { id: "gitee", label: "Gitee · hf-api.gitee.com", origin: "https://hf-api.gitee.com", filesOnly: true },
  { id: "custom", label: "", origin: "", filesOnly: false }
] as const;
export type ModelDownloadSource = typeof modelDownloadSources[number]["id"];
type SourceSettings = Pick<Settings, "modelDownloadSource" | "modelDownloadCustomUrl" | "hfMirrorEnabled">;
const HUGGING_FACE_HOSTS = new Set(["huggingface.co", "www.huggingface.co"]);
export const MODEL_DOWNLOAD_INVALID = "MODEL_DOWNLOAD_INVALID";

export function modelDownloadOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      ? url.origin : null;
  } catch { return null; }
}

export function modelDownloadSource(settings: SourceSettings): ModelDownloadSource {
  return modelDownloadSources.find(source => source.id === settings.modelDownloadSource)?.id
    ?? (settings.hfMirrorEnabled ? "hf-mirror" : "huggingface");
}

export function rewriteHuggingFaceDownloadUrl(url: string, selection: boolean | SourceSettings): string {
  const id = typeof selection === "boolean" ? selection ? "hf-mirror" : "huggingface" : modelDownloadSource(selection);
  if (id === "huggingface") return url;
  const source = modelDownloadSources.find(source => source.id === id)!;
  const origin = id === "custom" && typeof selection !== "boolean" ? modelDownloadOrigin(selection.modelDownloadCustomUrl ?? "") : source.origin;
  if (!origin) return url;

  try {
    const parsed = new URL(url);
    if (!HUGGING_FACE_HOSTS.has(parsed.hostname.toLowerCase())) return url;
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return url;
    // API-only mirrors cannot render repository/model-card pages.
    if (source.filesOnly && !/^\/[^/]+\/[^/]+\/resolve\//.test(parsed.pathname)) return url;
    parsed.host = new URL(origin).host;
    return parsed.toString();
  } catch {
    return url;
  }
}
