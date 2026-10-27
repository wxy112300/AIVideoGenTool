import { editLongVideoScript, scriptPageText, type LongVideoScript, type ScriptPage, type ScriptIdFactory } from "./script.js";

export function scriptEditingText(script: LongVideoScript, page: ScriptPage): string {
  return script.pageBuffers?.[page.id] ?? scriptPageText(page);
}

/** Persist keystrokes without creating one version per character. */
export function stageScriptText(script: LongVideoScript, pageId: string, text: string): LongVideoScript {
  if (script.wholeBuffer) throw new Error("Resolve whole-script edits first");
  const page = [script.brief, ...script.segments].find(p => p.id === pageId);
  if (!page) throw new Error("Unknown script page");
  if (page.locked) throw new Error("Cannot edit locked page");
  if (scriptEditingText(script, page) === text) return script;
  const result = structuredClone(script);
  const buffers = result.pageBuffers ??= {};
  if (text === scriptPageText(page)) delete buffers[pageId];
  else buffers[pageId] = text;
  if (!Object.keys(buffers).length) delete result.pageBuffers;
  result.revision++;
  return result;
}

export function commitScriptText(script: LongVideoScript, nextId: ScriptIdFactory): LongVideoScript {
  if (!script.pageBuffers || !Object.keys(script.pageBuffers).length) return script;
  const edits = Object.entries(script.pageBuffers).map(([pageId, text]) => ({ pageId, text }));
  const base = structuredClone(script);
  delete base.pageBuffers;
  return editLongVideoScript(base, edits, script.revision, "user", nextId);
}
