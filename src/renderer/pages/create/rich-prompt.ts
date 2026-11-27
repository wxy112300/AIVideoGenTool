import type { RendererContext } from "../../contracts";
import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import { uiKeys } from "../../../core/i18n-keys";
import { activeH3TimedGuides, h3GuideBoundarySlots, supportsH3TimedGuides } from "../../../core/h3-timed-guides";
import { mountPromptHeight } from "./prompt-height";

interface Edit { text: string; start: number; end: number; }
interface EditorState { current: Edit; undo: Edit[]; redo: Edit[]; scroll: number; }
const memories = new WeakMap<HTMLElement, Map<string, EditorState>>();
const tokens = /<(?:Picture|Video|Subject|Audio) \d+>|(?<![A-Za-z0-9_])@R[1-9](?![A-Za-z0-9_])|^[ \t]*(?:integrated_multimodal_description|overall_soundscape|non_diegetic_music|subject_definitions|summary|retention_analysis|detailed_description):|\[Shot\s+\d+\]|\bAt\s+(?:\d{1,2}:[0-5]\d(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?\s*s)\b|\[(?:开场|開場|连续|連續|切镜|切鏡|Opening|Continue|Cut)\]|\[\d+(?:[.:]\d+)?\s*[–-]\s*\d+(?:[.:]\d+)?\s*s?\]|\b\d{1,2}:[0-5]\d(?:\.\d{1,3})?\s*[–-]\s*\d{1,2}:[0-5]\d(?:\.\d{1,3})?\.?|^[ \t]*\d+(?:\.\d{1,3})?\s*[–-]\s*\d+(?:\.\d{1,3})?\s*s:?|Continuation of (?:Chunk \d+|the preceding segment)\.|<d>[^<\n]*<\/d>|\(S\d+\)|"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|^(?:画面|畫面|镜头|鏡頭|声音|聲音|段尾|开场|開場|推进|推進|交接|原文要求|AI 建议|AI 建議|Action|Camera|Audio|End|Opening|Development|Handoff|Ambient sound|Sound|Dialogue|Music|对白|對白|音效|音乐|音樂)[:：]/gm;

/** Auto-detect dominant prompt language so English prose keeps en-US spellcheck even with short Chinese notes. */
export function promptSpellcheckLanguage(text: string): "en-US" | "zh-CN" {
  const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  if (latin === 0 && cjk > 0) return "zh-CN";
  return cjk > latin * 2 ? "zh-CN" : "en-US";
}

function tokenKindFor(token: string): string {
  if (/^<(?:Picture|Video) \d+>$/.test(token)) return "create-ref-chip";
  if (/^<(?:Subject|Audio) \d+>$|^@R[1-9]$/.test(token)) return "create-rich-ref";
  if (/^[ \t]*(?:integrated_multimodal_description|overall_soundscape|non_diegetic_music|subject_definitions|summary|retention_analysis|detailed_description):$/.test(token)) return "create-rich-section";
  if (token.startsWith("Continuation of ")) return "create-rich-continuity";
  if (token.startsWith("[") || token.startsWith("At ") || /^\s*\d/.test(token)) return "create-rich-time";
  if (/[:：]$/.test(token)) return "create-rich-key";
  return "create-rich-say";
}

const richTokenClasses = [
  "create-ref-chip", "create-rich-ref", "create-rich-section",
  "create-rich-continuity", "create-rich-time", "create-rich-key", "create-rich-say"
] as const;

/** Avoid tearing down live Text nodes on plain typing so Chromium preserves native spellcheck squiggles. */
function needsRichRepaint(editor: HTMLElement, nextText: string): boolean {
  const expected = [...nextText.matchAll(tokens)].map((match) => ({
    text: match[0],
    index: match.index!,
    kind: tokenKindFor(match[0])
  }));
  const existing: Array<{ text: string; index: number; kind: string }> = [];
  let offset = 0;
  let hasTrailingEndBr = false;
  for (let i = 0; i < editor.childNodes.length; i++) {
    const child = editor.childNodes[i]!;
    if (child.nodeType === Node.TEXT_NODE) {
      offset += (child.textContent ?? "").length;
      continue;
    }
    if (child instanceof HTMLBRElement && child.hasAttribute("data-rich-end") && i === editor.childNodes.length - 1) {
      hasTrailingEndBr = true;
      continue;
    }
    if (!(child instanceof HTMLSpanElement)) return true;
    const kind = richTokenClasses.find((cls) => child.classList.contains(cls));
    if (!kind) return true;
    const plain = richPromptText(child);
    existing.push({ text: plain, index: offset, kind });
    offset += plain.length;
  }
  if (nextText.endsWith("\n") !== hasTrailingEndBr) return true;
  if (existing.length !== expected.length) return true;
  for (let i = 0; i < expected.length; i++) {
    if (existing[i]!.index !== expected[i]!.index
      || existing[i]!.text !== expected[i]!.text
      || existing[i]!.kind !== expected[i]!.kind) return true;
  }
  return false;
}

/** Shared syntax-highlight HTML renderer for single-page and Whole View editors. */
export function renderRichPromptHtml(value: string, renderMediaChip?: (token: string) => string): string {
  let html = "", at = 0;
  for (const match of value.matchAll(tokens)) {
    html += escapeHtml(value.slice(at, match.index));
    at = match.index! + match[0].length;
    const token = match[0];
    if (/^<(?:Picture|Video) \d+>$/.test(token)) {
      html += renderMediaChip ? renderMediaChip(token) : `<span class="create-rich-ref">${escapeHtml(token)}</span>`;
    } else if (/^<(?:Subject|Audio) \d+>$|^@R[1-9]$/.test(token)) {
      html += `<span class="create-rich-ref">${escapeHtml(token)}</span>`;
    } else if (/^[ \t]*(?:integrated_multimodal_description|overall_soundscape|non_diegetic_music|subject_definitions|summary|retention_analysis|detailed_description):$/.test(token)) {
      html += `<span class="create-rich-section">${escapeHtml(token)}</span>`;
    } else if (token.startsWith("Continuation of ")) {
      html += `<span class="create-rich-continuity">${escapeHtml(token)}</span>`;
    } else if (token.startsWith("[") || token.startsWith("At ") || /^\s*\d/.test(token)) {
      html += `<span class="create-rich-time">${escapeHtml(token)}</span>`;
    } else if (/[:：]$/.test(token)) {
      html += `<span class="create-rich-key">${escapeHtml(token)}</span>`;
    } else {
      html += `<span class="create-rich-say">${escapeHtml(token)}</span>`;
    }
  }
  return html + escapeHtml(value.slice(at)) + (value.endsWith("\n") ? "<br data-rich-end>" : "");
}

/** Pure text is the persisted contract; reference chips are atomic visual spans. */
export function richPromptText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLElement && node.dataset.plain !== undefined) return node.dataset.plain;
  if (node.nodeName === "BR") return node instanceof HTMLElement && node.hasAttribute("data-rich-end") || node.parentNode?.childNodes.length === 1 ? "" : "\n";
  let result = "";
  for (const [index, child] of [...node.childNodes].entries()) {
    if (["DIV", "P"].includes(child.nodeName) && index > 0 && !result.endsWith("\n")) result += "\n";
    result += richPromptText(child);
  }
  return result;
}

