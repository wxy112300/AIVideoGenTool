import { describe, expect, it } from "vitest";

import { createTranslator } from "../src/core/i18n";
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
});
