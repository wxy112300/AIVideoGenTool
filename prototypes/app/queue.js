// Queue prototype: tasks mirror real queue cards (labels from zh-CN); media are gradient stand-ins.
(() => {
  const { ic } = window.DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const art = ["linear-gradient(120deg,#1d2b53,#7e2553,#ff004d,#ffa300)", "linear-gradient(140deg,#0f2027,#203a43,#2c5364,#7fb3a6)", "linear-gradient(110deg,#2b1055,#7597de,#d3a4c3)", "linear-gradient(130deg,#3a1c1c,#b5651d,#f2c57c)", "linear-gradient(120deg,#0b3d2e,#3f7d4a,#c8d96f)", "linear-gradient(150deg,#141e30,#243b55,#9ab3d5)"];
  // Rough text-encoder estimate: CJK ~1.2 tokens/char, Latin ~3.8 chars/token.
  const tokens = (text) => Math.round((text.match(/[\u4e00-\u9fff]/g)?.length ?? 0) * 1.2 + text.replace(/[\u4e00-\u9fff]/g, "").length / 3.8);

  const LONG_PROMPT = `{
  "visual_style": "Photorealistic cinematic night exterior, anamorphic 2.39:1 framing, wet asphalt reflections, sodium-vapor street lamps mixed with cyan neon signage, shallow depth of field, subtle film grain.",
  "scene_overview": "A narrow old-town street after heavy rain. <Picture 1> is a woman in her late twenties wearing a dark wool coat with the collar turned up; she has just stepped out of a tram and is walking toward a small corner café whose windows glow warm amber.",
  "detailed_description": "[Shot 1, 0.0–3.0s] Medium-wide tracking shot from behind and slightly to the left of <Picture 1>; the camera follows at walking pace, rain streaks visible against the café light. She glances once over her right shoulder, revealing her profile and the reflection of red neon on her cheek.\\n[Shot 2, 3.0–6.0s] The camera arcs around to a three-quarter front view as she slows near the café door; her breath fogs in the cold air, a passing car throws a brief sweep of headlight across the wet cobblestones.\\n[Shot 3, 6.0–8.0s] Close-up on her hand pushing the brass door handle; the door opens and warm interior light floods her face as she pauses, a faint smile beginning.",
  "camera": "Smooth gimbal tracking, 35mm equivalent, gentle arc in Shot 2, slow push-in for the final close-up; no handheld shake.",
  "audio": "Continuous light rain on awnings, distant tram bell at 1.5s, footsteps on wet stone synchronized to each step, muffled café chatter and a soft piano rising as the door opens at 6.5s.",
  "constraints": "Keep <Picture 1> identity, hairstyle and coat consistent across all shots; no on-screen text; no sudden cuts other than the listed shots; maintain the established color palette."
}`;

  // main: what it is (model, size, length); tech: how it runs (kept, lighter).
  const running = {
    id: "t1", art: 0, ratio: "9/16", file: "H3-FL2VA-720p-8s-20261021-101204.mp4", prompt: LONG_PROMPT,
    main: ["MiniMax H3 FL2VA", "720p", "8 秒", "24 → 48 fps"], tech: ["LoRA Turbo v4 ×1.0", "30 步 · Spectrum 开", "latent 保存：仅最终", "Seed 2184093321"]
  };
  const runningPack = {
    id: "p1", file: "H3-CONTINUUM-480p-60s-20261021-091530.mp4", ratio: "16/9", mode: "全自动", current: 2, step: 8, total: "60 秒",
    global: "清晨的欧洲老城，一次连续的城市漫游：从晨雾中的天际线航拍开始，下降到街道，跟随一辆电车穿过老城，乘客下车走进咖啡馆，最后拉回城市全景，雾气散去。整体色调由冷蓝过渡到暖金，镜头运动平稳连续，不出现文字与 logo；同一位女性乘客在第 3–5 段保持外貌与服装一致。",
    segments: [
      { range: "0:00–0:10", art: 5, prompt: "航拍掠过晨雾中的城市天际线，镜头缓慢前推，教堂尖顶从雾中浮现，远处传来钟声。" },
      { range: "0:10–0:20", art: 1, prompt: "镜头下降到街道高度，行人与电车在薄雾中穿行，路面潮湿反光，环境音逐渐变为街道噪声。" },
      { range: "0:20–0:30", art: 0, prompt: "跟随一辆黄色电车穿过老城区的石拱门，光线逐渐变亮；车窗内可见穿深色大衣的女性乘客，电车铃声在拱门下回响。" },
      { range: "0:30–0:40", art: 3, prompt: "电车停靠站台，女性乘客下车，竖起衣领走向街角的咖啡馆；镜头从侧后方跟随，脚步声与远处的电车声交织。" },
      { range: "0:40–0:50", art: 2, prompt: "咖啡馆内部，阳光从窗户斜射进来，她在靠窗位置坐下，服务员端来咖啡，杯中热气升起。" },
      { range: "0:50–1:00", art: 4, prompt: "镜头从窗内缓慢拉出、升高，回到城市全景，雾已散去，阳光照亮屋顶，背景音乐渐强后收尾。" }
    ]
  };
  const waitingPack = {
    id: "p2", kind: "pack", art: 2, file: "H3-CONTINUUM-480p-120s-20261021-103015.mp4", mode: "半自动", total: "2 分钟",
    global: "夜晚暴雨中的港口城市，一名快递骑手被一辆黑色轿车追逐，穿过市场、码头与立交桥，最终甩开追踪。手持感镜头，霓虹与车灯构成主要光源；骑手外貌、头盔与外卖箱在全部 8 段保持一致；不出现血腥镜头。",
    segments: ["骑手在霓虹市场入口停车取餐，后视镜中黑色轿车缓缓驶入。", "骑手察觉被跟踪，加速穿过拥挤的市场摊位，雨棚上的积水被撞落。", "轿车绕行包抄，两车在窄巷口几乎相撞，骑手急转进入码头区。", "码头集装箱之间的追逐，探照灯扫过，雨水在灯光中呈线状。", "骑手冲上立交桥匝道，轿车紧随，城市夜景在背景展开。", "立交桥上车流密集，骑手在车缝中穿行，轿车被卡车挡住。", "骑手驶下匝道进入老街，关灯滑行躲进门洞，轿车从门前驶过。", "雨势减弱，骑手重新上路，镜头升高，城市在雨后泛着微光。"].map((prompt, index) => ({ range: `${Math.floor(index * 15 / 60)}:${String((index * 15) % 60).padStart(2, "0")}–${Math.floor((index + 1) * 15 / 60)}:${String(((index + 1) * 15) % 60).padStart(2, "0")}`, prompt, locked: false })),
    main: ["MiniMax H3 Continuum", "480p", "2 分钟 · 8 段"], tech: ["半自动", "20 步 · Spectrum 开", "latent 保存：全部保存"]
  };
  const pending = [
    { id: "t2", art: 1, kind: "extend", file: "MINIMAX-H3-CONTINUUM-480p-15.1s-20261020-155438-v01.mp4", prompt: "Continuation of the preceding segment. [Shot 1] opens on the inherited medium-high lateral chase view already established over the dusk river, with the dark-colored helicopter still airborne, its main rotor spinning.", main: ["视频续写", "MiniMax H3 Continuum", "480p", "保留 0.0–15.1 秒"], tech: ["最多 736 模型帧", "22 帧上下文", "20 步 · Spectrum 开", "latent 保存：全部保存"] },
    waitingPack,
    { id: "t3", art: 2, kind: "video", file: "H3-R2V-480p-6s-20261021-102233.mp4", prompt: LONG_PROMPT.replace(/<Picture 1>/g, "<Picture 1> and <Picture 2>"), main: ["MiniMax H3 R2V · 多参考 INT8", "480p", "6 秒", "24 fps"], tech: ["20 步 · Spectrum 开", "Seed 98213"], retry: 1 },
    { boundary: true },
    { id: "t4", art: 3, kind: "image", file: "OmniGen2-20261021-102540.png", prompt: "Replace the background with a quiet bookstore interior, keep the subject's pose and lighting direction.", main: ["图片处理", "OmniGen2 · 文生图/参考编辑", "4 张候选图"], tech: ["50 步", "批次独立 Seed"] },
    { id: "t5", art: 4, kind: "upscale", file: "H3-FL2VA-720p-8s-20261019-140052-1440p.mp4", prompt: "", main: ["分辨率提升", "SeedVR2 3B INT8 ConvRot · 原生", "2560 × 1440"], tech: ["分批处理 · 每批卸载"] }
  ];
  const attention = [
    { id: "f1", art: 3, status: "failed", file: "H3-FL2VA-1080p-12s-20261021-095216.mp4", error: "OOM at KSampler · 需要 21.4 GB，可用 18.9 GB", detail: "已自动重试 2/2 · 可从第 18 步恢复", checkpoint: true, main: ["MiniMax H3 FL2VA", "1080p", "12 秒"], tech: ["30 步 · Spectrum 开"] },
    { id: "f2", art: 1, status: "cancelled", file: "H3-R2V-720p-10s-20261021-093011.mp4", checkpoint: false, main: ["MiniMax H3 R2V · 多参考 INT8", "720p", "10 秒"], tech: [] }
  ];
  const taskById = new Map([...pending, ...attention, running, runningPack].filter((task) => task.id).map((task) => [task.id, task]));

  // Exit animations pause in background tabs; resolve anyway so the DOM stays consistent.
  const settle = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 400))]);

  /* ---------- Shared pieces ---------- */
  const metaLine = (task) => `<div class="meta-line">${task.main.map((item) => `<span class="main">${esc(item)}</span>`).join("<i>·</i>")}${task.tech.length ? `<i>·</i>${task.tech.map((item) => `<span>${esc(item)}</span>`).join("<i>·</i>")}` : ""}</div>`;
  // Collapsed prompts grow into the card's free space (fitPrompts); "expand" only appears when text still overflows.
  const promptBlock = (text, label = "") => {
    if (!text) return "";
    return `<div class="prompt-block" data-prompt-block>
      <p class="prompt-peek">${label ? `<span class="prompt-label">${label}</span>` : ""}${esc(text)}</p>
      <div class="prompt-tools"><button class="link-btn" type="button" data-act="prompt-toggle" hidden>${ic("chevrons-up-down")}<span>展开全文</span></button><span class="caption num" data-tip="按 H3 文本编码器估算的提示词 token 数">约 ${tokens(text).toLocaleString()} tokens</span><button class="btn btn-icon btn-sm" type="button" data-act="prompt-copy" aria-label="复制提示词" data-tip="复制提示词">${ic("copy")}</button></div>
    </div>`;
  };
  const fitPrompts = (scope = document) => {
    for (const block of $$("[data-prompt-block]", scope)) {
      const peek = $(".prompt-peek", block);
      const toggle = $("[data-act='prompt-toggle']", block);
      if (block.classList.contains("open")) { toggle.hidden = false; continue; }
      peek.style.webkitLineClamp = "2";
      const meta = block.closest(".task-body")?.querySelector(":scope > .meta-line");
      const lineHeight = parseFloat(getComputedStyle(peek).lineHeight) || 18;
      const free = meta ? meta.getBoundingClientRect().top - block.getBoundingClientRect().bottom - 10 : 0;
      peek.style.webkitLineClamp = String(Math.min(12, 2 + Math.max(0, Math.floor(free / lineHeight))));
      toggle.hidden = peek.scrollHeight <= peek.clientHeight + 1;
    }
  };
  const menu = (task) => `<span class="menu-anchor"><button class="btn btn-icon btn-sm" type="button" data-menu-trigger aria-expanded="false" aria-label="更多操作" data-tip="更多操作">${ic("ellipsis")}</button>
    <div class="menu right" role="menu">
      <button class="menu-item" type="button" data-act="duplicate">${ic("copy")}复制</button>
      ${task.status ? "" : `<button class="menu-item" type="button" data-act="promote">${ic("arrow-up-to-line")}排到下一位</button><button class="menu-item" type="button" data-act="through">${ic("flag")}渲染到这里</button>`}
      ${task.kind === "upscale" || task.kind === "image" ? "" : `<button class="menu-item" type="button" data-act="seed">${ic("dices")}随机 Seed</button>`}
      <div class="menu-sep"></div><button class="menu-item destructive" type="button" data-act="remove">${ic("trash-2")}移除</button>
    </div></span>`;
  const editButton = (task) => `<button class="btn btn-plain btn-sm" type="button" data-act="edit" data-tip="${task.kind === "upscale" ? "带回提升设置并重新加入队列" : "带回创建页编辑"}">${ic("sliders-horizontal")}编辑</button>`;
  const boundaryMarkup = `<div class="boundary" data-drag data-id="b" role="group" aria-label="本批次到此"><button class="grip" type="button" data-grip aria-label="拖动调整本批次分割位置" data-tip="拖动调整分割位置" aria-keyshortcuts="ArrowUp ArrowDown Home End">${ic("grip-horizontal")}</button>
      <span class="copy" data-tip="分割线下方任务将在继续队列后执行">本批次到此</span><button class="btn btn-icon btn-sm" type="button" data-act="clear-boundary" aria-label="取消分割线" data-tip="取消分割线（队列保持暂停）">${ic("x")}</button></div>`;
  const grip = `<button class="grip" type="button" data-grip aria-label="拖动调整队列顺序（聚焦后可用 ↑/↓、Home/End）" data-tip="拖动排序 · ↑/↓、Home/End" aria-keyshortcuts="ArrowUp ArrowDown Home End">${ic("grip-vertical")}</button>`;

  /* ---------- Continuum pack: 全局 | 段落 viewer; paging a segment swaps the preview (browsing never affects execution) ---------- */
  const segState = (pack, index) => pack.current == null ? "pending" : index < pack.current ? "done" : index === pack.current ? "running" : "pending";
  const segLabel = { done: "已完成", running: "渲染中", pending: "待生成" };
  const segViewer = (pack, view) => {
    const scope = pack.scope ?? "segment";
    const segment = pack.segments[view];
    return `<div class="seg-viewer">
      <div class="seg-viewer-head"><div class="seg sm" data-act-seg="${pack.id}"><button type="button" data-value="global" aria-pressed="${scope === "global"}">全局</button><button type="button" data-value="segment" aria-pressed="${scope === "segment"}">段落</button></div>
        ${scope === "segment"
          ? `<span class="seg-pager"><button class="btn btn-icon btn-sm" type="button" data-act="seg-prev" aria-label="上一段">${ic("chevron-left")}</button><span class="num">第 ${view + 1} / ${pack.segments.length} 段</span><button class="btn btn-icon btn-sm" type="button" data-act="seg-next" aria-label="下一段">${ic("chevron-right")}</button></span><span class="caption num">${segment.range} · ${segLabel[segState(pack, view)]}</span>`
          : `<span class="caption num">${pack.segments.length} 段 · ${pack.total} · ${pack.mode}</span>`}</div>
      ${promptBlock(scope === "global" ? pack.global : segment.prompt)}
    </div>`;
  };
  const view = { p1: 2, p2: 0 };
  // Running preview keeps the media's own ratio inside a bounded box (portrait gets narrower, never stretched).
  // Preview box stays inside a safe area (160-260 wide, at most 220 tall); the frame is contained, never stretched.
  const preview = (ratio, background, inner) => {
    const [w, h] = ratio.split("/").map(Number);
    const r = w / h;
    const width = Math.round(Math.min(260, Math.max(160, 220 * r)));
    const height = Math.round(Math.min(220, width / r));
    return `<div class="preview" style="width:${width}px;height:${height}px"><span class="frame" style="aspect-ratio:${ratio};${background ? `background-image:${background}` : ""}"></span>${inner}</div>`;
  };
  // Live preview is a corner dot (details on hover) so it never covers the frame.
  const liveMark = `<span class="live-mark" data-tip="实时预览 · 低分辨率过程画面" aria-label="实时预览"><i class="live-dot"></i></span>`;
  const squareThumb = (background, inner = "") => `<div class="thumb" style="background-image:${background}">${inner}</div>`;

  const pendingCard = (task) => {
    if (task.boundary) return boundaryMarkup;
    if (task.kind === "pack") {
      return `<article class="card task pack lit" data-drag data-id="${task.id}">
        ${grip}<span class="order" data-rank data-tip="队位">02</span>
        ${squareThumb(art[task.art])}
        <div class="task-body">
          <div class="title-line"><h3 data-tip="${esc(task.file)}">${esc(task.file)}</h3><span class="flag" data-deferred-flag hidden>待后续执行</span></div>
          ${segViewer(task, view[task.id])}
          ${metaLine(task)}
        </div>
        <div class="task-actions">${editButton(task)}${menu(task)}</div>
      </article>`;
    }
    return `<article class="card task lit" data-drag data-id="${task.id}">
        ${grip}<span class="order" data-rank data-tip="队位">02</span>
        ${squareThumb(art[task.art])}
        <div class="task-body">
          <div class="title-line"><h3 data-tip="${esc(task.file)}">${esc(task.file)}</h3><span class="flag" data-deferred-flag hidden>待后续执行</span>${task.retry ? `<span class="flag warn">自动重试第 ${task.retry} 次</span>` : ""}</div>
          ${promptBlock(task.prompt)}
          ${metaLine(task)}
        </div>
        <div class="task-actions">${editButton(task)}${menu(task)}</div>
      </article>`;
  };

  // Packs can pause at an internal segment checkpoint or after the whole work; single tasks only after the task.
  let pauseScope = "task";
  const pauseLabel = { segment: "本段完成后暂停", work: "本作品完成后暂停", task: "本条完成后暂停" };
  const runActions = (state) => {
    const pausing = state.run === "pausing";
    const long = state.pack === "long";
    const pauseButton = long
      ? `<div class="split"><button class="btn btn-gray btn-sm lit" type="button" data-act="pause-segment" data-tip="在作品内部的当前段完成后暂停，保留作品位置；继续后从下一段开始">${ic("pause")}本段完成后暂停</button><span class="menu-anchor"><button class="btn btn-gray btn-sm btn-more" type="button" data-menu-trigger aria-expanded="false" aria-label="暂停方式">${ic("chevron-down")}</button>
          <div class="menu right pause-menu" role="menu"><div class="menu-heading">暂停时机</div>
            <button class="menu-item two-line" type="button" data-act="pause-segment">${ic("pause")}<span><strong>本段完成后暂停</strong><small>第 ${runningPack.current + 1} 段结束时停下，保留作品位置</small></span></button>
            <button class="menu-item two-line" type="button" data-act="pause-work">${ic("circle-pause")}<span><strong>本作品完成后暂停</strong><small>全部 ${runningPack.segments.length} 段完成后停下队列</small></span></button></div></span></div>`
      : `<button class="btn btn-gray btn-sm lit" type="button" data-act="pause-task" data-tip="暂停不会冻结当前 GPU 计算；当前任务完成后不会启动下一条">${ic("pause")}本条完成后暂停</button>`;
    const continueLabel = pauseScope === "segment" ? "取消暂停" : "继续执行后续任务";
    return `<div class="task-actions">
      ${pausing
        ? `<button class="btn btn-primary btn-sm lit" type="button" data-act="continue" data-tip="${pauseScope === "segment" ? "当前段完成后不再暂停，继续后续段落" : "当前任务仍会继续运行，后续任务已暂停"}">${ic("play")}${continueLabel}</button>`
        : pauseButton}
      <button class="btn btn-destructive btn-sm" type="button" data-act="cancel" data-tip="${long ? "只取消本作品当前操作；已验证的段会保留供恢复" : "取消当前任务"}">${ic("ban")}取消当前任务</button></div>`;
  };
  const stepText = (step, max = 30) => `${step}/${max} 步`;
  const runningCard = (state, live) => {
    const statusFlag = state.run === "pausing" ? `<span class="flag warn">${{ segment: `第 ${runningPack.current + 1} 段后暂停`, work: "作品完成后暂停", task: "完成后暂停" }[pauseScope]}</span>` : "";
    if (state.pack === "long") {
      const pack = runningPack;
      const viewing = view.p1;
      // Global view previews the segment being rendered; segment view previews the paged segment.
      const shown = (pack.scope ?? "segment") === "global" ? pack.current : viewing;
      const vState = segState(pack, shown);
      const total = ((pack.current + pack.step / 20) / pack.segments.length) * 100;
      return `<article class="card task running pack lit" data-id="${pack.id}">
        <span></span><span class="order" aria-label="队位 01 · 正在运行">01<i class="run-dot"></i></span>
        ${preview(pack.ratio, vState === "pending" ? "" : art[pack.segments[shown].art], vState === "running" && live ? liveMark : vState === "pending" ? `<span class="pending-copy">${ic("clock-3")}第 ${shown + 1} 段待生成</span>` : `<span class="corner-tag">第 ${shown + 1} 段</span>`)}
        <div class="task-body">
          <div class="title-line"><h3>${pack.file}</h3>${statusFlag}</div>
          <div class="stages"><span class="stage" data-state="done">${ic("check")}准备</span><span>›</span><span class="stage" data-state="active">视频段 ${pack.current + 1}/${pack.segments.length}</span><span>›</span><span class="stage">解码 / 合成</span><span>›</span><span class="stage">校验</span></div>
          <div class="run-progress"><div class="progress"><span data-total-bar style="--value:${total}%"></span></div><strong data-total>${Math.round(total)}%</strong></div>
          <div class="run-facts"><span>第 ${pack.current + 1} 段采样 <b data-step>${stepText(pack.step, 20)}</b> · 2.3 秒/步</span><span>已用 <b>12:48</b> · 剩余 <b>21:30</b></span></div>
          ${segViewer(pack, viewing)}
          ${metaLine({ main: ["MiniMax H3 Continuum", "480p", "60 秒 · 6 段"], tech: ["全自动", "20 步 · Spectrum 开"] })}
        </div>${runActions(state)}</article>`;
    }
    return `<article class="card task running lit" data-id="${running.id}">
      <span></span><span class="order" aria-label="队位 01 · 正在运行">01<i class="run-dot"></i></span>
      ${preview(running.ratio, art[running.art], live ? liveMark : "")}
      <div class="task-body">
        <div class="title-line"><h3>${running.file}</h3>${statusFlag}</div>
        <div class="run-progress"><div class="progress"><span data-total-bar style="--value:48%"></span></div><strong data-total>48%</strong></div>
        <div class="run-facts"><span>采样 <b data-step>${stepText(14)}</b> · 2.3 秒/步 · 本步 01:02</span><span>已用 <b data-elapsed>03:12</b> · 剩余 <b>04:36</b></span></div>
        ${promptBlock(running.prompt)}
        ${metaLine(running)}
      </div>${runActions(state)}</article>`;
  };
  const attentionCard = (task) => `<article class="card task lit" data-id="${task.id}">
      <span></span><span class="order" style="color:var(--danger)">!</span>
      <div class="thumb" style="background-image:${art[task.art]}"></div>
      <div class="task-body">
        <div class="title-line"><h3>${task.file}</h3><span class="flag ${task.status === "failed" ? "danger" : ""}">${task.status === "failed" ? "失败" : "已取消"}</span></div>
        ${task.error ? `<div class="error">${ic("circle-alert")}<div>${task.error}${task.detail ? ` <span>· ${task.detail}</span>` : ""}</div></div>` : ""}
        ${metaLine(task)}
      </div>
      <div class="task-actions"><button class="btn btn-tinted btn-sm lit" type="button" data-act="reset" data-tip="${task.checkpoint ? "从最近的检查点继续" : "清除失败状态并恢复为普通等待任务"}">${ic("rotate-ccw")}${task.checkpoint ? "恢复" : "重置状态"}</button>${editButton(task)}${menu(task)}</div>
    </article>`;

  /* ---------- Render ---------- */
  const list = $("#q-list");
  const attentionList = $("#attention-list");
  const markOrder = () => {
    let rank = $("#running-slot").children.length ? 2 : 1;
    let deferred = false;
    for (const item of list.children) {
      if (item.matches(".boundary")) { deferred = true; continue; }
      if (!item.matches(".task")) continue;
      item.toggleAttribute("data-deferred", deferred);
      $("[data-deferred-flag]", item).hidden = !deferred;
      $("[data-rank]", item).textContent = String(rank++).padStart(2, "0");
    }
    const count = list.querySelectorAll(".task").length + $("#running-slot").children.length;
    $$("[data-task-count]").forEach((element) => { element.textContent = String(count); });
  };
  const bindSegs = (scope) => $$("[data-act-seg]", scope).forEach((seg) => {
    DS.bindSegmented(seg);
    seg.addEventListener("change", (event) => {
      const task = taskById.get(seg.dataset.actSeg);
      task.scope = event.detail.value;
      rerender(task.id);
    });
  });
  const rerender = (id) => {
    if (id === "p1") return renderRunning();
    const old = list.querySelector(`[data-id="${id}"]`);
    if (!old) return;
    const open = $(".prompt-block.open", old) != null;
    const next = Object.assign(document.createElement("div"), { innerHTML: pendingCard(taskById.get(id)) }).firstElementChild;
    old.replaceWith(next);
    if (open) $(".prompt-block", next)?.classList.add("open");
    DS.icons();
    bindSegs(next);
    markOrder();
    fitPrompts(next);
  };
  const renderRunning = () => {
    if (!window.App) return;
    const state = App.state;
    const active = state.run === "running" || state.run === "pausing";
    $("#running-slot").innerHTML = active ? runningCard(state, $("#live-toggle").checked) : "";
    const notice = $("#pause-notice-text");
    if (notice) notice.textContent = pauseScope === "segment"
      ? `第 ${runningPack.current + 1} 段完成后暂停；作品位置会保留，继续后从第 ${runningPack.current + 2} 段开始。`
      : "正在等待当前任务结束；后续任务会保留在队列中。";
    DS.icons();
    bindSegs($("#running-slot"));
    markOrder();
    fitPrompts($("#running-slot"));
  };
  new ResizeObserver(() => fitPrompts()).observe($("#q-list"));
  list.innerHTML = pending.map(pendingCard).join("");
  attentionList.innerHTML = attention.map(attentionCard).join("");
  bindSegs(list);
  document.addEventListener("proto-state", renderRunning);
  $("#live-toggle").addEventListener("change", renderRunning);

  /* ---------- Header action ---------- */
  $("#queue-primary").addEventListener("click", () => {
    const run = App.state.run;
    if (run === "idle" || run === "empty") {
      App.setState("run", "starting");
      setTimeout(() => { if (App.state.run === "starting") App.setState("run", "running"); }, 2400);
    } else if (run === "running") { pauseScope = App.state.pack === "long" ? "work" : "task"; App.setState("run", "pausing"); }
    else if (run === "pausing") App.setState("run", "running");
  });

  /* ---------- Remove with confirmation ---------- */
  const removeDialog = $("#remove-dialog");
  let removing = null;
  const askRemove = (card) => {
    const task = taskById.get(card.dataset.id);
    removing = card;
    $("#remove-name").textContent = task.file;
    $("#remove-note").textContent = task.kind === "pack"
      ? "会先停止本作品的操作并等待清理；只回收本作品独占的中间文件，已生成的成片与共享素材不受影响。"
      : "任务从队列移除；已生成的输出和历史记录不受影响。";
    DS.openDialog(removeDialog);
  };
  $("#remove-confirm").addEventListener("click", () => {
    const card = removing;
    removeDialog.querySelector("[data-close]").click();
    if (!card) return;
    settle(DS.animateOut(card)).then(() => { card.remove(); markOrder(); if (!attentionList.children.length) App.setState("attention", "none"); });
    DS.toast("已移除任务", { kind: "info", action: "撤销" });
  });

  /* ---------- Card actions ---------- */
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const card = button.closest("[data-id]");
    const act = button.dataset.act;
    if (act === "pause-task" || act === "pause-segment" || act === "pause-work") { pauseScope = act.slice(6); App.setState("run", "pausing"); renderRunning(); }
    else if (act === "continue") App.setState("run", "running");
    else if (act === "cancel") { App.setState("run", "idle"); App.setState("attention", "some"); DS.toast("任务已取消", { kind: "info" }); }
    else if (act === "seg-prev" || act === "seg-next") {
      const id = card.dataset.id;
      const pack = taskById.get(id);
      view[id] = (view[id] + (act === "seg-next" ? 1 : -1) + pack.segments.length) % pack.segments.length;
      rerender(id);
    }
    else if (act === "prompt-toggle") {
      const block = button.closest("[data-prompt-block]");
      const open = block.classList.toggle("open");
      button.querySelector("span").textContent = open ? "收起" : "展开全文";
      const peek = block.querySelector(".prompt-peek");
      if (open) peek.style.webkitLineClamp = "unset";
      else { peek.scrollTop = 0; fitPrompts(block.parentElement); }
    } else if (act === "prompt-copy") DS.toast("已复制提示词");
    else if (act === "remove") askRemove(card);
    else if (act === "promote") {
      const animation = DS.flip(() => $$("[data-drag]", list));
      list.prepend(card);
      animation.play();
      markOrder();
    } else if (act === "through") {
      const boundary = $(".boundary", list) ?? Object.assign(document.createElement("div"), { innerHTML: boundaryMarkup }).firstElementChild;
      const animation = DS.flip(() => $$("[data-drag]", list));
      card.after(boundary);
      animation.play();
      DS.icons();
      markOrder();
    } else if (act === "clear-boundary") settle(DS.animateOut(card)).then(() => { card.remove(); markOrder(); });
    else if (act === "duplicate") DS.toast("已复制到队尾");
    else if (act === "seed") DS.toast("已换成新的随机 Seed");
    else if (act === "edit") DS.toast("已带回创建页 · 原任务保留在队列中", { kind: "info" });
    else if (act === "reset") {
      settle(DS.animateOut(card)).then(() => { card.remove(); if (!attentionList.children.length) App.setState("attention", "none"); });
      DS.toast("已恢复为等待任务", { kind: "info" });
    }
  });

  /* ---------- Reorder: drag by grip (positioned inside the list), or keyboard on a focused grip ---------- */
  const root = document.documentElement;
  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-grip]");
    const item = handle?.closest("[data-drag]");
    if (!item || event.button !== 0) return;
    event.preventDefault();
    const listBox = list.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const top = (clientY) => Math.max(-8, Math.min(listBox.height - rect.height + 8, clientY - offsetY - list.getBoundingClientRect().top));
    const placeholder = Object.assign(document.createElement("div"), { className: "placeholder" });
    placeholder.style.height = `${rect.height}px`;
    item.after(placeholder);
    Object.assign(item.style, { left: "0", width: `${rect.width}px`, top: `${rect.top - listBox.top}px` });
    item.classList.add("dragging");
    if (!DS.reducedMotion()) item.animate([{ scale: 1 }, { scale: 1.015 }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    const siblings = () => $$("[data-drag]", list).filter((child) => child !== item);
    const move = (moveEvent) => {
      item.style.top = `${top(moveEvent.clientY)}px`;
      const target = siblings().find((child) => { const box = child.getBoundingClientRect(); return moveEvent.clientY < box.top + box.height / 2; });
      if ((target && placeholder.nextElementSibling === target) || (!target && placeholder === list.lastElementChild)) return;
      const animation = DS.flip(siblings);
      if (target) list.insertBefore(placeholder, target); else list.append(placeholder);
      animation.play();
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      const to = placeholder.offsetTop;
      const from = parseFloat(item.style.top);
      item.getAnimations().forEach((animation) => animation.cancel());
      if (!DS.reducedMotion()) {
        const settle = item.animate([{ top: `${from}px`, scale: 1.015 }, { top: `${to}px`, scale: 1 }], { duration: 320, easing: getComputedStyle(root).getPropertyValue("--ease-spring").trim(), fill: "forwards" }).finished;
        // Background tabs pause animations; never leave the card stuck mid-drop.
        await Promise.race([settle, new Promise((resolve) => setTimeout(resolve, 400))]);
      }
      item.getAnimations().forEach((animation) => animation.cancel());
      item.removeAttribute("style");
      item.classList.remove("dragging");
      placeholder.replaceWith(item);
      markOrder();
      handle.focus({ preventScroll: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
  list.addEventListener("keydown", (event) => {
    const handle = event.target.closest("[data-grip]");
    if (!handle || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const item = handle.closest("[data-drag]");
    const animation = DS.flip(() => $$("[data-drag]", list));
    if (event.key === "ArrowUp" && item.previousElementSibling) item.previousElementSibling.before(item);
    else if (event.key === "ArrowDown" && item.nextElementSibling) item.nextElementSibling.after(item);
    else if (event.key === "Home") list.prepend(item);
    else if (event.key === "End") list.append(item);
    animation.play();
    handle.focus();
    markOrder();
  });

  /* ---------- Live numbers ---------- */
  let step = 14, seconds = 192, queueSeconds = 754;
  const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  setInterval(() => {
    if (App.state.run !== "running" && App.state.run !== "pausing") return;
    const long = App.state.pack === "long";
    const max = long ? 20 : 30;
    step = step >= max ? 1 : step + 1;
    seconds += 1;
    queueSeconds += 1;
    const total = long ? Math.round(((runningPack.current + step / 20) / runningPack.segments.length) * 100) : Math.round(20 + step * 1.6);
    $$("[data-elapsed]").forEach((element) => { element.textContent = clock(seconds); });
    $$("[data-step]").forEach((element) => { element.textContent = stepText(step, max); });
    $$("[data-total]").forEach((element) => DS.tweenNumber(element, total, { suffix: "%" }));
    $$("[data-total-bar]").forEach((element) => element.style.setProperty("--value", `${total}%`));
    $("#run-elapsed").textContent = clock(queueSeconds);
  }, 900);
  // Performance meters: numbers count toward the new reading while the bars glide.
  setInterval(() => {
    if (document.hidden) return;
    $$(".perf-strip > div").forEach((cell) => {
      const value = $("strong", cell);
      const now = Number(value.dataset.value ?? parseFloat(value.textContent));
      const next = Math.round(Math.max(3, Math.min(99, now + (Math.random() - .5) * (cell.classList.contains("hot") ? 6 : 10))));
      DS.tweenNumber(value, next, { suffix: "%" });
      $(".progress > span", cell).style.setProperty("--value", `${next}%`);
    });
  }, 2000);

  // App is ready by DOMContentLoaded, before the boot gate lifts, so the running card is in the first paint.
  addEventListener("DOMContentLoaded", renderRunning);
  window.addEventListener("load", () => fitPrompts());
})();
