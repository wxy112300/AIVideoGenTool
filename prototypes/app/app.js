// Page prototype frame: shell, prototype states, tabs and design-system wiring.
(() => {
  const DS = window.DS;
  const { ic } = DS;
  const root = document.documentElement;
  const body = document.body;
  const page = body.dataset.page;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  /* ---------- Appearance (shared with the Settings appearance panel) ---------- */
  const accents = [
    ["azure", "晴蓝", "#0090ff"], ["sky", "天空", "#64d2ff"], ["lagoon", "浅海", "#40c8e0"], ["ocean", "海蓝", "#0a84ff"],
    ["orange", "橙", "#ff9f0a"], ["green", "绿", "#30d158"], ["red", "红", "#ff453a"], ["mono", "白", "#eeeeee"]
  ];
  const appearance = { accent: "azure", palette: "graphite", depth: "1", motion: "system", ...read("lvs-proto-appearance") };
  function setAppearance(patch) {
    Object.assign(appearance, patch);
    write("lvs-proto-appearance", appearance);
    root.dataset.accent = appearance.accent;
    root.dataset.palette = appearance.palette;
    root.dataset.depth = appearance.depth;
    if (appearance.motion === "reduced") root.dataset.motion = "reduced"; else delete root.dataset.motion;
    document.dispatchEvent(new CustomEvent("appearance", { detail: { ...appearance } }));
  }

  /* ---------- Shell ---------- */
  const nav = [
    ["create", "create.html", "wand-sparkles", "创建"],
    ["queue", "queue.html", "list-video", "队列"],
    ["history", "history.html", "images", "历史"],
    ["settings", "settings.html", "settings-2", "设置"]
  ];
  const navPage = page === "video-detail" || page === "image-detail" ? "history" : page;
  const shell = $("[data-shell]");
  if (shell) {
    shell.className = "topbar";
    shell.innerHTML = `
      <a class="brand" href="create.html" aria-label="返回创建页"><span class="brand-mark">${ic("play")}</span><span>Local Video Studio</span><span class="brand-version">v0.66.5</span></a>
      <div class="topbar-tools">
        <div class="monitor num" aria-label="资源监视"><span>CPU <b data-mon="cpu">12%</b></span><span>GPU <b data-mon="gpu">87%</b></span><span data-mon="temp">64°</span><span>RAM <b data-mon="ram">41%</b> 26.1/64 GB</span><span>VRAM <b data-mon="vram">76%</b> 18.2/24 GB</span></div>
        <nav class="nav" aria-label="主导航">${nav.map(([id, href, icon, label]) =>
          `<a href="${href}"${id === navPage ? ' aria-current="page"' : ""}>${ic(icon)}${label}${id === "queue" ? '<span class="badge count">2</span>' : ""}</a>`).join("")}</nav>
      </div>`;
  }
  // Sticky offsets for page headings and side navigation follow the real header heights.
  const measure = () => {
    if (shell) root.style.setProperty("--topbar-h", `${shell.offsetHeight}px`);
    const heading = $(".page-heading.sticky, .detail-bar.sticky");
    if (heading) root.style.setProperty("--heading-h", `${heading.offsetHeight}px`);
  };
  new ResizeObserver(measure).observe(document.body);
  measure();
  const backTop = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-icon btn-gray back-top", innerHTML: ic("arrow-up") });
  backTop.setAttribute("aria-label", "返回顶部");
  backTop.dataset.tip = "返回顶部";
  backTop.addEventListener("click", () => scrollTo({ top: 0, behavior: DS.reducedMotion() ? "auto" : "smooth" }));
  body.append(backTop);
  addEventListener("scroll", () => backTop.toggleAttribute("data-show", scrollY > 600), { passive: true });

  /* ---------- Motion: live telemetry tweens; leaving a page fades out 90ms before the next page fades in ---------- */
  const drift = (value, spread, min, max) => Math.max(min, Math.min(max, value + (Math.random() - .5) * spread));
  const telemetry = { cpu: 12, gpu: 87, temp: 64, ram: 41, vram: 76 };
  setInterval(() => {
    if (document.hidden) return;
    telemetry.cpu = drift(telemetry.cpu, 10, 4, 60); telemetry.gpu = drift(telemetry.gpu, 14, 40, 99); telemetry.temp = drift(telemetry.temp, 4, 52, 78);
    telemetry.ram = drift(telemetry.ram, 2, 30, 60); telemetry.vram = drift(telemetry.vram, 3, 60, 92);
    $$("[data-mon]").forEach((element) => DS.tweenNumber(element, Math.round(telemetry[element.dataset.mon]), { suffix: element.dataset.mon === "temp" ? "°" : "%" }));
  }, 2000);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href$='.html'], a[href*='.html?']");
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.target) return;
    // Over http the browser cross-fades documents itself (@view-transition); file:// pages fade out by hand.
    if (location.protocol !== "file:") return;
    event.preventDefault();
    const main = $("main");
    const go = () => { location.href = link.href; };
    if (!main) return go();
    main.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).finished.then(go, go);
    setTimeout(go, 160);
  });
  // bfcache restores the faded page; show it again.
  addEventListener("pageshow", (event) => { if (event.persisted) $("main")?.getAnimations().forEach((animation) => animation.cancel()); });
  // Blocks revealed by a state change ease in; inline bits just appear.
  const revealBlocks = (elements) => elements
    .filter((element) => !element.hidden && element.offsetHeight > 40 && getComputedStyle(element).display !== "inline")
    .filter((element, _, all) => !all.some((other) => other !== element && other.contains(element)))
    .forEach((element, index) => element.animate(DS.reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 240, delay: Math.min(index, 6) * 30, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));

  /* ---------- Prototype states: <script id="proto-states" type="application/json"> + [data-when="key=a|b"] ---------- */
  const spec = JSON.parse($("#proto-states")?.textContent || "{}");
  const stored = read(`lvs-proto:${page}`);
  const state = {};
  for (const [key, def] of Object.entries(spec)) {
    const values = Object.keys(def.options);
    state[key] = values.includes(stored[key]) ? stored[key] : values[0];
  }
  let firstApply = true;
  function applyState() {
    for (const [key, value] of Object.entries(state)) body.dataset[`state${key[0].toUpperCase()}${key.slice(1)}`] = value;
    const shown = [];
    $$("[data-when]").forEach((element) => {
      const was = element.hidden;
      element.hidden = !element.dataset.when.split(" ").every((rule) => {
        const [key, values] = rule.split("=");
        return values.split("|").includes(state[key]);
      });
      if (was && !element.hidden) shown.push(element);
    });
    $$("[data-set-state]").forEach((seg) => {
      const button = $(`button[data-value="${state[seg.dataset.setState]}"]`, seg);
      if (button && button.getAttribute("aria-pressed") !== "true") button.click();
    });
    write(`lvs-proto:${page}`, state);
    document.dispatchEvent(new CustomEvent("proto-state", { detail: { ...state } }));
    if (!firstApply) revealBlocks(shown);
    firstApply = false;
  }
  function setState(key, value) {
    if (!(key in state) || state[key] === value) return;
    state[key] = value;
    applyState();
    renderProtoPanel();
  }
  // Segmented controls emit a non-bubbling "change"; listen on each element.
  $$("[data-set-state]").forEach((seg) => seg.addEventListener("change", (event) => {
    if (event.detail?.value) setState(seg.dataset.setState, event.detail.value);
  }));

  /* ---------- Prototype bar (outside product UI) ---------- */
  const view = { annotate: false, width: 0, ...read("lvs-proto-view") };
  const bar = document.createElement("div");
  bar.className = "proto-bar";
  bar.innerHTML = `<div class="proto-panel" id="proto-panel" hidden></div><button class="btn btn-gray btn-sm" type="button" aria-expanded="false" aria-controls="proto-panel">${ic("panels-top-left")}原型</button>`;
  body.append(bar);
  const panel = $("#proto-panel", bar);
  const toggle = $("button.btn", bar);
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
  const segMarkup = (name, options, current) =>
    `<div class="seg" data-proto="${name}">${options.map(([value, label]) => `<button type="button" data-value="${value}" aria-pressed="${String(value) === String(current)}">${label}</button>`).join("")}</div>`;
  function renderProtoPanel() {
    panel.innerHTML = `
      <div class="row between"><h4>原型控制</h4><a class="btn btn-plain btn-sm" href="index.html">${ic("layout-grid")}全部页面</a></div>
      ${Object.entries(spec).map(([key, def]) => `<div class="field"><span class="label">${def.label}</span>${segMarkup(`state:${key}`, Object.entries(def.options), state[key])}</div>`).join("")}
      ${Object.keys(spec).length ? '<hr class="divider">' : ""}
      <div class="field"><span class="label">窗口宽度</span>${segMarkup("width", [[0, "自适应"], [1440, "1440"], [1280, "1280"], [1120, "1120"], [900, "900"], [820, "820 最小"]], view.width)}</div>
      <div class="field"><span class="label">主题色</span>${segMarkup("accent", accents.map(([value, label]) => [value, label]), appearance.accent)}</div>
      <div class="field"><span class="label">背景深度</span>${segMarkup("depth", [["0", "更深"], ["1", "深"], ["2", "平衡"]], appearance.depth)}</div>
      <label class="switch-row"><span class="switch-copy"><span>区块标注与保留入口</span></span><span class="switch"><input type="checkbox" data-proto="annotate"${view.annotate ? " checked" : ""}><span></span></span></label>
      <div class="field"><span class="label">演示通知</span><div class="row wrap" data-demo-notify><button class="btn btn-gray btn-sm" type="button" data-kind="success">成功</button><button class="btn btn-gray btn-sm" type="button" data-kind="info">信息</button><button class="btn btn-gray btn-sm" type="button" data-kind="warning">警告</button><button class="btn btn-gray btn-sm" type="button" data-kind="danger">错误</button></div></div>`;
    $("[data-demo-notify]", panel).addEventListener("click", (event) => {
      const kind = event.target.closest("[data-kind]")?.dataset.kind;
      const samples = { success: ["环境扫描完成 · 23 个组件就绪"], info: ["已复制 3 个文件"], warning: ["2 个节点需要更新", "查看"], danger: ["ComfyUI 连接失败：端口 8188 无响应", "重试"] };
      if (kind) DS.toast(samples[kind][0], { kind, action: samples[kind][1] ?? "" });
    });
    $$(".seg", panel).forEach((seg) => {
      DS.bindSegmented(seg);
      seg.addEventListener("change", (event) => onProto(seg.dataset.proto, event.detail.value, event));
    });
    DS.icons();
  }
  panel.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-proto]");
    if (input) onProto(input.dataset.proto, input.checked, event);
  });
  document.addEventListener("appearance", () => { if (!panel.hidden) renderProtoPanel(); });
  function onProto(name, value) {
    if (name.startsWith("state:")) setState(name.slice(6), value);
    else if (name === "width") {
      view.width = Number(value);
      if (view.width) { root.style.setProperty("--proto-width", `${view.width}px`); root.classList.add("proto-sized"); }
      else { root.style.removeProperty("--proto-width"); root.classList.remove("proto-sized"); }
      write("lvs-proto-view", view);
    } else if (name === "accent" || name === "depth") setAppearance({ [name]: value });
    else if (name === "annotate") { view.annotate = value; root.toggleAttribute("data-annotate", value); write("lvs-proto-view", view); }
  }

  /* ---------- Tabs: [data-tabs] buttons with data-tab, panels [data-panel] ---------- */
  $$("[data-tabs]").forEach((list) => {
    const select = (id, animate = false) => {
      $$("[data-tab]", list).forEach((tab) => {
        const active = tab.dataset.tab === id;
        tab.setAttribute("aria-current", String(active));
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      $$(`[data-panel]`).forEach((section) => { section.hidden = section.dataset.panel !== id; });
      if (animate) revealBlocks($$(`[data-panel="${id}"]`));
      write(`lvs-proto-tab:${page}`, { id });
    };
    list.addEventListener("click", (event) => { const tab = event.target.closest("[data-tab]"); if (tab) select(tab.dataset.tab, true); });
    list.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      const tabs = $$("[data-tab]", list);
      const next = tabs[(tabs.indexOf(document.activeElement) + (event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length];
      next.focus(); select(next.dataset.tab, true); event.preventDefault();
    });
    const saved = read(`lvs-proto-tab:${page}`).id;
    select($(`[data-tab="${saved}"]`, list) ? saved : $("[data-tab]", list).dataset.tab);
  });

  /* ---------- Design-system wiring ---------- */
  $$("select").forEach((select) => DS.enhanceSelect(select));
  $$(".seg").forEach((seg) => DS.bindSegmented(seg));
  $$(".js-slider").forEach((field) => DS.bindSlider(field));
  DS.bindMenus();
  DS.bindPointerLight();
  DS.bindTooltips();
  applyState();
  renderProtoPanel();
  DS.icons();

  window.App = { $, $$, ic, state, setState, appearance, setAppearance, accents };
  // Page scripts after app.js have also run by DOMContentLoaded; reveal the finished page in one paint.
  addEventListener("DOMContentLoaded", () => delete root.dataset.booting);
})();
