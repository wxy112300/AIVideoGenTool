import type { Settings } from "../../../types";
import { LAN_BROWSER_DEFAULT_PORT } from "../../../core/lan-browser";
import { uiKeys } from "../../../core/i18n-keys";
import type { Translate } from "../../../core/i18n";
import type { RendererContext, RendererCleanup } from "../../contracts";
import { escapeHtml } from "../../shared/dom";

// A save remounts Settings before the listener has necessarily stopped.
const failedStarts = new WeakSet<HTMLElement>();

function addressRow(url: string, t: Translate, escape: (text: string) => string): string {
  const k = uiKeys.lanBrowser;
  return `<div class="input-action" data-lan-address-row><input type="text" data-lan-address readonly value="${escape(url)}" aria-label="${escape(t(k.copy))}" ${url ? "" : "disabled"}><button type="button" class="secondary" data-lan-copy disabled>${t(k.copy)}</button><button type="button" class="secondary" data-lan-open disabled>${t(k.open)}</button></div>`;
}

export function renderLanBrowserSettings(settings: Settings, t: Translate, escape: (text: string) => string): string {
  const k = uiKeys.lanBrowser;
  return `<section class="panel settings-section settings-form-card" data-lan-panel>
    <div class="section-heading"><div><h2>${t(k.title)}</h2></div></div>
    <div class="settings-grid two">
      <label class="ios-switch-field"><span class="policy-copy"><strong>${t(k.enabled)}</strong><small>${t(k.unprotected)}</small></span><input id="lan-browser-enabled" type="checkbox" ${settings.lanBrowserEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
      <label>${t(k.port)}<input id="lan-browser-port" type="number" min="1024" max="65535" step="1" value="${settings.lanBrowserPort ?? LAN_BROWSER_DEFAULT_PORT}"></label>
    </div>
    <div data-lan-status-row ${settings.lanBrowserEnabled ? "" : "hidden"}><p data-lan-status role="status" aria-live="polite">${t(k.loading)}</p></div>
    <div class="lan-browser-addresses" data-lan-addresses hidden></div>
  </section>`;
}

export function mountLanBrowserSettings(context: RendererContext, options: {
  formSettings(): Settings;
  requestSaveSettings(settings: Settings): Promise<"saved" | "migration-required">;
  setSettingsDraft?(settings: Settings | null): void;
}): RendererCleanup {
  const panel = context.root.querySelector<HTMLElement>("[data-lan-panel]");
  if (!panel) return () => undefined;
  const events = new AbortController();
  const k = uiKeys.lanBrowser;
  const field = panel.querySelector<HTMLInputElement>("#lan-browser-enabled")!;
  const status = panel.querySelector<HTMLElement>("[data-lan-status]")!;
  const statusRow = panel.querySelector<HTMLElement>("[data-lan-status-row]")!;
  const addresses = panel.querySelector<HTMLElement>("[data-lan-addresses]")!;
  let urlsSignature = "";
  let polling = false;
  let statusFailureNotified = false;
  const notifyError = (error: unknown) => context.notify(error instanceof Error ? error.message : String(error), { renderPage: false, kind: "error" });
  const poll = async () => {
    if (polling || events.signal.aborted) return;
    polling = true;
    try {
      const value = await context.application.getLanBrowserStatus();
      if (events.signal.aborted) return;
      statusFailureNotified = false;
      panel.dataset.lanState = value.state;
      if (value.state === "error") {
        addresses.hidden = true; statusRow.hidden = true; field.checked = false;
        if (!failedStarts.has(context.root)) {
          failedStarts.add(context.root);
          const settings = { ...options.formSettings(), lanBrowserEnabled: false };
          options.setSettingsDraft?.(settings);
          notifyError(value.error || context.t(k.error));
          await options.requestSaveSettings(settings).catch(notifyError);
        }
        return;
      }
      if (value.state === "off") failedStarts.delete(context.root);
      status.textContent = value.state === "running" && !value.urls.length ? context.t(k.noAddress)
        : value.state === "starting" ? context.t(k.starting) : "";
      statusRow.hidden = !status.textContent;
      const next = JSON.stringify(value.urls);
      if (next !== urlsSignature) {
        addresses.innerHTML = value.urls.map((url) => addressRow(url, context.t, escapeHtml)).join("");
        urlsSignature = next;
      }
      addresses.hidden = value.state !== "running" || !value.urls.length;
      addresses.querySelectorAll<HTMLButtonElement>("[data-lan-open]").forEach((button) => { button.disabled = value.state !== "running"; });
      addresses.querySelectorAll<HTMLButtonElement>("[data-lan-copy]").forEach((button) => { button.disabled = value.state !== "running" || !value.urls.length; });
    } catch {
      if (!events.signal.aborted) {
        panel.dataset.lanState = "error";
        statusRow.hidden = true; addresses.hidden = true;
        if (!statusFailureNotified) { notifyError(context.t(k.error)); statusFailureNotified = true; }
      }
    } finally { polling = false; }
  };
  field.addEventListener("change", () => {
    if (field.checked) failedStarts.delete(context.root);
    const settings = options.formSettings();
    options.setSettingsDraft?.(settings);
    void options.requestSaveSettings(settings).then(poll).catch(notifyError);
  }, { signal: events.signal });
  addresses.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!target || target.disabled) return;
    if (target.hasAttribute("data-lan-open")) void context.application.openLanBrowser().catch(notifyError);
    if (target.hasAttribute("data-lan-copy")) {
      const url = target.closest("[data-lan-address-row]")!.querySelector<HTMLInputElement>("[data-lan-address]")!.value;
      void navigator.clipboard.writeText(url).then(() => context.notify(context.t(k.copied), { renderPage: false })).catch(notifyError);
    }
  }, { signal: events.signal });
  void poll();
  const timer = window.setInterval(() => { void poll(); }, 1500);
  return () => { events.abort(); window.clearInterval(timer); };
}
