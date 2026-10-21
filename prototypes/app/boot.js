// Runs in <head> before paint: restores appearance and prototype view options.
(() => {
  const root = document.documentElement;
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } };
  const appearance = { accent: "azure", palette: "graphite", depth: "1", motion: "system", ...read("lvs-proto-appearance") };
  root.dataset.accent = appearance.accent;
  root.dataset.palette = appearance.palette;
  root.dataset.depth = appearance.depth;
  if (appearance.motion === "reduced") root.dataset.motion = "reduced";
  const view = read("lvs-proto-view");
  if (view.annotate) root.dataset.annotate = "";
  if (view.width) { root.style.setProperty("--proto-width", `${view.width}px`); root.classList.add("proto-sized"); }
  // Hold the first paint until scripts have built the shell, icons, selects and states (no pop-in).
  root.dataset.booting = "";
  setTimeout(() => delete root.dataset.booting, 1500);
  addEventListener("pagereveal", (event) => { if (event.viewTransition) root.dataset.vt = ""; });
})();