export function richPromptSelection(editor: HTMLElement): [number, number] | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;
  const offset = (node: Node, at: number) => {
    const range = document.createRange(); range.selectNodeContents(editor); range.setEnd(node, at);
    return richPromptText(range.cloneContents()).length;
  };
  return [offset(selection.anchorNode!, selection.anchorOffset), offset(selection.focusNode!, selection.focusOffset)].sort((a,b) => a-b) as [number, number];
}

export function setRichPromptSelection(editor: HTMLElement, start: number, end: number): void {
  const locate = (wanted: number): [Node, number] => {
    let remaining = Math.max(0, wanted);
    const walk = (parent: Node): [Node, number] | undefined => {
      for (const [index, child] of [...parent.childNodes].entries()) {
        const length = richPromptText(child).length;
        if (remaining <= length) {
          if (child.nodeType === Node.TEXT_NODE) return [child, remaining];
          if (child instanceof HTMLElement && child.hasAttribute("data-plain")) return [parent, index + (remaining > 0 ? 1 : 0)];
          const found = walk(child); if (found) return found;
          return [parent, index + 1];
        }
        remaining -= length;
      }
      return undefined;
    };
    return walk(editor) ?? [editor, editor.childNodes.length];
  };
  const first = locate(start), last = locate(end), range = document.createRange();
  range.setStart(...first); range.setEnd(...last);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
}

