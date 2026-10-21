/* Catalog wiring. Media are gradient stand-ins; no user content is bundled. */
(() => {
  const DS = window.DS;
  const { ic, icons } = DS;
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const art = [
    "linear-gradient(120deg,#1d2b53,#7e2553,#ff004d,#ffa300)",
    "linear-gradient(140deg,#0f2027,#203a43,#2c5364,#7fb3a6)",
    "linear-gradient(110deg,#2b1055,#7597de,#d3a4c3,#2b1055)",
    "linear-gradient(130deg,#3a1c1c,#b5651d,#f2c57c,#3a1c1c)",
    "linear-gradient(120deg,#0b3d2e,#3f7d4a,#c8d96f,#0b3d2e)",
    "linear-gradient(150deg,#141e30,#243b55,#9ab3d5,#141e30)",
    "linear-gradient(135deg,#23074d,#cc5333,#f3a683)",
    "linear-gradient(160deg,#000428,#004e92,#5fa8d3)"
  ];

  /* ---------- Theme controls ---------- */
  const palette = $("#palette");
  palette.addEventListener("change", () => { root.dataset.palette = palette.value; refreshColor(); });
  $("#depth").addEventListener("change", (event) => { root.dataset.depth = event.detail.value; refreshColor(); });
  $("#accent").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    $$("#accent button").forEach((item) => item.setAttribute("aria-checked", String(item === button)));
    root.dataset.accent = button.dataset.value;
    refreshColor();
  });
  $("#reduced").addEventListener("change", (event) => { if (event.target.checked) root.dataset.motion = "reduced"; else delete root.dataset.motion; });

  const sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) $$(".tile-toc a").forEach((link) => link.setAttribute("aria-current", String(link.hash === `#${entry.target.id}`)));
  }, { rootMargin: "-35% 0px -60% 0px" });
  $$(".tile-section").forEach((section) => sectionObserver.observe(section));

  /* ---------- Color ---------- */
  function refreshColor() {
    const style = getComputedStyle(root);
    const depth = Number(root.dataset.depth);
    const roleSteps = new Set([Math.max(1, depth), depth + 1, depth + 2, depth + 3, 11, 12]);
    $("#ladder").innerHTML = Array.from({ length: 12 }, (_, index) => {
      const step = index + 1;
      const value = style.getPropertyValue(`--n${step}`).trim();
      return `<div class="swatch${roleSteps.has(step) ? " role" : ""}" style="background:${value};color:${step >= 9 ? "#111" : "#eee"}"><strong>${step}</strong><span>${value}</span></div>`;
    }).join("");
    const probe = document.body.appendChild(document.createElement("span"));
    const resolve = (token) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
    const canvas = resolve("--canvas"), surface = resolve("--surface-1");
    const grade = (ratio) => `${ratio.toFixed(1)} ${ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "大字" : "—"}`;
    $("#contrast").innerHTML = `<tr><td class="caption">文字</td><td class="caption">画布上</td><td class="caption">表面上</td></tr>` +
      [["文字 1", "--text-1"], ["文字 2", "--text-2"], ["文字 3", "--text-3"], ["禁用", "--text-4"], ["主题色文字", "--accent-text"]].map(([label, token]) => {
        const color = resolve(token);
        return `<tr><td style="color:${color}">${label}</td><td class="num">${grade(DS.contrast(color, canvas))}</td><td class="num">${grade(DS.contrast(color, surface))}</td></tr>`;
      }).join("") +
      (() => { probe.style.color = "var(--on-accent)"; const on = getComputedStyle(probe).color; probe.style.color = "var(--accent)"; const bg = getComputedStyle(probe).color; return `<tr><td>主按钮文字</td><td class="num" colspan="2">${grade(DS.contrast(on, bg))}</td></tr>`; })();
    probe.remove();
  }

  /* ---------- Icons ---------- */
  const iconSet = ["list-plus", "play", "pause", "square", "sparkles", "wand-sparkles", "film", "clapperboard", "image", "images", "image-plus", "layers", "list-video", "list-filter", "tags", "heart", "star", "folder-open", "download", "external-link", "copy", "trash-2", "rotate-ccw", "refresh-cw", "scan-search", "settings-2", "sliders-horizontal", "dices", "lock", "scaling", "puzzle", "server", "gauge", "circle-check", "circle-alert", "triangle-alert", "info", "grip-vertical", "ellipsis", "x"];
  $("#icon-grid").innerHTML = iconSet.map((name) => `<div>${ic(name)}<span>${name}</span></div>`).join("");

  /* ---------- Inputs ---------- */
  $$("select").forEach((select) => DS.enhanceSelect(select));
  $$(".seg").forEach((seg) => DS.bindSegmented(seg));
  $$(".js-slider").forEach((field) => DS.bindSlider(field));
  $("#dur-field").addEventListener("value", (event) => { $("#dur-readout").textContent = `${event.detail.toFixed(1)} 秒`; });
  $("#indeterminate").indeterminate = true;
  $$(".chip").forEach((chip) => chip.addEventListener("click", () => {
    if (chip.closest("#tag-suggest")) return;
    chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
  }));
  $("#seed-random").addEventListener("click", () => { $("#seed").value = String(Math.floor(Math.random() * 2 ** 32)); });
  $("#seed-clear").addEventListener("click", () => { $("#seed").value = ""; $("#seed").focus(); });
  $("#busy-demo").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-busy", "true");
    setTimeout(() => { button.removeAttribute("aria-busy"); DS.toast("已加入队列", { action: "查看" }); }, 1400);
  });
  {
    // Install demo: preparing (indeterminate) -> download/install progress -> installed; click while running cancels.
    const button = $("#install-demo");
    const more = button.closest(".split").querySelector(".btn-more");
    const control = DS.progressButton(button, { labels: ["准备中", "下载 100%", "安装 100%", "已安装"] });
    let timer = 0;
    const stop = () => { clearTimeout(timer); more.disabled = false; };
    button.addEventListener("click", () => {
      if (control.active) { stop(); control.reset(); DS.toast("已取消安装", { kind: "info" }); return; }
      if (button.hasAttribute("data-done")) return;
      more.disabled = true;
      control.set(null);
      let value = 0;
      const step = () => {
        value = Math.min(100, value + 4 + Math.random() * 9);
        control.set(value, value < 70 ? `下载 ${Math.round(value)}%` : `安装 ${Math.round(value)}%`);
        if (value < 100) timer = setTimeout(step, 260);
        else timer = setTimeout(() => {
          stop();
          control.done("已安装");
          timer = setTimeout(() => control.reset(), 2600);
        }, 320);
      };
      timer = setTimeout(step, 900);
    });
  }

  const trim = $("#trim");
  const [trimStart, trimEnd] = $$("input", trim);
  const paintTrim = () => {
    if (Number(trimStart.value) > Number(trimEnd.value) - 0.5) trimStart.value = String(Number(trimEnd.value) - 0.5);
    trim.style.setProperty("--a", `${trimStart.value * 10}%`);
    trim.style.setProperty("--b", `${trimEnd.value * 10}%`);
    const fmt = (value) => `0:${Number(value).toFixed(1).padStart(4, "0")}`;
    $("#trim-readout").textContent = `${fmt(trimStart.value)} – ${fmt(trimEnd.value)}`;
  };
  trimStart.addEventListener("input", paintTrim);
  trimEnd.addEventListener("input", paintTrim);
  paintTrim();

  /* ---------- Prompt editor: reference chips, runtime warm-up, enhance progress, word count ---------- */
  const references = {
    "Picture 1": { art: art[1], label: "参考 1 · 人物 / 主体" },
    "Picture 2": { art: art[2], label: "参考 2 · 场景 / 环境" },
    "Video 1": { art: art[0], label: "参考 3 · 动作 / 姿态", video: true }
  };
  const editor = $("#rich-prompt");
  let lastCaret = null;
  const chipHtml = (name) => {
    const ref = references[name];
    if (!ref) return `<span class="ref-chip missing" contenteditable="false" data-ref="${name}" data-tip-title="${name} 不存在" data-tip="没有对应的参考位，入队前需添加或删除此标签"><span class="thumb">${ic("circle-alert")}</span>${name}</span>`;
    return `<span class="ref-chip${ref.video ? " video" : ""}" contenteditable="false" data-ref="${name}" data-peek="${ref.art}" data-tip-title="&lt;${name}&gt;" data-tip="${ref.label}"><span class="thumb" style="background-image:${ref.art}"></span>${name}</span>`;
  };
  const tokenPattern = /<(Picture|Video) (\d+)>/g;
  const renderEditorText = (text) => text.replace(/&/g, "&amp;").replace(tokenPattern, (_, kind, number) => `\u0001${kind} ${number}\u0002`).replace(/</g, "&lt;").replace(/\u0001([^\u0002]+)\u0002/g, (_, name) => chipHtml(name));
  editor.innerHTML = renderEditorText("<Picture 1> 中的女孩站在 <Picture 2> 的雨夜街道上，镜头缓慢推进。她按照 <Video 1> 的节奏转身，停在路灯下抬头看向窗户。结尾 <Picture 3> 的招牌亮起。");
  icons();
  const plainText = () => [...editor.childNodes].map((node) => node.nodeType === 3 ? node.textContent : node.dataset?.ref ? `<${node.dataset.ref}>` : node.textContent).join("");
  const updateWordCount = () => {
    const text = plainText().replace(tokenPattern, "x");
    const count = (text.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) ?? []).length;
    const [min, max] = [60, 180];
    $("#word-count").className = `word-count num${count > max ? " over" : ""}`;
    $("#word-count").innerHTML = `当前 <b>${count}</b> 词 · 参考范围 ${min}–${max} 词`;
  };
  // Typing a full token converts it into a chip in place.
  editor.addEventListener("input", () => {
    const selection = getSelection();
    const node = selection.anchorNode;
    if (node?.nodeType === 3 && /<(Picture|Video) \d+>/.test(node.textContent)) {
      const match = node.textContent.match(/<(Picture|Video) (\d+)>/);
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      range.deleteContents();
      const holder = document.createElement("span");
      holder.innerHTML = chipHtml(`${match[1]} ${match[2]}`);
      const chip = holder.firstElementChild;
      range.insertNode(chip);
      icons();
      DS.animateIn(chip);
      selection.collapse(chip.nextSibling ?? editor, chip.nextSibling ? 0 : editor.childNodes.length);
    }
    updateWordCount();
  });
  const insertAtCaret = (text) => {
    const selection = getSelection();
    if (lastCaret && document.activeElement !== editor) { selection.removeAllRanges(); selection.addRange(lastCaret); }
    editor.focus();
    if (!editor.contains(selection.anchorNode)) selection.collapse(editor, editor.childNodes.length);
    const range = selection.getRangeAt(0);
    const holder = document.createElement("span");
    holder.innerHTML = renderEditorText(text);
    const nodes = [...holder.childNodes];
    const fragment = document.createDocumentFragment();
    fragment.append(...nodes);
    range.deleteContents();
    range.insertNode(fragment);
    const last = nodes.at(-1);
    if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); lastCaret = range.cloneRange(); }
    icons();
    nodes.filter((child) => child.classList?.contains("ref-chip")).forEach((chip) => DS.animateIn(chip));
    updateWordCount();
  };
  updateWordCount();
  const inserts = [
    ["镜头", [["推镜", "镜头缓慢推近"], ["拉远", "镜头缓慢拉远"], ["环绕", "镜头环绕主体"], ["手持", "轻微手持晃动"]]],
    ["参考", [["Picture 1", "<Picture 1>"], ["Picture 2", "<Picture 2>"], ["Video 1", "<Video 1>"]]],
    ["节奏", [["慢动作", "以慢动作呈现"], ["定格收尾", "结尾停留一秒"]]]
  ];
  const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const renderInserts = (query = "") => {
    $("#insert-items").innerHTML = inserts.map(([group, items]) => {
      const matches = items.filter(([label, text]) => !query || label.includes(query) || text.includes(query));
      return matches.length ? `<div class="menu-heading">${group}</div>${matches.map(([label, text]) => `<button class="menu-item" type="button" data-insert="${escapeAttr(text)}">${ic("plus")}${label}<span class="hint">${escapeAttr(text)}</span></button>`).join("")}` : "";
    }).join("") || '<div class="menu-heading">没有匹配的写法</div>';
    icons();
  };
  renderInserts();
  $("#insert-search").addEventListener("input", (event) => renderInserts(event.target.value.trim()));
  // Menu stays open so several snippets can be combined; Esc or clicking outside closes it.
  $("#insert-menu").addEventListener("click", (event) => {
    const item = event.target.closest("[data-insert]");
    if (!item) return;
    insertAtCaret(item.dataset.insert);
    item.animate([{ background: "var(--accent-soft)" }, { background: "transparent" }], { duration: 500 });
  });
  editor.addEventListener("blur", () => { const selection = getSelection(); if (editor.contains(selection.anchorNode)) lastCaret = selection.getRangeAt(0).cloneRange(); });

  const runtime = $("#runtime-btn");
  const runtimeStates = {
    idle: ["play", "预热提示词模型", "Qwen3-VL 4B Instruct · 未加载\n点击预热并常驻显存（约 9 GB），之后优化更快"],
    warming: ["refresh-cw", "正在加载提示词模型", "Qwen3-VL 4B Instruct · 加载中\n完成后保持常驻"],
    resident: ["square", "卸载提示词模型", "Qwen3-VL 4B Instruct · 已常驻 · 占用 8.7 GB\n点击卸载，释放显存给视频生成"]
  };
  const setRuntime = (state) => {
    runtime.dataset.state = state;
    runtime.setAttribute("aria-busy", String(state === "warming"));
    runtime.setAttribute("aria-label", runtimeStates[state][1]);
    runtime.dataset.tipTitle = runtimeStates[state][1];
    runtime.dataset.tip = runtimeStates[state][2];
    runtime.innerHTML = ic(runtimeStates[state][0]);
    icons();
  };
  setRuntime("idle");
  const enhanceButton = $("#enhance-demo");
  const enhanceIdleTip = () => {
    enhanceButton.dataset.tipTitle = "优化提示词";
    enhanceButton.dataset.tip = `${$("#preset").selectedOptions[0].textContent} · Qwen3-VL 4B Instruct\n参考 3 个素材 · 生成新版本，可撤销`;
  };
  enhanceIdleTip();
  $("#preset").addEventListener("change", enhanceIdleTip);
  runtime.addEventListener("click", () => {
    if (runtime.dataset.state === "idle") { setRuntime("warming"); setTimeout(() => { setRuntime("resident"); DS.toast("提示词模型已就绪", { kind: "info", icon: "cpu" }); }, 1600); }
    else if (runtime.dataset.state === "resident") { setRuntime("idle"); DS.toast("已卸载提示词模型", { kind: "info", icon: "cpu" }); }
  });
  let enhanceTimer = 0;
  const enhanceControl = DS.progressButton(enhanceButton, { labels: ["准备中", "88.8 秒"] });
  $("#enhance-demo").addEventListener("click", () => {
    const button = enhanceButton;
    const stop = () => { clearInterval(enhanceTimer); enhanceControl.reset(); enhanceIdleTip(); };
    if (enhanceControl.active) { stop(); DS.toast("已取消优化", { kind: "warning" }); return; }
    if (runtime.dataset.state === "idle") setRuntime("resident");
    enhanceControl.set(null);
    const start = performance.now();
    enhanceTimer = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const percent = Math.min(100, elapsed * 22);
      enhanceControl.set(percent, `${elapsed.toFixed(1)} 秒`);
      button.dataset.tipTitle = "正在优化";
      button.dataset.tip = `已用 ${elapsed.toFixed(1)} 秒 · ${Math.round(percent)}%\n点击取消`;
      if (elapsed > 4.6) { stop(); DS.toast("已生成版本 3 · 可撤销", { action: "撤销", icon: "sparkles" }); }
    }, 100);
  });

  /* ---------- Media input: FL2VA / R2V / image edit ---------- */
  $("#media-mode").addEventListener("change", (event) => {
    $$(".media-panel").forEach((panel) => { panel.hidden = panel.dataset.media !== event.detail.value; if (!panel.hidden) DS.animateIn(panel); });
  });
  const toggleEnd = $("#toggle-end");
  toggleEnd.addEventListener("click", () => {
    const grid = $("#frame-grid");
    const end = $('[data-frame="end"]', grid);
    if (end) { DS.animateOut(end).then(() => grid.classList.remove("paired")); toggleEnd.innerHTML = `${ic("images")}添加尾帧`; }
    else {
      grid.classList.add("paired");
      grid.insertAdjacentHTML("beforeend", `<div class="frame lit" data-frame="end" style="--ratio:9 / 16;--r:.5625"><div class="frame-media" style="background:${art[2]}"></div><span class="chip-media frame-res num">720 × 1280</span><span class="frame-hint">点击或拖入替换</span><span class="frame-label">尾帧</span><button class="btn btn-gray btn-sm frame-clear" type="button">${ic("x")}清除</button></div>`);
      DS.animateIn(grid.lastElementChild);
      toggleEnd.innerHTML = `${ic("x")}移除尾帧`;
    }
    icons();
  });

  const roleOptions = ["人物 / 主体", "场景 / 环境", "风格 / 服装", "动作 / 姿态", "镜头 / 构图", "声音关联", "关键画面", "其它参考"];
  const r2vSlots = [
    { type: "image", role: 0, note: "女孩，红色雨衣", art: art[1], size: "1024 × 1536", ratio: [2, 3] },
    { type: "image", role: 1, note: "", art: art[2], size: "1920 × 1080", ratio: [16, 9] },
    { type: "video", role: 3, note: "转身的节奏", art: art[0], ratio: [16, 9] },
    { type: "image", role: 0, note: "", art: null }
  ];
  const renderR2v = () => {
    const ordinals = { image: 0, video: 0 };
    $("#r2v-grid").innerHTML = r2vSlots.map((slot, index) => {
      const ordinal = ++ordinals[slot.type];
      const tag = `${slot.type === "video" ? "Video" : "Picture"} ${ordinal}`;
      return `<article class="r2v-slot lit" data-slot="${index}">
        <div class="r2v-head"><div><strong>参考 ${index + 1}</strong><span class="caption num">&lt;${tag}&gt; · ${slot.type === "video" ? "视频" : "图片"}${slot.size ? ` · ${slot.size}` : ""}</span></div>
          <div class="r2v-actions"><select data-size="sm" data-slot-type aria-label="参考 ${index + 1} 类型"><option value="image" ${slot.type === "image" ? "selected" : ""}>图片</option><option value="video" ${slot.type === "video" ? "selected" : ""}>视频</option></select><button class="btn btn-icon btn-sm" type="button" data-insert-tag="${tag}" data-tip="插入 &lt;${tag}&gt; 到提示词" aria-label="插入标签">${ic("text-cursor-input")}</button><button class="btn btn-icon btn-sm" type="button" data-remove-slot data-tip="移除参考位" aria-label="移除参考位">${ic("x")}</button></div></div>
        ${slot.art
          ? `<div class="r2v-media" style="background-image:${slot.art};--ratio:${slot.ratio[0]} / ${slot.ratio[1]};--r:${slot.ratio[0] / slot.ratio[1]}">${slot.type === "video" ? `<span class="play">${ic("play")}</span>` : ""}<button class="clear" type="button" aria-label="删除${slot.type === "video" ? "视频" : "图片"}">${ic("x")}</button></div>`
          : `<button class="r2v-media empty" type="button">${ic(slot.type === "video" ? "video" : "image-plus")}<span class="caption">${slot.type === "video" ? "添加参考视频 · MP4、MOV、WEBM、MKV" : "添加参考图片 · PNG、JPG、WEBP"}</span></button>`}
        <div class="r2v-fields"><select data-size="sm" aria-label="参考作用">${roleOptions.map((role, roleIndex) => `<option ${roleIndex === slot.role ? "selected" : ""}>${role}</option>`).join("")}</select><input class="input" value="${slot.note}" placeholder="备注（可选），例如：只参考服装" aria-label="备注"></div>
      </article>`;
    }).join("");
    $$("#r2v-grid select").forEach((select) => DS.enhanceSelect(select));
    $("#r2v-count").textContent = `${r2vSlots.length}/12`;
    $("#r2v-summary").textContent = `${r2vSlots.filter((slot) => slot.type === "image").length} 张图片 · ${r2vSlots.filter((slot) => slot.type === "video").length} 段视频`;
    icons();
  };
  renderR2v();
  $("#r2v-grid").addEventListener("click", (event) => {
    const insert = event.target.closest("[data-insert-tag]");
    if (insert) { insertAtCaret(`<${insert.dataset.insertTag}>`); $("#prompt").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const remove = event.target.closest("[data-remove-slot]");
    if (remove) { const card = remove.closest(".r2v-slot"); r2vSlots.splice(Number(card.dataset.slot), 1); DS.animateOut(card).then(renderR2v); }
  });
  $("#r2v-grid").addEventListener("change", (event) => {
    if (!event.target.matches("[data-slot-type]")) return;
    const slot = r2vSlots[Number(event.target.closest(".r2v-slot").dataset.slot)];
    slot.type = event.target.value;
    slot.art = null;
    slot.size = "";
    renderR2v();
  });
  $("#add-r2v").addEventListener("click", () => { if (r2vSlots.length >= 12) return; r2vSlots.push({ type: "image", role: 0, note: "", art: null }); renderR2v(); DS.animateIn($("#r2v-grid").lastElementChild); });

  const pictures = [
    { n: 1, art: art[1], ratio: "4 / 3", r: 4 / 3, file: "reference-city.png", base: true, crop: "1600 × 1200", marked: 2 },
    { n: 2, art: art[6], ratio: "3 / 4", r: 3 / 4, file: "neon-sign.jpg", role: "物体", mask: 1 }
  ];
  $("#picture-list").innerHTML = pictures.map((picture) => `
    <article class="picture-card lit${picture.base ? " base" : ""}">
      <div class="picture-preview" style="--ratio:${picture.ratio};--r:${picture.r};background-image:${picture.art}" role="button" tabindex="0" aria-label="替换图片 ${picture.n}">${picture.marked ? '<span class="mk" style="left:18%;top:22%;width:26%;height:30%"></span><span class="mk" style="left:58%;top:48%;width:20%;height:26%;border-radius:50%"></span>' : ""}</div>
      <div class="picture-body">
        <div class="picture-title"><strong>图片 ${picture.n}</strong><code>Picture ${picture.n}</code><span class="badge plain">${picture.base ? "基础画面" : "参考"}</span>${picture.crop ? `<span class="badge success">${ic("crop")}裁剪 · ${picture.crop}</span>` : ""}${picture.marked ? `<span class="badge success">${ic("pencil")}已标记 ${picture.marked} 处</span>` : ""}${picture.mask ? `<span class="badge success">${ic("brush")}Mask · ${picture.mask}</span>` : ""}</div>
        <code class="ellipsis">${picture.file}</code>
        <div class="field"><label>参考作用</label><select data-size="sm" ${picture.base ? "disabled" : ""}><option ${picture.base ? "selected" : ""}>基础画面</option><option>人物</option><option ${picture.role === "物体" ? "selected" : ""}>物体</option><option>姿态</option><option>风格</option><option>背景</option><option>自动</option></select></div>
      </div>
      <div class="picture-tools"><button class="btn btn-icon btn-sm" type="button" data-open-markup="${picture.n}" data-tip="标记图片" aria-label="标记 Picture ${picture.n}">${ic("pencil")}</button><button class="btn btn-icon btn-sm" type="button" data-open-markup="${picture.n}" data-mask data-tip="${picture.mask ? "修改 Mask" : "绘制 Mask"}" aria-label="绘制 Mask">${ic("brush")}</button><button class="btn btn-icon btn-sm btn-destructive" type="button" data-tip="删除图片 ${picture.n}" aria-label="删除图片 ${picture.n}">${ic("trash-2")}</button></div>
    </article>`).join("");
  $$("#picture-list select").forEach((select) => DS.enhanceSelect(select));
  const overlay = $("#markup-overlay");
  $("#picture-list").addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-markup]");
    if (!open) return;
    $("#markup-title").textContent = open.hasAttribute("data-mask") ? "绘制移除区域" : `标记 Picture ${open.dataset.openMarkup}`;
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.setAttribute("data-open", ""));
  });
  overlay.addEventListener("click", (event) => {
    const tool = event.target.closest("[data-tool]");
    if (tool) $$("[data-tool]", overlay).forEach((button) => button.setAttribute("aria-pressed", String(button === tool)));
    const swatch = event.target.closest(".swatch-row button");
    if (swatch) $$(".swatch-row button", overlay).forEach((button) => button.setAttribute("aria-pressed", String(button === swatch)));
    if (event.target.closest("[data-markup-close]")) { overlay.removeAttribute("data-open"); setTimeout(() => { overlay.hidden = true; }, 160); }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) overlay.querySelector("[data-markup-close]").click(); });

  /* ---------- LoRA stack ---------- */
  const loras = [["运镜控制 · Camera Push", "H3 专属", 0.8], ["写实人像增强", "通用", 0.6, "与 Ref2VA 同时使用时强度建议 ≤ 0.5"], ["胶片颗粒", "通用", 0.35]];
  $("#lora-stack").innerHTML = loras.map(([name, scope, strength, issue], index) => `
    <div class="lora-row" data-drag>
      <span class="grip">${ic("grip-vertical")}</span>
      <div class="lora-name"><strong class="ellipsis">${name}<span data-tip="效果、叠加与兼容说明">${ic("info")}</span></strong><span class="caption">${scope}${issue ? ` · <span style="color:var(--warning)">${issue}</span>` : ""}</span></div>
      <div class="slider-field js-slider"><div class="range-wrap"><input type="range" min="0" max="2" step="0.05" value="${strength}" aria-label="${name} 强度"></div><label class="number"><input type="number" min="0" max="2" step="0.05" value="${strength}" aria-label="强度"></label></div>
      <button class="btn btn-icon btn-sm" type="button" aria-label="移除" data-remove-lora>${ic("x")}</button>
    </div>`).join("") + `<div class="lora-foot"><button class="btn btn-gray btn-sm" type="button">${ic("plus")}添加 LoRA</button><span class="caption">按顺序叠加 · 已选 3 / 4</span></div>`;
  $$("#lora-stack .js-slider").forEach((field) => DS.bindSlider(field));
  $("#lora-stack").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-lora]"); if (button) DS.animateOut(button.closest(".lora-row")); });

  /* ---------- Overlays ---------- */
  DS.bindMenus();
  $$("[data-close-menu]").forEach((button) => button.addEventListener("click", () => button.closest(".menu").removeAttribute("data-open")));
  $$(".menu").forEach((menu) => menu.addEventListener("click", (event) => { if (!event.target.closest(".menu-item, [data-close-menu]") || menu.closest("#insert-menu")) event.stopPropagation(); }));
  $("#open-confirm").addEventListener("click", () => DS.openDialog($("#confirm-dialog")));
  $("#open-guide").addEventListener("click", () => DS.openDialog($("#guide-dialog")));
  $("#toast-success").addEventListener("click", () => DS.toast("环境扫描完成 · 23 个组件就绪"));
  $("#toast-warning").addEventListener("click", () => DS.toast("2 个节点需要更新", { kind: "warning", action: "查看" }));
  document.addEventListener("click", (event) => {
    const copy = event.target.closest(".js-copy");
    if (!copy) return;
    navigator.clipboard?.writeText(copy.previousElementSibling.textContent);
    copy.innerHTML = ic("check");
    icons();
    setTimeout(() => { copy.innerHTML = ic("copy"); icons(); }, 1200);
  });

  /* ---------- Rating ---------- */
  function renderRating(host) {
    const value = Number(host.dataset.value);
    host.innerHTML = Array.from({ length: 5 }, (_, index) => {
      const fill = Math.max(0, Math.min(1, value - index)) * 100;
      return `<button type="button" aria-label="${index + 1} 星" data-star="${index}"><i data-lucide="star"></i><span class="star-fill" style="--w:${fill}%">${ic("star")}</span></button>`;
    }).join("");
    icons();
  }
  $$(".js-rating").forEach((host) => {
    renderRating(host);
    host.addEventListener("click", (event) => {
      const star = event.target.closest("[data-star]");
      if (!star) return;
      const rect = star.getBoundingClientRect();
      const half = event.clientX - rect.left < rect.width / 2 ? 0.5 : 1;
      host.dataset.value = String(Number(star.dataset.star) + half);
      renderRating(host);
      if (host.dataset.clearable !== undefined) $("#rating-value").textContent = host.dataset.value;
    });
  });

  /* ---------- History (same layout rules as src/renderer/pages/history/helpers.ts) ---------- */
  const masonryColumns = (width, gap = 10) => {
    if (width <= 480) return 1;
    let columns = 3;
    const cardWidth = (count) => (width - gap * (count - 1)) / count;
    while (columns < 5 && cardWidth(columns) > 520) columns += 1;
    while (columns > 2 && cardWidth(columns) < 300) columns -= 1;
    return columns;
  };
  const albumColumns = (width, gap = 8) => {
    let columns = Math.max(1, Math.floor((width + gap) / (240 + gap)));
    const cardWidth = (count) => (width - gap * (count - 1)) / count;
    while (cardWidth(columns) > 240) columns += 1;
    while (columns > 1 && cardWidth(columns) < 180) columns -= 1;
    return columns;
  };
  const records = [
    { title: "Continue the same continuous shot as she turns toward the window", model: "MiniMax H3 Continuum", res: "360p", duration: "01:20", ratio: "16 / 9", file: "MINIMAX-H3-CONTINUUM-360p-30s-20261019-140052.mp4", time: "2026-10-19 14:00:52", render: "7分48秒", rating: 4, fav: true },
    { title: "Continue the adult woman and river", model: "MiniMax H3 R2V", res: "360p", duration: "00:50", ratio: "16 / 9", file: "H3-R2V-360p-30s-20261019-135028.mp4", time: "2026-10-19 13:50:28", render: "7分57秒" },
    { title: "人物特写 · 竖屏", model: "MiniMax H3 FL2VA", res: "720p", duration: "00:08", ratio: "9 / 16", file: "H3-720p-8s-20261019-130122.mp4", time: "2026-10-19 13:01:22", render: "3分12秒", rating: 3.5 },
    { title: "The subject maintains the same pose", model: "MiniMax H3 Continuum", res: "480p", duration: "00:12", ratio: "16 / 9", file: "MINIMAX-H3-CONTINUUM-480p-4s-20261008-072819.mp4", time: "2026-10-08 07:28:19", render: "1分22秒" },
    { title: "The pilot jump off the helicopter", model: "MiniMax H3 FL2VA", res: "480p", duration: "00:10", ratio: "4 / 3", file: "H3-480p-10s-20260921-172924.mp4", time: "2026-09-21 17:32:10", render: "2分37秒", fav: true },
    { title: "城市夜景航拍", model: "MiniMax H3 FL2VA", res: "720p", duration: "00:05", ratio: "16 / 9", file: "H3-720p-5s-20260920-221455.mp4", time: "2026-09-20 22:14:55", render: "1分58秒", rating: 5 },
    { title: "霓虹倒影", model: "MiniMax H3 R2V", res: "480p", duration: "00:06", ratio: "9 / 16", file: "H3-R2V-480p-6s-20260918-101010.mp4", time: "2026-09-18 10:10:10", render: "1分40秒" },
    { title: "One continuous realistic cinematic shot", model: "MiniMax H3 Continuum", res: "360p", duration: "00:31", ratio: "16 / 9", file: "H3-360p-30s-20261019-123916.mp4", time: "2026-10-19 12:46:56", render: "7分20秒" }
  ];
  const gallery = $("#history-grid");
  const cardMarkup = (record, index) => `
    <article class="h-card lit" data-index="${index}" tabindex="0" role="button" aria-label="${record.title}，打开详情">
      <div class="h-media" style="--ratio:${record.ratio}">
        <div class="art" style="background-image:${art[index % art.length]}"></div>
        <label class="check h-batch" hidden><input type="checkbox" aria-label="选择"></label>
        <div class="h-badges"><span class="chip-media model">${record.model}</span><span class="chip-media">${record.res}</span><span class="chip-media num">${record.duration}</span></div>
        <div class="h-curation">${record.rating ? `<span class="chip-media">${record.rating} ★</span>` : ""}${record.fav ? `<span class="chip-media fav">${ic("heart")}</span>` : ""}</div>
        <span class="chip-media h-preview-state">${ic("play")}预览中</span>
        <button type="button" class="h-progress" role="slider" aria-label="调整预览位置" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></button>
      </div>
      <div class="h-copy">
        <span class="h-title${record.title.length > 24 ? " long" : ""}" data-tip="${record.file}" data-tip-title="${record.title}"><span>${record.title}</span></span>
        <span class="h-meta"><span>${record.time}</span><span>渲染 ${record.render}</span></span>
        <span class="menu-anchor h-more"><button class="btn btn-icon btn-sm" type="button" data-menu-trigger aria-expanded="false" aria-label="快捷操作">${ic("ellipsis")}</button>
          <div class="menu right" role="menu"><div class="menu-heading h-menu-file">${record.file}</div><button class="menu-item" type="button">${ic("maximize-2")}查看详情</button><button class="menu-item" type="button">${ic("copy")}复制文件</button><button class="menu-item" type="button">${ic("link")}复制路径</button><button class="menu-item" type="button">${ic("folder-open")}打开所在文件夹</button><button class="menu-item" type="button">${ic("wand-sparkles")}继续创作</button><div class="menu-sep"></div><button class="menu-item destructive" type="button">${ic("trash-2")}删除</button></div></span>
      </div>
    </article>`;
  const cards = records.map(cardMarkup);
  let historyLayout = "masonry";
  function layoutHistory() {
    const width = gallery.clientWidth;
    const scroll = window.scrollY;
    const animation = DS.flip(() => $$(".h-card", gallery));
    const existing = new Map($$(".h-card", gallery).map((card) => [card.dataset.index, card]));
    const nodes = records.map((_, index) => existing.get(String(index)) ?? Object.assign(document.createElement("template"), { innerHTML: cards[index].trim() }).content.firstElementChild);
    gallery.className = `history-gallery ${historyLayout} lit-group${gallery.classList.contains("batching") ? " batching" : ""}`;
    if (historyLayout === "album") {
      gallery.style.setProperty("--cols", String(albumColumns(width)));
      gallery.replaceChildren(...nodes);
    } else {
      const count = masonryColumns(width);
      const columnWidth = (width - 10 * (count - 1)) / count;
      const heights = Array(count).fill(0);
      const columns = Array.from({ length: count }, () => Object.assign(document.createElement("div"), { className: "col" }));
      records.forEach((record, index) => {
        const [w, h] = record.ratio.split("/").map(Number);
        const shortest = heights.indexOf(Math.min(...heights));
        heights[shortest] += columnWidth * (h / w) + 66 + 10;
        columns[shortest].append(nodes[index]);
      });
      gallery.replaceChildren(...columns);
    }
    icons();
    window.scrollTo({ top: scroll });
    animation.play();
  }
  layoutHistory();
  let lastGalleryWidth = gallery.clientWidth;
  new ResizeObserver(() => { if (gallery.clientWidth !== lastGalleryWidth) { lastGalleryWidth = gallery.clientWidth; layoutHistory(); } }).observe(gallery);
  $("#history-layout").addEventListener("change", (event) => { historyLayout = $$("#history-layout button")[1].getAttribute("aria-pressed") === "true" ? "album" : "masonry"; layoutHistory(); });
  gallery.addEventListener("pointermove", (event) => {
    const title = event.target.closest(".h-card")?.querySelector(".h-title.long");
    if (title) title.style.setProperty("--shift", `-${Math.max(0, title.firstElementChild.scrollWidth - title.clientWidth + 8)}px`);
  });
  $("#filter-tags").addEventListener("click", (event) => {
    const tag = event.target.closest(".ftag");
    if (!tag) return;
    const mode = $("#tag-mode button[aria-pressed='true']").dataset.value;
    if (tag.dataset.state === mode) delete tag.dataset.state; else tag.dataset.state = mode;
  });
  const setBatch = (on) => {
    $("#batch-toggle").checked = on;
    $("#batch-bar").hidden = !on;
    gallery.classList.toggle("batching", on);
    $$(".h-batch", gallery).forEach((label) => { label.hidden = !on; label.querySelector("input").checked = false; });
    $$(".h-card.selected", gallery).forEach((card) => card.classList.remove("selected"));
    updateBatch();
  };
  const updateBatch = () => {
    const count = $$(".h-card.selected", gallery).length;
    $("#batch-count").textContent = `已选 ${count} / ${records.length}`;
    $("#batch-all").innerHTML = `${ic(count === records.length ? "square-check" : "square")}全选`;
    icons();
  };
  $("#batch-toggle").addEventListener("change", (event) => setBatch(event.target.checked));
  $("#batch-exit").addEventListener("click", () => setBatch(false));
  $("#batch-all").addEventListener("click", () => {
    const all = $$(".h-card.selected", gallery).length !== records.length;
    $$(".h-card", gallery).forEach((card) => { card.classList.toggle("selected", all); card.querySelector(".h-batch input").checked = all; });
    updateBatch();
  });
  gallery.addEventListener("change", (event) => { const card = event.target.closest(".h-card"); if (card) { card.classList.toggle("selected", event.target.checked); updateBatch(); } });

  /* ---------- Detail: tags, favorite, versions ---------- */
  const tagField = $("#tag-field");
  const addTag = (text) => {
    const value = text.trim();
    if (!value) return;
    const exists = $$("#tag-input .tag").some((tag) => tag.firstChild.textContent.toLowerCase() === value.toLowerCase());
    if (exists) { tagField.animate([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], { duration: 180 }); return; }
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.innerHTML = `${value}<button type="button" aria-label="移除 ${value}">${ic("x")}</button>`;
    $("#tag-input").append(tag);
    icons();
    DS.animateIn(tag);
  };
  tagField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); addTag(tagField.value); tagField.value = ""; }
    if (event.key === "Backspace" && !tagField.value) { const last = $("#tag-input").lastElementChild; if (last?.classList.contains("tag")) DS.animateOut(last); }
  });
  $("#tag-input").addEventListener("click", (event) => { const button = event.target.closest(".tag button"); if (button) DS.animateOut(button.closest(".tag")); else tagField.focus(); });
  $("#tag-suggest").addEventListener("click", (event) => { const chip = event.target.closest(".chip"); if (chip) { addTag(chip.textContent); DS.animateOut(chip); } });
  const favButtons = [$("#fav"), $("#pc-fav")];
  favButtons.forEach((fav) => fav.addEventListener("click", () => {
    const on = fav.getAttribute("aria-pressed") !== "true";
    favButtons.forEach((button) => { button.setAttribute("aria-pressed", String(on)); button.dataset.tip = on ? "取消收藏" : "收藏"; });
    if (on && !DS.reducedMotion()) fav.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }));
  $("#version-rail").addEventListener("change", () => DS.toast("已切换版本", { kind: "info", icon: "layers" }));

  /* ---------- Video player ---------- */
  const player = $("#player");
  const duration = 80;
  let playing = false, time = 0, idleTimer = 0, playTimer = 0;
  const fmt = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const paintTime = () => {
    player.style.setProperty("--t", `${(time / duration) * 100}%`);
    $("#pc-time").textContent = `${fmt(time)} / ${fmt(duration)}`;
    $("#player-scrub").setAttribute("aria-valuenow", String(Math.round(time)));
  };
  const setPlaying = (on) => {
    playing = on;
    player.toggleAttribute("data-playing", on);
    $("#pc-play").innerHTML = ic(on ? "pause" : "play");
    $("#pc-play").setAttribute("aria-label", on ? "暂停" : "播放");
    $("#player-center").innerHTML = ic(on ? "pause" : "play");
    icons();
    clearInterval(playTimer);
    if (on) playTimer = setInterval(() => { time = (time + 0.1) % duration; paintTime(); }, 100);
    $("#player-center").animate([{ opacity: 0.9, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.25)" }], { duration: 420, easing: "ease-out" });
    wake();
  };
  const wake = () => {
    player.dataset.idle = "false";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (playing && !player.querySelector(".menu[data-open]")) player.dataset.idle = "true"; }, 2000);
  };
  player.addEventListener("pointermove", wake);
  player.addEventListener("pointerleave", () => { if (playing) player.dataset.idle = "true"; });
  $("#pc-play").addEventListener("click", () => setPlaying(!playing));
  $(".player-media", player).addEventListener("click", () => setPlaying(!playing));
  $("#player-center").addEventListener("click", () => setPlaying(!playing));
  player.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "k") { event.preventDefault(); setPlaying(!playing); }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); time = Math.min(duration, Math.max(0, time + (event.key === "ArrowRight" ? 5 : -5))); paintTime(); wake(); }
  });
  const scrub = $("#player-scrub");
  const timeAt = (event) => { const box = scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)); };
  scrub.addEventListener("pointermove", (event) => { const ratio = timeAt(event); scrub.style.setProperty("--h", `${ratio * 100}%`); $("#scrub-hover").textContent = fmt(ratio * duration); });
  scrub.addEventListener("pointerdown", (event) => {
    scrub.setPointerCapture(event.pointerId);
    scrub.setAttribute("data-dragging", "");
    const seek = (moveEvent) => { time = timeAt(moveEvent) * duration; paintTime(); };
    seek(event);
    scrub.addEventListener("pointermove", seek);
    scrub.addEventListener("pointerup", () => { scrub.removeEventListener("pointermove", seek); scrub.removeAttribute("data-dragging"); }, { once: true });
  });
  const volume = $(".pc-volume-range input");
  const paintVolume = () => { $(".pc-volume").style.setProperty("--v", `${volume.value}%`); $("#pc-mute").innerHTML = ic(Number(volume.value) === 0 ? "volume-x" : Number(volume.value) < 50 ? "volume-1" : "volume-2"); icons(); };
  volume.addEventListener("input", paintVolume);
  let lastVolume = 70;
  $("#pc-mute").addEventListener("click", () => { if (Number(volume.value) > 0) { lastVolume = Number(volume.value); volume.value = "0"; } else volume.value = String(lastVolume); paintVolume(); });
  $("#speed-row").addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) $$("#speed-row button").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); });
  paintTime();
  paintVolume();
  $(".curation .rating-clear").addEventListener("click", () => { const host = $(".curation .js-rating"); host.dataset.value = "0"; renderRating(host); $("#rating-value").textContent = "未评分"; });
  const toggleFull = () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (player.requestFullscreen) player.requestFullscreen().catch(() => player.toggleAttribute("data-full"));
    else player.toggleAttribute("data-full");
  };
  $("#pc-full").addEventListener("click", toggleFull);
  player.addEventListener("keydown", (event) => { if (event.key === "f") toggleFull(); });

  /* ---------- Queue ---------- */
  const queue = $("#queue-list");
  queue.innerHTML = `
    <div class="card q-card running lit" data-drag>
      <span class="grip" style="visibility:hidden">${ic("grip-vertical")}</span>
      <div class="q-thumb" style="background:${art[0]}"><span class="pill" style="position:absolute;left:6px;top:6px;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:5px;background:var(--scrim);color:#fff;font-size:10px">${ic("eye")}实时预览</span></div>
      <div class="q-text">
        <div class="row between"><span class="q-title ellipsis">雨夜街道推镜</span><span class="badge running">运行中</span></div>
        <div class="stages"><span class="stage" data-state="done">${ic("check")}加载模型</span><span class="arrow">›</span><span class="stage" data-state="active">采样</span><span class="arrow">›</span><span class="stage">解码</span><span class="arrow">›</span><span class="stage">保存</span></div>
        <div class="progress-pair"><div class="row"><span class="meta">整体</span><span class="meta num" id="q-total">48%</span></div><div class="progress"><span id="q-total-bar" style="--value:48%"></span></div><div class="row"><span class="meta">采样</span><span class="meta num" id="q-step">14 / 30 步</span></div><div class="progress secondary thin"><span id="q-step-bar" style="--value:46%"></span></div></div>
        <div class="metrics num"><span>已用 <b>1:42</b></span><span>剩余约 <b>1:50</b></span><span>VRAM <b>18.2 GB</b></span><span>GPU <b>97%</b></span></div>
      </div>
      <div class="q-actions"><button class="btn btn-gray btn-sm" type="button">${ic("pause")}本任务后暂停</button><button class="btn btn-icon btn-sm" type="button" data-tip="取消" aria-label="取消">${ic("square")}</button></div>
    </div>
    ${[["海边日落延时", "H3 · 1080p · 10 秒", 1], ["DIVIDER"], ["人物特写 · 竖屏", "H3 · 720p · 8 秒", 3], ["长视频 · 城市漫游", "Continuum · 6 段 · 60 秒", 4]].map(([title, meta, index]) => title === "DIVIDER"
      ? `<div class="q-divider" data-drag><span>${ic("pause")}本批次到此暂停 · 拖动调整</span><button class="btn btn-icon btn-sm" type="button" data-tip="移除分隔" aria-label="移除分隔">${ic("x")}</button></div>`
      : `<div class="card q-card lit" data-drag><span class="grip">${ic("grip-vertical")}</span><div class="q-thumb" style="background:${art[index]}"></div><div class="q-text"><span class="q-title ellipsis">${title}</span><span class="meta">${meta}</span></div>
          <div class="q-actions"><span class="badge">等待</span><button class="btn btn-icon btn-sm" type="button" data-tip="编辑" aria-label="编辑">${ic("pencil")}</button>
          <span class="menu-anchor"><button class="btn btn-icon btn-sm" type="button" data-menu-trigger aria-expanded="false" aria-label="更多">${ic("ellipsis")}</button><div class="menu right" role="menu"><button class="menu-item" type="button">${ic("arrow-up-to-line")}移到最前</button><button class="menu-item" type="button">${ic("flag")}渲染到这里</button><button class="menu-item" type="button">${ic("copy-plus")}复制任务</button><button class="menu-item" type="button">${ic("dices")}换个种子</button><div class="menu-sep"></div><button class="menu-item destructive" type="button">${ic("trash-2")}移除</button></div></span></div></div>`).join("")}`;
  const markDeferred = () => { let after = false; for (const item of queue.children) { if (item.classList.contains("q-divider")) { after = true; continue; } item.toggleAttribute("data-deferred", after); } };
  markDeferred();
  function makeSortable(list, handleSelector, onDrop) {
    list.addEventListener("pointerdown", (event) => {
      const item = event.target.closest("[data-drag]");
      if (!item || event.button !== 0 || item.classList.contains("running")) return;
      if (handleSelector && !item.classList.contains("q-divider") && !event.target.closest(handleSelector)) return;
      if (event.target.closest("button:not(.grip), input")) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      const offsetY = event.clientY - rect.top;
      const placeholder = document.createElement("div");
      placeholder.className = "q-placeholder";
      placeholder.style.height = `${rect.height}px`;
      item.after(placeholder);
      Object.assign(item.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, pointerEvents: "none" });
      item.classList.add("dragging");
      if (!DS.reducedMotion()) item.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      const siblings = () => [...list.children].filter((child) => child !== item && child !== placeholder && child.matches("[data-drag]"));
      const move = (moveEvent) => {
        item.style.top = `${moveEvent.clientY - offsetY}px`;
        const target = siblings().find((child) => { const box = child.getBoundingClientRect(); return moveEvent.clientY < box.top + box.height / 2; });
        if (target?.classList.contains("running")) return;
        if ((target && placeholder.nextElementSibling === target) || (!target && placeholder.nextElementSibling?.matches?.("[data-drag]") === false)) return;
        const animation = DS.flip(siblings);
        if (target) list.insertBefore(placeholder, target); else (siblings().at(-1) ?? placeholder).after(placeholder);
        animation.play();
      };
      const up = async () => {
        window.removeEventListener("pointermove", move);
        const to = placeholder.getBoundingClientRect(), from = item.getBoundingClientRect();
        item.getAnimations().forEach((animation) => animation.cancel());
        if (!DS.reducedMotion()) await item.animate([{ transform: "scale(1.02)" }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(1)` }], { duration: 360, easing: getComputedStyle(root).getPropertyValue("--ease-spring").trim(), fill: "forwards" }).finished;
        item.getAnimations().forEach((animation) => animation.cancel());
        item.removeAttribute("style");
        item.classList.remove("dragging");
        placeholder.replaceWith(item);
        onDrop?.();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    });
  }
  makeSortable(queue, ".grip", markDeferred);
  makeSortable($("#lora-stack"), ".grip");
  let queueStep = 14;
  setInterval(() => {
    queueStep = queueStep >= 30 ? 0 : queueStep + 1;
    $("#q-step").textContent = `${queueStep} / 30 步`;
    $("#q-step-bar").style.setProperty("--value", `${(queueStep / 30) * 100}%`);
    const total = Math.round(20 + queueStep * 1.6);
    $("#q-total").textContent = `${total}%`;
    $("#q-total-bar").style.setProperty("--value", `${total}%`);
  }, 700);

  /* ---------- Long video ---------- */
  const lv = { mode: "continuum", total: 60, segments: 6, confirmed: false, page: "global", view: "pages", pages: [] };
  const recommended = (total) => total < 5 ? { min: 1, max: 1, def: 1 } : { min: Math.max(1, Math.ceil(total / 15)), max: Math.min(16, Math.floor(total / 5)), def: Math.min(16, Math.ceil(total / 10)) };
  const segField = $("#seg-field"), totalField = $("#total-field");
  const setSegments = (value) => { lv.segments = value; $("input[type=range]", segField).value = $("input[type=number]", segField).value = String(value); };
  const renderRuler = () => {
    const range = recommended(lv.total);
    segField.dataset.band = `${range.min},${range.max}`;
    segField.repaint();
    $("#seg-range").textContent = `推荐 ${range.min}–${range.max}`;
    const each = lv.total / lv.segments;
    $("#ruler").innerHTML = Array.from({ length: lv.segments }, (_, index) => `<div class="seg-block" style="--i:${index}">${index + 1}<span class="tick num">${Math.round(index * each)}s</span></div>`).join("");
    const outside = lv.segments < range.min || lv.segments > range.max;
    $("#layout-summary").innerHTML = `${lv.segments} 段 × ${each.toFixed(1)} 秒 · 24 fps${outside ? ` · <span style="color:var(--warning)">超出推荐范围</span>` : ""}`;
    $("#ruler").toggleAttribute("data-stale", lv.confirmed && lv.pages.length !== lv.segments);
    $("#submit-count").textContent = lv.pages.length || lv.segments;
  };
  totalField.addEventListener("value", (event) => { lv.total = event.detail; setSegments(recommended(lv.total).def); segField.repaint(); renderRuler(); });
  segField.addEventListener("value", (event) => { lv.segments = event.detail; renderRuler(); });
  $("#gen-mode").addEventListener("change", (event) => {
    lv.mode = event.target.value;
    const multi = lv.mode === "continuum";
    const max = multi ? 120 : lv.mode === "unlocked" ? 30 : 15.1;
    const range = $("input[type=range]", totalField), number = $("input[type=number]", totalField);
    range.max = number.max = String(max);
    range.min = number.min = multi ? "4" : "1";
    range.step = number.step = multi ? "1" : "0.1";
    if (Number(range.value) > max) range.value = number.value = String(max);
    lv.total = Number(range.value);
    $(".range-ticks", totalField).innerHTML = multi ? "<span>4</span><span>30</span><span>60</span><span>90</span><span>120</span>" : lv.mode === "unlocked" ? "<span>1</span><span>10</span><span>20</span><span>30</span>" : "<span>1</span><span>5</span><span>10</span><span>15.1</span>";
    totalField.repaint();
    ["#seg-wrap", "#ruler", "#script-card"].forEach((selector) => { $(selector).hidden = !multi; });
    $("#confirm-layout").closest(".row").hidden = !multi;
    renderRuler();
  });
  const samples = ["雨后的城市街道，夜色，霓虹倒影。女主角从画面左侧走入。", "她停在路灯下，抬头看向楼上亮着灯的窗户，镜头缓慢推近。", "转身穿过斑马线，车灯从背景划过，雨滴在光里闪烁。", "走进一家亮着暖光的书店，推门时门铃轻响。", "在书架间停下，抽出一本旧书，翻开第一页。", "镜头越过她的肩膀看向书页，画面渐渐安静。"];
  $("#confirm-layout").addEventListener("click", () => {
    const previous = lv.pages;
    lv.pages = Array.from({ length: lv.segments }, (_, index) => previous[index] ?? { id: `p${index + 1}`, text: samples[index % samples.length], state: index < 2 ? "detail" : "outline", locked: index === 1 });
    lv.confirmed = true;
    renderRuler();
    renderTabs();
    DS.toast(`已确认 ${lv.segments} 段布局`, { kind: "info", icon: "layers" });
  });
  function renderTabs() {
    const items = [{ id: "global", label: "全局", state: "detail" }, ...lv.pages.map((page, index) => ({ id: page.id, label: String(index + 1), state: page.state, locked: page.locked }))];
    $("#page-tabs").innerHTML = items.map((item) => `<button class="page-tab" role="tab" type="button" data-page="${item.id}" aria-selected="${item.id === lv.page}"><span class="state-dot" data-state="${item.state}"></span>${item.label}${item.locked ? ic("lock") : ""}</button>`).join("");
    icons();
    renderEditor();
  }
  $("#page-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".page-tab");
    if (!tab) return;
    lv.page = tab.dataset.page;
    $$(".page-tab").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    tab.scrollIntoView({ inline: "nearest", block: "nearest", behavior: DS.reducedMotion() ? "auto" : "smooth" });
    renderEditor();
  });
  $("#script-view").addEventListener("change", (event) => { lv.view = event.detail.value; $("#page-tabs-row").hidden = lv.view === "whole"; renderEditor(); });
  const globalText = "城市雨夜，一个镜头连续跟随女主角，从街道走入书店。保持服装与发型一致，结尾安静收束。";
  function renderEditor() {
    const editor = $("#script-editor");
    if (lv.view === "whole") {
      editor.innerHTML = `<div class="whole">${[["全局", globalText], ...lv.pages.map((page, index) => [`[Chunk ${index + 1}]`, page.text])].map(([label, text]) => `<div class="whole-block"><code>${label}</code><p>${text}</p></div>`).join("")}</div>`;
      $("#script-meta").textContent = `整片 · ${lv.pages.length} 段 · 同一份脚本`;
    } else {
      const page = lv.pages.find((item) => item.id === lv.page);
      const index = lv.pages.indexOf(page);
      const each = lv.total / Math.max(1, lv.pages.length || lv.segments);
      editor.innerHTML = `<textarea class="textarea" aria-label="提示词">${page ? page.text : globalText}</textarea>`;
      $("#script-meta").textContent = page ? `第 ${index + 1} 段 · ${(index * each).toFixed(1)}–${((index + 1) * each).toFixed(1)} 秒 · ${page.state === "detail" ? "详稿" : page.state === "outline" ? "提纲" : "需复核"}` : `全局 · ${lv.total} 秒 · ${lv.pages.length || lv.segments} 段`;
      DS.animateIn(editor.firstElementChild);
    }
  }
  $("#enhance").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-busy", "true");
    setTimeout(() => {
      button.removeAttribute("aria-busy");
      const page = lv.pages.find((item) => item.id === lv.page);
      if (page) { page.state = "detail"; renderTabs(); }
      DS.toast(page ? "已生成新版本 · 可撤销" : "全局提纲已更新 · 2 段需复核", { kind: page ? "success" : "warning", action: "撤销" });
    }, 1100);
  });
  const pkg = { browse: 0, running: 2, total: 6, step: 8 };
  function renderPackage() {
    const ready = pkg.browse <= pkg.running;
    const progress = ((pkg.running + pkg.step / 30) / pkg.total) * 100;
    $("#package-card").innerHTML = `
      <div class="pkg-media"><div class="pkg-thumb">${ready ? `<div style="position:absolute;inset:0;background:${art[pkg.browse % art.length]}"></div>` : `<div class="pending">${ic("clock-3")}待生成</div>`}</div>
        <div class="pkg-nav"><button class="btn btn-icon btn-sm" type="button" data-pkg="-1" aria-label="上一段">${ic("chevron-left")}</button><span class="meta num">${pkg.browse + 1} / ${pkg.total}</span><button class="btn btn-icon btn-sm" type="button" data-pkg="1" aria-label="下一段">${ic("chevron-right")}</button></div></div>
      <div class="pkg-body">
        <div class="row between"><strong class="ellipsis" style="color:var(--text-1)">长视频 · 城市漫游</strong><span class="badge running">运行中</span></div>
        <div class="stages"><span class="stage" data-state="done">${ic("check")}准备</span><span class="arrow">›</span><span class="stage" data-state="active">视频段 ${pkg.running + 1}/${pkg.total}</span><span class="arrow">›</span><span class="stage">解码 / 合成</span><span class="arrow">›</span><span class="stage">校验</span></div>
        <div class="progress-pair"><div class="row"><span class="meta">整包</span><span class="meta num">${Math.round(progress)}%</span></div><div class="progress"><span style="--value:${progress}%"></span></div><div class="row"><span class="meta">本段采样</span><span class="meta num">${pkg.step} / 30 步</span></div><div class="progress secondary thin"><span style="--value:${(pkg.step / 30) * 100}%"></span></div></div>
        <p class="prompt-peek"><span class="caption">第 ${pkg.browse + 1} 段 · </span>${samples[pkg.browse % samples.length]}</p>
        <div class="row"><button class="btn btn-gray btn-sm" type="button">${ic("pause")}本段完成后暂停</button><button class="btn btn-plain btn-sm" type="button">${ic("square")}取消</button></div>
      </div>`;
    icons();
  }
  $("#package-card").addEventListener("click", (event) => { const button = event.target.closest("[data-pkg]"); if (button) { pkg.browse = (pkg.browse + Number(button.dataset.pkg) + pkg.total) % pkg.total; renderPackage(); } });
  let historySegment = 0;
  function renderHistorySegments() {
    $("#history-segments").innerHTML = `
      <div class="row between"><h3>分段</h3><span class="meta">6 段 · 60 秒 · Continuum</span></div>
      <div class="segments-strip">${Array.from({ length: 6 }, (_, index) => `<button type="button" aria-pressed="${index === historySegment}" style="background:${art[index]}" aria-label="第 ${index + 1} 段"><span>${index + 1}</span></button>`).join("")}</div>
      <div class="seg js-hseg"><button type="button" aria-pressed="false">全局</button><button type="button" aria-pressed="true">第 ${historySegment + 1} 段</button></div>
      <p>${samples[historySegment]}</p>
      <div class="row wrap"><button class="btn btn-gray btn-sm" type="button">${ic("rotate-cw")}重做本段</button><button class="btn btn-plain btn-sm" type="button">${ic("pencil-line")}在创建页调整</button><button class="btn btn-plain btn-sm" type="button">${ic("wand-sparkles")}继续创作</button></div>`;
    DS.bindSegmented($(".js-hseg"));
    icons();
  }
  $("#history-segments").addEventListener("click", (event) => { const button = event.target.closest(".segments-strip button"); if (button) { historySegment = [...button.parentElement.children].indexOf(button); renderHistorySegments(); } });
  renderPackage();
  renderHistorySegments();
  renderRuler();
  renderTabs();

  /* ---------- Settings cards ---------- */
  const compRow = (part, profile) => {
    const [label, file, state, shared, evidence, size] = part;
    const icon = state === "ok" ? "circle-check" : state === "warn" ? "circle-help" : "circle-alert";
    return `<div class="comp-row ${state}">${ic(icon)}<span class="name ellipsis">${label}${shared ? '<span class="shared">共用</span>' : ""}</span>
      <span class="where"><code title="${file}">${state === "bad" ? `缺少 · ${file}` : file}</code><span class="caption">${evidence}${size ? ` · ${size}` : ""}</span></span>
      <button class="btn ${state === "bad" ? "btn-tinted" : "btn-icon"} btn-sm js-guide" type="button" data-profile="${profile}" data-label="${label}" data-file="${file.split("\\").pop()}" ${state === "bad" ? "" : 'data-tip="查看来源" aria-label="查看来源"'}>${state === "bad" ? `${ic("download")}下载` : ic("external-link")}</button></div>`;
  };
  const modelCard = ({ name, badge, desc, status, facts, parts, expanded }) => {
    const missing = parts.filter((part) => part[2] === "bad");
    const visible = expanded ? parts : missing;
    return `<article class="card set-card lit">
      <div class="set-head">
        <div><div class="set-title"><h3>${name}</h3><span class="badge plain">${badge}</span></div><p class="set-desc">${desc}</p>
          <div class="set-facts">${facts.map((fact) => `<span>${fact}</span>`).join("")}<span><b class="num">${parts.length - missing.length}/${parts.length}</b> 个文件</span>${missing.length ? `<span class="bad">缺少 ${missing.map((part) => part[0]).join("、")}</span>` : ""}</div></div>
        <div class="set-actions">${status}</div>
      </div>
      <button class="set-toggle" type="button" aria-expanded="${Boolean(expanded)}" data-parts='${JSON.stringify(parts).replace(/'/g, "&#39;")}' data-profile="${name}">${ic("chevron-right", 'class="chev"')}${expanded ? "收起" : "全部模型文件"} <span class="num">${parts.length}</span></button>
      <div class="comp-list">${visible.map((part) => compRow(part, name)).join("")}</div>
    </article>`;
  };
  const shared = [["视频 VAE", "E:\\ComfyUI\\models\\vae\\h3-video-vae.safetensors", "ok", true, "Hugging Face · rev 3f1c2a9b7d01", "1.2 GB"], ["音频 VAE", "E:\\ComfyUI\\models\\vae\\h3-audio-vae.safetensors", "ok", true, "Hugging Face · rev 3f1c2a9b7d01", "312 MB"], ["TAE 预览", "E:\\ComfyUI\\models\\vae_approx\\taeh3.safetensors", "ok", true, "GitHub · v1.0", "9.6 MB"], ["文本编码器", "E:\\ComfyUI\\models\\text_encoders\\gemma-3-12b-it-fp8.safetensors", "ok", true, "Hugging Face · rev a81f02c3e9d4", "12.9 GB"]];
  const nodeCard = ({ name, badge, purpose, dir, versions, notices = [], status, action, log, manual }) => `
    <article class="card set-card lit">
      <div class="set-head">
        <div><div class="set-title"><h3>${name}</h3><span class="badge plain">${badge}</span></div><p class="set-desc">${purpose}</p>
          <div class="set-facts"><code>${dir}</code></div>
          <div class="version-line" style="margin-top:6px">${versions}</div>
          ${notices.map(([kind, text]) => `<div class="notice ${kind}" style="margin-top:10px">${ic(kind === "danger" ? "circle-alert" : "triangle-alert")}<p>${text}</p><span></span></div>`).join("")}</div>
        <div class="set-actions">${status}${manual ? `<div class="row"><div class="split"><button class="btn btn-gray btn-sm" type="button">${ic("external-link")}打开源码</button><span class="menu-anchor"><button class="btn btn-gray btn-sm btn-more" type="button" data-menu-trigger aria-expanded="false" aria-label="更多操作">${ic("chevron-down")}</button><div class="menu right" role="menu"><button class="menu-item" type="button">${ic("folder-open")}打开位置</button></div></span></div><button class="btn btn-gray btn-sm" type="button">${ic("scan-search")}重新扫描</button></div>` : action}</div>
      </div>
      ${log ? `<details class="node-log" open><summary>安装日志</summary><pre>${log}</pre></details>` : ""}
    </article>`;
  const split = (main, kind = "btn-primary", installed = true) => `<div class="split"><button class="btn ${kind} btn-sm" type="button">${main}</button><span class="menu-anchor"><button class="btn ${kind} btn-sm btn-more" type="button" data-menu-trigger aria-expanded="false" aria-label="更多操作">${ic("chevron-down")}</button><div class="menu right" role="menu"><button class="menu-item" type="button" ${installed ? "" : "disabled"}>${ic("folder-open")}打开位置</button>${installed ? `<div class="menu-sep"></div><button class="menu-item destructive" type="button">${ic("trash-2")}卸载</button>` : ""}</div></span></div>`;

  $("#settings-cards").innerHTML = `
    <div class="settings-group-title"><h3>视频模型</h3><span class="caption">每个模型的文件、节点与运行验证</span></div>
    ${modelCard({ name: "MiniMax H3 · FL2VA", badge: "bf16", desc: "首尾帧图生视频，音画同步输出。", status: '<span class="status success">' + ic("circle-check") + "运行验证通过</span>", facts: ["资源 · 约 16 GB", "推荐 RTX 4090 24 GB", "节点已安装"], parts: [["Transformer", "E:\\ComfyUI\\models\\diffusion_models\\h3-fl2va-bf16.safetensors", "ok", false, "Hugging Face · v1.2", "17.8 GB"], ...shared] })}
    ${modelCard({ name: "MiniMax H3 · Ref2VA", badge: "fp8", desc: "多图参考生成，角色一致性更好。", status: '<span class="badge danger">缺少 2 项</span>', facts: ["资源 · 约 14 GB", "推荐 RTX 4080 16 GB 以上", "节点已安装"], parts: [["Transformer", "h3-ref2va-fp8.safetensors", "bad", false, "Hugging Face · rev 94eaf70d674a", "17.8 GB"], ["参考投影", "h3-ref-proj.safetensors", "bad", false, "Hugging Face · rev 94eaf70d674a", "640 MB"], ...shared] })}
    <div class="settings-group-title"><h3>LoRA</h3><span class="caption">单文件，可叠加</span></div>
    <div class="lora-cards">
      ${[["运镜控制 · Camera Push", "H3 专属", "让镜头推进更稳定，适合人物和街景。", "RTX 3060 12 GB 以上", "ok"], ["写实人像增强", "通用", "皮肤与毛发细节更自然。", "RTX 3060 12 GB 以上", "bad"]].map(([name, badge, desc, hw, state]) => `
        <article class="card set-card lit">
          <div class="set-head"><div><div class="set-title"><h3>${name}</h3><span class="badge plain">${badge}</span></div><p class="set-desc">${desc}</p><div class="set-facts"><span>${hw}</span></div></div><div class="set-actions">${state === "bad" ? '<span class="badge danger">缺少文件</span>' : ""}</div></div>
          <button class="set-toggle" type="button" aria-expanded="false">${ic("chevron-right", 'class="chev"')}使用说明</button>
          <div class="disclosure"><div><dl class="guide"><dt>效果</dt><dd>镜头推进更平滑，减少抖动。</dd><dt>叠加</dt><dd>与人像类 LoRA 叠加时强度 ≤ 0.6。</dd><dt>兼容</dt><dd>仅 H3 FL2VA / Ref2VA。</dd></dl></div></div>
          ${compRow(["LoRA", state === "ok" ? "E:\\ComfyUI\\models\\loras\\h3-camera-push.safetensors" : "h3-portrait-real.safetensors", state, false, "Civitai · v2.0", "288 MB"], name)}
        </article>`).join("")}
    </div>
    <div class="settings-group-title"><h3>节点与依赖</h3><span class="caption">版本、安装、更新、卸载</span></div>
    ${nodeCard({ name: "ComfyUI-MiniMax-H3", badge: "项目必需", purpose: "H3 采样、Continuum 续接与音画解码节点。", dir: "E:\\ComfyUI\\custom_nodes\\ComfyUI-MiniMax-H3", versions: '<span>本机 <b>v3.9.1</b></span><span>推荐 <b>v3.9.1</b></span><span>最新 <b class="newer">v3.9.9</b></span>', status: `<span class="status success">${ic("circle-check")}文件与版本检查通过</span>`, action: split(`${ic("refresh-cw")}重新安装`, "btn-gray") })}
    ${nodeCard({ name: "Spectrum MiniMax H3", badge: "可选", purpose: "H3 采样加速。", dir: "E:\\ComfyUI\\custom_nodes\\spectrum-minimax-h3", versions: '<span>本机 <b>v0.4.0</b></span><span>推荐 <b class="newer">v0.4.2</b></span><span>最新 <b>v0.4.2</b></span>', notices: [["warning", "低于推荐版本，可能无法加载新版 H3 节点"]], status: `<span class="status warning">${ic("circle-alert")}需要更新</span>`, action: split(`${ic("refresh-cw")}更新`) })}
    ${nodeCard({ name: "ComfyUI-QwenVL-LoRA", badge: "可选", purpose: "Qwen-VL 提示词增强节点。", dir: "https://github.com/fixture/ComfyUI-QwenVL-LoRA", versions: '<span>本机 <b>未安装</b></span><span>推荐 <b>v1.2.0</b></span><span>最新 <b>v1.2.0</b></span>', status: `<span class="status running">${ic("loader-circle")}处理中</span>`, action: split(`${ic("x")}取消安装`, "btn-gray", false), log: "Cloning into 'ComfyUI-QwenVL-LoRA'...\nResolving deltas: 100% (412/412), done.\nInstalling requirements (3/7) transformers==4.57.1" })}
    ${nodeCard({ name: "RIFE 插帧", badge: "可选 · 手动安装", purpose: "上游未提供自动安装，按源码说明手动放置。", dir: "E:\\ComfyUI\\custom_nodes\\ComfyUI-RIFE", versions: '<span>版本 <b>滚动更新</b></span><span>提交日期 <b>2026-09-28</b></span>', status: `<span class="status success">${ic("circle-check")}文件检查通过</span>`, manual: true })}
    <article class="card set-card lit">
      <div class="set-head"><div><div class="set-title"><h3>H3 加速运行时</h3><span class="badge plain">Python 依赖</span></div><p class="set-desc">SageAttention 与 Triton，用于 H3 注意力加速。</p></div>
        <div class="set-actions"><span class="status success">${ic("circle-check")}运行验证通过</span><div class="row"><button class="btn btn-gray btn-sm" type="button">${ic("scan-search")}重新验证</button><button class="btn btn-primary btn-sm" type="button">${ic("wrench")}升级 / 修复</button></div></div></div>
      <div class="runtime-grid">${[["Python", "3.12.10"], ["PyTorch", "2.11.0+cu130"], ["SageAttention", "2.2.0"], ["Triton", "3.6.0"]].map(([label, value]) => `<div><span class="caption">${label}</span><strong class="num">${ic("circle-check")}${value}</strong></div>`).join("")}</div>
    </article>`;
  $("#settings-cards").addEventListener("click", (event) => {
    const toggle = event.target.closest(".set-toggle");
    if (toggle?.dataset.parts) {
      const parts = JSON.parse(toggle.dataset.parts);
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.lastChild.previousSibling.textContent = open ? "收起 " : "全部模型文件 ";
      const list = toggle.nextElementSibling;
      const before = new Set($$(".comp-row", list).map((row) => row.querySelector(".name").textContent));
      list.innerHTML = (open ? parts : parts.filter((part) => part[2] === "bad")).map((part) => compRow(part, toggle.dataset.profile)).join("");
      icons();
      $$(".comp-row", list).forEach((row, index) => { if (!before.has(row.querySelector(".name").textContent)) setTimeout(() => DS.animateIn(row), index * 25); });
    } else if (toggle) {
      toggle.setAttribute("aria-expanded", String(toggle.getAttribute("aria-expanded") !== "true"));
    }
    const guide = event.target.closest(".js-guide");
    if (guide) {
      $("#guide-profile").textContent = guide.dataset.profile;
      $("#guide-title").textContent = guide.dataset.label;
      $("#guide-file").textContent = guide.dataset.file;
      DS.openDialog($("#guide-dialog"));
    }
  });

  /* ---------- Motion ---------- */
  const tracks = [["90ms · out", "--dur-1", "--ease-out"], ["160ms · out", "--dur-2", "--ease-out"], ["240ms · in-out", "--dur-3", "--ease-in-out"], ["360ms · out", "--dur-4", "--ease-out"], ["360ms · spring", "--dur-4", "--ease-spring"]];
  $("#motion-tracks").innerHTML = tracks.map(([label, duration, easing]) => `<div class="track"><span class="caption">${label}</span><div class="lane"><span class="dot" style="transition:left var(${duration}) var(${easing})"></span></div></div>`).join("");
  $("#play-tracks").addEventListener("click", () => $$(".track").forEach((track) => track.classList.toggle("go")));
  $("#skeleton-demo").addEventListener("click", () => {
    const stage = $("#skeleton-card");
    stage.innerHTML = '<div class="skeleton media"></div><div class="skeleton line"></div>';
    setTimeout(() => { stage.innerHTML = `<div class="real" style="background:${art[2]}"></div><span class="meta">夜色中的城市镜头</span>`; [...stage.children].forEach((child, index) => setTimeout(() => DS.animateIn(child), index * 40)); }, 1200);
  });
  $("#tween-demo").addEventListener("click", () => {
    DS.tweenNumber($("#t-gpu"), Math.round(30 + Math.random() * 69), { suffix: "%" });
    DS.tweenNumber($("#t-vram"), 6 + Math.random() * 17, { decimals: 1, suffix: " GB" });
    DS.tweenNumber($("#t-temp"), Math.round(48 + Math.random() * 30), { suffix: "°" });
  });
  const pages = ["创建", "队列", "历史", "设置"];
  let pageIndex = 0;
  $("#page-demo").addEventListener("click", async () => {
    const stage = $("#page-stage");
    const old = stage.firstElementChild;
    pageIndex = (pageIndex + 1) % pages.length;
    const next = Object.assign(document.createElement("div"), { className: "page-pane", innerHTML: `<h3>${pages[pageIndex]}</h3><p class="meta">淡出 90ms，淡入 160ms + 上移 4px</p>` });
    await old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: "forwards" }).finished;
    old.replaceWith(next);
    next.animate(DS.reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" });
  });

  /* ---------- Settings › Appearance mirrors the catalog toolbar ---------- */
  const setAccent = $("#set-accent");
  setAccent.innerHTML = $$("#accent button").map((button) => `<button type="button" role="radio" data-value="${button.dataset.value}" aria-checked="${button.getAttribute("aria-checked")}" data-tip="${button.dataset.tip}" style="${button.getAttribute("style")}"></button>`).join("");
  const syncAccent = () => $$("button", setAccent).forEach((button) => button.setAttribute("aria-checked", String(button.dataset.value === root.dataset.accent)));
  setAccent.addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) $(`#accent button[data-value="${button.dataset.value}"]`).click(); });
  $("#accent").addEventListener("click", () => setTimeout(syncAccent));
  const setPalette = $("#set-palette");
  setPalette.addEventListener("change", () => { if (palette.value !== setPalette.value) { palette.value = setPalette.value; palette.dispatchEvent(new Event("change")); } });
  palette.addEventListener("change", () => { if (setPalette.value !== palette.value) { setPalette.value = palette.value; setPalette.dispatchEvent(new Event("change")); } });
  $("#set-depth").addEventListener("change", (event) => $(`#depth button[data-value="${event.detail.value}"]`).click());
  $("#depth").addEventListener("change", (event) => $(`#set-depth button[data-value="${event.detail.value}"]`).click());
  $("#set-motion").addEventListener("change", (event) => {
    const reduced = event.detail.value === "reduced";
    $("#reduced").checked = reduced;
    if (reduced) root.dataset.motion = "reduced"; else delete root.dataset.motion;
  });
  $("#reduced").addEventListener("change", (event) => $(`#set-motion button[data-value="${event.target.checked ? "reduced" : "system"}"]`).click());

  DS.bindPointerLight();
  DS.bindTooltips();
  icons();
  refreshColor();
  $$(".seg").forEach((seg) => seg.dispatchEvent(new Event("resize")));
})();
