import { describe, expect, it, vi } from "vitest";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import { createDefaultSettings } from "../src/core/defaults";

describe("settings form", () => {
  it("reads the selected UI locale instead of retaining the old locale", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: vi.fn((selector: string) =>
        selector === "#ui-locale"
          ? { value: "en-US" }
          : null
      )
    } as unknown as Document;

    try {
      const settings = readSettingsFromForm(
        createDefaultSettings(),
        "official-storyboard",
        "faithful"
      );
      expect(settings.uiLocale).toBe("en-US");
    } finally {
      globalThis.document = previousDocument;
    }
  });
});