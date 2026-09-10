import type { AppCacheProgress } from "../../../types";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererCleanup, RendererContext } from "../../contracts";
import { formatBytes } from "../../shared/formatters";

export interface SettingsCacheControllerOptions {
  loadAppCache(): void;
  clearAppCache(): void;
}

export function mountSettingsCacheController(
  context: RendererContext,
  options: SettingsCacheControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;
  let latestProgress: AppCacheProgress | null = null;
  let progressTimer: number | undefined;

  const formatElapsed = (milliseconds: number): string => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const progressStageKeys: Record<AppCacheProgress["phase"], string> = {
    scanning: uiKeys.settings.system.cacheProgressScanning,
    "clearing-session": uiKeys.settings.system.cacheProgressSession,
    "clearing-temporary": uiKeys.settings.system.cacheProgressTemporary,
    rescanning: uiKeys.settings.system.cacheProgressRescanning,
    completed: uiKeys.settings.system.cacheProgressCompleted
  };

  const updateProgressDom = (progress: AppCacheProgress): void => {
    const panel = root.querySelector<HTMLElement>("#app-cache-progress");
    if (!panel) return;
    panel.hidden = false;
    const startedAtMilliseconds = Date.parse(progress.startedAt);
    const elapsedMilliseconds = Number.isFinite(startedAtMilliseconds)
      ? Math.max(0, Date.now() - startedAtMilliseconds)
      : 0;
    const stage = root.querySelector<HTMLElement>("#app-cache-progress-stage");
    const elapsed = root.querySelector<HTMLElement>("#app-cache-progress-elapsed");
    const count = root.querySelector<HTMLElement>("#app-cache-progress-count");
    const bytes = root.querySelector<HTMLElement>("#app-cache-progress-bytes");
    const remaining = root.querySelector<HTMLElement>("#app-cache-progress-remaining");
    const bar = root.querySelector<HTMLElement>("#app-cache-progress-bar");
    const fill = bar?.querySelector<HTMLElement>("span");
    const determinate = progress.phase === "clearing-temporary" && progress.total > 0;
    const progressPercent = determinate
      ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100))
      : 0;

    if (stage) stage.textContent = context.t(progressStageKeys[progress.phase]);
    if (elapsed) elapsed.textContent = context.t(uiKeys.settings.system.cacheProgressElapsed, {
      time: formatElapsed(elapsedMilliseconds)
    });
    if (count) {
      count.textContent = determinate
        ? context.t(uiKeys.settings.system.cacheProgressDirectories, {
          current: progress.current,
          total: progress.total
        })
        : "";
    }
    if (bytes) {
      bytes.textContent = determinate
        ? context.t(uiKeys.settings.system.cacheProgressBytes, {
          processed: formatBytes(progress.processedBytes),
          total: formatBytes(progress.totalBytes)
        })
        : "";
    }
    if (remaining) {
      const estimatedMilliseconds = determinate && progress.current > 0 && progress.current < progress.total
        ? (elapsedMilliseconds / progress.current) * (progress.total - progress.current)
        : 0;
      remaining.textContent = estimatedMilliseconds > 0
        ? context.t(uiKeys.settings.system.cacheProgressRemaining, {
          time: formatElapsed(estimatedMilliseconds)
        })
        : "";
    }
    if (bar) {
      bar.classList.toggle("indeterminate", !determinate);
      if (determinate) bar.setAttribute("aria-valuenow", String(Math.round(progressPercent)));
      else bar.removeAttribute("aria-valuenow");
    }
    if (fill) fill.style.width = determinate ? `${progressPercent}%` : "";
  };

  const stopProgressTimer = (): void => {
    if (progressTimer === undefined) return;
    window.clearInterval(progressTimer);
    progressTimer = undefined;
  };

  const onProgress = (progress: AppCacheProgress): void => {
    latestProgress = progress;
    updateProgressDom(progress);
    if (progress.phase === "completed") {
      stopProgressTimer();
      return;
    }
    if (progressTimer === undefined) {
      progressTimer = window.setInterval(() => {
        if (latestProgress) updateProgressDom(latestProgress);
      }, 1000);
    }
  };

  const unsubscribeProgress = context.events.onAppCacheProgress(onProgress);

  root.querySelector<HTMLButtonElement>("#refresh-app-cache")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.loadAppCache();
  }, { signal });

  root.querySelector<HTMLButtonElement>("#clear-app-cache")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.clearAppCache();
  }, { signal });

  return () => {
    unsubscribeProgress();
    stopProgressTimer();
    events.abort();
  };
}
