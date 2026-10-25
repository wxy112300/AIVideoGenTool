import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { icon, renderIcons } from "../../shared/icons";
import type { RendererContext } from "../../contracts";
import { mountPromptInsertMenu } from "./insert-menu";
import { insertPromptSnippet } from "./helpers";
import { promptSnippetFor } from "../../prompt-packs";
import { richPromptText } from "./rich-prompt";
import { estimatePromptTextTokens } from "../../../core/prompt-token-estimate";
import { paintRangeFill } from "../../shared/ui/runtime";

interface PreviewState { key: string; active: boolean; seconds: number; count: number; confirmed: boolean; page: number; whole: boolean; texts: string[]; locks: boolean[]; writing?: string; preset?: string; nativeMode?: string; }
const previews = new WeakMap<HTMLElement, PreviewState>();
let clearSequence = 0;
export const isLongVideoPreview = (root: HTMLElement): boolean => root.querySelector<HTMLSelectElement>("#generation-mode")?.value === "preview";

/** Local design preview only: never writes a Draft, workflow or queue snapshot. */
export function mountGenerationMode(root: HTMLElement, t: Translate, sync: () => void, notify: RendererContext["notify"]): () => void {
  const select = root.querySelector<HTMLSelectElement>("#generation-mode");
  const card = select?.closest<HTMLElement>(".composer-motion-group");
  const prompt = root.querySelector<HTMLTextAreaElement>("#prompt-input");
  if (!select || !card || !prompt) return () => undefined;
  const key = `${root.querySelector<HTMLSelectElement>("#model")?.value}:${root.querySelector('[data-input-mode][aria-pressed="true"]')?.getAttribute("data-input-mode")}`;
  const previous = previews.get(root);
  const state: PreviewState = previous?.key === key ? previous : { key, active: false, seconds: 60, count: 6, confirmed: false, page: 0, whole: false, texts: [prompt.value], locks: [] };
  previews.set(root, state);
  const events = new AbortController(), { signal } = events;
  const nativeDuration = root.querySelector<HTMLElement>(".settings-duration");
  const paintNativeDuration = () => {
    const mode = state.nativeMode ?? select.value;
    const maximum = mode === "unlocked" ? Number(select.dataset.safeMax) : Number(select.dataset.nativeMax);
    for (const id of ["#duration", "#duration-number"]) {
      const field = root.querySelector<HTMLInputElement>(id); if (field) field.max = String(maximum);
      if (field && select.dataset.fixedDuration) { field.min = field.max = field.value = select.dataset.fixedDuration; field.disabled = true; }
    }
    const ticks = nativeDuration?.querySelector(".create-duration-ticks");
    if (ticks) {
      ticks.replaceChildren();
      const minimum = Number(root.querySelector<HTMLInputElement>("#duration")?.min ?? 1);
      for (const value of [...new Set([minimum, ...(mode === "unlocked" || maximum > 15.1 ? [10, 20] : [5, 10]), maximum])].filter(value => value >= minimum && value <= maximum).sort((a,b) => a-b)) {
        const tick = document.createElement("span"); tick.textContent = String(value); ticks.append(tick);
      }
    }
  };
  const layout = document.createElement("div"); layout.className = "create-long-layout"; layout.hidden = true;
  layout.innerHTML = `<p class="create-caption" role="status"></p><div class="create-long-numbers"><label><span></span><input data-preview-duration type="range" min="4" max="120" step="0.1"><input data-preview-duration-number type="number" min="4" max="120" step="0.1"></label><label><span></span><input data-preview-count type="range" min="1" max="16" step="1"><input data-preview-count-number type="number" min="1" max="16" step="1"></label></div><div class="create-long-ruler"></div><div class="create-long-summary"><span class="create-caption"></span><button class="secondary button-with-icon" type="button" data-confirm-layout>${icon("check")}<span></span></button></div>`;
  layout.querySelector("p")!.textContent = t(uiKeys.create.editor.preview);
  layout.querySelectorAll("label > span")[0]!.textContent = t(uiKeys.create.videoSettings.duration)+" (s)";
  layout.querySelectorAll("label > span")[1]!.textContent = t(uiKeys.create.editor.segments);
  const previewDuration = layout.querySelector<HTMLElement>("[data-preview-duration]")!.closest("label")!;
  previewDuration.className = "settings-field settings-duration create-span-2 create-preview-duration";
  previewDuration.hidden = true;
  nativeDuration?.after(previewDuration);
  const durationRange = previewDuration.querySelector<HTMLInputElement>("input[type=range]")!;
  const durationNumber = previewDuration.querySelector<HTMLInputElement>("input[type=number]")!;
  durationRange.setAttribute("aria-label", t(uiKeys.create.videoSettings.duration));
  durationNumber.setAttribute("aria-label", t(uiKeys.create.videoSettings.duration));
  const durationControls = document.createElement("div"); durationControls.className = "inline-field";
  const durationTrack = document.createElement("div"); durationTrack.className = "create-duration-slider";
  const durationTicks = document.createElement("div"); durationTicks.className = "create-duration-ticks"; durationTicks.setAttribute("aria-hidden", "true");
  durationTicks.innerHTML = "<span>4</span><span>30</span><span>60</span><span>90</span><span>120</span>";
  durationTrack.append(durationRange, durationTicks);
  const seconds = document.createElement("span"); seconds.textContent = t(uiKeys.create.videoSettings.seconds);
  durationControls.append(durationTrack, durationNumber, seconds); previewDuration.append(durationControls);
  card.append(layout); renderIcons(layout);
  const editor = document.createElement("div"); editor.className = "create-long-editor"; editor.hidden = true;
  editor.innerHTML = `<textarea rows="5" spellcheck="true"></textarea><div class="create-long-whole" hidden></div><div class="create-long-tabs"><select data-preview-writing></select><span class="create-tabs-separator"></span><div role="tablist"></div><button type="button" class="ghost icon-button" data-preview-lock></button><span class="create-tabs-separator"></span><div class="create-script-view"><button type="button" class="ghost icon-button" data-preview-pages>${icon("panels-top-left")}</button><button type="button" class="ghost icon-button" data-preview-whole>${icon("scroll-text")}</button></div></div>`;
  editor.querySelector<HTMLTextAreaElement>("textarea")!.setAttribute("aria-label", t(uiKeys.create.promptTitle));
  editor.querySelector("[data-preview-lock]")!.setAttribute("aria-label", t(uiKeys.create.editor.lock));
  editor.querySelector("[data-preview-whole]")!.textContent = t(uiKeys.create.editor.whole);
  editor.querySelector("[data-preview-whole]")!.innerHTML = icon("scroll-text");
  editor.querySelector("[data-preview-whole]")!.setAttribute("aria-label", t(uiKeys.create.editor.whole));
  editor.querySelector("[data-preview-pages]")!.setAttribute("aria-label", t(uiKeys.create.editor.pages));
  const writing = editor.querySelector<HTMLSelectElement>("[data-preview-writing]")!;
  writing.setAttribute("aria-label", t(uiKeys.create.editor.writingMode));
  for (const [value, label, note] of [["automatic", uiKeys.create.editor.automatic, uiKeys.create.editor.automaticNote], ["guided", uiKeys.create.editor.semiAutomatic, uiKeys.create.editor.semiAutomaticNote]]) {
    const option = document.createElement("option"); option.value = value!; option.textContent = t(label!); option.dataset.note = t(note!); writing.append(option);
  }
  writing.value = state.writing ?? "guided";
  writing.addEventListener("change", () => { state.writing = writing.value; }, { signal });
  prompt.closest(".prompt-editor-shell")!.after(editor); renderIcons(editor);
  const bounds = () => ({ min: Math.max(1, Math.ceil(state.seconds / 15)), max: Math.min(16, Math.floor(state.seconds / 5)) || 1 });
  const text = editor.querySelector<HTMLTextAreaElement>("textarea")!;
  const footer = document.createElement("div"); footer.className = "create-prompt-footer";
  const insert = root.querySelector<HTMLButtonElement>("#insert-prompt-snippet")!.cloneNode(true) as HTMLButtonElement;
  insert.id = "long-preview-insert"; insert.setAttribute("aria-expanded", "false"); insert.removeAttribute("aria-controls");
  const counter = document.createElement("span"); counter.className = "prompt-word-counter";
  footer.append(insert, counter); editor.append(footer);
  const disposeInsert = mountPromptInsertMenu(editor, id => {
    if (!state.whole && state.confirmed && !state.locks[state.page]) insertPromptSnippet(text, promptSnippetFor(id));
  }, false, { trigger: insert, source: root.querySelector<HTMLSelectElement>("#prompt-snippet")!, prompt: text });
  const previewActions = document.createElement("div"); previewActions.className = "prompt-action-controls create-preview-actions"; previewActions.hidden = true;
  const preset = root.querySelector<HTMLSelectElement>("#prompt-enhance-mode")!.cloneNode(true) as HTMLSelectElement;
  preset.id = "long-preview-preset"; preset.hidden = false;
  if (state.preset) preset.value = state.preset;
  preset.addEventListener("change", () => { state.preset = preset.value; }, { signal });
  const runtime = root.querySelector("#release-prompt-model-create")?.closest<HTMLElement>(".prompt-button-tip");
  const runtimeHome = document.createComment("prompt-runtime-home"); runtime?.before(runtimeHome);
  const enhance = document.createElement("button"); enhance.type = "button"; enhance.className = "secondary button-with-icon";
  enhance.disabled = true; enhance.title = t(uiKeys.create.editor.preview);
  previewActions.append(preset, enhance); root.querySelector(".create-prompt-toolbar")!.append(previewActions);
  const version = root.querySelector<HTMLElement>(".composer-heading-main > .muted"); const originalVersion = version?.textContent;
  const versionButtons = [...root.querySelectorAll<HTMLButtonElement>("#prompt-prev, #prompt-next, #clear-prompt")].map(button => ({ button, disabled: button.disabled }));
  const countText = () => {
    counter.textContent = `${estimatePromptTextTokens(state.whole ? state.texts.slice(0, state.count + 1).join("\n") : state.texts[state.page] ?? "")} tokens`;
    editor.querySelectorAll<HTMLElement>(".create-page-dot").forEach((dot, index) => { dot.dataset.state = state.texts[index]?.trim() ? "detail" : "empty"; });
  };
  const paint = () => {
    const { min, max } = bounds();
    state.count = Math.max(1, Math.min(16, state.count));
    state.page = Math.min(state.page, state.count);
    durationRange.value = durationNumber.value = String(state.seconds);
    paintRangeFill(durationRange);
    for (const field of layout.querySelectorAll<HTMLInputElement>("[data-preview-count], [data-preview-count-number]")) { field.value = String(state.count); field.setAttribute("aria-label", t(uiKeys.create.editor.segments)); }
    layout.querySelector("label > span")!.textContent = `${t(uiKeys.create.editor.segments)} · ${t(uiKeys.create.editor.recommended, { min, max })}`;
    const ruler = layout.querySelector<HTMLElement>(".create-long-ruler")!;
    ruler.toggleAttribute("data-stale", !state.confirmed); ruler.replaceChildren();
    for (let index = 0; index < state.count; index++) {
      const block = document.createElement("span"); block.textContent = String(index+1); block.style.setProperty("--i", String(index));
      block.title = `${(index * state.seconds / state.count).toFixed(1)}–${((index + 1) * state.seconds / state.count).toFixed(1)}s`; ruler.append(block);
      const tick = document.createElement("small"); tick.textContent = `${Math.round(index * state.seconds / state.count)}s`; block.append(tick);
    }
    layout.querySelector(".create-long-summary > span")!.textContent = `${state.count} × ${(state.seconds / state.count).toFixed(1)}s · ${t(state.confirmed ? uiKeys.create.editor.layoutReady : uiKeys.create.editor.layoutStale)}`;
    layout.querySelector("[data-confirm-layout] span")!.textContent = t(uiKeys.create.editor.confirmLayout);
    const tabs = editor.querySelector('[role="tablist"]')!; tabs.replaceChildren();
    for (let index = 0; index <= state.count; index++) {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(state.page === index));
      button.innerHTML = `<span class="create-page-dot"></span><span></span>${state.locks[index] ? icon("lock") : ""}`;
      button.children[1]!.textContent = index === 0 ? t(uiKeys.create.editor.global) : String(index);
      button.title = index === 0 ? `${state.seconds}s · ${state.count}` : `${((index-1)*state.seconds/state.count).toFixed(1)}–${(index*state.seconds/state.count).toFixed(1)}s`;
      button.disabled = !state.confirmed || state.whole; button.addEventListener("click", () => {
        state.page = index; paint();
        tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
      }, { signal }); tabs.append(button);
    }
    text.dataset.richHistoryKey = String(state.page);
    text.hidden = state.whole; text.value = state.texts[state.page] ?? ""; text.disabled = !state.confirmed; text.readOnly = Boolean(state.locks[state.page]);
    const lock = editor.querySelector<HTMLButtonElement>("[data-preview-lock]")!;
    lock.hidden = state.page === 0; lock.disabled = !state.confirmed || state.whole; lock.setAttribute("aria-pressed", String(Boolean(state.locks[state.page])));
    lock.innerHTML = icon(state.locks[state.page] ? "lock" : "lock-open");
    editor.querySelector("[data-preview-whole]")!.setAttribute("aria-pressed", String(state.whole));
    editor.querySelector("[data-preview-pages]")!.setAttribute("aria-pressed", String(!state.whole));
    writing.disabled = state.whole || !state.confirmed;
    editor.querySelector(".create-long-tabs")!.classList.toggle("is-whole", state.whole);
    const whole = editor.querySelector<HTMLElement>(".create-long-whole")!; whole.hidden = !state.whole;
    if (whole.children.length !== state.count + 1) {
      whole.replaceChildren();
      for (let index = 0; index <= state.count; index++) {
        const block = document.createElement("div"), label = document.createElement("code"), field = document.createElement("p");
        block.className = "create-whole-block"; label.textContent = index === 0 ? t(uiKeys.create.editor.global) : `[Chunk ${index}]`;
        field.dataset.previewWholePage = String(index); field.setAttribute("role", "textbox"); field.setAttribute("aria-multiline", "true"); field.setAttribute("aria-label", label.textContent);
        field.addEventListener("input", () => { state.texts[index] = richPromptText(field); if (state.page === index) text.value = state.texts[index]!; countText(); }, { signal });
        block.append(label, field); whole.append(block);
      }
    }
    for (const [index, block] of [...whole.children].entries()) {
      const field = block.querySelector<HTMLElement>("p")!;
      const editable = state.confirmed && !state.locks[index]; field.contentEditable = editable ? "plaintext-only" : "false";
      field.setAttribute("aria-readonly", String(!editable)); field.tabIndex = editable ? 0 : -1;
      if (field.textContent !== (state.texts[index] ?? "")) field.textContent = state.texts[index] ?? "";
      block.toggleAttribute("data-locked", Boolean(state.locks[index]));
    }
    insert.disabled = !state.confirmed || state.whole || Boolean(state.locks[state.page]);
    versionButtons.forEach(({ button, disabled }) => { button.disabled = state.active ? button.id !== "clear-prompt" || !state.confirmed || state.whole || Boolean(state.locks[state.page]) : disabled; });
    enhance.innerHTML = `${icon("sparkles")}<span>${t(state.page === 0 || state.whole ? uiKeys.create.editor.enhanceGlobal : uiKeys.create.editor.enhancePage)}</span>`;
    if (state.active && version) version.textContent = "1 / 1";
    countText();
    renderIcons(editor);
    renderIcons(previewActions);
  };
  const hiddenSources = [prompt.closest<HTMLElement>(".prompt-editor-shell")!, root.querySelector<HTMLElement>(".create-prompt-toolbar .prompt-action-controls"), root.querySelector<HTMLElement>(".create-prompt-card > .create-prompt-footer")].filter((element): element is HTMLElement => Boolean(element));
  const show = (active: boolean) => {
    state.active = active; layout.hidden = !active; editor.hidden = !active;
    previewActions.hidden = !active;
    if (runtime) { if (active) enhance.before(runtime); else runtimeHome.after(runtime); }
    if (!active && version) version.textContent = originalVersion ?? "";
    if (nativeDuration) nativeDuration.hidden = active;
    previewDuration.hidden = !active;
    hiddenSources.forEach(element => { element.hidden = active; });
    paint(); sync();
  };
  for (const selector of ["[data-preview-duration]", "[data-preview-duration-number]", "[data-preview-count]", "[data-preview-count-number]"]) {
    const field = selector.includes("duration") ? previewDuration.querySelector<HTMLInputElement>(selector)! : layout.querySelector<HTMLInputElement>(selector)!;
    field.addEventListener("input", () => {
      if (!field.value || !Number.isFinite(field.valueAsNumber)) return;
      if (selector.includes("duration")) { state.seconds = Math.max(4, Math.min(120, field.valueAsNumber)); state.count = Math.ceil(state.seconds / 10); }
      else state.count = Math.round(field.valueAsNumber);
      state.confirmed = false; paint();
    }, { signal });
  }
  layout.querySelector("[data-confirm-layout]")!.addEventListener("click", () => { state.confirmed = true; paint(); }, { signal });
  text.addEventListener("input", () => { state.texts[state.page] = text.value; countText(); }, { signal });
  editor.querySelector("[data-preview-lock]")!.addEventListener("click", () => { state.locks[state.page] = !state.locks[state.page]; paint(); }, { signal });
  editor.querySelector("[data-preview-whole]")!.addEventListener("click", () => { state.whole = !state.whole; paint(); }, { signal });
  editor.querySelector("[data-preview-pages]")!.addEventListener("click", () => { state.whole = false; paint(); }, { signal });
  editor.querySelector('[role="tablist"]')!.addEventListener("keydown", event => {
    const keyboard = event as KeyboardEvent;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(keyboard.key) || !state.confirmed || state.whole) return;
    keyboard.preventDefault();
    state.page = keyboard.key === "Home" ? 0 : keyboard.key === "End" ? state.count :
      (state.page + (keyboard.key === "ArrowRight" ? 1 : -1) + state.count + 1) % (state.count + 1);
    paint(); editor.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, { signal });
  select.addEventListener("clear-preview", () => {
    if (!state.texts.some(Boolean) && !state.locks.some(Boolean) && !state.confirmed) return;
    const before = structuredClone(state);
    state.texts = [""]; state.locks = []; state.page = 0; state.confirmed = false;
    paint(); text.dispatchEvent(new Event("rich-reset-history"));
    notify(t(uiKeys.create.editor.cleared), {
      key: `clear-preview:${++clearSequence}`, kind: "info", durationMs: 6000, renderPage: false,
      actions: [{ id: "undo-clear-preview", label: t(uiKeys.create.editor.undo), run: () => {
        Object.assign(state, before);
        if (select.isConnected) { paint(); sync(); }
      } }]
    });
  }, { signal });
  select.addEventListener("change", () => {
    if (select.value !== "preview") state.nativeMode = select.value;
    show(select.value === "preview");
    if (state.active) return;
    const max = select.value === "native" ? Number(select.dataset.nativeMax) : Number(select.dataset.safeMax);
    for (const id of ["#duration", "#duration-number"]) {
      const field = root.querySelector<HTMLInputElement>(id); if (!field) continue;
      field.max = String(max); if (Number(field.value) > max) field.value = String(max);
    }
    root.querySelector("#duration-number")?.dispatchEvent(new Event("input", { bubbles: true }));
    paintNativeDuration();
  }, { signal });
  if (!state.nativeMode || Number(root.querySelector<HTMLInputElement>("#duration-number")?.value) > Number(select.dataset.nativeMax)) state.nativeMode = select.value;
  if ([...select.options].some(option => option.value === state.nativeMode)) select.value = state.nativeMode;
  paintNativeDuration();
  if (state.active) select.value = "preview";
  show(state.active);
  root.addEventListener("click", event => {
    if (!state.active) return;
    const action = (event.target as Element).closest("#prompt-prev, #prompt-next, #clear-prompt"); if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (action.id !== "clear-prompt" || !state.confirmed || state.locks[state.page] || state.whole) return;
    const page = state.page, before = state.texts[page] ?? ""; if (!before) return;
    state.texts[page] = ""; paint(); text.dispatchEvent(new Event("rich-reset-history"));
    notify(t(uiKeys.create.editor.cleared), { key: `clear-preview-page:${++clearSequence}`, kind: "info", durationMs: 6000, renderPage: false,
      actions: [{ id: "undo-clear-preview-page", label: t(uiKeys.create.editor.undo), run: () => { state.texts[page] = before; if (select.isConnected) paint(); } }] });
  }, { signal, capture: true });
  return () => { events.abort(); disposeInsert(); if (runtime) runtimeHome.replaceWith(runtime); layout.remove(); previewDuration.remove(); editor.remove(); previewActions.remove(); hiddenSources.forEach(element => { element.hidden = false; }); };
}
