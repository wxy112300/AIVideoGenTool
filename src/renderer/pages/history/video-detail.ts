import type { AssetVersion, HistoryAsset } from "../../../types";
import { uiKeys } from "../../../core/i18n-keys";
import type { HistoryPageOptions } from "./page";

interface VideoSidebarView {
  asset: HistoryAsset;
  version: AssetVersion;
  title: string;
  completedAt: string;
  elapsed: string;
  filename: string;
  path: string;
  rating: string;
  primary: string;
  edit: string;
  continuum: string;
  av: string;
  copy: string;
  locate: string;
  upscale: string;
  deleteVersion: string;
  deleteRecord: string;
}

export function renderVideoDetailSidebar(v: VideoSidebarView, o: HistoryPageOptions): string {
  const e = o.escapeHtml, t = o.t, { asset, version } = v;
  return `<aside class="history-detail-sidebar panel history-video-sidebar" aria-label="${t(uiKeys.history.menu.shortcutActions)}">
    <section class="history-side-zone history-side-work">
      <h1 class="history-detail-title" title="${e(v.title)}">${e(v.title)}</h1>
      <p class="history-side-meta">${e(o.modelName(version.modelId))} · ${o.formatVideoDuration(version.duration)} · ${version.width} × ${version.height} · ${version.fps} FPS</p>
      <p class="history-side-time"><span>${v.completedAt} ${t(uiKeys.history.page.completed)}</span><span>${t(uiKeys.history.page.generationTime)} ${v.elapsed}</span></p>
      <div class="history-detail-curation">${v.rating}<button type="button" class="secondary icon-button history-favorite-button ${asset.favorite ? "is-favorite" : ""}" data-history-favorite="${e(asset.id)}" aria-pressed="${asset.favorite}" aria-label="${t(asset.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}" title="${t(asset.favorite ? uiKeys.history.page.unfavorite : uiKeys.history.page.favorite)}">${o.icon("heart")}</button></div>
    </section>
    <section class="history-side-zone history-side-create"><div class="history-side-action-pair">${v.primary}${v.edit}</div>${v.continuum}</section>
    <section class="history-side-zone history-side-files">
      <div class="history-side-heading"><h2>${t(uiKeys.history.page.files)}</h2>${v.av}</div>
      <code class="history-side-filename" title="${e(v.path || v.filename)}">${e(v.filename)}</code>
      <div class="history-side-action-pair">${v.copy}${v.locate}</div>
    </section>
    <section class="history-side-zone history-side-versions">
      <div class="history-side-heading"><h2>${t(uiKeys.history.page.versions)}</h2><span>${asset.versions.length}</span></div>
      <div class="version-switcher history-summary-version-switcher" data-ui-segmented="history-video-versions-${e(asset.id)}" role="group" aria-label="${t(uiKeys.history.page.videoVersions)}">${asset.versions.map(item => `<button type="button" class="ghost" id="history-video-version-${e(item.id)}" data-version-id="${e(item.id)}" aria-pressed="${item.id === version.id}" title="${e(item.kind === "original" ? t(uiKeys.history.page.originalGeneration) : o.modelName(item.modelId))} · ${item.width} × ${item.height}">${t(item.kind === "original" ? uiKeys.history.card.originalShort : uiKeys.history.card.upscaleShort)} · ${o.historyResolutionLabel(asset, item)}</button>`).join("")}</div>
      <div class="history-side-version-actions">${v.upscale}${v.deleteVersion}</div>
    </section>
    <section class="history-side-zone history-side-danger">${v.deleteRecord}</section>
  </aside>`;
}
