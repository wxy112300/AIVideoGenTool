import { describe, expect, it } from "vitest";
import type { AssetVersion, HistoryAsset } from "../src/types";
import {
  renderImageAssetLibraryDialog,
  renderUpscaleDialog
} from "../src/renderer/shell/secondary-dialogs";
import { createUpscaleFilename, upscaleDimensions } from "../src/core/upscale";
import { AETHERSCALE_MODEL_ID } from "../src/core/aetherscale";
import { uiKeys } from "../src/core/i18n-keys";
import { versionShortEdge } from "../src/renderer/pages/history/helpers";

describe("secondary dialog markup", () => {
  it("renders a preview target for each cleanable image asset", () => {
    const sourcePath = "C:\\ComfyUI\\input\\LocalVideoStudio\\sources\\sample.png";
    const markup = renderImageAssetLibraryDialog({
      dialog: {
        scan: {
          libraryDirectory: "C:\\ComfyUI\\input\\LocalVideoStudio",
          totalReferences: 1,
          managedReferences: 1,
          archiveCandidates: 0,
          missingReferences: [],
          orphanFiles: [{ absolutePath: sourcePath, relativePath: "sources/sample.png", size: 2048 }],
          archiveBytes: 0,
          orphanBytes: 2048
        },
        busy: false,
        error: "",
        confirmCleanup: false,
        selectedPaths: [sourcePath],
        lastResult: null
      },
      progress: null,
      icon: (name) => `<i data-lucide="${name}"></i>`,
      escapeHtml: (value) => String(value),
      formatAssetBytes: (bytes) => `${bytes} B`,
      t: (key) => key
    });

    expect(markup).toContain('class="asset-library-file-preview"');
    expect(markup).toContain(`data-asset-preview-source="${sourcePath}"`);
    expect(markup).toContain('alt="" aria-hidden="true"');
  });

  it("disables H3 second sampling when the selected version has no JointAV", () => {
    const version = {
      id: "version-1",
      kind: "original",
      createdAt: "2026-09-01T00:00:00.000Z",
      outputFilename: "h3-720p.mp4",
      modelId: "minimax_h3_fl2va",
      width: 1280,
      height: 720,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      comfyPromptId: "prompt-1",
      comfyOutputs: {},
      files: [{ filename: "h3-720p.mp4", subfolder: "", type: "output", absolutePath: "C:\\video\\h3-720p.mp4" }]
    } as AssetVersion;
    const asset = {
      id: "asset-1",
      versions: [version],
      title: "H3 sample"
    } as unknown as HistoryAsset;
    const renderOptions: Parameters<typeof renderUpscaleDialog>[0] = {
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        targetHeight: 1080,
        modelId: "seedvr2",
        tileMode: "auto"
      },
      history: [asset],
      environment: null,
      performance: null,
      icon: (name) => `<i data-lucide="${name}"></i>`,
      escapeHtml: (value) => String(value),
      formatBytes: (bytes) => `${bytes} B`,
      formatVideoDuration: (seconds) => `${seconds}s`,
      formatUpscaleEstimateRange: (min, max) => `${min}-${max}s`,
      createUpscaleFilename,
      estimateUpscaleResources: () => ({
        frameCount: 48,
        vramMinGb: 4,
        vramMaxGb: 8,
        secondsMin: 10,
        secondsMax: 20,
        internalScale: 2
      }),
      upscaleDimensions,
      versionShortEdge,
      t: (key) => key
    };
    const markup = renderUpscaleDialog(renderOptions);

    expect(markup).not.toContain("data-upscale-method");
    expect(markup).toContain('<option value="minimax_h3_latent_upscaler"');
    expect(markup).toContain("H3 Latent Upscale");
    expect(markup).toContain('id="upscale-model"');
  });

  it("offers every H3 target before runtime readiness and displays aligned output pixels", () => {
    const version = {
      id: "version-h3",
      kind: "original",
      createdAt: "2026-09-02T00:00:00.000Z",
      outputFilename: "h3-480p.mp4",
      modelId: "minimax_h3_fl2va",
      width: 864,
      height: 480,
      duration: 124 / 24,
      fps: 24,
      workflowPath: "workflow.json",
      comfyPromptId: "prompt-h3",
      comfyOutputs: {},
      files: [],
      h3ContinuationData: {
        status: "available",
        artifact: { artifactId: "artifact-h3" }
      }
    } as unknown as AssetVersion;
    const asset = { id: "asset-h3", title: "H3", versions: [version] } as HistoryAsset;
    const renderOptions: Parameters<typeof renderUpscaleDialog>[0] = {
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        targetHeight: 720,
        modelId: "minimax_h3_latent_upscaler",
        tileMode: "auto"
      },
      history: [asset], environment: null, performance: null,
      icon: () => "", escapeHtml: String, formatBytes: String,
      formatVideoDuration: String, formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 124, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 2 }),
      upscaleDimensions, versionShortEdge, t: (key) => key
    };
    const markup = renderUpscaleDialog(renderOptions);
    expect(markup).toContain('data-upscale-height="720"');
    expect(markup).toContain('data-upscale-height="768"');
    expect(markup).not.toMatch(/data-upscale-height="1080"[^>]*disabled/);
    expect(markup).not.toMatch(/data-upscale-height="1440"[^>]*disabled/);
    expect(markup).toContain("1312 × 736");
    expect(markup).toContain('id="upscale-model"');

    const busyMarkup = renderUpscaleDialog({
      ...renderOptions,
      dialog: { ...renderOptions.dialog!, busy: true }
    });
    expect(busyMarkup).toContain('aria-busy="true"');
    expect(busyMarkup).toContain('id="enqueue-upscale" disabled');
    expect(busyMarkup).toContain(uiKeys.runtime.enqueueing);
  });

  it("enables learned H3 targets when the model and runtime are ready", () => {
    const version = {
      id: "version-h3-learned",
      kind: "original",
      createdAt: "2026-09-02T00:00:00.000Z",
      outputFilename: "h3-480p.mp4",
      modelId: "minimax_h3_fl2va",
      width: 864,
      height: 480,
      duration: 124 / 24,
      fps: 24,
      workflowPath: "workflow.json",
      files: [],
      h3ContinuationData: {
        status: "available",
        artifact: { artifactId: "artifact-h3" }
      }
    } as unknown as AssetVersion;
    const asset = { id: "asset-h3", title: "H3", versions: [version] } as HistoryAsset;
    const markup = renderUpscaleDialog({
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        targetHeight: 720,
        modelId: "minimax_h3_latent_upscaler",
        tileMode: "auto"
      },
      history: [asset],
      environment: {
        gpus: [],
        modelProfiles: [{
          id: "minimax_h3_latent_upscaler",
          category: "upscale",
          name: "H3 Latent Upscale",
          available: true,
          integrated: true,
          runtimeReady: true
        }]
      } as unknown as NonNullable<Parameters<typeof renderUpscaleDialog>[0]["environment"]>,
      performance: null,
      icon: () => "",
      escapeHtml: String,
      formatBytes: String,
      formatVideoDuration: String,
      formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 124, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 2 }),
      upscaleDimensions,
      versionShortEdge,
      t: (key) => key
    });

    expect(markup).toContain('data-upscale-height="1080"');
    expect(markup).not.toMatch(/data-upscale-height="1080"[^>]*disabled/);
    expect(markup).not.toMatch(/data-upscale-height="1440"[^>]*disabled/);
    expect(markup).not.toContain("data-upscale-method");
  });

  it("keeps learned targets disabled when editing a queued bilinear H3 task", () => {
    const version = {
      id: "version-h3-queued",
      kind: "original",
      createdAt: "2026-09-02T00:00:00.000Z",
      outputFilename: "h3-480p.mp4",
      modelId: "minimax_h3_fl2va",
      width: 864,
      height: 480,
      duration: 124 / 24,
      fps: 24,
      workflowPath: "workflow.json",
      files: [],
      h3ContinuationData: {
        status: "available",
        artifact: { artifactId: "artifact-h3" }
      }
    } as unknown as AssetVersion;
    const asset = { id: "asset-h3", title: "H3", versions: [version] } as HistoryAsset;
    const markup = renderUpscaleDialog({
      dialog: {
        taskId: "queued-bilinear",
        assetId: asset.id,
        versionId: version.id,
        targetHeight: 720,
        modelId: "minimax_h3_latent_upscaler",
        h3Provider: "bilinear",
        tileMode: "auto"
      },
      history: [asset], environment: null, performance: null,
      icon: () => "", escapeHtml: String, formatBytes: String,
      formatVideoDuration: String, formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 124, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 2 }),
      upscaleDimensions, versionShortEdge, t: (key) => key
    });

    expect(markup).toMatch(/data-upscale-height="1080"[^>]*disabled/);
    expect(markup).toMatch(/data-upscale-height="1440"[^>]*disabled/);
  });

  it("uses DLSS5 scale controls and displays the actual enlarged resolution", () => {
    const version = {
      id: "version-dlss5",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 832,
      height: 480,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      comfyPromptId: "prompt-dlss5",
      comfyOutputs: {},
      files: [{
        filename: "source.mp4",
        subfolder: "",
        type: "output",
        absolutePath: "C:\\video\\source.mp4",
        sizeBytes: 10 * 1024 * 1024
      }]
    } as AssetVersion;
    const asset = { id: "asset-dlss5", title: "DLSS source", versions: [version] } as unknown as HistoryAsset;
    const markup = renderUpscaleDialog({
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        targetScale: 3,
        dlss5Quality: "balanced",
        modelId: "dlss5-sr",
        tileMode: "auto"
      },
      history: [asset],
      environment: null,
      performance: null,
      icon: () => "",
      escapeHtml: String,
      formatBytes: (bytes) => `${bytes} B`,
      formatVideoDuration: String,
      formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 48, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 3 }),
      upscaleDimensions,
      versionShortEdge,
      t: (key) => key
    });

    expect(markup).toContain('data-upscale-scale="2"');
    expect(markup).toContain('data-upscale-scale="3"');
    expect(markup).toContain('data-upscale-scale="4"');
    expect(markup).not.toContain("data-upscale-height");
    expect(markup).toContain('id="upscale-dlss-quality"');
    expect(markup).toContain('value="balanced" selected');
    expect(markup).not.toContain('id="upscale-tile"');
    expect(markup).toContain('aria-label="3× · 2496 × 1440"');
    expect(markup).toContain("2496 × 1440");
    expect(markup).toContain("source-dlss-3x-v01.mp4");
    expect(markup).toContain(uiKeys.upscale.dlss5Pending);
    expect(markup).toContain(uiKeys.upscale.dlss5BenchmarkPending);
    expect(markup).toContain(uiKeys.upscale.estimatedDisk);
  });

  it("shows only the supported AetherScale modes and avoids repeated pending copy", () => {
    const version = {
      id: "version-aetherscale",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 864,
      height: 480,
      duration: 5,
      fps: 24,
      workflowPath: "workflow.json",
      files: [{
        filename: "source.mp4",
        subfolder: "",
        type: "output",
        absolutePath: "C:\\video\\source.mp4",
        sizeBytes: 10 * 1024 * 1024
      }]
    } as AssetVersion;
    const asset = { id: "asset-aetherscale", title: "Aether source", versions: [version] } as unknown as HistoryAsset;
    const markup = renderUpscaleDialog({
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        aetherScaleMode: "native_1x",
        modelId: AETHERSCALE_MODEL_ID,
        tileMode: "auto"
      },
      history: [asset],
      environment: null,
      performance: null,
      icon: () => "",
      escapeHtml: String,
      formatBytes: (bytes) => `${bytes} B`,
      formatVideoDuration: String,
      formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 120, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 2 }),
      upscaleDimensions,
      versionShortEdge,
      t: (key) => key
    });

    expect(markup).toContain('class="upscale-resolution upscale-scale-resolution aetherscale-mode-options"');
    expect(markup).toContain('data-aetherscale-mode="performance_2x"');
    expect(markup).toContain('data-aetherscale-mode="ultra_performance_3x"');
    expect(markup).not.toContain('data-aetherscale-mode="native_1x"');
    expect(markup).not.toContain('data-aetherscale-mode="quality_1_5x"');
    expect(markup).not.toContain('data-aetherscale-mode="balanced_1_724x"');
    expect(markup).not.toContain(uiKeys.upscale.aetherscaleExperimental);
    expect(markup).not.toContain(uiKeys.upscale.aetherscaleAdvancedPending);
    expect(markup.split(uiKeys.upscale.aetherscaleBenchmarkPending)).toHaveLength(2);
    expect(markup).toContain("864");
    expect(markup).toContain("1728");
  });

  it("fails closed with a recovery reason when the DLSS5 node is missing", () => {
    const version = {
      id: "version-dlss5-missing",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 640,
      height: 360,
      duration: 1,
      fps: 24,
      workflowPath: "workflow.json",
      files: []
    } as unknown as AssetVersion;
    const asset = { id: "asset-dlss5-missing", title: "DLSS source", versions: [version] } as HistoryAsset;
    const markup = renderUpscaleDialog({
      dialog: {
        assetId: asset.id,
        versionId: version.id,
        targetScale: 2,
        modelId: "dlss5-sr",
        tileMode: "auto"
      },
      history: [asset],
      environment: {
        customNodes: [],
        modelProfiles: []
      } as unknown as NonNullable<Parameters<typeof renderUpscaleDialog>[0]["environment"]>,
      performance: null,
      icon: () => "",
      escapeHtml: String,
      formatBytes: String,
      formatVideoDuration: String,
      formatUpscaleEstimateRange: () => "",
      createUpscaleFilename,
      estimateUpscaleResources: () => ({ frameCount: 24, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 2 }),
      upscaleDimensions,
      versionShortEdge,
      t: (key) => key
    });

    expect(markup).toMatch(/data-upscale-scale="2"[^>]*disabled/);
    expect(markup).toContain('id="enqueue-upscale" disabled');
    expect(markup).toContain(uiKeys.upscale.dlss5NodeMissing);
    expect(markup).toContain(uiKeys.upscale.dlss5SettingsHint);
  });
});
