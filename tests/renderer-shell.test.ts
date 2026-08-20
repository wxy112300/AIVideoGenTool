import { describe, expect, it } from "vitest";

import { createTranslator } from "../src/core/i18n";
import { renderShell } from "../src/renderer/shell/page";

function render(page: "create" | "history-detail" | "settings") {
  const translator = createTranslator("zh-CN");
  return renderShell({
    page,
    appVersion: "0.30.0",
    queueCount: 2,
    flashMessage: "",
    flashKind: "info",
    content: "<div>content</div>",
    t: translator.t,
    icon: () => "",
    escapeHtml: (value) => String(value),
    confirmationDialog: "",
    directoryMigrationDialog: "",
    imageAssetLibraryDialog: "",
    windowCloseDialog: "",
    upscaleDialog: "",
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
});
