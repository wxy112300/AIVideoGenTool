import type { Draft, TaskPerformanceStats } from "../../../types";
import type { HistoryPageOptions } from "./page";
import { uiKeys } from "../../../core/i18n-keys";

export function videoRecordHeading(label: string, icon: string, o: HistoryPageOptions, detail = ""): string {
  return `<div class="history-record-heading"><h2>${o.icon(icon)}${o.escapeHtml(label)}</h2>${detail ? `<span>${detail}</span>` : ""}</div>`;
}

export function videoRecordStats(items: Array<[string, string | number]>, o: Pick<HistoryPageOptions, "escapeHtml">): string {
  return `<div class="history-record-stats">${items.map(([label, value]) => `<div><span>${o.escapeHtml(label)}</span><b>${o.escapeHtml(String(value))}</b></div>`).join("")}</div>`;
}

export function videoPerformance(stats: TaskPerformanceStats | undefined, o: HistoryPageOptions): string {
  if (!stats) return `<p class="history-empty-note">${o.t(uiKeys.history.detail.legacyNotSaved)}</p>`;
  const t = o.t, e = o.escapeHtml, missing = t(uiKeys.history.detail.unavailable);
  const bytes = (v: number | null | undefined) => v == null ? missing : o.formatBytes(v);
  const percent = (v: number | null | undefined) => v == null ? missing : `${Math.round(v)}%`;
  const ratio = (v: number | null | undefined, total: number | null | undefined) => v == null || !total ? 0 : Math.max(0, Math.min(100, v / total * 100));
  const rows: Array<[string, string, number, string?]> = [
    [t(uiKeys.history.detail.vramPeak), `${bytes(stats.vramPeakBytes)} / ${bytes(stats.vramTotalBytes)}`, ratio(stats.vramPeakBytes, stats.vramTotalBytes)],
    [t(uiKeys.history.detail.systemMemoryPeak), `${bytes(stats.memoryPeakBytes)} / ${bytes(stats.memoryTotalBytes)}`, ratio(stats.memoryPeakBytes, stats.memoryTotalBytes)],
    [t(uiKeys.history.detail.gpuUtilization), percent(stats.gpuAveragePercent), ratio(stats.gpuAveragePercent, 100)],
    [t(uiKeys.history.detail.gpuTemperaturePeak), stats.gpuTemperaturePeak == null ? missing : `${Math.round(stats.gpuTemperaturePeak)}°C`, ratio(stats.gpuTemperaturePeak, 100), (stats.gpuTemperaturePeak ?? 0) >= 80 ? "warning" : ""]
  ];
  const extra: Array<[string, string]> = [
    [t(uiKeys.history.detail.cpuUsage), `${percent(stats.cpuAveragePercent)} · ${t(uiKeys.history.detail.peak, { value: percent(stats.cpuPeakPercent) })}`],
    [t(uiKeys.history.detail.gpuUtilization), t(uiKeys.history.detail.peak, { value: percent(stats.gpuPeakPercent) })],
    [t(uiKeys.history.page.memoryAverage), `${bytes(stats.memoryAverageBytes)} · ${bytes(stats.memoryTotalBytes)}`],
    [t(uiKeys.history.detail.sampleSummary), `${t(uiKeys.history.detail.samples, { count: stats.sampleCount })} · ${t(uiKeys.history.detail.gpuSamples, { count: stats.gpuSampleCount, duration: stats.durationSeconds.toFixed(1) })}`]
  ];
  if (stats.vramPeakBytes != null && stats.vramBaselineBytes != null) extra.push([t(uiKeys.history.detail.vramPeak), t(uiKeys.history.detail.increase, { value: bytes(Math.max(0, stats.vramPeakBytes - stats.vramBaselineBytes)) })]);
  const duration = Number.isFinite(stats.durationSeconds) && stats.durationSeconds >= 0 ? `${Math.floor(stats.durationSeconds / 60)}:${String(Math.floor(stats.durationSeconds % 60)).padStart(2, "0")}` : missing;
  return `<div class="history-performance-duration"><span>${t(uiKeys.history.page.elapsed)}</span><b>${e(duration)}</b></div><div class="history-record-meters">${rows.map(([label, value, fill, tone]) => `<div><span>${e(label)}</span><span class="history-record-meter ${tone ?? ""}" aria-hidden="true"><i style="width:${fill}%"></i></span><b>${e(value)}</b></div>`).join("")}</div>
    <details class="history-record-disclosure"><summary>${t(uiKeys.history.page.lowFrequencySummary)}</summary><dl>${extra.map(([label, value]) => `<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join("")}</dl><p>${t(uiKeys.history.detail.sampleNote)}</p></details>`;
}

export function videoLoraRecords(loras: ReadonlyArray<Draft["videoLoras"][number]>, o: HistoryPageOptions): string {
  if (!loras.length) return `<p class="history-empty-note">${o.t(uiKeys.history.detail.noLora)}</p>`;
  return `<div class="history-record-loras">${loras.map((lora, index) => {
    const strength = lora.historyOnly || !Number.isFinite(lora.strength) ? null : lora.strength;
    return `<div><span>${index + 1}</span><span class="history-record-lora-name" title="${o.escapeHtml([lora.name, lora.filename, lora.modelFamily, lora.historyOnly ? "" : o.videoLoraPurposeLabel(lora.purpose)].filter(Boolean).join(" · "))}">${o.escapeHtml(lora.name)}</span><span class="history-record-meter" aria-hidden="true"><i style="width:${strength == null ? 0 : Math.min(100, Math.abs(strength) / 2 * 100)}%"></i></span><b>${strength == null ? "—" : strength.toFixed(2)}</b></div>`;
  }).join("")}</div>`;
}
