// Image detail prototype: a project keeps every edited version; the page shows one selected version at a time.
(() => {
  const DS = window.DS;
  const { ic, icons } = DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const project = { id: "img-20260921-4a84a501", title: "Change the helicopter color to blue" };
  // Newest first, matching the rail order.
  const versions = [
    { n: 5, parent: 4, type: "图片编辑", request: "Change the helicopter color to blue", seed: "2290418833", art: "linear-gradient(135deg,#0b3d91,#3e8ede,#f2c27a)", file: "QwenImage21_ImageEdit-20260921060455-4a84a501_1_00001_.png", time: "2026-09-21 14:05:34", took: "38 秒", bytes: "612 KB" },
    { n: 4, parent: 3, type: "图片编辑", request: "Remove the second helicopter on the left", seed: "1170342291", art: "linear-gradient(135deg,#7a3b12,#d58a3c,#f2c27a)", file: "QwenImage21_ImageEdit-20260921055812-4a84a501_1_00001_.png", time: "2026-09-21 13:58:12", took: "41 秒", bytes: "598 KB" },
    { n: 3, parent: 2, type: "图片编辑", request: "Make the sky warmer, golden hour light", seed: "908812450", art: "linear-gradient(135deg,#5b2a0e,#c06a2b,#e9b26a)", file: "QwenImage21_ImageEdit-20260921054930-4a84a501_1_00001_.png", time: "2026-09-21 13:49:30", took: "39 秒", bytes: "604 KB" },
    { n: 2, parent: 1, type: "图片编辑", request: "Add a second helicopter flying over the river", seed: "3321870014", art: "linear-gradient(135deg,#3a4a5a,#7d8fa0,#c9d3dc)", file: "QwenImage21_ImageEdit-20260921054102-4a84a501_1_00001_.png", time: "2026-09-21 13:41:02", took: "44 秒", bytes: "571 KB" },
    { n: 1, parent: null, type: "原始素材", request: "", seed: "—", art: "linear-gradient(135deg,#2f3d4a,#6c7f90,#b7c2cc)", file: "river-helicopter.png", time: "2026-09-21 13:36:48", took: "—", bytes: "1.2 MB" }
  ];
  const model = "Qwen Image 2.1 · 官方文生图/图片编辑";
  const size = "736 × 416";
  let index = 0;
  let manualCover = null; // null = automatic cover (latest version)

  const current = () => versions[index];
  const coverN = () => manualCover ?? versions[0].n;

  /* ---------- Render ---------- */
  const renderRail = () => {
    $$(".v-thumb", $("#version-rail")).forEach((thumb) => thumb.remove());
    versions.forEach((version, i) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "v-thumb";
      thumb.style.backgroundImage = version.art;
      thumb.setAttribute("aria-pressed", String(i === index));
      thumb.setAttribute("aria-label", `版本 v${version.n}`);
      thumb.dataset.tip = `v${version.n} · ${version.type}`;
      thumb.innerHTML = `<span class="n">v${version.n}</span>${version.n === coverN() ? `<span class="cover">${ic("check")}</span>` : ""}`;
      thumb.addEventListener("click", () => select(i));
      $("#version-rail").append(thumb);
    });
  };

  const render = () => {
    const version = current();
    const source = version.parent === null;
    const isCover = version.n === coverN();
    renderRail();
    $("#stage-file").textContent = version.file;
    $("#stage-meta").textContent = source ? `v${version.n} · 原始素材 · ${size}` : `v${version.n} · Seed ${version.seed} · ${model}`;
    $("#stage-img").style.cssText = `--ratio:736/416;background-image:${version.art}`;
    $("#v-pos").textContent = `v${version.n} · ${index + 1} / ${versions.length}`;
    $("#v-prev").disabled = index === versions.length - 1;
    $("#v-next").disabled = index === 0;

    $("#side-version").textContent = isCover ? `v${version.n} · 当前封面` : `v${version.n}`;
    $("#side-title").textContent = project.title;
    $("#side-title").title = project.title;
    $("#version-count").textContent = `v${version.n} · ${index + 1} / ${versions.length}`;
    $("#facts").innerHTML = [
      ["模型", source ? "导入" : model], ["Seed", version.seed], ["分辨率", size],
      ["输出格式", "PNG"], ["生成时间", version.time], ["耗时", version.took]
    ].map(([label, value]) => `<div><span>${label}</span><b title="${value}">${value}</b></div>`).join("");
    $("#version-note").textContent = source ? "这是项目最初导入的基础图片。" : `当前版本基于 v${version.parent} 继续编辑。`;

    const coverLabel = $("#cover-toggle span");
    coverLabel.textContent = manualCover !== null && isCover ? "恢复自动封面" : "设为项目封面";
    $("#cover-toggle").disabled = manualCover === null && isCover;
    const deleteVersion = $("#delete-version");
    deleteVersion.disabled = source;
    deleteVersion.dataset.tip = source ? "原始图不可删除" : "";
    if (!source) delete deleteVersion.dataset.tip;

    $("#edit-request").hidden = source;
    $("#request-body").textContent = version.request;
    $("#gen-record").hidden = source;
    $("#ref-record").hidden = source;
    $("#gen-model").textContent = model;
    $("#gen-seed").textContent = version.seed;
    $("#gen-time").textContent = version.time;
    $("#source-list").innerHTML = `
      <dt>所属项目</dt><dd class="mono ellipsis">${project.id}</dd>
      <dt>父版本</dt><dd class="num">${source ? "无" : `v${version.parent}`}</dd>
      <dt>版本编号</dt><dd class="num">v${version.n}</dd>
      <dt>版本类型</dt><dd>${version.type}</dd>`;
    $("#out-file").textContent = version.file;
    $("#out-size").textContent = version.bytes;
    $("#snapshot").textContent = JSON.stringify({ filename: version.file, subfolder: source ? "" : "image-edit", type: "output", node: source ? null : "SaveImage:58" }, null, 2);
    paintLightbox();
    icons();
  };

  const select = (next) => {
    if (next < 0 || next >= versions.length || next === index) return;
    index = next;
    render();
    if (!DS.reducedMotion()) $("#stage-img").animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
  };
  // Older = further down the rail.
  $("#v-prev").addEventListener("click", () => select(index + 1));
  $("#v-next").addEventListener("click", () => select(index - 1));

  /* ---------- Lightbox: same model as the app (fit, wheel zoom 1-12x at pointer, drag pan, double-click / 0 reset) ---------- */
  const lightbox = $("#lightbox");
  const lbStage = $("#lb-stage");
  const lbImg = $("#lb-img");
  const natural = { width: 736, height: 416 };
  let scale = 1, offsetX = 0, offsetY = 0, fitWidth = 0, fitHeight = 0, panId = null, lastX = 0, lastY = 0;
  const updateTransform = () => {
    const limitX = Math.max(0, (fitWidth * scale - lbStage.clientWidth) / 2);
    const limitY = Math.max(0, (fitHeight * scale - lbStage.clientHeight) / 2);
    offsetX = Math.min(limitX, Math.max(-limitX, offsetX));
    offsetY = Math.min(limitY, Math.max(-limitY, offsetY));
    lbImg.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    lbStage.classList.toggle("is-zoomed", scale > 1);
    $("#lb-zoom").textContent = `${Math.max(1, Math.round((fitWidth * scale / natural.width) * 100))}%`;
  };
  const fit = () => {
    const ratio = Math.min((lbStage.clientWidth - 48) / natural.width, (lbStage.clientHeight - 24) / natural.height);
    fitWidth = natural.width * ratio;
    fitHeight = natural.height * ratio;
    lbImg.style.width = `${fitWidth}px`;
    lbImg.style.height = `${fitHeight}px`;
    scale = 1; offsetX = 0; offsetY = 0;
    updateTransform();
  };
  const paintLightbox = () => {
    const version = current();
    $("#lb-title").textContent = project.title;
    $("#lb-meta").textContent = `v${version.n} · ${size}`;
    lbImg.style.backgroundImage = version.art;
    $("#lb-pos").textContent = `v${version.n} / ${versions.length}`;
    $("#lb-prev").disabled = index === versions.length - 1;
    $("#lb-next").disabled = index === 0;
    if (!lightbox.hidden) fit();
  };
  const openLightbox = () => {
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    $(".app-shell").inert = true;
    fit();
    void lightbox.offsetWidth;
    lightbox.setAttribute("data-open", "");
    $("#lb-close").focus();
  };
  const closeLightbox = () => {
    lightbox.removeAttribute("data-open");
    document.body.classList.remove("lightbox-open");
    $(".app-shell").inert = false;
    lightbox.hidden = true;
    $("#open-lightbox").focus();
  };
  $("#open-lightbox").addEventListener("click", openLightbox);
  $("#stage").addEventListener("click", openLightbox);
  $("#stage").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLightbox(); } });
  $("#lb-close").addEventListener("click", closeLightbox);
  $("#lb-reset").addEventListener("click", fit);
  $("#lb-prev").addEventListener("click", () => select(index + 1));
  $("#lb-next").addEventListener("click", () => select(index - 1));
  // Clicking the empty backdrop closes; clicks on the image never do.
  lbStage.addEventListener("click", (event) => { if (event.target === lbStage && scale === 1) closeLightbox(); });
  lbStage.addEventListener("dblclick", (event) => { event.preventDefault(); fit(); });
  lbStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = lbStage.getBoundingClientRect();
    const next = Math.min(12, Math.max(1, scale * (event.deltaY < 0 ? 1.12 : 0.88)));
    if (next === scale) return;
    const px = event.clientX - rect.left - rect.width / 2 - offsetX;
    const py = event.clientY - rect.top - rect.height / 2 - offsetY;
    offsetX -= px * (next / scale - 1);
    offsetY -= py * (next / scale - 1);
    scale = next;
    if (scale === 1) { offsetX = 0; offsetY = 0; }
    updateTransform();
  }, { passive: false });
  lbStage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || scale <= 1) return;
    panId = event.pointerId; lastX = event.clientX; lastY = event.clientY;
    lbStage.setPointerCapture(panId);
    lbStage.classList.add("is-panning");
    event.preventDefault();
  });
  lbStage.addEventListener("pointermove", (event) => {
    if (event.pointerId !== panId) return;
    offsetX += event.clientX - lastX; offsetY += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
    updateTransform();
  });
  const stopPan = (event) => { if (event.pointerId !== panId) return; panId = null; lbStage.classList.remove("is-panning"); };
  lbStage.addEventListener("pointerup", stopPan);
  lbStage.addEventListener("pointercancel", stopPan);
  new ResizeObserver(() => { if (!lightbox.hidden) fit(); }).observe(lbStage);

  document.addEventListener("keydown", (event) => {
    if (event.target.closest?.("input, textarea, [contenteditable]") || $(".dialog-backdrop:not([hidden])")) return;
    const open = !lightbox.hidden;
    if (open && event.key === "Escape") closeLightbox();
    else if (open && event.key === "0") fit();
    else if (event.key === "ArrowLeft") select(index + 1);
    else if (event.key === "ArrowRight") select(index - 1);
  });

  /* ---------- Cover ---------- */
  $("#cover-toggle").addEventListener("click", () => {
    const restoring = manualCover !== null && current().n === coverN();
    manualCover = restoring ? null : current().n;
    render();
    DS.toast(restoring ? "已恢复自动封面" : `已将 v${current().n} 设为项目封面`, { kind: "info", icon: "bookmark" });
  });

  /* ---------- Delete with confirmation ---------- */
  const deleteDialog = $("#delete-dialog");
  let deleting = "";
  const askDelete = (target) => {
    deleting = target;
    $("#delete-title").textContent = target === "version" ? `删除版本 v${current().n}？` : "删除这个图片项目？";
    $("#delete-name").textContent = target === "version" ? current().file : `${project.title} · ${versions.length} 个版本`;
    $("#delete-note").textContent = target === "version"
      ? "只删除该版本的文件，其他版本保留。"
      : "项目和全部版本文件会一起删除，无法撤销。";
    DS.openDialog(deleteDialog);
  };
  $("#delete-version").addEventListener("click", () => askDelete("version"));
  $("#delete-project").addEventListener("click", () => askDelete("project"));
  $("#delete-confirm").addEventListener("click", () => {
    deleteDialog.querySelector("[data-close]").click();
    if (deleting === "project") {
      DS.toast("已删除图片项目", { kind: "info" });
      setTimeout(() => { location.href = "history.html?kind=image"; }, 900);
      return;
    }
    const removed = current().n;
    versions.splice(index, 1);
    if (manualCover === removed) manualCover = null;
    index = Math.min(index, versions.length - 1);
    render();
    DS.toast(`已删除版本 v${removed}`, { kind: "info" });
  });

  /* ---------- Rating, favorite, tags ---------- */
  function renderRating(host) {
    const value = Number(host.dataset.value);
    host.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const fill = Math.max(0, Math.min(1, value - i)) * 100;
      return `<button type="button" aria-label="${i + 1} 星" data-star="${i}"><i data-lucide="star"></i><span class="star-fill" style="--w:${fill}%">${ic("star")}</span></button>`;
    }).join("");
    icons();
  }
  const rating = $(".curation .js-rating");
  renderRating(rating);
  rating.addEventListener("click", (event) => {
    const star = event.target.closest("[data-star]");
    if (!star) return;
    const rect = star.getBoundingClientRect();
    rating.dataset.value = String(Number(star.dataset.star) + (event.clientX - rect.left < rect.width / 2 ? 0.5 : 1));
    renderRating(rating);
    $("#rating-value").textContent = rating.dataset.value;
  });
  $(".curation .rating-clear").addEventListener("click", () => { rating.dataset.value = "0"; renderRating(rating); $("#rating-value").textContent = "未评分"; });
  $("#fav").addEventListener("click", (event) => {
    const fav = event.currentTarget;
    const on = fav.getAttribute("aria-pressed") !== "true";
    fav.setAttribute("aria-pressed", String(on));
    fav.dataset.tip = on ? "取消收藏" : "收藏";
    if (on && !DS.reducedMotion()) fav.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  });

  const tagField = $("#tag-field");
  const addTag = (text) => {
    const value = text.trim();
    if (!value) return;
    if ($$("#tag-input .tag").some((tag) => tag.firstChild.textContent.toLowerCase() === value.toLowerCase())) return;
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

  $("#copy-request").addEventListener("click", () => DS.toast("已复制编辑要求", { kind: "info", icon: "copy" }));

  render();
})();
