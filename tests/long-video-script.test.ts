import { describe, expect, it } from "vitest";
import { createDefaultDraft } from "../src/core/defaults";
import { normalizeVideoDraft } from "../src/core/video-draft-normalization";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { applyWholeScript, compileLongVideoPrompts, createLongVideoScript, editLongVideoScript, freezeLongVideoScript, projectWholeScript, relayoutLongVideoScript, reviewScriptPage, scriptPageText, setScriptSharedPreamble, updateScriptPage } from "../src/core/long-video/script";

function fixture() {
  let n = 0;
  const id = () => `id_${++n}`;
  return { id, script: createLongVideoScript(createLongVideoLayout(15, 2), id, "全局\n[Chunk 1]\n\"对白\"") };
}
describe("structured long-video script", () => {
  it("keeps story notes out of sampling and explicitly prepends shared constraints to every chunk", () => {
    const { script, id } = fixture();
    const detailed = editLongVideoScript(script, script.segments.map((p, i) => ({ pageId: p.id, text: `Action ${i + 1}` })), 0, "user", id);
    expect(compileLongVideoPrompts(freezeLongVideoScript(detailed))).toEqual(["Action 1", "Action 2"]);
    const shared = setScriptSharedPreamble(detailed, true);
    expect(() => freezeLongVideoScript(shared)).toThrow(/stale/);
    const reviewed = shared.segments.reduce((s, p) => reviewScriptPage(s, p.id, s.revision), shared);
    expect(compileLongVideoPrompts(freezeLongVideoScript(reviewed))).toEqual([1, 2].map(i => `${scriptPageText(script.brief)}\n\nAction ${i}`));
    expect(detailed.sharedPreamble).toBeUndefined();
  });
  it("round trips long unicode and literal markers without creating versions on view switch", () => {
    const { script, id } = fixture();
    const edited = editLongVideoScript(script, script.segments.map(p => ({ pageId: p.id, text: "第一幕\n[id_1]\n\\\"".repeat(3000) })), 0, "user", id);
    expect(applyWholeScript(edited, projectWholeScript(edited), edited.revision, id)).toEqual(edited);
  });
  it("keeps partial and duplicate-marker raw buffers plus the last valid structure", () => {
    const { script, id } = fixture();
    const raw = projectWholeScript(script).replace(`[${script.segments[0].id}]`, `[${script.brief.id}]`);
    const invalid = applyWholeScript(script, raw, 0, id);
    expect(invalid.wholeBuffer?.raw).toBe(raw);
    expect(invalid.wholeBuffer?.error.line).toBe(3);
    expect(invalid.segments).toEqual(script.segments);
    expect(() => freezeLongVideoScript(invalid)).toThrow(/Resolve/);
    expect(() => editLongVideoScript(invalid, [], 0, "model", id)).toThrow(/Unresolved/);
    expect(() => editLongVideoScript(invalid, [{ pageId: script.segments[0].id, text: "切页后输入" }], 0, "user", id)).toThrow(/Unresolved/);
    expect(() => relayoutLongVideoScript(invalid, script.layout, script.segments.map(p => p.id), id)).toThrow(/Resolve/);
    expect(applyWholeScript(script, "[", 0, id).wholeBuffer?.raw).toBe("[");
    expect(applyWholeScript(invalid, projectWholeScript(script), 0, id).wholeBuffer).toBeUndefined();
  });
  it("commits whole multi-page changes as one revision and freezes the selected combination", () => {
    const { script, id } = fixture();
    const raw = [script.brief, ...script.segments].map(p => `[${p.id}]\n${JSON.stringify(p === script.brief ? scriptPageText(p) : "运动")}`).join("\n");
    const changed = applyWholeScript(script, raw, 0, id);
    expect(changed.revision).toBe(1);
    expect(changed.segments.every(p => p.versions.length === 2)).toBe(true);
    const snapshot = freezeLongVideoScript(changed);
    const later = editLongVideoScript(changed, [{ pageId: changed.segments[0].id, text: "后改" }], 1, "user", id);
    expect(snapshot.pages[1].text).toBe("运动");
    expect(scriptPageText(later.segments[0])).toBe("后改");
  });
  it("maps by explicit ID across reordering and archives removed pages without losing versions/locks", () => {
    const { script, id } = fixture();
    const locked = updateScriptPage(script, script.segments[1].id, { locked: true });
    const reordered = relayoutLongVideoScript(locked, createLongVideoLayout(15, 3), [script.segments[1].id, undefined, script.segments[0].id], id);
    expect(reordered.segments[0]).toMatchObject({ id: script.segments[1].id, locked: true, versions: script.segments[1].versions, stale: true });
    const removed = relayoutLongVideoScript(reordered, createLongVideoLayout(15, 1), [reordered.segments[2].id], id);
    expect(removed.archived.map(p => p.id)).toContain(script.segments[1].id);
    expect(() => relayoutLongVideoScript(script, script.layout, [script.segments[0].id, script.segments[0].id], id)).toThrow(/Ambiguous/);
    expect(() => relayoutLongVideoScript(script, script.layout, ["unknown", undefined], id)).toThrow(/Unknown/);
  });
  it("rejects stale asynchronous writes and locked replacements atomically", () => {
    const { script, id } = fixture();
    const locked = updateScriptPage(script, script.segments[1].id, { locked: true });
    expect(() => editLongVideoScript(locked, [], 0, "model", id)).toThrow(/Stale/);
    expect(() => editLongVideoScript(locked, locked.segments.map(p => ({ pageId: p.id, text: "模型" })), 1, "model", id)).toThrow(/locked/);
    expect(locked.segments.every(p => p.versions.length === 1)).toBe(true);
    const manual = editLongVideoScript(locked, [{ pageId: locked.segments[1].id, text: "手写" }], 1, "user", id);
    expect(scriptPageText(manual.segments[1])).toBe("手写");
  });
  it("marks detailed pages stale after brief/outline changes and retains old selectable versions", () => {
    const { script, id } = fixture();
    const detailed = editLongVideoScript(script, script.segments.map(p => ({ pageId: p.id, text: "详稿" })), 0, "user", id);
    const changed = editLongVideoScript(detailed, [{ pageId: script.brief.id, text: "新全局" }], 1, "user", id);
    expect(changed.segments.every(p => p.stale)).toBe(true);
    expect(() => freezeLongVideoScript(changed)).toThrow(/stale/);
    const reviewed = changed.segments.reduce((state, page) => reviewScriptPage(state, page.id, state.revision), changed);
    expect(freezeLongVideoScript(reviewed).pages[1].text).toBe("详稿");
    expect(updateScriptPage(detailed, detailed.segments[0].id, { outline: "提纲" }).segments[0].stale).toBe(true);
    const old = updateScriptPage(detailed, detailed.segments[0].id, { activeVersionId: detailed.segments[0].versions[0].id });
    expect(scriptPageText(old.segments[0])).toBe("");
  });
  it("preserves optional structured draft JSON while old drafts keep their native state", () => {
    const { script } = fixture();
    const old = createDefaultDraft();
    expect(normalizeVideoDraft(JSON.parse(JSON.stringify(old))).longVideoScript).toBeUndefined();
    const restored = normalizeVideoDraft(JSON.parse(JSON.stringify({ ...old, longVideoScript: script })));
    expect(restored.longVideoScript).toEqual(script);
    expect(restored.duration).toBe(old.duration);
    expect(restored.modelId).toBe(old.modelId);
  });
});
