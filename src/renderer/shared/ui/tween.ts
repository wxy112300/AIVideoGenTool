import { reducedMotion } from "./motion";

const pending = new WeakMap<HTMLElement, number>();

/** Interpolate measurements, preserving units and final precision. */
export function tweenText(element: HTMLElement, next: string): void {
  const oldFrame = pending.get(element);
  if (oldFrame !== undefined) cancelAnimationFrame(oldFrame);
  pending.delete(element);
  const previous = element.textContent ?? "";
  const numbers = (value: string) => [...value.matchAll(/\d+(?:\.\d+)?/g)];
  const before = numbers(previous), after = numbers(next);
  const shape = (value: string) => value.replace(/\d+(?:\.\d+)?/g, "#");
  if (previous === next || reducedMotion() || !element.isConnected || before.length !== after.length ||
    !after.length || shape(previous) !== shape(next)) { element.textContent = next; return; }
  const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-4")) || 360;
  let started: number | undefined;
  const tick = (now: number) => {
    if (!element.isConnected) { pending.delete(element); return; }
    started ??= now;
    const progress = Math.min(1, (now - started) / duration);
    if (progress === 1 || reducedMotion()) { element.textContent = next; pending.delete(element); return; }
    const eased = 1 - (1 - progress) ** 3;
    let index = 0;
    element.textContent = next.replace(/\d+(?:\.\d+)?/g, (target) => {
      const initial = Number(before[index++]![0]);
      return (initial + (Number(target) - initial) * eased).toFixed(target.split(".")[1]?.length ?? 0);
    });
    pending.set(element, requestAnimationFrame(tick));
  };
  pending.set(element, requestAnimationFrame(tick));
}
