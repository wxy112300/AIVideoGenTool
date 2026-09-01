// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createTranslator } from "../src/core/i18n";
import type { Page } from "../src/renderer/contracts";
import { mountShellController } from "../src/renderer/shell/controller";
import { renderShell } from "../src/renderer/shell/page";

function render(page: "create" | "history-detail" | "settings") {
  const translator = createTranslator("zh-CN");
  return renderShell({
    page,
    appVersion: "0.30.0",
    queueCount: 2,
    performanceMetrics: null,
    flashMessage: "",
    flashKind: "info",
    content: "<div>content</div>",
    t: translator.t,
    icon: () => "",
    escapeHtml: (value) => String(value)
  });
}

describe("renderer shell navigation semantics", () => {
  it("marks the active top-level page as the current page", () => {
    const html = render("settings");

    expect(html).toContain('data-page="settings" aria-current="page"');
    expect(html).not.toContain('data-page="create" aria-current="page"');
    expect(html).not.toContain('data-page="queue" aria-current="page"');
    expect(html).not.toContain('data-page="history" aria-current="page"');
  });

  it("keeps History selected on both detail routes", () => {
    const html = render("history-detail");

    expect(html).toContain('data-page="history" aria-current="page"');
    expect(html).not.toContain('data-page="create" aria-current="page"');
    expect(html).not.toContain('data-page="settings" aria-current="page"');
  });

  it("renders a keyboard-reachable dismiss control for global notices", () => {
    const translator = createTranslator("zh-CN");
    const html = renderShell({
      page: "create",
      appVersion: "0.31.0",
      queueCount: 0,
      performanceMetrics: null,
      flashMessage: "扫描失败",
      flashKind: "error",
      flashActions: [{ id: "open-settings", label: "打开设置", tone: "primary", run: () => undefined }],
      content: "<div>content</div>",
      t: translator.t,
      icon: () => "<svg></svg>",
      escapeHtml: (value) => String(value)
    });

    expect(html).toContain('id="dismiss-app-flash"');
    expect(html).toContain('aria-label="关闭通知"');
    expect(html).toContain('data-flash-message>扫描失败</span>');
    expect(html).toContain('data-notification-action="open-settings"');
    expect(html).toContain(">打开设置</button>");
  });

  it("does not let a stale navigation frame reset a newly entered History page", () => {
    document.body.innerHTML = '<button data-page="queue">Queue</button>';
    let page: Page = "create";
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const cleanup = mountShellController({
      getPage: () => page,
      settingsHaveUnsavedChanges: () => false,
      rememberModalFocus: () => undefined,
      requestDiscardSettings: () => undefined,
      returnToHistory: () => undefined,
      returnToLastHistoryDetail: () => undefined,
      navigateHistoryDetail: () => undefined,
      navigateImageHistoryDetail: () => undefined,
      captureHistoryScrollPosition: () => undefined,
      setHistoryScrollRestorePending: () => undefined,
      clearHistoryForwardTarget: () => undefined,
      setPage: (nextPage) => {
        page = nextPage;
      },
      dismissNotification: () => undefined,
      runNotificationAction: () => undefined,
      reportUserAction: () => undefined,
      render: () => undefined
    });

    document.querySelector<HTMLButtonElement>("[data-page=queue]")?.click();
    page = "history";
    frames.shift()?.(0);

    expect(scrollTo).not.toHaveBeenCalled();
    cleanup();
  });
});
