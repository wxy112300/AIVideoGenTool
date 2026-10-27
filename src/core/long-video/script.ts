import { assertLongVideoLayout, type LongVideoLayout } from "./layout.js";

export interface ScriptVersion { id: string; text: string; source: "user" | "model"; }
export interface ScriptPage {
  id: string;
  versions: ScriptVersion[];
  activeVersionId: string;
  locked: boolean;
  stale: boolean;
  outline: string;
}
export interface LongVideoScript {
  schemaVersion: 1;
  revision: number;
  /** Explicit opt-in: Continuum prepends the global text to every chunk. */
  sharedPreamble?: boolean;
  layout: LongVideoLayout;
  brief: ScriptPage;
  segments: ScriptPage[];
  /** Removed pages remain recoverable; matching is always by ID, never page number. */
  archived: ScriptPage[];
  workingMode: "automatic" | "assisted";
  view: "whole" | "segment";
  activePageId: string;
  /** Durable in-progress typing; committed together on blur/navigation. */
  pageBuffers?: Record<string, string>;
  wholeBuffer?: { raw: string; error: { line: number; message: string } };
}
export type ScriptIdFactory = () => string;
const validId = (id: string) => /^[A-Za-z0-9_-]+$/u.test(id);
const clone = <T>(value: T): T => structuredClone(value);

function freshId(nextId: ScriptIdFactory, used: Set<string>): string {
  const id = nextId();
  if (!validId(id) || used.has(id)) throw new Error("Script IDs must be unique safe identifiers");
  used.add(id);
  return id;
}
function usedIds(script: LongVideoScript): Set<string> {
  return new Set([script.brief, ...script.segments, ...script.archived].flatMap(p => [p.id, ...p.versions.map(v => v.id)]));
}
function newPage(nextId: ScriptIdFactory, used: Set<string>, text = ""): ScriptPage {
  const id = freshId(nextId, used);
  const versionId = freshId(nextId, used);
  return { id, versions: [{ id: versionId, text, source: "user" }], activeVersionId: versionId, locked: false, stale: false, outline: "" };
}
export function scriptPageText(page: ScriptPage): string {
  const version = page.versions.find(v => v.id === page.activeVersionId);
  if (!version) throw new Error("Missing selected script version");
  return version.text;
}
export function createLongVideoScript(layout: LongVideoLayout, nextId: ScriptIdFactory, briefText = ""): LongVideoScript {
  assertLongVideoLayout(layout);
  const used = new Set<string>();
  const brief = newPage(nextId, used, briefText);
  return { schemaVersion: 1, revision: 0, layout: clone(layout), brief,
    segments: Array.from({ length: layout.chunks }, () => newPage(nextId, used)), archived: [],
    workingMode: "automatic", view: "segment", activePageId: brief.id };
}

/** Explicit ordered IDs are required when changing an existing layout; undefined creates a new page. */
export function relayoutLongVideoScript(script: LongVideoScript, layout: LongVideoLayout, pageIds: Array<string | undefined>, nextId: ScriptIdFactory): LongVideoScript {
  assertLongVideoLayout(layout);
  if (script.pageBuffers && Object.keys(script.pageBuffers).length) throw new Error("Commit script edits first");
  if (script.wholeBuffer) throw new Error("Resolve whole-script edits before changing layout");
  if (pageIds.length !== layout.chunks || new Set(pageIds.filter(Boolean)).size !== pageIds.filter(Boolean).length) throw new Error("Ambiguous layout mapping");
  const result = clone(script);
  const used = usedIds(script);
  const available = [...result.segments, ...result.archived];
  result.segments = pageIds.map(id => {
    const page = id === undefined ? newPage(nextId, used) : available.find(p => p.id === id);
    if (!page) throw new Error("Unknown segment ID");
    return { ...page, stale: true };
  });
  const selected = new Set(result.segments.map(p => p.id));
  result.archived = available.filter(p => !selected.has(p.id));
  result.layout = clone(layout);
  result.revision++;
  delete result.wholeBuffer;
  if (![result.brief, ...result.segments].some(p => p.id === result.activePageId)) result.activePageId = result.brief.id;
  return result;
}

