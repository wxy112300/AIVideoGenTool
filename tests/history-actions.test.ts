// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { createHistoryActions, type HistoryActionsOptions } from "../src/renderer/pages/history/actions";
import type { AssetVersion, HistoryAsset, NativeAvContinuationArtifact } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const translator = createTranslator("zh-CN");

describe("history actions", () => {
  it("opens the active Konohamaru provider for sources above the legacy short-edge ceiling", () => {
    const version = {
      id: "version-4k",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source-4k.mp4",
      modelId: "minimax_h3_fl2va",
      width: 3840,
      height: 2160,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      files: []
    } as unknown as AssetVersion;
    const asset = {
      mediaKind: "video",
      id: "asset-4k",
      title: "4K source",
      defaultVersionId: version.id,
      versions: [version]
    } as unknown as HistoryAsset;
    const state = createDefaultState();
    state.history = [asset];
    state.settings.defaultUpscaleModel = "seedvr2";
    const setDialog = vi.fn();
    const context = {
      root: document.createElement("main"),
      application: {},
      events: {},
      assets: {},
      hostCapabilities: {},
      enhancePrompt: vi.fn(async () => ""),
      getState: () => state,
      getRoute: () => ({ page: "history" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
      getTranslator: () => translator,
      t: translator.t,
      requestRender: vi.fn(),
      navigate: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as RendererContext;
    const options = {
      context,
      setState: vi.fn(),
      getSelectedHistoryAssetId: () => asset.id,
      getSelectedHistoryVersionId: () => version.id,
      setSelectedHistoryAssetId: vi.fn(),
      setDialog,
      rememberModalFocus: vi.fn(),
      saveDraftImmediately: vi.fn(async () => undefined),
      selectDraftVideo: vi.fn(async () => undefined),
      navigateToCreationMode: vi.fn(),
      requestHistoryDeletion: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as HistoryActionsOptions;

    createHistoryActions(options).openUpscaleDialog();

    expect(setDialog).toHaveBeenCalledWith({
      assetId: asset.id,
      versionId: version.id,
      konohamaruMode: "quality_1_5x",
      konohamaruNrStyle: "Natural",
      konohamaruNrIntensity: 1,
      konohamaruFrameInterpolation: "off",
      modelId: "dlss5-konohamaru",
      tileMode: state.settings.upscaleTileMode
    });
  });

  it("does not carry name-only obsolete LoRAs into a creation draft", async () => {
    const version = {
      id: "version-removed-lora",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "old.mp4",
      modelId: "minimax_h3_fl2va",
      width: 1920,
      height: 1080,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      files: [],
      videoLoras: [{
        id: "minimax-h3-pink-fluffy-bunny-nsfw",
        name: "PinkFluffyBunny NSFW",
        filename: "",
        strength: 0,
        historyOnly: true,
        modelFamily: "history",
        compatibleModelIds: [],
        compatibleInputModes: [],
        purpose: "style"
      }]
    } as unknown as AssetVersion;
    const asset = {
      mediaKind: "video",
      id: "asset-removed-lora",
      title: "old project",
      createdAt: version.createdAt,
      updatedAt: version.createdAt,
      defaultVersionId: version.id,
      modelId: version.modelId,
      outputFilename: version.outputFilename,
      prompt: "a person walking",
      inputMode: "image",
      duration: version.duration,
      fps: version.fps,
      videoLoras: version.videoLoras,
      versions: [version]
    } as unknown as HistoryAsset;
    const state = createDefaultState();
    state.history = [asset];
    const saveDraftImmediately = vi.fn(async () => undefined);
    const context = {
      root: document.createElement("main"),
      application: {},
      events: {},
      assets: {},
      hostCapabilities: {},
      enhancePrompt: vi.fn(async () => ""),
      getState: () => state,
      getRoute: () => ({ page: "history" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
      getTranslator: () => translator,
      t: translator.t,
      requestRender: vi.fn(),
      navigate: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as RendererContext;
    const options = {
      context,
      setState: vi.fn(),
      getSelectedHistoryAssetId: () => asset.id,
      getSelectedHistoryVersionId: () => version.id,
      setSelectedHistoryAssetId: vi.fn(),
      setDialog: vi.fn(),
      rememberModalFocus: vi.fn(),
      saveDraftImmediately,
      selectDraftVideo: vi.fn(async () => undefined),
      navigateToCreationMode: vi.fn(),
      requestHistoryDeletion: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as HistoryActionsOptions;

    await createHistoryActions(options).editHistoryAsset(asset.id);

    const draft = saveDraftImmediately.mock.calls[0]?.[0] as { videoLoras?: unknown[] } | undefined;
    expect(draft?.videoLoras).toEqual([]);
  });

  it("carries the recorded Motion Context file alongside a Continuum artifact", async () => {
    const version = {
      id: "version-with-latents",
      kind: "generated",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 1280,
      height: 720,
      duration: 8,
      fps: 24,
      workflowPath: "workflow.json",
      files: [
        {
          filename: "source.mp4",
          subfolder: "Videos",
          type: "output",
          absolutePath: "C:/history/source.mp4"
        },
        {
          filename: "clip_00001.safetensors",
          subfolder: "h3-motion-context/version-with-latents",
          type: "output",
          absolutePath: "C:/history/h3-motion-context/version-with-latents/clip_00001.safetensors"
        }
      ]
    } as unknown as AssetVersion;
    const artifact = {
      payload: {
        filename: "h3av_payload.safetensors",
        subfolder: "h3-native-av",
        type: "output",
        absolutePath: "C:/history/h3-native-av/h3av_payload.safetensors"
      },
      manifest: {
        filename: "h3av_payload.json",
        subfolder: "h3-native-av",
        type: "output",
        absolutePath: "C:/history/h3-native-av/h3av_payload.json"
      }
    } as unknown as NativeAvContinuationArtifact;
    const asset = {
      mediaKind: "video",
      id: "asset-with-latents",
      title: "source",
      defaultVersionId: version.id,
      versions: [version]
    } as unknown as HistoryAsset;
    const state = createDefaultState();
    state.history = [asset];
    const selectDraftVideo = vi.fn(async () => undefined);
    const navigateToCreationMode = vi.fn();
    const context = {
      root: document.createElement("main"),
      application: {},
      events: {},
      assets: {},
      hostCapabilities: {},
      enhancePrompt: vi.fn(async () => ""),
      getState: () => state,
      getRoute: () => ({ page: "history" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
      getTranslator: () => translator,
      t: translator.t,
      requestRender: vi.fn(),
      navigate: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as RendererContext;
    const options = {
      context,
      setState: vi.fn(),
      getSelectedHistoryAssetId: () => asset.id,
      getSelectedHistoryVersionId: () => version.id,
      setSelectedHistoryAssetId: vi.fn(),
      setDialog: vi.fn(),
      rememberModalFocus: vi.fn(),
      saveDraftImmediately: vi.fn(async () => undefined),
      selectDraftVideo,
      navigateToCreationMode,
      requestHistoryDeletion: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as HistoryActionsOptions;
    const actions = createHistoryActions(options);
    const continuationData = { status: "available", artifact } as unknown as AssetVersion["h3ContinuationData"];
    version.h3ContinuationData = continuationData;

    await actions.continueVideoHistory(asset.id, version.id);

    expect(selectDraftVideo).toHaveBeenCalledWith(
      "C:/history/source.mp4",
      expect.objectContaining({
        modelId: "minimax_h3_continuum",
        h3ContextLatentPath: "C:/history/h3-motion-context/version-with-latents/clip_00001.safetensors",
        h3ContinuumArtifactPath: "C:/history/h3-native-av/h3av_payload.safetensors",
        h3ContinuumArtifact: artifact
      }),
      false
    );
    expect(navigateToCreationMode).toHaveBeenCalledWith("video-extension");
  });

  it("selects R2V and preserves Motion Context when a history version has no JointAV artifact", async () => {
    const version = {
      id: "version-motion-context-only",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_ref2va",
      width: 1280,
      height: 720,
      duration: 8,
      fps: 24,
      workflowPath: "workflow.json",
      h3LatentSaveMode: "motion-context",
      h3SaveJointAv: false,
      h3ContextLatentPath: "C:/history/h3-motion-context/version-motion-context-only/clip_00001.safetensors",
      files: [
        {
          filename: "source.mp4",
          subfolder: "Videos",
          type: "output",
          absolutePath: "C:/history/source.mp4"
        },
        {
          filename: "clip_00001.safetensors",
          subfolder: "h3-motion-context/version-motion-context-only",
          type: "output",
          absolutePath: "C:/history/h3-motion-context/version-motion-context-only/clip_00001.safetensors"
        }
      ]
    } as unknown as AssetVersion;
    const asset = {
      mediaKind: "video",
      id: "asset-motion-context-only",
      title: "source",
      modelId: "minimax_h3_ref2va",
      inputMode: "video",
      sourceVideoPath: "C:/history/source.mp4",
      defaultVersionId: version.id,
      versions: [version]
    } as unknown as HistoryAsset;
    const state = createDefaultState();
    state.history = [asset];
    const selectDraftVideo = vi.fn(async () => undefined);
    const context = {
      root: document.createElement("main"),
      application: {},
      events: {},
      assets: {},
      hostCapabilities: {},
      enhancePrompt: vi.fn(async () => ""),
      getState: () => state,
      getRoute: () => ({ page: "history" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
      getTranslator: () => translator,
      t: translator.t,
      requestRender: vi.fn(),
      navigate: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as RendererContext;
    const options = {
      context,
      setState: vi.fn(),
      getSelectedHistoryAssetId: () => asset.id,
      getSelectedHistoryVersionId: () => version.id,
      setSelectedHistoryAssetId: vi.fn(),
      setDialog: vi.fn(),
      rememberModalFocus: vi.fn(),
      saveDraftImmediately: vi.fn(async () => undefined),
      selectDraftVideo,
      navigateToCreationMode: vi.fn(),
      requestHistoryDeletion: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as HistoryActionsOptions;

    await createHistoryActions(options).continueVideoHistory(asset.id, version.id);

    expect(selectDraftVideo).toHaveBeenCalledWith(
      "C:/history/source.mp4",
      expect.objectContaining({
        modelId: "minimax_h3_ref2va",
        h3LatentSaveMode: "motion-context",
        h3ContextLatentPath: "C:/history/h3-motion-context/version-motion-context-only/clip_00001.safetensors",
        h3ContinuumArtifactPath: undefined,
        h3ContinuumArtifact: undefined
      }),
      false
    );
  });
});
