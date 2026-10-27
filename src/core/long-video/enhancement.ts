import { assertLongVideoLayout, type LongVideoLayout } from "./layout.js";
import { editLongVideoScript, scriptPageText, type LongVideoScript, type ScriptIdFactory } from "./script.js";

export interface LongVideoPromptRequest {
  schemaVersion: 1;
  scriptId: string;
  revision: number;
  layout: LongVideoLayout;
  sharedPreamble: boolean;
  brief: { pageId: string; text: string; locked: boolean };
  segments: Array<{ pageId: string; text: string; outline: string; locked: boolean }>;
  targetPageId?: string;
}
export interface LongVideoPromptResult {
  schemaVersion: 1;
  scriptId: string;
  revision: number;
  brief?: string;
  segments: Array<{ pageId: string; text: string; outline: string }>;
}
const safeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,150}$/u.test(id);
const text = (value: unknown, max = 24000): value is string => typeof value === "string" && value.length <= max;
export function assertLongVideoPromptRequest(request: LongVideoPromptRequest): void {
  if (!request || request.schemaVersion !== 1 || !safeId(request.scriptId) || !Number.isSafeInteger(request.revision) || request.revision < 0) throw new Error("Invalid long-video prompt identity");
  assertLongVideoLayout(request.layout);
  if (!request.brief || request.brief.pageId !== request.scriptId || !text(request.brief.text) || typeof request.brief.locked !== "boolean" ||
      typeof request.sharedPreamble !== "boolean" || !Array.isArray(request.segments) || request.segments.length !== request.layout.chunks ||
      new Set([request.scriptId, ...request.segments.map(p => p.pageId)]).size !== request.segments.length + 1 ||
      request.segments.some(p => !safeId(p.pageId) || !text(p.text) || !text(p.outline, 4000) || typeof p.locked !== "boolean") ||
      (request.targetPageId !== undefined && !request.segments.some(p => p.pageId === request.targetPageId && !p.locked)) ||
      JSON.stringify(request).length > 100000) throw new Error("Invalid or oversized long-video prompt pages");
}
export function longVideoPromptRequest(script: LongVideoScript, targetPageId?: string): LongVideoPromptRequest {
  if (script.wholeBuffer || Object.keys(script.pageBuffers ?? {}).length) throw new Error("Commit script edits first");
  const request: LongVideoPromptRequest = { schemaVersion: 1, scriptId: script.brief.id, revision: script.revision,
    layout: structuredClone(script.layout), sharedPreamble: Boolean(script.sharedPreamble),
    brief: { pageId: script.brief.id, text: scriptPageText(script.brief), locked: script.brief.locked },
    segments: script.segments.map(p => ({ pageId: p.id, text: scriptPageText(p), outline: p.outline, locked: p.locked })),
    ...(targetPageId ? { targetPageId } : {}) };
  assertLongVideoPromptRequest(request); return request;
}
export function longVideoPromptTargets(request: LongVideoPromptRequest) {
  return request.segments.filter(p => !p.locked && (!request.targetPageId || p.pageId === request.targetPageId));
}
export function parseLongVideoPromptResult(raw: string, request: LongVideoPromptRequest): LongVideoPromptResult {
  const result = JSON.parse(raw) as LongVideoPromptResult;
  const targets = longVideoPromptTargets(request);
  if (!result || result.schemaVersion !== 1 || result.scriptId !== request.scriptId || result.revision !== request.revision ||
      (result.brief !== undefined && (request.targetPageId || request.brief.locked || !text(result.brief) || !result.brief.trim())) ||
      !Array.isArray(result.segments) || result.segments.length !== targets.length || result.segments.some((p, i) =>
        p.pageId !== targets[i]!.pageId || !text(p.text) || !p.text.trim() || !text(p.outline, 4000) || !p.outline.trim())) throw new Error("Incomplete or mismatched long-video prompt result; original script preserved");
  return structuredClone(result);
}
export function applyLongVideoPromptResult(script: LongVideoScript, request: LongVideoPromptRequest, raw: string, id: ScriptIdFactory): LongVideoScript {
  if (JSON.stringify(longVideoPromptRequest(script, request.targetPageId)) !== JSON.stringify(request)) throw new Error("Script changed while enhancement was running; original script preserved");
  const output = parseLongVideoPromptResult(raw, request);
  const edits = output.segments.map(p => ({ pageId: p.pageId, text: p.text }));
  if (output.brief !== undefined) edits.unshift({ pageId: script.brief.id, text: output.brief });
  const next = editLongVideoScript(script, edits, script.revision, "model", id);
  let adopted = false;
  for (const entry of output.segments) {
    const page = next.segments.find(p => p.id === entry.pageId)!;
    adopted ||= page.outline !== entry.outline || page.stale;
    page.outline = entry.outline; page.stale = false;
  }
  if (adopted && next.revision === script.revision) next.revision++;
  return next;
}
