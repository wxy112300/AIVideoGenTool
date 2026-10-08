import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { remapVideoMigrationConsumers, type VideoHistoryMigrationPlan } from "../src/infrastructure/video-history-migration";

it("moves only planned file references across drafts, slots and queued source snapshots", () => {
  const state = createDefaultState();
  state.videoExtensionDraft = structuredClone(state.draft);
  state.imageToVideoDraft = structuredClone(state.draft);
  const oldPath = path.resolve("output/old/source.mp4");
  const newPath = path.resolve("output/new/source.mp4");
  const other = path.resolve("output/old/unrelated.mp4");
  const plan = { entries: [{ sourcePath: oldPath, targetPath: newPath }] } as VideoHistoryMigrationPlan;
  state.draft.sourceVideoPath = oldPath;
  state.draft.extensionPrompt = oldPath;
  state.videoExtensionDraft.sourceVideoPath = oldPath;
  state.imageToVideoDraft.sourceVideoPath = other;
  state.videoExtensionDraft.h3ReferenceSlots = [{ id: "source-slot", mediaPath: oldPath }] as typeof state.videoExtensionDraft.h3ReferenceSlots;
  state.queue = [{ id: "waiting", taskType: "extension", sourceVideoPath: oldPath, updatedAt: "before" }] as typeof state.queue;
  remapVideoMigrationConsumers(state, plan);
  expect(state.draft.sourceVideoPath).toBe(newPath);
  expect(state.videoExtensionDraft.sourceVideoPath).toBe(newPath);
  expect(state.videoExtensionDraft.h3ReferenceSlots[0]?.mediaPath).toBe(newPath);
  expect(state.queue[0]).toMatchObject({ id: "waiting", sourceVideoPath: newPath });
  expect(state.queue[0]?.updatedAt).not.toBe("before");
  expect(state.draft.extensionPrompt).toBe(oldPath);
  expect(state.imageToVideoDraft.sourceVideoPath).toBe(other);
});

describe("shared path consumers", () => {
  it("does not remap the same shared object twice when target is another planned source", () => {
    const state = createDefaultState();
    const first = path.resolve("output/a.mp4"), second = path.resolve("output/b.mp4"), third = path.resolve("output/c.mp4");
    const plan = { entries: [{ sourcePath: first, targetPath: second }, { sourcePath: second, targetPath: third }] } as VideoHistoryMigrationPlan;
    state.draft.sourceVideoPath = first;
    state.videoExtensionDraft = state.draft;
    remapVideoMigrationConsumers(state, plan);
    expect(state.draft.sourceVideoPath).toBe(second);
  });
});
