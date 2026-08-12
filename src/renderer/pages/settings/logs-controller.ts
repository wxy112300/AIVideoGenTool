import type { RendererCleanup, RendererContext } from "../../contracts";

export interface SettingsLogsControllerOptions {
  loadAppLogs(): void;
  openAppLogContextMenu(clientX: number, clientY: number): void;
  setAppLogFollowTail(followTail: boolean): void;
}

export function mountSettingsLogsController(
  context: RendererContext,
  options: SettingsLogsControllerOptions
): RendererCleanup {
  const events = new AbortController();
  const signal = events.signal;
  const root = context.root;

  root.querySelector("#refresh-app-logs")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    options.loadAppLogs();
  }, { signal });

  const openLogDirectory = async (
    kind: "logs" | "crashDumps",
    action: string,
    failureMessage: string
  ) => {
    context.reportUserAction(action);
    const opened = await context.studio.openAppLogDirectory(kind);
    if (!opened) context.notify(failureMessage);
  };

  root.querySelector("#open-app-log-directory")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    void openLogDirectory("logs", "open-log-directory", "日志目录无法打开。");
  }, { signal });

  root.querySelector("#open-app-crash-directory")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    void openLogDirectory("crashDumps", "open-crash-directory", "崩溃转储目录无法打开。");
  }, { signal });

  const terminal = root.querySelector<HTMLPreElement>("#app-log-terminal");
  if (terminal) {
    terminal.scrollTop = terminal.scrollHeight;
    terminal.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.openAppLogContextMenu(event.clientX, event.clientY);
    }, { signal });
    terminal.addEventListener("scroll", (event) => {
      event.stopImmediatePropagation();
      options.setAppLogFollowTail(
        terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 48
      );
    }, { signal });
  }

  return () => events.abort();
}
