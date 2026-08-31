// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createTranslator } from "../src/core/i18n";
import type { RendererContext } from "../src/renderer/contracts";
import { createHistoryContextMenus } from "../src/renderer/pages/history/context-menus";

const translator = createTranslator("zh-CN");

function createHistoryContext() {
  const state = createDefaultState();
  state.history = [{
    mediaKind: "video",
    id: "video-1",
    taskId: "task-1",
    title: "测试视频",
    outputFilename: "test.mp4",
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    modelId: "minimax_h3_fl2va",
    favorite: false,
    rating: null,
    tags: [],
    duration: 4,
    resolution: 720,
    prompt: "test prompt",
    seed: 42,
    comfyPromptId: "prompt-1",
    comfyOutputs: {},
    defaultVersionId: "version-1",
    files: [{ filename: "test.mp4", subfolder: "", type: "output", absolutePath: "C:\\video\\test.mp4" }],
    versions: [{
      id: "version-1",
      kind: "original",
      createdAt: "2026-08-26T10:00:00.000Z",
      outputFilename: "test.mp4",
      modelId: "minimax_h3_fl2va",
      width: 1280,
      height: 720,
      duration: 4,
      fps: 24,
      workflowPath: "workflow.json",
      comfyPromptId: "prompt-1",
      comfyOutputs: {},
      files: [{ filename: "test.mp4", subfolder: "", type: "output", absolutePath: "C:\\video\\test.mp4" }]
    }]
  }];
  const showItemInFolder = vi.fn(async () => true);
  const openSystemPlayer = vi.fn(async () => ({ ok: true, message: "" }));
  const context: RendererContext = {
    root: document.createElement("main"),
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: { showItemInFolder, openSystemPlayer } as unknown as RendererContext["hostCapabilities"],
    getState: () => state,
    getRoute: () => ({ page: "history-detail", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => translator,
    t: translator.t,
    requestRender: () => undefined,
    navigate: () => undefined,
    notify: vi.fn(),
    reportUserAction: () => undefined
  };
  return { state, context, showItemInFolder, openSystemPlayer };
}

function createOptions(state: ReturnType<typeof createDefaultState>, context: RendererContext) {
  const copyHistoryFile = vi.fn(async () => undefined);
  const toggleHistoryPlayerFullscreen = vi.fn();
  return {
    getState: () => state,
    openHistoryDetail: vi.fn(),
    editHistoryAsset: vi.fn(async () => undefined),
    openImageHistoryDetail: vi.fn(),
    continueImageEdit: vi.fn(async () => undefined),
    continueImageToVideo: vi.fn(async () => undefined),
    copyHistoryFile,
    copyHistoryText: vi.fn(async () => undefined),
    requestHistoryDeletion: vi.fn(),
    toggleHistoryPlayerFullscreen,
    context
  };
}

afterEach(() => {
  delete (document as Document & { fullscreenElement?: Element | null }).fullscreenElement;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("history player context menu", () => {
  it("exposes the five requested actions and routes file operations", async () => {
    const { state, context, showItemInFolder, openSystemPlayer } = createHistoryContext();
    const options = createOptions(state, context);
    const menus = createHistoryContextMenus(context, options);
    const player = document.createElement("div");
    const video = document.createElement("video");
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
    player.append(video);
    document.body.append(player);

    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, video);
    expect(document.querySelector(".history-player-context-menu .history-context-heading")).toBeNull();
    const actionButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-history-player-action]")];
    expect(actionButtons.map((button) => button.dataset.historyPlayerAction)).toEqual([
      "copy-file",
      "show-file",
      "open-system-player",
      "video-info",
      "fullscreen"
    ]);

    document.querySelector<HTMLButtonElement>("[data-history-player-action=copy-file]")?.click();
    await Promise.resolve();
    expect(options.copyHistoryFile).toHaveBeenCalledWith("C:\\video\\test.mp4", "视频文件已复制。");

    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, video);
    document.querySelector<HTMLButtonElement>("[data-history-player-action=show-file]")?.click();
    await Promise.resolve();
    expect(showItemInFolder).toHaveBeenCalledWith("C:\\video\\test.mp4");

    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, video);
    document.querySelector<HTMLButtonElement>("[data-history-player-action=open-system-player]")?.click();
    await Promise.resolve();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(openSystemPlayer).toHaveBeenCalledWith("C:\\video\\test.mp4");
  });

  it("opens a compact info panel and switches the fullscreen action label", () => {
    const { state, context } = createHistoryContext();
    const options = createOptions(state, context);
    const menus = createHistoryContextMenus(context, options);
    const player = document.createElement("div");
    document.body.append(player);

    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, player);
    document.querySelector<HTMLButtonElement>("[data-history-player-action=video-info]")?.click();
    const info = document.querySelector<HTMLElement>(".history-player-info-menu");
    const overlay = info?.parentElement;
    expect(info?.classList.contains("history-context-menu")).toBe(false);
    expect(overlay?.classList.contains("history-player-info-overlay")).toBe(true);
    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect(overlay?.hasAttribute("noautohide")).toBe(true);
    expect(info?.textContent).toContain("1280 × 720");
    expect(info?.textContent).toContain("24 FPS");
    expect(info?.textContent).toContain("C:\\video\\test.mp4");
    expect(info?.querySelectorAll(".history-player-info-row")).toHaveLength(9);
    expect(info?.querySelectorAll(".history-player-info-row .history-player-info-label")).toHaveLength(9);
    expect(info?.querySelectorAll(".history-player-info-row .history-player-info-value")).toHaveLength(9);
    expect(info?.querySelector(".history-player-info-path-row")?.textContent).toContain("C:\\video\\test.mp4");

    info?.querySelector<HTMLButtonElement>("[data-history-player-info-close]")?.click();
    expect(document.querySelector(".history-player-info-menu")).toBeNull();

    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: player });
    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, player);
    document.querySelector<HTMLButtonElement>("[data-history-player-action=video-info]")?.click();
    const fullscreenInfo = document.querySelector<HTMLElement>(".history-player-info-menu");
    expect(fullscreenInfo?.parentElement).toBe(player.querySelector(".history-player-info-overlay"));
    expect(fullscreenInfo?.parentElement?.getAttribute("role")).toBe("dialog");
    fullscreenInfo?.querySelector<HTMLButtonElement>("[data-history-player-info-close]")?.click();

    menus.openHistoryPlayer("video-1", "version-1", 100, 100, player, player);
    const fullscreenButton = document.querySelector<HTMLButtonElement>("[data-history-player-action=fullscreen]");
    expect(fullscreenButton?.textContent).toContain("退出全屏");
    fullscreenButton?.click();
    expect(options.toggleHistoryPlayerFullscreen).toHaveBeenCalledWith(player);
  });
});