function reference(context: RendererContext, token: string, sourceId: string): string {
  const state = context.getState(); if (!state) return "";
  const match = /<(Picture|Video) (\d+)>/.exec(token)!;
  const index = Number(match[2]) - 1;
  if (sourceId === "image-edit-prompt-input") return match[1] === "Picture" ? state.imageDraft.pictures.find(picture => picture.pictureNumber === index + 1)?.absolutePath ?? "" : "";
  const draft = state.draft;
  const guideEditor = activeH3TimedGuides(draft);
  if (guideEditor && match[1] === "Picture") return guideEditor.slots.find(slot => slot.picture === index + 1)?.mediaPath ?? "";
  if (draft.h3GuideEditor && supportsH3TimedGuides(draft) && match[1] === "Picture") {
    const { start, end } = h3GuideBoundarySlots(draft.h3GuideEditor.slots);
    return [start, end].find(slot => slot?.picture === index + 1)?.mediaPath ?? "";
  }
  if (draft.h3ReferenceSlots.length) return draft.h3ReferenceSlots.filter(slot => slot.mediaType === (match[1] === "Video" ? "video" : "image"))[index]?.mediaPath ?? "";
  return match[1] === "Video" ? index === 0 ? draft.sourceVideoPath : "" : [draft.startImagePath, draft.endImagePath][index] ?? "";
}

