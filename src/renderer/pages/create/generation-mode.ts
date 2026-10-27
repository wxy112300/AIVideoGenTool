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
import type { Draft, H3PromptPreset } from "../../../types";
import { createLongVideoLayout, proposeLongVideoExtension, suggestLongVideoChunks } from "../../../core/long-video/layout";
import { createLongVideoScript, relayoutLongVideoScript, reviewScriptPage, updateScriptPage, type LongVideoScript } from "../../../core/long-video/script";
import { commitScriptText, scriptEditingText, stageScriptText } from "../../../core/long-video/script-buffers";
import { applyLongVideoPromptResult, longVideoPromptRequest } from "../../../core/long-video/enhancement";
import { promptModelBackend } from "../../../core/prompt-models";

interface PreviewState { key: string; active: boolean; seconds: number; count: number; confirmed: boolean; page: number; whole: boolean; texts: string[]; locks: boolean[]; writing?: string; preset?: string; nativeMode?: string; script?: LongVideoScript; seeded?: boolean; }
let clearSequence = 0;
export const isLongVideoPreview = (root: HTMLElement): boolean => root.querySelector<HTMLSelectElement>("#generation-mode")?.value === "preview";

/** Structured draft editor with a separate frozen Queue snapshot. */
export function mountGenerationMode(root: HTMLElement, t: Translate, sync: () => void, notify: RendererContext["notify"], persistence: {
  getDraft(): Draft | undefined;
  patchDraft(patch: Partial<Draft>): void;
  context?: Pick<RendererContext, "enhancePrompt" | "getState" | "reportUserAction">;
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
    if (state.seeded && !state.script) state.texts = [""];
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
  if (frozenRun && !state.script) {
    state.count = Math.max(1, Math.min(16 - frozenRun.acceptedChunks, Math.ceil(state.seconds / frozenRun.chunkSeconds)));
    state.seconds = state.count * frozenRun.chunkSeconds;
  }
  let persistedPageId = saved?.longVideoScript?.brief.id;
  let persistedRevision = saved?.longVideoScript?.revision;
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
      key, active: state.active, seconds: state.seconds, count: state.count, confirmed: state.confirmed, seeded: state.seeded,
      nativeMode: state.nativeMode, preset: state.preset
    } });
    persistedPageId = state.script?.brief.id;
    persistedRevision = state.script?.revision;
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
  layout.querySelector<HTMLElement>("p")!.hidden = true;
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
  editor.innerHTML = `<textarea rows="5" spellcheck="true"></textarea><div class="create-long-whole" hidden></div><div class="create-long-tabs"><select data-preview-writing></select><span class="create-tabs-separator"></span><button type="button" class="ghost icon-button create-page-arrow" data-preview-previous>${icon("chevron-left")}</button><div role="tablist"></div><button type="button" class="ghost icon-button create-page-arrow" data-preview-next>${icon("chevron-right")}</button><button type="button" class="ghost icon-button" data-preview-lock></button><span class="create-tabs-separator"></span><div class="create-script-view"><button type="button" class="ghost icon-button" data-preview-pages>${icon("panels-top-left")}</button><button type="button" class="ghost icon-button" data-preview-whole>${icon("scroll-text")}</button></div></div>`;
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
  let enhancing = false;
  const wholeEnhancement = () => state.page === 0 || state.whole || state.writing === "automatic";
  const referenceIdentity = (draft: Draft) => JSON.stringify([draft.modelId, draft.inputMode, draft.startImagePath, draft.endImagePath]);
  previewActions.append(preset, enhance); root.querySelector(".create-prompt-toolbar")!.append(previewActions);
  const version = root.querySelector<HTMLElement>(".composer-heading-main > .muted"); const originalVersion = version?.textContent;
  const versionButtons = [...root.querySelectorAll<HTMLButtonElement>("#prompt-prev, #prompt-next, #clear-prompt")].map(button => ({ button, disabled: button.disabled }));
  const countText = () => {
    counter.textContent = `${estimatePromptTextTokens(state.whole ? state.texts.slice(0, state.count + 1).join("\n") : state.texts[state.page] ?? "")} tokens`;
    editor.querySelectorAll<HTMLElement>(".create-page-dot").forEach((dot, index) => { dot.dataset.state = state.texts[index]?.trim() ? "detail" : "empty"; });
  };
  const paintVersions = () => {
    const page = pages()[state.page];
    const index = page?.versions.findIndex(v => v.id === page.activeVersionId) ?? 0;
    versionButtons.forEach(({ button, disabled }) => {
      button.disabled = !state.active ? disabled : !state.confirmed || state.whole || !page ||
        (button.id === "prompt-prev" ? index <= 0 : button.id === "prompt-next" ? index >= page.versions.length - 1 : Boolean(state.locks[state.page]));
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
      button.disabled = !state.confirmed || state.whole; button.addEventListener("click", () => {
        commit(); state.page = index; save(); paint();
        tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
      }, { signal }); tabs.append(button);
    }
    text.dataset.richHistoryKey = pages()[state.page]?.id ?? String(state.page);
    text.hidden = state.whole; text.value = state.texts[state.page] ?? ""; text.disabled = !state.confirmed; text.readOnly = Boolean(state.locks[state.page]);
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
        const block = document.createElement("div"), label = document.createElement("code"), field = document.createElement("p");
        block.className = "create-whole-block"; label.textContent = index === 0 ? t(uiKeys.create.editor.global) : `[Chunk ${index}]`;
        field.dataset.previewWholePage = String(index); field.setAttribute("role", "textbox"); field.setAttribute("aria-multiline", "true"); field.setAttribute("aria-label", label.textContent);
        field.addEventListener("input", () => { editText(index, richPromptText(field)); if (state.page === index) text.value = state.texts[index]!; countText(); }, { signal });
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
    const appState = persistence.context?.getState();
    const draft = persistence.getDraft();
    const supported = draft?.modelId === "minimax_h3_fl2va" && draft.inputMode === "image" && Boolean(draft.startImagePath) && !draft.endImagePath &&
      appState && promptModelBackend(appState.settings.promptModelId) === "strata";
    enhance.disabled = enhancing || !supported || !state.confirmed || !state.script || (!wholeEnhancement() && Boolean(state.locks[state.page])) || Boolean(appState?.queueRunning);
    enhance.title = supported ? "" : t(uiKeys.create.editor.longEnhanceRequirement);
    enhance.setAttribute("aria-busy", String(enhancing));
    enhance.innerHTML = `${icon(enhancing ? "refresh-cw" : "sparkles")}<span>${t(wholeEnhancement() ? uiKeys.create.editor.enhanceGlobal : uiKeys.create.editor.enhancePage)}</span>`;
    paintVersions();
    countText();
    renderIcons(editor);
    renderIcons(previewActions);
    revealPage();
  };
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
  enhance.addEventListener("click", async () => {
    if (enhancing || enhance.disabled || !persistence.context) return;
    try {
      commit();
      const draft = persistence.getDraft(); if (!draft || !state.script) return;
      const request = longVideoPromptRequest(state.script, wholeEnhancement() ? undefined : pages()[state.page]?.id);
      const reference = referenceIdentity(draft);
      enhancing = true; paint();
      persistence.context.reportUserAction("long-video-enhance", { chunks: request.layout.chunks, target: request.targetPageId ?? "whole" });
      const raw = await persistence.context.enhancePrompt({ prompt: request.brief.text, modelId: draft.modelId,
        mode: "h3-vision", origin: "image-to-video", h3PromptMode: "I2VA", h3DurationSeconds: request.layout.chunkSeconds,
        h3PromptPreset: (preset.value || "detailed-cinematic") as H3PromptPreset, imagePath: draft.startImagePath,
        imagePaths: [draft.startImagePath], longVideo: request });
      if (signal.aborted) return;
      const current = persistence.getDraft();
      if (!state.active || !current || referenceIdentity(current) !== reference || !current.longVideoScript) throw new Error(t(uiKeys.create.editor.enhanceStale));
      // The live draft may change during inference; adoption checks its actual IDs/text/locks.
      state.script = applyLongVideoPromptResult(current.longVideoScript, request, raw, id);
      readScript(); save(); paint();
      text.dispatchEvent(new Event("rich-reset-history"));
    } catch (error) {
      if (!signal.aborted) notify(error instanceof Error ? error.message : String(error), { kind: "error" });
    } finally { enhancing = false; if (!signal.aborted) paint(); }
  }, { signal });
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
  text.addEventListener("input", () => { editText(state.page, text.value); countText(); }, { signal });
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
  select.addEventListener("clear-preview", () => {
    if (!state.texts.some(Boolean) && !state.locks.some(Boolean) && !state.confirmed) return;
    const before = structuredClone(state);
    state.texts = [""]; state.locks = []; state.page = 0; state.confirmed = false;
    state.script = undefined; save();
    paint(); text.dispatchEvent(new Event("rich-reset-history"));
    notify(t(uiKeys.create.editor.cleared), {
      key: `clear-preview:${++clearSequence}`, kind: "info", durationMs: 6000, renderPage: false,
      actions: [{ id: "undo-clear-preview", label: t(uiKeys.create.editor.undo), run: () => {
        if (!select.isConnected || state.script) return;
        Object.assign(state, before);
        save();
        if (select.isConnected) { paint(); sync(); }
      } }]
    });
  }, { signal });
  select.addEventListener("change", () => {
    commit();
    if (select.value === "preview" && !state.seeded && !state.script) {
      state.texts[0] = prompt.value;
      state.seeded = true;
    }
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
    if (action.id !== "clear-prompt" || !state.confirmed || state.locks[state.page] || state.whole) return;
    const page = state.page, pageId = pages()[page]?.id, before = state.texts[page] ?? ""; if (!before) return;
    editText(page, ""); commit(); paint(); text.dispatchEvent(new Event("rich-reset-history"));
    notify(t(uiKeys.create.editor.cleared), { key: `clear-preview-page:${++clearSequence}`, kind: "info", durationMs: 6000, renderPage: false,
      actions: [{ id: "undo-clear-preview-page", label: t(uiKeys.create.editor.undo), run: () => {
        if (!select.isConnected) return;
        const index = pages().findIndex(p => p.id === pageId);
        if (index < 0 || state.texts[index] || state.locks[index]) return;
        editText(index, before); commit(); paint();
      } }] });
  }, { signal, capture: true });
  return () => { events.abort(); tabResize?.disconnect(); disposeInsert(); if (runtime) runtimeHome.replaceWith(runtime); layout.remove(); previewDuration.remove(); editor.remove(); previewActions.remove(); hiddenSources.forEach(element => { element.hidden = false; }); };
}
