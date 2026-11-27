import { assertLongVideoLayout, type LongVideoLayout } from "./layout.js";
import { editLongVideoScript, isScriptAllocation, scriptPageText, type LongVideoScript, type ScriptIdFactory } from "./script.js";

export type LongVideoWritingOperation = "allocate" | "expand";

export interface LongVideoPromptRequest {
  schemaVersion: 1;
  scriptId: string;
  revision: number;
  layout: LongVideoLayout;
  sharedPreamble: boolean;
  storyBible?: string;
  brief: { pageId: string; text: string; locked: boolean };
  segments: Array<{ pageId: string; text: string; outline: string; locked: boolean; userEditedDirection?: true }>;
  targetPageId?: string;
  targetPageIds?: string[];
  operation?: LongVideoWritingOperation;
}
export interface LongVideoPromptResult {
  schemaVersion: 1;
  scriptId: string;
  revision: number;
  brief?: string;
  storyBible?: string;
  segments: Array<{ pageId: string; text: string; outline: string }>;
}
const safeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,150}$/u.test(id);
const text = (value: unknown, max = 24000): value is string => typeof value === "string" && value.length <= max;
export function assertLongVideoPromptRequest(request: LongVideoPromptRequest): void {
  if (!request || request.schemaVersion !== 1 || !safeId(request.scriptId) || !Number.isSafeInteger(request.revision) || request.revision < 0) throw new Error("Invalid long-video prompt identity");
  assertLongVideoLayout(request.layout);
  if (!request.brief || request.brief.pageId !== request.scriptId || !text(request.brief.text) || typeof request.brief.locked !== "boolean" ||
      typeof request.sharedPreamble !== "boolean" || (request.storyBible !== undefined && !text(request.storyBible, 4000)) || !Array.isArray(request.segments) || request.segments.length !== request.layout.chunks ||
      new Set([request.scriptId, ...request.segments.map(p => p.pageId)]).size !== request.segments.length + 1 ||
      request.segments.some(p => !safeId(p.pageId) || !text(p.text) || !text(p.outline, 4000) || typeof p.locked !== "boolean" ||
        (p.userEditedDirection !== undefined && p.userEditedDirection !== true)) ||
      (request.operation !== undefined && request.operation !== "allocate" && request.operation !== "expand") ||
      (request.targetPageId !== undefined && (request.operation === "allocate" || !request.segments.some(p => p.pageId === request.targetPageId && !p.locked))) ||
      (request.targetPageIds !== undefined && (request.operation === "allocate" || request.targetPageId !== undefined ||
        !Array.isArray(request.targetPageIds) || !request.targetPageIds.length || new Set(request.targetPageIds).size !== request.targetPageIds.length ||
        request.targetPageIds.some(id => !request.segments.some(page => page.pageId === id && !page.locked)))) ||
      (request.operation === "allocate" && !request.brief.text.trim() && !request.segments.some(p => p.text.trim())) ||
      (request.operation === "expand" && longVideoPromptTargets(request).some(p => !p.text.trim())) ||
      JSON.stringify(request).length > 100000) throw new Error("Invalid or oversized long-video prompt pages");
}
export function longVideoPromptRequest(script: LongVideoScript, targetPageId?: string, operation?: LongVideoWritingOperation,
  targetPageIds?: string[]): LongVideoPromptRequest {
  if (script.wholeBuffer || Object.keys(script.pageBuffers ?? {}).length) throw new Error("Commit script edits first");
  const targets = targetPageId ? [targetPageId] : targetPageIds;
  const request: LongVideoPromptRequest = { schemaVersion: 1, scriptId: script.brief.id, revision: script.revision,
    layout: structuredClone(script.layout), sharedPreamble: Boolean(script.sharedPreamble),
    ...(script.storyBible?.trim() ? { storyBible: script.storyBible.trim().slice(0, 4000) } : {}),
    brief: { pageId: script.brief.id, text: scriptPageText(script.brief), locked: script.brief.locked },
    segments: script.segments.map(p => {
      const fullText = scriptPageText(p);
      const contextOnly = p.locked || Boolean(targets && !targets.includes(p.id));
      const context = contextOnly && fullText.length > 3600 ? `${fullText.slice(0, 1000)}\n\n${fullText.slice(-2600)}` : fullText;
      const outline = isScriptAllocation(p) ? fullText.slice(0, 4000) : p.outline;
      return { pageId: p.id, text: context, outline: contextOnly ? outline.slice(0, 1200) : outline, locked: p.locked,
        ...(operation === "expand" && p.versions.some(v => v.id === p.activeVersionId && v.source === "user" && v.text.trim())
          ? { userEditedDirection: true as const } : {}) };
    }),
    ...(targetPageId ? { targetPageId } : {}), ...(targetPageIds ? { targetPageIds: [...targetPageIds] } : {}), ...(operation ? { operation } : {}) };
  assertLongVideoPromptRequest(request); return request;
}
export function longVideoPromptTargets(request: LongVideoPromptRequest) {
  return request.segments.filter(p => !p.locked && (!request.targetPageId || p.pageId === request.targetPageId) &&
    (!request.targetPageIds || request.targetPageIds.includes(p.pageId)));
}
export function parseLongVideoPromptResult(raw: string, request: LongVideoPromptRequest): LongVideoPromptResult {
  const result = JSON.parse(raw) as LongVideoPromptResult;
  const targets = longVideoPromptTargets(request);
  if (!result || result.schemaVersion !== 1 || result.scriptId !== request.scriptId || result.revision !== request.revision ||
      (result.brief !== undefined && (request.operation || request.targetPageId || request.brief.locked || !text(result.brief) || !result.brief.trim())) ||
      (result.storyBible !== undefined && !text(result.storyBible, 4000)) ||
      !Array.isArray(result.segments) || result.segments.length !== targets.length || result.segments.some((p, i) =>
        p.pageId !== targets[i]!.pageId || !text(p.text) || !p.text.trim() || !text(p.outline, 4000) || !p.outline.trim())) throw new Error("Incomplete or mismatched long-video prompt result; original script preserved");
  return structuredClone(result);
}
export function applyLongVideoPromptResult(script: LongVideoScript, request: LongVideoPromptRequest, raw: string, id: ScriptIdFactory): LongVideoScript {
  if (JSON.stringify(longVideoPromptRequest(script, request.targetPageId, request.operation, request.targetPageIds)) !== JSON.stringify(request)) throw new Error("Script changed while enhancement was running; original script preserved");
  const output = parseLongVideoPromptResult(raw, request);
  const stage = request.operation === "allocate" ? "allocation" : "prompt";
  const edits: Parameters<typeof editLongVideoScript>[1] = output.segments.map(p => ({ pageId: p.pageId, text: p.text, stage }));
  if (output.brief !== undefined) edits.unshift({ pageId: script.brief.id, text: output.brief });
  const next = editLongVideoScript(script, edits, script.revision, "model", id);
  let adopted = false;
  if (output.storyBible !== undefined && next.storyBible !== output.storyBible) {
    next.storyBible = output.storyBible;
    adopted = true;
  }
  for (const entry of output.segments) {
    const page = next.segments.find(p => p.id === entry.pageId)!;
    adopted ||= page.outline !== entry.outline || page.stale;
    page.outline = entry.outline; page.stale = false;
  }
  if (adopted && next.revision === script.revision) next.revision++;
  return next;
}
