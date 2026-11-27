import type { Translate } from "../../../core/i18n";
import { uiKeys } from "../../../core/i18n-keys";
import { icon, renderIcons } from "../../shared/icons";
import type { RendererContext } from "../../contracts";
import { mountPromptInsertMenu } from "./insert-menu";
import { insertPromptSnippet } from "./helpers";
import { promptSnippetFor } from "../../prompt-packs";
import { renderRichPromptHtml, richPromptSelection, richPromptText, setRichPromptSelection } from "./rich-prompt";
import { estimatePromptTextTokens } from "../../../core/prompt-token-estimate";
import { paintRangeFill } from "../../shared/ui/runtime";
import type { Draft, H3PromptPreset } from "../../../types";
import { createLongVideoLayout, proposeLongVideoExtension, suggestLongVideoChunks } from "../../../core/long-video/layout";
import { createLongVideoScript, deleteScriptPageVersion, editLongVideoScript, isScriptAllocation, relayoutLongVideoScript, reviewScriptPage, updateScriptPage, type LongVideoScript } from "../../../core/long-video/script";
import { commitScriptText, scriptEditingText, stageScriptText } from "../../../core/long-video/script-buffers";
import { applyLongVideoPromptResult, longVideoPromptRequest, longVideoPromptTargets, parseLongVideoPromptResult, type LongVideoPromptResult, type LongVideoWritingOperation } from "../../../core/long-video/enhancement";
import { isLongVideoDraftActive } from "../../../core/long-video/capability";
import { promptModelBackend } from "../../../core/prompt-models";
import { activeH3TimedGuides, h3ReferenceTimedGuides } from "../../../core/h3-timed-guides";
import { longVideoGuideCues, longVideoGuideIssue } from "../../../core/long-video/timed-guides";
import { isContinuumFl2vaModel, isContinuumReferenceModel } from "../../../core/long-video/group-workflow";

interface PreviewState { key: string; active: boolean; seconds: number; count: number; confirmed: boolean; page: number; whole: boolean; texts: string[]; locks: boolean[]; writing?: string; preset?: string; nativeMode?: string; script?: LongVideoScript; }
let clearSequence = 0;
export const isLongVideoPreview = (root: HTMLElement): boolean => root.querySelector<HTMLSelectElement>("#generation-mode")?.value === "preview";

