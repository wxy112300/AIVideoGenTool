import type { AppState, PerformanceMetrics, QueueTask } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";

export interface QueuePageOptions {
  t: Translate;
  performanceMetrics: PerformanceMetrics | null;
  queueRemainingSeconds(tasks: QueueTask[]): number | null;
  queueEstimateText(seconds: number | null): string;
  performanceCard(
    label: string,
    id: string,
    value: number | null | undefined,
    suffix: string,
    detail?: string
  ): string;
  renderTaskCard(task: QueueTask, queuePosition: number): string;
  icon(name: string, className?: string): string;
}

export function renderQueuePage(
  state: AppState,
  options: QueuePageOptions
): string {
  const running = state.queue.find((task) => task.status === "running");
  const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
  const attentionTasks = state.queue.filter((task) => task.status === "failed" || task.status === "cancelled");
  const waitingCount = activeTasks.filter((task) => task.status === "waiting").length;
  const remainingSeconds = options.queueRemainingSeconds(activeTasks);
  const queueStatus = running
    ? options.t(uiKeys.queue.statusRunning)
    : activeTasks.some((task) => task.status === "waiting")
      ? options.t(uiKeys.queue.statusPaused)
      : attentionTasks.length
        ? options.t(uiKeys.queue.statusAttention)
        : options.t(uiKeys.queue.statusEmpty);
  const metrics = options.performanceMetrics;
  return `
    <section class="page-heading queue-page-heading">
      <div class="queue-page-heading-main">
        <div class="queue-heading-line">
          <h1>${options.t(uiKeys.queue.title)}</h1>
          <div class="queue-overview" aria-label="${options.t(uiKeys.queue.ariaOverview)}">
            <div class="queue-overview-item"><span>${options.t(uiKeys.queue.waiting)}</span><strong id="queue-waiting-count">${waitingCount}</strong></div>
            <div class="queue-overview-item"><span>${options.t(uiKeys.queue.eta)}</span><strong id="queue-eta">${options.queueEstimateText(remainingSeconds)}</strong><small id="queue-eta-note">${remainingSeconds == null ? options.t(uiKeys.queue.etaNoteAfterFirst) : options.t(uiKeys.queue.etaNoteCurrentProgress)}</small></div>
          </div>
        </div>
        <p>${options.t(uiKeys.queue.summary, { activeCount: activeTasks.length, attentionCount: attentionTasks.length, status: queueStatus })}</p>
      </div>
      <div class="button-row">
        ${running ? `<span class="queue-mode">${state.queueRunning ? options.t(uiKeys.queue.automaticContinue) : options.t(uiKeys.queue.pauseAfterCurrent)}</span>` : `<button class="primary button-with-icon" id="start-queue" ${state.queue.some((task) => task.status === "waiting") ? "" : "disabled"}>${options.icon("play")}${options.t(uiKeys.queue.start)}</button>`}
      </div>
    </section>
    <section class="performance-grid" aria-label="${options.t(uiKeys.queue.performance)}">
      ${options.performanceCard(options.t(uiKeys.queue.cpu), "metric-cpu", metrics?.cpuPercent, "%")}
      ${options.performanceCard(options.t(uiKeys.queue.systemMemory), "metric-memory", metrics && metrics.memoryTotalBytes > 0 ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100 : null, "%", metrics && metrics.memoryTotalBytes > 0 ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.gpu), "metric-gpu", metrics?.gpuPercent, "%", metrics?.gpuTemperature != null ? `${metrics.gpuTemperature}°C` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.vram), "metric-vram", metrics?.vramUsedBytes != null && metrics.vramTotalBytes ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100 : null, "%", metrics?.vramUsedBytes != null && metrics.vramTotalBytes != null ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}` : "")}
    </section>
    ${state.queue.length === 0
        ? `<div class="empty panel"><h2>${options.t(uiKeys.queue.emptyTitle)}</h2><p>${options.t(uiKeys.queue.emptyDescription)}</p><button class="secondary button-with-icon" data-page="create">${options.icon("plus")}${options.t(uiKeys.queue.create)}</button></div>`
      : `<section class="queue-section"><div class="queue-section-heading"><div><h2>${options.t(uiKeys.queue.executionTitle)}</h2><span class="muted">${options.t(uiKeys.queue.executionDescription)}</span></div><span class="model-badge">${options.t(uiKeys.queue.count, { count: activeTasks.length })}</span></div><div class="task-list">${activeTasks.length ? activeTasks.map((task, index) => options.renderTaskCard(task, index + 1)).join("") : `<div class="empty panel queue-section-empty"><h2>${options.t(uiKeys.queue.waitingEmptyTitle)}</h2><p>${options.t(uiKeys.queue.waitingEmptyDescription)}</p></div>`}</div></section>${attentionTasks.length ? `<section class="queue-section queue-attention-section"><div class="queue-section-heading"><div><h2>${options.t(uiKeys.queue.attentionTitle)}</h2><span class="muted">${options.t(uiKeys.queue.attentionDescription)}</span></div><span class="model-badge warning-badge">${options.t(uiKeys.queue.count, { count: attentionTasks.length })}</span></div><div class="task-list">${attentionTasks.map((task) => options.renderTaskCard(task, 0)).join("")}</div></section>` : ""}`}
    `;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
