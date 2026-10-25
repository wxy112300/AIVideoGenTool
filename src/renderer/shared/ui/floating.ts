/** Position a body portal in viewport coordinates without clipping its anchor. */
export function positionFloating(anchor: HTMLElement, floating: HTMLElement, maximumHeight = Number.POSITIVE_INFINITY): void {
  const source = anchor.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  floating.style.maxHeight = `${Math.min(maximumHeight, Math.max(32, window.innerHeight - margin * 2))}px`;
  const bounds = floating.getBoundingClientRect();
  const below = window.innerHeight - source.bottom - margin - gap;
  const above = source.top - margin - gap;
  const useAbove = below < bounds.height && above > below;
  floating.style.maxHeight = `${Math.min(maximumHeight, Math.max(32, useAbove ? above : below))}px`;
  const height = floating.getBoundingClientRect().height;
  floating.style.left = `${Math.max(margin, Math.min(source.left, window.innerWidth - bounds.width - margin))}px`;
  floating.style.top = `${Math.max(margin, useAbove ? source.top - height - gap : source.bottom + gap)}px`;
}
