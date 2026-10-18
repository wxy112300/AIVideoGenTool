import { createTranslator, loadUiLocale } from "../core/i18n";
import { uiKeys } from "../core/i18n-keys";
export { icon, renderIcons } from "../renderer/shared/icons";
let translator = createTranslator();
export type CopyKey = keyof typeof uiKeys.lanBrowser;
export const text = (key: CopyKey): string => translator.t(uiKeys.lanBrowser[key]);
export async function setLocale(locale: unknown): Promise<void> {
  translator = createTranslator(await loadUiLocale(locale));
  document.documentElement.lang = translator.locale;
}
export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
export function duration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
let toastTimer = 0;
export function toast(message: string): void {
  const element = document.querySelector<HTMLElement>("#toast");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 3500);
}
export function button(action: string, symbol: string, label: string, className = ""): string {
  return `<button type="button" data-action="${action}" class="icon-button ${className}" aria-label="${escape(label)}" title="${escape(label)}">${symbol}</button>`;
}
