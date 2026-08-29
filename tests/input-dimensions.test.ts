import { describe, expect, it } from "vitest";
import { createTranslator } from "../src/core/i18n";
import { normalizeH3ReferenceSlots } from "../src/core/h3-reference";
import { createDefaultDraft, createDefaultState } from "../src/core/defaults";
import { queueTaskFromDraft } from "../src/core/queue-task-factory";
import type { HistoryAsset, H3ReferenceRole } from "../src/types";
import { renderH3ReferenceSlotsMarkup } from "../src/renderer/pages/create/fragments";
import { renderVideoInputSnapshotMarkup } from "../src/renderer/pages/history/fragments";

const translator = createTranslator("zh-CN");
const roleLabels = {
  subject: "主体",
  scene: "场景",
  style: "风格",
  motion: "动作",
  camera: "镜头",
  voice: "声音",
  keyframe: "关键帧",
  other: "其他"
} satisfies Record<H3ReferenceRole, string>;

describe("video input image dimensions", () => {
  it("keeps valid reference image dimensions while normalizing legacy slots", () => {
    const slots = normalizeH3ReferenceSlots([
      { id: "picture-1", mediaType: "image", mediaPath: "one.png", width: 1920, height: 1080, role: "subject" },
      { id: "picture-2", mediaType: "image", mediaPath: "two.png", width: "bad", height: 720, role: "subject" }
    ]);

    expect(slots[0]).toMatchObject({ width: 1920, height: 1080 });
    expect(slots[1]).not.toHaveProperty("width");
    expect(slots[1]).not.toHaveProperty("height");
  });

  it("shows R2V image dimensions beside the Picture reference label", () => {
    const markup = renderH3ReferenceSlotsMarkup([
      { id: "picture-1", mediaType: "image", mediaPath: "one.png", width: 1920, height: 1080, role: "subject", note: "" }
    ], {
      t: translator.t,
      icon: (name) => `<i>${name}</i>`,
      escapeHtml: (value) => String(value),
      h3ReferenceRoleLabels: roleLabels
    });

    expect(markup).toContain("1920 × 1080");
    expect(markup).toContain("参考图片 · 1920 × 1080");
  });

  it("carries FL2VA and R2V dimensions into the history input snapshot", () => {
    const asset = {
      mediaKind: "video",
      inputMode: "image",
      startImagePath: "start.png",
      sourceWidth: 1920,
      sourceHeight: 1080,
      endImagePath: "end.png",
      endImageWidth: 1280,
      endImageHeight: 720,
      h3ReferenceSlots: [{
        id: "picture-1",
        mediaType: "image",
        mediaPath: "reference.png",
        width: 800,
        height: 600,
        role: "subject",
        note: ""
      }]
    } as unknown as HistoryAsset;
    const markup = renderVideoInputSnapshotMarkup(asset, {
      t: translator.t,
      escapeHtml: (value) => value,
      h3ReferenceRoleLabel: (role) => roleLabels[role]
    });

    expect(markup).toContain("分辨率 1920 × 1080");
    expect(markup).toContain("分辨率 1280 × 720");
    expect(markup).toContain("分辨率 800 × 600");
  });

  it("copies end-frame dimensions into an immutable generation task snapshot", () => {
    const state = createDefaultState();
    const draft = createDefaultDraft();
    draft.endImagePath = "end.png";
    draft.endImageWidth = 1280;
    draft.endImageHeight = 720;

    const task = queueTaskFromDraft(draft, state);
    expect(task.endImageWidth).toBe(1280);
    expect(task.endImageHeight).toBe(720);
  });
});
