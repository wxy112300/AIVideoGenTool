import { describe, expect, it } from "vitest";
import type { AppState, AssetVersion, HistoryAsset, ImageAssetVersion, ImageHistoryProject } from "../src/types";
import { defaultHistoryFilter } from "../src/core/history-filter";
import { renderHistoryHeading, renderImageLightboxMarkup } from "../src/renderer/pages/history/fragments";
import {
  renderHistoryDetailPage,
  renderHistoryPage,
  renderImageHistoryDetailPage,
  renderImageHistoryPage,
  type HistoryPageOptions,
  type HistoryPageViewModel
} from "../src/renderer/pages/history/page";
import { formatVideoDuration } from "../src/renderer/shared/formatters";

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
    expect(lightbox).toContain('role="dialog" aria-modal="true"');
    expect(lightbox).toContain('tabindex="-1"');
    expect(lightbox).toContain('data-image-lightbox-close');
  });

  it("keeps detail actions visible without changing their existing selectors", () => {
    const videoVersion = {
      id: "video-version-detail",
      taskId: "video-task-detail",
      kind: "original",
      createdAt: "2026-08-21T00:00:00.000Z",
      outputFilename: "fixture.mp4",
      modelId: "minimax_h3_fl2va",
      width: 848,
      height: 480,
      duration: 124 / 24,
      fps: 24,
      workflowPath: "fixture-workflow.json",
      comfyPromptId: "video-prompt-detail",
      comfyOutputs: {},
      files: [{ filename: "fixture.mp4", subfolder: "", type: "output", absolutePath: "C:\\fixtures\\fixture.mp4" }]
    } as unknown as AssetVersion;
    const videoUpscale = {
      ...videoVersion,
      id: "video-upscale-detail",
      kind: "upscale",
      outputFilename: "fixture-4k.mp4",
      width: 1920,
      height: 1080,
      files: [{ filename: "fixture-4k.mp4", subfolder: "", type: "output", absolutePath: "C:\\fixtures\\fixture-4k.mp4" }]
    } as unknown as AssetVersion;
    const videoAsset = {
      mediaKind: "video",
      id: "video-asset-detail",
      taskId: "video-task-detail",
      title: "Detail fixture",
      outputFilename: "fixture.mp4",
      createdAt: videoVersion.createdAt,
      updatedAt: videoVersion.createdAt,
      modelId: videoVersion.modelId,
      favorite: false,
      rating: null,
      tags: [],
      duration: 5,
      resolution: 480,
      fps: 24,
      prompt: "A detail fixture",
      seed: 12,
      comfyPromptId: "video-prompt-detail",
      comfyOutputs: {},
      files: videoVersion.files,
      defaultVersionId: videoVersion.id,
      versions: [videoVersion, videoUpscale]
    } as unknown as HistoryAsset;
    const imageSource = {
      id: "image-source-detail",
      versionNumber: 1,
      kind: "source",
      createdAt: videoVersion.createdAt,
      modelId: "source",
      workflowPath: "",
      prompt: "",
      promptVersion: 0,
      references: [],
      width: 640,
      height: 480,
      format: "png",
      file: { filename: "fixture.png", subfolder: "", type: "input", absolutePath: "C:\\fixtures\\fixture.png" }
    } as unknown as ImageAssetVersion;
    const imageEdit = {
      ...imageSource,
      id: "image-edit-detail",
      versionNumber: 2,
      kind: "edit",
      parentVersionId: imageSource.id,
      modelId: "qwen-image-edit-2511",
      prompt: "Edit fixture",
      file: { filename: "fixture-edit.png", subfolder: "", type: "output", absolutePath: "C:\\fixtures\\fixture-edit.png" }
    } as unknown as ImageAssetVersion;
    const imageProject = {
      mediaKind: "image",
      id: "image-project-detail",
      title: "Image detail fixture",
      createdAt: videoVersion.createdAt,
      updatedAt: videoVersion.createdAt,
      favorite: false,
      rating: null,
      tags: [],
      coverMode: "auto",
      nextVersionNumber: 3,
      versions: [imageSource, imageEdit]
    } as unknown as ImageHistoryProject;
    const state = {
      history: [videoAsset],
      imageHistory: [imageProject],
      settings: { outputDirectory: "C:\\fixtures" }
    } as unknown as AppState;
    const detailOptions: HistoryPageOptions = {
      ...renderOptions,
      formatBytes: () => "0 B",
      videoLoraPurposeLabel: () => "style",
      h3ReferenceRoleLabel: () => "reference",
      imageReferenceRoleLabel: () => "base",
      formatVideoDuration,
      formatElapsedDuration: () => "1s",
      historyAssetsByNewest: (history) => history,
      imageProjectsByNewest: (projects) => projects,
      preferredVersion: () => videoVersion,
      currentHistoryVersion: () => videoVersion,
      historyMediaUrl: () => "studio-media://history/video-asset-detail/video-version-detail/0",
      historyCoverCacheKey: () => "",
      historyCoverSeed: () => 0,
      historyInitialCoverTime: () => 0,
      historyResolutionLabel: () => "480p",
      historyRenderDuration: () => "5s",
      versionVideoIndex: () => 0,
      versionShortEdge: (version) => Math.min(version.width, version.height),
      preferredImageVersion: () => imageEdit,
      currentImageHistoryVersion: () => imageEdit,
      imageHistoryMediaUrl: () => "studio-media://history/image-project-detail/image-edit-detail/0",
      imageHistoryThumbnailCacheKey: () => "",
      imageProjectCoverVersion: () => imageSource,
      isRetiredVideoModel: () => false,
      imageHistoryGenerationSummary: () => ({ qualityLabel: "balanced", loraLabel: "none" })
    };
    const videoViewModel = {
      state,
      historyKind: "video",
      historyLayout: "masonry",
      historyFilter: defaultHistoryFilter,
      historyFilterPanelOpen: false,
      selectedHistoryAssetId: videoAsset.id,
      selectedHistoryVersionId: videoVersion.id
    } as HistoryPageViewModel;
    const imageViewModel = {
      ...videoViewModel,
      historyKind: "image",
      selectedHistoryAssetId: imageProject.id,
      selectedHistoryVersionId: imageEdit.id
    } as HistoryPageViewModel;
    const videoPage = renderHistoryDetailPage(videoViewModel, detailOptions);
    const imagePage = renderImageHistoryDetailPage(imageViewModel, detailOptions);

    const artifactVersion = {
      ...videoVersion,
      id: "video-version-with-av",
      h3ContinuationData: {
        status: "available",
        artifact: {
          schemaVersion: 1,
          artifactId: "artifact-001",
          role: "final-clean-av",
          lineageId: "lineage-001",
          manifest: { filename: "h3av_artifact-001.json", subfolder: "h3-native-av", type: "output", absolutePath: "C:\\fixtures\\h3-native-av\\h3av_artifact-001.json" },
          payload: { filename: "h3av_artifact-001.safetensors", subfolder: "h3-native-av", type: "output", absolutePath: "C:\\fixtures\\h3-native-av\\h3av_artifact-001.safetensors" },
          payloadSha256: "a".repeat(64),
          payloadBytes: 128,
          modelFamily: "minimax-h3",
          executionModelId: "minimax_h3_fl2va",
          providerId: "h3-native-sidecar",
          providerRevision: "provider-1",
          diffusionModelFilename: "diffusion.safetensors",
          textEncoderFilename: "text-encoder.safetensors",
          videoVaeFilename: "video-vae.safetensors",
          audioVaeFilename: "audio-vae.safetensors",
          width: 848,
          height: 480,
          fps: 24,
          frameCount: 124,
          videoShape: [1, 24, 37, 30, 53],
          videoDtype: "BF16",
          audioSampleRate: 32000,
          audioChannels: 2,
          audioLatentRate: 40,
          audioShape: [1, 32, 2, 207],
          audioDtype: "F32",
          contextFrames: 22,
          workflowRevision: "workflow-1",
          sourceTaskId: "video-task-detail",
          sourceVersionId: "video-version-detail",
          createdAt: "2026-08-21T00:00:00.000Z"
        }
      }
    } as unknown as AssetVersion;
    const artifactAsset = {
      ...videoAsset,
      versions: [artifactVersion],
      defaultVersionId: artifactVersion.id
    } as unknown as HistoryAsset;
    const artifactViewModel = {
      ...videoViewModel,
      state: { ...state, history: [artifactAsset] },
      selectedHistoryAssetId: artifactAsset.id,
      selectedHistoryVersionId: artifactVersion.id
    } as HistoryPageViewModel;
    const artifactPage = renderHistoryDetailPage(artifactViewModel, {
      ...detailOptions,
      preferredVersion: () => artifactVersion,
      currentHistoryVersion: () => artifactVersion
    });
    const videoGalleryPage = renderHistoryPage(videoViewModel, detailOptions);
    const imageGalleryPage = renderImageHistoryPage(imageViewModel, detailOptions);
    const videoCardStart = videoGalleryPage.match(
      /<article\b[^>]*data-open-history="video-asset-detail"[^>]*>/
    )?.[0];
    const imageCardStart = imageGalleryPage.match(
      /<article\b[^>]*data-open-image-history="image-project-detail"[^>]*>/
    )?.[0];

    expect(videoPage).toContain('class="history-detail-quick-actions"');
    expect(videoPage.match(/00:05/g)).toHaveLength(2);
    expect(videoPage).not.toContain("5.166666666666667");
    expect(videoPage).toContain('class="history-detail-action-primary"');
    expect(videoPage).not.toContain('class="history-detail-more"');
    expect(videoPage).toContain('data-open-upscale');
    expect(videoPage).toContain('data-continue-history="video-asset-detail"');
    expect(videoPage).toContain('data-delete-history-version="video-asset-detail"');
    expect(videoPage).toContain('data-delete-history="video-asset-detail"');
    expect(videoPage).not.toContain('class="history-detail-compact-actions"');
    expect(videoPage).toContain('class="history-record-section"');
    expect(videoPage).not.toContain('class="history-joint-av-indicator"');
    expect(artifactPage).toContain('class="history-joint-av-indicator">JointAV</span>');
    expect(artifactPage).not.toContain('data-h3-av-artifact');
    expect(artifactPage).not.toContain('history.page.nativeAvTitle');
    expect(artifactPage).toContain("h3av_artifact-001.safetensors");
    expect(artifactPage).toContain("h3av_artifact-001.json");
    expect(artifactPage).toContain('data-show-file="C:\\fixtures\\h3-native-av\\h3av_artifact-001.safetensors"');
    expect(artifactPage).toContain('data-show-file="C:\\fixtures\\h3-native-av\\h3av_artifact-001.json"');
    expect(artifactPage.match(/class="output-file"/g)).toHaveLength(3);
    expect(videoPage).toContain('<media-controller id="history-player"');
    expect(videoPage).toContain('autohide="1"');
    expect(videoPage).toContain('fullscreenelement="history-player"');
    expect(videoPage).toContain('hotkeys="noarrowleft noarrowright"');
    expect(videoPage).toContain('data-history-player-info');
    expect(videoPage).toContain('class="history-player-title"');
    expect(videoPage).toContain('class="history-player-meta"');
    expect(videoPage).toContain('<span class="history-player-inline-position" aria-label="history.page.position">1 / 1</span>');
    expect(videoPage).toContain("848 × 480");
    expect(videoPage).toContain("24 FPS");
    expect(videoPage).toContain('data-history-player-actions');
    expect(videoPage).toContain('history-player-inline-position');
    expect(videoPage).toContain('data-history-player-utility');
    expect(videoPage).toContain('data-history-navigation="-1"');
    expect(videoPage).toContain('data-history-navigation="1"');
    expect(videoPage).toContain('data-history-favorite="video-asset-detail"');
    expect(videoPage).toContain('data-history-rating-control="video-asset-detail"');
    expect(videoPage).toContain('class="history-player-volume"');
    expect(videoPage).toContain('class="history-player-utility-group"');
    expect(videoPage).toContain('media-mute-button');
    expect(videoPage).toContain('media-volume-range');
    expect(videoPage).toContain('media-settings-menu-button');
    expect(videoPage).toContain('media-settings-menu');
    expect(videoPage).toContain('media-playback-rate-menu');
    expect(videoPage).toContain('data-history-download-filename=');
    expect(videoPage).toContain('data-history-player-menu-action="download"');
    expect(videoPage).toContain('data-history-player-menu-action="pip"');
    expect(videoPage).not.toContain('slot="icon"');
    expect(videoPage.indexOf('media-time-range')).toBeLessThan(videoPage.indexOf('media-mute-button'));
    expect(videoPage.indexOf('media-mute-button')).toBeLessThan(videoPage.indexOf('data-history-player-utility'));
    expect(videoPage.indexOf('data-history-player-utility')).toBeLessThan(videoPage.indexOf('media-fullscreen-button'));
    expect(videoPage.indexOf('media-fullscreen-button')).toBeLessThan(videoPage.indexOf('media-settings-menu-button'));
    expect(videoPage).not.toContain('<video controls');
    expect(videoCardStart).toBeDefined();
    expect(videoCardStart).not.toContain("title=");
    expect(videoCardStart).toContain('aria-label="Detail fixture，history.card.openDetailsContext"');
    expect(imageCardStart).toBeDefined();
    expect(imageCardStart).not.toContain("title=");
    expect(imageCardStart).toContain('aria-label="Image detail fixture，history.card.openDetailsContext"');
    expect(imagePage).toContain('class="history-detail-quick-actions"');
    expect(imagePage).toContain('class="history-detail-action-primary"');
    expect(imagePage).not.toContain('class="history-detail-more"');
    expect(imagePage.match(/data-image-continue-video-project=/g)).toHaveLength(1);
    expect(imagePage.match(/data-image-continue-edit-project=/g)).toHaveLength(1);
    expect(imagePage).toContain('data-delete-image-version="image-project-detail"');
    expect(imagePage).toContain('data-delete-history="image-project-detail"');
    expect(imagePage).toContain('data-image-version-id="image-edit-detail"');
    expect(imagePage).not.toContain('class="history-detail-compact-actions"');
    expect(imagePage).toContain('class="history-record-section"');
  });
});
