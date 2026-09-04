import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { EnvironmentScanResult, ModelScanProfile } from "../src/types";
import {
  renderSettingsPage,
  type SettingsPageOptions,
  type SettingsPageViewModel
} from "../src/renderer/pages/settings/page";

const state = createDefaultState();
const translate: SettingsPageOptions["t"] = (key) => key;
const renderOptions = {
  t: translate,
  defaultH3PromptPresets: {},
  h3AutoPromptSeeds: [],
  defaultImagePromptPresets: {},
  h3PromptPresetDescriptions: {},
  imagePromptPresetLabels: {},
  imagePromptPresetDescriptions: {},
  icon: (name: string, className = "") => `<i data-lucide="${name}" class="ui-icon ${className}"></i>`,
  escapeHtml: (value: string) => value,
  formatBytes: () => "0 B",
  formatScanTime: () => "time",
  orderVideoProfiles: (profiles: ModelScanProfile[]) => profiles,
  getImageQualityProfiles: () => [],
  isGemmaPromptModel: () => false,
  isComfyMultimodalPromptModel: () => false,
  isQwenVlPeftPromptModel: () => false,
  videoLoraInfoButton: () => "",
  isImageModelSelectable: () => true,
  imageWorkflowStatus: () => "",
  h3PromptPresetOptions: () => "",
  renderAppLogTerminal: () => ""
} as unknown as SettingsPageOptions;

function viewModel(overrides: Partial<SettingsPageViewModel> = {}): SettingsPageViewModel {
  return {
    settings: state.settings,
    settingsDirty: false,
    settingsSaving: false,
    environmentScan: null,
    comfyConnected: false,
    environmentScanning: false,
    environmentScanError: "",
    settingsTab: "comfyui",
    settingsH3PromptPreset: "official-storyboard",
    settingsImagePromptPreset: "faithful",
    promptStatus: { ready: false, detail: "" },
    promptRuntimeLoaded: false,
    promptRuntimeBusy: false,
    promptRuntimeControlIconName: "play",
    promptRuntimeControlTitle: "Prompt runtime",
    queueRunning: false,
    hasRunningQueueTask: false,
    serviceStarting: null,
    serviceRestarting: null,
    serviceForceStopping: false,
    serviceBusy: false,
    serviceStatusMessage: "",
    comfyUpdating: false,
    comfyUpdateLog: "",
    environmentRepairing: "",
    environmentRepairLogs: {},
    customNodeInstalling: "",
    customNodeInstallQueue: [],
    customNodeInstallBatch: [],
    customNodeInstallPhase: "idle",
    customNodeLogs: {},
    attentionAccelerationInstalling: false,
    attentionAccelerationLog: "",
    llamaCppPythonInstalling: false,
    llamaCppPythonLog: "",
    selectedInstallGuide: null,
    installGuideModelDirectory: "ComfyUI\\models",
    appLogs: null,
    appLogsLoading: false,
    appLogsError: "",
    ...overrides
  };
}

