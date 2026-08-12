import { describe, expect, it } from "vitest";
import { createDefaultDraft } from "../src/core/defaults";
import {
  activePromptIndexForDraft,
  clearPromptVersion,
  ensureDraftPromptState,
  promptPatchForDraft,
  promptVersionsForDraft
} from "../src/core/draft-prompts";

describe("draft prompt state", () => {
  it("keeps image-to-video and extension prompt versions separate", () => {
    const draft = createDefaultDraft();
    const imagePrompt = { id: "image", label: "Image", text: "image prompt", createdAt: "now" };
    const extensionPrompt = { id: "extension", label: "Extension", text: "extension prompt", createdAt: "now" };
    const current = {
      ...draft,
      promptVersions: [imagePrompt],
      activePromptVersion: 0,
      extensionPromptVersions: [extensionPrompt],
      extensionActivePromptVersion: 0
    };

    expect(promptVersionsForDraft({ ...current, inputMode: "image" })).toEqual([imagePrompt]);
    expect(promptVersionsForDraft({ ...current, inputMode: "video" })).toEqual([extensionPrompt]);
    expect(activePromptIndexForDraft({ ...current, inputMode: "video" })).toBe(0);

    const nextExtension = [{ ...extensionPrompt, text: "updated extension prompt" }];
    expect(promptPatchForDraft({ ...current, inputMode: "video" }, nextExtension, 0)).toEqual({
      extensionPromptVersions: nextExtension,
      extensionActivePromptVersion: 0
    });
  });

  it("backfills an independent extension prompt state for legacy drafts", () => {
    const draft = createDefaultDraft();
    const legacyDraft = {
      ...draft,
      extensionPromptVersions: undefined,
      extensionActivePromptVersion: undefined
    };
    const migrated = ensureDraftPromptState(legacyDraft);

    expect(migrated.extensionPromptVersions?.[0]).toMatchObject({
      label: migrated.promptVersions[0]?.label,
      text: migrated.promptVersions[0]?.text,
      createdAt: migrated.promptVersions[0]?.createdAt
    });
    expect(migrated.extensionPromptVersions).not.toBe(migrated.promptVersions);
    expect(migrated.extensionPromptVersions?.[0]).not.toBe(migrated.promptVersions[0]);
    expect(migrated.extensionPromptVersions?.[0]?.id).not.toBe(migrated.promptVersions[0]?.id);
    expect(migrated.extensionActivePromptVersion).toBe(migrated.activePromptVersion);
  });

  it("removes the active version while retaining one editable blank version", () => {
    const versions = [
      { id: "one", label: "One", text: "first", createdAt: "now" },
      { id: "two", label: "Two", text: "second", createdAt: "now" }
    ];

    expect(clearPromptVersion(versions, 1)).toEqual({
      promptVersions: [versions[0]],
      activePromptVersion: 0
    });
    expect(clearPromptVersion([versions[0]], 0)).toEqual({
      promptVersions: [{ ...versions[0], text: "" }],
      activePromptVersion: 0
    });
  });
});
