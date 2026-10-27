import { expect, it } from "vitest";
import { createLongVideoLayout } from "../src/core/long-video/layout";
import { createLongVideoScript, scriptPageText, updateScriptPage } from "../src/core/long-video/script";
import { applyLongVideoPromptResult, longVideoPromptRequest, parseLongVideoPromptResult } from "../src/core/long-video/enhancement";

function fixture() { let n = 0; const id = () => `page-${++n}`; return { script: createLongVideoScript(createLongVideoLayout(120, 12), id, "A complete street story"), id }; }
it("adopts a complete 120-second package atomically with model versions and stable page IDs", () => {
  const { script, id } = fixture(), request = longVideoPromptRequest(script);
  const raw = JSON.stringify({ schemaVersion: 1, scriptId: request.scriptId, revision: request.revision, brief: "Complete ordered story",
    segments: request.segments.map((p, i) => ({ pageId: p.pageId, text: `Action ${i}`, outline: `Boundary ${i}` })) });
  const result = applyLongVideoPromptResult(script, request, raw, id);
  expect(result.segments.map(p => p.id)).toEqual(script.segments.map(p => p.id));
  expect(result.segments.every(p => !p.stale && p.versions.at(-1)?.source === "model")).toBe(true);
  expect(result.brief.versions).toHaveLength(2); expect(scriptPageText(script.brief)).toBe("A complete street story");
  expect(result.revision).toBe(1); expect(result.layout.requestedSeconds).toBe(120);
});
it("refuses partial, reordered, duplicate or stale output without changing any page", () => {
  const { script, id } = fixture(), request = longVideoPromptRequest(script);
  const response = { schemaVersion: 1, scriptId: request.scriptId, revision: request.revision,
    segments: request.segments.map(p => ({ pageId: p.pageId, text: "Action", outline: "Boundary" })) };
  for (const segments of [response.segments.slice(1), [...response.segments].reverse(), response.segments.map(() => response.segments[0])]) {
    expect(() => applyLongVideoPromptResult(script, request, JSON.stringify({ ...response, segments }), id)).toThrow();
  }
  const changed = updateScriptPage(script, script.segments[0]!.id, { locked: true });
  expect(() => applyLongVideoPromptResult(changed, request, JSON.stringify(response), id)).toThrow(/changed/);
  expect(script.segments.every(p => p.versions.length === 1)).toBe(true);
});
it("scopes local enhancement to one unlocked page and never overwrites a locked page", () => {
  const { script } = fixture(); script.segments[0]!.locked = true;
  expect(() => longVideoPromptRequest(script, script.segments[0]!.id)).toThrow();
  const request = longVideoPromptRequest(script, script.segments[1]!.id);
  const result = { schemaVersion: 1, scriptId: request.scriptId, revision: request.revision,
    segments: [{ pageId: request.targetPageId, text: "A local detail", outline: "A local boundary" }] };
  expect(parseLongVideoPromptResult(JSON.stringify(result), request).segments).toHaveLength(1);
  expect(() => parseLongVideoPromptResult(JSON.stringify({ ...result, brief: "unrelated rewrite" }), request)).toThrow();
});
