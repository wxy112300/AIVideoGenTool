import type { AppApi, AppState, PerformanceMetrics, QueueLifecycle } from "../../../types";
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

function lifecycleKey(lifecycle: QueueLifecycle | undefined): string {
  switch (lifecycle ?? "idle") {
    case "starting": return uiKeys.queue.lifecycle.starting;
    case "running": return uiKeys.queue.lifecycle.running;
    case "pausing": return uiKeys.queue.lifecycle.pausing;
    case "cancelling": return uiKeys.queue.lifecycle.cancelling;
    case "cleaning": return uiKeys.queue.lifecycle.cleaning;
    case "error": return uiKeys.queue.lifecycle.error;
    case "idle": return uiKeys.queue.lifecycle.idle;
  }
}

function lifecycleShortKey(lifecycle: QueueLifecycle | undefined): string {
  switch (lifecycle ?? "idle") {
    case "starting": return uiKeys.queue.lifecycleShort.starting;
    case "running": return uiKeys.queue.lifecycleShort.running;
    case "pausing": return uiKeys.queue.lifecycleShort.pausing;
    case "cancelling": return uiKeys.queue.lifecycleShort.cancelling;
    case "cleaning": return uiKeys.queue.lifecycleShort.cleaning;
    case "error": return uiKeys.queue.lifecycleShort.error;
    case "idle": return uiKeys.queue.lifecycleShort.idle;
  }
}

export function queueLifecycleText(
  lifecycle: QueueLifecycle | undefined,
  t: Translate
): string {
  return t(lifecycleKey(lifecycle));
}

export function queueLifecycleShortText(
  lifecycle: QueueLifecycle | undefined,
  t: Translate
): string {
  return t(lifecycleShortKey(lifecycle));
}

export interface QueueComfyUiStatus {
  label: string;
  shortLabel: string;
  tone: "connected" | "starting" | "ending" | "cancelling" | "cleaning" | "waiting" | "error" | "unknown";
}

export type QueueHeaderTone = "idle" | "pending" | "active" | "error";

export function queueHeaderTone(state: AppState): QueueHeaderTone {
  const lifecycle = state.queueLifecycle ?? "idle";
  const running = state.queue.some((task) => task.status === "running");
  if (lifecycle === "error") return "error";
  if (running || lifecycle === "running" || lifecycle === "pausing") return "active";
  if (state.queueRunning || lifecycle !== "idle") return "pending";
  return "idle";
}

function comfyUiShortKey(
  tone: QueueComfyUiStatus["tone"]
): string {
  switch (tone) {
    case "connected": return uiKeys.queue.comfyUiShort.connected;
    case "starting": return uiKeys.queue.comfyUiShort.starting;
    case "ending": return uiKeys.queue.comfyUiShort.ending;
    case "cancelling": return uiKeys.queue.comfyUiShort.cancelling;
    case "cleaning": return uiKeys.queue.comfyUiShort.cleaning;
    case "waiting": return uiKeys.queue.comfyUiShort.waiting;
    case "error": return uiKeys.queue.comfyUiShort.error;
    case "unknown": return uiKeys.queue.comfyUiShort.unknown;
  }
}

function comfyStatus(
  tone: QueueComfyUiStatus["tone"],
  label: string,
  t: Translate
): QueueComfyUiStatus {
  return { label, shortLabel: `ComfyUI ${t(comfyUiShortKey(tone))}`, tone };
}

export function queueComfyUiStatus(
  state: AppState,
  t: Translate
): QueueComfyUiStatus {
  const lifecycle = state.queueLifecycle ?? "idle";
  const running = state.queue.find((task) => task.status === "running");
  if (lifecycle === "error") {
    return comfyStatus("error", t(uiKeys.queue.comfyUi.error), t);
  }
  if (lifecycle === "starting" || running?.stage?.includes("启动 ComfyUI")) {
    return comfyStatus("starting", t(uiKeys.queue.comfyUi.starting), t);
  }
  if (lifecycle === "cancelling") {
    return comfyStatus("cancelling", t(uiKeys.queue.comfyUi.cancelling), t);
  }
  if (lifecycle === "cleaning") {
    return comfyStatus("cleaning", t(uiKeys.queue.comfyUi.cleaning), t);
  }
  if (lifecycle === "pausing") {
    return comfyStatus("ending", t(uiKeys.queue.comfyUi.ending), t);
  }
  if (lifecycle === "running") {
    return comfyStatus("connected", t(uiKeys.queue.comfyUi.connected), t);
  }
  if (state.queue.some((task) => task.status === "waiting")) {
    return comfyStatus("waiting", t(uiKeys.queue.comfyUi.waiting), t);
  }
  return comfyStatus("unknown", t(uiKeys.queue.comfyUi.unknown), t);
}

