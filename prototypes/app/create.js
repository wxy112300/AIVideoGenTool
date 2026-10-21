// Create page prototype: every control of the current Create page in the new visual language.
// Left column = inputs per mode; right column = prompt -> output -> time & motion -> LoRA -> seed / workflow -> submit.
(() => {
  const DS = window.DS;
  const { ic, icons } = DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = () => window.App?.state ?? {};
  const art = ["linear-gradient(120deg,#1d2b53,#7e2553,#ff004d,#ffa300)", "linear-gradient(140deg,#0f2027,#203a43,#2c5364,#7fb3a6)", "linear-gradient(110deg,#2b1055,#7597de,#d3a4c3,#2b1055)", "linear-gradient(130deg,#3a1c1c,#b5651d,#f2c57c,#3a1c1c)", "linear-gradient(135deg,#23074d,#cc5333,#f3a683)"];
  const isH3Video = () => state().mode !== "image";

  /* ---------- Mode-dependent visibility the generic [data-when] rules cannot express ---------- */
  const syncVisibility = () => {
    const s = state();
    const promptVisible = s.mode !== "image" || s.imagekind === "edit";
    $$("[data-show-prompt]").forEach((element) => { element.hidden = !promptVisible; });
  };

  /* ---------- Model selects drive the input / route state (as in the app: the model decides the input form) ---------- */
  const bindModel = (select) => {
    select.addEventListener("change", () => {
      const [key, value] = (select.selectedOptions[0].dataset.state || "").split("=");
      if (key) window.App.setState(key, value);
    });
  };
  const syncModel = (select, key) => {
    const current = select.selectedOptions[0]?.dataset.state;
    if (current === `${key}=${state()[key]}`) return;
    const index = [...select.options].findIndex((option) => option.dataset.state === `${key}=${state()[key]}`);
    if (index >= 0) { select.selectedIndex = index; select.dispatchEvent(new Event("change")); }
  };
  bindModel($("#video-model"));
  bindModel($("#extend-model"));
  bindModel($("#image-model"));

  /* ---------- Shared "add" tile: every input list appends at its end (click, drop or paste) ---------- */
  const addTile = (kind, label, caption, icon = "plus") => `<button class="add-tile" type="button" data-add="${kind}">${ic(icon)}<span><strong>${label}</strong>${caption ? `<span class="caption num">${caption}</span>` : ""}</span></button>`;
  document.addEventListener("dragover", (event) => { const tile = event.target.closest?.(".add-tile"); if (tile) { event.preventDefault(); tile.setAttribute("data-over", ""); } });
  document.addEventListener("dragleave", (event) => event.target.closest?.(".add-tile")?.removeAttribute("data-over"));
  document.addEventListener("drop", (event) => { const tile = event.target.closest?.(".add-tile"); if (tile) { event.preventDefault(); tile.removeAttribute("data-over"); tile.click(); } });

  /* ---------- Media vs. slot: the bar on the media replaces / clears the file; the header trash deletes the slot ---------- */
  const mediaBar = (clearLabel = "清空素材", clearAttr = "data-clear-media") => `<span class="media-bar"><button type="button" data-replace-media>${ic("refresh-cw")}替换</button><button type="button" ${clearAttr}>${ic("eraser")}${clearLabel}</button></span>`;
  const deleteSlotButton = (attr, label) => `<button class="btn btn-icon btn-sm btn-destructive" type="button" ${attr} data-tip="删除 Slot" aria-label="删除 ${label}">${ic("trash-2")}</button>`;
  const flashReplace = (media) => media.animate([{ filter: "brightness(1.6)" }, { filter: "none" }], { duration: 420 });

  /* ---------- 首尾帧 ---------- */
  let endFrame = true;
  const frameMarkup = (kind) => {
    const start = kind === "start";
    return `<div class="frame lit" data-frame="${kind}" style="--ratio:${start ? "16 / 9;--r:1.7778" : "9 / 16;--r:.5625"}"><div class="frame-media" style="background:${start ? art[1] : art[2]}"></div><span class="frame-label">${start ? "首帧" : "尾帧"}</span><span class="chip-media frame-res num">${start ? "1280 × 720" : "720 × 1280"}</span>${mediaBar(start ? "清空" : "移除尾帧", `data-clear-frame="${kind}"`)}</div>`;
  };
  const renderFrames = () => {
    $("#frame-grid").innerHTML = frameMarkup("start") + (endFrame ? frameMarkup("end") : addTile("end", "添加尾帧", "可选", "image-plus"));
    icons();
  };
  $("#frame-grid").addEventListener("click", (event) => {
    if (event.target.closest('[data-add="end"]')) { endFrame = true; renderFrames(); DS.animateIn($('[data-frame="end"]')); return; }
    if (event.target.closest("[data-replace-media]")) { flashReplace(event.target.closest(".frame")); return; }
    const clear = event.target.closest('[data-clear-frame="end"]');
    if (clear) { endFrame = false; DS.animateOut(clear.closest(".frame")).then(renderFrames); }
    else if (event.target.closest('[data-clear-frame="start"]')) window.App.setState("media", "empty");
  });

  /* ---------- 多参考 Slots ---------- */
  const roles = ["人物 / 主体", "场景 / 环境", "风格 / 服装", "动作 / 姿态", "镜头 / 构图", "声音关联", "关键画面", "其它参考"];
  const slots = [
    { type: "image", role: 0, note: "女孩，红色雨衣", art: art[1], size: "1024 × 1536", ratio: [2, 3] },
    { type: "image", role: 1, note: "", art: art[2], size: "1920 × 1080", ratio: [16, 9] },
    { type: "video", role: 3, note: "转身的节奏", art: art[0], size: "1280 × 720 · 0:06", ratio: [16, 9] },
    { type: "image", role: 0, note: "", art: null }
  ];
  const extendSlots = [
    { type: "video", role: 3, note: "", art: art[4], size: "1280 × 720 · 0:08", ratio: [16, 9], locked: true },
    { type: "image", role: 0, note: "保持脸和服装", art: art[1], size: "1024 × 1536", ratio: [2, 3] }
  ];
  const slotMarkup = (list) => {
    const ordinals = { image: 0, video: 0 };
    return list.map((slot, index) => {
      const tag = `${slot.type === "video" ? "Video" : "Picture"} ${++ordinals[slot.type]}`;
      const insert = `<button class="btn btn-icon btn-sm" type="button" data-insert-tag="${tag}" data-tip="插入 &lt;${tag}&gt;" aria-label="插入标签">${ic("text-cursor-input")}</button>`;
      const head = `<div class="slot-head"><span class="slot-no num">${index + 1}</span><strong>${tag}</strong>${slot.size ? `<span class="caption num">${slot.size}</span>` : ""}${slot.locked ? `<span class="badge plain" data-tip="跟随裁剪范围">${ic("lock")}源视频</span>` : ""}
          <div class="slot-actions">${slot.locked ? insert : `<select data-size="sm" data-slot-type aria-label="媒体类型"><option value="image" ${slot.type === "image" ? "selected" : ""}>图片</option><option value="video" ${slot.type === "video" ? "selected" : ""}>视频</option></select>${insert}${deleteSlotButton("data-remove-slot", `Slot ${index + 1}`)}`}</div></div>`;
      const media = slot.art
        ? `<div class="slot-media" style="background-image:${slot.art};--ratio:${slot.ratio[0]} / ${slot.ratio[1]};--r:${slot.ratio[0] / slot.ratio[1]}">${slot.type === "video" ? `<span class="play">${ic("play")}</span>` : ""}${slot.locked ? "" : mediaBar()}</div>`
        : `<button class="slot-media empty" type="button">${ic(slot.type === "video" ? "video" : "image-plus")}<span class="caption">${slot.type === "video" ? "添加视频" : "添加图片"}</span></button>`;
      const fields = slot.locked ? "" : `<div class="slot-fields"><select data-size="sm" aria-label="参考作用">${roles.map((role, roleIndex) => `<option ${roleIndex === slot.role ? "selected" : ""}>${role}</option>`).join("")}</select><input class="input" value="${slot.note}" placeholder="备注" aria-label="备注"></div>`;
      return `<article class="slot lit${slot.locked ? " locked" : ""}" data-slot="${index}">${head}${media}${fields}</article>`;
    }).join("");
  };
  const slotCaption = (list) => `图片 ${list.filter((slot) => slot.type === "image").length}/9 · 视频 ${list.filter((slot) => slot.type === "video").length}/3`;
  const renderSlots = () => {
    const filled = state().media !== "empty";
    const shown = filled ? slots : [];
    $("#r2v-grid").innerHTML = slotMarkup(shown) + (shown.length < 12 ? addTile("r2v", "添加参考", slotCaption(shown)) : "");
    $("#extend-slots").innerHTML = slotMarkup(extendSlots) + (extendSlots.length < 12 ? addTile("extend", "添加参考", slotCaption(extendSlots)) : "");
    $("#r2v-count").textContent = shown.length ? `${shown.length}/12` : "";
    $("#extend-count").textContent = `${extendSlots.length}/12`;
    $$("#r2v-grid select, #extend-slots select").forEach((select) => DS.enhanceSelect(select));
    icons();
  };
  const slotHost = (event) => event.target.closest("#r2v-grid") ? slots : extendSlots;
  let mockPick = 0;
  ["#r2v-grid", "#extend-slots"].forEach((selector) => {
    $(selector).addEventListener("click", (event) => {
      const insert = event.target.closest("[data-insert-tag]");
      if (insert) { insertAtCaret(`<${insert.dataset.insertTag}>`); return; }
      const remove = event.target.closest("[data-remove-slot]");
      if (remove) { const card = remove.closest(".slot"); slotHost(event).splice(Number(card.dataset.slot), 1); DS.animateOut(card).then(() => { renderSlots(); refreshChips(); }); return; }
      if (event.target.closest("[data-replace-media]")) { flashReplace(event.target.closest(".slot-media")); return; }
      if (event.target.closest(".slot-media.empty")) {
        const slot = slotHost(event)[Number(event.target.closest(".slot").dataset.slot)];
        Object.assign(slot, slot.type === "video" ? { art: art[0], size: "1280 × 720 · 0:05", ratio: [16, 9] } : { art: art[3], size: "1024 × 1024", ratio: [1, 1] });
        renderSlots();
        refreshChips();
        return;
      }
      if (event.target.closest("[data-clear-media]")) {
        Object.assign(slotHost(event)[Number(event.target.closest(".slot").dataset.slot)], { art: null, size: "" });
        renderSlots();
        refreshChips();
        return;
      }
      if (event.target.closest("[data-add]")) {
        // Stands in for the file picker: the slot type follows the chosen file.
        const video = ++mockPick % 3 === 0;
        if (state().media === "empty" && selector === "#r2v-grid") slots.length = 0;
        slotHost(event).push(video ? { type: "video", role: 3, note: "", art: art[mockPick % art.length], size: "1280 × 720 · 0:05", ratio: [16, 9] } : { type: "image", role: 0, note: "", art: art[mockPick % art.length], size: "1024 × 1024", ratio: [1, 1] });
        if (state().media === "empty") window.App.setState("media", "filled"); else renderSlots();
        DS.animateIn($(`${selector} .slot:last-of-type`));
        refreshChips();
      }
    });
    $(selector).addEventListener("change", (event) => {
      if (!event.target.matches("[data-slot-type]")) return;
      const slot = slotHost(event)[Number(event.target.closest(".slot").dataset.slot)];
      Object.assign(slot, { type: event.target.value, art: null, size: "" });
      renderSlots();
      refreshChips();
    });
  });

  /* ---------- 裁剪保留范围 ---------- */
  const trim = $("#trim");
  const [trimStart, trimEnd] = $$("input", trim);
  const paintTrim = () => {
    if (Number(trimStart.value) > Number(trimEnd.value) - 0.5) trimStart.value = String(Number(trimEnd.value) - 0.5);
    trim.style.setProperty("--a", `${trimStart.value * 10}%`);
    trim.style.setProperty("--b", `${trimEnd.value * 10}%`);
    const fmt = (value) => `00:${Number(value).toFixed(1).padStart(4, "0")}`;
    const kept = trimEnd.value - trimStart.value;
    const added = duration();
    $("#trim-readout").textContent = `${fmt(trimStart.value)} — ${fmt(trimEnd.value)}`;
    $("#trim-kept").textContent = `${kept.toFixed(1)} 秒`;
    $("#trim-cut").textContent = `${(10 - kept).toFixed(1)} 秒`;
    $("#trim-add").textContent = `${added.toFixed(1)} 秒`;
    $("#trim-total").textContent = `约 ${(kept + added).toFixed(1)} 秒`;
  };
  trimStart.addEventListener("input", paintTrim);
  trimEnd.addEventListener("input", paintTrim);

  /* ---------- 参考图片 (image processing) + markup / mask editor ---------- */
  const imageRoles = ["基础画面", "人物", "物体", "姿态", "风格", "背景", "自动"];
  const pictures = [
    { n: 1, art: art[1], ratio: "4 / 3", r: 4 / 3, file: "reference-city.png", crop: "1600 × 1200", marked: 2 },
    { n: 2, art: art[4], ratio: "3 / 4", r: 3 / 4, file: "neon-sign.jpg", role: 2 }
  ];
  const renderPictures = () => {
    const kind = state().imagekind;
    const list = kind === "edit" ? pictures : pictures.slice(0, 1);
    $("#picture-list").innerHTML = list.map((picture, index) => {
      const n = index + 1;
      const base = n === 1;
      const badges = kind === "removal"
        ? `<span class="chip-media">${ic("brush")}Mask</span>`
        : `${picture.crop ? `<span class="chip-media" data-tip="裁剪 · ${picture.crop}">${ic("crop")}裁剪</span>` : ""}${picture.marked && kind === "edit" ? `<span class="chip-media">${ic("pencil")}${picture.marked} 处标记</span>` : ""}`;
      const tools = kind === "removal"
        ? `<button class="btn btn-icon btn-sm" type="button" data-open-markup="${n}" data-mask data-tip="修改 Mask" aria-label="修改 Mask">${ic("brush")}</button>`
        : kind === "edit" ? `<button class="btn btn-icon btn-sm" type="button" data-open-markup="${n}" data-tip="标记" aria-label="标记 Picture ${n}">${ic("pencil")}</button><button class="btn btn-icon btn-sm" type="button" data-open-markup="${n}" data-mask data-tip="Mask" aria-label="Picture ${n} Mask">${ic("brush")}</button>` : "";
      return `<article class="slot lit${base ? " base" : ""}">
        <div class="slot-head"><span class="slot-no num">${n}</span><strong>Picture ${n}</strong>${base && kind === "edit" ? '<span class="badge plain">基础画面</span>' : ""}<code class="ellipsis caption">${picture.art ? picture.file : ""}</code>
          <div class="slot-actions">${picture.art ? tools : ""}${deleteSlotButton(`data-remove-picture="${index}"`, `Picture ${n}`)}</div></div>
        ${picture.art ? `<div class="slot-media" style="--ratio:${picture.ratio};--r:${picture.r};background-image:${picture.art}">${kind === "edit" && picture.marked ? '<span class="mk" style="left:18%;top:22%;width:26%;height:30%"></span><span class="mk" style="left:58%;top:48%;width:20%;height:26%;border-radius:50%"></span>' : ""}${kind === "removal" ? '<span class="mk mask" style="left:30%;top:56%;width:28%;height:22%"></span>' : ""}<span class="slot-badges">${badges}</span>${mediaBar()}</div>` : `<button class="slot-media empty" type="button" data-fill-picture="${index}">${ic("image-plus")}<span class="caption">添加图片</span></button>`}
        ${kind === "edit" && !base ? `<div class="slot-fields one"><select data-size="sm" aria-label="参考作用">${imageRoles.slice(1).map((role, roleIndex) => `<option ${roleIndex + 1 === picture.role ? "selected" : ""}>${role}</option>`).join("")}</select></div>` : ""}
      </article>`;
    }).join("") + (kind === "edit" && pictures.length < 3 ? addTile("picture", "添加参考图", `${pictures.length}/3`) : "");
    $$("#picture-list select").forEach((select) => DS.enhanceSelect(select));
    icons();
  };
  const overlay = $("#markup-overlay");
  $("#picture-list").addEventListener("click", (event) => {
    if (event.target.closest('[data-add="picture"]')) {
      pictures.push({ art: art[(pictures.length + 2) % art.length], ratio: "1 / 1", r: 1, file: `reference-${pictures.length + 1}.png`, role: 1 });
      renderPictures();
      DS.animateIn($("#picture-list .slot:last-of-type"));
      return;
    }
    const remove = event.target.closest("[data-remove-picture]");
    if (event.target.closest("[data-replace-media]")) { flashReplace(event.target.closest(".slot-media")); return; }
    const pictureIndex = () => $$("#picture-list .slot").indexOf(event.target.closest(".slot"));
    if (event.target.closest("[data-clear-media]")) { Object.assign(pictures[pictureIndex()], { art: null, crop: "", marked: 0 }); renderPictures(); return; }
    const fill = event.target.closest("[data-fill-picture]");
    if (fill) { Object.assign(pictures[Number(fill.dataset.fillPicture)], { art: art[(Number(fill.dataset.fillPicture) + 3) % art.length], ratio: "1 / 1", r: 1, file: "replaced.png" }); renderPictures(); return; }
    if (remove) {
      const index = Number(remove.dataset.removePicture);
      if (index === 0 && pictures.length === 1) { window.App.setState("media", "empty"); return; }
      pictures.splice(index, 1);
      DS.animateOut(remove.closest(".slot")).then(renderPictures);
      return;
    }
    const open = event.target.closest("[data-open-markup]");
    if (!open) return;
    const mask = open.hasAttribute("data-mask");
    overlay.dataset.mode = mask ? "mask" : "markup";
    $("#markup-title").textContent = mask ? "绘制移除区域" : `标记 Picture ${open.dataset.openMarkup}`;
    $$("[data-tool]", overlay).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tool === (mask ? "brush" : "select"))));
    overlay.hidden = false;
    void overlay.offsetWidth;
    overlay.setAttribute("data-open", "");
  });
  const closeMarkup = () => { overlay.removeAttribute("data-open"); overlay.hidden = true; };
  overlay.addEventListener("click", (event) => {
    const tool = event.target.closest("[data-tool]");
    if (tool) $$("[data-tool]", overlay).forEach((button) => button.setAttribute("aria-pressed", String(button === tool)));
    const swatch = event.target.closest(".swatch-row button");
    if (swatch) $$(".swatch-row button", overlay).forEach((button) => button.setAttribute("aria-pressed", String(button === swatch)));
    if (event.target.closest("[data-markup-close]")) closeMarkup();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) closeMarkup(); });

  /* ---------- Prompt editor: reference chips, versions, quick insert, word count ---------- */
  const editor = $("#rich-prompt");
  let lastCaret = null;
  const references = () => {
    const s = state();
    const list = s.mode === "video" && s.input === "r2v" && s.media !== "empty" ? slots : s.mode === "extend" && s.route === "motion" ? extendSlots : [];
    const ordinals = { image: 0, video: 0 };
    return Object.fromEntries(list.map((slot, index) => {
      const name = `${slot.type === "video" ? "Video" : "Picture"} ${++ordinals[slot.type]}`;
      return slot.art ? [name, [slot.art, `Slot ${index + 1} · ${slot.locked ? "源视频" : roles[slot.role]}`, slot.type === "video"]] : null;
    }).filter(Boolean));
  };
  const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const chipHtml = (name) => {
    const ref = references()[name];
    if (!ref) return `<span class="ref-chip missing" contenteditable="false" data-ref="${name}" data-tip-title="${name} 不存在" data-tip="没有对应的参考"><span class="thumb">${ic("circle-alert")}</span>${name}</span>`;
    return `<span class="ref-chip${ref[2] ? " video" : ""}" contenteditable="false" data-ref="${name}" data-tip-title="&lt;${name}&gt;" data-tip="${ref[1]}"><span class="thumb" style="background-image:${ref[0]}"></span>${name}</span>`;
  };
  const tokenPattern = /<(Picture|Video) (\d+)>/g;
  // Rich text: reference chips plus timeline marks, dialogue and field labels; the stored prompt stays plain text.
  const richPattern = /<(?:Picture|Video) \d+>|\[\d+(?:[.:]\d+)?\s*[–-]\s*\d+(?:[.:]\d+)?\s*s?\]|"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|^(?:Ambient sound|Sound|Camera|Dialogue|Music|声音|镜头|对白|音效|音乐)[:：]/gm;
  const renderText = (text) => {
    let html = "", last = 0;
    for (const match of text.matchAll(richPattern)) {
      const token = match[0];
      html += escapeHtml(text.slice(last, match.index));
      last = match.index + token.length;
      if (token.startsWith("<")) html += chipHtml(token.slice(1, -1));
      else if (token.startsWith("[")) html += `<span class="tok tok-time">${escapeHtml(token)}</span>`;
      else if (/[:：]$/.test(token)) html += `<span class="tok tok-key">${escapeHtml(token)}</span>`;
      else html += `<span class="tok tok-say">${escapeHtml(token)}</span>`;
    }
    return html + escapeHtml(text.slice(last));
  };
  const plainOf = (node) => [...node.childNodes].map((child) => child.nodeType === 3 ? child.textContent : child.dataset?.ref ? `<${child.dataset.ref}>` : child.nodeName === "BR" ? (child.hasAttribute("data-end") ? "" : "\n") : plainOf(child)).join("");
  const plainText = () => plainOf(editor);
  const signature = (node) => { node.normalize(); return [...node.childNodes].map((child) => child.nodeType === 3 ? `t:${child.textContent}` : `${child.className}:${child.dataset?.ref ?? child.textContent}`).join("|"); };
  const caretOffset = () => {
    const selection = getSelection();
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return null;
    const range = document.createRange();
    range.setStart(editor, 0);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return plainOf(range.cloneContents()).length;
  };
  const setCaret = (offset) => {
    let rest = offset;
    const walk = (node) => {
      for (const child of node.childNodes) {
        const length = child.nodeType === 3 ? child.textContent.length : child.dataset?.ref ? child.dataset.ref.length + 2 : plainOf(child).length;
        if (rest <= length) {
          if (child.nodeType === 3) return [child, rest];
          if (child.dataset?.ref) return [node, [...node.childNodes].indexOf(child) + (rest ? 1 : 0)];
          return walk(child);
        }
        rest -= length;
      }
      return null;
    };
    const [node, at] = walk(editor) ?? [editor, editor.childNodes.length];
    getSelection().collapse(node, at);
  };
  // A trailing newline only renders (and keeps the caret) when followed by a sentinel <br>.
  const ensureEnd = () => {
    const sentinel = editor.querySelector("br[data-end]");
    if (!plainText().endsWith("\n")) { sentinel?.remove(); return; }
    if (editor.lastChild !== sentinel) { sentinel?.remove(); const br = document.createElement("br"); br.setAttribute("data-end", ""); editor.append(br); }
  };
  const setText = (text, caret) => {
    editor.innerHTML = renderText(text);
    ensureEnd();
    icons();
    if (caret != null) setCaret(caret);
  };
  const refreshRich = () => {
    const probe = document.createElement("div");
    probe.innerHTML = renderText(plainText());
    editor.querySelector("br[data-end]")?.remove();
    if (signature(probe) !== signature(editor)) setText(plainText(), caretOffset());
    else ensureEnd();
  };
  function refreshChips() { setText(plainText()); renderInserts(); }
  editor.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const text = plainText();
    const at = caretOffset() ?? text.length;
    setText(`${text.slice(0, at)}\n${text.slice(at)}`, at + 1);
    updateWordCount();
  });
  editor.addEventListener("paste", (event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); });
  const versionSets = {
    fl2va: [["原始", "雨夜的城市街道，女孩撑伞走过路灯，镜头缓慢推近。"], ["扩写 1", "One continuous realistic cinematic shot, 24 fps. A young woman in a red raincoat walks under a streetlight on a wet city street at night. The camera slowly pushes in as she stops and looks up at a lit window. Ambient sound: steady rain, distant traffic."], ["手动编辑", "One continuous realistic cinematic shot, 24 fps, no cuts.\n[0–3s] A young woman in a red raincoat walks under a streetlight on a wet street at night.\n[3–6s] She pauses and looks up at a lit window. Slow push-in.\n[6–8s] She whispers \"Still awake.\" and smiles.\nAmbient sound: steady rain, a distant tram bell."]],
    r2v: [["原始", "<Picture 1> 中的女孩站在 <Picture 2> 的雨夜街道上，按照 <Video 1> 的节奏转身。"], ["扩写 1", "<Picture 1> 中的女孩站在 <Picture 2> 的雨夜街道上，镜头缓慢推进。她按照 <Video 1> 的节奏转身，停在路灯下抬头看向窗户。结尾 <Picture 3> 的招牌亮起。"]],
    motion: [["原始", "她继续向前走，推开 <Picture 1> 里的书店门，门铃轻响。"], ["扩写 1", "Continue <Video 1> as one continuous shot. She keeps walking, then pushes open the bookshop door; the bell rings softly. Keep her face and coat identical to <Picture 1>."]],
    boundary: [["原始", "镜头跟随她走进书店，暖光落在书架上。"]],
    continuum: [["原始", "她在书架间停下，抽出一本旧书，翻开第一页。镜头越过肩膀看向书页。"]],
    image: [["原始", "把天空换成晴朗的蓝天，去掉电线，保持建筑和人物不变。"], ["细节增强 1", "Replace the overcast sky with a clear blue sky with soft high clouds. Remove all overhead cables cleanly, reconstructing the facade behind them. Keep every building, person and shadow direction unchanged; match exposure at the skyline edge."]]
  };
  const versionKey = () => { const s = state(); return s.mode === "image" ? "image" : s.mode === "extend" ? s.route : s.input; };
  const versionIndex = {};
  const renderPrompt = () => {
    const key = versionKey();
    const list = versionSets[key];
    const index = versionIndex[key] ?? list.length - 1;
    versionIndex[key] = index;
    editor.innerHTML = renderText(list[index][1]);
    $("#version-label").textContent = `${index + 1} / ${list.length} · ${list[index][0]}`;
    $("#prompt-prev").disabled = index === 0;
    $("#prompt-next").disabled = index === list.length - 1;
    icons();
    updateWordCount();
  };
  const stepVersion = (delta) => { const key = versionKey(); versionIndex[key] = Math.max(0, Math.min(versionSets[key].length - 1, versionIndex[key] + delta)); renderPrompt(); };
  $("#prompt-prev").addEventListener("click", () => stepVersion(-1));
  $("#prompt-next").addEventListener("click", () => stepVersion(1));
  $("#prompt-clear").addEventListener("click", () => {
    const before = editor.innerHTML;
    editor.innerHTML = "";
    updateWordCount();
    updateEnhanceLabel();
    DS.toast("已清空当前提示词版本", { kind: "info", action: "撤销", onAction: () => { editor.innerHTML = before; updateWordCount(); updateEnhanceLabel(); } });
  });
  function updateWordCount() {
    const text = plainText().replace(tokenPattern, "x");
    const count = (text.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) ?? []).length;
    const image = state().mode === "image";
    const [min, max] = [60, 180];
    $("#word-count").className = `word-count num${!image && count > max ? " over" : ""}`;
    $("#word-count").innerHTML = image ? `当前 <b>${count}</b> 词` : `当前 <b>${count}</b> 词 · 参考范围 ${min}–${max} 词`;
    $("#token-estimate").textContent = `${Math.round(count * 1.35)} tokens`;
  }
  editor.addEventListener("input", () => {
    refreshRich();
    updateWordCount();
    updateEnhanceLabel();
  });
  editor.addEventListener("blur", () => { lastCaret = caretOffset() ?? lastCaret; });
  editor.addEventListener("keyup", () => { lastCaret = caretOffset() ?? lastCaret; });
  editor.addEventListener("pointerup", () => { lastCaret = caretOffset() ?? lastCaret; });
  function insertAtCaret(insert) {
    const text = plainText();
    const at = Math.min(text.length, (document.activeElement === editor ? caretOffset() : null) ?? lastCaret ?? text.length);
    editor.focus();
    setText(text.slice(0, at) + insert + text.slice(at), at + insert.length);
    lastCaret = at + insert.length;
    $$(".ref-chip", editor).filter((chip) => insert.includes(`<${chip.dataset.ref}>`)).forEach((chip) => DS.animateIn(chip));
    updateWordCount();
    updateEnhanceLabel();
  }
  const videoSnippets = [
    ["参考与连续性", ["锁定参考图身份与构图", "锁定身体与视线朝向"]],
    ["真实感与材质", ["真人实拍质感", "避免 CG、玩偶与塑料感", "自然皮肤与材质细节", "自然光与真实曝光"]],
    ["拍摄与设备", ["旧手机 1x 真实感", "纪录片手持质感"]],
    ["动作与反应", ["自然动作起因", "对白身体反应"]],
    ["镜头运动", ["慢速推近", "后退拉开并展开环境", "升降配合镜头", "禁止意外绕行", "一镜到底 · 禁止切镜头", "向右摇摄", "跟拍", "固定镜头"]],
    ["景别构图", ["切到近景", "展开广角", "连续景别变化"]],
    ["主体动作", ["转向镜头", "微风细节"]],
    ["声音", ["环境声", "声音与画面同步", "空间回声衰减", "不要背景音乐"]],
    ["对白", ["中文对白", "英文对白与 ID"]],
    ["屏幕文字", ["锁定画面文字"]]
  ];
  const imageSnippets = [["编辑指令", ["保持基础画面", "按标记局部修改", "只修改指定内容", "自然移除元素", "自然添加元素", "修复合成痕迹", "禁止新增文字或元素"]]];
  const renderInserts = () => {
    const query = $("#insert-search").value.trim();
    const refs = Object.keys(references());
    const groups = [...(refs.length ? [["参考", refs]] : []), ...(state().mode === "image" ? imageSnippets : videoSnippets)];
    $("#insert-items").innerHTML = groups.map(([group, items]) => {
      const matches = items.filter((label) => !query || label.toLowerCase().includes(query.toLowerCase()) || group.includes(query));
      return matches.length ? `<div class="menu-heading">${group}</div>${matches.map((label) => group === "参考"
        ? `<button class="menu-item" type="button" data-insert-ref="${label}"><span class="ref-chip${references()[label][2] ? " video" : ""}"><span class="thumb" style="background-image:${references()[label][0]}"></span>${label}</span><span class="hint">${references()[label][1]}</span></button>`
        : `<button class="menu-item" type="button" data-insert="${label}">${ic("plus")}${label}</button>`).join("")}` : "";
    }).join("") || '<div class="menu-heading">没有匹配的写法</div>';
    icons();
  };
  $("#insert-search").addEventListener("input", renderInserts);
  // The menu stays open so several snippets can be combined; outside click / Esc closes it.
  $("#insert-items").addEventListener("click", (event) => {
    const item = event.target.closest("[data-insert], [data-insert-ref]");
    if (!item) return;
    insertAtCaret(item.dataset.insertRef ? `<${item.dataset.insertRef}>` : `${plainText().trim() ? " " : ""}${item.dataset.insert}。`);
    item.animate([{ background: "var(--accent-soft)" }, { background: "transparent" }], { duration: 500 });
  });

  /* ---------- Prompt model runtime + enhance progress ---------- */
  const runtime = $("#runtime-btn");
  const runtimeStates = {
    idle: ["play", "预热提示词模型", "Qwen3-VL 4B Instruct · 未加载\n点击预热并常驻显存（约 9 GB），之后优化更快"],
    warming: ["refresh-cw", "正在加载提示词模型", "Qwen3-VL 4B Instruct · 加载中\n完成后保持常驻"],
    resident: ["square", "卸载提示词模型", "Qwen3-VL 4B Instruct · 已常驻 · 占用 8.7 GB\n点击卸载，释放显存给视频生成"]
  };
  const setRuntime = (next) => {
    runtime.dataset.state = next;
    runtime.setAttribute("aria-busy", String(next === "warming"));
    runtime.setAttribute("aria-label", runtimeStates[next][1]);
    runtime.dataset.tipTitle = runtimeStates[next][1];
    runtime.dataset.tip = runtimeStates[next][2];
    runtime.innerHTML = ic(runtimeStates[next][0]);
    icons();
  };
  setRuntime("idle");
  runtime.addEventListener("click", () => {
    if (runtime.dataset.state === "idle") { setRuntime("warming"); setTimeout(() => { setRuntime("resident"); DS.toast("提示词模型已就绪", { kind: "info", icon: "cpu" }); }, 1600); }
    else if (runtime.dataset.state === "resident") { setRuntime("idle"); DS.toast("已卸载提示词模型", { kind: "info", icon: "cpu" }); }
  });
  const enhance = $("#enhance");
  const enhanceControl = DS.progressButton(enhance, { labels: ["准备中", "88.8 秒", "增强本页", "增强全局", "增强提示词"] });
  const enhanceLabel = () => {
    if (state().long === "on" && isH3Video()) return long.page === "global" ? "增强全局" : "增强本页";
    if (!plainText().trim() && Object.keys(references()).length) return "增强提示词";
    return "优化提示词";
  };
  function updateEnhanceLabel() {
    if (enhanceControl.active) return;
    $(".btn-label .live", enhance).textContent = enhanceLabel();
    const preset = state().mode === "image" ? $("#image-preset") : $("#preset");
    enhance.dataset.tipTitle = enhanceLabel();
    enhance.dataset.tip = `${preset.selectedOptions[0].textContent} · Qwen3-VL 4B Instruct\n生成新版本，可在版本间切换`;
  }
  ["#preset", "#image-preset"].forEach((selector) => $(selector).addEventListener("change", updateEnhanceLabel));
  let enhanceTimer = 0;
  enhance.addEventListener("click", () => {
    const stop = () => { clearInterval(enhanceTimer); enhanceControl.reset(); updateEnhanceLabel(); };
    if (enhanceControl.active) { stop(); DS.toast("已取消生成", { kind: "warning" }); return; }
    if (runtime.dataset.state === "idle") setRuntime("resident");
    enhanceControl.set(null, "准备中");
    const start = performance.now();
    const stages = ["准备提示词任务", "检查 ComfyUI 与模型", "分析参考画面", "生成提示词", "校验提示词格式"];
    enhanceTimer = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const percent = Math.min(100, elapsed * 22);
      enhanceControl.set(percent, `${elapsed.toFixed(1)} 秒`);
      enhance.dataset.tipTitle = stages[Math.min(stages.length - 1, Math.floor(percent / 20))];
      enhance.dataset.tip = `已用 ${elapsed.toFixed(1)} 秒 · ${Math.round(percent)}%\n点击取消生成`;
      if (elapsed > 4.6) {
        stop();
        const key = versionKey();
        versionSets[key].push([`扩写 ${versionSets[key].length}`, versionSets[key].at(-1)[1]]);
        versionIndex[key] = versionSets[key].length - 1;
        renderPrompt();
        DS.toast(`已生成第 ${versionSets[key].length} 版提示词`, { icon: "sparkles", action: "回到上一版", onAction: () => stepVersion(-1) });
      }
    }, 100);
  });

  /* ---------- Time & motion: generation method, duration, long-video layout ---------- */
  const durField = $("#dur-field");
  const duration = () => Number($("input[type=range]", durField).value);
  const long = { total: 60, segments: 6, confirmed: false, page: "global", view: "pages", pages: [], locked: new Set() };
  const recommended = (total) => total < 5 ? { min: 1, max: 1, def: 1 } : { min: Math.max(1, Math.ceil(total / 15)), max: Math.min(16, Math.floor(total / 5)), def: Math.min(16, Math.ceil(total / 10)) };
  const setRange = (field, min, max, step, value, ticks) => {
    const range = $("input[type=range]", field), number = $("input[type=number]", field);
    range.min = number.min = String(min); range.max = number.max = String(max); range.step = number.step = String(step);
    range.value = number.value = String(Math.min(max, Math.max(min, value)));
    if (ticks) $(".range-ticks", field).innerHTML = ticks.map((tick) => `<span>${tick}</span>`).join("");
    field.repaint?.();
  };
  const applyGenMode = () => {
    const mode = $("#gen-mode").value;
    if (mode === "continuum") setRange(durField, 4, 120, 1, long.total, [4, 30, 60, 90, 120]);
    else if (mode === "unlocked") setRange(durField, 1, 30, 0.1, Math.min(duration(), 30), [1, 10, 20, 30]);
    else setRange(durField, 1, 15.1, 0.1, Math.min(duration(), 15.1), [1, 5, 10, 15.1]);
    paintTime();
  };
  $("#gen-mode").addEventListener("change", () => {
    window.App.setState("long", $("#gen-mode").value === "continuum" ? "on" : "off");
    applyGenMode();
  });
  durField.addEventListener("value", () => {
    if (state().long === "on") { long.total = duration(); setSegments(recommended(long.total).def); }
    paintTime();
  });
  const segField = $("#seg-field");
  const setSegments = (value) => { long.segments = value; $("input[type=range]", segField).value = $("input[type=number]", segField).value = String(value); };
  segField.addEventListener("value", (event) => { long.segments = event.detail; paintTime(); });
  function paintTime() {
    const seconds = duration();
    const frames = Math.round(seconds * 24 / 17) * 17 + 5;
    $("#frames-out").textContent = state().long === "on" ? "" : `${frames} 模型帧`;
    $("#long-warn").hidden = !(state().long === "off" && seconds > 15.1);
    const range = recommended(long.total);
    segField.dataset.band = `${range.min},${range.max}`;
    segField.repaint?.();
    $("#seg-range").textContent = `推荐 ${range.min}–${range.max}`;
    const each = long.total / long.segments;
    $("#ruler").innerHTML = Array.from({ length: long.segments }, (_, index) => `<div class="seg-block" style="--i:${index}">${index + 1}<span class="tick num">${Math.round(index * each)}s</span></div>`).join("");
    const outside = long.segments < range.min || long.segments > range.max;
    const stale = long.confirmed && long.pages.length !== long.segments;
    $("#layout-summary").innerHTML = `${long.segments} 段 × ${each.toFixed(1)} 秒${outside ? ` · <span style="color:var(--warning)">超出推荐范围</span>` : ""}${stale ? ` · <span style="color:var(--warning)">布局已改动，需重新确认</span>` : ""}`;
    $("#ruler").toggleAttribute("data-stale", stale);
    if (state().mode === "extend") paintTrim();
    paintSubmit();
  }
  const outlines = ["雨后的城市街道，夜色，霓虹倒影。女主角从画面左侧走入。", "她停在路灯下，抬头看向楼上亮着灯的窗户，镜头缓慢推近。", "转身穿过斑马线，车灯从背景划过，雨滴在光里闪烁。", "走进一家亮着暖光的书店，推门时门铃轻响。", "在书架间停下，抽出一本旧书，翻开第一页。", "镜头越过她的肩膀看向书页，画面渐渐安静。"];
  const globalText = "城市雨夜，一个镜头连续跟随女主角，从街道走入书店。保持服装与发型一致，结尾安静收束。";
  $("#confirm-layout").addEventListener("click", () => {
    const previous = long.pages;
    long.pages = Array.from({ length: long.segments }, (_, index) => previous[index] ?? { id: `p${index + 1}`, text: outlines[index % outlines.length], state: index < 2 ? "detail" : "outline" });
    long.confirmed = true;
    if (long.page !== "global" && !long.pages.some((page) => page.id === long.page)) long.page = "global";
    paintTime();
    renderTabs();
    DS.toast(`已确认 ${long.segments} 段布局`, { kind: "info", icon: "layers" });
  });
  function renderTabs() {
    if (!long.pages.length) long.pages = Array.from({ length: long.segments }, (_, index) => ({ id: `p${index + 1}`, text: outlines[index % outlines.length], state: index < 2 ? "detail" : "outline" }));
    const each = long.total / long.pages.length;
    const items = [{ id: "global", label: "全局", state: "detail", tip: `${long.total} 秒 · ${long.pages.length} 段` }, ...long.pages.map((page, index) => ({ id: page.id, label: String(index + 1), state: page.state, tip: `${(index * each).toFixed(1)}–${((index + 1) * each).toFixed(1)} 秒 · ${page.state === "detail" ? "详稿" : "提纲"}` }))];
    $("#page-tabs").innerHTML = items.map((item) => `<button class="page-tab" role="tab" type="button" data-page="${item.id}" data-tip="${item.tip}" aria-selected="${item.id === long.page}"><span class="state-dot" data-state="${item.state}"></span>${item.label}${long.locked.has(item.id) ? ic("lock") : ""}</button>`).join("");
    $("#lock-page").hidden = long.page === "global";
    $("#lock-page").innerHTML = ic(long.locked.has(long.page) ? "lock" : "lock-open");
    $("#lock-page").dataset.tip = long.locked.has(long.page) ? "已锁定" : "锁定本页";
    icons();
    renderScript();
  }
  $("#page-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".page-tab");
    if (!tab) return;
    long.page = tab.dataset.page;
    renderTabs();
    $(`.page-tab[data-page="${long.page}"]`).scrollIntoView({ inline: "nearest", block: "nearest" });
  });
  $("#lock-page").addEventListener("click", () => { if (long.locked.has(long.page)) long.locked.delete(long.page); else long.locked.add(long.page); renderTabs(); });
  $("#script-view").addEventListener("change", (event) => { long.view = event.detail.value; renderScript(); });
  function renderScript() {
    const longOn = state().long === "on" && isH3Video();
    const whole = longOn && long.view === "whole";
    editor.hidden = whole;
    $("#whole-script").hidden = !whole;
    $("#page-tabs-row").classList.toggle("muted", whole);
    if (!longOn) { renderPrompt(); updateEnhanceLabel(); return; }
    if (whole) {
      $("#whole-script").innerHTML = [["全局", globalText], ...long.pages.map((page, index) => [`[Chunk ${index + 1}]`, page.text])].map(([label, text]) => `<div class="whole-block"><code>${label}</code><p contenteditable="true">${text}</p></div>`).join("");
    } else {
      const page = long.pages.find((item) => item.id === long.page);
      editor.innerHTML = renderText(page ? page.text : globalText);
      icons();
      $("#version-label").textContent = page ? "1 / 1" : "1 / 2";
      updateWordCount();
    }
    updateEnhanceLabel();
  }

  /* ---------- LoRA stack: drag the grip (or ↑/↓ on it) to reorder; the add menu inserts on click ---------- */
  const loraCatalog = {
    video: [["加速", [["MiniMax H3 PDD FL2VA · 8-step", "MiniMax H3"]]], ["镜头", [["运镜控制 · Camera Push", "MiniMax H3"], ["运镜控制 · Orbit", "MiniMax H3"]]], ["人像", [["写实人像增强", "通用"], ["Face Swap · 人物替换", "MiniMax H3"]]], ["风格", [["胶片颗粒", "通用"], ["赛博霓虹", "通用"]]]],
    image: [["加速", [["Qwen-Image-Lightning-8steps", "Qwen Image"], ["Qwen-Image-Lightning-4steps", "Qwen Image"]]], ["风格", [["胶片质感", "Qwen Image"], ["水彩插画", "Qwen Image"]]]]
  };
  const loraSets = {
    video: [{ name: "MiniMax H3 PDD FL2VA · 8-step", family: "MiniMax H3", purpose: "加速", strength: 1 }, { name: "运镜控制 · Camera Push", family: "MiniMax H3", purpose: "镜头", strength: 0.8, issue: "与 R2V 同时使用时强度建议 ≤ 0.5" }],
    image: [{ name: "Qwen-Image-Lightning-8steps", family: "Qwen Image", purpose: "加速", strength: 1 }]
  };
  const loraKey = () => state().mode === "image" ? "image" : "video";
  const loraList = $("#lora-list");
  const renderLoras = () => {
    const list = loraSets[loraKey()];
    $("#lora-caption").textContent = list.length > 1 ? "按顺序叠加" : "";
    loraList.innerHTML = list.map((lora, index) => `
      <div class="lora-row" data-drag data-index="${index}">
        <button class="grip" type="button" data-grip aria-label="拖动排序 ${lora.name}" data-tip="拖动排序 · ↑/↓">${ic("grip-vertical")}</button>
        <div class="lora-name"><strong class="ellipsis">${lora.name}<span class="info" data-tip-title="${lora.name}" data-tip="效果、叠加与兼容说明">${ic("info")}</span></strong><span class="caption">${lora.family} · ${lora.purpose}${lora.issue ? ` · <span class="warn-text">${lora.issue}</span>` : ""}</span></div>
        <div class="slider-field js-slider"><div class="range-wrap"><input type="range" min="0" max="2" step="0.05" value="${lora.strength}" aria-label="${lora.name} 强度"></div><label class="number"><input type="number" min="0" max="2" step="0.05" value="${lora.strength}" aria-label="强度"></label></div>
        <button class="btn btn-icon btn-sm" type="button" data-remove aria-label="移除 ${lora.name}" data-tip="移除">${ic("x")}</button>
      </div>`).join("");
    loraList.hidden = !list.length;
    $$("#lora-list .js-slider").forEach((field) => DS.bindSlider(field));
    renderLoraMenu();
    icons();
  };
  const syncLoraOrder = () => {
    const list = loraSets[loraKey()];
    const next = $$(".lora-row", loraList).map((row) => list[Number(row.dataset.index)]);
    list.splice(0, list.length, ...next);
    $$(".lora-row", loraList).forEach((row, index) => { row.dataset.index = String(index); });
  };
  const renderLoraMenu = () => {
    const query = $("#lora-search").value.trim().toLowerCase();
    const added = new Set(loraSets[loraKey()].map((lora) => lora.name));
    $("#lora-items").innerHTML = loraCatalog[loraKey()].map(([group, items]) => {
      const matches = items.filter(([name]) => !query || name.toLowerCase().includes(query) || group.includes(query));
      return matches.length ? `<div class="menu-heading">${group}</div>${matches.map(([name, family]) => `<button class="menu-item" type="button" data-add-lora="${name}" data-family="${family}" data-purpose="${group}" ${added.has(name) ? "disabled" : ""}>${ic(added.has(name) ? "check" : "plus")}<span class="ellipsis">${name}</span><span class="hint">${family}</span></button>`).join("")}` : "";
    }).join("") || '<div class="menu-heading">没有匹配的 LoRA</div>';
    icons();
  };
  $("#lora-search").addEventListener("input", renderLoraMenu);
  $("#lora-items").addEventListener("click", (event) => {
    const item = event.target.closest("[data-add-lora]");
    if (!item || item.disabled) return;
    loraSets[loraKey()].push({ name: item.dataset.addLora, family: item.dataset.family, purpose: item.dataset.purpose, strength: 0.8 });
    renderLoras();
    DS.animateIn(loraList.lastElementChild);
  });
  loraList.addEventListener("click", (event) => {
    if (!event.target.closest("[data-remove]")) return;
    const row = event.target.closest(".lora-row");
    loraSets[loraKey()].splice(Number(row.dataset.index), 1);
    DS.animateOut(row).then(renderLoras);
  });
  // Same list-relative drag as the queue page: the row follows the pointer vertically only.
  loraList.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-grip]");
    const item = handle?.closest("[data-drag]");
    if (!item || event.button !== 0) return;
    event.preventDefault();
    const listBox = loraList.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const top = (clientY) => Math.max(-6, Math.min(listBox.height - rect.height + 6, clientY - offsetY - loraList.getBoundingClientRect().top));
    const placeholder = Object.assign(document.createElement("div"), { className: "lora-placeholder" });
    placeholder.style.height = `${rect.height}px`;
    item.after(placeholder);
    Object.assign(item.style, { left: "0", width: `${rect.width}px`, top: `${rect.top - listBox.top}px` });
    item.classList.add("dragging");
    if (!DS.reducedMotion()) item.animate([{ scale: 1 }, { scale: 1.02 }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    const siblings = () => $$("[data-drag]", loraList).filter((child) => child !== item);
    const move = (moveEvent) => {
      item.style.top = `${top(moveEvent.clientY)}px`;
      const target = siblings().find((child) => { const box = child.getBoundingClientRect(); return moveEvent.clientY < box.top + box.height / 2; });
      if ((target && placeholder.nextElementSibling === target) || (!target && placeholder === loraList.lastElementChild)) return;
      const animation = DS.flip(siblings);
      if (target) loraList.insertBefore(placeholder, target); else loraList.append(placeholder);
      animation.play();
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      item.getAnimations().forEach((animation) => animation.cancel());
      if (!DS.reducedMotion()) {
        const settle = item.animate([{ top: item.style.top, scale: 1.02 }, { top: `${placeholder.offsetTop}px`, scale: 1 }], { duration: 320, easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim(), fill: "forwards" }).finished;
        await Promise.race([settle, new Promise((resolve) => setTimeout(resolve, 400))]);
      }
      item.getAnimations().forEach((animation) => animation.cancel());
      item.removeAttribute("style");
      item.classList.remove("dragging");
      placeholder.replaceWith(item);
      syncLoraOrder();
      handle.focus({ preventScroll: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
  loraList.addEventListener("keydown", (event) => {
    const handle = event.target.closest("[data-grip]");
    if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const item = handle.closest("[data-drag]");
    const animation = DS.flip(() => $$("[data-drag]", loraList));
    if (event.key === "ArrowUp" && item.previousElementSibling) item.previousElementSibling.before(item);
    else if (event.key === "ArrowDown" && item.nextElementSibling) item.nextElementSibling.after(item);
    animation.play();
    handle.focus();
    syncLoraOrder();
  });

  /* ---------- Resolution: presets on a segmented row; video exposes a custom tier, images a free slider ---------- */
  const ratioOf = (value, fallback) => { const [w, h] = (value === "source" ? fallback : value).split(":").map(Number); return w / h; };
  const bindResolution = (field, ratio, sourceShort) => {
    const seg = $("[data-res-seg]", field);
    const slider = $("[data-res-slider]", field);
    const range = $("input[type=range]", slider);
    const align = Number(field.dataset.align);
    const free = field.hasAttribute("data-free");
    const readout = () => {
      const short = Number(range.value);
      const r = ratio();
      const long = Math.round(short * Math.max(r, 1 / r) / align) * align;
      const short2 = Math.round(short / align) * align;
      $("[data-res-out]", field).textContent = r >= 1 ? `${long} × ${short2}` : `${short2} × ${long}`;
    };
    const press = (value) => {
      $$("button", seg).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === value)));
      seg.toggleAttribute("data-none", !value);
      const active = $('button[aria-pressed="true"]', seg);
      const thumb = $(".seg-thumb", seg);
      if (active && thumb) Object.assign(thumb.style, { left: `${active.offsetLeft}px`, width: `${active.offsetWidth}px` });
    };
    const setValue = (value) => { range.value = $("input[type=number]", slider).value = String(value); slider.repaint?.(); readout(); };
    seg.addEventListener("change", (event) => {
      const value = event.detail.value;
      if (!free) slider.hidden = value !== "custom";
      if (value === "custom") { if (!slider.hidden) DS.animateIn(slider); readout(); return; }
      setValue(value === "source" ? sourceShort : Number(value));
      seg.toggleAttribute("data-none", false);
    });
    slider.addEventListener("value", () => {
      readout();
      if (!free) return;
      const preset = $$("button", seg).find((button) => Number(button.dataset.value === "source" ? sourceShort : button.dataset.value) === Number(range.value));
      press(preset?.dataset.value ?? "");
    });
    field.refresh = readout;
    if (!free) setValue(720); else readout();
    return field;
  };
  const videoRes = bindResolution($("#video-res"), () => ratioOf($("#ratio").value, state().mode === "extend" ? "16:9" : "16:9"), 720);
  const imageRes = bindResolution($("#image-res"), () => ratioOf($("#image-ratio").value, "4:3"), 1200);
  $("#ratio").addEventListener("change", () => videoRes.refresh());
  $("#image-ratio").addEventListener("change", () => { imageRes.refresh(); paintSubmit(); });
  [videoRes, imageRes].forEach((field) => {
    $("[data-res-seg]", field).addEventListener("change", () => paintSubmit());
    $("[data-res-slider]", field).addEventListener("value", () => paintSubmit());
  });
  const resolutionLabel = () => {
    const pressed = $('#video-res [data-res-seg] [aria-pressed="true"]')?.dataset.value;
    return pressed === "custom" ? `${$("#video-res input[type=range]").value}p` : `${pressed ?? 720}p`;
  };

  /* ---------- Seed ---------- */
  $$("[data-seed-random]").forEach((button) => button.addEventListener("click", () => { button.closest(".input-group").querySelector("input").value = String(Math.floor(Math.random() * 2 ** 32)); }));
  $$("[data-seed-clear]").forEach((button) => button.addEventListener("click", () => { const input = button.closest(".input-group").querySelector("input"); input.value = ""; input.focus(); }));
  $("#count-field").addEventListener("value", () => paintSubmit());

  /* ---------- Submit ---------- */
  const blockReasons = { fl2va: ["请先选择首帧图片", "去添加"], r2v: ["请先补齐 R2V 参考 Slot", "去补齐"], motion: ["请先选择视频并等待读取完成", "选择视频"], boundary: ["请设置有效的视频保留范围", "去调整"], continuum: ["请先选择或拖入 output/h3-native-av 下的 Native AV safetensors 文件", "选择文件"], image: ["请先为 Slot 1（Picture 1）添加基础图片", "去添加"] };
  function paintSubmit() {
    const s = state();
    const key = s.mode === "image" ? "image" : s.mode === "extend" ? s.route : s.input;
    $("#block-text").textContent = blockReasons[key][0];
    $("#block-jump").textContent = blockReasons[key][1];
    const count = Number($("#count-field input[type=range]").value);
    let summary;
    if (s.mode === "image") {
      const model = $("#image-model").selectedOptions[0].textContent.split(" · ")[0];
      summary = s.imagekind === "cutout" ? `<b>${model}</b> · 生成 ${count} 张透明背景 PNG` : s.imagekind === "removal" ? `<b>${model}</b> · 生成 ${count} 张局部修补结果` : `<b>${model}</b> · ${count} 张 · ${$("#image-res [data-res-out]").textContent}`;
    } else {
      const model = (s.mode === "extend" ? $("#extend-model") : $("#video-model")).selectedOptions[0].textContent.replace("MiniMax ", "");
      summary = s.long === "on"
        ? `<b>${model}</b> · 创作包 · 新增 <b>${long.segments}</b> 段 · ${long.total} 秒`
        : `<b>${model}</b> · ${resolutionLabel()} · ${duration().toFixed(1)} 秒`;
    }
    $("#submit-summary").innerHTML = summary;
    const label = s.mode === "image" ? "加入队列" : s.mode === "extend" ? "加入视频续写队列" : s.input === "r2v" ? "加入 R2V 多参考生成队列" : "加入本地生成队列";
    $("#enqueue").dataset.tip = s.block === "blocked" ? blockReasons[key][0] : label;
    $("#enqueue").disabled = s.block === "blocked";
    $("#token-estimate").hidden = s.mode === "image" && s.imagekind !== "edit";
  }
  $("#block-jump").addEventListener("click", () => {
    const target = $(".create-media .media-panel:not([hidden])");
    target?.scrollIntoView({ behavior: DS.reducedMotion() ? "auto" : "smooth", block: "start" });
    target?.animate([{ boxShadow: "0 0 0 2px var(--accent)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 900 });
  });
  const enqueue = $("#enqueue");
  enqueue.addEventListener("click", () => {
    if (enqueue.getAttribute("aria-busy") === "true") return;
    enqueue.setAttribute("aria-busy", "true");
    $("[data-label]", enqueue).textContent = "加入中…";
    setTimeout(() => {
      enqueue.removeAttribute("aria-busy");
      $("[data-label]", enqueue).textContent = "加入队列";
      DS.toast(state().long === "on" && isH3Video() ? `已加入队列 · 创作包 ${long.segments} 段` : "已加入队列", { action: "查看队列", onAction: () => { location.href = "queue.html"; } });
    }, 900);
  });
  $("#clear-draft").addEventListener("click", () => {
    DS.toast("已清空草稿", { kind: "info", action: "撤销" });
  });

  /* ---------- State wiring ---------- */
  // Managed Continuum must keep Run data; the Motion Context route runs without Spectrum.
  const lockSelect = (select, locked, value, tip) => {
    if (locked) select.value = value;
    select.disabled = locked;
    const wrapper = select.closest(".select");
    wrapper?.querySelector(".select-trigger")?.toggleAttribute("disabled", locked);
    if (wrapper) { if (locked) wrapper.dataset.tip = tip; else delete wrapper.dataset.tip; }
    select.dispatchEvent(new Event("change"));
  };
  const syncLocks = () => {
    const s = state();
    lockSelect($("#latent-save"), s.long === "on" || (s.mode === "extend" && s.route === "continuum"), "all", "Continuum 必须保存 Run 数据");
    lockSelect($("#spectrum"), s.mode === "extend" && s.route === "motion", "off", "Motion Context 续写不使用 Spectrum");
  };
  const applyState = () => {
    syncVisibility();
    syncModel($("#video-model"), "input");
    syncModel($("#extend-model"), "route");
    syncModel($("#image-model"), "imagekind");
    const wantLong = state().long === "on";
    if (($("#gen-mode").value === "continuum") !== wantLong) { $("#gen-mode").value = wantLong ? "continuum" : "native"; $("#gen-mode").dispatchEvent(new Event("change")); }
    renderPictures();
    renderSlots();
    syncLocks();
    renderLoras();
    renderInserts();
    if (state().long === "on" && isH3Video()) renderTabs(); else renderScript();
    paintTime();
    updateEnhanceLabel();
  };
  document.addEventListener("proto-state", applyState);
  renderFrames();
  renderSlots();
  applyGenMode();
  applyState();
})();
