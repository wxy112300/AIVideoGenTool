import { BrowserWindow, session } from "electron";
import { randomUUID } from "node:crypto";
import type { PromptRuntimeState } from "../src/core/prompt-runtime-state.js";
import type { StrataMonitorConnection } from "./services/strata-service.js";

const page = "/api-monitor";
const paths = new Set([page, "/web/monitor.js", "/web/tokens.css", "/web/favicon.svg", "/v1/status", "/api/requests"]);

export function strataMonitorOrigin(connection: StrataMonitorConnection | null): string | null {
  if (!connection?.apiKey) return null;
  try {
    const url = new URL(connection.origin);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      Boolean(url.port) && url.port !== "8080" && url.pathname === "/" &&
      !url.username && !url.password && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

/** The upstream monitor is view-only here, even if a hidden control is invoked. */
export function strataMonitorRequestAllowed(connection: StrataMonitorConnection | null, value: string, method: string): boolean {
  const origin = strataMonitorOrigin(connection);
  if (!origin || method !== "GET") return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password && !url.hash &&
      (paths.has(url.pathname) || /^\/fonts\/[a-z0-9-]+\.woff2$/u.test(url.pathname));
  } catch { return false; }
}

interface StrataMonitorWindowOptions {
  connection(): StrataMonitorConnection | null;
  runtime(): PromptRuntimeState;
  onError(): void;
}

/** Official frontend in an ephemeral, sandboxed window; no preload or renderer key. */
export function startStrataMonitorWindow(options: StrataMonitorWindowOptions): { sync(): void; dispose(): void } {
  let window: BrowserWindow | null = null;
  let openedOrigin: string | null = null;
  let attemptKey: string | null = null;
  let attempts = 0;
  let retryAt = 0;
  let disposed = false;
  const close = () => { const current = window; window = null; if (current && !current.isDestroyed()) current.destroy(); };
  const reportFailure = () => { try { options.onError(); } catch { /* Diagnostics never own model lifecycle. */ } };
  const update = () => {
    if (disposed) return;
    const runtime = options.runtime();
    if (runtime.service.backend !== "strata" || ["stopped", "error"].includes(runtime.service.phase)) {
      openedOrigin = null; attemptKey = null; attempts = 0; retryAt = 0; close(); return;
    }
    const capability = options.connection();
    const origin = strataMonitorOrigin(capability);
    // Adaptive lazy-server restarts rotate the private key; keep the same window.
    if (!origin || origin === openedOrigin) return;
    // Retry transient lazy-server startup/restart failures, not an explicit user dismissal.
    if (attemptKey !== capability!.apiKey) { attemptKey = capability!.apiKey; attempts = 0; retryAt = 0; }
    if (attempts >= 3 || Date.now() < retryAt) return;
    attempts++; retryAt = Date.now() + 2000;
    close(); openedOrigin = origin;
    const isolated = session.fromPartition(`strata-monitor-${randomUUID()}`, { cache: false });
    const connection = () => {
      const current = options.connection();
      return strataMonitorOrigin(current) === origin ? current : null;
    };
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on("will-download", (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
      callback({ cancel: !strataMonitorRequestAllowed(connection(), details.url, details.method) });
    });
    isolated.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
      const current = connection();
      if (!strataMonitorRequestAllowed(current, details.url, details.method)) { callback({ cancel: true }); return; }
      const headers = Object.fromEntries(Object.entries(details.requestHeaders)
        .filter(([key]) => !["authorization", "x-api-key"].includes(key.toLowerCase())));
      if (["/v1/status", "/api/requests"].includes(new URL(details.url).pathname)) headers.Authorization = `Bearer ${current!.apiKey}`;
      callback({ requestHeaders: headers });
    });
    isolated.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, (details, callback) => {
      const headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {})
        .filter(([key]) => !["content-security-policy", "cache-control", "referrer-policy"].includes(key.toLowerCase())));
      headers["Content-Security-Policy"] = ["default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"];
      headers["Cache-Control"] = ["no-store"];
      headers["Referrer-Policy"] = ["no-referrer"];
      callback({ responseHeaders: headers });
    });
    const current = new BrowserWindow({
      width: 1180, height: 800, minWidth: 780, minHeight: 560, show: false,
      title: "Strata · 运行监视", autoHideMenuBar: true,
      webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true,
        sandbox: true, webSecurity: true, devTools: false }
    });
    window = current;
    current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    current.webContents.on("will-navigate", (event, url) => { if (url !== origin + page) event.preventDefault(); });
    current.webContents.on("page-title-updated", (event) => event.preventDefault());
    current.webContents.on("did-finish-load", () => {
      void current.webContents.insertCSS("#load,#unload,#key,#auth{display:none!important}.top>.controls:before{content:'只读监视 · 模型由 Local Video Studio 管理';color:var(--st-ink-muted);font-size:13px}").catch(() => undefined);
    });
    current.once("ready-to-show", () => { if (!current.isDestroyed()) current.show(); });
    current.once("closed", () => {
      if (window === current) window = null;
      isolated.webRequest.onBeforeRequest(null);
      isolated.webRequest.onBeforeSendHeaders(null);
      isolated.webRequest.onHeadersReceived(null);
      void isolated.clearStorageData().catch(() => undefined);
    });
    void current.loadURL(origin + page).catch(() => {
      if (window !== current || current.isDestroyed()) return;
      openedOrigin = null; current.destroy(); reportFailure();
    });
  };
  const sync = () => { try { update(); } catch { openedOrigin = null; close(); reportFailure(); } };
  const timer = setInterval(sync, 1000);
  timer.unref();
  return { sync, dispose() { disposed = true; clearInterval(timer); close(); } };
}
