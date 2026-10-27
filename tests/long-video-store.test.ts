import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../electron/store.js";
import { createDefaultState } from "../src/core/defaults.js";
import { createLongVideoLayout } from "../src/core/long-video/layout.js";
import { applyWholeScript, createLongVideoScript, updateScriptPage } from "../src/core/long-video/script.js";

describe("optional long-video draft persistence", () => {
  it("restarts old drafts unchanged and retains IDs, versions, locks and invalid raw buffers independently", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "long-video-store-"));
    try {
      const filename = path.join(directory, "state.json");
      const state = createDefaultState();
      await fs.writeFile(filename, JSON.stringify(state));
      const store = new JsonStore(filename);
      const old = await store.load();
      expect(old.draft.longVideoScript).toBeUndefined();
      let n = 0;
      const id = () => `page_${++n}`;
      const script = createLongVideoScript(createLongVideoLayout(60), id, "意图");
      const locked = updateScriptPage(script, script.segments[0]!.id, { locked: true, outline: "未完成提纲" });
      const pending = applyWholeScript(locked, "未闭合\n[", locked.revision, id);
      await store.update(current => { current.draft.longVideoScript = pending; });
      const restarted = await new JsonStore(filename).load();
      expect(restarted.draft.longVideoScript).toEqual(pending);
      expect(restarted.draft.duration).toBe(old.draft.duration);
      expect(restarted.queue).toEqual(old.queue);
      expect(restarted.history).toEqual(old.history);
      expect(restarted.videoExtensionDraft?.longVideoScript).toBeUndefined();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
