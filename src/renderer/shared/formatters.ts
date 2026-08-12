import type { AssetVersion, Draft, QueueTask } from "../../types";
import { escapeHtml } from "./dom";

export function historyAspectRatio(ratio: Draft["ratio"] | undefined): string {
  return (
    {
      "16:9": "16 / 9",
      "9:16": "9 / 16",
      "1:1": "1 / 1",
      "4:3": "4 / 3",
      source: "16 / 9"
    }[ratio ?? "source"] ?? "16 / 9"
  );
}

export function interpolationMultiplier(
  value: Draft["frameInterpolation"] | undefined
): 1 | 2 | 4 {
  if (value === "rife2x") return 2;
  if (value === "rife4x") return 4;
  return 1;
}

export function frameRateSummary(
  fps: number,
  interpolation: Draft["frameInterpolation"] | undefined
): string {
  const multiplier = interpolationMultiplier(interpolation);
  return multiplier === 1
    ? `${fps} FPS`
    : `${fps / multiplier} → ${fps} FPS · RIFE ${multiplier}×`;
}

export function formatVideoDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${String(minutes).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

export function formatElapsedDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}分${rounded % 60}秒`;
}

export function formatUpscaleEstimateRange(minSeconds: number, maxSeconds: number): string {
  const format = (seconds: number): string => {
    const rounded = Math.max(1, Math.round(seconds));
    if (rounded < 60) return `${rounded}秒`;
    if (rounded < 3600) return `${Math.round(rounded / 60)}分`;
    return `${(rounded / 3600).toFixed(1)}小时`;
  };
  const minimum = format(minSeconds);
  const maximum = format(maxSeconds);
  return minimum === maximum ? minimum : `${minimum}-${maximum}`;
}

export function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatFullHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function historyRenderDuration(version: AssetVersion): string {
  if (!version.startedAt) return "耗时未知";
  const startedAt = Date.parse(version.startedAt);
  const createdAt = Date.parse(version.createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt)) return "耗时未知";
  return formatElapsedDuration(Math.max(0, (createdAt - startedAt) / 1000));
}

export function queueStageElapsedText(task: QueueTask): string {
  if (!task.stageStartedAt) return "阶段计时待开始";
  const startedAt = Date.parse(task.stageStartedAt);
  return Number.isFinite(startedAt)
    ? `当前阶段 ${formatElapsedDuration(Math.max(0, (Date.now() - startedAt) / 1000))}`
    : "阶段计时待开始";
}

export function queueEstimateText(seconds: number | null): string {
  return seconds == null ? "等待历史数据" : formatElapsedDuration(seconds);
}

export function formatTrimTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatAssetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function elapsedText(startedAt?: string): string {
  if (!startedAt) return "等待计时";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `已运行 ${minutes > 0 ? `${minutes}分` : ""}${seconds % 60}秒`;
}

export function performanceCard(
  label: string,
  id: string,
  value: number | null | undefined,
  suffix: string,
  detail = ""
): string {
  const available = value != null && Number.isFinite(value);
  const normalized = available ? Math.max(0, Math.min(100, value)) : 0;
  return `<article class="panel performance-card"><span>${label}</span><strong id="${id}">${available ? `${Math.round(value)}${suffix}` : "—"}</strong><small id="${id}-detail">${escapeHtml(detail)}</small><div class="metric-bar"><i id="${id}-bar" style="width:${normalized}%"></i></div></article>`;
}
