import { describe, expect, it } from "vitest";
import { renderConfirmationDialog } from "../src/renderer/shell/dialogs";

describe("prompt CPU fallback confirmation", () => {
  it("shows measured VRAM and uses a non-destructive continuation action", () => {
    const html = renderConfirmationDialog({
      request: {
        kind: "prompt-cpu-fallback",
        usedVram: "18.3 GiB",
        totalVram: "24.0 GiB",
        freeVram: "5.7 GiB",
        requiredVram: "20.0 GiB"
      },
      confirmationBusy: false,
      imageHistoryIds: new Set(),
      t: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
      icon: (name) => `<i>${name}</i>`,
      escapeHtml: (value) => String(value)
    });

    expect(html).toContain("18.3 GiB");
    expect(html).toContain("5.7 GiB");
    expect(html).toContain("20.0 GiB");
    expect(html).toContain("dialog.promptCpu.continue");
    expect(html).toContain('class="primary button-with-icon"');
    expect(html).not.toContain('class="primary destructive button-with-icon"');
  });
});
