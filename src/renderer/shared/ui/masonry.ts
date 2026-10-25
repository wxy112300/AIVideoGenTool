/** Fixed alternating columns; narrow mode returns to the original DOM order. */
export function mountTwoColumnMasonry(container: HTMLElement, placement: "alternating" | "balanced" = "alternating", breakpoint = 900): () => void {
  const items = Array.from(container.children);
  const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
  const oldClass = container.classList.contains("ui-masonry");
  let narrow: boolean | null = null;
  const update = () => {
    if (narrow === media.matches) return;
    narrow = media.matches;
    if (narrow) { container.classList.remove("ui-masonry"); container.replaceChildren(...items); }
    else {
      container.classList.add("ui-masonry");
      const columns = [document.createElement("div"), document.createElement("div")];
      columns.forEach((column) => column.className = "ui-masonry-column");
      items.forEach((item, index) => columns[index % 2]!.append(item));
      container.replaceChildren(...columns);
      if (placement === "balanced") {
        // Measure at the real column width once; disclosure only moves this column afterward.
        const heights = items.map(item => item.getBoundingClientRect().height);
        const totals = [0, 0];
        const gap = Number.parseFloat(getComputedStyle(columns[0]!).rowGap) || 0;
        items.forEach((item, index) => {
          const column = totals[0]! <= totals[1]! ? 0 : 1;
          columns[column]!.append(item); totals[column]! += heights[index]! + gap;
        });
      }
    }
  };
  media.addEventListener("change", update); update();
  return () => { media.removeEventListener("change", update); container.replaceChildren(...items); container.classList.toggle("ui-masonry", oldClass); };
}
