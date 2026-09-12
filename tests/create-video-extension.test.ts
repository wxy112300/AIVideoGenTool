// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import { mountVideoExtensionController } from "../src/renderer/pages/create/video-extension-controller";
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

describe("Extend video boundary preview", () => {
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
