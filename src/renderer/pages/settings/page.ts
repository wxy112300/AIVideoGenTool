import type {
  AppLogSnapshot,
  EnvironmentScanResult,
  H3PromptPreset,
  ImagePromptPreset,
  LocalServiceKind,
  ModelScanProfile,
  Settings
} from "../../../types";
import type { SettingsTab } from "../../contracts";
import {
  renderSettingsComfyCompatibilityPanel,
  renderSettingsEnvironmentIssuesPanel,
  renderSettingsEnvironmentOverview,
  renderSettingsInstallGuideDialog,
  renderSettingsModelScanCard,
  type SettingsInstallGuideSelection
} from "./fragments";

interface ImageQualityProfileOption {
  id: string;
  label: string;
  steps: number;
}

interface PromptStatusViewModel {
  ready: boolean;
  detail: string;
}

export interface SettingsPageViewModel {
  settings: Settings;
  settingsDirty: boolean;
  environmentScan: EnvironmentScanResult | null;
  environmentScanning: boolean;
  environmentScanError: string;
  settingsTab: SettingsTab;
  settingsH3PromptPreset: H3PromptPreset;
  settingsImagePromptPreset: ImagePromptPreset;
  promptStatus: PromptStatusViewModel;
  promptRuntimeLoaded: boolean;
  promptRuntimeBusy: boolean;
  promptRuntimeControlIconName: string;
  promptRuntimeControlTitle: string;
  queueRunning: boolean;
  hasRunningQueueTask: boolean;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceBusy: boolean;
  serviceStatusMessage: string;
  comfyUpdating: boolean;
  comfyUpdateLog: string;
  environmentRepairing: string;
  environmentRepairLogs: Record<string, string>;
  workflowDependencyInstalling: string;
  workflowDependencyLogs: Record<string, string>;
  customNodeInstalling: string;
  customNodeLogs: Record<string, string>;
  coreDependencyRepairing: boolean;
  attentionAccelerationInstalling: boolean;
  attentionAccelerationLog: string;
  selectedInstallGuide: SettingsInstallGuideSelection | null;
  installGuideModelDirectory: string;
  appLogs: AppLogSnapshot | null;
  appLogsLoading: boolean;
  appLogsError: string;
}

export interface SettingsPageOptions {
  defaultH3PromptPresets: Record<H3PromptPreset, string>;
  defaultImagePromptPresets: Record<ImagePromptPreset, string>;
  h3PromptPresetDescriptions: Record<H3PromptPreset, string>;
  imagePromptPresetLabels: Record<ImagePromptPreset, string>;
  imagePromptPresetDescriptions: Record<ImagePromptPreset, string>;
  icon(name: string, className?: string): string;
  escapeHtml(value: string): string;
  formatBytes(bytes: number): string;
  formatScanTime(scannedAt: string): string;
  orderVideoProfiles(profiles: ModelScanProfile[]): ModelScanProfile[];
  getImageQualityProfiles(modelId: string): ImageQualityProfileOption[];
  isGemmaPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
  isImageWorkflowReady(profile?: ModelScanProfile): boolean;
  isImageModelSelectable(profile?: ModelScanProfile): boolean;
  imageWorkflowStatus(profile?: ModelScanProfile): string;
  h3PromptPresetOptions(selected: H3PromptPreset, includeMultiReference: boolean): string;
  renderAppLogTerminal(text: string): string;
}

