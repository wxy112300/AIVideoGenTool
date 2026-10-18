import type { Settings } from "../../../types";
import { LAN_BROWSER_DEFAULT_PORT } from "../../../core/lan-browser";
import { uiKeys } from "../../../core/i18n-keys";
import type { Translate } from "../../../core/i18n";
import type { RendererContext, RendererCleanup } from "../../contracts";

export function renderLanBrowserSettings(settings: Settings, t: Translate, escape: (text: string) => string): string {
  const k = uiKeys.lanBrowser;
  return `<section class="panel settings-section" data-lan-panel>
    <div class="section-heading"><div><h2>${t(k.title)}</h2><span class="muted">${t(k.description)}</span></div></div>
    <label class="ios-switch-field"><span class="policy-copy"><strong>${t(k.enabled)}</strong><small>${t(k.unprotected)}</small></span><input id="lan-browser-enabled" type="checkbox" ${settings.lanBrowserEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
    <label>${t(k.port)}<input id="lan-browser-port" type="number" min="1024" max="65535" step="1" value="${settings.lanBrowserPort ?? LAN_BROWSER_DEFAULT_PORT}"></label>
    <small class="muted">${t(k.saveHint)}</small>
    <p data-lan-status role="status" aria-live="polite">${t(k.loading)}</p>
    <div class="input-action"><select data-lan-address aria-label="${escape(t(k.copy))}" disabled></select><button type="button" class="secondary" data-lan-copy disabled>${t(k.copy)}</button></div>
    <div class="button-row"><button type="button" class="secondary" data-lan-open disabled>${t(k.open)}</button><button type="button" class="ghost" data-lan-retry hidden>${t(k.retry)}</button></div>
  </section>`;
}

export function mountLanBrowserSettings(context: RendererContext, options: {
  formSettings(): Settings;
  requestSaveSettings(settings: Settings): Promise<"saved" | "migration-required">;
}): RendererCleanup {
  const panel = context.root.querySelector<HTMLElement>("[data-lan-panel]");
  if (!panel) return () => undefined;
  const events = new AbortController();
  const k = uiKeys.lanBrowser;
  const field = panel.querySelector<HTMLInputElement>("#lan-browser-enabled")!;
  const status = panel.querySelector<HTMLElement>("[data-lan-status]")!;
  const addresses = panel.querySelector<HTMLSelectElement>("[data-lan-address]")!;
  const copy = panel.querySelector<HTMLButtonElement>("[data-lan-copy]")!;
  const open = panel.querySelector<HTMLButtonElement>("[data-lan-open]")!;
  const retry = panel.querySelector<HTMLButtonElement>("[data-lan-retry]")!;
  let urlsSignature = "";
  let polling = false;
  const notifyError = (error: unknown) => context.notify(error instanceof Error ? error.message : String(error), { renderPage: false, kind: "error" });
  const poll = async () => {
    if (polling || events.signal.aborted) return;
    polling = true;
    try {
      const value = await context.application.getLanBrowserStatus();
      if (events.signal.aborted) return;
      status.textContent = value.state === "error" ? value.error
        : context.t(k[value.state === "running" ? "running" : value.state === "starting" ? "starting" : "off"]);
      if (value.state === "running" && !value.urls.length) status.textContent += ` · ${context.t(k.noAddress)}`;
      open.disabled = value.state !== "running";
      copy.disabled = value.state !== "running" || !value.urls.length;
      retry.hidden = value.state !== "error";
      const next = JSON.stringify(value.urls);
      if (next !== urlsSignature) {
        const selected = addresses.value;
        addresses.replaceChildren(...value.urls.map((url) => {
          const option = document.createElement("option"); option.value = url; option.textContent = url; return option;
        }));
        if (value.urls.includes(selected)) addresses.value = selected;
        addresses.disabled = !value.urls.length;
        urlsSignature = next;
      }
    } catch {
      if (!events.signal.aborted) status.textContent = context.t(k.error);
    } finally { polling = false; }
  };
  field.addEventListener("change", () => {
    void options.requestSaveSettings(options.formSettings()).then(poll).catch(notifyError);
  }, { signal: events.signal });
  retry.addEventListener("click", () => {
    void context.application.retryLanBrowser().then(poll).catch(notifyError);
  }, { signal: events.signal });
  open.addEventListener("click", () => {
    void context.application.openLanBrowser().catch(notifyError);
  }, { signal: events.signal });
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(addresses.value).then(() => context.notify(context.t(k.copied), { renderPage: false })).catch(notifyError);
  }, { signal: events.signal });
  void poll();
  const timer = window.setInterval(() => { void poll(); }, 1500);
  return () => { events.abort(); window.clearInterval(timer); };
}
