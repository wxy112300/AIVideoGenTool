import type { AssetVersion, Draft, QueueTask } from "../../types";
import { escapeHtml } from "./dom";
import { createTranslator, type Translate } from "../../core/i18n";
import { uiKeys } from "../../core/i18n-keys";

export function historyAspectRatio(ratio: Draft["ratio"] | undefined): string {
  return (
    {
      "16:9": "16 / 9",
      "9:16": "9 / 16",
      "1:1": "1 / 1",
      "4:3": "4 / 3",
      "3:4": "3 / 4",
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

export function formatElapsedDuration(seconds: number, t: Translate = createTranslator("zh-CN").t): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return t(uiKeys.format.elapsed, { minutes, seconds: rounded % 60 });
}

export function formatUpscaleEstimateRange(minSeconds: number, maxSeconds: number, t: Translate = createTranslator("zh-CN").t): string {
  const format = (seconds: number): string => {
    const rounded = Math.max(1, Math.round(seconds));
    if (rounded < 60) return t(uiKeys.format.upscaleSeconds, { value: rounded });
    if (rounded < 3600) return t(uiKeys.format.upscaleMinutes, { value: Math.round(rounded / 60) });
    return t(uiKeys.format.upscaleHours, { value: (rounded / 3600).toFixed(1) });
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

export function historyRenderDuration(version: AssetVersion, t: Translate = createTranslator("zh-CN").t): string {
  if (!version.startedAt) return t(uiKeys.format.unknownDuration);
  const startedAt = Date.parse(version.startedAt);
  const createdAt = Date.parse(version.createdAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(createdAt)) return t(uiKeys.format.unknownDuration);
  return formatElapsedDuration(Math.max(0, (createdAt - startedAt) / 1000), t);
}

export function queueStageElapsedText(task: QueueTask, t: Translate = createTranslator("zh-CN").t): string {
  if (!task.stageStartedAt) return t(uiKeys.format.stagePending);
  const startedAt = Date.parse(task.stageStartedAt);
  return Number.isFinite(startedAt)
    ? t(uiKeys.format.currentStage, { duration: formatElapsedDuration(Math.max(0, (Date.now() - startedAt) / 1000), t) })
    : t(uiKeys.format.stagePending);
}

export function queueEstimateText(seconds: number | null, t: Translate = createTranslator("zh-CN").t): string {
  return seconds == null ? t(uiKeys.format.waitingHistory) : formatElapsedDuration(seconds, t);
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

export function elapsedText(startedAt?: string, t: Translate = createTranslator("zh-CN").t): string {
  if (!startedAt) return t(uiKeys.format.waitingTimer);
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return t(uiKeys.format.running, { value: formatElapsedDuration(seconds, t) });
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
