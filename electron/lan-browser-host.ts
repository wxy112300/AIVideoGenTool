import type { IpcMain } from "electron";
import type { ApplicationRuntimeContext } from "./application-runtime.js";
import type { AppLogger } from "../src/infrastructure/app-logger.js";
import { LAN_BROWSER_DEFAULT_PORT } from "../src/core/lan-browser.js";
import type { Settings } from "../src/types.js";
import { LanBrowserLibrary } from "./services/lan-browser-library.js";
import { LanBrowserServer } from "./services/lan-browser-server.js";

/** Desktop shell adapter: service lifecycle follows settings, not the GPU runtime. */
export function registerLanBrowserHost(deps: {
  context: ApplicationRuntimeContext;
  ipc: IpcMain;
  webRoot: string;
  ready: Promise<void>;
  openExternal(url: string): Promise<void>;
  logger: AppLogger;
}): { dispose(): Promise<void> } {
  const library = new LanBrowserLibrary({ store: deps.context.store,
    query: deps.context.services.history.query, metadata: deps.context.services.history.metadata });
  const server = new LanBrowserServer({ library, webRoot: deps.webRoot });
  let signature = "";
  let disposed = false;
  let ready = false;
  const align = async (settings: Settings, retry = false) => {
    const enabled = settings.lanBrowserEnabled === true;
    const port = settings.lanBrowserPort ?? LAN_BROWSER_DEFAULT_PORT;
    const next = `${enabled}:${port}`;
    if (!ready || disposed || (!retry && next === signature)) return server.snapshot();
    signature = next;
    const status = await server.configure(enabled, port);
    if (status.state === "error") deps.logger.warn("app", "lan-browser-start-failed", status.error);
    return status;
  };
  const unsubscribe = deps.context.events.subscribe("state:changed", (state) => {
    void align(state.settings).catch(() => undefined);
  });
  deps.ipc.handle("lan-browser:status", () => server.snapshot());
  deps.ipc.handle("lan-browser:retry", () => align(deps.context.store.getSettings(), true));
  deps.ipc.handle("lan-browser:open", async () => {
    const status = server.snapshot();
    if (status.state !== "running") throw new Error("请先开启局域网视频浏览服务。");
    await deps.openExternal(status.localUrl);
  });
  void deps.ready.then(() => {
    ready = true;
    return align(deps.context.store.getSettings());
  }).catch(() => undefined);
  return { async dispose() {
    disposed = true;
    unsubscribe();
    await server.configure(false);
  } };
}
