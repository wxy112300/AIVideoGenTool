// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createTranslator } from "../src/core/i18n";
import type { Page } from "../src/renderer/contracts";
import { mountShellController } from "../src/renderer/shell/controller";
import { renderShell } from "../src/renderer/shell/page";
import { createNotification } from "../src/renderer/notifications";
import { createNotificationStack } from "../src/renderer/shared/ui/notify";

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

    expect(html).not.toContain('id="app-flash"');
    const stack = createNotificationStack({ dismissLabel: () => "关闭通知", changed: () => {}, action: () => {} });
    stack.push(createNotification(1, "扫描失败", "error", undefined, [{ id: "open-settings", label: "打开设置", run: () => {} }]));
    const close = document.querySelector<HTMLButtonElement>('.ui-notice [aria-label="关闭通知"]')!;
    close.focus(); expect(document.activeElement).toBe(close);
    expect(document.querySelector('.ui-notice[role="alert"]')?.textContent).toContain("扫描失败");
    expect(document.querySelector('[data-notification-action="open-settings"]')?.textContent).toBe("打开设置");
    stack.dispose();
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

  it("ignores another return click while history is already requested, preserving its saved anchor", () => {
    document.body.innerHTML = '<button class="history-detail-back-button" data-page="history">Back</button>';
    const capture = vi.fn(), render = vi.fn();
    const cleanup = mountShellController({
      getPage: () => "history", settingsHaveUnsavedChanges: () => false,
      rememberModalFocus: vi.fn(), requestDiscardSettings: vi.fn(),
      returnToHistory: vi.fn(), returnToLastHistoryDetail: vi.fn(),
      navigateHistoryDetail: vi.fn(), navigateImageHistoryDetail: vi.fn(),
      captureHistoryScrollPosition: capture, setHistoryScrollRestorePending: vi.fn(),
      clearHistoryForwardTarget: vi.fn(), setPage: vi.fn(), dismissNotification: vi.fn(),
      runNotificationAction: vi.fn(), reportUserAction: vi.fn(), render
    });
    document.querySelector<HTMLButtonElement>("button")!.click();
    expect(capture).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    cleanup();
  });
});