export function renderSettingsPage(
  viewModel: SettingsPageViewModel,
  options: SettingsPageOptions
): string {
  const settings = viewModel.settings;
  const environmentScan = viewModel.environmentScan;
  const escape = (value: string | number | null | undefined) => options.escapeHtml(value == null ? "" : String(value));
  const icon = (name: string, className?: string) => options.icon(name, className);
  const sharedFragmentOptions = {
    icon: options.icon,
    escapeHtml: options.escapeHtml
  };
  const environmentOverview = renderSettingsEnvironmentOverview(
    {
      environmentScan,
      environmentScanning: viewModel.environmentScanning,
      environmentScanError: viewModel.environmentScanError,
      serviceStarting: viewModel.serviceStarting,
      serviceRestarting: viewModel.serviceRestarting,
      serviceForceStopping: viewModel.serviceForceStopping,
      serviceStatusMessage: viewModel.serviceStatusMessage
    },
    {
      ...sharedFragmentOptions,
      formatScanTime: options.formatScanTime
    }
  );
  const comfyCompatibilityPanel = renderSettingsComfyCompatibilityPanel(
    {
      environmentScan,
      comfyUpdating: viewModel.comfyUpdating,
      comfyUpdateLog: viewModel.comfyUpdateLog
    },
    sharedFragmentOptions
  );
  const environmentIssuesPanel = renderSettingsEnvironmentIssuesPanel(
    {
      environmentScan,
      environmentRepairing: viewModel.environmentRepairing,
      environmentRepairLogs: viewModel.environmentRepairLogs
    },
    sharedFragmentOptions
  );
  const renderProfileCard = (profile: ModelScanProfile) => renderSettingsModelScanCard(
    profile,
    {
      ...sharedFragmentOptions,
      isGemmaPromptModel: options.isGemmaPromptModel,
      videoLoraInfoButton: options.videoLoraInfoButton,
      isImageWorkflowReady: options.isImageWorkflowReady,
      imageWorkflowStatus: options.imageWorkflowStatus
    }
  );
  const installGuideDialog = renderSettingsInstallGuideDialog(
    {
      selectedInstallGuide: viewModel.selectedInstallGuide,
      configuredModelDirectory: viewModel.installGuideModelDirectory
    },
    sharedFragmentOptions
  );
  const profiles = environmentScan?.modelProfiles ?? [];
  const videoProfiles = options.orderVideoProfiles(
    profiles.filter((profile) => profile.category === "video")
  );
  const loraProfiles = profiles.filter((profile) => profile.category === "lora");
  const imageProfiles = profiles.filter((profile) => profile.category === "image");
  const imageQualityProfiles = options.getImageQualityProfiles(settings.defaultImageModel);
  const promptProfiles = profiles.filter((profile) => profile.category === "prompt");
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const defaultPromptPresets = options.defaultH3PromptPresets;
  const selectedH3PresetText = settings.h3PromptPresets[viewModel.settingsH3PromptPreset] ??
    defaultPromptPresets[viewModel.settingsH3PromptPreset];
  const defaultImagePromptPresets = options.defaultImagePromptPresets;
  const selectedImagePromptPresetText = settings.imagePromptPresets[viewModel.settingsImagePromptPreset] ??
    defaultImagePromptPresets[viewModel.settingsImagePromptPreset];
  const videoAvailable = videoProfiles.filter(
    (profile) => profile.available && profile.integrated
  ).length;
  const loraAvailable = loraProfiles.filter((profile) => profile.available).length;
  const imageComponentsReady = imageProfiles.filter((profile) => profile.available).length;
  const imageWorkflowsReady = imageProfiles.filter((profile) => options.isImageWorkflowReady(profile)).length;
  const upscaleAvailable = upscaleProfiles.filter((profile) => profile.available).length;
  const promptAvailable = promptProfiles.filter((profile) => profile.available).length;
  const gpu = environmentScan?.items.find((item) => item.id === "nvidia");
  const gpuDevices = environmentScan?.gpus ?? [];
  const gpuSummary = gpuDevices.length
    ? gpuDevices.map((device) => `${device.name} · ${options.formatBytes(device.vramTotalBytes)}`).join("；")
    : gpu?.ok
      ? gpu.detail
      : environmentScan
        ? "未检测到 NVIDIA GPU"
        : "等待扫描真实显卡与显存";
  const gpuBadge = gpuDevices.length
    ? gpuDevices.length === 1
      ? `${gpuDevices[0]!.name} · ${options.formatBytes(gpuDevices[0]!.vramTotalBytes)}`
      : `${gpuDevices.length} 张 GPU`
    : "GPU 待检测";
  const reserveVramBytes = Math.max(
    0,
    (Number.isFinite(settings.vramReserveGb)
      ? Math.max(0.5, Math.min(1, settings.vramReserveGb))
      : 1)
  ) * 1024 ** 3;
  const gpuBudgetSummary = gpuDevices.length
    ? gpuDevices.map((device) =>
        `${options.formatBytes(device.vramTotalBytes)} 总显存 - ${options.formatBytes(reserveVramBytes)} 余量 = ${options.formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} 工作预算`
      ).join("；")
    : "扫描完成后将按总显存扣除安全余量计算工作预算";
  const gpuCards = gpuDevices.length
    ? `<div class="gpu-device-list">${gpuDevices.map((device) => `
        <article class="gpu-device-card">
          <span class="runtime-label">GPU ${device.index}</span>
          <strong class="runtime-value">${escape(device.name)}</strong>
          <code class="runtime-detail">${options.formatBytes(device.vramTotalBytes)} 总显存 · ${options.formatBytes(Math.max(0, device.vramTotalBytes - reserveVramBytes))} 工作预算 · 驱动 ${escape(device.driverVersion || "未知")}</code>
        </article>`).join("")}</div>`
    : `<div class="scan-result">${escape(gpuSummary)}</div>`;
  const comfyInstallations = environmentScan?.comfyInstallations ?? [];
  const effectiveComfyInstallDirectory =
    environmentScan?.comfyInstallDirectory || settings.comfyInstallDirectory;
  const selectedComfyInstallation = comfyInstallations.find(
    (installation) => installation.selected || (
      Boolean(effectiveComfyInstallDirectory) &&
      installation.directory.toLowerCase() === effectiveComfyInstallDirectory.toLowerCase()
    )
  ) ?? comfyInstallations[0];
  const effectiveComfyCoreDirectory =
    environmentScan?.comfySourceDirectory || selectedComfyInstallation?.sourceDirectory || "";
  const effectiveComfyDataDirectory = environmentScan?.comfyRoot || "";
  const effectiveModelDirectory =
    settings.modelDirectory || environmentScan?.modelDirectory || "";
  const comfyOutputRoot = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\output`
    : environmentScan?.outputDirectory || "";
  const autoVideoOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Videos`
    : "";
  const autoImageOutputDirectory = comfyOutputRoot
    ? `${comfyOutputRoot.replace(/[\\/]+$/u, "")}\\Images`
    : "";
  const autoImageInputLibraryDirectory = environmentScan?.comfyRoot
    ? `${environmentScan.comfyRoot.replace(/[\\/]+$/u, "")}\\input\\LocalVideoStudio`
    : "";
  const videoOutputDirectoryValue = settings.outputDirectory || autoVideoOutputDirectory;
  const imageOutputDirectoryPlaceholder = autoImageOutputDirectory ||
    "自动：当前 ComfyUI\\output\\Images";
  const customNodeInstallBlocked = Boolean(
    viewModel.customNodeInstalling || viewModel.queueRunning || viewModel.hasRunningQueueTask
  );

  const systemPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本机环境</h2><span class="muted">必需组件、可选工具和本地服务状态</span></div></div>
        ${environmentOverview}
      </section>
      ${comfyCompatibilityPanel}
      ${environmentIssuesPanel}
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>ComfyUI 安装实例</h2><span class="muted">选择一键启动、更新和离线版本检测使用的安装；不会自动改写你的选择</span></div>
          ${comfyInstallations.length > 1 ? `<span class="model-availability missing">发现 ${comfyInstallations.length} 个安装</span>` : `<span class="model-badge">${comfyInstallations.length ? "已发现" : "未发现"}</span>`}
        </div>
        <label>当前安装入口
          <div class="input-action"><input id="comfy-install-directory" value="${escape(effectiveComfyInstallDirectory)}" placeholder="留空时自动选择扫描结果"><button class="secondary button-with-icon" id="pick-comfy-install-directory">${icon("folder-open")}选择目录</button></div>
        </label>
        <div class="comfy-directory-map" aria-label="当前 ComfyUI 目录结构">
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">核心目录</span>
            <div><code title="${escape(effectiveComfyCoreDirectory)}">${escape(effectiveComfyCoreDirectory || "等待扫描")}</code><small>包含 main.py 和核心版本文件，用于启动与更新</small></div>
          </div>
          <div class="comfy-directory-row">
            <span class="comfy-directory-label">数据 / 节点目录</span>
            <div><code title="${escape(effectiveComfyDataDirectory)}">${escape(effectiveComfyDataDirectory || "等待扫描")}</code><small>包含 models、custom_nodes、input、output 和 user</small></div>
          </div>
        </div>
        ${comfyInstallations.length ? `<div class="comfy-installation-list">
          ${comfyInstallations.map((installation) => {
            const active = settings.comfyInstallDirectory
              ? installation.selected || installation.directory.toLowerCase() === settings.comfyInstallDirectory.toLowerCase()
              : installation === comfyInstallations[0];
            const typeLabel = installation.type === "desktop" ? "Desktop" : installation.type === "portable" ? "便携版" : "源码版";
            const versionParts = [
              installation.desktopVersion ? `Desktop v${installation.desktopVersion}` : "",
              installation.version ? `核心 v${installation.version}` : ""
            ].filter(Boolean);
            const version = versionParts.join(" · ") || "版本元数据未读取到";
            return `<article class="comfy-installation ${active ? "active" : ""}">
              <div><div class="model-title"><strong>${escape(typeLabel)}</strong><span class="model-badge">${escape(version)}</span></div><div class="comfy-installation-entry"><span>安装入口</span><code title="${escape(installation.directory)}">${escape(installation.directory)}</code></div>${installation.revision ? `<span class="muted">提交 ${escape(installation.revision)}</span>` : ""}</div>
              <button class="secondary button-with-icon" data-select-comfy-install="${escape(installation.directory)}" ${active ? "disabled" : ""}>${icon(active ? "check" : "play")}${active ? "当前使用" : "使用此版本"}</button>
            </article>`;
          }).join("")}
        </div>` : `<p class="muted proxy-hint">没有在常见位置找到安装。可手动选择包含 ComfyUI.exe、Comfy Desktop.exe 或 main.py 的目录。</p>`}
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>ComfyUI 连接</h2><span class="muted">连接运行中的 ComfyUI API</span></div><div class="connection-actions"><button class="secondary button-with-icon" data-test="comfy" ${viewModel.serviceForceStopping ? "disabled" : ""}>${icon("zap")}测试连接</button><button class="primary destructive button-with-icon" id="force-stop-comfy" ${viewModel.serviceForceStopping || viewModel.serviceBusy ? "disabled" : ""}>${icon(viewModel.serviceForceStopping ? "refresh-cw" : "ban")}${viewModel.serviceForceStopping ? "终止中…" : "强制终止所有进程"}</button></div></div>
        <label>服务地址<input id="comfy-url" value="${escape(settings.comfyUrl)}" placeholder="http://127.0.0.1:8188"></label>
        <p class="muted proxy-hint">默认使用 <code>http://127.0.0.1:8188</code>。一键启动与重启会直接让 ComfyUI 监听此地址。</p>
        <p class="muted proxy-hint danger-hint">强制终止会关闭所有 ComfyUI Desktop/后端实例，不会自动重启；适用于模型无法卸载或显存未释放的情况。</p>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>文件路径</h2><span class="muted">先确认生成结果保存位置，再管理 ComfyUI 使用的素材与模型</span></div></div>
        <div class="path-settings-group primary-paths">
          <div class="path-settings-caption"><strong>输出位置</strong><span>视频和图片生成结果分别保存</span></div>
          <div class="settings-grid two">
            <label>视频输出目录<div class="input-action"><input id="output-directory" data-auto-directory="${escape(autoVideoOutputDirectory)}" value="${escape(videoOutputDirectoryValue)}" placeholder="自动：当前 ComfyUI\\output\\Videos"><button class="secondary button-with-icon" id="pick-output-directory">${icon("folder-open")}选择</button></div></label>
            <label>图片输出目录<div class="input-action"><input id="image-output-directory" data-auto-directory="${escape(autoImageOutputDirectory)}" value="${escape(settings.imageOutputDirectory || autoImageOutputDirectory)}" placeholder="${escape(imageOutputDirectoryPlaceholder)}"><button class="secondary button-with-icon" id="pick-image-output-directory">${icon("folder-open")}选择</button></div></label>
          </div>
        </div>
        <div class="path-settings-group resource-paths">
          <div class="path-settings-caption"><strong>ComfyUI 资源</strong><span>输入素材和本地模型所在位置</span></div>
          <div class="settings-grid two">
            <label>输入素材库<div class="input-action"><input id="image-input-library-directory" value="${escape(settings.imageInputLibraryDirectory || autoImageInputLibraryDirectory)}" placeholder="等待识别当前 ComfyUI 数据目录"><button class="secondary button-with-icon" id="pick-image-input-library-directory">${icon("folder-open")}选择</button></div></label>
            <label>模型目录<div class="input-action"><input id="model-directory" value="${escape(effectiveModelDirectory)}" placeholder="扫描或选择 models 目录"><button class="secondary button-with-icon" id="pick-model-directory">${icon("folder-open")}选择</button></div></label>
          </div>
        </div>
        <div class="asset-library-settings-row"><div><strong>素材库维护</strong><span class="muted">归档旧历史引用，并检查未被使用的输入素材。</span></div><button class="secondary button-with-icon" id="open-image-asset-library">${icon("package-open")}整理素材库</button></div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>下载代理</h2><span class="muted">用于节点、Python 依赖、工作流及节点运行时模型下载；不会影响 ComfyUI 本地连接。</span></div><span class="model-badge">${settings.proxyEnabled ? "已开启" : "已关闭"}</span></div>
        <div class="settings-grid two">
          <label class="ios-switch-field"><span class="policy-copy"><strong>启用下载代理</strong><small>Git、pip、工作流和 SeedVR2 等节点下载共用此地址</small></span><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label>代理地址<input id="proxy-url" value="${escape(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
        </div>
        <p class="muted proxy-hint">默认关闭。可填写 <code>127.0.0.1:7890</code> 或完整代理 URL。节点安装立即使用；ComfyUI 运行时下载需要保存后重启服务才能继承新代理。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>GPU 运行策略</h2><span class="muted">${escape(gpuSummary)}</span></div><span class="model-badge">${escape(gpuBadge)}</span></div>
        <div class="gpu-hardware-block">
          <div class="gpu-hardware-heading"><div><strong>已识别硬件</strong><span>来自 nvidia-smi 的实时检测结果</span></div><span class="gpu-budget-label">${escape(gpuBudgetSummary)}</span></div>
          ${gpuCards}
        </div>
        <div class="runtime-policy-grid">
          <label class="policy-select-field"><span>显存安全余量</span><select id="vram-reserve"><option value="0.5" ${settings.vramReserveGb === 0.5 ? "selected" : ""}>0.5 GB · 激进</option><option value="0.75" ${settings.vramReserveGb === 0.75 ? "selected" : ""}>0.75 GB · 平衡</option><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · 保守</option></select></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>安全取消</strong><small>先请求中断，再后台释放显存；清理失败时才重启 ComfyUI</small></span><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="ios-switch-field"><span class="policy-copy"><strong>任务失败自动重试</strong><small>仅重试可通过清理并重启 ComfyUI 恢复的错误</small></span><input id="auto-retry-failed-tasks" type="checkbox" ${settings.autoRetryFailedTasks ? "checked" : ""}><span class="ios-switch" aria-hidden="true"></span></label>
          <label class="policy-select-field"><span>自动重试次数</span><select id="auto-retry-count" ${settings.autoRetryFailedTasks ? "" : "disabled"}>${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${settings.autoRetryCount === count ? "selected" : ""}>${count} 次${count === 2 ? " · 推荐" : ""}</option>`).join("")}</select></label>
        </div>
        <p class="muted proxy-hint">CUDA 上下文损坏、显存分配失败、ComfyUI 失联或卡死会先完成进程清理和服务重启，再重试当前任务。参数、模型或工作流错误不会自动重试；达到上限后保留失败任务并继续队列。</p>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频模型</h2><span class="muted">根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。</span></div>
          <label class="compact-label">默认模型<select id="default-video-model">
            ${(videoProfiles.length ? videoProfiles : [
              { id: "minimax_h3_fl2va", name: "MiniMax H3 FL2VA · 首帧 / 首尾帧", available: true, integrated: true },
              { id: "minimax_h3_fl2va_int4", name: "MiniMax H3 FL2VA · INT4 低显存", available: true, integrated: true },
              { id: "minimax_h3_fl2va_q3_gguf", name: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验", available: true, integrated: true },
              { id: "minimax_h3_ref2va", name: "MiniMax H3 R2V · 多参考 INT8", available: true, integrated: true },
              { id: "minimax_h3_ref2va_int4", name: "MiniMax H3 R2V · 多参考 INT4", available: true, integrated: true },
              { id: "sulphur2", name: "Sulphur 2 GGUF", available: false, integrated: true }
            ]).map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available || profile.integrated === false ? "disabled" : ""}>${escape(profile.name)}${!profile.available ? " · 缺组件" : profile.integrated === false ? " · 工作流待接入" : ""}</option>`).join("")}
          </select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${videoAvailable} 个已接入可运行模型，${videoProfiles.length - videoAvailable} 个缺组件或等待工作流接入` : "等待首次扫描"}</div>
      </section>
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>Sulphur 2 部署</h2><span class="muted">同一档位同时决定普通 I2V、原生 Extend、模型扫描和新任务快照。</span></div><span class="model-badge">分离式 GGUF</span></div>
        <div class="settings-grid two">
          <label>Transformer 量化档<select id="ltx-extension-model-profile"><option value="q2_distilled" ${settings.ltxExtensionModelProfile === "q2_distilled" ? "selected" : ""}>Q2_K distilled · 7.93 GB · 8GB 兼容</option><option value="q3_k_m" ${settings.ltxExtensionModelProfile === "q3_k_m" ? "selected" : ""}>Q3_K_M dev · 11.13 GB · 推荐</option><option value="q4_k_m" ${settings.ltxExtensionModelProfile === "q4_k_m" ? "selected" : ""}>Q4_K_M dev · 14.30 GB · 质量</option></select></label>
          <label>基准分辨率<select id="ltx-extension-resolution"><option value="360" ${settings.ltxExtensionResolution === 360 ? "selected" : ""}>360p · 推荐</option><option value="480" ${settings.ltxExtensionResolution === 480 ? "selected" : ""}>480p · 较慢</option></select></label>
          <label>每段新增模型帧<select id="ltx-extension-frames"><option value="49" ${settings.ltxExtensionFrames === 49 ? "selected" : ""}>49 帧 · 推荐</option><option value="65" ${settings.ltxExtensionFrames === 65 ? "selected" : ""}>65 帧 · 较长</option></select></label>
          <label>单节点等待上限<select id="ltx-extension-timeout"><option value="10" ${settings.ltxExtensionTimeoutMinutes === 10 ? "selected" : ""}>10 分钟 · 快速止损</option><option value="20" ${settings.ltxExtensionTimeoutMinutes === 20 ? "selected" : ""}>20 分钟 · 推荐</option><option value="30" ${settings.ltxExtensionTimeoutMinutes === 30 ? "selected" : ""}>30 分钟 · 极慢设备</option></select></label>
        </div>
        <p class="muted proxy-hint">Q2 使用 distilled 模型且不加载 LoRA；Q3/Q4 使用 dev 模型和 distill LoRA。三档均要求 Gemma 3、LTX 文本连接器、独立视频/音频 VAE 与 latent upscaler，并强制单任务、<code>patch_on_device=false</code>、<code>--cache-none</code>、CPU offload 和分块解码。8GB 兼容仍要求充足的系统内存与页面文件。</p>
      </section>
    </section>`;

  const loraPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频 LoRA</h2><span class="muted">LoRA 是叠加在基础模型上的可选适配层，不再作为独立视频模型显示。</span></div>
          <span class="model-badge">${loraAvailable}/${loraProfiles.length} 可用</span>
        </div>
        <div class="scan-result">标准 <code>.safetensors</code> LoRA 由 ComfyUI 核心 <code>LoraLoaderModelOnly</code> 加载，不需要单独安装节点。只有带自定义加载器、采样器、缓存或模型补丁的特殊 LoRA 才会额外依赖节点。</div>
        <p class="muted proxy-hint">LightX2V Turbo 4-Step 仅兼容 MiniMax H3 FL2VA。启用后默认使用 strength 0.75、ER-SDE、Beta 和 8 步；它减少采样步数，但不会把 H3 变成低显存模型。</p>
      </section>
      <div class="model-profile-list">${loraProfiles.length ? loraProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">尚无 LoRA 扫描结果</div>`}</div>
    </section>`;

  const imagePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>图片编辑模型</h2><span class="muted">选择适合当前显存的本地图像模型；只有组件和工作流完成验证后，创建页才会允许提交。</span></div>
          <span class="model-badge">Qwen / Klein</span>
        </div>
        <div class="settings-grid two">
          <label>默认图片模型<select id="default-image-model">
            ${(imageProfiles.length ? imageProfiles : [
              { id: "qwen-image-edit-2511", name: "Qwen-Image-Edit-2511 · 图片处理", category: "image" as const, badge: "Qwen 2511", description: "", vram: "", available: false, integrated: true, components: [] },
              { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B · 图片处理", category: "image" as const, badge: "约 13GB VRAM", description: "", vram: "", available: false, integrated: true, components: [] }
            ]).map((profile) => `<option value="${escape(profile.id)}" ${settings.defaultImageModel === profile.id ? "selected" : ""} ${options.isImageModelSelectable(profile) ? "" : "disabled"}>${escape(profile.name)}${options.isImageModelSelectable(profile) ? "" : ` · ${escape(options.imageWorkflowStatus(profile))}`}</option>`).join("")}
          </select></label>
          <label>默认质量档<select id="image-quality-profile">
            ${imageQualityProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.defaultImageQualityProfile === profile.id ? "selected" : ""}>${escape(profile.label)} · ${profile.steps} 步</option>`).join("")}
          </select></label>
          <label>默认生成数量<div class="inline-field"><input id="image-output-count" type="range" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><input id="image-output-count-number" type="number" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, settings.imageOutputCount))}"><span>张</span></div></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? "正在扫描图片模型组件和 ComfyUI 节点…" : environmentScan ? `找到 ${imageComponentsReady} 个组件完整档位，${imageWorkflowsReady} 个工作流可用；Qwen 2511 当前最多支持 3 张 Picture` : "等待首次扫描"}</div>
        <p class="muted proxy-hint">图片工作流固定输出 PNG，便于继续编辑和交给 H3 使用。Qwen 2511 会在下次启动 ComfyUI 时自动使用 CPU VAE、文本编码器卸载和更激进的显存回收；FLUX.2 Klein 4B 是 4090 的优先轻量候选。</p>
      </section>
      <div class="model-profile-list">${imageProfiles.length ? imageProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">尚无图片模型扫描结果；请先确认模型目录后重新扫描。</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本地提示词模型</h2><span class="muted">统一由当前 ComfyUI 运行：Qwen 使用原生 TextGenerate，Gemma 4 使用 H3 Prompt Writer 扩展。</span></div><div class="button-row"><span class="model-badge">仅依赖 ComfyUI</span><button class="icon-button prompt-runtime-button ${viewModel.promptRuntimeBusy ? "busy" : ""}" id="release-prompt-model" ${viewModel.promptRuntimeBusy || viewModel.queueRunning || (!viewModel.promptRuntimeLoaded && !viewModel.promptStatus.ready) ? "disabled" : ""} aria-label="${escape(viewModel.promptRuntimeControlTitle)}" title="${escape(viewModel.promptRuntimeControlTitle)}" aria-busy="${viewModel.promptRuntimeBusy}">${icon(viewModel.promptRuntimeControlIconName)}</button></div></div>
        <label>默认提示词模型<select id="prompt-model-id">${promptProfiles.map((profile) => `<option value="${escape(profile.id)}" ${settings.promptModelId === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escape(profile.name)}${profile.available ? "" : " · 缺组件"} · 视频/图片</option>`).join("")}</select></label>
        <div class="settings-grid two">
          <label>扩写语言<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>跟随输入语言</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>中文</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>英文</option></select></label>
          <label>创造性<select id="prompt-creativity"><option value="0.3" ${settings.promptCreativity === 0.3 ? "selected" : ""}>克制 · 0.3</option><option value="0.7" ${settings.promptCreativity === 0.7 ? "selected" : ""}>平衡 · 0.7</option><option value="1" ${settings.promptCreativity === 1 ? "selected" : ""}>丰富 · 1.0</option></select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? "正在扫描 ComfyUI/models…" : environmentScan ? `找到 ${promptAvailable} 个提示词模型档位` : "等待首次扫描"}</div>
        <p class="muted proxy-hint">Qwen Safetensors 使用 ComfyUI 官方 <code>models/text_encoders</code> 分类；Gemma GGUF 使用 H3 Prompt Writer 扩展注册的大写 <code>models/LLM/独立子目录</code>，主模型与匹配的 <code>mmproj</code> 必须放在一起。扩写完成会自动卸载，不需要安装或启动 llama-server、LM Studio。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>视频提示词预设</h2><span class="muted">预设会把原始文字和参考图整理成完整的 H3 视频提示词，覆盖主体、场景、动作、镜头、声音、对白和连续性。</span></div><button class="secondary button-with-icon" id="restore-h3-prompt-presets">${icon("rotate-ccw")}恢复默认</button></div>
        <label>当前编辑预设<select id="h3-prompt-preset-setting">${options.h3PromptPresetOptions(viewModel.settingsH3PromptPreset, true)}</select></label>
        <p class="muted proxy-hint">${escape(options.h3PromptPresetDescriptions[viewModel.settingsH3PromptPreset])}</p>
        <label>预设规则头<textarea id="h3-prompt-preset-text" rows="7">${escape(selectedH3PresetText)}</textarea></label>
        <p class="muted proxy-hint">规则头可自由修改；内置的 H3 官方基线会继续强制参考标签、首尾帧关系、连续性、音频和输出格式。修改后点击设置页顶部“保存设置”，创建页下次扩写立即使用。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>图片提示词预设</h2><span class="muted">只影响图片“优化提示词”时的整理策略，不改变 Qwen Image 的生成参数。</span></div><button class="secondary button-with-icon" id="restore-image-prompt-presets">${icon("rotate-ccw")}恢复默认</button></div>
        <label>当前编辑预设<select id="image-prompt-preset-setting">${Object.entries(options.imagePromptPresetLabels).map(([id, label]) => `<option value="${id}" ${viewModel.settingsImagePromptPreset === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <p class="muted proxy-hint">${escape(options.imagePromptPresetDescriptions[viewModel.settingsImagePromptPreset])}</p>
        <label>预设规则头<textarea id="image-prompt-preset-text" rows="7">${escape(selectedImagePromptPresetText)}</textarea></label>
        <p class="muted proxy-hint">规则头会作为图片 Prompt 优化器的策略说明；最终发送给 Qwen Image 的 Prompt 不会包含这段设置文本。</p>
      </section>
      <div class="model-profile-list">${promptProfiles.length ? promptProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">尚无提示词模型扫描结果</div>`}</div>
    </section>`;

  const upscalePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>分辨率提升模型</h2><span class="muted">只有组件完整的模型才能进入后续提升工作流。</span></div>
          <label class="compact-label">默认模型<select id="default-upscale-model">${upscaleProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultUpscaleModel === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escape(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
        </div>
        <div class="scan-result">${viewModel.environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${upscaleAvailable} 个可运行模型，${upscaleProfiles.length - upscaleAvailable} 个待补齐` : "等待首次扫描"}</div>
        <div class="settings-grid two">
          <label>SeedVR2 权重<input id="seedvr2-model" value="${escape(settings.seedVr2Model)}"></label>
          <label>Real-ESRGAN 权重<input id="realesrgan-model" value="${escape(settings.realEsrganModel)}"></label>
        </div>
      </section>
      <div class="model-profile-list">${upscaleProfiles.length ? upscaleProfiles.map((profile) => renderProfileCard(profile)).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
    </section>`;

  const nodeInstalled = environmentScan?.customNodes.filter(
    (node) => node.loaded
  ).length ?? 0;
  const h3CoreNodes = environmentScan?.comfyCompatibility.coreNodes ?? [];
  const h3CoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const h3CoreReady = environmentScan?.comfyCompatibility.h3CoreSupported ?? false;
  const promptCoreNodes = environmentScan?.comfyCompatibility.promptCoreNodes ?? [];
  const promptCoreKnown = environmentScan?.comfyCompatibility.checkedFrom !== "";
  const promptCoreReady = promptCoreNodes.length > 0 && promptCoreNodes.every((node) => node.available);
  const workflowDependencies = environmentScan?.workflowDependencies ?? [];
  const nodeDependencyAvailable = nodeInstalled + (h3CoreReady ? 1 : 0) +
    (promptCoreReady ? 1 : 0) +
    workflowDependencies.filter((workflow) => workflow.installed).length;
  const nodeDependencyTotal = (environmentScan?.customNodes.length ?? 0) + 2 +
    workflowDependencies.length;
  const nodePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>节点与工作流依赖</h2><span class="muted">换电脑后按项目清单复现 ComfyUI 节点环境</span></div><span class="model-badge">${nodeDependencyAvailable}/${nodeDependencyTotal} 可用</span></div>
        <div class="scan-result">安装只使用项目内置仓库清单；完成后重启 ComfyUI，再重新扫描。</div>
      </section>
      <div class="model-profile-list">
        <article class="panel custom-node-card ${h3CoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>MiniMax H3 原生音视频核心</h3><span class="model-badge">ComfyUI v0.31.0+</span></div>
            <p>LightX2V Turbo 直接使用 ComfyUI 原生 LoRA 与音视频采样，不需要额外的 Turbo custom node；版本过低时请更新所选 ComfyUI 并重启复检。</p>
            <div class="component-list">
              ${h3CoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escape(node.label)}</strong><code>${escape(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>等待扫描核心节点</strong></div></div>`}
            </div>
            <span class="muted">最低版本 <code>v0.31.0</code> · 参考提交 <code>${escape(environmentScan?.comfyCompatibility.h3MinimumRevision ?? "")}</code></span>
            ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>核心处理日志</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${h3CoreReady ? "available" : "missing"}">${h3CoreReady ? `${icon("circle-check")} 已加载` : h3CoreKnown ? `${icon("circle-alert")} 核心缺失` : `${icon("circle-help")} 尚未启动检测`}</span>
            ${h3CoreReady ? "" : `<button class="primary button-with-icon" id="repair-h3-core" ${viewModel.coreDependencyRepairing ? "disabled" : ""}>${icon(viewModel.coreDependencyRepairing ? "refresh-cw" : "shield-check")}${viewModel.coreDependencyRepairing ? "处理中…" : h3CoreKnown ? "一键补齐/更新" : "启动并检测"}</button>`}
          </div>
        </article>
        <article class="panel custom-node-card ${promptCoreReady ? "available" : "missing"}">
          <div class="custom-node-copy">
            <div class="model-title"><h3>Qwen 提示词核心节点</h3><span class="model-badge">ComfyUI 核心</span></div>
            <p>Qwen3.5 2B/4B 使用 ComfyUI 自带的文本生成链路，不需要安装第三方节点；更新 ComfyUI 核心后重新扫描即可。</p>
            <div class="component-list">
              ${promptCoreNodes.map((node) => `<div class="component-row ${node.available ? "found" : "missing"}"><span class="component-state">${icon(node.available ? "circle-check" : "circle-alert")}</span><div><strong>${escape(node.label)}</strong><code>${escape(node.id)}</code></div></div>`).join("") || `<div class="component-row missing"><span class="component-state">${icon("circle-alert")}</span><div><strong>等待扫描 Qwen 核心节点</strong></div></div>`}
            </div>
          </div>
          <div class="custom-node-actions">
            <span class="model-availability ${promptCoreReady ? "available" : "missing"}">${promptCoreReady ? `${icon("circle-check")} 已加载` : promptCoreKnown ? `${icon("circle-alert")} 核心缺失` : `${icon("circle-help")} 尚未启动检测`}</span>
          </div>
        </article>
        ${workflowDependencies.map((workflow) => `
          <article class="panel custom-node-card ${workflow.installed ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escape(workflow.name)}</h3><span class="model-badge">官方工作流</span></div>
              <p>${escape(workflow.purpose)}</p>
              <code>${escape(workflow.path || workflow.sourceUrl)}</code>
              ${viewModel.workflowDependencyLogs[workflow.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escape(viewModel.workflowDependencyLogs[workflow.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${workflow.installed ? "available" : "missing"}">${workflow.installed ? `${icon("circle-check")} 已安装` : `${icon("circle-alert")} 未安装`}</span>
              <button class="${workflow.installed ? "secondary" : "primary"} button-with-icon" data-install-workflow="${escape(workflow.id)}" ${viewModel.workflowDependencyInstalling ? "disabled" : ""}>${icon(viewModel.workflowDependencyInstalling === workflow.id ? "refresh-cw" : "download")}${viewModel.workflowDependencyInstalling === workflow.id ? "安装中…" : workflow.installed ? "重新安装" : "一键安装"}</button>
            </div>
          </article>`).join("")}
        ${(environmentScan?.customNodes ?? []).map((node) => `
          <article class="panel custom-node-card ${node.loaded ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escape(node.name)}</h3><span class="model-badge">${node.required ? "项目必需" : "可选"}${node.version ? ` · v${escape(node.version)}` : ""}</span></div>
              <p>${escape(node.purpose)}</p>
              <code>${escape(node.directory || node.repositoryUrl)}</code>
              ${node.id === "spectrum-minimax-h3" ? `<p class="muted">本机版本：${node.version ? `v${escape(node.version)}` : node.installed ? "未读取到版本号" : "未安装"} · 最新发布：${node.latestVersion ? `v${escape(node.latestVersion)}` : "联网后重新扫描"} · 运行时固定使用系统内存，不额外下载模型。</p>` : ""}
              ${node.loadError ? `<span class="node-error">${escape(node.loadError)}</span>` : ""}
              ${viewModel.customNodeLogs[node.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escape(viewModel.customNodeLogs[node.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${node.loaded && !node.updateAvailable ? "available" : "missing"}">${node.updateAvailable ? `${icon("circle-alert")} 需要更新` : node.loaded ? `${icon("circle-check")} ${node.runtimeVerified ? "运行时已验证" : "文件检查通过"}` : node.installed ? `${icon("circle-alert")} 已安装，需修复` : `${icon("circle-alert")} 未安装`}</span>
              <button class="${node.updateAvailable || !node.installed || !node.loaded ? "primary" : "secondary"} button-with-icon" data-install-node="${escape(node.id)}" ${customNodeInstallBlocked ? "disabled" : ""}>${icon(viewModel.customNodeInstalling === node.id ? "refresh-cw" : node.installed ? "refresh-cw" : "download")}${viewModel.customNodeInstalling === node.id ? "处理中…" : node.updateAvailable ? "更新并重启" : node.installed && !node.loaded ? "更新/重启复检" : node.installed ? "检查更新" : "安装并重启"}</button>
            </div>
          </article>`).join("") || `<div class="panel environment-empty">等待环境扫描结果</div>`}
      </div>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>工作流占位符</h2><span class="muted">提交自定义视频 ComfyUI API JSON 前会递归替换；图片工作流不使用这些占位符。</span></div></div>
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "SOURCE_VIDEO", "TRIM_START", "TRIM_END", "EXTENSION_FRAMES", "OVERLAP_FRAMES", "UNLOAD_BETWEEN_STAGES", "WIDTH", "HEIGHT", "DURATION", "SOURCE_FPS", "FPS", "FRAMES", "OUTPUT_FRAMES", "OUTPUT_FILENAME", "H3_DIFFUSION_MODEL", "H3_TEXT_ENCODER", "H3_TURBO_LORA"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
      </section>
    </section>`;

  const attention = environmentScan?.attentionAcceleration;
  const pythonSourceLabels: Record<string, string> = {
    selected: "手动指定",
    "comfy-venv": "ComfyUI 虚拟环境",
    embedded: "嵌入式 Python",
    path: "系统 PATH",
    "py-launcher": "py 启动器",
    other: "其他来源"
  };
  const pythonRuntimes = environmentScan?.pythonRuntimes ?? [];
  const detectedPythonPath = attention?.pythonPath ||
    pythonRuntimes.find((runtime) => runtime.selected)?.path ||
    pythonRuntimes[0]?.path ||
    "";
  const effectivePythonPath = settings.comfyPythonPath || detectedPythonPath;
  const selectedPythonRuntime = pythonRuntimes.find(
    (runtime) => runtime.path.toLowerCase() === effectivePythonPath.toLowerCase()
  );
  const pythonSelectionLabel = settings.comfyPythonPath
    ? selectedPythonRuntime?.source === "comfy-venv"
      ? "ComfyUI 虚拟环境"
      : "手动指定"
    : "自动探测";
  const accelerationPanel = `
    <section class="settings-panel acceleration-panel">
      <section class="panel settings-section acceleration-overview ${attention?.ready ? "available" : "missing"}">
        <div class="section-heading">
          <div><h2>H3 推理加速</h2><span class="muted">为当前 ComfyUI 环境匹配 Python、PyTorch、CUDA 与 Attention 运行库</span></div>
          <span class="model-availability ${attention?.ready ? "available" : "missing"}">${attention?.ready ? `${icon("circle-check")} 已就绪` : attention?.supported ? `${icon("circle-alert")} 待安装/修复` : `${icon("circle-alert")} 环境不支持`}</span>
        </div>
        <div class="acceleration-control-row">
          <label class="acceleration-mode-field">H3 Attention 模式
            <select id="h3-attention-mode">
              <option value="sage" ${settings.h3AttentionMode === "sage" ? "selected" : ""}>自动加速 · SageAttention CUDA FP16</option>
              <option value="sage-triton" ${settings.h3AttentionMode === "sage-triton" ? "selected" : ""}>稳定加速 · SageAttention Triton FP16</option>
              <option value="pytorch" ${settings.h3AttentionMode === "pytorch" ? "selected" : ""}>兼容模式 · PyTorch Attention</option>
            </select>
          </label>
          <div class="acceleration-summary">
            <span class="acceleration-summary-icon">${icon(attention?.ready ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escape(attention?.detail ?? "等待环境扫描")}</strong><span>CUDA 内核异常时会依次降级到 SageAttention Triton 和 PyTorch Attention，避免队列反复崩溃。</span></div>
          </div>
        </div>
        <div class="python-runtime-picker">
          <div class="python-runtime-picker-head">
            <div><span class="runtime-label">ComfyUI Python 解释器</span><strong>用于启动 ComfyUI、安装节点依赖和 H3 加速检测</strong></div>
            <span class="python-selection-badge">${pythonSelectionLabel}</span>
          </div>
          <div class="python-runtime-picker-controls">
            <label class="python-path-field"><span class="runtime-label">当前解释器路径</span><div class="input-action"><input id="comfy-python-path" value="${escape(effectivePythonPath)}" placeholder="扫描后自动填入可用解释器"><button class="secondary button-with-icon" id="pick-comfy-python">${icon("folder-open")}选择文件</button></div></label>
            <label class="python-candidate-field"><span class="runtime-label">扫描到的候选版本</span><select id="comfy-python-candidate"><option value="">${viewModel.environmentScanning ? "正在扫描…" : pythonRuntimes.length ? "选择一个解释器" : "未发现可用 Python"}</option>${pythonRuntimes.map((runtime) => `<option value="${escape(runtime.path)}" ${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? "selected" : ""}>Python ${escape(runtime.version)} · ${escape(pythonSourceLabels[runtime.source] ?? runtime.source)}${runtime.path.toLowerCase() === effectivePythonPath.toLowerCase() ? " · 当前" : ""}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="attention-runtime-grid">
          <article class="attention-runtime-card"><span class="runtime-label">ComfyUI Python</span><strong class="runtime-value">${escape(attention?.pythonVersion || "未找到")}</strong><code class="runtime-detail" title="${escape(attention?.pythonPath || "")}">${escape(attention?.pythonPath || "请先选择 ComfyUI 安装目录")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">PyTorch / CUDA</span><strong class="runtime-value">${escape(attention?.torchVersion || "未知")}</strong><code class="runtime-detail">CUDA ${escape(attention?.cudaVersion || "未知")} · SM ${escape(attention?.gpuArchitecture || "未知")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">SageAttention</span><strong class="runtime-value">${escape(attention?.sageAttentionVersion || "未安装")}</strong><code class="runtime-detail" title="${escape(attention?.recommendedWheel || "")}">${escape(attention?.recommendedWheel || "当前环境没有匹配的 wheel")}</code></article>
          <article class="attention-runtime-card"><span class="runtime-label">Triton / KJNodes</span><strong class="runtime-value">${escape(attention?.tritonVersion || "未安装")}</strong><code class="runtime-detail">${attention?.kjNodesCompatible ? "KJNodes 模型级补丁可用" : attention?.kjNodesInstalled ? "KJNodes 需要更新" : "KJNodes 未安装"}</code></article>
        </div>
        <div class="acceleration-actions">
          <button class="primary button-with-icon" id="install-attention-acceleration" ${viewModel.attentionAccelerationInstalling || !attention?.supported ? "disabled" : ""}>${icon(viewModel.attentionAccelerationInstalling ? "refresh-cw" : "wand-sparkles")}${viewModel.attentionAccelerationInstalling ? "正在补全环境…" : attention?.ready ? "重新安装/修复" : "一键安装并自检"}</button>
          <div><strong>安装过程会临时停止 ComfyUI</strong><span>环境补全后，若服务此前正在运行，程序会自动将它重启。</span></div>
        </div>
        ${viewModel.attentionAccelerationLog ? `<details class="node-log" open><summary>环境安装日志</summary><pre id="attention-install-log">${escape(viewModel.attentionAccelerationLog)}</pre></details>` : ""}
      </section>
    </section>`;

  const logsPanel = `
    <section class="settings-panel app-logs-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>运行日志</h2><span class="muted">记录程序生命周期、任务阶段和错误，不记录提示词、输入内容或媒体路径。</span></div>
          <div class="button-row"><button class="secondary button-with-icon" id="refresh-app-logs" ${viewModel.appLogsLoading ? "disabled" : ""}>${icon(viewModel.appLogsLoading ? "refresh-cw" : "rotate-ccw")}${viewModel.appLogsLoading ? "读取中…" : "刷新"}</button></div>
        </div>
        <div class="app-log-summary">
          <div class="app-log-directory-actions"><span>目录</span><div><button class="secondary button-with-icon" id="open-app-log-directory">${icon("folder-open")}日志目录</button><button class="secondary button-with-icon" id="open-app-crash-directory">${icon("folder-open")}崩溃转储</button></div></div>
          <div class="app-log-stats"><div class="app-log-stat"><span>保留</span><strong>${viewModel.appLogs?.retentionDays ?? 7} 天</strong></div><div class="app-log-stat"><span>记录</span><strong id="app-log-count">${viewModel.appLogs?.records.length ?? 0}</strong></div></div>
        </div>
        ${viewModel.appLogsError ? `<p class="error">${escape(viewModel.appLogsError)}</p>` : ""}
        ${viewModel.appLogs?.text
          ? `<pre class="app-log-terminal" id="app-log-terminal">${options.renderAppLogTerminal(viewModel.appLogs.text)}</pre>`
          : `<div class="environment-empty">${viewModel.appLogsLoading ? "正在读取运行日志…" : "暂无运行日志"}</div>`}
      </section>
    </section>`;

  const activePanel =
    viewModel.settingsTab === "system" ? systemPanel :
    viewModel.settingsTab === "acceleration" ? accelerationPanel :
    viewModel.settingsTab === "video" ? videoPanel :
    viewModel.settingsTab === "lora" ? loraPanel :
    viewModel.settingsTab === "image" ? imagePanel :
    viewModel.settingsTab === "nodes" ? nodePanel :
    viewModel.settingsTab === "prompt" ? promptPanel :
    viewModel.settingsTab === "upscale" ? upscalePanel :
    logsPanel;

  return `
    <section class="page-heading settings-heading">
      <div><div class="heading-line"><h1>设置</h1>${gpuDevices.length ? `<span class="model-badge">${escape(gpuBadge)}</span>` : ""}</div><p>模型扫描、GPU 显存检测和本地服务集中配置。</p></div>
      <div class="button-row settings-heading-actions"><span class="save-state ${viewModel.settingsDirty ? "dirty" : ""}">${viewModel.settingsDirty ? "未保存更改" : "已保存"}</span><button class="secondary button-with-icon" id="scan-environment" ${viewModel.environmentScanning ? "disabled" : ""}>${icon(viewModel.environmentScanning ? "refresh-cw" : "scan-search")}${viewModel.environmentScanning ? "扫描中…" : "重新扫描全部"}</button><button class="secondary button-with-icon" id="discard-settings" ${viewModel.settingsDirty ? "" : "disabled"}>${icon("rotate-ccw")}放弃更改</button><button class="primary button-with-icon" id="save-settings" ${viewModel.settingsDirty ? "" : "disabled"}>${icon("save")}保存设置</button></div>
    </section>
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="设置分类">
        ${([
          ["system", "settings", "系统与路径"],
          ["acceleration", "zap", "推理加速"],
          ["video", "images", "视频模型"],
          ["lora", "zap", "LoRA"],
          ["image", "images", "图片模型"],
          ["nodes", "workflow", "节点与工作流"],
          ["prompt", "sparkles", "提示词扩写"],
          ["upscale", "maximize-2", "分辨率提升"],
          ["logs", "file-text", "运行日志"]
        ] as const).map(([id, iconName, label]) => `<button class="settings-tab ${viewModel.settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon(iconName)}</span>${label}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "lora" && environmentScan ? `<small>${loraAvailable}/${loraProfiles.length}</small>` : ""}${id === "image" && environmentScan ? `<small>${imageComponentsReady}/${imageProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeDependencyAvailable}/${nodeDependencyTotal}</small>` : ""}${id === "prompt" && environmentScan ? `<small>${promptAvailable}/${promptProfiles.length}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog}`;
}
