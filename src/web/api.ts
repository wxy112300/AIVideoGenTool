import type { BrowseLibraryInfo, BrowsePage, BrowseVideo, BrowseVideoPrompt } from "../core/lan-browser";
import type { HistoryFilterState } from "../core/history-filter";
import type { HistoryMetadataPatch } from "../types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(response.status, body.error ?? "");
  }
  return response.json() as Promise<T>;
}
export const api = {
  info: () => request<BrowseLibraryInfo>("/api/v1/library"),
  prompt: (item: BrowseVideo, signal?: AbortSignal) => request<BrowseVideoPrompt>(
    `/api/v1/videos/${encodeURIComponent(item.id)}/versions/${encodeURIComponent(item.versionId)}/prompt`, { signal }),
  query: (filter: HistoryFilterState, signal?: AbortSignal) =>
    request<BrowsePage>(`/api/v1/videos?q=${encodeURIComponent(JSON.stringify(filter))}`, { signal }),
  page: (id: string, offset: number, limit = 48, signal?: AbortSignal) =>
    request<BrowsePage>(`/api/v1/queries/${encodeURIComponent(id)}/items?offset=${offset}&limit=${limit}`, { signal }),
  around: (id: string, assetId: string) => request<BrowsePage>(`/api/v1/queries/${encodeURIComponent(id)}/items?around=${encodeURIComponent(assetId)}&limit=3`),
  detail: (id: string, versionId?: string) => request<BrowseVideo>(`/api/v1/videos/${encodeURIComponent(id)}${versionId ? `?version=${encodeURIComponent(versionId)}` : ""}`),
  update: (item: BrowseVideo, patch: HistoryMetadataPatch) => request<BrowseVideo>(
    `/api/v1/videos/${encodeURIComponent(item.id)}/metadata?version=${encodeURIComponent(item.versionId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": item.revision }, body: JSON.stringify(patch)
    })
};
