// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { mountUpscaleController } from "../src/renderer/shell/upscale-controller";
import type { AppState, AssetVersion, HistoryAsset } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const translator = createTranslator("zh-CN");

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("upscale controller", () => {
  it("enqueues a DLSS5 multiplier task with its actual output geometry", async () => {
    const state = createDefaultState();
    const version = {
      id: "version-dlss5-controller",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 832,
      height: 480,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      files: [{
        filename: "source.mp4",
        subfolder: "",
        type: "output",
        absolutePath: "C:/input/source.mp4"
      }]
    } as AssetVersion;
    const asset = {
      id: "asset-dlss5-controller",
      title: "DLSS source",
      versions: [version]
    } as unknown as HistoryAsset;
    state.history = [asset];

    let dialog: import("../src/renderer/shell/secondary-dialogs").UpscaleDialogState | null = {
      assetId: asset.id,
      versionId: version.id,
      targetScale: 2,
      dlss5Quality: "quality",
      modelId: "dlss5-sr",
      tileMode: "auto"
    };
    const nextState = structuredClone(state);
    const enqueueUpscale = vi.fn(async () => nextState);
    const context = {
      root: document.createElement("main"),
      application: { enqueueUpscale } as unknown,
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
    const root = document.createElement("div");
    root.innerHTML = `
      <section class="upscale-dialog">
        <button id="cancel-upscale"></button>
        <button data-upscale-scale="3"></button>
        <select id="upscale-dlss-quality"><option value="quality">quality</option><option value="balanced">balanced</option></select>
        <button id="enqueue-upscale"></button>
      </section>`;
    const options = {
      root,
      renderOverlay: vi.fn(),
      getDialog: () => dialog,
      setDialog: (next: typeof dialog) => {
        dialog = next;
      },
      setRendererState: vi.fn(),
      rememberModalFocus: vi.fn(),
      rememberModalControlFocus: vi.fn(),
      restoreModalFocus: vi.fn(),
      bindModalFocus: vi.fn(),
      reportUserAction: vi.fn()
    };
    const cleanup = mountUpscaleController(context, options);

    root.querySelector<HTMLElement>("[data-upscale-scale=\"3\"]")!.click();
    const quality = root.querySelector<HTMLSelectElement>("#upscale-dlss-quality")!;
    quality.value = "balanced";
    quality.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>("#enqueue-upscale")!.click();
    await vi.waitFor(() => expect(enqueueUpscale).toHaveBeenCalledTimes(1));

    const request = enqueueUpscale.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({
      modelId: "dlss5-sr",
      targetScale: 3,
      upscaleMode: "pixel",
      tileMode: "auto",
      faceRestore: false
    });
    expect(request).not.toHaveProperty("targetHeight");
    expect(request.dlss5).toMatchObject({ scale: 3, quality: "balanced" });
    expect(dialog).toBeNull();
    cleanup();
  });

  it("uses the visible AetherScale mode when an older hidden mode is still in dialog state", async () => {
    const state = createDefaultState();
    const version = {
      id: "version-aetherscale-controller",
      kind: "original",
      createdAt: "2026-09-03T00:00:00.000Z",
      outputFilename: "source.mp4",
      modelId: "minimax_h3_fl2va",
      width: 864,
      height: 480,
      duration: 2,
      fps: 24,
      workflowPath: "workflow.json",
      files: [{
        filename: "source.mp4",
        subfolder: "",
        type: "output",
        absolutePath: "C:/input/source.mp4"
      }]
    } as AssetVersion;
    const asset = {
      id: "asset-aetherscale-controller",
      title: "AetherScale source",
      versions: [version]
    } as unknown as HistoryAsset;
    state.history = [asset];

    let dialog: import("../src/renderer/shell/secondary-dialogs").UpscaleDialogState | null = {
      assetId: asset.id,
      versionId: version.id,
      aetherScaleMode: "native_1x",
      modelId: "aetherscale-dlss5",
      tileMode: "auto"
    };
    const nextState = structuredClone(state);
    const enqueueUpscale = vi.fn(async () => nextState);
    const context = {
      root: document.createElement("main"),
      application: { enqueueUpscale } as unknown,
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
    const root = document.createElement("div");
    root.innerHTML = `
      <section class="upscale-dialog">
        <button class="primary" data-aetherscale-mode="performance_2x"></button>
        <button data-aetherscale-mode="ultra_performance_3x"></button>
        <button id="enqueue-upscale"></button>
      </section>`;
    const options = {
      root,
      renderOverlay: vi.fn(),
      getDialog: () => dialog,
      setDialog: (next: typeof dialog) => {
        dialog = next;
      },
      setRendererState: vi.fn(),
      rememberModalFocus: vi.fn(),
      rememberModalControlFocus: vi.fn(),
      restoreModalFocus: vi.fn(),
      bindModalFocus: vi.fn(),
      reportUserAction: vi.fn()
    };
    const cleanup = mountUpscaleController(context, options);

    root.querySelector<HTMLButtonElement>("#enqueue-upscale")!.click();
    await vi.waitFor(() => expect(enqueueUpscale).toHaveBeenCalledTimes(1));

    const request = enqueueUpscale.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({
      modelId: "aetherscale-dlss5",
      targetWidth: 1728,
      targetOutputHeight: 960,
      upscaleMode: "pixel",
      tileMode: "auto",
      faceRestore: false
    });
    expect(request.aetherScale).toMatchObject({
      mode: "performance_2x",
      targetWidth: 1728,
      targetHeight: 960
    });
    expect(dialog).toBeNull();
    cleanup();
  });

  it("preserves provider-specific choices while switching the dialog provider", () => {
    let dialog: import("../src/renderer/shell/secondary-dialogs").UpscaleDialogState | null = {
      assetId: "asset",
      versionId: "version",
      targetHeight: 1440,
      targetScale: 3,
      dlss5Quality: "balanced",
      modelId: "dlss5-sr",
      tileMode: "safe"
    };
    const context = {
      root: document.createElement("main"),
      application: {},
      events: {},
      assets: {},
      hostCapabilities: {},
      enhancePrompt: vi.fn(async () => ""),
      getState: () => undefined,
      getRoute: () => ({ page: "history" as const, creationMode: "image-to-video" as const, historyKind: "video" as const }),
      getTranslator: () => translator,
      t: translator.t,
      requestRender: vi.fn(),
      navigate: vi.fn(),
      notify: vi.fn(),
      reportUserAction: vi.fn()
    } as unknown as RendererContext;
    const root = document.createElement("div");
    root.innerHTML = `
      <select id="upscale-model">
        <option value="dlss5-sr">DLSS5</option>
        <option value="seedvr2">SeedVR2</option>
      </select>
      <select id="upscale-tile"><option value="safe">safe</option><option value="auto">auto</option></select>`;
    const options = {
      root,
      renderOverlay: vi.fn(),
      getDialog: () => dialog,
      setDialog: (next: typeof dialog) => {
        dialog = next;
      },
      setRendererState: vi.fn(),
      rememberModalFocus: vi.fn(),
      rememberModalControlFocus: vi.fn(),
      restoreModalFocus: vi.fn(),
      bindModalFocus: vi.fn(),
      reportUserAction: vi.fn()
    };
    const cleanup = mountUpscaleController(context, options);
    const model = root.querySelector<HTMLSelectElement>("#upscale-model")!;
    model.value = "seedvr2";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    expect(dialog).toMatchObject({
      modelId: "seedvr2",
      targetHeight: 1440,
      targetScale: 3,
      dlss5Quality: "balanced",
      tileMode: "safe"
    });

    model.value = "dlss5-sr";
    model.dispatchEvent(new Event("change", { bubbles: true }));
    expect(dialog).toMatchObject({
      modelId: "dlss5-sr",
      targetHeight: 1440,
      targetScale: 3,
      dlss5Quality: "balanced",
      tileMode: "safe"
    });
    cleanup();
  });
});