function patchQueueElement(
  selector: string,
  value: string,
  dataset?: Record<string, string>
): boolean {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return false;
  element.textContent = value;
  if (dataset) {
    for (const [key, dataValue] of Object.entries(dataset)) {
      element.dataset[key] = dataValue;
    }
  }
  return true;
}

/**
 * Patch the volatile queue fields in place. Returning false means the queue
 * shell is not mounted (or is missing a required stable target), so the
 * caller should fall back to a normal render.
 */
export function patchQueueLiveDom(state: AppState, t: Translate): boolean {
  const comfy = queueComfyUiStatus(state, t);
  const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
  const headerTone = queueHeaderTone(state);
  if (!patchQueueElement("#queue-active-count", t(uiKeys.queue.taskCount, { count: activeTasks.length }), {
    queueState: headerTone
  })) return false;
  if (!patchQueueElement("#queue-comfy-status", comfy.shortLabel, {
    status: comfy.tone
  })) return false;
  const comfyElement = document.querySelector<HTMLElement>("#queue-comfy-status");
  if (comfyElement) comfyElement.title = comfy.label;

  const running = state.queue.find((task) => task.status === "running");
  const remainingSeconds = queueRemainingSeconds(activeTasks, state.history);
  const etaElement = document.querySelector<HTMLElement>("#queue-eta");
  if (etaElement) etaElement.textContent = queueEstimateText(remainingSeconds, t);
  if (etaElement) {
    etaElement.title = remainingSeconds == null
      ? t(uiKeys.queue.etaNoteAfterFirst)
      : t(uiKeys.queue.etaNoteCurrentProgress);
  }
  const runSummary = document.querySelector<HTMLElement>("#queue-run-summary");
  const lifecycle = state.queueLifecycle ?? "idle";
  const queueSessionActive = Boolean(
    state.queueStartedAt &&
    (state.queueRunning || (lifecycle !== "idle" && lifecycle !== "error"))
  );
  if (runSummary) runSummary.hidden = !queueSessionActive;
  const headerElapsed = document.querySelector<HTMLElement>("#queue-runtime-elapsed");
  if (headerElapsed) headerElapsed.textContent = queueSessionActive ? elapsedText(state.queueStartedAt, t) : "";
  const elapsed = document.querySelector<HTMLElement>("#running-elapsed");
  const stageElapsed = document.querySelector<HTMLElement>("#running-stage-elapsed");
  const runningEta = document.querySelector<HTMLElement>("#running-eta");
  const progressLabel = document.querySelector<HTMLElement>("#running-progress-label");
  const progressBar = document.querySelector<HTMLElement>("#running-progress-bar");
  if (!running) {
    return !elapsed && !stageElapsed && !runningEta && !progressLabel && !progressBar;
  }
  if (!elapsed || !stageElapsed || !runningEta || !progressLabel || !progressBar) return false;
  const progress = Math.max(0, Math.min(100, running.progress ?? 0));
  elapsed.textContent = elapsedText(running.startedAt, t);
  stageElapsed.textContent = queueStageElapsedText(running, t);
  runningEta.textContent = t(uiKeys.queue.card.eta, {
    time: queueEstimateText(queueTaskRemainingSeconds(running, state.history), t)
  });
  progressLabel.textContent = `${Math.round(progress)}%`;
  progressBar.style.width = `${progress}%`;
  const progressContainer = progressBar.closest<HTMLElement>("[role=progressbar]");
  progressContainer?.setAttribute("aria-valuenow", String(Math.round(progress)));
  const stage = document.querySelector<HTMLElement>("#running-stage");
  if (stage) stage.textContent = running.stage ?? t(uiKeys.queue.card.preparing);
  return true;
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
    if (state && options.getPage() === "queue") {
      patchQueueLiveDom(state, options.t);
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
