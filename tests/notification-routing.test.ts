import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { mountSettingsLogsController } from "../src/renderer/pages/settings/logs-controller";
import { mountSettingsPageController } from "../src/renderer/pages/settings/page-controller";

type EventHandler = (event: { currentTarget?: unknown; target?: unknown }) => unknown;

interface FakeButton {
  dataset: Record<string, string>;
  addEventListener: (type: string, handler: EventHandler) => void;
}

function button(dataset: Record<string, string> = {}) {
  const handlers = new Map<string, EventHandler>();
  const value: FakeButton = {
    dataset,
    addEventListener: (type, handler) => {
      handlers.set(type, handler);
    }
  };
  return { value, handlers };
}

function baseContext(
  root: unknown,
  notify: RendererContext["notify"],
  hostCapabilities: Partial<RendererContext["hostCapabilities"]>
): RendererContext {
  const state = createDefaultState();
  return {
    root: root as HTMLElement,
    application: {} as RendererContext["application"],
    events: {} as RendererContext["events"],
    assets: {} as RendererContext["assets"],
    hostCapabilities: hostCapabilities as RendererContext["hostCapabilities"],
    getState: () => state,
    getRoute: () => ({ page: "settings", creationMode: "image-to-video", historyKind: "video" }),
    getTranslator: () => ({ locale: "zh-CN", t: (key: string) => key }),
    t: (key: string) => key,
    requestRender: vi.fn(),
    navigate: vi.fn(),
    notify,
    reportUserAction: vi.fn()
  };
}

describe("notification error routing", () => {
  it("marks Settings download and directory open failures as errors", async () => {
    const installDownload = button();
    const installDirectory = button({ installDirectory: "D:\\ComfyUI" });
    const environmentDownload = button({ openEnvironmentDownload: "https://example.com/model" });
    const buttons: Record<string, FakeButton | null> = {
      "#open-install-download": installDownload.value,
      "#open-install-directory": installDirectory.value
    };
    const root = {
      querySelector: (selector: string) => buttons[selector] ?? null,
      querySelectorAll: (selector: string) => selector === "[data-open-environment-download]"
        ? [environmentDownload.value]
        : []
    };
    const notify = vi.fn();
    const context = baseContext(root, notify, {
      openExternal: vi.fn(async () => false),
      openDirectory: vi.fn(async () => false)
    });
    const cleanup = mountSettingsPageController({
      context,
      formSettings: () => createDefaultState().settings,
      getEnvironmentScan: () => null,
      setSettingsDraft: vi.fn(),
      setInstallGuide: vi.fn(),
      getInstallGuide: () => ({
        profileName: "Test profile",
        component: { installGuide: { downloadUrl: "https://example.com/download" } }
      } as never),
      settingsHaveUnsavedChanges: () => false,
      syncSettingsDirtyUi: vi.fn(),
      runEnvironmentScan: vi.fn(async () => null),
      loadAppLogs: vi.fn(),
      togglePromptModel: vi.fn(async () => undefined),
      requestSaveSettings: vi.fn(async () => "saved" as const),
      openImageAssetLibrary: vi.fn(),
      rememberModalFocus: vi.fn(),
      restoreModalFocus: vi.fn(),
      bindModalFocus: vi.fn()
    });

    await installDownload.handlers.get("click")?.({});
    await installDirectory.handlers.get("click")?.({ currentTarget: installDirectory.value });
    await environmentDownload.handlers.get("click")?.({});

    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenNthCalledWith(1, "settings.actions.downloadPageFailed", { kind: "error" });
    expect(notify).toHaveBeenNthCalledWith(2, "settings.actions.openDirectoryFailed", { kind: "error" });
    expect(notify).toHaveBeenNthCalledWith(3, "settings.actions.downloadPageFailed", { kind: "error" });
    cleanup();
  });

  it("marks log directory open failures as errors", async () => {
    const logDirectory = button();
    const crashDirectory = button();
    const buttons: Record<string, FakeButton> = {
      "#open-app-log-directory": logDirectory.value,
      "#open-app-crash-directory": crashDirectory.value
    };
    const root = {
      querySelector: (selector: string) => buttons[selector] ?? null
    };
    const notify = vi.fn();
    const context = baseContext(root, notify, {
      openAppLogDirectory: vi.fn(async () => false)
    });
    const cleanup = mountSettingsLogsController(context, {
      loadAppLogs: vi.fn(),
      openAppLogContextMenu: vi.fn(),
      setAppLogFollowTail: vi.fn()
    });

    const event = { stopImmediatePropagation: vi.fn() };
    await logDirectory.handlers.get("click")?.(event);
    await crashDirectory.handlers.get("click")?.(event);

    expect(notify).toHaveBeenNthCalledWith(1, "settings.actions.logDirectoryFailed", { kind: "error" });
    expect(notify).toHaveBeenNthCalledWith(2, "settings.actions.crashDumpDirectoryFailed", { kind: "error" });
    cleanup();
  });
});