describe("Settings accessibility markup", () => {
  it("exposes a roving tablist and keeps the scan action reachable from the page header", () => {
    const markup = renderSettingsPage(viewModel(), renderOptions);
    const nodesMarkup = renderSettingsPage(viewModel({ settingsTab: "nodes" }), renderOptions);
    const pathsMarkup = renderSettingsPage(viewModel({ settingsTab: "system" }), renderOptions);

    expect(markup).toContain('id="settings-category-tabs"');
    expect(markup).toContain('class="settings-sidebar" role="tablist"');
    expect(markup.match(/role="tab"[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).toContain('id="settings-tab-comfyui"');
    expect(markup.indexOf('id="settings-tab-comfyui"')).toBeLessThan(markup.indexOf('id="settings-tab-nodes"'));
    expect(markup.indexOf('id="settings-tab-nodes"')).toBeLessThan(markup.indexOf('id="settings-tab-system"'));
    expect(markup.indexOf('id="settings-tab-system"')).toBeLessThan(markup.indexOf('id="settings-tab-acceleration"'));
    expect(nodesMarkup).toContain("节点与依赖");
    expect(nodesMarkup).not.toContain('data-settings-h3-native-dependencies');
    expect(nodesMarkup).not.toContain("H3 原生高分辨率环境");
    expect(markup).toContain('aria-controls="settings-panel-comfyui"');
    expect(markup).toContain('id="settings-panel-comfyui" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-labelledby="settings-tab-comfyui"');
    expect(markup.match(/id="scan-environment"/g)).toHaveLength(1);
    expect(markup.indexOf('id="scan-environment"')).toBeLessThan(markup.indexOf('id="settings-environment-section"'));
    expect(markup).toContain('class="button-row settings-heading-actions is-clean"');
    expect(markup).toContain('class="settings-tool-actions"');
    expect(markup).toContain('class="settings-commit-actions"');
    expect(markup.indexOf('class="settings-commit-actions"')).toBeLessThan(markup.indexOf('id="scan-environment"'));
    expect(markup).not.toContain('>settings.saved</span>');
    expect(markup).toContain('id="connection-result" class="connection-result muted" role="status" aria-live="polite"');
    expect(markup).toContain('id="force-stop-comfy"');
    expect(markup).toContain('class="secondary destructive button-with-icon" id="force-stop-comfy"');
    expect(pathsMarkup).toContain('id="settings-panel-system" class="settings-content" role="tabpanel"');
    expect(pathsMarkup).toContain('id="ui-locale" aria-label="settings.locale.title"');
    expect(pathsMarkup).toContain('id="queue-isolation-mode"');
    expect(pathsMarkup).toContain('<option value="lora" selected>');
  });

  it("keeps the ComfyUI environment page concise while preserving environment evidence", () => {
    const desktopDirectory = "C:\\ComfyUI Desktop";
    const environmentScan = {
      scannedAt: "2026-08-27T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      comfyRoot: "C:\\ComfyUI",
      comfyUrl: "http://127.0.0.1:8188",
      comfyInstallDirectory: desktopDirectory,
      comfySourceDirectory: "C:\\ComfyUI\\core",
      comfyInstallType: "desktop",
      comfyInstallations: [{
        type: "desktop",
        directory: desktopDirectory,
        sourceDirectory: "C:\\ComfyUI\\core",
        executable: `${desktopDirectory}\\ComfyUI.exe`,
        desktopVersion: "1.0.39",
        version: "0.33.0",
        revision: "e0fd752e",
        selected: true
      }, {
        type: "manual",
        directory: "C:\\ComfyUI Legacy",
        sourceDirectory: "C:\\ComfyUI Legacy",
        executable: "",
        desktopVersion: "",
        version: "0.32.0",
        revision: "legacy-revision",
        selected: false
      }],
      pythonRuntimes: [],
      gpus: [],
      modelDirectory: "",
      outputDirectory: "",
      attentionAcceleration: {
        torchVersion: "2.10.0+cu130",
        cudaVersion: "13.0"
      },
      items: [],
      modelProfiles: [],
      customNodes: [],
      issues: []
    } as unknown as EnvironmentScanResult;
    const markup = renderSettingsPage(viewModel({
      settingsTab: "comfyui",
      settings: { ...state.settings, comfyInstallDirectory: desktopDirectory },
      environmentScan
    }), renderOptions);

    expect(markup).not.toContain('id="ui-locale"');
    expect(markup).not.toContain("settings.system.gpuDetectionDescription");
    expect(markup).toContain("PyTorch 2.10.0+cu130");
    expect(markup).toContain("CUDA 13.0");
    expect(markup).toContain('class="muted comfy-installation-runtime" title="settings.system.revision · PyTorch 2.10.0+cu130 · CUDA 13.0"');
    expect(markup).toContain('<span class="model-badge">settings.system.installationCount</span>');
    expect(markup).not.toContain('<span class="model-availability warning">settings.system.installationCount</span>');
    expect(markup).toContain('id="use-scanned-comfy"');
    expect(markup).not.toContain('class="detected-path"');

    const pathsMarkup = renderSettingsPage(viewModel({ settingsTab: "system", environmentScan }), renderOptions);
    expect(pathsMarkup).toContain('id="ui-locale" aria-label="settings.locale.title"');
    expect(pathsMarkup).not.toContain("settings.locale.label");
    expect(pathsMarkup).not.toContain("settings.locale.pending");
    expect(pathsMarkup).toContain("settings.system.queueIsolationDescription");
    expect(pathsMarkup).not.toContain('id="settings-environment-section"');
  });

  it("keeps the manual scan action available on non-system Settings tabs", () => {
    const markup = renderSettingsPage(viewModel({ settingsTab: "lora" }), renderOptions);

    expect(markup).toContain('id="settings-panel-lora" class="settings-content" role="tabpanel"');
    expect(markup).toContain('id="scan-environment"');
    expect(markup).not.toContain('id="settings-environment-section"');
  });

  it("keeps the Python binding on ComfyUI environment while Attention remains in acceleration", () => {
    const comfyMarkup = renderSettingsPage(viewModel({ settingsTab: "comfyui" }), renderOptions);
    const accelerationMarkup = renderSettingsPage(viewModel({ settingsTab: "acceleration" }), renderOptions);

    expect(comfyMarkup).toContain('id="comfy-python-path"');
    expect(comfyMarkup).toContain('id="comfy-python-candidate"');
    expect(comfyMarkup).not.toContain('id="h3-attention-mode"');
    expect(accelerationMarkup).toContain('id="h3-attention-mode"');
    expect(accelerationMarkup).not.toContain('id="comfy-python-path"');
    expect(accelerationMarkup).not.toContain('id="comfy-python-candidate"');
    expect(accelerationMarkup).toContain("H3 加速策略");
    expect(accelerationMarkup).not.toContain("临时入口");
    expect(accelerationMarkup).toContain('title="使用 CUDA FP16 SageAttention 内核；环境匹配时通常速度最快，但需要精确匹配的 CUDA、PyTorch 与 wheel。"');
    expect(accelerationMarkup).toContain('title="使用 Triton FP16 SageAttention 内核；相比 CUDA FP16 更适合作为稳定回退，仍需要 SageAttention 与 Triton 环境。"');
    expect(accelerationMarkup).toContain('title="使用 PyTorch 原生 Attention；不依赖 SageAttention 或 Triton，兼容性最高，但通常速度较慢。"');
  });

  it("removes model-page scan summaries and keeps image/upscale controls in their intended places", () => {
    const videoMarkup = renderSettingsPage(viewModel({ settingsTab: "video" }), renderOptions);
    const imageMarkup = renderSettingsPage(viewModel({ settingsTab: "image" }), renderOptions);
    const promptMarkup = renderSettingsPage(viewModel({ settingsTab: "prompt" }), renderOptions);
    const upscaleMarkup = renderSettingsPage(viewModel({ settingsTab: "upscale" }), renderOptions);
    const nodesMarkup = renderSettingsPage(viewModel({ settingsTab: "nodes" }), renderOptions);

    expect(videoMarkup).not.toContain("video.summary");
    expect(videoMarkup).not.toContain("video.waitingScan");
    expect(imageMarkup).not.toContain('id="image-output-count"');
    expect(imageMarkup).not.toContain('id="image-output-count-number"');
    expect(promptMarkup).not.toContain("prompt.summary");
    expect(promptMarkup).not.toContain("prompt.waitingScan");
    expect(promptMarkup).not.toContain("install-llama-cpp-python");
    expect(promptMarkup).not.toContain("prompt.note");
    expect(upscaleMarkup).not.toContain("upscale.summary");
    expect(upscaleMarkup).not.toContain("upscale.waitingScan");
    expect(upscaleMarkup).not.toContain('id="seedvr2-model"');
    expect(upscaleMarkup).not.toContain('id="realesrgan-model"');
    expect(upscaleMarkup).toContain('id="default-upscale-model"');
    expect(upscaleMarkup.indexOf('id="default-upscale-model"')).toBeGreaterThan(upscaleMarkup.indexOf('id="settings-panel-upscale"'));
    expect(nodesMarkup).toContain("llama-cpp-python");
    expect(nodesMarkup).toContain('id="install-llama-cpp-python"');
    expect(nodesMarkup).not.toContain("nodes.h3Title");
    expect(nodesMarkup).not.toContain("nodes.qwenTitle");
    expect(nodesMarkup).not.toContain('id="repair-h3-core"');
    expect(nodesMarkup).not.toContain("data-install-workflow");
    expect(nodesMarkup).not.toContain("nodes.placeholderTitle");
    expect(nodesMarkup).not.toContain("{{PROMPT}}");
    expect(nodesMarkup).not.toContain('data-uninstall-llama-cpp-python');
  });

  it("puts the installed llama-cpp-python actions on the Nodes & dependencies card", () => {
    const environmentScan = {
      scannedAt: "2026-08-27T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      comfyRoot: "C:\\ComfyUI",
      llamaCppPython: {
        packageName: "llama-cpp-python",
        pythonPath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
        pythonVersion: "3.12.11",
        packageVersion: "0.3.46+cu128",
        torchVersion: "2.8.0+cu129",
        cudaVersion: "12.9",
        installed: true,
        importable: true,
        gpuOffload: true,
        ready: true,
        detail: "CUDA 后端已就绪",
        error: ""
      },
      items: [],
      modelProfiles: [],
      customNodes: [],
      issues: []
    } as unknown as EnvironmentScanResult;
    const markup = renderSettingsPage(viewModel({
      settingsTab: "nodes",
      environmentScan,
      llamaCppPythonLog: "安装日志"
    }), renderOptions);

    expect(markup).toContain("llama-cpp-python");
    expect(markup).toContain('id="install-llama-cpp-python"');
    expect(markup).toContain("重新安装");
    expect(markup).toContain("data-uninstall-llama-cpp-python");
    expect(markup).toContain('data-dependency-install-log="python-runtime:llama-cpp-python"');
    expect(markup).toContain("目标环境：");
  });

  it("exposes descriptions for no-prompt drafting directions", () => {
    const instruction = "Animate a grounded interaction with the visible subject.";
    const description = "利用画面中已经出现且可操作的物体设计自然动作，例如打开、旋转、触碰、拿起或展开；不要凭空添加物体。";
    const markup = renderSettingsPage(viewModel({
      settingsTab: "prompt",
      settings: {
        ...state.settings,
        h3AutoPromptSeedId: "visible-affordance",
        h3AutoPromptSeedInstructions: {
          ...state.settings.h3AutoPromptSeedInstructions,
          "visible-affordance": instruction
        }
      }
    }), {
      ...renderOptions,
      h3AutoPromptSeeds: [{
        id: "visible-affordance",
        label: "Visible affordance",
        tags: ["object"],
        instruction
      }]
    });

    expect(markup).toContain('id="h3-auto-prompt-seed-setting"');
    expect(markup).toContain(`data-description="${description}"`);
    expect(markup).toContain(`title="${description}"`);
    expect(markup).toContain('class="field-info"');
    expect(markup).toContain(instruction);
  });

  it("marks the local save state without changing the save selector", () => {
    const markup = renderSettingsPage(viewModel({ settingsDirty: true, settingsSaving: true }), renderOptions);

    expect(markup).toContain('class="button-row settings-heading-actions is-dirty"');
    expect(markup).toContain('class="save-state dirty" role="status" aria-live="polite" aria-atomic="true">settings.saving</span>');
    expect(markup).toContain('id="save-settings" aria-busy="true"');
    expect(markup).toContain('id="settings-panel-comfyui" class="settings-content" role="tabpanel"');
    expect(markup).toContain('aria-busy="true"');
  });

  it("keeps an icon attached to the yellow service restart status", () => {
    const environmentScan = {
      scannedAt: "2026-08-23T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      customNodes: [],
      issues: []
    } as unknown as EnvironmentScanResult;
    const markup = renderSettingsPage(viewModel({
      environmentScan,
      serviceRestarting: "comfy",
      serviceStatusMessage: "正在重启并复检…"
    }), renderOptions);

    expect(markup).toContain('class="service-status working" role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain('<span class="service-status-icon" aria-hidden="true"><i data-lucide="refresh-cw" class="ui-icon status-icon"></i></span><span class="service-status-copy">正在重启并复检…</span>');
  });

  it("keeps the primary save action after the discard action in the commit group", () => {
    const markup = renderSettingsPage(viewModel({ settingsDirty: true }), renderOptions);

    const commitStart = markup.indexOf('class="settings-commit-actions"');
    const discardIndex = markup.indexOf('id="discard-settings"');
    const saveIndex = markup.indexOf('id="save-settings"');

    expect(commitStart).toBeGreaterThan(-1);
    expect(commitStart).toBeLessThan(discardIndex);
    expect(discardIndex).toBeLessThan(saveIndex);
  });

  it("keeps H3 upgrade feedback mounted and marks acceleration repairs in the sidebar", () => {
    const environmentScan = {
      comfyInstallType: "desktop",
      attentionAcceleration: {
        ready: false,
        supported: true
      },
      pythonRuntimes: []
    } as unknown as EnvironmentScanResult;
    const idleMarkup = renderSettingsPage(viewModel({ settingsTab: "nodes" }), renderOptions);
    const accelerationMarkup = renderSettingsPage(viewModel({ settingsTab: "acceleration" }), renderOptions);
    const installingMarkup = renderSettingsPage(viewModel({
      settingsTab: "nodes",
      environmentScan,
      attentionAccelerationInstalling: true,
      attentionAccelerationLog: "正在升级 PyTorch"
    }), renderOptions);

    expect(idleMarkup).toContain('id="attention-install-log-details"  hidden');
    expect(idleMarkup).toContain('id="attention-install-log"></pre>');
    expect(installingMarkup).toContain('id="attention-install-progress" aria-live="polite"');
    expect(installingMarkup).toContain('role="progressbar" aria-label="H3 环境升级进度"');
    expect(installingMarkup).toContain('id="attention-install-stage">正在升级 PyTorch</strong>');
    expect(installingMarkup).toContain('id="attention-install-log-details" open');
    expect(installingMarkup).toContain('id="install-attention-acceleration"');
    expect(accelerationMarkup).toContain('id="h3-attention-mode"');
    expect(accelerationMarkup).not.toContain('id="install-attention-acceleration"');
    expect(installingMarkup).toContain('id="settings-tab-acceleration"');
    expect(installingMarkup).toContain('class="settings-tab-label">settings.tab.acceleration<span class="settings-update-dot" role="img" aria-label="待安装/修复" title="待安装/修复"></span>');
    expect(installingMarkup).toContain("检测到 ComfyUI Desktop");
    expect(installingMarkup).toContain("最低支持 PyTorch 2.10/cu130，2.10.0 是稳定回退");
    expect(idleMarkup).not.toContain("检测到 ComfyUI Desktop");
  });

  it("uses one split action for a failed node and keeps uninstall in its menu", () => {
    const environmentScan = {
      scannedAt: "2026-08-26T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [{
        id: "minimax-h3-prompt-writer",
        name: "MiniMax H3 Prompt Writer",
        purpose: "Prompt writer",
        repositoryUrl: "https://example.invalid/prompt-writer.git",
        installed: true,
        loaded: false,
        runtimeVerified: true,
        runtimeRepairable: true,
        loadError: "HTTP 404",
        directory: "C:\\ComfyUI\\custom_nodes\\PromptWriter",
        required: false,
        version: "0.4.1",
        minimumVersion: "0.4.1",
        recommendedVersion: "0.4.1",
        latestVersion: "0.4.1",
        updateAvailable: false
      }]
    } as unknown as EnvironmentScanResult;

    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);

    expect(markup).toContain('data-install-node="minimax-h3-prompt-writer" data-node-operation="repair"');
    expect(markup).toContain('class="node-action-menu"');
    expect(markup).toContain('data-uninstall-node="minimax-h3-prompt-writer"');
    expect(markup).not.toContain('data-rescan-node="minimax-h3-prompt-writer"');
  });

  it("shows DLSS5 runtime failure instead of treating the node source check as readiness", () => {
    const environmentScan = {
      scannedAt: "2026-09-04T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [{
        id: "comfyui-dlss5",
        name: "ComfyUI DLSS5",
        purpose: "DLSS5 super resolution",
        repositoryUrl: "https://example.invalid/dlss5.git",
        installed: true,
        loaded: true,
        runtimeVerified: true,
        loadError: "",
        directory: "C:\\ComfyUI\\custom_nodes\\ComfyUI-DLSS5",
        required: false,
        version: "0.2.2",
        updateAvailable: false
      }],
      dlss5Runtime: {
        state: "invalid",
        srReady: false,
        error: "runtime/config.json 缺失或不是有效 JSON",
        missingFiles: ["config.json"]
      }
    } as unknown as EnvironmentScanResult;

    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);

    expect(markup).toContain("已安装 · DLSS5 runtime 不可用");
    expect(markup).toContain("runtime/config.json 缺失或不是有效 JSON");
    expect(markup).toContain('data-install-node="comfyui-dlss5" data-node-operation="repair"');
    expect(markup).not.toContain("文件与版本检查通过");
  });

  it("renders one install action for an uninstalled H3 Optimizations node", () => {
    const environmentScan = {
      scannedAt: "2026-08-27T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [{
        id: "h3-optimizations",
        name: "H3 Optimizations",
        purpose: "H3 memory optimization",
        repositoryUrl: "https://github.com/Zironic/H3-Optimizations.git",
        installed: false,
        loaded: false,
        runtimeVerified: false,
        loadError: "",
        directory: "",
        required: false,
        version: "",
        minimumVersion: "0.2.16",
        recommendedVersion: "0.2.20",
        latestVersion: "0.2.20",
        updateAvailable: false,
        appInstallable: true,
        bulkInstall: true
      }]
    } as unknown as EnvironmentScanResult;

    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);

    expect(markup.match(/data-install-node="h3-optimizations"/g)).toHaveLength(1);
    expect(markup).toContain('data-install-node="h3-optimizations" data-node-operation="install"');
    expect(markup).toContain("推荐版本：v0.2.20");
    expect(markup).toContain("最新发布：v0.2.20");
    expect(markup).toContain('<span class="button-count">1</span>');
    expect(markup).not.toContain('data-rescan-node="h3-optimizations"');
    expect(markup).not.toContain("data-open-node-source");
  });

  it("renders a user-triggered install action for the learned H3 upscaler", () => {
    const environmentScan = {
      scannedAt: "2026-09-02T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [{
        id: "minimax-h3-learned-upscaler",
        name: "MiniMax H3 Learned Latent Upscaler",
        purpose: "Learned 3D latent upscale",
        repositoryUrl: "https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler",
        installed: false,
        loaded: false,
        runtimeVerified: false,
        loadError: "",
        directory: "",
        required: false,
        version: "",
        updateAvailable: false,
        appInstallable: true,
        bulkInstall: false
      }]
    } as unknown as EnvironmentScanResult;

    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);

    expect(markup).toContain('data-install-node="minimax-h3-learned-upscaler" data-node-operation="install"');
    expect(markup).not.toContain('data-rescan-node="minimax-h3-learned-upscaler"');
    expect(markup).not.toContain("手动安装");
    expect(markup).not.toContain('<span class="button-count">1</span>');
  });

  it("renders MMH3 runtime validation evidence in node settings", () => {
    const environmentScan = {
      scannedAt: "2026-09-03T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [{
        id: "mmh3-ultimate-upscale",
        name: "MMH3 Ultimate Upscale",
        purpose: "H3 tiled 1440p",
        repositoryUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale.git",
        installed: true,
        loaded: true,
        runtimeVerified: true,
        loadError: "",
        directory: "C:\\ComfyUI\\custom_nodes\\Comfyui-MMH3-UltimateUpscale",
        required: false,
        version: "",
        detectedRevision: "d91be5ac41797a3789b4765cdb6eb6d9129a4a4d",
        updateAvailable: false,
        appInstallable: true,
        bulkInstall: false,
        compatibilityEvidence: [{
          verifiedAt: "2026-09-03",
          sourceUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale",
          note: "RTX 4090 2592x1440 completed in 1274.815 seconds.",
          checks: ["static", "object-info", "minimal-run"]
        }]
      }]
    } as unknown as EnvironmentScanResult;

    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);

    expect(markup).toContain("验证依据 · 2026-09-03");
    expect(markup).toContain("1274.815 seconds");
    expect(markup).toContain("检查级别：static · object-info · minimal-run");
  });

  it("orders node and runtime dependency cards by product priority", () => {
    const environmentScan = {
      scannedAt: "2026-08-26T00:00:00.000Z",
      userHome: "C:\\Users\\Test",
      items: [],
      modelProfiles: [],
      issues: [],
      customNodes: [
        {
          id: "inpaint-nodes",
          name: "ComfyUI Inpaint Nodes",
          purpose: "LaMa",
          repositoryUrl: "https://example.invalid/inpaint.git",
          installed: false,
          loaded: false,
          runtimeVerified: false,
          loadError: "",
          directory: "",
          required: false,
          version: "",
          minimumVersion: "",
          recommendedVersion: "",
          latestVersion: "",
          updateAvailable: false
        },
        {
          id: "video-helper-suite",
          name: "VideoHelperSuite",
          purpose: "Video I/O",
          repositoryUrl: "https://example.invalid/video.git",
          installed: false,
          loaded: false,
          runtimeVerified: false,
          loadError: "",
          directory: "",
          required: true,
          version: "",
          minimumVersion: "",
          recommendedVersion: "",
          latestVersion: "",
          updateAvailable: false
        },
        {
          id: "comfyui-gguf",
          name: "ComfyUI-GGUF",
          purpose: "GGUF",
          repositoryUrl: "https://example.invalid/gguf.git",
          installed: false,
          loaded: false,
          runtimeVerified: false,
          loadError: "",
          directory: "",
          required: true,
          version: "",
          minimumVersion: "",
          recommendedVersion: "",
          latestVersion: "",
          updateAvailable: false
        }
      ]
    } as unknown as EnvironmentScanResult;
    const markup = renderSettingsPage(viewModel({ settingsTab: "nodes", environmentScan }), renderOptions);
    const videoIndex = markup.indexOf(">VideoHelperSuite</h3>");
    const ggufIndex = markup.indexOf(">ComfyUI-GGUF</h3>");
    const h3AccelerationIndex = markup.indexOf(">H3 加速运行时</h3>");
    const llamaIndex = markup.indexOf(">llama-cpp-python</strong>");
    const inpaintIndex = markup.indexOf(">ComfyUI Inpaint Nodes</h3>");

    expect(videoIndex).toBeGreaterThan(-1);
    expect(videoIndex).toBeLessThan(ggufIndex);
    expect(ggufIndex).toBeLessThan(llamaIndex);
    expect(ggufIndex).toBeLessThan(h3AccelerationIndex);
    expect(h3AccelerationIndex).toBeLessThan(llamaIndex);
    expect(llamaIndex).toBeLessThan(inpaintIndex);
  });
});