/** Structured draft editor with a separate frozen Queue snapshot. */
export function mountGenerationMode(root: HTMLElement, t: Translate, sync: () => void, notify: RendererContext["notify"], persistence: {
  getDraft(): Draft | undefined;
  patchDraft(patch: Partial<Draft>): void;
  setEnhancing?(value: boolean): void;
  context?: Pick<RendererContext, "root" | "enhancePrompt" | "getState" | "reportUserAction" | "application" | "requestRender" | "getRoute" | "events">;
}): () => void {
  const select = root.querySelector<HTMLSelectElement>("#generation-mode");
  const card = select?.closest<HTMLElement>(".composer-motion-group");
  const prompt = root.querySelector<HTMLTextAreaElement>("#prompt-input");
  if (!select || !card || !prompt) return () => undefined;
  const saved = persistence.getDraft();
  const key = `${saved?.modelId}:${saved?.inputMode}`;
  const state: PreviewState = { key, active: false, seconds: 60, count: 6, confirmed: false, page: 0, whole: false, texts: [prompt.value], locks: [] };
  const frozenRun = saved?.inputMode === "video" && saved.modelId === "minimax_h3_continuum"
    ? saved.longVideoRunSource ? { acceptedChunks: saved.longVideoRunSource.receipt.accepted_chunks, chunkSeconds: saved.longVideoRunSource.profile.chunkSeconds }
      : saved.h3ContinuumMode === "managed" ? saved.h3ContinuumSequence : undefined : undefined;
  if (saved?.longVideoEditor?.key === key || saved?.longVideoEditor?.key === `${saved?.modelId}:undefined`) {
    Object.assign(state, saved.longVideoEditor);
    state.script = structuredClone(saved.longVideoScript);
  }
  const id = () => crypto.randomUUID();
  const pages = () => state.script ? [state.script.brief, ...state.script.segments] : [];
  const readScript = () => {
    if (!state.script) return;
    state.texts = pages().map(page => scriptEditingText(state.script!, page));
    state.locks = pages().map(page => page.locked);
    state.whole = state.script.view === "whole";
    state.writing = state.script.workingMode === "automatic" ? "automatic" : "guided";
    state.page = Math.max(0, pages().findIndex(page => page.id === state.script!.activePageId));
  };
  readScript();
  let legacyBrief = saved?.longVideoEditor?.seeded && !state.active && !prompt.value && state.script ? state.texts[0] : undefined;
  if (frozenRun && !state.script) {
    state.count = Math.max(1, Math.min(16 - frozenRun.acceptedChunks, Math.ceil(state.seconds / frozenRun.chunkSeconds)));
    state.seconds = state.count * frozenRun.chunkSeconds;
  }
  let persistedPageId = saved?.longVideoScript?.brief.id;
  let persistedRevision = saved?.longVideoScript?.revision;
  const writeNativeBrief = () => {
    if (prompt.value === state.texts[0]) return;
    prompt.value = state.texts[0] ?? "";
    prompt.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  let lastBrief = state.texts[0];
  const save = () => {
    const current = persistence.getDraft();
    if (current?.modelId !== saved?.modelId || current?.inputMode !== saved?.inputMode) return;
    if (current?.longVideoScript?.brief.id !== persistedPageId || current?.longVideoScript?.revision !== persistedRevision) return;
    if (state.script) {
      state.script.view = state.whole ? "whole" : "segment";
      state.script.workingMode = state.writing === "automatic" ? "automatic" : "assisted";
      state.script.activePageId = pages()[state.page]?.id ?? state.script.brief.id;
    }
    persistence.patchDraft({ longVideoScript: structuredClone(state.script), longVideoEditor: {
      key, active: state.active, seconds: state.seconds, count: state.count, confirmed: state.confirmed,
      nativeMode: state.nativeMode, preset: state.preset
    } });
    persistedPageId = state.script?.brief.id;
    persistedRevision = state.script?.revision;
    if (state.active && lastBrief !== state.texts[0]) writeNativeBrief();
    lastBrief = state.texts[0];
    sync();
  };
  const commit = () => { if (state.script) state.script = commitScriptText(state.script, id); save(); };
  const editText = (index: number, value: string) => {
    const page = pages()[index];
    if (!state.script || !page) return;
    state.script = stageScriptText(state.script, page.id, value);
    state.texts[index] = value;
    save();
  };
  const events = new AbortController(), { signal } = events;
  const nativeDuration = root.querySelector<HTMLElement>(".settings-duration");
  const paintNativeDuration = () => {
    const mode = state.nativeMode ?? select.value;
    const maximum = mode === "unlocked" ? Number(select.dataset.safeMax) : Number(select.dataset.nativeMax);
    for (const id of ["#duration", "#duration-number"]) {
      const field = root.querySelector<HTMLInputElement>(id); if (field) field.max = String(maximum);
      if (field && select.dataset.fixedDuration) { field.min = field.max = field.value = select.dataset.fixedDuration; field.disabled = true; }
      if (field?.type === "range") paintRangeFill(field);
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
  layout.innerHTML = `<div class="create-long-numbers"><label><span></span><input data-preview-duration type="range" min="4" max="120" step="0.1"><input data-preview-duration-number type="number" min="4" max="120" step="0.1"></label><label><span></span><input data-preview-count type="range" min="1" max="16" step="1"><input data-preview-count-number type="number" min="1" max="16" step="1"></label></div><div class="create-long-ruler"></div><div class="create-long-summary"><span class="create-caption"></span><button class="secondary button-with-icon" type="button" data-confirm-layout>${icon("check")}<span></span></button></div>`;
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
  editor.innerHTML = `<div class="create-long-outline-ref" data-preview-outline-ref hidden></div><textarea rows="5" spellcheck="true"></textarea><div class="create-long-whole" hidden></div><div class="create-long-tabs"><select data-preview-writing></select><span class="create-tabs-separator"></span><button type="button" class="ghost icon-button create-page-arrow" data-preview-previous>${icon("chevron-left")}</button><div role="tablist"></div><button type="button" class="ghost icon-button create-page-arrow" data-preview-next>${icon("chevron-right")}</button><button type="button" class="ghost icon-button" data-preview-lock></button><span class="create-tabs-separator"></span><div class="create-script-view"><button type="button" class="ghost icon-button" data-preview-pages>${icon("panels-top-left")}</button><button type="button" class="ghost icon-button" data-preview-whole>${icon("scroll-text")}</button></div></div>`;
  const outlineRef = editor.querySelector<HTMLElement>("[data-preview-outline-ref]")!;
  editor.querySelector<HTMLTextAreaElement>("textarea")!.setAttribute("aria-label", t(uiKeys.create.promptTitle));
  editor.querySelector("[data-preview-lock]")!.setAttribute("aria-label", t(uiKeys.create.editor.lock));
  editor.querySelector("[data-preview-whole]")!.textContent = t(uiKeys.create.editor.whole);
  editor.querySelector("[data-preview-whole]")!.innerHTML = icon("scroll-text");
  editor.querySelector("[data-preview-whole]")!.setAttribute("aria-label", t(uiKeys.create.editor.whole));
  editor.querySelector("[data-preview-pages]")!.setAttribute("aria-label", t(uiKeys.create.editor.pages));
  const previousPage = editor.querySelector<HTMLButtonElement>("[data-preview-previous]")!;
  const nextPage = editor.querySelector<HTMLButtonElement>("[data-preview-next]")!;
  previousPage.setAttribute("aria-label", t(uiKeys.create.editor.previousPage));
  nextPage.setAttribute("aria-label", t(uiKeys.create.editor.nextPage));
  const pageTabs = editor.querySelector<HTMLElement>('[role="tablist"]')!;
  const revealPage = () => {
    const selected = pageTabs.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!selected || !pageTabs.clientWidth) return;
    const item = selected.getBoundingClientRect(), viewport = pageTabs.getBoundingClientRect();
    if (item.left < viewport.left) pageTabs.scrollLeft += item.left - viewport.left;
    else if (item.right > viewport.right) pageTabs.scrollLeft += item.right - viewport.right;
  };
  const tabResize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(revealPage);
  tabResize?.observe(pageTabs);
  const writing = editor.querySelector<HTMLSelectElement>("[data-preview-writing]")!;
  writing.setAttribute("aria-label", t(uiKeys.create.editor.writingMode));
  for (const [value, label, note] of [["automatic", uiKeys.create.editor.automatic, uiKeys.create.editor.automaticNote], ["guided", uiKeys.create.editor.semiAutomatic, uiKeys.create.editor.semiAutomaticNote]]) {
    const option = document.createElement("option"); option.value = value!; option.textContent = t(label!); option.dataset.note = t(note!); writing.append(option);
  }
  writing.value = state.writing ?? "automatic";
  writing.addEventListener("change", () => { state.writing = writing.value; save(); paint(); }, { signal });
  prompt.closest(".prompt-editor-shell")!.after(editor); renderIcons(editor);
  const bounds = () => suggestLongVideoChunks(state.seconds);
  const text = editor.querySelector<HTMLTextAreaElement>("textarea")!;
  const review = document.createElement("button"); review.type = "button"; review.className = "secondary";
  review.dataset.reviewSegment = "";
  review.textContent = t(uiKeys.create.editor.reviewPage); review.hidden = true;
  editor.querySelector("[data-preview-lock]")!.before(review);
  review.addEventListener("click", () => {
    commit(); const page = pages()[state.page];
    if (state.script && page) state.script = reviewScriptPage(state.script, page.id, state.script.revision);
    readScript(); save(); paint();
  }, { signal });
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
  preset.addEventListener("change", () => { state.preset = preset.value; save(); }, { signal });
  const runtime = root.querySelector("#release-prompt-model-create")?.closest<HTMLElement>(".prompt-button-tip");
  const runtimeHome = document.createComment("prompt-runtime-home"); runtime?.before(runtimeHome);
  const enhance = document.createElement("button"); enhance.type = "button"; enhance.className = "secondary button-with-icon";
  enhance.dataset.enhanceLongVideo = "";
  const allocate = document.createElement("button"); allocate.type = "button"; allocate.className = "secondary button-with-icon";
  allocate.dataset.allocateLongVideo = "";
  allocate.innerHTML = `${icon("list-ordered")}<span>${t(uiKeys.create.editor.allocateStory)}</span>`;
  const nativeEnhance = root.querySelector<HTMLButtonElement>("#enhance-prompt");
  const enhancementBusy = () => enhancing || nativeEnhance?.getAttribute("aria-busy") === "true";
  let enhancing = false;
  const wholeEnhancement = () => state.page === 0 || state.whole || state.writing === "automatic";
  const pendingExpansion = () => {
    const segments = state.script?.segments ?? [];
    if (state.script?.pendingExpansion) return segments.filter(p => state.script!.pendingExpansion!.includes(p.id)).map(p => p.id);
    // Recognize drafts left by the older two-step writer before it tracked remaining pages.
    return segments.some(p => !isScriptAllocation(p) && p.versions.some(v => v.id === p.activeVersionId && v.source === "model"))
      ? segments.filter(p => !p.locked && isScriptAllocation(p)).map(p => p.id) : [];
  };
  const enhancementTargets = () => {
    if (!wholeEnhancement()) return pages().slice(state.page, state.page + 1).filter(p => !p.locked);
    const pending = pendingExpansion();
    return pages().slice(1).filter(p => !p.locked && (!pending.length || pending.includes(p.id)));
  };
  const preparedTargets = () => enhancementTargets().every(page => scriptEditingText(state.script!, page).trim());
  const referenceIdentity = (draft: Draft) => JSON.stringify([draft.modelId, draft.inputMode, draft.startImagePath,
    draft.endImagePath, activeH3TimedGuides(draft)?.slots,
    ...(draft.inputMode === "video" ? [draft.sourceVideoPath, draft.longVideoRunSource?.receipt.revision_id] : []),
    ...(isContinuumReferenceModel(draft.modelId)
      ? [draft.h3ReferenceSlots, h3ReferenceTimedGuides(draft)] : [])]);
  previewActions.append(allocate, preset, enhance); root.querySelector(".create-prompt-toolbar")!.append(previewActions);
  const version = root.querySelector<HTMLElement>(".composer-heading-main > .muted"); const originalVersion = version?.textContent;
  const versionButtons = [...root.querySelectorAll<HTMLButtonElement>("#prompt-prev, #prompt-next, #clear-prompt")].map(button => ({ button, disabled: button.disabled }));
  const pageDotState = (index: number): "empty" | "outline" | "detail" => {
    const content = state.texts[index]?.trim();
    if (!content) return "empty";
    const page = pages()[index];
    return index > 0 && page && isScriptAllocation(page) ? "outline" : "detail";
  };
  const countText = () => {
    counter.textContent = `${estimatePromptTextTokens(state.whole ? state.texts.slice(0, state.count + 1).join("\n") : state.texts[state.page] ?? "")} tokens`;
    editor.querySelectorAll<HTMLElement>('[role="tablist"] .create-page-dot').forEach((dot, index) => { dot.dataset.state = pageDotState(index); });
    editor.querySelectorAll<HTMLElement>(".create-whole-block .create-page-dot").forEach((dot, index) => { dot.dataset.state = pageDotState(index); });
  };
  const paintVersions = () => {
    const page = pages()[state.page];
    const index = page?.versions.findIndex(v => v.id === page.activeVersionId) ?? 0;
    versionButtons.forEach(({ button, disabled }) => {
      button.disabled = !state.active ? disabled : !state.confirmed || state.whole || !page ||
        (button.id === "prompt-prev" ? index <= 0 : button.id === "prompt-next" ? index >= page.versions.length - 1 :
          page.locked || (page.versions.length === 1 && !state.texts[state.page]));
    });
    if (state.active && version) version.textContent = page ? `${index + 1} / ${page.versions.length}` : "1 / 1";
  };
  const paint = () => {
    const { min, max } = bounds();
    state.count = Math.max(1, Math.min(16, state.count));
    state.page = Math.min(state.page, state.count);
    durationRange.value = durationNumber.value = String(state.seconds);
    paintRangeFill(durationRange);
    for (const field of layout.querySelectorAll<HTMLInputElement>("[data-preview-count], [data-preview-count-number]")) { field.value = String(state.count); field.disabled = Boolean(frozenRun); field.setAttribute("aria-label", t(uiKeys.create.editor.segments)); }
    layout.querySelector("label > span")!.textContent = `${t(uiKeys.create.editor.segments)} · ${t(uiKeys.create.editor.recommended, { min, max })}`;
    const ruler = layout.querySelector<HTMLElement>(".create-long-ruler")!;
    ruler.toggleAttribute("data-stale", !state.confirmed); ruler.replaceChildren();
    const chunkSeconds = frozenRun?.chunkSeconds ?? state.seconds / state.count;
    for (let index = 0; index < state.count; index++) {
      const block = document.createElement("span"); block.textContent = String(index+1); block.style.setProperty("--i", String(index));
      block.title = `${(index * chunkSeconds).toFixed(1)}–${((index + 1) * chunkSeconds).toFixed(1)}s`; ruler.append(block);
      const tick = document.createElement("small"); tick.textContent = `${Math.round(index * chunkSeconds)}s`; block.append(tick);
    }
    layout.querySelector(".create-long-summary > span")!.textContent = `${state.count} × ${chunkSeconds.toFixed(1)}s · ${t(state.confirmed ? uiKeys.create.editor.layoutReady : uiKeys.create.editor.layoutStale)}`;
    layout.querySelector("[data-confirm-layout] span")!.textContent = t(uiKeys.create.editor.confirmLayout);
    const tabs = editor.querySelector('[role="tablist"]')!; tabs.replaceChildren();
    for (let index = 0; index <= state.count; index++) {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(state.page === index));
      button.innerHTML = `<span class="create-page-dot"></span><span></span>${state.locks[index] ? icon("lock") : ""}`;
      button.children[1]!.textContent = index === 0 ? t(uiKeys.create.editor.global) : String(index);
      button.title = index === 0 ? `${state.seconds}s · ${state.count}` : `${((index-1)*chunkSeconds).toFixed(1)}–${(index*chunkSeconds).toFixed(1)}s`;
      button.disabled = !state.confirmed; button.addEventListener("click", () => {
        commit(); state.whole = false; state.page = index; save(); paint();
        tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
      }, { signal }); tabs.append(button);
    }
    const activePage = pages()[state.page];
    const activeOutline = state.page > 0 && activePage && !isScriptAllocation(activePage) ? activePage.outline.trim() : "";
    const showOutlineRef = Boolean(!state.whole && activeOutline && activeOutline !== (state.texts[state.page] ?? "").trim());
    outlineRef.hidden = !showOutlineRef;
    if (showOutlineRef && outlineRef.textContent !== activeOutline) outlineRef.textContent = activeOutline;
    text.dataset.richHistoryKey = activePage?.id ?? String(state.page);
    text.hidden = state.whole;
    if (text.value !== (state.texts[state.page] ?? "")) text.value = state.texts[state.page] ?? "";
    text.disabled = !state.confirmed; text.readOnly = Boolean(state.locks[state.page]);
    const lock = editor.querySelector<HTMLButtonElement>("[data-preview-lock]")!;
    review.hidden = state.page === 0 || !pages()[state.page]?.stale || state.whole || !state.confirmed;
    lock.hidden = state.page === 0; lock.disabled = !state.confirmed || state.whole; lock.setAttribute("aria-pressed", String(Boolean(state.locks[state.page])));
    lock.innerHTML = icon(state.locks[state.page] ? "lock" : "lock-open");
    editor.querySelector("[data-preview-whole]")!.setAttribute("aria-pressed", String(state.whole));
    editor.querySelector("[data-preview-pages]")!.setAttribute("aria-pressed", String(!state.whole));
    writing.disabled = state.whole || !state.confirmed;
    previousPage.disabled = !state.confirmed || state.whole || state.page === 0;
    nextPage.disabled = !state.confirmed || state.whole || state.page === state.count;
    editor.querySelector(".create-long-tabs")!.classList.toggle("is-whole", state.whole);
    const whole = editor.querySelector<HTMLElement>(".create-long-whole")!; whole.hidden = !state.whole;
    if (whole.children.length !== state.count + 1) {
      whole.replaceChildren();
      for (let index = 0; index <= state.count; index++) {
        const block = document.createElement("div"), head = document.createElement("div"), headRow = document.createElement("div");
        const dot = document.createElement("span"), label = document.createElement("code"), time = document.createElement("span");
        const outlineEl = document.createElement("div"), field = document.createElement("p");
        block.className = "create-whole-block"; head.className = "create-whole-head"; headRow.className = "create-whole-head-row";
        dot.className = "create-page-dot"; time.className = "create-whole-time"; outlineEl.className = "create-whole-outline"; outlineEl.hidden = true;
        label.textContent = index === 0 ? t(uiKeys.create.editor.global) : `[Chunk ${index}]`;
        if (index > 1) {
          const separator = document.createElement("code");
          separator.className = "create-whole-divider";
          separator.textContent = "---";
          block.append(separator);
        }
        headRow.append(dot, label);
        head.append(headRow, time);
        field.dataset.previewWholePage = String(index); field.setAttribute("role", "textbox"); field.setAttribute("aria-multiline", "true"); field.setAttribute("aria-label", label.textContent);
        let wholeComposing = false;
        const paintWholeRich = (value: string) => {
          if (wholeComposing) return;
          const focused = document.activeElement === field;
          const selection = focused ? richPromptSelection(field) : null;
          field.innerHTML = renderRichPromptHtml(value);
          field.dataset.richText = value;
          if (focused && selection) setRichPromptSelection(field, selection[0], selection[1]);
        };
        field.addEventListener("compositionstart", () => { wholeComposing = true; }, { signal });
        field.addEventListener("compositionend", () => {
          wholeComposing = false;
          const current = richPromptText(field);
          editText(index, current);
          if (state.page === index) text.value = state.texts[index]!;
          paintWholeRich(current);
          countText(); paintWritingActions();
        }, { signal });
        field.addEventListener("input", () => {
          const current = richPromptText(field);
          editText(index, current);
          if (state.page === index) text.value = state.texts[index]!;
          if (!wholeComposing) paintWholeRich(current);
          countText(); paintWritingActions();
        }, { signal });
        block.append(head, outlineEl, field); whole.append(block);
      }
    }
    for (const [index, block] of [...whole.children].entries()) {
      const field = block.querySelector<HTMLElement>("p")!;
      const time = block.querySelector<HTMLElement>(".create-whole-time");
      if (time) time.textContent = index === 0 ? `${state.seconds}s` : `${((index - 1) * chunkSeconds).toFixed(0)}–${(index * chunkSeconds).toFixed(0)}s`;
      const outlineEl = block.querySelector<HTMLElement>(".create-whole-outline");
      const page = pages()[index];
      const outline = index > 0 && page && !isScriptAllocation(page) ? page.outline.trim() : "";
      const showWholeOutline = Boolean(outline && outline !== (state.texts[index] ?? "").trim());
      if (outlineEl) {
        outlineEl.hidden = !showWholeOutline;
        if (showWholeOutline && outlineEl.textContent !== outline) outlineEl.textContent = outline;
      }
      const editable = state.confirmed && !state.locks[index]; field.contentEditable = editable ? "plaintext-only" : "false";
      field.setAttribute("aria-readonly", String(!editable)); field.tabIndex = editable ? 0 : -1;
      const expected = state.texts[index] ?? "";
      if (field.dataset.richText !== expected || richPromptText(field) !== expected) {
        const focused = document.activeElement === field;
        const selection = focused ? richPromptSelection(field) : null;
        field.innerHTML = renderRichPromptHtml(expected);
        field.dataset.richText = expected;
        if (focused && selection) setRichPromptSelection(field, selection[0], selection[1]);
      }
      block.toggleAttribute("data-locked", Boolean(state.locks[index]));
    }
    insert.disabled = !state.confirmed || state.whole || Boolean(state.locks[state.page]);
    paintWritingActions();
    paintVersions();
    countText();
    renderIcons(editor);
    revealPage();
  };
  function paintWritingActions() {
    const appState = persistence.context?.getState();
    const draft = persistence.getDraft();
    const runExtend = draft?.inputMode === "video" && draft.modelId === "minimax_h3_continuum" &&
      Boolean(draft.longVideoRunSource && draft.sourceVideoPath.trim());
    const supported = (runExtend || (draft?.inputMode === "image" &&
      (isContinuumReferenceModel(draft.modelId)
        ? draft.h3ReferenceSlots.some(slot => slot.mediaType === "image" && slot.mediaPath.trim()) &&
          !draft.h3ReferenceSlots.some(slot => slot.mediaType === "video" && slot.mediaPath.trim())
        : isContinuumFl2vaModel(draft.modelId)))) &&
      appState && promptModelBackend(appState.settings.promptModelId) === "strata";
    const busy = enhancementBusy();
    const ready = Boolean(supported && state.confirmed && state.script && !appState?.queueRunning);
    const canAllocate = pages().slice(1).some(page => !page.locked) && state.texts.some(value => value.trim());
    const targets = enhancementTargets();
    const nextPending = targets.find(page => pendingExpansion().includes(page.id));
    const awaitingAllocation = !nextPending && targets.some(isScriptAllocation) && !preparedTargets();
    allocate.disabled = busy || !ready || !canAllocate;
    allocate.title = ready ? canAllocate ? "" : t(uiKeys.create.editor.allocateStoryInput) : t(uiKeys.create.editor.longEnhanceRequirement);
    enhance.disabled = !busy && (!ready || targets.length === 0 || awaitingAllocation);
    enhance.title = busy ? t(uiKeys.create.promptProgress.cancel) : !supported ? t(uiKeys.create.editor.longEnhanceRequirement)
      : awaitingAllocation ? t(uiKeys.create.editor.allocateStoryInput) : "";
    enhance.setAttribute("aria-busy", String(busy));
    const progressLabel = nativeEnhance?.getAttribute("aria-busy") === "true" ? nativeEnhance.querySelector("[data-prompt-progress-label]")?.textContent : undefined;
    enhance.innerHTML = `${icon(busy ? "x" : "sparkles")}<span>${busy ? progressLabel || t(uiKeys.create.promptProgress.cancel) : nextPending
      ? t(uiKeys.create.editor.resumeExpansion, { segment: pages().indexOf(nextPending) }) : t(wholeEnhancement()
      ? preparedTargets() || awaitingAllocation ? uiKeys.create.editor.expandWhole : uiKeys.create.editor.allocateAndExpand
      : uiKeys.create.editor.enhancePage)}</span>`;
    renderIcons(previewActions);
  }
  const hiddenSources = [prompt.closest<HTMLElement>(".prompt-editor-shell")!, root.querySelector<HTMLElement>(".create-prompt-toolbar .prompt-action-controls"), root.querySelector<HTMLElement>(".create-prompt-card > .create-prompt-footer"), root.querySelector<HTMLElement>(".settings-latent-save")].filter((element): element is HTMLElement => Boolean(element));
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
  const writeScript = async (operation?: LongVideoWritingOperation) => {
    if (enhancementBusy()) { await persistence.context?.application.cancelPrompt(); persistence.setEnhancing?.(false); persistence.context?.requestRender(); return; }
    if ((operation === "allocate" ? allocate.disabled : enhance.disabled) || !persistence.context) return;
    let unsubscribe: (() => void) | undefined;
    let requestedPageIds: string[] = [];
    let writingScriptId: string | undefined;
    let singlePageId: string | undefined;
    const completed = new Set<string>();
    try {
      commit();
      const draft = persistence.getDraft(); if (!draft || !state.script) return;
      const target = operation === "allocate" || wholeEnhancement() ? undefined : pages()[state.page]?.id;
      const pending = pendingExpansion();
      const subset = operation !== "allocate" && !target && pending.length ? enhancementTargets().map(p => p.id) : undefined;
      const request = longVideoPromptRequest(state.script, target, operation ?? (preparedTargets() ? "expand" : undefined), subset);
      const guideEditor = activeH3TimedGuides(draft);
      const runExtend = draft.inputMode === "video" && draft.modelId === "minimax_h3_continuum" &&
        Boolean(draft.longVideoRunSource && draft.sourceVideoPath.trim());
      const referenceModel = !runExtend && isContinuumReferenceModel(draft.modelId);
      const slots = runExtend ? [] : guideEditor?.slots ?? h3ReferenceTimedGuides(draft);
      const guideIssue = !runExtend && (guideEditor || slots.length) && longVideoGuideIssue(slots, request.layout);
      if (guideIssue) throw new Error(t(uiKeys.create.guides[guideIssue]));
      const cues = slots.length ? longVideoGuideCues(slots, request.layout) : undefined;
      const referenceImages = draft.h3ReferenceSlots.filter(slot => slot.mediaType === "image");
      const filledReferenceCount = referenceImages.filter(slot => slot.mediaPath.trim()).length;
      const imagePaths = runExtend ? []
        : referenceModel ? [...new Set(referenceImages.map(slot => slot.mediaPath).filter(path => path.trim()))]
        : guideEditor ? [...new Set((cues ?? []).map(guide => guide.mediaPath))] : [draft.startImagePath, draft.endImagePath].filter(Boolean);
      const acceptedPrompts = runExtend ? draft.longVideoRunSource!.profile.prompts : [];
      const referenceContext = runExtend ? [
        `Existing accepted Continuum Run (${acceptedPrompts.length} accepted chunks, ${draft.longVideoRunSource!.profile.chunkSeconds}s each).`,
        "PREVIOUS ACCEPTED CHUNKS (frozen, already rendered):",
        ...acceptedPrompts.map((item, idx) => {
          const isFinal = idx === acceptedPrompts.length - 1;
          const excerpt = isFinal ? item.slice(0, 1800) : item.slice(0, 500);
          return `[Accepted Chunk ${idx + 1}] ${excerpt}`;
        })
      ].join("\n") : referenceModel ? [
        "Each attached Picture is a persistent appearance or identity reference. Keep its Picture number across all segments. A timed reference also guides composition at its designated point.",
        ...(filledReferenceCount >= 2 ? [
          "Only cite each <Picture N> (or @RN) in chunks where that reference actually appears; Continuum V3.9 routes references per chunk automatically so absent subjects do not crowd other chunks."
        ] : []),
        ...referenceImages.flatMap((slot, index) => slot.mediaPath.trim()
          ? [`Attachment ${imagePaths.indexOf(slot.mediaPath) + 1} = <Picture ${index + 1}> (${slot.role})${slot.note ? `: ${slot.note}` : ""}.`] : []),
        ...(cues ?? []).map(guide => `<Picture ${guide.picture}> anchors film ${(guide.frame / 24).toFixed(3)}s${guide.segment ? `, segment ${guide.segment} around ${guide.localSeconds!.toFixed(3)}s` : ""}.`)
      ].join("\n") : cues?.length ? [
        "Read the attached keyframes as existing visual beats. Match each Picture to its attachment below and preserve the visible composition, poses, subjects and props when planning transitions. Plan on the assembled 24 fps timeline; in detailed prompts, use only segment-local time and describe the images in plain language without numbered Picture tags.",
        ...cues.map(guide => `Attachment ${imagePaths.indexOf(guide.mediaPath) + 1} = Picture ${guide.picture}: film ${(guide.frame / 24).toFixed(3)}s${guide.segment ? `, segment ${guide.segment} around ${guide.localSeconds!.toFixed(3)}s` : ""}.`)
      ].join("\n") : !guideEditor && draft.endImagePath ? draft.startImagePath
        ? "Attachment 1 is the opening image. Attachment 2 is the final image. Plan the last segment to reach the final image."
        : "Attachment 1 is the final image. Establish the opening from the brief and plan the last segment to reach this image."
        : undefined;
      const reference = referenceIdentity(draft);
      const liveScript = () => {
        const current = persistence.getDraft();
        if (!current || !isLongVideoDraftActive(current) || !current.longVideoEditor?.confirmed ||
            referenceIdentity(current) !== reference || current.longVideoScript?.brief.id !== request.scriptId) {
          throw new Error(t(uiKeys.create.editor.enhanceStale));
        }
        return current.longVideoScript;
      };
      const presentResult = (script: LongVideoScript) => {
        state.script = script;
        persistence.patchDraft({ longVideoScript: script });
        persistedPageId = script.brief.id;
        persistedRevision = script.revision;
        if (signal.aborted) {
          if (persistence.context?.getRoute().page === "create") persistence.context.requestRender();
          return;
        }
        const focusedTab = editor.contains(document.activeElement) && document.activeElement?.getAttribute("role") === "tab";
        readScript();
        paint();
        if (focusedTab) editor.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
        sync();
      };
      requestedPageIds = longVideoPromptTargets(request).map(page => page.pageId);
      writingScriptId = request.scriptId;
      singlePageId = request.targetPageId;
      let expectedRevision = request.revision;
      let adoptionError: unknown;
      let receivedPlan = false;
      const adoptSegment = (segment: LongVideoPromptResult["segments"][number], stage?: "allocation") => {
        if (completed.has(segment.pageId)) return;
        if (!requestedPageIds.includes(segment.pageId)) throw new Error(t(uiKeys.create.editor.enhanceStale));
        const script = liveScript();
        if (script.revision !== expectedRevision) {
          throw new Error(t(uiKeys.create.editor.enhanceStale));
        }
        const targeted = longVideoPromptRequest(script, segment.pageId, stage ? undefined : "expand");
        const rawSegment = JSON.stringify({
          schemaVersion: 1, scriptId: targeted.scriptId, revision: targeted.revision, segments: [segment]
        });
        let next: LongVideoScript;
        if (stage) {
          const [drafted] = parseLongVideoPromptResult(rawSegment, targeted).segments;
          next = editLongVideoScript(script, [{ pageId: drafted!.pageId, text: drafted!.text, stage }], script.revision, "model", id);
          next.segments.find(page => page.id === drafted!.pageId)!.outline = drafted!.outline;
          receivedPlan = true;
        } else {
          next = applyLongVideoPromptResult(script, targeted, rawSegment, id);
          completed.add(segment.pageId);
          next.pendingExpansion = script.pendingExpansion?.filter(pageId => pageId !== segment.pageId);
          if (!next.pendingExpansion?.length) delete next.pendingExpansion;
        }
        expectedRevision = next.revision;
        presentResult(next);
      };
      if (request.operation !== "allocate") {
        unsubscribe = persistence.context.events?.onPromptProgress?.(({ longVideoPage }) => {
          if (adoptionError || !longVideoPage || longVideoPage.scriptId !== request.scriptId || longVideoPage.revision !== request.revision) return;
          try { adoptSegment(longVideoPage.segment, longVideoPage.stage); }
          catch (error) { adoptionError = error; }
        });
      }
      enhancing = true; persistence.setEnhancing?.(true); paint();
      if (request.operation !== "allocate") {
        presentResult({ ...liveScript(), pendingExpansion: [...new Set([...pending, ...requestedPageIds])] });
      }
      persistence.context.reportUserAction("long-video-enhance", { chunks: request.layout.chunks, target: request.targetPageId ?? "whole", operation: request.operation ?? "automatic" });
      const raw = await persistence.context.enhancePrompt({ prompt: request.brief.text, modelId: draft.modelId,
        mode: "h3-vision", origin: runExtend ? "video-extension" : "image-to-video",
        h3PromptMode: runExtend ? "T2VA" : referenceModel ? "R2V" : imagePaths.length ? "I2VA" : "T2VA",
        h3DurationSeconds: request.layout.chunkSeconds,
        h3PromptPreset: (preset.value || "detailed-cinematic") as H3PromptPreset, imagePath: imagePaths[0],
        imagePaths, longVideo: request, referenceContext,
        ...(runExtend ? { extensionSource: { filePath: draft.sourceVideoPath, trimStartSeconds: draft.trimStartSeconds, trimEndSeconds: draft.trimEndSeconds } } : {}),
        ...(cues?.length ? { h3TimedGuideContext: true } : {}) });
      if (adoptionError) throw adoptionError;
      if (request.operation === "expand" || receivedPlan || completed.size) {
        for (const segment of parseLongVideoPromptResult(raw, request).segments) adoptSegment(segment);
      } else {
        const next = applyLongVideoPromptResult(liveScript(), request, raw, id);
        if (request.operation === "allocate") {
          delete next.pendingExpansion;
          if (!signal.aborted && state.page === 0) next.view = "whole";
        } else {
          next.pendingExpansion = next.pendingExpansion?.filter(pageId => !requestedPageIds.includes(pageId));
          if (!next.pendingExpansion?.length) delete next.pendingExpansion;
        }
        presentResult(next);
      }
      if (!signal.aborted) text.dispatchEvent(new Event("rich-reset-history"));
    } catch (error) {
      if (!signal.aborted || persistence.context?.getRoute().page === "create") {
        const message = (error instanceof Error ? error.message : String(error))
          .replace(/^Error invoking remote method ['"]prompt:enhance['"]: (?:\w*Error: )?/u, "");
        const failed = operation === "allocate" ? undefined : requestedPageIds.find(pageId => !completed.has(pageId));
        const index = pages().findIndex(page => page.id === failed);
        if (error instanceof Error && error.name === "AbortError") return;
        const context = persistence.context;
        const actions = writingScriptId && (failed || operation === "allocate") ? [{
          id: "retry-long-video-writing",
          label: completed.size && index > 0 ? t(uiKeys.create.editor.resumeExpansion, { segment: index }) : t(uiKeys.create.editor.retry),
          run: () => {
            const draft = persistence.getDraft();
            const script = draft?.longVideoScript;
            if (context.getRoute().page !== "create" || !script || script.brief.id !== writingScriptId ||
                (failed && !script.pendingExpansion?.includes(failed))) return;
            const current = context.root;
            const button = current.querySelector<HTMLButtonElement>(operation === "allocate" ? "[data-allocate-long-video]" : "[data-enhance-long-video]");
            if (!button || button.closest("[hidden]") || button.getAttribute("aria-busy") === "true") return;
            if (operation !== "allocate") {
              const target = singlePageId ? script.segments.findIndex(page => page.id === singlePageId) + 1 : 0;
              if (singlePageId) current.querySelector<HTMLButtonElement>('[data-preview-pages][aria-pressed="false"]')?.click();
              current.querySelectorAll<HTMLButtonElement>('.create-long-tabs [role="tab"]')[target]?.click();
            }
            if (!button.disabled) button.click();
          }
        }] : undefined;
        notify(index > 0 ? t(uiKeys.create.editor.expansionStopped, { segment: index, reason: message }) : message,
          { kind: "error", actions, renderPage: false });
      }
    } finally {
      unsubscribe?.();
      enhancing = false; persistence.setEnhancing?.(false);
      if (!signal.aborted) paint();
      else if (persistence.context?.getRoute().page === "create") persistence.context.requestRender();
    }
  };
  enhance.addEventListener("click", () => { void writeScript(); }, { signal });
  allocate.addEventListener("click", () => { void writeScript("allocate"); }, { signal });
  for (const selector of ["[data-preview-duration]", "[data-preview-duration-number]", "[data-preview-count]", "[data-preview-count-number]"]) {
    const field = selector.includes("duration") ? previewDuration.querySelector<HTMLInputElement>(selector)! : layout.querySelector<HTMLInputElement>(selector)!;
    field.addEventListener("input", () => {
      if (!field.value || !Number.isFinite(field.valueAsNumber)) return;
      if (selector.includes("duration")) {
        state.seconds = Math.max(4, Math.min(120, field.valueAsNumber));
        state.count = frozenRun ? Math.ceil(state.seconds / frozenRun.chunkSeconds - 1e-9) : suggestLongVideoChunks(state.seconds).suggested;
      }
      else state.count = Math.round(field.valueAsNumber);
      commit(); state.confirmed = false; save(); paint();
    }, { signal });
  }
  layout.querySelector("[data-confirm-layout]")!.addEventListener("click", () => {
    try {
      commit();
      const next = frozenRun ? proposeLongVideoExtension(state.seconds, frozenRun.acceptedChunks, frozenRun.chunkSeconds).layout
        : createLongVideoLayout(state.seconds, state.count);
      state.seconds = next.requestedSeconds;
      state.script = state.script ? relayoutLongVideoScript(state.script, next, Array.from({ length: next.chunks }, (_, index) => [...state.script!.segments, ...state.script!.archived][index]?.id), id)
        : createLongVideoScript(next, id, state.texts[0] ?? "");
      state.confirmed = true; readScript(); save(); paint();
    } catch { notify(t(uiKeys.create.editor.invalidLayout), { kind: "error" }); }
  }, { signal });
  text.addEventListener("input", () => { editText(state.page, text.value); countText(); paintWritingActions(); paintVersions(); }, { signal });
  editor.addEventListener("focusout", event => {
    if (!(event.target instanceof Element) || !event.target.matches("textarea, .create-rich-prompt, [data-preview-whole-page]")) return;
    commit(); paintVersions();
  }, { signal });
  editor.querySelector("[data-preview-lock]")!.addEventListener("click", () => {
    commit(); const page = pages()[state.page];
    if (state.script && page) state.script = updateScriptPage(state.script, page.id, { locked: !page.locked });
    readScript(); save(); paint();
  }, { signal });
  editor.querySelector("[data-preview-whole]")!.addEventListener("click", () => { commit(); state.whole = !state.whole; save(); paint(); }, { signal });
  editor.querySelector("[data-preview-pages]")!.addEventListener("click", () => { commit(); state.whole = false; save(); paint(); }, { signal });
  for (const [button, step] of [[previousPage, -1], [nextPage, 1]] as const) {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      commit(); state.page += step; save(); paint();
    }, { signal });
  }
  editor.querySelector('[role="tablist"]')!.addEventListener("keydown", event => {
    const keyboard = event as KeyboardEvent;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(keyboard.key) || !state.confirmed || state.whole) return;
    keyboard.preventDefault();
    commit();
    state.page = keyboard.key === "Home" ? 0 : keyboard.key === "End" ? state.count :
      (state.page + (keyboard.key === "ArrowRight" ? 1 : -1) + state.count + 1) % (state.count + 1);
    save(); paint(); editor.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  }, { signal });
  prompt.addEventListener("input", () => { legacyBrief = undefined; }, { signal });
  select.addEventListener("change", () => {
    commit();
    if (select.value === "preview" && !state.active) {
      const currentDraft = persistence.getDraft();
      if (currentDraft && !currentDraft.spectrumModeUserSet && currentDraft.spectrumMode === "balanced") {
        persistence.patchDraft({ spectrumMode: "off" });
        const spectrumSelect = root.querySelector<HTMLSelectElement>("#spectrum-mode");
        if (spectrumSelect) spectrumSelect.value = "off";
      }
      if (legacyBrief) writeNativeBrief();
      if (state.script && !state.script.brief.locked && !state.script.wholeBuffer) {
        state.script = commitScriptText(stageScriptText(state.script, state.script.brief.id, prompt.value), id);
        readScript();
      } else if (!state.script) {
        state.texts[0] = prompt.value;
      }
    }
    if (select.value !== "preview" && state.active) writeNativeBrief();
    if (select.value !== "preview") state.nativeMode = select.value;
    show(select.value === "preview");
    save();
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
    if (action.id !== "clear-prompt" && state.script && !state.whole) {
      commit(); const page = pages()[state.page];
      if (!page) return;
      const index = page.versions.findIndex(v => v.id === page.activeVersionId) + (action.id === "prompt-prev" ? -1 : 1);
      const selected = page.versions[index];
      if (selected) state.script = updateScriptPage(state.script, page.id, { activeVersionId: selected.id });
      readScript(); save(); paint(); return;
    }
    if (action.id !== "clear-prompt" || !state.confirmed || state.whole) return;
    commit();
    const before = state.script;
    const page = pages()[state.page];
    if (!before || !page) return;
    const after = deleteScriptPageVersion(before, page.id);
    if (after === before) return;
    const deleted = [after.brief, ...after.segments][state.page]!;
    state.script = after; readScript(); save(); paint(); text.dispatchEvent(new Event("rich-reset-history"));
    notify(t(uiKeys.create.editor.versionDeleted), { key: `clear-preview-page:${++clearSequence}`, kind: "info", durationMs: 6000, renderPage: false,
      actions: [{ id: "undo-clear-preview-page", label: t(uiKeys.create.editor.undo), run: () => {
        const current = persistence.getDraft()?.longVideoScript;
        if (!current || current.brief.id !== before.brief.id || current.pageBuffers?.[page.id] !== undefined) return;
        const restored = structuredClone(current);
        const live = [restored.brief, ...restored.segments].find(p => p.id === page.id);
        if (!live || JSON.stringify(live) !== JSON.stringify(deleted)) return;
        Object.assign(live, page);
        if (page.id === before.brief.id && current.revision === after.revision) {
          restored.segments.forEach((segment, index) => { segment.stale = before.segments[index]!.stale; });
        }
        restored.revision++;
        if (signal.aborted) {
          persistence.patchDraft({ longVideoScript: restored });
          if (persistence.context?.getRoute().page === "create") persistence.context.requestRender();
        } else {
          state.script = restored; readScript(); save(); paint();
        }
      } }] });
  }, { signal, capture: true });
  const progressObserver = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(() => paint());
  if (nativeEnhance) progressObserver?.observe(nativeEnhance, { attributes: true, childList: true, characterData: true, subtree: true });
  return () => { events.abort(); progressObserver?.disconnect(); tabResize?.disconnect(); disposeInsert(); if (runtime) runtimeHome.replaceWith(runtime); layout.remove(); previewDuration.remove(); editor.remove(); previewActions.remove(); hiddenSources.forEach(element => { element.hidden = false; }); };
}
