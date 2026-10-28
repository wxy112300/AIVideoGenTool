/** Grow into spare desktop space without measuring against the current editor height. */
export function mountPromptHeight(editor: HTMLElement): () => void {
  const composer = editor.closest<HTMLElement>(".composer");
  const workspace = editor.closest<HTMLElement>(".create-workspace");
  if (!composer || !workspace) return () => undefined;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!editor.isConnected || !editor.getClientRects().length) return;
    const columns = getComputedStyle(workspace).gridTemplateColumns.trim().split(/\s+/).length;
    const rect = composer.getBoundingClientRect();
    const otherHeight = rect.height - editor.getBoundingClientRect().height;
    const spare = window.innerHeight - (rect.top + window.scrollY) - otherHeight - 48;
    const maximum = columns > 1 ? Math.max(320, Math.min(spare, window.innerHeight * .45)) : 320;
    const value = `${Math.floor(maximum)}px`;
    if (editor.style.getPropertyValue("--prompt-max-height") !== value) editor.style.setProperty("--prompt-max-height", value);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  observer?.observe(composer);
  observer?.observe(workspace);
  window.addEventListener("resize", schedule);
  // Apply before the first paint, including same-page remounts on tall windows.
  update();
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
}
