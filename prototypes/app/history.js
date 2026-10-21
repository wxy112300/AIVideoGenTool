// History list prototype: same layout rules as src/renderer/pages/history/helpers.ts; media are gradient stand-ins.
(() => {
  const { ic } = window.DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const art = ["linear-gradient(120deg,#1d2b53,#7e2553,#ff004d,#ffa300)", "linear-gradient(140deg,#0f2027,#203a43,#2c5364,#7fb3a6)", "linear-gradient(110deg,#2b1055,#7597de,#d3a4c3,#2b1055)", "linear-gradient(130deg,#3a1c1c,#b5651d,#f2c57c,#3a1c1c)", "linear-gradient(120deg,#0b3d2e,#3f7d4a,#c8d96f,#0b3d2e)", "linear-gradient(150deg,#141e30,#243b55,#9ab3d5,#141e30)", "linear-gradient(135deg,#23074d,#cc5333,#f3a683)", "linear-gradient(160deg,#000428,#004e92,#5fa8d3)"];

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

  const videos = [
    { title: "Continue the same continuous shot as she turns toward the window", model: "MiniMax H3 Continuum", res: "360p", duration: "01:20", ratio: "16 / 9", file: "MINIMAX-H3-CONTINUUM-360p-30s-20261019-140052.mp4", time: "2026-10-19 14:00:52", render: "7分48秒", rating: 4, fav: true },
    { title: "Continue the adult woman and river", model: "MiniMax H3 R2V", res: "360p", duration: "00:50", ratio: "16 / 9", file: "H3-R2V-360p-30s-20261019-135028.mp4", time: "2026-10-19 13:50:28", render: "7分57秒" },
    { title: "人物特写 · 竖屏", model: "MiniMax H3 FL2VA", res: "720p", duration: "00:08", ratio: "9 / 16", file: "H3-720p-8s-20261019-130122.mp4", time: "2026-10-19 13:01:22", render: "3分12秒", rating: 3.5 },
    { title: "The subject maintains the same pose", model: "MiniMax H3 Continuum", res: "480p", duration: "00:12", ratio: "16 / 9", file: "MINIMAX-H3-CONTINUUM-480p-4s-20261008-072819.mp4", time: "2026-10-08 07:28:19", render: "1分22秒" },
    { title: "The pilot jump off the helicopter", model: "MiniMax H3 FL2VA", res: "480p", duration: "00:10", ratio: "4 / 3", file: "H3-480p-10s-20260921-172924.mp4", time: "2026-09-21 17:32:10", render: "2分37秒", fav: true },
    { title: "城市夜景航拍", model: "MiniMax H3 FL2VA", res: "720p", duration: "00:05", ratio: "16 / 9", file: "H3-720p-5s-20260920-221455.mp4", time: "2026-09-20 22:14:55", render: "1分58秒", rating: 5 },
    { title: "霓虹倒影", model: "MiniMax H3 R2V", res: "480p", duration: "00:06", ratio: "9 / 16", file: "H3-R2V-480p-6s-20260918-101010.mp4", time: "2026-09-18 10:10:10", render: "1分40秒" },
    { title: "One continuous realistic cinematic shot", model: "MiniMax H3 Continuum", res: "360p", duration: "00:31", ratio: "16 / 9", file: "H3-360p-30s-20261019-123916.mp4", time: "2026-10-19 12:46:56", render: "7分20秒" }
  ];
  // Image projects: model, pixel size, version count, iterations, latest version (matches renderImageHistoryPage).
  const images = [
    { title: "Change the helicopter color to blue", model: "Qwen Image 2.1 · 官方文生图/图片编辑", size: "736 × 416", ratio: "736 / 416", versions: 5, iterations: 4, file: "QwenImage21_ImageEdit-20260921060455-4a84a501_1_00001_.png", time: "2026-09-21 14:05:34", rating: 4 },
    { title: "Chang the weather to clear and tidy", model: "H3 · 参考编辑（REF2VA）", size: "1344 × 768", ratio: "1344 / 768", versions: 3, iterations: 2, file: "H3Image_ImageEdit-20260916103244-67ca8833_1_00001_.png", time: "2026-09-16 18:34:32" },
    { title: "A single red apple on a white table", model: "Z-Image-Turbo · 快速生成/参考控制", size: "1024 × 1024", ratio: "1 / 1", versions: 1, iterations: 1, file: "ZImageTurbo_ImageEdit-20260901083348-5c87ae46_1_00001_.png", time: "2026-09-01 16:35:51", fav: true },
    { title: "Use every annotation note on the image", model: "Qwen-Image-Edit-2511 · 图片处理", size: "1920 × 1080", ratio: "16 / 9", versions: 3, iterations: 2, file: "QwenEdit_ImageEdit-20260814111516-f444ae5b_1_00001_.png", time: "2026-08-14 19:20:15" },
    { title: "自动抠图", model: "BiRefNet · 自动抠图", size: "3840 × 2160", ratio: "16 / 9", versions: 2, iterations: 1, file: "BiRefNet_BiRefNet-20260813102117-d8d5e7e0_1_00001_.png", time: "2026-08-13 18:21:53", rating: 3 },
    { title: "人像竖幅 · 旗袍", model: "OmniGen2 · 文生图/参考编辑", size: "832 × 1216", ratio: "832 / 1216", versions: 4, iterations: 3, file: "OmniGen2_ImageEdit-20260810091233-77ab21c0_1_00001_.png", time: "2026-08-10 21:12:33", fav: true },
    { title: "Remove the cables", model: "LaMa · 局部移除", size: "1264 × 821", ratio: "1264 / 821", versions: 2, iterations: 1, file: "LaMa_Inpaint-20260805141020-1a2b3c4d_1_00001_.png", time: "2026-08-05 14:10:20" },
    { title: "原始素材 · 机场", model: "原始图片", size: "1760 × 720", ratio: "1760 / 720", versions: 1, iterations: 0, file: "airport-reference.png", time: "2026-08-01 09:00:00" }
  ];

  let kind = "video";
  let filterCountText = "";
  let layout = "masonry";
  let measureScrubber = () => {};
  // A longer, time-ordered sample (bursts of work, then gaps) so the page scrolls like a real library.
  const spread = (base, count, start) => {
    let time = new Date(start).getTime();
    const pad = (value) => String(value).padStart(2, "0");
    return Array.from({ length: count }, (_, index) => {
      if (index) time -= (index % 6 === 5 ? 16 : index % 3 === 0 ? 2.5 : 0.12) * 86400000 * (1 + (index % 7) / 10);
      const date = new Date(time);
      return { ...base[index % base.length], time: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` };
    });
  };
  const library = { video: spread(videos, 60, "2026-10-20T21:30:00"), image: spread(images, 36, "2026-10-18T19:00:00") };
  const gallery = $("#history-grid");
  const records = () => {
    if (window.App?.state?.data === "empty") return [];
    // "最早优先" reverses the time order; other sorts keep the sample order (the time axis hides for them).
    return $("#f-sort")?.value === "最早优先" ? [...library[kind]].reverse() : library[kind];
  };
  const menuMarkup = (record) => `<span class="menu-anchor h-more"><button class="btn btn-icon btn-sm" type="button" data-menu-trigger aria-expanded="false" aria-label="快捷操作">${ic("ellipsis")}</button>
    <div class="menu right" role="menu"><div class="menu-heading h-menu-file">${record.file}</div>
      <button class="menu-item" type="button" data-open>${ic("maximize-2")}查看详情</button>
      ${kind === "video"
        ? `<button class="menu-item" type="button">${ic("copy")}复制文件</button><button class="menu-item" type="button">${ic("link")}复制路径</button><button class="menu-item" type="button">${ic("folder-open")}打开所在文件夹</button><button class="menu-item" type="button">${ic("wand-sparkles")}继续创作</button>`
        : `<button class="menu-item" type="button">${ic("image")}复制图片</button><button class="menu-item" type="button">${ic("copy")}复制文件</button><button class="menu-item" type="button">${ic("folder-open")}打开所在位置</button><button class="menu-item" type="button">${ic("video")}开始创作视频</button><button class="menu-item" type="button">${ic("wand-sparkles")}继续编辑图片</button>`}
      <div class="menu-sep"></div><button class="menu-item destructive" type="button">${ic("trash-2")}${kind === "video" ? "删除" : "删除图片项目"}</button></div></span>`;
  const curation = (record) => `<div class="h-curation">${record.rating ? `<span class="chip-media">${record.rating} ★</span>` : ""}${record.fav ? `<span class="chip-media fav">${ic("heart")}</span>` : ""}</div>`;
  const cardMarkup = (record, index) => kind === "video" ? `
    <article class="h-card lit" data-index="${index}" data-date="${record.time.slice(0, 10)}" tabindex="0" role="button" aria-label="${record.title}，打开详情">
      <div class="h-media" style="--ratio:${record.ratio}">
        <div class="art" style="background-image:${art[index % art.length]}"></div>
        <label class="check h-batch" hidden><input type="checkbox" aria-label="选择"></label>
        <div class="h-badges"><span class="chip-media model" data-tip="${record.model}"><span>${record.model}</span></span><span class="chip-media">${record.res}</span><span class="chip-media num">${record.duration}</span></div>
        ${curation(record)}
        <span class="chip-media h-preview-state">${ic("play")}预览中</span>
        <button type="button" class="h-progress" role="slider" aria-label="调整预览位置" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></button>
      </div>
      <div class="h-copy">
        <span class="h-title${record.title.length > 24 ? " long" : ""}" data-tip="${record.file}" data-tip-title="${record.title}"><span>${record.title}</span></span>
        <span class="h-meta"><span>${record.time}</span><span>渲染 ${record.render}</span></span>
        ${menuMarkup(record)}
      </div>
    </article>` : `
    <article class="h-card lit" data-index="${index}" data-date="${record.time.slice(0, 10)}" tabindex="0" role="button" aria-label="${record.title}，打开详情">
      <div class="h-media" style="--ratio:${record.ratio}">
        <div class="art still" style="background-image:${art[(index + 3) % art.length]}"></div>
        <label class="check h-batch" hidden><input type="checkbox" aria-label="选择"></label>
        <div class="h-badges"><span class="chip-media model" data-tip="${record.model}"><span>${record.model}</span></span><span class="chip-media num">${record.size}</span>${record.versions > 1 ? `<span class="chip-media num">${record.versions} 个版本</span>` : ""}</div>
        ${curation(record)}
        <span class="chip-media h-iter">${ic("workflow")}${record.iterations ? `${record.iterations} 次迭代` : "原始素材"}</span>
      </div>
      <div class="h-copy">
        <span class="h-title${record.title.length > 24 ? " long" : ""}" data-tip="${record.file}" data-tip-title="${record.title}"><span>${record.title}</span></span>
        <span class="h-meta"><span>${record.time}</span><span>最新版本 v${record.versions}</span></span>
        ${menuMarkup(record)}
      </div>
    </article>`;

  let loading = false;
  function layoutHistory() {
    if (loading) return;
    const list = records();
    $("#history-empty").hidden = list.length > 0;
    $(".history-stage").hidden = list.length === 0;
    $("#empty-title").textContent = kind === "video" ? "还没有视频" : "还没有图片";
    $("#history-count").textContent = list.length && filterCountText ? filterCountText : `${list.length ? (kind === "video" ? 137 : 58) : 0} ${kind === "video" ? "个视频" : "个图片项目"}`;
    if (!list.length) { $("#batch-count").textContent = "已选 0 / 0"; measureScrubber(); return; }
    // Re-layout (resize, scrollbar changes when a dialog opens) must not drop the batch selection.
    const keep = new Set($$(".h-card.selected", gallery).map((card) => card.dataset.index));
    const width = gallery.clientWidth;
    const scroll = window.scrollY;
    gallery.className = `history-gallery ${layout} lit-group${gallery.classList.contains("batching") ? " batching" : ""}`;
    const nodes = list.map((record, index) => Object.assign(document.createElement("template"), { innerHTML: cardMarkup(record, index).trim() }).content.firstElementChild);
    if (layout === "album") {
      gallery.style.setProperty("--cols", String(albumColumns(width)));
      gallery.replaceChildren(...nodes);
    } else {
      const count = masonryColumns(width);
      const columnWidth = (width - 10 * (count - 1)) / count;
      const heights = Array(count).fill(0);
      const columns = Array.from({ length: count }, () => Object.assign(document.createElement("div"), { className: "col" }));
      list.forEach((record, index) => {
        const [w, h] = record.ratio.split("/").map(Number);
        const shortest = heights.indexOf(Math.min(...heights));
        heights[shortest] += columnWidth * (h / w) + 66 + 10;
        columns[shortest].append(nodes[index]);
      });
      gallery.replaceChildren(...columns);
    }
    if (gallery.classList.contains("batching")) $$(".h-batch", gallery).forEach((label) => { label.hidden = false; });
    $$(".h-card", gallery).forEach((card) => { if (keep.has(card.dataset.index)) { card.classList.add("selected"); card.querySelector(".h-batch input").checked = true; } });
    $("#batch-count").textContent = `已选 ${keep.size} / ${list.length}`;
    DS.icons();
    window.scrollTo({ top: scroll });
    measureScrubber();
  }

  /* ---------- Controls ---------- */
  // Covers appear only after they are ready: skeletons first, then a short staggered reveal (no black flash).
  const revealCards = () => $$(".h-card", gallery).filter((card) => card.getBoundingClientRect().top < innerHeight).forEach((card, index) =>
    card.animate(DS.reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(8px) scale(.985)" }, { opacity: 1, transform: "none" }],
      { duration: 260, delay: Math.min(index, 12) * 28, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
  const skeletonThenReveal = () => {
    const shapes = layout === "album" ? Array(12).fill("1 / 1") : ["16 / 9", "9 / 16", "4 / 3", "16 / 9", "1 / 1", "16 / 9", "3 / 4", "16 / 9"];
    gallery.replaceChildren(Object.assign(document.createElement("div"), { className: `h-skeletons ${layout}`, innerHTML: shapes.map((ratio) => `<div class="skeleton" style="aspect-ratio:${ratio}"></div>`).join("") }));
    loading = true;
    setTimeout(() => { loading = false; layoutHistory(); revealCards(); }, 420);
  };
  $("#history-kind").addEventListener("change", (event) => {
    kind = event.detail.value;
    if (gallery.classList.contains("batching")) setBatch(false);
    skeletonThenReveal();
  });
  // Detail pages return to the mode they came from (image detail links to ?kind=image).
  if (new URLSearchParams(location.search).get("kind") === "image") {
    kind = "image";
    $$("#history-kind button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === "image")));
    layoutHistory();
  }
  $("#history-layout").addEventListener("change", () => {
    layout = $$("#history-layout button")[1].getAttribute("aria-pressed") === "true" ? "album" : "masonry";
    const animation = DS.flip(() => $$(".h-card", gallery));
    layoutHistory();
    animation.play();
  });
  let lastWidth = 0;
  new ResizeObserver(() => { if (gallery.clientWidth !== lastWidth) { lastWidth = gallery.clientWidth; layoutHistory(); } }).observe(gallery);
  document.addEventListener("proto-state", () => layoutHistory());
  gallery.addEventListener("pointermove", (event) => {
    const title = event.target.closest(".h-card")?.querySelector(".h-title.long");
    if (title) title.style.setProperty("--shift", `-${Math.max(0, title.firstElementChild.scrollWidth - title.clientWidth + 8)}px`);
  });
  // Opening a card navigates to the kind-specific detail page; controls inside the card keep their own behavior.
  const openCard = (card) => { location.href = kind === "video" ? "video-detail.html" : "image-detail.html"; };
  gallery.addEventListener("click", (event) => {
    if (event.target.closest("[data-open]")) return openCard();
    const card = event.target.closest(".h-card");
    if (!card || event.target.closest("button, input, label, .menu") || gallery.classList.contains("batching")) return;
    openCard(card);
  });
  gallery.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target.matches(".h-card")) { event.preventDefault(); openCard(event.target); } });

  /* ---------- Filter bar: the toolbar button only shows / hides it; every condition is edited in place ---------- */
  const tagCounts = {
    video: [["写实", 41], ["横屏", 38], ["人物", 31], ["城市", 24], ["特写", 22], ["精选", 21], ["室内", 20], ["夜景", 19], ["雨夜", 18], ["首尾帧", 17], ["运镜", 16], ["航拍", 15], ["日落", 14], ["街拍", 13], ["竖屏", 13], ["霓虹", 12], ["推镜", 12], ["长视频", 12], ["海边", 11], ["无人机", 11], ["慢动作", 10], ["客户A", 10], ["延时", 9], ["手持", 9], ["参考图", 9], ["车流", 8], ["胶片", 8], ["测试", 7], ["动物", 7], ["古风", 7], ["森林", 6], ["环绕", 6], ["赛博朋克", 6], ["废片", 6], ["客户B", 6], ["雪景", 5], ["复古", 5], ["旗袍", 4], ["待修", 4], ["动画", 3]],
    image: [["人像", 18], ["参考图", 15], ["产品", 12], ["城市", 9], ["抠图", 8], ["航拍", 7], ["海报", 6], ["测试", 5], ["竖幅", 5], ["风景", 4], ["旗袍", 3], ["线稿", 2]]
  };
  const modelNames = {
    video: [["MiniMax H3 FL2VA", 64], ["MiniMax H3 Ref2VA", 41], ["MiniMax H3 Continuum", 32]],
    image: [["Qwen Image 2.1", 27], ["OmniGen2", 14], ["BiRefNet", 8], ["LaMa", 5], ["原始图片", 4]]
  };
  const tagState = { video: new Map([["城市", "include"], ["雨夜", "include"], ["测试", "exclude"]]), image: new Map() };
  const modelState = { video: new Set(["MiniMax H3 FL2VA"]), image: new Set() };
  const durationStops = [0, 1, 3, 5, 10, 15, 30, 60];
  const durationSorts = $$("#f-sort option[data-kind='video']");
  const ratingInputs = $$("#f-rating input");
  const stars = (value) => `${value / 2}★`;
  const tags = () => tagState[kind];
  const models = () => modelState[kind];

  const paintRating = () => {
    const [low, high] = ratingInputs.map((input) => Number(input.value));
    $("#f-rating").style.setProperty("--lo", String(low / 10));
    $("#f-rating").style.setProperty("--hi", String(high / 10));
    // Keep the thumb that can still move on top when both meet at an end.
    ratingInputs[0].style.zIndex = low >= 9 ? "2" : "1";
    $("#f-rating-value").textContent = low === 0 && high === 10 ? "不限" : high === 10 ? `≥ ${stars(low)}` : low === 0 ? `≤ ${stars(high)}` : `${low / 2}–${stars(high)}`;
  };
  ratingInputs.forEach((input, index) => input.addEventListener("input", () => {
    const [low, high] = ratingInputs.map((item) => Number(item.value));
    if (low > high) ratingInputs[index].value = String(index === 0 ? high : low);
    paintRating();
    renderFilters();
  }));
  const paintDuration = () => {
    const step = Number($("#f-dur").value);
    $("#f-dur-wrap").style.setProperty("--fill", `${(step / 7) * 100}%`);
    $("#f-dur-value").textContent = step ? `≥ ${durationStops[step]} 秒` : "不限";
  };
  $("#f-dur").addEventListener("input", () => { paintDuration(); renderFilters(); });

  const activeCount = () => {
    let count = tags().size + (models().size ? 1 : 0);
    if ($("#f-fav").getAttribute("aria-pressed") === "true") count += 1;
    if (ratingInputs[0].value !== "0" || ratingInputs[1].value !== "10") count += 1;
    if (kind === "video" && $("#f-dur").value !== "0") count += 1;
    return count;
  };
  const isOpen = (trigger) => $(trigger).getAttribute("aria-expanded") === "true";

  /* Models: multi-select; the trigger keeps a fixed width and summarises the choice */
  const renderModels = () => {
    const chosen = [...models()];
    $("#model-value").textContent = !chosen.length ? "全部" : chosen.length === 1 ? chosen[0] : `${chosen.length} 个模型`;
    $("#model-trigger").dataset.tip = chosen.length ? chosen.join("、") : "全部模型";
    $("#model-picked").textContent = chosen.length ? `已选 ${chosen.length}` : "未限制";
    $("#model-clear").disabled = !chosen.length;
    $("#model-list").innerHTML = modelNames[kind].map(([name, count]) => `<label class="model-opt"><input type="checkbox" value="${name}"${models().has(name) ? " checked" : ""}><span class="model-name">${name}</span><span class="caption num">${count}</span></label>`).join("");
  };
  $("#model-list").addEventListener("change", (event) => {
    if (event.target.checked) models().add(event.target.value); else models().delete(event.target.value);
    renderFilters();
  });
  $("#model-clear").addEventListener("click", () => { models().clear(); renderFilters(); });

  /* Tags: everything lives in the picker; + includes, - excludes, the same button again clears */
  let tagOrder = [];
  let activeOption = 0;
  const orderTags = () => {
    const query = $("#tag-search").value.trim().toLowerCase();
    // Order is fixed while the picker is open so rows never jump under the pointer.
    tagOrder = tagCounts[kind].filter(([name]) => name.toLowerCase().includes(query))
      .sort(([a], [b]) => Number(tags().has(b)) - Number(tags().has(a)));
    activeOption = 0;
  };
  const renderTagPicker = () => {
    const picked = [...tags()];
    $("#tag-picked-zone").hidden = picked.length === 0;
    $("#tag-picked-count").textContent = `已选 ${picked.length}`;
    $("#tag-picked").innerHTML = picked.map(([name, state]) => `<span class="fchip ${state}" data-tag="${name}"><button class="fchip-edit" type="button" data-tip="${state === "include" ? "改为排除" : "改为包含"}">${state === "include" ? "+" : "−"}<b>${name}</b></button><button class="fchip-x" type="button" aria-label="移除 ${name}">${ic("x")}</button></span>`).join("");
    activeOption = Math.min(activeOption, Math.max(0, tagOrder.length - 1));
    $("#tag-list").innerHTML = tagOrder.length ? tagOrder.map(([name, count], index) => {
      const state = tags().get(name) ?? "";
      return `<div class="tag-opt${index === activeOption ? " active" : ""}" role="option" data-tag="${name}" data-state="${state}" aria-selected="${Boolean(state)}">
        <span class="tag-name">${name}</span><span class="caption num">${count}</span>
        <button class="tag-act" type="button" data-set="include" aria-pressed="${state === "include"}" aria-label="包含 ${name}">${ic("plus")}</button>
        <button class="tag-act exclude" type="button" data-set="exclude" aria-pressed="${state === "exclude"}" aria-label="排除 ${name}">${ic("minus")}</button></div>`;
    }).join("") : `<p class="caption tag-empty">没有匹配的标签</p>`;
  };
  const renderTagTrigger = () => {
    const included = [...tags()].filter(([, state]) => state === "include").length;
    const excluded = tags().size - included;
    $("#tag-value").innerHTML = tags().size
      ? `${included ? `<span class="tv include">+${included}</span>` : ""}${excluded ? `<span class="tv exclude">−${excluded}</span>` : ""}`
      : "全部";
    $("#tag-browse").dataset.tip = tags().size ? [...tags()].map(([name, state]) => `${state === "include" ? "+" : "−"}${name}`).join("  ") : "全部标签";
  };
  const setTag = (name, state) => {
    if (!state || tags().get(name) === state) tags().delete(name); else tags().set(name, state);
    renderFilters();
  };
  $("#tag-browse").addEventListener("click", () => setTimeout(() => { if (!isOpen("#tag-browse")) return; $("#tag-search").value = ""; orderTags(); renderTagPicker(); DS.icons(); $("#tag-search").focus(); }, 0));
  $("#tag-search").addEventListener("input", () => { orderTags(); renderTagPicker(); DS.icons(); });
  $("#tag-list").addEventListener("click", (event) => {
    const row = event.target.closest(".tag-opt");
    if (!row) return;
    const action = event.target.closest(".tag-act");
    setTag(row.dataset.tag, action ? action.dataset.set : event.shiftKey ? "exclude" : "include");
  });
  $("#tag-picked").addEventListener("click", (event) => {
    const chip = event.target.closest(".fchip");
    if (!chip) return;
    const name = chip.dataset.tag;
    if (event.target.closest(".fchip-x")) setTag(name, "");
    else setTag(name, tags().get(name) === "include" ? "exclude" : "include");
  });
  $("#tag-clear").addEventListener("click", () => { tags().clear(); renderFilters(); });
  $("#tag-search").addEventListener("keydown", (event) => {
    const rows = $$(".tag-opt");
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activeOption = Math.max(0, Math.min(rows.length - 1, activeOption + (event.key === "ArrowDown" ? 1 : -1)));
      rows.forEach((row, index) => row.classList.toggle("active", index === activeOption));
      rows[activeOption]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && rows[activeOption]) {
      event.preventDefault();
      setTag(rows[activeOption].dataset.tag, event.shiftKey ? "exclude" : "include");
    }
  });

  function renderFilters() {
    const count = activeCount();
    const total = kind === "video" ? 137 : 58;
    const visible = count ? Math.max(3, Math.round(total * Math.pow(0.7, count))) : total;
    $("#filter-badge").hidden = count === 0;
    $("#filter-badge").textContent = String(count);
    $("#filter-toggle").dataset.tip = count ? `筛选 · ${count} 个条件` : "筛选";
    const noun = kind === "video" ? "个视频" : "个图片项目";
    if (records().length) $("#history-count").textContent = filterCountText = count ? `${visible} / ${total} ${noun}` : `${total} ${noun}`;
    $("#history-count").dataset.tip = count ? `筛选后显示 ${visible} 个，共 ${total} 个` : "";
    $("#lane-clear").disabled = count === 0 && $("#f-sort").selectedIndex === 0;
    renderModels();
    renderTagTrigger();
    if (isOpen("#tag-browse")) renderTagPicker();
    syncContextBar();
    DS.icons();
  }
  const syncContextBar = () => {
    const bar = $("#context-bar");
    bar.hidden = $("#filter-lane").hidden && $("#batch-bar").hidden;
    bar.classList.toggle("batching", !$("#batch-bar").hidden);
    measureScrubber();
  };

  $("#filter-toggle").addEventListener("click", () => {
    const open = $("#filter-toggle").getAttribute("aria-pressed") !== "true";
    $("#filter-toggle").setAttribute("aria-pressed", String(open));
    $("#filter-lane").hidden = !open;
    syncContextBar();
    if (open) DS.animateIn($("#filter-lane"));
  });
  $("#f-fav").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
    renderFilters();
  });
  $("#f-sort").addEventListener("change", renderFilters);
  $("#lane-clear").addEventListener("click", () => {
    $("#f-sort").selectedIndex = 0; $("#f-sort").dispatchEvent(new Event("change"));
    $("#f-fav").setAttribute("aria-pressed", "false");
    ratingInputs[0].value = "0"; ratingInputs[1].value = "10"; paintRating();
    $("#f-dur").value = "0"; paintDuration();
    models().clear();
    tags().clear();
    renderFilters();
  });
  // Image projects have no duration: hide that filter and its sort options.
  const applyKindToFilters = () => {
    $$(".filter-lane .fgroup[data-kind='video']").forEach((node) => { node.hidden = kind !== "video"; });
    if (kind === "video") durationSorts.forEach((option) => { if (!option.parentElement) $("#f-sort").append(option); });
    else { if (durationSorts.some((option) => option.selected)) $("#f-sort").selectedIndex = 0; durationSorts.forEach((option) => option.remove()); }
    $("#f-sort").dispatchEvent(new Event("change"));
  };
  $("#history-kind").addEventListener("change", applyKindToFilters);
  paintRating();
  paintDuration();

  /* ---------- Batch ---------- */
  const setBatch = (on) => {
    $("#batch-toggle").setAttribute("aria-pressed", String(on));
    $("#batch-bar").hidden = !on;
    syncContextBar();
    gallery.classList.toggle("batching", on);
    $$(".h-batch", gallery).forEach((label) => { label.hidden = !on; label.querySelector("input").checked = false; });
    $$(".h-card.selected", gallery).forEach((card) => card.classList.remove("selected"));
    updateBatch();
  };
  const updateBatch = () => {
    const count = $$(".h-card.selected", gallery).length;
    const total = records().length;
    $("#batch-count").textContent = `已选 ${count} / ${total}`;
    $("#batch-all").innerHTML = `${ic(count === total && total ? "square-check" : "square")}全选`;
    $$("[data-batch-action]").forEach((button) => { button.disabled = count === 0; });
    DS.icons();
  };

  /* ---------- Batch dialogs: tags (common / partial / add) and delete ---------- */
  const selectedCards = () => $$(".h-card.selected", gallery);
  const cardTags = { video: new Map(), image: new Map() };
  const tagsOf = (index) => {
    const store = cardTags[kind];
    if (!store.has(index)) {
      const pool = tagCounts[kind].map(([name]) => name);
      store.set(index, new Set([pool[0], pool[1 + (index % 4)], ...(index % 2 ? [] : [pool[6]])]));
    }
    return store.get(index);
  };
  const renderBatchTags = () => {
    const sets = selectedCards().map((card) => tagsOf(Number(card.dataset.index)));
    const counts = new Map();
    sets.forEach((set) => set.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1)));
    const common = [...counts].filter(([, n]) => n === sets.length);
    const partial = [...counts].filter(([, n]) => n < sets.length);
    $("#batch-tags-sub").textContent = `已选 ${sets.length} 个${kind === "video" ? "视频" : "图片项目"}`;
    $("#bt-common").innerHTML = common.length
      ? common.map(([name]) => `<span class="fchip" data-tag="${name}"><span class="fchip-edit"><b>${name}</b></span><button class="fchip-x" type="button" data-remove aria-label="从全部移除 ${name}">${ic("x")}</button></span>`).join("")
      : `<span class="caption">所选项目没有共同标签</span>`;
    $("#bt-partial-zone").hidden = partial.length === 0;
    $("#bt-partial").innerHTML = partial.map(([name, n]) => `<span class="fchip partial" data-tag="${name}"><button class="fchip-edit" type="button" data-add data-tip="添加到全部所选项目">${ic("plus")}<b>${name}</b><span class="caption num">${n}/${sets.length}</span></button><button class="fchip-x" type="button" data-remove aria-label="移除 ${name}">${ic("x")}</button></span>`).join("");
    $("#bt-suggest").innerHTML = tagCounts[kind].filter(([name]) => !counts.has(name)).slice(0, 8)
      .map(([name]) => `<button class="ftag-sug" type="button" data-tag="${name}">${name}</button>`).join("");
    DS.icons();
  };
  const applyToSelected = (name, add) => {
    selectedCards().forEach((card) => { const set = tagsOf(Number(card.dataset.index)); if (add) set.add(name); else set.delete(name); });
    renderBatchTags();
  };
  $("#batch-tags").addEventListener("click", () => { $("#bt-input").value = ""; renderBatchTags(); DS.openDialog($("#batch-tags-dialog")); });
  $("#batch-tags-dialog").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-tag]");
    if (!chip) return;
    if (event.target.closest("[data-remove]")) applyToSelected(chip.dataset.tag, false);
    else if (event.target.closest("[data-add]") || chip.matches(".ftag-sug")) applyToSelected(chip.dataset.tag, true);
  });
  $("#bt-input").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.value.trim()) return;
    event.preventDefault();
    applyToSelected(event.target.value.trim(), true);
    event.target.value = "";
  });

  $("#batch-delete").addEventListener("click", () => {
    const cards = selectedCards();
    const list = records();
    const noun = kind === "video" ? "视频" : "图片项目";
    const titles = cards.map((card) => list[Number(card.dataset.index)].title);
    $("#batch-delete-title").textContent = `删除 ${cards.length} 个${noun}？`;
    $("#batch-delete-names").textContent = titles.length > 2 ? `${titles.slice(0, 2).join("、")} 等 ${titles.length} 个` : titles.join("、");
    $("#batch-delete-thumbs").innerHTML = cards.slice(0, 6).map((card) => `<span style="background-image:${card.querySelector(".art").style.backgroundImage}"></span>`).join("")
      + (cards.length > 6 ? `<span class="more num">+${cards.length - 6}</span>` : "");
    $("#batch-delete-note").textContent = kind === "video" ? "记录与全部版本文件会一起删除，无法撤销。" : "项目与全部版本文件会一起删除，无法撤销。";
    $("#batch-delete-confirm span").textContent = `删除 ${cards.length} 个`;
    DS.openDialog($("#batch-delete-dialog"));
  });
  $("#batch-delete-confirm").addEventListener("click", () => {
    const cards = selectedCards();
    $("#batch-delete-dialog [data-close]").click();
    cards.forEach((card) => { card.classList.remove("selected"); DS.animateOut(card); });
    DS.toast(`已删除 ${cards.length} 个项目。`, { kind: "info" });
    setTimeout(updateBatch, 0);
  });
  $("#batch-copy").addEventListener("click", () => DS.toast(`已复制 ${selectedCards().length} 个文件。`, { kind: "success", icon: "copy" }));
  $("#batch-toggle").addEventListener("click", () => setBatch($("#batch-toggle").getAttribute("aria-pressed") !== "true"));
  $("#batch-exit").addEventListener("click", () => setBatch(false));
  $("#batch-all").addEventListener("click", () => {
    const all = $$(".h-card.selected", gallery).length !== records().length;
    $$(".h-card", gallery).forEach((card) => { card.classList.toggle("selected", all); card.querySelector(".h-batch input").checked = all; });
    updateBatch();
  });
  gallery.addEventListener("change", (event) => { const card = event.target.closest(".h-card"); if (card) { card.classList.toggle("selected", event.target.checked); updateBatch(); } });
  gallery.addEventListener("click", (event) => {
    const card = event.target.closest(".h-card");
    if (!card || !gallery.classList.contains("batching") || event.target.closest("button, input, label, .menu")) return;
    const input = card.querySelector(".h-batch input");
    input.checked = !input.checked;
    card.classList.toggle("selected", input.checked);
    updateBatch();
  });

  /* ---------- Time axis: a slim scrubber in the right page margin (no layout column) ---------- */
  // Rest: a hairline rail + small thumb. Scrolling shows the current date beside the thumb;
  // hovering / dragging expands month labels, day dots and a pointer date preview. Hidden for non-time sorts.
  const scrubber = $("#scrubber");
  document.body.append(scrubber); // fixed layer must sit outside the container-query shell
  const track = $("#ts-track");
  const thumb = $("#ts-thumb");
  const bubble = $("#ts-bubble");
  const hover = $("#ts-hover");
  let groups = [];
  let idleTimer = 0;
  let dragging = false;
  const pad2 = (value) => String(value).padStart(2, "0");
  const weekday = (key) => "日一二三四五六"[new Date(`${key}T12:00:00`).getDay()];
  const dayLabel = (key) => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const stickyOffset = () => {
    const bar = $("#context-bar");
    return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 64)
      + ($(".history-heading")?.offsetHeight ?? 0) + (bar && !bar.hidden ? bar.offsetHeight + 10 : 0) + 8;
  };
  const isTimeSort = () => $("#f-sort").selectedIndex <= 1;

  measureScrubber = () => {
    const cards = $$(".h-card", gallery);
    const max = maxScroll();
    const show = cards.length > 0 && isTimeSort() && max > 240 && !$(".history-stage").hidden;
    scrubber.hidden = !show;
    if (!show) return;
    // Geometry: centred in the right page margin, between the sticky header stack and the window bottom.
    const box = gallery.getBoundingClientRect();
    const margin = document.documentElement.clientWidth - box.right;
    const top = stickyOffset() + 4;
    scrubber.style.left = `${Math.round(box.right + margin / 2)}px`;
    scrubber.style.top = `${top}px`;
    // Bottom stops above the back-to-top button.
    scrubber.style.height = `${innerHeight - top - 76}px`;
    // One group per day; its position is where the page scrolls to reveal that day's first card.
    const offset = stickyOffset();
    const byDay = new Map();
    cards.forEach((card) => {
      const at = card.getBoundingClientRect().top + scrollY - offset;
      const day = byDay.get(card.dataset.date);
      if (!day) byDay.set(card.dataset.date, { key: card.dataset.date, scroll: at, count: 1 });
      else { day.scroll = Math.min(day.scroll, at); day.count += 1; }
    });
    groups = [...byDay.values()].map((group) => ({ ...group, progress: Math.min(1, Math.max(0, group.scroll / max)) }));
    // Month labels (year on year change) thinned to keep >= 22px apart; days are dots >= 5px apart.
    const height = track.clientHeight;
    let lastLabel = -99, lastDot = -99, lastMonth = "", lastYear = "";
    const marks = [];
    groups.forEach((group, index) => {
      const y = group.progress * height;
      const month = group.key.slice(0, 7);
      if (month !== lastMonth) {
        const year = group.key.slice(0, 4);
        const label = year !== lastYear && lastYear ? `${year}年${Number(group.key.slice(5, 7))}月` : `${Number(group.key.slice(5, 7))}月`;
        if (y - lastLabel >= 22) { marks.push(`<button class="ts-month${year !== lastYear && lastYear ? " year" : ""}" type="button" tabindex="-1" style="top:${y}px" data-group="${index}">${label}</button>`); lastLabel = y; }
        lastMonth = month; lastYear = year;
      }
      if (y - lastDot >= 5) { marks.push(`<span class="ts-day" style="top:${y}px"></span>`); lastDot = y; }
    });
    $("#ts-marks").innerHTML = marks.join("");
    paintScrubber();
  };
  const groupAtScroll = (y) => {
    let found = groups[0];
    for (const group of groups) if (group.scroll <= y + 2) found = group; else break;
    return found;
  };
  const groupAtProgress = (progress) => groups.reduce((best, group) => (Math.abs(group.progress - progress) < Math.abs(best.progress - progress) ? group : best), groups[0]);
  function paintScrubber() {
    if (scrubber.hidden || !groups.length) return;
    const max = maxScroll();
    const progress = max ? Math.min(1, scrollY / max) : 0;
    const y = progress * track.clientHeight;
    thumb.style.top = bubble.style.top = `${y}px`;
    const group = groupAtScroll(scrollY);
    bubble.firstElementChild.textContent = dayLabel(group.key);
    bubble.lastElementChild.textContent = `${group.key.slice(0, 4)} · 周${weekday(group.key)} · ${group.count} 个`;
    thumb.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    thumb.setAttribute("aria-valuetext", `${group.key.slice(0, 4)}年${dayLabel(group.key)}`);
    $$(".ts-month", scrubber).forEach((mark) => mark.classList.toggle("current", groups[Number(mark.dataset.group)]?.key.slice(0, 7) === group.key.slice(0, 7)));
  }
  const wake = () => {
    scrubber.classList.add("is-active");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!dragging && !scrubber.matches(":hover, :focus-within")) scrubber.classList.remove("is-active"); }, 1200);
  };
  addEventListener("scroll", () => { if (scrubber.hidden) return; paintScrubber(); wake(); }, { passive: true });
  addEventListener("resize", () => measureScrubber());
  const progressAt = (clientY) => {
    const box = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientY - box.top) / box.height));
  };
  const goTo = (group, smooth) => scrollTo({ top: Math.max(0, group.scroll), behavior: smooth && !DS.reducedMotion() ? "smooth" : "auto" });
  track.addEventListener("pointermove", (event) => {
    if (dragging || !groups.length) return;
    const group = groupAtProgress(progressAt(event.clientY));
    hover.style.top = `${progressAt(event.clientY) * track.clientHeight}px`;
    hover.firstElementChild.textContent = `${dayLabel(group.key)} · ${group.count} 个`;
  });
  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".ts-month")) return;
    event.preventDefault();
    dragging = true;
    scrubber.classList.add("is-dragging", "is-active");
    track.setPointerCapture(event.pointerId);
    thumb.focus({ preventScroll: true });
    const move = (moveEvent) => scrollTo({ top: progressAt(moveEvent.clientY) * maxScroll(), behavior: "auto" });
    move(event);
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", () => {
      dragging = false;
      scrubber.classList.remove("is-dragging");
      track.removeEventListener("pointermove", move);
      wake();
    }, { once: true });
  });
  $("#ts-marks").addEventListener("click", (event) => {
    const mark = event.target.closest(".ts-month");
    if (mark) goTo(groups[Number(mark.dataset.group)], true);
  });
  // Keyboard: arrows step by day, Page Up / Down by month, Home / End to the ends.
  thumb.addEventListener("keydown", (event) => {
    if (!groups.length) return;
    const current = groups.indexOf(groupAtScroll(scrollY));
    const monthOf = (index) => groups[index].key.slice(0, 7);
    let next = current;
    if (event.key === "ArrowDown") next = Math.min(groups.length - 1, current + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, current - 1);
    else if (event.key === "PageDown") { next = current; while (next < groups.length - 1 && monthOf(next) === monthOf(current)) next += 1; }
    else if (event.key === "PageUp") { next = current; while (next > 0 && monthOf(next - 1) === monthOf(current)) next -= 1; if (next === current && next > 0) { next -= 1; while (next > 0 && monthOf(next - 1) === monthOf(next)) next -= 1; } }
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = groups.length - 1;
    else return;
    event.preventDefault();
    goTo(groups[next], false);
    wake();
  });
  $("#f-sort").addEventListener("change", () => { layoutHistory(); });

  skeletonThenReveal();
  applyKindToFilters();
})();