export interface ScriptEdit { pageId: string; text: string; }
/** Explicit user acknowledgement after layout/brief changes, including unchanged locked text. */
export function reviewScriptPage(script: LongVideoScript, pageId: string, expectedRevision: number): LongVideoScript {
  if (script.revision !== expectedRevision) throw new Error("Stale script revision");
  if (script.wholeBuffer) throw new Error("Resolve whole-script edits first");
  const result = clone(script);
  const page = result.segments.find(p => p.id === pageId);
  if (!page) throw new Error("Unknown segment ID");
  if (!scriptPageText(page).trim()) throw new Error("Empty segment prompt");
  page.stale = false;
  result.revision++;
  return result;
}
export function setScriptSharedPreamble(script: LongVideoScript, enabled: boolean): LongVideoScript {
  if (script.wholeBuffer || Object.keys(script.pageBuffers ?? {}).length) throw new Error("Commit script edits first");
  const result = clone(script);
  if (Boolean(result.sharedPreamble) === enabled) return result;
  result.sharedPreamble = enabled;
  result.revision++;
  for (const segment of result.segments) segment.stale = true;
  return result;
}
export function updateScriptPage(script: LongVideoScript, pageId: string, update: Partial<Pick<ScriptPage, "locked" | "outline" | "activeVersionId">>): LongVideoScript {
  const result = clone(script);
  const page = [result.brief, ...result.segments].find(p => p.id === pageId);
  if (!page) throw new Error("Unknown script page");
  if (update.activeVersionId && !page.versions.some(v => v.id === update.activeVersionId)) throw new Error("Unknown page version");
  Object.assign(page, update);
  if (update.outline !== undefined) page.stale = true;
  if (pageId === result.brief.id && update.activeVersionId) for (const segment of result.segments) segment.stale = true;
  result.revision++;
  return result;
}
/** One atomic revision for all changed pages. Async callers must bind the captured revision. */
export function editLongVideoScript(script: LongVideoScript, edits: ScriptEdit[], expectedRevision: number, source: "user" | "model", nextId: ScriptIdFactory): LongVideoScript {
  if (script.revision !== expectedRevision) throw new Error("Stale script revision");
  if (script.wholeBuffer) throw new Error("Unresolved whole-script edits");
  if (script.pageBuffers && Object.keys(script.pageBuffers).length) throw new Error("Commit script edits first");
  if (new Set(edits.map(e => e.pageId)).size !== edits.length) throw new Error("Duplicate page edit");
  const result = clone(script);
  const pages = [result.brief, ...result.segments];
  const used = usedIds(script);
  let changed = false;
  for (const edit of edits) {
    const page = pages.find(p => p.id === edit.pageId);
    if (!page) throw new Error("Unknown script page");
    if (scriptPageText(page) === edit.text) continue;
    if (source === "model" && page.locked) throw new Error("Cannot overwrite locked page");
    const version = { id: freshId(nextId, used), text: edit.text, source };
    page.versions.push(version);
    page.activeVersionId = version.id;
    page.stale = false;
    changed = true;
  }
  if (edits.some(e => e.pageId === result.brief.id && e.text !== scriptPageText(script.brief))) {
    for (const page of result.segments) {
      // A whole-script transaction may deliberately update brief and details together.
      if (!edits.some(e => e.pageId === page.id && e.text !== scriptPageText(script.segments.find(p => p.id === page.id)!))) page.stale = true;
    }
  }
  if (changed) result.revision++;
  delete result.wholeBuffer;
  return result;
}

/** JSON string payloads make literal markers/newlines/unicode unambiguous and lossless.
 * The renderer may present this as editable blocks; this is an interchange format, not UI copy.
 */
export function projectWholeScript(script: LongVideoScript): string {
  return [script.brief, ...script.segments].map(p => `[${p.id}]\n${JSON.stringify(scriptPageText(p))}`).join("\n");
}
export function applyWholeScript(script: LongVideoScript, raw: string, expectedRevision: number, nextId: ScriptIdFactory): LongVideoScript {
  if (expectedRevision !== script.revision) throw new Error("Stale script revision");
  const lines = raw.split("\n");
  const pages = [script.brief, ...script.segments];
  const edits: ScriptEdit[] = [];
  let line = 0;
  try {
    if (lines.length !== pages.length * 2) throw new Error("Incomplete or extra script block");
    for (const page of pages) {
      if (lines[line] !== `[${page.id}]`) throw new Error("Missing, duplicated or reordered segment marker");
      line++;
      const text: unknown = JSON.parse(lines[line]!);
      if (typeof text !== "string") throw new Error("Script block must contain text");
      edits.push({ pageId: page.id, text });
      line++;
    }
    const parsed = clone(script);
    delete parsed.wholeBuffer;
    return editLongVideoScript(parsed, edits, expectedRevision, "user", nextId);
  } catch (error) {
    return { ...clone(script), wholeBuffer: { raw, error: { line: line + 1, message: error instanceof Error ? error.message : "Invalid script" } } };
  }
}

/** Execution snapshots bind selected page versions and reject unresolved whole edits. */
export function freezeLongVideoScript(script: LongVideoScript) {
  assertLongVideoLayout(script.layout);
  if (script.pageBuffers && Object.keys(script.pageBuffers).length) throw new Error("Commit script edits first");
  if (script.wholeBuffer) throw new Error("Resolve whole-script edits first");
  if (script.segments.length !== script.layout.chunks || script.segments.some(p => p.stale || !scriptPageText(p).trim())) throw new Error("Incomplete or stale script");
  return clone({ revision: script.revision, layout: script.layout, sharedPreamble: script.sharedPreamble === true,
    pages: [script.brief, ...script.segments].map(p => ({ pageId: p.id, versionId: p.activeVersionId, text: scriptPageText(p) })) });
}

/** Match official timeline preamble semantics, while keeping story notes out of sampling. */
export function compileLongVideoPrompts(script: ReturnType<typeof freezeLongVideoScript>): string[] {
  const preamble = script.sharedPreamble ? script.pages[0]?.text.trim() : "";
  return script.pages.slice(1).map(page => preamble ? `${preamble}\n\n${page.text}` : page.text);
}
