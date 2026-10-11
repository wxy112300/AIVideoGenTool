// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { mountSettingsPageController } from "../src/renderer/pages/settings/page-controller";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import type { SettingsInstallGuideSelection } from "../src/renderer/pages/settings/fragments";
import type { EnvironmentScanResult } from "../src/types";
import { mountSettingsNodeDependencyController } from "../src/renderer/pages/settings/node-dependency-controller";

describe("Strata settings controls", () => {
  it.each(["ready", "running", "stale", "unowned", "disabled"])("requests confirmation only for the current eligible Strata installation (%s)", (state) => {
    const root=document.createElement("main"); root.innerHTML=`<button data-uninstall-strata ${state === "disabled" ? "disabled" : ""}>Uninstall</button>`;
    const settings=createDefaultSettings(), request=vi.fn();
    const status={configuredInstallDirectory:state === "stale" ? "other" : "",installDirectory:"managed-runtime",managedUninstallable:state !== "unowned"};
    const cleanup=mountSettingsNodeDependencyController({root,getState:()=>({queue:state === "running" ? [{status:"running"}] : []}),getRoute:()=>({page:"settings"}),requestRender:vi.fn(),notify:vi.fn(),t:()=>"blocked"} as unknown as RendererContext,{
      formSettings:()=>settings,getEnvironmentScan:()=>({strataPreparation:status} as EnvironmentScanResult),refreshEnvironment:vi.fn(async()=>null),setSettingsDraft:vi.fn(),enqueueCustomNodeInstall:vi.fn(),requestCustomNodeUninstall:vi.fn(),setLlamaCppPythonInstalling:vi.fn(),getLlamaCppPythonLog:()=>"",setLlamaCppPythonLog:vi.fn(),requestLlamaCppPythonUninstall:vi.fn(),requestStrataUninstall:request
    });
    try{root.querySelector<HTMLButtonElement>("button")!.click(); if(state === "ready") expect(request).toHaveBeenCalledWith("managed-runtime"); else expect(request).not.toHaveBeenCalled();}finally{cleanup();}
  });
  it.each([[false, ""], [false, "D:\\managed\\v0.1.41"], [true, ""]] as const)("gets the managed destination on first guide click and does not reopen a dismissed guide (dismissed=%s, runtime=%s)", async (dismissed, runtimeDirectory) => {
    const root = document.createElement("main");
    root.innerHTML = '<button data-install-profile="strata/qwen3.8-flash-next-iq3_xxs" data-install-component="0"></button>';
    const settings = { ...createDefaultSettings(), strataInstallDirectory: runtimeDirectory, strataModelDirectory: "D:\\legacy-downloads" };
    let selected: SettingsInstallGuideSelection | null = null;
    const setInstallGuide = vi.fn((value: SettingsInstallGuideSelection | null) => { selected = value; });
    let resolveScan!: (value: EnvironmentScanResult) => void;
    const runEnvironmentScan = vi.fn(() => new Promise<EnvironmentScanResult>((resolve) => { resolveScan = resolve; }));
    const cleanup = mountSettingsPageController({
      context: { root, requestRender: vi.fn(), hostCapabilities: {}, notify: vi.fn() } as unknown as RendererContext,
      formSettings: () => settings, getEnvironmentScan: () => null, setSettingsDraft: vi.fn(),
      setInstallGuide, getInstallGuide: () => selected, settingsHaveUnsavedChanges: () => false,
      syncSettingsDirtyUi: vi.fn(), runEnvironmentScan, loadAppLogs: vi.fn(),
      togglePromptModel: vi.fn(), requestSaveSettings: vi.fn(), openImageAssetLibrary: vi.fn(), rememberModalFocus: vi.fn()
    });
    root.querySelector<HTMLButtonElement>("button")!.click();
    expect(runEnvironmentScan).toHaveBeenCalledWith(settings);
    expect(setInstallGuide.mock.calls[0][0]?.targetRoot).toBe("");
    if (dismissed) selected = null;
    // A scan rerenders the settings page and cleans up the old controller.
    cleanup();
    resolveScan({ strataPreparation: { installDirectory: "D:\\managed\\v0.1.41", configuredInstallDirectory: runtimeDirectory, modelDirectory: "D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF", files: [], sourcePresent: false, enginePresent: false, scannedAt: "now" } } as EnvironmentScanResult);
    if (dismissed) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setInstallGuide).toHaveBeenCalledTimes(1);
    } else {
      await vi.waitFor(() => expect(setInstallGuide).toHaveBeenCalledTimes(2));
      expect(setInstallGuide.mock.calls[1][0]?.targetRoot).toBe("D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF");
    }
  });
  it.each([true, false])("submits installation by button and retains result/retry state (ok=%s)", async (ok) => {
    const root = document.createElement("main"); root.innerHTML = '<button id="install-strata">Install</button>';
    const settings = createDefaultSettings();
    const installStrata = vi.fn(async () => ({ ok, message: "result", log: "installation output" }));
    const setInstalling = vi.fn(), setLog = vi.fn(), refresh = vi.fn(async () => null), notify = vi.fn();
    const cleanup = mountSettingsNodeDependencyController({ root, getState: () => ({ queue: [] }), getRoute: () => ({ page: "settings" }), requestRender: vi.fn(), application: { installStrata }, notify } as unknown as RendererContext, {
      formSettings: () => settings, getEnvironmentScan: () => null, refreshEnvironment: refresh,
      setSettingsDraft: vi.fn(), enqueueCustomNodeInstall: vi.fn(), requestCustomNodeUninstall: vi.fn(),
      setLlamaCppPythonInstalling: vi.fn(), getLlamaCppPythonLog: () => "", setLlamaCppPythonLog: vi.fn(), requestLlamaCppPythonUninstall: vi.fn(),
      setStrataInstalling: setInstalling, getStrataLog: () => "", setStrataLog: setLog
    });
    try {
      root.querySelector<HTMLButtonElement>("button")!.click();
      await vi.waitFor(() => expect(setInstalling).toHaveBeenLastCalledWith(false));
      expect(installStrata).toHaveBeenCalledWith(settings);
      expect(setLog).toHaveBeenLastCalledWith("installation output");
      expect(refresh).toHaveBeenCalledWith(settings, "dependency-change");
      expect(notify).toHaveBeenCalledWith("result", { kind: ok ? "info" : "error" });
      expect(settings.promptModelId).not.toContain("strata");
    } finally { cleanup(); }
  });
  it.each([["", "D:\\Strata-models"], ["D:\\ComfyUI\\models", "D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF"]])("uses the shared model root, or legacy fallback when no ComfyUI root is known (%s)", (modelDirectory, targetRoot) => {
    const root = document.createElement("main");
    root.innerHTML = '<button data-install-profile="strata/qwen3.8-flash-next-iq3_xxs" data-install-component="0"></button>';
    const settings = { ...createDefaultSettings(), modelDirectory, strataModelDirectory: "D:\\Strata-models" };
    const setInstallGuide = vi.fn();
    const cleanup = mountSettingsPageController({
      context: { root, requestRender: vi.fn(), hostCapabilities: {} } as unknown as RendererContext,
      formSettings: () => settings, getEnvironmentScan: () => modelDirectory ? null : ({ strataPreparation: { installDirectory: "managed-runtime", configuredInstallDirectory: "", modelDirectory: targetRoot } } as EnvironmentScanResult), setSettingsDraft: vi.fn(),
      setInstallGuide, getInstallGuide: () => null, settingsHaveUnsavedChanges: () => true,
      syncSettingsDirtyUi: vi.fn(), runEnvironmentScan: vi.fn(), loadAppLogs: vi.fn(),
      togglePromptModel: vi.fn(), requestSaveSettings: vi.fn(), openImageAssetLibrary: vi.fn(), rememberModalFocus: vi.fn()
    });
    try {
      root.querySelector<HTMLButtonElement>("button")!.click();
      const guide = setInstallGuide.mock.calls[0][0] as SettingsInstallGuideSelection;
      expect(guide.targetRoot).toBe(targetRoot);
      expect(guide.component.installGuide.downloadUrl).toContain("/resolve/ed59f92082b1e93c0e96d60a8b11aab089b52f09/");
    } finally { cleanup(); }
  });

  it("picks a directory through host capabilities, keeps it unsaved and requests the existing scanner", async () => {
    const root = document.createElement("main");
    root.innerHTML = '<input id="strata-install-directory" value=""><button data-pick-strata-directory="strata-install-directory"></button>';
    document.body.append(root);
    const base = createDefaultSettings();
    const setSettingsDraft = vi.fn();
    const runEnvironmentScan = vi.fn(async () => null);
    const requestSaveSettings = vi.fn();
    const cleanup = mountSettingsPageController({
      context: { root, requestRender: vi.fn(), hostCapabilities: { pickDirectory: vi.fn(async () => "D:\\Strata-models") } } as unknown as RendererContext,
      formSettings: () => readSettingsFromForm(base, "official-storyboard", "faithful"),
      getEnvironmentScan: () => null, setSettingsDraft, setInstallGuide: vi.fn(), getInstallGuide: () => null,
      settingsHaveUnsavedChanges: () => false, syncSettingsDirtyUi: vi.fn(), runEnvironmentScan,
      loadAppLogs: vi.fn(), togglePromptModel: vi.fn(), requestSaveSettings,
      openImageAssetLibrary: vi.fn(), rememberModalFocus: vi.fn()
    });
    try {
      root.querySelector<HTMLButtonElement>("button")!.click();
      await vi.waitFor(() => expect(runEnvironmentScan).toHaveBeenCalledTimes(1));
      expect(setSettingsDraft.mock.calls[0][0]).toMatchObject({ strataInstallDirectory: "D:\\Strata-models", strataModelDirectory: "", promptModelId: base.promptModelId });
      expect(requestSaveSettings).not.toHaveBeenCalled();
    } finally { cleanup(); root.remove(); }
  });
});
