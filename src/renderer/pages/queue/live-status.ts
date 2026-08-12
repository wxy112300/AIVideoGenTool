import type { AppApi, AppState, PerformanceMetrics } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import {
  elapsedText,
  formatBytes,
  queueEstimateText,
  queueStageElapsedText
} from "../../shared/formatters";
import {
  queueRemainingSeconds,
  queueTaskRemainingSeconds
} from "./helpers";
import type { Page } from "../../contracts";

export interface QueueLiveStatusOptions {
  studio: AppApi;
  t: Translate;
  getState(): AppState | undefined;
  getPage(): Page;
  setPerformanceMetrics(metrics: PerformanceMetrics): void;
}

function setMetric(id: string, value: number | null, detail = ""): void {
  const available = value != null && Number.isFinite(value);
  const label = document.querySelector<HTMLElement>(`#${id}`);
  const detailElement = document.querySelector<HTMLElement>(`#${id}-detail`);
  const bar = document.querySelector<HTMLElement>(`#${id}-bar`);
  if (label) label.textContent = available ? `${Math.round(value)}%` : "—";
  if (detailElement) detailElement.textContent = detail;
  if (bar) bar.style.width = `${available ? Math.max(0, Math.min(100, value)) : 0}%`;
}

export function createQueueLiveStatus(options: QueueLiveStatusOptions) {
  let performancePolling = false;
  let pollingTimer: number | undefined;

  const refresh = async (): Promise<void> => {
    if (performancePolling) return;
    const state = options.getState();
    if (!state) return;
    performancePolling = true;
    try {
      const metrics = await options.studio.getPerformanceMetrics(state.settings);
      options.setPerformanceMetrics(metrics);
      if (options.getPage() !== "queue") return;
      setMetric("metric-cpu", metrics.cpuPercent);
      setMetric(
        "metric-memory",
        metrics.memoryTotalBytes > 0
          ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100
          : null,
        metrics.memoryTotalBytes > 0
          ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}`
          : ""
      );
      setMetric(
        "metric-gpu",
        metrics.gpuPercent,
        metrics.gpuTemperature == null ? "" : `${metrics.gpuTemperature}°C`
      );
      setMetric(
        "metric-vram",
        metrics.vramUsedBytes != null && metrics.vramTotalBytes
          ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100
          : null,
        metrics.vramUsedBytes != null && metrics.vramTotalBytes != null
          ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}`
          : ""
      );
    } finally {
      performancePolling = false;
    }
  };

  const updateQueueStatus = (): void => {
    const state = options.getState();
    if (!state) return;
    const running = state.queue.find((task) => task.status === "running");
    const elapsed = document.querySelector<HTMLElement>("#running-elapsed");
    if (elapsed && running) elapsed.textContent = elapsedText(running.startedAt, options.t);
    const stageElapsed = document.querySelector<HTMLElement>("#running-stage-elapsed");
    if (stageElapsed && running) stageElapsed.textContent = queueStageElapsedText(running, options.t);
    const runningEta = document.querySelector<HTMLElement>("#running-eta");
    if (runningEta && running) {
      runningEta.textContent = options.t(uiKeys.queue.card.eta, { time: queueEstimateText(queueTaskRemainingSeconds(running, state.history), options.t) });
    }
    const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
    const remainingSeconds = queueRemainingSeconds(activeTasks, state.history);
    const waitingCount = activeTasks.filter((task) => task.status === "waiting").length;
    const waitingElement = document.querySelector<HTMLElement>("#queue-waiting-count");
    if (waitingElement) waitingElement.textContent = String(waitingCount);
    const etaElement = document.querySelector<HTMLElement>("#queue-eta");
    if (etaElement) etaElement.textContent = queueEstimateText(remainingSeconds, options.t);
    const etaNote = document.querySelector<HTMLElement>("#queue-eta-note");
    if (etaNote) {
      etaNote.textContent = remainingSeconds == null
        ? options.t(uiKeys.queue.etaNoteAfterFirst)
        : options.t(uiKeys.queue.etaNoteCurrentProgress);
    }
  };

  return {
    refresh,
    start(): () => void {
      pollingTimer = window.setInterval(() => {
        void refresh();
        updateQueueStatus();
      }, 2_000);
      return () => {
        if (pollingTimer !== undefined) {
          window.clearInterval(pollingTimer);
          pollingTimer = undefined;
        }
      };
    }
  };
}
