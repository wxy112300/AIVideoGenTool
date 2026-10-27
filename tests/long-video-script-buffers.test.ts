import { describe, expect, it } from "vitest";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript, editLongVideoScript, freezeLongVideoScript, scriptPageText } from "../src/core/long-video/script";
import { commitScriptText, stageScriptText } from "../src/core/long-video/script-buffers";
import { createDefaultDraft } from "../src/core/defaults";
import { createClearedDraft } from "../src/core/draft-defaults";

describe("durable script typing", () => {
  it("commits multiple page buffers in one revision and blocks asynchronous replacement while typing", () => {
    let n = 0; const id = () => `id_${++n}`;
    const original = createLongVideoScript(createLongVideoLayout(15, 2), id);
    let staged = stageScriptText(original, original.segments[0]!.id, "a");
    staged = stageScriptText(staged, original.segments[0]!.id, "abc");
    staged = stageScriptText(staged, original.segments[1]!.id, "def");
    expect(staged.segments[0]!.versions).toHaveLength(1);
    expect(() => editLongVideoScript(staged, [], staged.revision, "model", id)).toThrow(/Commit/);
    expect(() => freezeLongVideoScript(staged)).toThrow(/Commit/);
    const committed = commitScriptText(JSON.parse(JSON.stringify(staged)), id);
    expect(committed.revision).toBe(staged.revision + 1);
    expect(committed.segments.map(scriptPageText)).toEqual(["abc", "def"]);
    expect(committed.segments.map(p => p.versions.length)).toEqual([2, 2]);
    expect(committed.pageBuffers).toBeUndefined();
    expect(freezeLongVideoScript(committed).pages[1]!.text).toBe("abc");
    expect(original.revision).toBe(0);
    const cleared = createClearedDraft({ ...createDefaultDraft(), longVideoScript: staged,
      longVideoEditor: { key: "test", active: false, seconds: 15, count: 2, confirmed: true } });
    expect(cleared.longVideoScript).toBeUndefined();
    expect(cleared.longVideoEditor).toBeUndefined();
  });
});
