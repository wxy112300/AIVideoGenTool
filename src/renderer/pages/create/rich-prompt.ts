import type { RendererContext } from "../../contracts";
import { escapeHtml } from "../../shared/dom";
import { icon, renderIcons } from "../../shared/icons";
import { uiKeys } from "../../../core/i18n-keys";

interface Edit { text: string; start: number; end: number; }
interface EditorState { current: Edit; undo: Edit[]; redo: Edit[]; scroll: number; }
const memories = new WeakMap<HTMLElement, Map<string, EditorState>>();
const tokens = /<(?:Picture|Video) \d+>|\[\d+(?:[.:]\d+)?\s*[–-]\s*\d+(?:[.:]\d+)?\s*s?\]|"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|^(?:Ambient sound|Sound|Camera|Dialogue|Music|声音|鏡頭|镜头|对白|對白|音效|音乐|音樂)[:：]/gm;

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
  editor.spellcheck = source.spellcheck;
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
    let html = "", at = 0;
    for (const match of source.value.matchAll(tokens)) {
      html += escapeHtml(source.value.slice(at, match.index)); at = match.index! + match[0].length;
      const token = match[0];
      if (token.startsWith("<")) {
        const filename = reference(context, token, source.id);
        html += `<span class="create-ref-chip${filename ? "" : " missing"}" contenteditable="false" data-plain="${escapeHtml(token)}" data-reference-path="${escapeHtml(filename)}" data-ui-tooltip="${escapeHtml(filename || token)}"><span class="create-ref-thumb">${icon(filename ? token.startsWith("<Video") ? "video" : "image" : "circle-alert")}</span>${escapeHtml(token.slice(1,-1))}</span>`;
      } else html += `<span class="create-rich-${token.startsWith("[") ? "time" : /[:：]$/.test(token) ? "key" : "say"}">${escapeHtml(token)}</span>`;
    }
    editor.innerHTML = html + escapeHtml(source.value.slice(at)) + (source.value.endsWith("\n") ? '<br data-rich-end>' : "");
    renderIcons(editor);
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
    value.set!.call(source, richPromptText(editor));
    if (selection) original.setSelectionRange.call(source, ...selection);
    forwarding = true; source.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: composing })); forwarding = false;
    if (!composing) { record(); paint(); }
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
  return () => {
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
