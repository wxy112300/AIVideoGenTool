// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { createHistoryActions, type HistoryActionsOptions } from "../src/renderer/pages/history/actions";
import type { AssetVersion, HistoryAsset } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const translator = createTranslator("zh-CN");

describe("history actions", () => {
  it("opens DLSS5 for sources above the legacy short-edge ceiling", () => {
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
      targetScale: 2,
      dlss5Quality: "quality",
      modelId: "dlss5-sr",
      tileMode: state.settings.upscaleTileMode
    });
  });
});
