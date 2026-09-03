import { describe, expect, it } from "vitest";
import type { AssetVersion, HistoryAsset } from "../src/types";
import {
  renderImageAssetLibraryDialog,
  renderUpscaleDialog
} from "../src/renderer/shell/secondary-dialogs";
import { createUpscaleFilename, upscaleDimensions } from "../src/core/upscale";
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
});
