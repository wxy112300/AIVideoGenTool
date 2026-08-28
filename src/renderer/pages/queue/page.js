import { uiKeys } from "../../../core/i18n-keys";
import { activeQueueTasks } from "../../../core/queue";
import { elapsedText } from "../../shared/formatters";
import { queueOperationStatus, queueComfyUiStatus, queueHeaderTone } from "./live-status";
function queueMoveAvailability(tasks, index, reorderableTaskIds) {
    const task = tasks[index];
    if (!task || task.status !== "waiting") {
        return { canDrag: false };
    }
    if (reorderableTaskIds && !reorderableTaskIds.includes(task.id)) {
        return { canDrag: false };
    }
    const runningIndex = tasks.findIndex((candidate) => candidate.status === "running");
    // A stale queue may contain a waiting item before the active task. Keep it
    // visible, but do not expose controls that could make that ordering worse.
    if (runningIndex >= 0 && index < runningIndex) {
        return { canDrag: false };
    }
    const waitingIndexes = tasks
        .map((candidate, candidateIndex) => candidate.status === "waiting" ? candidateIndex : -1)
        .filter((candidateIndex) => candidateIndex >= 0);
    const reorderableWaitingIndexes = reorderableTaskIds ?? waitingIndexes.filter((candidateIndex) => runningIndex < 0 || candidateIndex > runningIndex);
    return {
        canDrag: reorderableWaitingIndexes.length > 1 && (runningIndex < 0 || index > runningIndex)
    };
}
function renderQueuePerformanceGrid(options, className) {
    const metrics = options.performanceMetrics;
    return `<section class="performance-grid queue-performance-grid ${className}" aria-label="${options.t(uiKeys.queue.performance)}">
      ${options.performanceCard(options.t(uiKeys.queue.cpu), "metric-cpu", metrics?.cpuPercent, "%")}
      ${options.performanceCard(options.t(uiKeys.queue.systemMemory), "metric-memory", metrics && metrics.memoryTotalBytes > 0 ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100 : null, "%", metrics && metrics.memoryTotalBytes > 0 ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.gpu), "metric-gpu", metrics?.gpuPercent, "%", metrics?.gpuTemperature != null ? `${metrics.gpuTemperature}°C` : "")}
      ${options.performanceCard(options.t(uiKeys.queue.vram), "metric-vram", metrics?.vramUsedBytes != null && metrics.vramTotalBytes ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100 : null, "%", metrics?.vramUsedBytes != null && metrics.vramTotalBytes != null ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}` : "")}
    </section>`;
}
function renderQueueSectionHeading(options, count) {
    return `<div class="queue-section-heading"><div><h2>${options.t(uiKeys.queue.executionTitle)}</h2><span class="muted">${options.t(uiKeys.queue.executionDescription)}</span></div><span class="model-badge">${options.t(uiKeys.queue.count, { count })}</span></div>`;
}
function renderWaitingEmpty(options) {
    return `<div class="empty panel queue-section-empty"><h2>${options.t(uiKeys.queue.waitingEmptyTitle)}</h2><p>${options.t(uiKeys.queue.waitingEmptyDescription)}</p></div>`;
}
function renderQueuePauseBoundary(options) {
    return `<div class="queue-pause-boundary" data-queue-boundary-marker role="group" aria-label="${options.t(uiKeys.queue.pauseBoundary.title)}">
    <button type="button" class="queue-pause-boundary-handle" data-queue-boundary-drag aria-label="${options.t(uiKeys.queue.pauseBoundary.drag)}" title="${options.t(uiKeys.queue.pauseBoundary.drag)}" aria-keyshortcuts="ArrowUp ArrowDown Home End">${options.icon("grip-horizontal")}</button>
    <div class="queue-pause-boundary-copy"><strong>${options.t(uiKeys.queue.pauseBoundary.title)}</strong><span>${options.t(uiKeys.queue.pauseBoundary.description)}</span></div>
    <button type="button" class="ghost icon-button queue-pause-boundary-clear" data-queue-boundary-clear aria-label="${options.t(uiKeys.queue.pauseBoundary.clear)}" title="${options.t(uiKeys.queue.pauseBoundary.clearTitle)}">${options.icon("x")}</button>
  </div>`;
}
export function renderQueuePage(state, options) {
    const activeTasks = activeQueueTasks(state.queue);
    const running = activeTasks.find((task) => task.status === "running");
    const attentionTasks = state.queue.filter((task) => task.status === "failed" || task.status === "cancelled");
    const remainingSeconds = options.queueRemainingSeconds(activeTasks);
    const lifecycle = state.queueLifecycle ?? "idle";
    const comfyUi = queueComfyUiStatus(state, options.t, options.comfyRuntime, options.environmentScanning ?? false);
    const operation = queueOperationStatus(state, options.t);
    const headerTone = queueHeaderTone(state);
    // Keep the total ETA visible as soon as there is queued work. The elapsed
    // counter stays empty until a queue run actually starts, but hiding the
    // whole summary made a useful pre-run estimate disappear.
    const showRunSummary = activeTasks.length > 0 || Boolean(state.queueStartedAt &&
        (state.queueRunning || (lifecycle !== "idle" && lifecycle !== "error")));
    const hasWaitingTasks = state.queue.some((task) => task.status === "waiting");
    const runningIndex = running ? activeTasks.indexOf(running) : -1;
    const reorderableWaitingTaskIds = activeTasks
        .filter((task, index) => task.status === "waiting" && (runningIndex < 0 || index > runningIndex))
        .map((task) => task.id);
    const waitingTasks = activeTasks.filter((task) => task.status === "waiting");
    const rawPauseBoundary = state.queuePauseBoundary;
    const hasPauseBoundary = Number.isInteger(rawPauseBoundary) && activeTasks.length > 0;
    const pauseBoundary = hasPauseBoundary
        ? Math.max(1, Math.min(activeTasks.length, rawPauseBoundary))
        : undefined;
    const waitingBoundaryIndex = pauseBoundary === undefined
        ? -1
        : Math.max(0, pauseBoundary - (running ? 1 : 0));
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
        || (!state.queueRunning && !running && !hasPauseBoundary && !hasWaitingTasks);
    const executionHeading = renderQueueSectionHeading(options, activeTasks.length);
    let waitingMarkup = waitingTasks.length || hasPauseBoundary ? waitingTasks.map((task, waitingIndex) => {
            const boundaryMarkup = waitingIndex === waitingBoundaryIndex
                ? renderQueuePauseBoundary(options)
                : "";
            const queuePosition = activeTasks.indexOf(task) + 1;
            const deferred = pauseBoundary !== undefined && queuePosition - 1 >= pauseBoundary;
            return `${boundaryMarkup}${options.renderTaskCard(task, queuePosition, queueMoveAvailability(activeTasks, queuePosition - 1, reorderableWaitingTaskIds), deferred)}`;
        }).join("")
        : renderWaitingEmpty(options);
    if (hasPauseBoundary && waitingBoundaryIndex >= waitingTasks.length) {
        waitingMarkup += renderQueuePauseBoundary(options);
    }
    const queueBody = running
        ? `<section class="queue-section queue-execution-section queue-has-active">
        ${executionHeading}
        <div class="queue-active-task">
          ${options.renderTaskCard(running, runningIndex + 1, queueMoveAvailability(activeTasks, runningIndex, reorderableWaitingTaskIds))}
        </div>
        <div class="task-list queue-pending-list" data-queue-drop-list="pending">${waitingMarkup}</div>
      </section>`
        : `${state.queue.length === 0
            ? `<div class="empty panel queue-empty-state"><h2>${options.t(uiKeys.queue.emptyTitle)}</h2><p>${options.t(uiKeys.queue.emptyDescription)}</p><button class="secondary button-with-icon" data-page="create">${options.icon("plus")}${options.t(uiKeys.queue.create)}</button></div>`
            : `<section class="queue-section queue-execution-section">${executionHeading}<div class="task-list" data-queue-drop-list="waiting">${activeTasks.length ? waitingMarkup : renderWaitingEmpty(options)}</div></section>`}`;
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
function formatBytes(bytes) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
