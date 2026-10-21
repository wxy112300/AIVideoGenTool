// Video detail prototype: logic carried over from the approved style tile.
(() => {
  const DS = window.DS;
  const { ic, icons } = DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
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

  /* ---------- Delete with confirmation ---------- */
  const deleteDialog = $("#delete-dialog");
  let deleting = "";
  let deletingRow = null;
  const askDelete = (target, row = null) => {
    deleting = target;
    deletingRow = row;
    const version = $("#version-rail [aria-pressed='true']")?.textContent.trim() ?? "";
    const isAv = row?.querySelector(".badge")?.textContent === "音画 AV";
    $("#delete-title").textContent = target === "version" ? "删除这个版本？" : target === "file" ? "删除这个文件？" : "删除这条视频记录？";
    $("#delete-name").textContent = target === "version" ? version : target === "file" ? row.querySelector("code").textContent : $(".file-name")?.textContent ?? "";
    $("#delete-note").textContent = target === "version"
      ? "只删除该版本的文件，其他版本保留。"
      : target === "file"
        ? (isAv ? "删除后无法再无损续接，也不能使用 H3 Latent Upscale。" : "只删除这个文件，视频与记录保留。")
        : "记录和所有版本文件会一起删除，无法撤销。";
    DS.openDialog(deleteDialog);
  };
  $("#delete-version").addEventListener("click", () => askDelete("version"));
  $("#delete-record").addEventListener("click", () => askDelete("record"));
  $$("[data-delete-file]").forEach((button) => button.addEventListener("click", () => askDelete("file", button.closest(".file-row"))));
  $("#delete-confirm").addEventListener("click", () => {
    deleteDialog.querySelector("[data-close]").click();
    if (deleting === "record") { DS.toast("已删除视频记录", { kind: "info" }); setTimeout(() => { location.href = "history.html"; }, 900); }
    else if (deleting === "file" && deletingRow) {
      const row = deletingRow;
      const isAv = row.querySelector(".badge")?.textContent === "音画 AV";
      $("#files-count").textContent = `${$$(".file-list .file-row").filter((item) => item !== row).length} 个`;
      DS.animateOut(row);
      if (isAv) { $(".zone-head .badge")?.remove(); $("#up-model option[value='h3']").disabled = true; }
      DS.toast("已删除文件", { kind: "info" });
    }
    else DS.toast("已删除版本", { kind: "info" });
  });

  /* ---------- Upscale dialog: options depend on the selected model ---------- */
  const upscale = $("#upscale-dialog");
  const source = { width: 1280, height: 720, frames: 1920, file: "MINIMAX-H3-CONTINUUM-360p-30s-20261019-140052" };
  const upModels = {
    seedvr2: { group: "pixel", policy: "seedvr2", vram: [14, 18], minutes: [6, 9] },
    "seedvr2-int8": { group: "pixel", policy: "fixed", vram: [9, 12], minutes: [5, 7] },
    flashvsr: { group: "pixel", policy: "fixed", vram: [10, 13], minutes: [2, 4] },
    realesrgan: { group: "pixel", policy: "fixed", vram: [3, 5], minutes: [3, 5] },
    h3: { group: "h3", policy: "fixed", vram: [18, 21], minutes: [4, 6] },
    kono: { group: "kono", policy: "", vram: null, minutes: null }
  };
  const even = (value) => Math.round(value / 2) * 2;
  const pressed = (seg) => Number($(`${seg} [aria-pressed='true']`).dataset.value);
  const renderUpscale = () => {
    const id = $("#up-model").value;
    const model = upModels[id];
    $$("[data-up]", upscale).forEach((row) => {
      const keys = row.dataset.up.split(" ");
      row.hidden = !keys.some((key) => key === model.group || key === model.policy);
    });
    let width, height, suffix;
    if (model.group === "kono") {
      const scale = pressed("#up-mode");
      width = even(source.width * scale); height = even(source.height * scale);
      const fps = $("#up-fps").value;
      suffix = `dlss5-${String(scale).replace(".", "_")}x${fps === "off" ? "" : `-${fps}fps`}`;
    } else {
      height = pressed(model.group === "h3" ? "#up-target-h3" : "#up-target-pixel");
      width = even(source.width * height / source.height);
      suffix = `${height === 2160 ? "4k" : `${height}p`}`;
    }
    const factor = (width * height) / (1920 * 1080);
    $("#up-size").textContent = `${width} × ${height}`;
    $("#up-file").textContent = `${source.file}-${suffix}.mp4`;
    $("#up-file").dataset.tip = $("#up-file").textContent;
    if (model.vram) {
      $("#up-vram").textContent = `${Math.round(model.vram[0] * Math.sqrt(factor))}–${Math.round(model.vram[1] * Math.sqrt(factor))} GB`;
      $("#up-time").textContent = `${Math.round(model.minutes[0] * factor)}–${Math.max(1, Math.round(model.minutes[1] * factor))} 分钟`;
      $("#up-note").dataset.tip = `按模型、目标分辨率和 ${source.frames} 帧估算，不含首次加载模型与最终编码。`;
    } else {
      $("#up-vram").textContent = "待首次基准";
      $("#up-time").textContent = "待首次基准";
      const fps = $("#up-fps").value === "off" ? 24 : Number($("#up-fps").value);
      $("#up-disk").textContent = `约 ${Math.round(factor * fps * 4.6)} MB`;
      $("#up-note").dataset.tip = `按当前倍率、${fps} FPS 与 H.264 粗略估算；执行顺序：DLSS SR 超分 → Neural 增强 → DLSSG 补帧（可选）。`;
    }
  };
  $("#open-upscale").addEventListener("click", () => { renderUpscale(); DS.openDialog(upscale); });
  $("#up-model").addEventListener("change", renderUpscale);
  $("#up-fps").addEventListener("change", renderUpscale);
  ["#up-target-pixel", "#up-target-h3", "#up-mode"].forEach((seg) => $(seg).addEventListener("change", renderUpscale));
  $("#up-enqueue").addEventListener("click", () => {
    upscale.querySelector("[data-close]").click();
    DS.toast(`已加入队列 · ${$("#up-size").textContent}`, { kind: "success", icon: "list-video", action: "查看队列" });
  });

  /* ---------- Prototype state: video orientation ---------- */
  const ratios = { landscape: ["16 / 9", "1280 × 720", "16:9"], portrait: ["9 / 16", "720 × 1280", "9:16"], square: ["1 / 1", "960 × 960", "1:1"] };
  const applyRatio = () => {
    const [aspect, size, label] = ratios[window.App?.state?.ratio] ?? ratios.landscape;
    player.style.setProperty("--video-aspect", aspect);
    const meta = $$(".player-meta span");
    if (meta[1]) meta[1].textContent = size;
    if (meta[3]) meta[3].textContent = label;
  };
  document.addEventListener("proto-state", applyRatio);
  applyRatio();
  player.addEventListener("keydown", (event) => { if (event.key === "f") toggleFull(); });

})();
