import type { AppState, ComfyRuntimeState, PerformanceMetrics, QueueTask } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { elapsedText } from "../../shared/formatters";
import {
  queueOperationStatus,
  queueComfyUiStatus,
  queueHeaderTone
} from "./live-status";

export interface QueuePageOptions {
  t: Translate;
  escapeHtml(value: unknown): string;
  performanceMetrics: PerformanceMetrics | null;
  comfyRuntime: ComfyRuntimeState;
  environmentScanning?: boolean;
  queueRemainingSeconds(tasks: QueueTask[]): number | null;
  queueEstimateText(seconds: number | null): string;
  performanceCard(
    label: string,
    id: string,
    value: number | null | undefined,
    suffix: string,
    detail?: string
  ): string;
  renderTaskCard(task: QueueTask, queuePosition: number, moveAvailability?: QueueMoveAvailability): string;
  icon(name: string, className?: string): string;
}

export interface QueueMoveAvailability {
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function queueMoveAvailability(
  tasks: ReadonlyArray<QueueTask>,
  index: number
): QueueMoveAvailability {
  const task = tasks[index];
  if (!task || task.status !== "waiting") {
    return { canMoveUp: false, canMoveDown: false };
  }
  const runningIndex = tasks.findIndex((candidate) => candidate.status === "running");
  // A stale queue may contain a waiting item before the active task. Keep it
  // visible, but do not expose controls that could make that ordering worse.
  if (runningIndex >= 0 && index < runningIndex) {
    return { canMoveUp: false, canMoveDown: false };
  }
  const waitingIndexes = tasks
    .map((candidate, candidateIndex) => candidate.status === "waiting" ? candidateIndex : -1)
    .filter((candidateIndex) => candidateIndex >= 0);
  const waitingIndex = waitingIndexes.indexOf(index);
  const previousWaiting = waitingIndex > 0 ? waitingIndexes[waitingIndex - 1] : undefined;
  const nextWaiting = waitingIndex >= 0 && waitingIndex < waitingIndexes.length - 1
    ? waitingIndexes[waitingIndex + 1]
    : undefined;
  return {
    canMoveUp: previousWaiting != null && (runningIndex < 0 || previousWaiting > runningIndex),
    canMoveDown: nextWaiting != null && (runningIndex < 0 || index > runningIndex)
  };
}

function renderQueuePerformanceGrid(
  options: QueuePageOptions,
  className: string
): string {
  const metrics = options.performanceMetrics;
  return `<section class="performance-grid queue-performance-grid ${className}" aria-label="${options.t(uiKeys.queue.performance)}">
      ${options.performanceCard(options.t(uiKeys.queue.cpu), "metric-cpu", metrics?.cpuPercent, "%")}
      ${options.performanceCard(options.t(uiKeys.queue.systemMemory), "metric-memory", metrics && metrics.memoryTotalBytes > 0 ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100 : null, "%", metrics && metrics.memoryTotalBytes > 0 ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.gpu), "metric-gpu", metrics?.gpuPercent, "%", metrics?.gpuTemperature != null ? `${metrics.gpuTemperature}°C` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.vram), "metric-vram", metrics?.vramUsedBytes != null && metrics.vramTotalBytes ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100 : null, "%", metrics?.vramUsedBytes != null && metrics.vramTotalBytes != null ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}` : "")}
    </section>`;
}

function renderQueueSectionHeading(
  options: QueuePageOptions,
  count: number
): string {
  return `<div class="queue-section-heading"><div><h2>${options.t(uiKeys.queue.executionTitle)}</h2><span class="muted">${options.t(uiKeys.queue.executionDescription)}</span></div><span class="model-badge">${options.t(uiKeys.queue.count, { count })}</span></div>`;
}

function renderWaitingEmpty(options: QueuePageOptions): string {
  return `<div class="empty panel queue-section-empty"><h2>${options.t(uiKeys.queue.waitingEmptyTitle)}</h2><p>${options.t(uiKeys.queue.waitingEmptyDescription)}</p></div>`;
}

export function renderQueuePage(
  state: AppState,
  options: QueuePageOptions
): string {
  const running = state.queue.find((task) => task.status === "running");
  const activeTasks = state.queue.filter((task) => task.status === "waiting" || task.status === "running");
  const attentionTasks = state.queue.filter((task) => task.status === "failed" || task.status === "cancelled");
  const remainingSeconds = options.queueRemainingSeconds(activeTasks);
  const lifecycle = state.queueLifecycle ?? "idle";
  const comfyUi = queueComfyUiStatus(
    state,
    options.t,
    options.comfyRuntime,
    options.environmentScanning ?? false
  );
  const operation = queueOperationStatus(state, options.t);
  const headerTone = queueHeaderTone(state);
  // Keep the total ETA visible as soon as there is queued work. The elapsed
  // counter stays empty until a queue run actually starts, but hiding the
  // whole summary made a useful pre-run estimate disappear.
  const showRunSummary = activeTasks.length > 0 || Boolean(
    state.queueStartedAt &&
    (state.queueRunning || (lifecycle !== "idle" && lifecycle !== "error"))
  );
  const hasWaitingTasks = state.queue.some((task) => task.status === "waiting");
  const runningIndex = running ? activeTasks.indexOf(running) : -1;
  const waitingTasks = activeTasks.filter((task) => task.status === "waiting");
  const primaryMode = state.queueRunning ? "end" : running ? "continue" : "start";
  const primaryLabel = state.queueRunning
    ? options.t(uiKeys.queue.end)
    : running
      ? options.t(uiKeys.queue.continueQueue)
      : options.t(uiKeys.queue.start);
  const primaryTitle = state.queueRunning
    ? options.t(uiKeys.queue.endHint)
    : running
      ? options.t(uiKeys.queue.continueQueue)
      : operation.visible
        ? operation.message
        : options.t(uiKeys.queue.start);
  const primaryDisabled = ["pausing", "cancelling", "cleaning", "error"].includes(lifecycle)
    || ["starting", "restarting", "stopping"].includes(options.comfyRuntime.phase)
    || (!state.queueRunning && !running && !hasWaitingTasks);
  const executionHeading = renderQueueSectionHeading(options, activeTasks.length);
  const waitingMarkup = waitingTasks.length
    ? waitingTasks.map((task) => {
        const queuePosition = activeTasks.indexOf(task) + 1;
        return options.renderTaskCard(task, queuePosition, queueMoveAvailability(activeTasks, queuePosition - 1));
      }).join("")
    : renderWaitingEmpty(options);
  const queueBody = running
    ? `<section class="queue-section queue-execution-section queue-has-active">
        ${executionHeading}
        <div class="queue-active-task">
          ${options.renderTaskCard(running, runningIndex + 1, queueMoveAvailability(activeTasks, runningIndex))}
        </div>
        <div class="task-list queue-pending-list">${waitingMarkup}</div>
      </section>`
    : `${state.queue.length === 0
        ? `<div class="empty panel queue-empty-state"><h2>${options.t(uiKeys.queue.emptyTitle)}</h2><p>${options.t(uiKeys.queue.emptyDescription)}</p><button class="secondary button-with-icon" data-page="create">${options.icon("plus")}${options.t(uiKeys.queue.create)}</button></div>`
        : `<section class="queue-section queue-execution-section">${executionHeading}<div class="task-list">${activeTasks.length ? waitingMarkup : renderWaitingEmpty(options)}</div></section>`}`;
  return `
    <section class="page-heading queue-page-heading" aria-labelledby="queue-title">
      <div class="queue-page-heading-main">
        <div class="queue-heading-line" data-queue-header-tone="${headerTone}">
          <div class="queue-title-group">
            <h1 id="queue-title">${options.t(uiKeys.queue.title)}</h1>
            <span class="model-badge queue-task-count-badge" id="queue-active-count" data-queue-state="${headerTone}" aria-live="polite">${options.t(uiKeys.queue.taskCount, { count: activeTasks.length })}</span>
          </div>
          <span class="queue-heading-divider" aria-hidden="true"></span>
          <div class="queue-runtime-status" aria-live="polite">
            <span id="queue-comfy-status" class="queue-runtime-badge" data-status="${comfyUi.tone}" title="${comfyUi.label}">${comfyUi.shortLabel}</span>
          </div>
          <div id="queue-run-summary" class="queue-run-summary" aria-label="${options.t(uiKeys.queue.ariaOverview)}" ${showRunSummary ? "" : "hidden"}>
            <span class="queue-run-metric queue-run-elapsed"><span id="queue-runtime-elapsed">${showRunSummary ? elapsedText(state.queueStartedAt, options.t) : ""}</span></span>
            <span class="queue-run-metric" title="${remainingSeconds == null ? options.t(uiKeys.queue.etaNoteAfterFirst) : options.t(uiKeys.queue.etaNoteCurrentProgress)}"><span>${options.t(uiKeys.queue.etaShort)}</span><strong id="queue-eta">${options.queueEstimateText(remainingSeconds)}</strong></span>
          </div>
        </div>
      </div>
      <div class="button-row queue-heading-actions">
        <label class="ios-switch-field queue-preview-toggle" title="${options.t(uiKeys.queue.livePreviewTip)}">
          <span>${options.t(uiKeys.queue.livePreview)}</span>
          <input id="h3-live-preview" type="checkbox" ${state.settings.h3LivePreview ? "checked" : ""}>
          <span class="ios-switch" aria-hidden="true"></span>
        </label>
        <button class="${state.queueRunning ? "secondary" : "primary"} button-with-icon queue-primary-action" id="queue-primary-action" data-queue-primary-mode="${primaryMode}" title="${primaryTitle}" ${primaryDisabled ? "disabled" : ""}>${options.icon(state.queueRunning ? "pause" : "play")}<span id="queue-primary-label">${primaryLabel}</span></button>
      </div>
    </section>
    <div class="queue-operation-status" id="queue-operation-status" data-tone="${operation.tone}" ${operation.visible ? "" : "hidden"} role="status" aria-live="polite"><span class="queue-operation-indicator" aria-hidden="true"></span><span id="queue-operation-message">${options.escapeHtml(operation.message)}</span></div>
    ${renderQueuePerformanceGrid(options, "queue-top-performance-grid")}
    ${queueBody}
    ${attentionTasks.length ? `<section class="queue-section queue-attention-section"><div class="queue-section-heading"><div><h2>${options.t(uiKeys.queue.attentionTitle)}</h2><span class="muted">${options.t(uiKeys.queue.attentionDescription)}</span></div><span class="model-badge warning-badge">${options.t(uiKeys.queue.count, { count: attentionTasks.length })}</span></div><div class="task-list">${attentionTasks.map((task) => options.renderTaskCard(task, 0)).join("")}</div></section>` : ""}
    `;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
