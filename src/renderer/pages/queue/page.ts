import type { AppState, PerformanceMetrics, QueueTask } from "../../../types";

export interface QueuePageOptions {
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
    ? "当前任务正在运行"
    : activeTasks.some((task) => task.status === "waiting")
      ? "等待任务已暂停"
      : attentionTasks.length
        ? "有任务需要处理"
        : "队列为空";
  const metrics = options.performanceMetrics;
  return `
    <section class="page-heading queue-page-heading">
      <div class="queue-page-heading-main">
        <div class="queue-heading-line">
          <h1>生成队列</h1>
          <div class="queue-overview" aria-label="队列概览">
            <div class="queue-overview-item"><span>等待中</span><strong id="queue-waiting-count">${waitingCount}</strong></div>
            <div class="queue-overview-item"><span>预计剩余</span><strong id="queue-eta">${options.queueEstimateText(remainingSeconds)}</strong><small id="queue-eta-note">${remainingSeconds == null ? "完成首条任务后更准确" : "按历史耗时与当前进度"}</small></div>
          </div>
        </div>
        <p>${activeTasks.length} 项执行任务 · ${attentionTasks.length} 项需处理 · ${queueStatus}</p>
      </div>
      <div class="button-row">
        ${running ? `<span class="queue-mode">${state.queueRunning ? "自动继续后续任务" : "本条完成后暂停"}</span>` : `<button class="primary button-with-icon" id="start-queue" ${state.queue.some((task) => task.status === "waiting") ? "" : "disabled"}>${options.icon("play")}开始队列</button>`}
      </div>
    </section>
    <section class="performance-grid" aria-label="性能监测">
      ${options.performanceCard("CPU", "metric-cpu", metrics?.cpuPercent, "%")}
      ${options.performanceCard("系统内存", "metric-memory", metrics && metrics.memoryTotalBytes > 0 ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100 : null, "%", metrics && metrics.memoryTotalBytes > 0 ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : "")}
      ${options.performanceCard("GPU", "metric-gpu", metrics?.gpuPercent, "%", metrics?.gpuTemperature != null ? `${metrics.gpuTemperature}°C` : "")}
      ${options.performanceCard("显存", "metric-vram", metrics?.vramUsedBytes != null && metrics.vramTotalBytes ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100 : null, "%", metrics?.vramUsedBytes != null && metrics.vramTotalBytes != null ? `${formatBytes(metrics.vramUsedBytes)} / ${formatBytes(metrics.vramTotalBytes)}` : "")}
    </section>
    ${state.queue.length === 0
        ? `<div class="empty panel"><h2>队列还是空的</h2><p>从创建页加入一个任务后，就可以在这里运行。</p><button class="secondary button-with-icon" data-page="create">${options.icon("plus")}去创建</button></div>`
      : `<section class="queue-section"><div class="queue-section-heading"><div><h2>执行队列</h2><span class="muted">等待和当前运行中的任务按此顺序执行。</span></div><span class="model-badge">${activeTasks.length} 项</span></div><div class="task-list">${activeTasks.length ? activeTasks.map((task, index) => options.renderTaskCard(task, index + 1)).join("") : `<div class="empty panel queue-section-empty"><h2>没有等待中的任务</h2><p>下面的任务需要重试、编辑或移除。</p></div>`}</div></section>${attentionTasks.length ? `<section class="queue-section queue-attention-section"><div class="queue-section-heading"><div><h2>需要处理</h2><span class="muted">失败和取消的任务不会自动占用执行队列。</span></div><span class="model-badge warning-badge">${attentionTasks.length} 项</span></div><div class="task-list">${attentionTasks.map((task) => options.renderTaskCard(task, 0)).join("")}</div></section>` : ""}`}
    `;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
