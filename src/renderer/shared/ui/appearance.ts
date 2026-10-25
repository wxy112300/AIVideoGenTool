import { normalizeAppearance } from "../../../core/appearance";

export function applyAppearance(value: unknown): void {
  const appearance = normalizeAppearance(value);
  Object.assign(document.documentElement.dataset, appearance);
}
