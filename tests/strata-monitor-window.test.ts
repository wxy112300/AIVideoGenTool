import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromptRuntimeState } from "../src/core/prompt-runtime-state";

const fake = vi.hoisted(() => ({ windows: [] as any[], sessions: [] as any[], failWindow: false }));
vi.mock("electron", () => ({
  session: { fromPartition: vi.fn((partition, options) => {
    const hooks: Record<string, any> = {};
    const s = { partition, options, hooks, webRequest: {
      onBeforeRequest: vi.fn((_filter, fn) => { hooks.request = fn; }),
      onBeforeSendHeaders: vi.fn((_filter, fn) => { hooks.headers = fn; }),
      onHeadersReceived: vi.fn((_filter, fn) => { hooks.response = fn; })
    }, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), on: vi.fn(), clearStorageData: vi.fn(async () => {}) };
    fake.sessions.push(s); return s;
  }) },
  BrowserWindow: class {
    events: Record<string, any> = {}; destroyed = false;
    webContents = { events: {} as Record<string, any>, setWindowOpenHandler: vi.fn(),
      on: (name: string, fn: any) => { this.webContents.events[name] = fn; }, insertCSS: vi.fn(async () => "css") };
    constructor(readonly options: any) { if (fake.failWindow) throw new Error("native window unavailable"); fake.windows.push(this); }
    once(name: string, fn: any) { this.events[name] = fn; }
    destroy() { this.destroyed = true; this.events.closed?.(); }
    isDestroyed() { return this.destroyed; }
    show = vi.fn(); loadURL = vi.fn(async (_url: string) => {});
  }
}));
import { strataMonitorOrigin, strataMonitorRequestAllowed, startStrataMonitorWindow } from "../electron/strata-monitor-window";

const target = { origin: "http://127.0.0.1:43127", apiKey: "private-test-key" };
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach(fn => fn()); fake.windows.length = 0; fake.sessions.length = 0; fake.failWindow = false; vi.clearAllMocks(); });
function fixture() {
  let connection: typeof target | null = { ...target };
  const state = { service: { backend: "strata", phase: "starting" } } as unknown as PromptRuntimeState;
  const error = vi.fn();
  const monitor = startStrataMonitorWindow({ connection: () => connection, runtime: () => state, onError: error });
  disposers.push(monitor.dispose);
  return { monitor, state, error, setConnection(value: typeof connection) { connection = value; } };
}

describe("Strata official read-only monitor", () => {
  it("does not let native window failures escape into the model lifecycle or retry every poll", () => {
    const f = fixture(); fake.failWindow = true;
    expect(() => f.monitor.sync()).not.toThrow(); f.monitor.sync();
    expect(f.error).toHaveBeenCalledOnce();
    expect(f.state.service).toMatchObject({ backend: "strata", phase: "starting" });
  });
  it.each(["https://127.0.0.1:43127", "http://localhost:43127", "http://127.0.0.1:8080", "http://127.0.0.1", "http://127.0.0.1:43127/other", "http://x@127.0.0.1:43127", "http://127.0.0.1:43127/?key=x"])("rejects unsafe capability origin %s", (origin) => {
    expect(strataMonitorOrigin({ ...target, origin })).toBeNull();
  });
  it("allows only GET monitor assets/status/records, never inference, control, configuration or foreign URLs", () => {
    for (const path of ["/api-monitor", "/api/requests?id=abc", "/v1/status", "/web/monitor.js", "/fonts/outfit-latin-wght.woff2"]) {
      expect(strataMonitorRequestAllowed(target, target.origin + path, "GET")).toBe(true);
      expect(strataMonitorRequestAllowed(target, target.origin + path, "POST")).toBe(false);
    }
    for (const path of ["/", "/load", "/unload", "/v1/load", "/v1/chat/completions", "/config", "/settings", "/web/app.js"]) {
      expect(strataMonitorRequestAllowed(target, target.origin + path, "GET")).toBe(false);
    }
    for (const url of ["https://example.com/api-monitor", "file:///secret", "http://127.0.0.1:43128/v1/status"]) {
      expect(strataMonitorRequestAllowed(target, url, "GET")).toBe(false);
    }
    expect(strataMonitorRequestAllowed(null, target.origin + "/v1/status", "GET")).toBe(false);
  });
  it("opens once in a no-preload sandbox, keeps the secret out of browser options and URL, and denies popups", () => {
    const f = fixture(); f.monitor.sync(); f.monitor.sync();
    expect(fake.windows).toHaveLength(1);
    const w = fake.windows[0];
    expect(w.loadURL).toHaveBeenCalledWith(target.origin + "/api-monitor");
    expect(w.options.webPreferences).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: false });
    expect(w.options.webPreferences.preload).toBeUndefined();
    expect(JSON.stringify(w.options)).not.toContain(target.apiKey);
    expect(fake.sessions[0].partition).not.toContain("persist:");
    expect(w.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: "deny" });
  });
  it("injects authentication only in main-process read requests, rotates keys without reopening and fails closed on owner loss", () => {
    const f = fixture(); f.monitor.sync(); const s = fake.sessions[0], callback = vi.fn();
    s.hooks.headers({ url: target.origin + "/v1/status", method: "GET", requestHeaders: { authorization: "bad", "x-api-key": "bad" } }, callback);
    expect(callback).toHaveBeenLastCalledWith({ requestHeaders: { Authorization: "Bearer " + target.apiKey } });
    f.setConnection({ ...target, apiKey: "rotated" }); f.monitor.sync();
    s.hooks.headers({ url: target.origin + "/api/requests", method: "GET", requestHeaders: {} }, callback);
    expect(callback).toHaveBeenLastCalledWith({ requestHeaders: { Authorization: "Bearer rotated" } });
    s.hooks.headers({ url: target.origin + "/web/monitor.js", method: "GET", requestHeaders: { Authorization: "bad" } }, callback);
    expect(callback).toHaveBeenLastCalledWith({ requestHeaders: {} });
    s.hooks.request({ url: target.origin + "/load", method: "POST" }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    f.setConnection(null);
    s.hooks.headers({ url: target.origin + "/v1/status", method: "GET", requestHeaders: {} }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    expect(fake.windows).toHaveLength(1);
  });
  it("does not reopen a dismissed window until the runtime stops; stopping or changing backend closes it", () => {
    const f = fixture(); f.monitor.sync(); fake.windows[0].destroy(); f.monitor.sync();
    expect(fake.windows).toHaveLength(1);
    f.state.service.phase = "stopped"; f.monitor.sync();
    f.state.service.phase = "starting"; f.monitor.sync();
    expect(fake.windows).toHaveLength(2);
    f.state.service.backend = "comfyui"; f.monitor.sync();
    expect(fake.windows[1].destroyed).toBe(true);
  });
  it("hides upstream control/auth widgets and blocks navigation, permissions and downloads", async () => {
    const f = fixture(); f.monitor.sync(); const w = fake.windows[0], s = fake.sessions[0];
    w.webContents.events["did-finish-load"]();
    expect(w.webContents.insertCSS).toHaveBeenCalledWith(expect.stringContaining("#load,#unload,#key,#auth{display:none!important}"));
    const event = { preventDefault: vi.fn() }; w.webContents.events["will-navigate"](event, target.origin + "/");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    const granted = vi.fn(); s.setPermissionRequestHandler.mock.calls[0][0](null, "camera", granted);
    expect(granted).toHaveBeenCalledWith(false);
    expect(s.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false);
    s.on.mock.calls[0][1](event); expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });
});
