// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { mountVideoExtensionController } from "../src/renderer/pages/create/video-extension-controller";
import { extensionSafetyForDraft, h3PromptModeForDraft } from "../src/renderer/pages/create/helpers";
import type { Draft } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

const translator = createTranslator("zh-CN");

function createVideoHarness(modelId: string, trimEndSeconds: number) {
  const state = createDefaultState();
  state.draft = {
    ...state.draft,
    inputMode: "video",
    modelId,
    sourceVideoPath: "C:/input/clip.mp4",
    sourceVideoDuration: 10,
    trimStartSeconds: 0,
    trimEndSeconds
  };
  const root = document.createElement("div");
  root.innerHTML = `<div class="video-editor">
    <div id="extend-video-player"><video id="source-video" src="studio-media://draft/video?source=clip.mp4"></video></div>
    <button id="preview-extension-boundary" type="button">preview</button>
    <div id="trim-editor"><input id="trim-start" value="0"><input id="trim-end" value="${trimEndSeconds}"></div>
    <output id="trim-start-output"></output><output id="trim-end-output"></output>
    <output id="trim-kept"></output><output id="trim-discarded"></output><output id="trim-total"></output>
  </div>`;
  document.body.append(root);
  const video = root.querySelector<HTMLVideoElement>("#source-video");
  if (!video) throw new Error("video was not created");
  const player = root.querySelector<HTMLElement>("#extend-video-player");
  if (!player) throw new Error("player was not created");
  let currentTime = 1.5;
  Object.defineProperties(video, {
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => { currentTime = value; }
    },
    duration: { configurable: true, value: 10 },
    readyState: { configurable: true, value: 1 },
    videoWidth: { configurable: true, value: 1280 },
    videoHeight: { configurable: true, value: 720 }
  });
  const requestFullscreen = vi.fn(() => Promise.resolve());
  Object.defineProperty(player, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen
  });
  vi.spyOn(video, "pause").mockImplementation(() => undefined);
  const patchDraft = vi.fn((patch: Partial<Draft>) => {
    state.draft = { ...state.draft, ...patch };
  });
  const context = {
    root,
    getState: () => state,
    t: translator.t,
    requestRender: vi.fn(),
    notify: vi.fn(),
    hostCapabilities: {}
  } as unknown as RendererContext;
  const cleanup = mountVideoExtensionController(context, {
    selectDraftVideo: vi.fn(async () => undefined),
    patchDraft,
    syncEnqueueUi: vi.fn(),
    formatTrimTime: (seconds: number) => String(seconds)
  });
  return { cleanup, video, player, requestFullscreen, getCurrentTime: () => currentTime };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Continuum draft safety routing", () => {
  it.each([
    { h3ContinuumMode: "bootstrap" as const, h3ContinuumArtifactPath: undefined },
    { h3ContinuumMode: undefined, h3ContinuumArtifactPath: "C:/output/h3-native-av/h3av-source.safetensors" }
  ])("budgets ordinary AV imports as bootstrap despite a managed workflow filename: %j", (source) => {
    const state = createDefaultState();
    const draft: Draft = {
      ...state.draft,
      ...source,
      inputMode: "video",
      modelId: "minimax_h3_continuum",
      workflowPath: "C:/workflows/minimax_h3_continuum_v38_managed_extend_api.json",
      sourceVideoPath: "C:/output/source.mp4",
      sourceVideoDuration: 362 / 24,
      trimStartSeconds: 0,
      trimEndSeconds: 362 / 24,
      duration: 15,
      resolution: 480,
      fps: 24,
      frameInterpolation: "off"
    };
    const original = structuredClone(draft);

    expect(extensionSafetyForDraft(draft, state.settings)).toMatchObject({
      safe: false,
      generatedFrames: 379,
      maxGeneratedFrames: 362,
      maxDurationSeconds: 14
    });
    expect(extensionSafetyForDraft({ ...draft, duration: 14 }, state.settings)).toMatchObject({
      safe: true,
      generatedFrames: 362,
      maxDurationSeconds: 14
    });
    expect(draft).toEqual(original);
  });

  it("retains the managed 15-second budget when enqueue will select the managed workflow", () => {
    const state = createDefaultState();
    const draft: Draft = {
      ...state.draft,
      inputMode: "video",
      modelId: "minimax_h3_continuum",
      workflowPath: "C:/workflows/minimax_h3_continuum_v38_extend_api.json",
      h3ContinuumMode: "managed",
      sourceVideoPath: "C:/output/source.mp4",
      sourceVideoDuration: 15,
      trimStartSeconds: 0,
      trimEndSeconds: 15,
      duration: 15,
      resolution: 480,
      fps: 24,
      frameInterpolation: "off"
    };

    expect(extensionSafetyForDraft(draft, state.settings)).toMatchObject({
      safe: true,
      maxDurationSeconds: 15
    });
  });
});

describe("Extend video boundary preview", () => {
  it("uses the execution-time reference contract for each H3 extension family", () => {
    const draft = createDefaultState().draft;
    expect(h3PromptModeForDraft({ ...draft, inputMode: "video", modelId: "minimax_h3_fl2va", startImagePath: "" })).toBe("I2VA");
    expect(h3PromptModeForDraft({ ...draft, inputMode: "video", modelId: "minimax_h3_continuum", startImagePath: "" })).toBe("I2VA");
    expect(h3PromptModeForDraft({ ...draft, inputMode: "video", modelId: "minimax_h3_ref2va", startImagePath: "" })).toBe("R2V");
  });

  it("jumps to the selected trim end", () => {
    const harness = createVideoHarness("minimax_h3_ref2va", 7.5);

    harness.player.parentElement?.querySelector<HTMLButtonElement>("#preview-extension-boundary")?.click();

    expect(harness.getCurrentTime()).toBeCloseTo(7.5);
    expect(harness.video.pause).toHaveBeenCalled();
    harness.cleanup();
  });

  it("uses the full source duration for Continuum", () => {
    const harness = createVideoHarness("minimax_h3_continuum", 7.5);

    harness.player.parentElement?.querySelector<HTMLButtonElement>("#preview-extension-boundary")?.click();

    expect(harness.getCurrentTime()).toBeCloseTo(10);
    harness.cleanup();
  });

  it("toggles fullscreen when double-clicking the video frame", () => {
    const harness = createVideoHarness("minimax_h3_ref2va", 7.5);
    let fullscreenElement: Element | null = null;
    const exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen
    });

    try {
      harness.video.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      expect(harness.requestFullscreen).toHaveBeenCalledTimes(1);

      fullscreenElement = harness.player;
      harness.video.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
      delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
      harness.cleanup();
    }
  });
});
