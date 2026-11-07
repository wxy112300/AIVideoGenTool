// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { createTranslator, loadUiLocale } from "../src/core/i18n";
import { renderModelLibraries, modelLibrariesFromForm } from "../src/renderer/pages/settings/model-libraries";
import { mountSettingsPageController, type SettingsPageControllerOptions } from "../src/renderer/pages/settings/page-controller";
import { modelComponentWithLocations, openModelComponentLocation } from "../src/renderer/pages/settings/model-location";
import type { ModelComponentStatus } from "../src/types";

afterEach(() => { document.body.innerHTML = ""; });
it("adds empty rows without a picker, protects the first row and uses drag order as the default", async () => {
  let settings = { ...createDefaultSettings(), modelDirectory: "D:/models", modelDirectories: ["D:/models", "E:/models"] };
  const root = document.createElement("div"); document.body.append(root);
  const t = createTranslator("zh-CN").t;
  const picker = vi.fn(async () => "F:/models"), open = vi.fn(async () => true), scans = vi.fn(async () => null);
  const render = () => { root.innerHTML = renderModelLibraries(settings, "", t, value => value); };
  const mount = () => mountSettingsPageController({
    context: { root, t, hostCapabilities: { pickDirectory: picker, openDirectory: open }, requestRender: vi.fn() },
    formSettings: () => ({ ...settings, ...modelLibrariesFromForm(settings) }),
    getEnvironmentScan: () => null, setSettingsDraft: next => { if (next) settings = next as typeof settings; },
    syncSettingsDirtyUi: vi.fn(), runEnvironmentScan: scans
  } as unknown as SettingsPageControllerOptions);
  render(); let cleanup = mount();
  expect(root.querySelector("p")).toBeNull();
  expect(root.querySelector("select")).toBeNull();
  expect(root.querySelector("[data-model-library-up], [data-model-library-down]")).toBeNull();
  expect(root.querySelector<HTMLButtonElement>('[data-model-library-remove="0"]')!.disabled).toBe(true);
  for (const button of root.querySelectorAll("button")) expect(button.title).toBeTruthy();
  expect(root.querySelector("[data-model-library-add]")?.textContent?.trim()).toBe("");
  root.querySelector<HTMLButtonElement>("[data-model-library-add]")!.click();
  expect(settings.modelDirectories).toEqual(["D:/models", "E:/models", ""]);
  expect(picker).not.toHaveBeenCalled(); expect(scans).not.toHaveBeenCalled();
  cleanup(); render(); cleanup = mount();
  expect(root.querySelector<HTMLInputElement>('[data-model-library-index="2"] input')?.getAttribute("aria-invalid")).toBe("true");
  root.querySelector<HTMLButtonElement>('[data-model-library-pick="2"]')!.click();
  await vi.waitFor(() => expect(settings.modelDirectories[2]).toBe("F:/models"));
  cleanup(); render(); cleanup = mount();
  expect(root.querySelector('[draggable="true"]')).toBeNull();
  expect([...root.querySelectorAll(".model-badge")].map(element => element.textContent)).toEqual(["默认", "模型库 1", "模型库 2"]);
  root.querySelector('[data-model-library-drag="2"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  cleanup(); render(); cleanup = mount();
  root.querySelector('[data-model-library-drag="1"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  expect(settings.modelDirectories).toEqual(["F:/models", "D:/models", "E:/models"]);
  cleanup(); render(); cleanup = mount();
  root.querySelector<HTMLButtonElement>('[data-model-library-remove="0"]')!.click();
  expect(settings.modelDirectories).toHaveLength(3);
  root.querySelector<HTMLButtonElement>('[data-model-library-remove="1"]')!.click();
  expect(settings.modelDirectories).toEqual(["F:/models", "E:/models"]);
  expect(scans).toHaveBeenCalledTimes(4); expect(open).not.toHaveBeenCalled(); cleanup();
});
it("always renders one default row even before automatic directory discovery", () => {
  const base = createDefaultSettings();
  document.body.innerHTML = renderModelLibraries(base, "", createTranslator("zh-CN").t, value => value);
  expect(document.querySelectorAll('[data-model-library-index]')).toHaveLength(1);
  expect(document.querySelector('[data-model-library-default]')).not.toBeNull();
  expect(document.querySelector<HTMLButtonElement>('[data-model-library-remove]')?.disabled).toBe(true);
  expect(modelLibrariesFromForm(base)?.modelDirectories).toBeUndefined();
});
it("opens the actual selected file in the second library instead of reconstructing from the first", async () => {
  const component = { found: true, matches: ["vae/example.safetensors"], locations: ["E:/models/vae/example.safetensors"] } as ModelComponentStatus;
  const located = modelComponentWithLocations(component, { modelDirectory: "D:/models", promptModelDirectory: "", comfyRoot: "" });
  const host = { showItemInFolder: vi.fn(async () => true), openDirectory: vi.fn(async () => true) };
  expect(await openModelComponentLocation(host, located, "D:/models/vae")).toBe(true);
  expect(host.showItemInFolder).toHaveBeenCalledWith("E:/models/vae/example.safetensors");
  expect(host.openDirectory).not.toHaveBeenCalled();
});
it("shows actionable unavailable-library state and keeps automatic legacy settings implicit", async () => {
  await loadUiLocale("en-US");
  const base = createDefaultSettings();
  document.body.innerHTML = renderModelLibraries(base, "D:/Comfy/models", createTranslator("en-US").t, value => value,
    [{ directory: "D:/Comfy/models", available: false, truncated: false }]);
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Directory unavailable");
  expect(modelLibrariesFromForm(base)?.modelDirectory).toBe("");
  expect(modelLibrariesFromForm(base)?.modelDirectories).toBeUndefined();
});
