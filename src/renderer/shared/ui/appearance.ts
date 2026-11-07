import { normalizeAppearance } from "../../../core/appearance";

export function applyAppearance(value: unknown): void {
  const appearance = normalizeAppearance(value);
  const dataset = document.documentElement.dataset;
  for (const [key, value] of Object.entries(appearance)) {
    if (dataset[key] !== String(value)) dataset[key] = String(value);
  }
}
