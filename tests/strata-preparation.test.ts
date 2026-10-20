import path from "node:path";
import { STRATA_SOURCE_FILES, STRATA_ENGINE_FILES, STRATA_VERSION } from "../src/core/catalog/dependencies/strata";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { normalizeStrataSettings, strataModelRoot, strataProfileModelRoot, strataPreparationMatchesSettings, strataPreparationProfiles, validStrataPort } from "../src/core/strata-preparation";
import { STRATA_Q4_MODEL_ID, STRATA_Q4_MODEL } from "../src/core/catalog/models/strata";
import { scanStrataPreparation } from "../electron/services/strata-preparation";
import { evaluateModelProfiles } from "../electron/services/environment";
import { renderStrataPreparationPanel } from "../src/renderer/pages/settings/strata-preparation";
import { renderSettingsInstallGuideDialog } from "../src/renderer/pages/settings/fragments";
import { settingsText } from "../src/renderer/pages/settings/copy";
import { STRATA_MODEL_REVISION } from "../src/core/catalog/dependencies/strata";

describe("Strata file preparation", () => {
  it("requires all four pinned Q4 shards and reuses shared accessories without recursive scans", async () => {
    const settings = { ...createDefaultSettings(), modelDirectory: path.resolve("q4-shared-models") };
    const base = strataModelRoot(settings), q4Root = strataProfileModelRoot(base, STRATA_Q4_MODEL_ID);
    expect(q4Root).toBe(path.join(settings.modelDirectory, "LLM", "Qwen3.8-Flash-Next-GGUF"));
    const q4 = strataPreparationProfiles().find(profile => profile.id === STRATA_Q4_MODEL_ID)!;
    const files = new Map(q4.components.map((component, index) => [path.join(index < 4 ? q4Root : base, component.expected), component.installGuide.bytes!]));
    const inspect = vi.fn(async (filename: string) => files.has(filename) ? { header: "GGUF", size: files.get(filename)! } : null);
    const scan = await scanStrataPreparation(settings, inspect);
    expect(scan.profiles.find(profile => profile.id === STRATA_Q4_MODEL_ID)).toMatchObject({ available: true, runtimeVerified: false });
    const standalone = await scanStrataPreparation({ ...settings, modelDirectory: "", strataModelDirectory: q4Root }, inspect);
    expect(standalone.profiles.find(profile => profile.id === STRATA_Q4_MODEL_ID)?.available).toBe(true);
    expect(q4.components.slice(0, 4).reduce((sum, component) => sum + component.installGuide.bytes!, 0)).toBe(111334654784);
    expect(q4.components.slice(0, 4).every(component => component.installGuide.revision === STRATA_Q4_MODEL.revision)).toBe(true);
    files.delete(path.join(q4Root, q4.components[3].expected));
    expect((await scanStrataPreparation(settings, inspect)).profiles.find(profile => profile.id === STRATA_Q4_MODEL_ID)?.available).toBe(false);
    expect(inspect.mock.calls.every(([filename]) => !filename.includes("strata-agent"))).toBe(true);
  });
  it("uses the node version row, keeps actual/recommended/latest separate and updates an older install", () => {
    const settings = createDefaultSettings();
    const status = { configuredInstallDirectory: "", configuredModelDirectory: "", configuredComfyInstallDirectory: "",
      installDirectory: "managed-old", modelDirectory: "models", files: [], sourcePresent: true, enginePresent: true,
      managedInstalled: true, managedUninstallable: true, installedVersion: "0.1.41", latestVersion: "0.1.45", scannedAt: "fixture" };
    const markup = renderStrataPreparationPanel(settings, status, value => value);
    expect(markup).toContain('class="node-version-line"');
    expect(markup).toContain('本机</span><strong class="node-version-value">v0.1.41');
    expect(markup).toContain(`推荐</span><strong class="node-version-value">v${STRATA_VERSION}`);
    expect(markup).toContain('最新</span><strong class="node-version-value">v0.1.45');
    expect(markup).toContain('id="install-strata" aria-busy="false" >更新</button>');
    expect(markup).not.toContain('class="model-badge"');
    const offline = renderStrataPreparationPanel(settings, { ...status, latestVersion: "" }, value => value);
    expect(offline).toContain('最新</span><strong class="node-version-value">');
    expect(offline).not.toContain('最新</span><strong class="node-version-value">v');
  });
  it("keeps missing MTP optional, shares one pinned manual download across quants and gives its model folder", async () => {
    const settings = { ...createDefaultSettings(), modelDirectory: path.resolve("shared-models") };
    const profiles = strataPreparationProfiles();
    const base = new Map(profiles.flatMap((profile) => profile.components.filter((component) => !component.optional)
      .map((component) => [path.join(strataModelRoot(settings), component.expected), component.installGuide.bytes!] as const)));
    const scan = await scanStrataPreparation(settings, async (filename) => base.has(filename) ? { size: base.get(filename)!, header: "GGUF" } : null);
    expect(scan.profiles.every((profile) => profile.available && profile.components.filter(component => component.optional).every(component => !component.found))).toBe(true);
    const guide = scan.profiles[0].components[3].installGuide;
    expect(guide).toEqual(scan.profiles[1].components[3].installGuide);
    expect(guide).toMatchObject({ bytes: 889017216, targetSubdirectory: "mtp", recommendedFilename: "mtp-q2_0.gguf" });
    expect(guide.downloadUrl).toContain("/eec4e10a2c29b440a2ae85591fa11569ce752963/mtp-q2_0.gguf");
    expect(guide.downloadUrl).not.toContain("/strata/mtp-q2_0.gguf");
    expect(settingsText("zh-CN", "model.component.optional")).not.toContain("Lightning");
  });
  it("shares the ComfyUI model root without letting a legacy Strata setting override it", () => {
    const settings = { strataModelDirectory: "D:\\existing", modelDirectory: "D:\\ComfyUI\\models\\" };
    expect(strataModelRoot(settings)).toBe("D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF");
    expect(strataModelRoot(settings, "E:\\selected-models")).toBe("E:\\selected-models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF");
    expect(strataModelRoot({ ...settings, modelDirectory: "" })).toBe("D:\\existing");
    expect(strataModelRoot({ strataModelDirectory: "", modelDirectory: "/fixture/models/" })).toBe("/fixture/models/LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF");
  });
  it("checks software but does not guess a model root without configured or discovered paths", async () => {
    const inspect = vi.fn(async () => null);
    const settings = { ...createDefaultSettings(), strataInstallDirectory: path.resolve("fixture-uninstalled-strata") };
    const scan = await scanStrataPreparation(settings, inspect);
    expect(inspect).toHaveBeenCalledTimes(STRATA_SOURCE_FILES.length + STRATA_ENGINE_FILES.length);
    expect(scan.status.installDirectory).toContain("strata");
    expect(scan.status.modelDirectory).toBe("");
    expect(strataPreparationMatchesSettings(settings, scan.status)).toBe(true);
    expect(strataPreparationMatchesSettings({ ...createDefaultSettings(), strataInstallDirectory: "D:\\different" }, scan.status)).toBe(false);
    expect(scan.status).toMatchObject({ sourcePresent: false, enginePresent: false });
    expect(scan.profiles.every((profile) => !profile.available && profile.integrated)).toBe(true);
  });

  it.each([false, true])("recognizes automatic or legacy downloads independently of ComfyUI without claiming inference (legacy=%s)", async (legacy) => {
    const settings = { ...createDefaultSettings(), modelDirectory: legacy ? "" : path.resolve("fixture-comfy-models"), strataInstallDirectory: path.resolve("fixture-strata"), strataModelDirectory: legacy ? path.resolve("fixture-models") : "" };
    const modelRoot = strataModelRoot(settings);
    const assets = new Map(strataPreparationProfiles().flatMap((profile) => profile.components.map((component) => [path.join(modelRoot, component.expected), component.installGuide.bytes!] as const)));
    const inspect = vi.fn(async (filename: string) => ({ size: assets.get(filename) ?? 10, header: "GGUF" }));
    const scan = await scanStrataPreparation(settings, inspect);
    expect(scan.status).toMatchObject({ sourcePresent: true, enginePresent: true });
    expect(scan.profiles.every((profile) => profile.available && profile.integrated && !profile.runtimeReady && !profile.runtimeVerified)).toBe(true);
    expect(new Set(inspect.mock.calls.map(([filename]) => filename)).size).toBe(inspect.mock.calls.length); // Shared paths are never inspected twice.
    expect(scan.profiles[0].components[0].matches[0]).toContain(modelRoot);
  });

  it("uses the selected ComfyUI's discovered models rather than its Strata install or legacy download root", async () => {
    const settings = { ...createDefaultSettings(), comfyInstallDirectory: path.resolve("selected-comfy"), strataInstallDirectory: path.resolve("separate-strata"), strataModelDirectory: path.resolve("legacy-downloads") };
    const inspect = vi.fn(async () => null);
    const modelDirectory = path.resolve("selected-comfy", "models");
    const scan = await scanStrataPreparation(settings, inspect, modelDirectory);
    expect(scan.status.modelDirectory).toBe(path.join(modelDirectory, "LLM", "Qwen3.8-Flash-Next-GSQ-RCO-GGUF"));
    expect(inspect.mock.calls.flat().some((filename) => filename.includes("legacy-downloads"))).toBe(false);
    expect(strataPreparationMatchesSettings(settings, scan.status)).toBe(true);
    expect(strataPreparationMatchesSettings({ ...settings, modelDirectory: path.resolve("new-models") }, scan.status)).toBe(false);
    expect(strataPreparationMatchesSettings({ ...settings, comfyInstallDirectory: path.resolve("another-comfy") }, scan.status)).toBe(false);
    expect(inspect).toHaveBeenCalledTimes(STRATA_SOURCE_FILES.length + STRATA_ENGINE_FILES.length + 26); // Bounded IQ and Q4 family paths, never recursion.
  });

  it.each(["old-only", "both", "invalid-new"])("reads old shared files in place but keeps the download root model-named (%s)", async (layout) => {
    const settings = { ...createDefaultSettings(), modelDirectory: path.resolve("shared-models"), strataModelDirectory: path.resolve("unselected-legacy-root") };
    const canonical = strataModelRoot(settings), legacy = path.join(settings.modelDirectory, "LLM", "strata");
    const assets = new Map(strataPreparationProfiles().flatMap((profile) => profile.components.map((component) => [component.expected, component.installGuide.bytes!] as const)));
    const inspect = vi.fn(async (filename: string) => {
      for (const [relative, bytes] of assets) {
        if (filename === path.join(legacy, relative)) return { size: bytes, header: "GGUF" };
        if (filename === path.join(canonical, relative) && layout !== "old-only") return { size: layout === "both" ? bytes : 12, header: "GGUF" };
      }
      return null;
    });
    const scan = await scanStrataPreparation(settings, inspect);
    expect(scan.status.modelDirectory).toBe(canonical);
    expect(scan.profiles.every((profile) => profile.available && !profile.runtimeReady)).toBe(true);
    const expectedRoot = layout === "both" ? canonical : legacy;
    for (const component of scan.profiles.flatMap((profile) => profile.components)) {
      expect(component.matches).toEqual([path.join(expectedRoot, component.expected)]);
    }
    expect(inspect.mock.calls.filter(([filename]) => filename === path.join(expectedRoot, "mmproj-Qwen3.8-Flash-Next-BF16.gguf"))).toHaveLength(1);
    expect(inspect.mock.calls.some(([filename]) => filename.includes("unselected-legacy-root"))).toBe(false);
  });

  it("does not reuse old files from another shared model root", async () => {
    const settings = { ...createDefaultSettings(), modelDirectory: path.resolve("old-shared") };
    const oldRoot = path.join(settings.modelDirectory, "LLM", "strata");
    const assets = new Map(strataPreparationProfiles().flatMap((profile) => profile.components.map((component) => [path.join(oldRoot, component.expected), component.installGuide.bytes!] as const)));
    const inspect = vi.fn(async (filename: string) => assets.has(filename) ? { size: assets.get(filename)!, header: "GGUF" } : null);
    const scan = await scanStrataPreparation(settings, inspect, path.resolve("selected-new-shared"));
    expect(scan.profiles.every((profile) => !profile.available)).toBe(true);
    expect(inspect.mock.calls.some(([filename]) => filename.startsWith(oldRoot))).toBe(false);
  });

  it.each([{ size: 12, header: "GGUF" }, { size: 47039860096, header: "<htm" }])("rejects truncated or HTML downloads: %j", async (evidence) => {
    const settings = { ...createDefaultSettings(), strataModelDirectory: path.resolve("fixture-models") };
    const scan = await scanStrataPreparation(settings, async () => evidence);
    expect(scan.profiles[0].available).toBe(false);
    expect(scan.profiles[0].components[0].found).toBe(false);
  });

  it("does not treat shared Strata files as a ComfyUI-executed profile", () => {
    const profiles = evaluateModelProfiles(strataPreparationProfiles().flatMap((profile) => profile.components.map((component) => component.expected)));
    expect(profiles.some((profile) => profile.managedBy === "strata")).toBe(false);
  });

  it("pins each model download, preserves original filenames and shares the projector", () => {
    const profiles = strataPreparationProfiles();
    for (const component of profiles.flatMap((profile) => profile.components)) {
      expect(component.installGuide.downloadUrl).toContain(`/resolve/${component.installGuide.revision}/`);
      expect(component.installGuide.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(component.installGuide.bytes).toBeGreaterThan(0);
    }
    expect(profiles[0].components[2].installGuide).toEqual(profiles[1].components[2].installGuide);
    expect(profiles[0].components[0].expected).toMatch(/^IQ3_XXS\//);
  });

  it("normalizes old settings without choosing an active prompt model and forbids 8080", () => {
    expect(normalizeStrataSettings({} as ReturnType<typeof createDefaultSettings>)).toEqual({ strataInstallDirectory: "", strataModelDirectory: "", strataPort: 43127, strataUncensored: false, strataUncensoredMode: "off", strataReasoningEffort: "medium" });
    for (const port of [8080, 80, 65536, 43127.5, NaN, "43127"]) expect(validStrataPort(port)).toBe(false);
    expect(validStrataPort(43127)).toBe(true);
    expect(createDefaultSettings().promptModelId).not.toContain("strata");
  });

  it("shows the shared model-named subdirectory and keeps an unknown target disabled", () => {
    const component = strataPreparationProfiles()[0].components[0];
    const options = { icon: () => "", escapeHtml: (value: string) => value, t: (key: string) => key, locale: "zh-CN" as const };
    const render = (targetRoot: string) => renderSettingsInstallGuideDialog({ selectedInstallGuide: { profileName: "Strata", component, targetRoot }, configuredModelDirectory: "ComfyUI\\models" }, options);
    expect(render("D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF")).toContain("D:\\ComfyUI\\models\\LLM\\Qwen3.8-Flash-Next-GSQ-RCO-GGUF\\IQ3_XXS");
    expect(render("")).toContain('data-install-directory="" disabled');
    expect(render("")).toContain("模型路径暂不可用");
  });

  it("localizes preparation copy and hides stale runtime evidence after changing the path", () => {
    expect(settingsText("en-US", "strata.note")).not.toMatch(/[一-龥]/u);
    expect(settingsText("zh-TW", "strata.note")).toContain("一鍵安裝");
    const settings = createDefaultSettings();
    const markup = renderStrataPreparationPanel(settings, { installDirectory: "old", modelDirectory: "old", files: [{ relativePath: "setup.py", present: true }], sourcePresent: true, enginePresent: true, scannedAt: "old" }, (value) => value);
    expect(markup).toContain('id="install-strata"');
    expect(markup).toContain("高级设置与安装详情");
    expect(markup).not.toContain("SHA-256: <code>");
    expect(markup).not.toContain("下载源码 ZIP");
    expect(markup).toContain('value="43127"');
    expect(markup).not.toContain('data-install-node="strata"');
    expect(markup).not.toContain("<code>old</code>");
  });

  it.each(["zh-CN", "en-US", "zh-TW"] as const)("describes the model rather than installation instructions (%s)", (locale) => {
    for (const profile of strataPreparationProfiles(locale)) {
      expect(profile.description).toContain("512");
      expect(profile.description).toContain(profile.id.endsWith("ud-q4_k_xl") ? "Unsloth" : "GSQ-RCO");
      expect(profile.description).toContain("QSA");
      expect(profile.description).not.toMatch(/任选|擇一|不必|不要|仅核对|扫描|掃描|Choose|scan|not integrated/);
    }
  });
});
