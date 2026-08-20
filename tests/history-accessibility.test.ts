import { describe, expect, it } from "vitest";
import type { AppState, ImageAssetVersion, ImageHistoryProject } from "../src/types";
import { defaultHistoryFilter } from "../src/core/history-filter";
import { renderHistoryHeading, renderImageLightboxMarkup } from "../src/renderer/pages/history/fragments";
import {
  renderImageHistoryPage,
  type HistoryPageOptions,
  type HistoryPageViewModel
} from "../src/renderer/pages/history/page";

const translate: HistoryPageOptions["t"] = (key) => key;
const renderOptions = {
  t: translate,
  icon: (name: string) => `<i data-lucide="${name}"></i>`,
  escapeHtml: (value: string) => value,
  imageProjectsByNewest: () => [],
  historyFilterModelIds: () => [],
  historyFilterTagNames: () => [],
  imageHistoryMediaUrl: () => "",
  imageHistoryThumbnailCacheKey: () => "",
  preferredImageVersion: () => undefined,
  formatFullHistoryTime: () => "time",
  modelName: () => "model"
} as unknown as HistoryPageOptions;

describe("History accessibility markup", () => {
  it("keeps one tab stop and exposes controlled layout states", () => {
    const markup = renderHistoryHeading({
      activeCount: 2,
      historyKind: "video",
      historyLayout: "masonry",
      description: "History",
      historyFilter: ""
    }, renderOptions);

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="history-tab-video"');
    expect(markup).toContain('aria-controls="history-panel-video"');
    expect(markup).toContain('id="history-tab-image"');
    expect(markup.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).toContain('data-history-layout="masonry"');
    expect(markup).toContain('aria-pressed="true" data-history-layout="masonry"');
    expect(markup).toContain('aria-pressed="false" data-history-layout="album"');
  });

  it("gives History cards a keyboard activation role and an explicit More entry", () => {
    const version = {
      id: "image-version-1",
      kind: "source",
      versionNumber: 1,
      width: 640,
      height: 480,
      modelId: "source",
      createdAt: "2026-08-21T00:00:00.000Z",
      file: { filename: "fixture.png" },
      references: []
    } as unknown as ImageAssetVersion;
    const project = {
      id: "image-project-1",
      title: "Fixture image",
      rating: null,
      favorite: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      versions: [version]
    } as unknown as ImageHistoryProject;
    const state = { history: [], imageHistory: [project] } as unknown as AppState;
    const viewModel = {
      state,
      historyKind: "image",
      historyLayout: "album",
      historyFilter: defaultHistoryFilter,
      historyFilterPanelOpen: false,
      selectedHistoryAssetId: "",
      selectedHistoryVersionId: ""
    } as HistoryPageViewModel;
    const page = renderImageHistoryPage(viewModel, {
      ...renderOptions,
      imageProjectsByNewest: () => [project],
      preferredImageVersion: () => version
    });

    expect(page).toMatch(/data-open-image-history="image-project-1"[^>]*role="button"/);
    expect(page).toContain('aria-keyshortcuts="Enter Space"');
    expect(page).toContain('id="history-panel-image"');
    expect(page).toContain('role="tabpanel" aria-labelledby="history-tab-image"');
    expect(page).toContain('data-history-more');
  });

  it("renders shared image loading actions for gallery and lightbox surfaces", () => {
    const version = {
      id: "image-version-media",
      kind: "source",
      versionNumber: 1,
      width: 640,
      height: 480,
      modelId: "source",
      createdAt: "2026-08-21T00:00:00.000Z",
      file: { filename: "fixture.png", absolutePath: "C:\\fixtures\\fixture.png" },
      references: []
    } as unknown as ImageAssetVersion;
    const project = {
      id: "image-project-media",
      title: "Media fixture",
      rating: null,
      favorite: false,
      updatedAt: "2026-08-21T00:00:00.000Z",
      versions: [version]
    } as unknown as ImageHistoryProject;
    const state = { history: [], imageHistory: [project] } as unknown as AppState;
    const viewModel = {
      state,
      historyKind: "image",
      historyLayout: "masonry",
      historyFilter: defaultHistoryFilter,
      historyFilterPanelOpen: false,
      selectedHistoryAssetId: "",
      selectedHistoryVersionId: ""
    } as HistoryPageViewModel;
    const page = renderImageHistoryPage(viewModel, {
      ...renderOptions,
      imageProjectsByNewest: () => [project],
      preferredImageVersion: () => version,
      imageHistoryMediaUrl: () => "studio-media://history/image-project-media/image-version-media/0",
      imageHistoryThumbnailCacheKey: () => "media-fixture"
    });
    const lightbox = renderImageLightboxMarkup({
      title: "Media fixture",
      mediaUrl: "studio-media://history/image-project-media/image-version-media/0",
      sourcePath: "C:\\fixtures\\fixture.png",
      versionNumber: 1,
      width: 640,
      height: 480
    }, renderOptions);

    expect(page).toContain('data-image-media-surface="gallery"');
    expect(page).toContain('data-image-media-image');
    expect(page).toContain('data-image-media-status');
    expect(page).toContain('data-image-media-retry');
    expect(page).toContain('data-image-media-locate');
    expect(lightbox).toContain('data-image-media-surface="lightbox"');
    expect(lightbox).toContain('data-image-media-source="C:\\fixtures\\fixture.png"');
    expect(lightbox).toContain('data-image-media-status');
  });
});