/** Keep the existing textarea boundary for controllers, IME serialization, snippets and queue submission. */
export function mountRichPrompt(source: HTMLTextAreaElement, context: RendererContext, key: string): () => void {
  const root = context.root;
  const editor = document.createElement("div"); editor.className = "create-rich-prompt";
  editor.id = `${source.id || key}-rich`; editor.dataset.richSource = source.id;
  editor.contentEditable = "true"; editor.setAttribute("role", "textbox"); editor.setAttribute("aria-multiline", "true"); editor.tabIndex = 0;
  editor.setAttribute("aria-label", source.getAttribute("aria-label") ?? context.t(uiKeys.create.promptTitle));
  const syncLang = (text: string) => {
    const lang = promptSpellcheckLanguage(text);
    if (editor.lang !== lang) editor.lang = lang;
    if (source.lang !== lang) source.lang = lang;
  };
  const spellcheckEnabled = source.getAttribute("spellcheck") !== "false";
  editor.spellcheck = spellcheckEnabled;
  editor.setAttribute("spellcheck", String(spellcheckEnabled));
  syncLang(source.value);
  source.before(editor); source.classList.add("rich-prompt-source"); source.tabIndex = -1; source.setAttribute("aria-hidden", "true");
  const states = memories.get(root) ?? new Map<string, EditorState>(); memories.set(root, states);
  let scopeKey = `${key}:${source.dataset.richHistoryKey ?? "main"}`;
  const remembered = states.get(scopeKey);
  let state: EditorState = remembered?.current.text === source.value ? remembered : { current: { text: source.value, start: source.selectionStart, end: source.selectionEnd }, undo: [], redo: [], scroll: 0 };
  states.set(scopeKey, state);
  const events = new AbortController(), { signal } = events;
  const value = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
  const original = { focus: source.focus, setSelectionRange: source.setSelectionRange, setRangeText: source.setRangeText };
  let composing = false, forwarding = false, changingHistory = false;
  const thumbnails = new Map<string, Promise<string | null>>();
  const snapshot = (): Edit => ({ text: source.value, start: source.selectionStart, end: source.selectionEnd });
  const rememberSelection = () => {
    const selected = richPromptSelection(editor); if (!selected) return;
    if (source.selectionStart !== selected[0] || source.selectionEnd !== selected[1]) {
      original.setSelectionRange.call(source, ...selected);
      source.dispatchEvent(new Event("select"));
    }
    state.current.start = selected[0]; state.current.end = selected[1];
  };
  const record = () => {
    const next = snapshot();
    if (!changingHistory && next.text !== state.current.text) { state.undo.push({ ...state.current }); if (state.undo.length > 100) state.undo.shift(); state.redo = []; }
    state.current = next;
  };
  const paint = () => {
    if (composing) return;
    const nextKey = `${key}:${source.dataset.richHistoryKey ?? "main"}`;
    if (scopeKey !== nextKey) {
      scopeKey = nextKey;
      const saved = states.get(scopeKey);
      state = saved?.current.text === source.value ? saved : { current: snapshot(), undo: [], redo: [], scroll: 0 };
      states.set(scopeKey, state);
    }
    editor.contentEditable = String(!source.disabled && !source.readOnly);
    editor.setAttribute("aria-readonly", String(source.readOnly));
    editor.setAttribute("aria-disabled", String(source.disabled));
    editor.hidden = source.hidden;
    const focused = document.activeElement === editor;
    const start = source.selectionStart, end = source.selectionEnd;
    editor.innerHTML = renderRichPromptHtml(source.value, (token) => {
      const filename = reference(context, token, source.id);
      return `<span class="create-ref-chip${filename ? "" : " missing"}" contenteditable="false" data-plain="${escapeHtml(token)}" data-reference-path="${escapeHtml(filename)}" data-ui-tooltip="${escapeHtml(filename || token)}"><span class="create-ref-thumb">${icon(filename ? token.startsWith("<Video") ? "video" : "image" : "circle-alert")}</span>${escapeHtml(token.slice(1,-1))}</span>`;
    });
    renderIcons(editor);
    for (const tokenNode of editor.querySelectorAll<HTMLElement>(".create-ref-chip, .create-rich-ref, .create-rich-section, .create-rich-time")) {
      tokenNode.spellcheck = false;
      tokenNode.setAttribute("spellcheck", "false");
    }
    syncLang(source.value);
    for (const chip of editor.querySelectorAll<HTMLElement>(".create-ref-chip[data-reference-path]")) {
      const filename = chip.dataset.referencePath!;
      if (filename && chip.dataset.plain?.startsWith("<Video")) chip.dataset.uiTooltipVideo = `studio-media://draft/video?source=${encodeURIComponent(filename)}`;
      if (filename && chip.dataset.plain?.startsWith("<Picture")) {
        if (!thumbnails.has(filename)) thumbnails.set(filename, context.assets.readImage(filename));
        void thumbnails.get(filename)!.then(url => {
          if (!url || !chip.isConnected) return;
          const image = document.createElement("img"); image.src = url; image.alt = ""; chip.querySelector(".create-ref-thumb")?.replaceChildren(image);
          chip.dataset.uiTooltipImage = url;
        }).catch(() => undefined);
      }
    }
    if (focused) setRichPromptSelection(editor, start, end);
  };
  Object.defineProperty(source, "value", { configurable: true, get: () => value.get!.call(source), set: (next: string) => { value.set!.call(source, next); paint(); } });
  source.focus = (options) => { editor.focus(options); setRichPromptSelection(editor, source.selectionStart, source.selectionEnd); };
  source.setSelectionRange = (start, end, direction) => { original.setSelectionRange.call(source, start, end, direction); if (document.activeElement === editor) setRichPromptSelection(editor, start ?? 0, end ?? 0); };
  source.setRangeText = (replacement: string, start?: number, end?: number, mode?: SelectionMode) => { original.setRangeText.call(source, replacement, start ?? source.selectionStart, end ?? source.selectionEnd, mode ?? "preserve"); paint(); };
  const commit = () => {
    if (source.disabled || source.readOnly) return;
    const selection = richPromptSelection(editor);
    const nextText = richPromptText(editor);
    value.set!.call(source, nextText);
    if (selection) original.setSelectionRange.call(source, ...selection);
    forwarding = true; source.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: composing })); forwarding = false;
    if (!composing) {
      record();
      if (needsRichRepaint(editor, nextText)) paint();
      else syncLang(nextText);
    }
  };
  const insert = (text: string) => {
    if (source.disabled || source.readOnly) return;
    rememberSelection();
    original.setRangeText.call(source, text, source.selectionStart, source.selectionEnd, "end");
    forwarding = true; source.dispatchEvent(new InputEvent("input", { bubbles: true })); forwarding = false;
    record(); paint(); editor.focus(); setRichPromptSelection(editor, source.selectionStart, source.selectionEnd);
  };
  const history = (redo: boolean) => {
    if (source.disabled || source.readOnly) return;
    const from = redo ? state.redo : state.undo, to = redo ? state.undo : state.redo, next = from.pop();
    if (!next) return;
    to.push({ ...state.current }); changingHistory = true;
    value.set!.call(source, next.text); original.setSelectionRange.call(source, next.start, next.end);
    forwarding = true; source.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: redo ? "historyRedo" : "historyUndo" })); forwarding = false;
    state.current = { ...next }; changingHistory = false; paint(); setRichPromptSelection(editor, next.start, next.end);
  };
  editor.addEventListener("input", commit, { signal });
  source.addEventListener("input", () => { if (!forwarding) { record(); paint(); } }, { signal });
  source.addEventListener("rich-reset-history", () => { state.undo = []; state.redo = []; state.current = snapshot(); }, { signal });
  editor.addEventListener("compositionstart", () => { composing = true; editor.dataset.richComposing = ""; }, { signal });
  editor.addEventListener("compositionend", () => { composing = false; delete editor.dataset.richComposing; commit(); }, { signal });
  editor.addEventListener("keydown", event => {
    if (composing || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase(); if (key !== "z" && key !== "y") return;
    const forwarded = new KeyboardEvent("keydown", { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, bubbles: true, cancelable: true });
    source.dispatchEvent(forwarded);
    event.preventDefault(); event.stopPropagation();
    if (!forwarded.defaultPrevented) history(key === "y" || event.shiftKey);
  }, { signal });
  editor.addEventListener("beforeinput", event => {
    if (!composing && !event.isComposing && (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak")) {
      event.preventDefault(); insert("\n");
    }
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") { event.preventDefault(); history(event.inputType === "historyRedo"); }
  }, { signal });
  editor.addEventListener("paste", event => { event.preventDefault(); insert(event.clipboardData?.getData("text/plain") ?? ""); }, { signal });
  for (const type of ["copy", "cut"] as const) editor.addEventListener(type, event => {
    rememberSelection(); const selected = source.value.slice(source.selectionStart, source.selectionEnd);
    if (!selected) return;
    event.preventDefault(); event.clipboardData?.setData("text/plain", selected);
    if (type === "cut") insert("");
  }, { signal });
  document.addEventListener("selectionchange", rememberSelection, { signal });
  editor.addEventListener("pointerup", rememberSelection, { signal });
  editor.addEventListener("keyup", rememberSelection, { signal });
  editor.addEventListener("scroll", () => { state.scroll = editor.scrollTop; }, { signal });
  const observer = new MutationObserver(paint);
  observer.observe(source, { attributes: true, attributeFilter: ["disabled", "readonly", "hidden"] });
  original.setSelectionRange.call(source, state.current.start, state.current.end);
  paint(); editor.scrollTop = state.scroll;
  const disposeHeight = mountPromptHeight(editor);
  return () => {
    disposeHeight();
    const focused = document.activeElement === editor;
    rememberSelection(); state.scroll = editor.scrollTop; events.abort(); observer.disconnect();
    delete (source as unknown as Record<string, unknown>).value;
    source.focus = original.focus; source.setSelectionRange = original.setSelectionRange; source.setRangeText = original.setRangeText;
    source.classList.remove("rich-prompt-source"); source.removeAttribute("aria-hidden"); source.removeAttribute("tabindex"); editor.remove();
    if (focused && source.isConnected) original.focus.call(source, { preventScroll: true });
  };
}

export function mountCreateRichPrompts(context: RendererContext): () => void {
  const sources = context.root.querySelectorAll<HTMLTextAreaElement>("#prompt-input, #image-edit-prompt-input, .create-long-editor > textarea");
  const draft = context.getState()?.draft;
  const cleanups = [...sources].map((source, index) => {
    source.id ||= `long-preview-prompt-${index}`;
    return mountRichPrompt(source, context, `${source.id}:${draft?.modelId}:${draft?.inputMode}`);
  });
  return () => cleanups.reverse().forEach(cleanup => cleanup());
}
