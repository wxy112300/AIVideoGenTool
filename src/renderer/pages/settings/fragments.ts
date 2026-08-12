import type {
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile
} from "../../../types";

type IconRenderer = (name: string, className?: string) => string;
type EscapeHtml = (value: string) => string;

interface SettingsFragmentRenderOptions {
  icon: IconRenderer;
  escapeHtml: EscapeHtml;
}

export interface SettingsEnvironmentOverviewViewModel {
  environmentScan: EnvironmentScanResult | null;
  environmentScanning: boolean;
  environmentScanError: string;
  serviceStarting: LocalServiceKind | null;
  serviceRestarting: LocalServiceKind | null;
  serviceForceStopping: boolean;
  serviceStatusMessage: string;
}

export interface SettingsEnvironmentOverviewOptions extends SettingsFragmentRenderOptions {
  formatScanTime(scannedAt: string): string;
}

export interface SettingsEnvironmentIssuesPanelViewModel {
  environmentScan: EnvironmentScanResult | null;
  environmentRepairing: string;
  environmentRepairLogs: Record<string, string>;
}

export interface SettingsComfyCompatibilityPanelViewModel {
  environmentScan: EnvironmentScanResult | null;
  comfyUpdating: boolean;
  comfyUpdateLog: string;
}

export interface SettingsModelScanCardOptions extends SettingsFragmentRenderOptions {
  isGemmaPromptModel(modelId: string): boolean;
  videoLoraInfoButton(profileId: string): string;
  isImageWorkflowReady(profile?: ModelScanProfile): boolean;
  imageWorkflowStatus(profile?: ModelScanProfile): string;
}

export interface SettingsInstallGuideSelection {
  profileName: string;
  component: ModelComponentStatus;
}

export interface SettingsInstallGuideDialogViewModel {
  selectedInstallGuide: SettingsInstallGuideSelection | null;
  configuredModelDirectory: string;
}

const modelHardwareRecommendations: Record<string, string> = {
  "qwen/qwen3.5-4b": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "qwen/qwen3.5-2b": "RTX 2060 6GB 以上 · 系统 RAM 16GB 以上",
  "qwen-image-edit-2511": "RTX 3090/4090 24GB 以上 · CPU/offload",
  "flux2-klein-4b": "RTX 4080/4090 16GB 以上",
  minimax_h3_fl2va: "RTX 3090/4090 24GB 以上 · 系统 RAM 64GB 推荐",
  minimax_h3_fl2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB 实验 · 系统 RAM 32GB 起步",
  minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB 以上 · Turbo 不降低基础显存",
  minimax_h3_ref2va: "RTX 3090/4090 24GB 以上 · 多参考需更多 RAM",
  minimax_h3_ref2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
  sulphur2: "RTX 3060 12GB 以上 · 系统 RAM 32GB 以上",
  wan22_5b: "RTX 3080 12GB/4070 12GB 以上 · 16GB 推荐",
  hunyuan15: "RTX 3090/4090 24GB 以上",
  wan22_14b_nsfw: "RTX 3090/4090 24GB 以上 · 保守卸载",
  wan22_remix: "RTX 3090/4090 24GB 以上",
  wan22_smoothmix: "RTX 3090/4090 24GB 以上",
  wan22_dasiwa: "RTX 3090/4090 24GB 以上",
  seedvr2: "RTX 3090/4090 24GB 以上",
  flashvsr: "RTX 4080/4090 16GB 以上",
  hunyuan15_sr: "RTX 4090 24GB 以上 · 两阶段模型卸载",
  realesrgan: "RTX 2060/3060 6GB 以上",
  rife: "RTX 2060/3060 6GB 以上",
  "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
  "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-e4b-q3": "RTX 3060 8GB/12GB 以上 · 系统 RAM 16GB 以上",
  "google/gemma-4-12b-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-12b-q5": "RTX 4080/4090 16GB 以上 · 系统 RAM 24GB 以上",
  "google/gemma-4-26b-a4b-q4": "RTX 3090/4090 24GB 以上",
  "google/gemma-4-31b-q4": "RTX 4090 32GB 以上或专业卡"
};

function escapeValue(
  options: SettingsFragmentRenderOptions,
  value: string | number | null | undefined
): string {
  return options.escapeHtml(value == null ? "" : String(value));
}

function modelHardwareRecommendation(profile: ModelScanProfile): string {
  return modelHardwareRecommendations[profile.id] ?? (
    profile.category === "video"
      ? "RTX 3080 12GB 以上 · 系统 RAM 32GB 以上"
      : profile.category === "image"
        ? "RTX 3060 12GB 以上"
        : profile.category === "prompt"
          ? "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上"
          : "RTX 2060 6GB 以上"
  );
}

export function renderSettingsEnvironmentOverview(
  viewModel: SettingsEnvironmentOverviewViewModel,
  options: SettingsEnvironmentOverviewOptions
): string {
  const { environmentScan } = viewModel;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  if (!environmentScan) {
    return `${viewModel.environmentScanError ? `<div class="service-status warning">${escape(viewModel.environmentScanError)}</div>` : ""}<div class="environment-empty">${viewModel.environmentScanning ? `<span class="scan-spinner"></span><div><strong>正在扫描本机环境与模型目录…</strong><p>检查命令、GPU、本地服务及所有模型组件。</p></div>` : `<div><strong>尚未扫描</strong><p>点击右上角“重新扫描”检查当前电脑。</p></div>`}</div>`;
  }
  return `
    ${viewModel.environmentScanError ? `<div class="service-status warning">${escape(viewModel.environmentScanError)}</div>` : ""}
    <div class="environment-summary">
      <div><span class="muted">当前用户目录</span><code title="${escape(environmentScan.userHome)}">${escape(environmentScan.userHome)}</code></div>
      <span class="scan-time">扫描于 ${escape(options.formatScanTime(environmentScan.scannedAt))}</span>
    </div>
    <div class="environment-grid">
      ${environmentScan.items.map((item) => `
        <article class="environment-item ${item.ok ? "available" : "missing"}">
          <span class="environment-state">${icon(item.ok ? "circle-check" : "circle-alert")}</span>
          <div>
            <div class="environment-item-heading">
              <div class="environment-name"><strong>${escape(item.label)}</strong>${item.optional ? `<span class="optional-tag">可选</span>` : ""}</div>
              ${item.id === "comfyui-api"
                ? item.ok
                  ? `<button class="service-start secondary button-with-icon" data-restart-service="comfy" ${viewModel.serviceStarting || viewModel.serviceRestarting || viewModel.serviceForceStopping ? "disabled" : ""}>${icon("refresh-cw")}${viewModel.serviceRestarting === "comfy" ? "重启中…最多等待 2 分钟" : "重启服务"}</button>`
                  : `<button class="service-start button-with-icon" data-start-service="comfy" ${viewModel.serviceStarting || viewModel.serviceRestarting || viewModel.serviceForceStopping ? "disabled" : ""}>${icon("play")}${viewModel.serviceStarting === "comfy" ? "启动中…最多等待 2 分钟" : "一键启动"}</button>`
                : ""}
            </div>
            <p>${escape(item.detail)}</p>
            ${item.path ? `<code title="${escape(item.path)}">${escape(item.path)}</code>` : ""}
          </div>
        </article>`).join("")}
    </div>
    ${viewModel.serviceStatusMessage ? `<div class="service-status ${viewModel.serviceStarting || viewModel.serviceRestarting ? "working" : ""}">${escape(viewModel.serviceStatusMessage)}</div>` : ""}
    ${environmentScan.comfyRoot || environmentScan.comfyInstallDirectory ? `
      <div class="detected-path">
        <div><span class="eyebrow">检测到 ComfyUI ${
          environmentScan.comfyInstallType === "desktop" ? "桌面版" :
          environmentScan.comfyInstallType === "portable" ? "便携版" :
          environmentScan.comfyInstallType === "manual" ? "手动安装" : "数据目录"
        }</span>
        <strong>${escape(environmentScan.comfyInstallDirectory || environmentScan.comfyRoot)}</strong>
        <p class="muted">核心源码：${escape(environmentScan.comfySourceDirectory || "未找到")}<br>数据目录：${escape(environmentScan.comfyRoot || "等待初始化")}<br>服务：${escape(environmentScan.comfyUrl)}<br>模型：${escape(environmentScan.modelDirectory || "等待初始化")}<br>输出：${escape(environmentScan.outputDirectory || "等待初始化")}</p></div>
        <button class="secondary button-with-icon" id="use-scanned-comfy">${icon("check")}采用这些路径</button>
      </div>` : ""}`;
}

export function renderSettingsEnvironmentIssuesPanel(
  viewModel: SettingsEnvironmentIssuesPanelViewModel,
  options: SettingsFragmentRenderOptions
): string {
  const issues = viewModel.environmentScan?.issues ?? [];
  if (!issues.length) return "";
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  return `
    <section class="panel settings-section environment-issues">
      <div class="section-heading"><div><h2>检测到的问题</h2><span class="muted">修复操作只针对已识别的问题，并保留执行日志或备份。</span></div><span class="model-badge">${issues.length} 项</span></div>
      <div class="issue-list">
        ${issues.map((issue) => `
          <article class="issue-card ${issue.severity}">
            <div>
              <strong>${escape(issue.label)}</strong>
              <p class="muted">${escape(issue.detail)}</p>
              ${viewModel.environmentRepairLogs[issue.id] ? `<details class="node-log" open><summary>修复日志</summary><pre>${escape(viewModel.environmentRepairLogs[issue.id])}</pre></details>` : ""}
            </div>
            ${issue.repairable ? `<button class="primary button-with-icon" data-repair-issue="${escape(issue.id)}" ${viewModel.environmentRepairing ? "disabled" : ""}>${icon(viewModel.environmentRepairing === issue.id ? "refresh-cw" : "shield-check")}${viewModel.environmentRepairing === issue.id ? "修复中…" : escape(issue.repairLabel)}</button>` : ""}
          </article>`).join("")}
      </div>
    </section>`;
}

export function renderSettingsComfyCompatibilityPanel(
  viewModel: SettingsComfyCompatibilityPanelViewModel,
  options: SettingsFragmentRenderOptions
): string {
  const compatibility = viewModel.environmentScan?.comfyCompatibility;
  if (!compatibility) return "";
  const selectedInstallation = viewModel.environmentScan?.comfyInstallations.find(
    (installation) => installation.selected
  ) ?? viewModel.environmentScan?.comfyInstallations[0];
  const versionLabel = compatibility.version
    ? `v${compatibility.version}`
    : "版本号未知";
  const ready = Boolean(compatibility.version || compatibility.revision || compatibility.checkedFrom);
  const versionMismatch = compatibility.checkedFrom === "api" &&
    Boolean(selectedInstallation?.version) &&
    Boolean(compatibility.version) &&
    selectedInstallation?.version !== compatibility.version;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  return `
    <section class="panel settings-section comfy-compatibility ${ready ? "available" : "missing"}">
      <div class="section-heading">
        <div>
          <h2>ComfyUI 核心版本</h2>
          <span class="muted">显示当前选择或当前已连接服务的核心信息</span>
        </div>
        <div class="compatibility-actions">
            <span class="model-availability ${ready ? "available" : "missing"}">${ready ? `${icon("circle-check")} 已识别` : `${icon("circle-help")} 等待启动服务`}</span>
          <button class="primary button-with-icon" id="update-comfyui" ${viewModel.comfyUpdating || compatibility.updateMode === "unsupported" ? "disabled" : ""}>${icon(viewModel.comfyUpdating ? "refresh-cw" : "download")}${viewModel.comfyUpdating ? "正在处理…" : compatibility.updateMode === "desktop" ? "打开官方更新器" : "手动更新 ComfyUI"}</button>
        </div>
      </div>
      <div class="compatibility-version">
        <div><span>Desktop 应用</span><strong>${escape(selectedInstallation?.desktopVersion ? `v${selectedInstallation.desktopVersion}` : selectedInstallation?.type === "desktop" ? "未读取到应用版本" : "不适用")}</strong></div>
        <div><span>所选目录本地核心</span><strong>${escape(selectedInstallation?.version ? `v${selectedInstallation.version}` : "未找到本地版本文件")}</strong></div>
        <div><span>当前连接服务核心</span><strong>${escape(compatibility.checkedFrom === "api" ? versionLabel : "服务未连接")}</strong></div>
        <div><span>核心提交</span><code>${escape(compatibility.revision || "未知")}</code></div>
        <div><span>检测来源</span><strong>${compatibility.checkedFrom === "api" ? "运行中服务 /object_info" : compatibility.checkedFrom === "source" ? "本地核心源码" : "等待启动服务"}</strong></div>
      </div>
      ${versionMismatch ? `<div class="service-status warning">当前连接服务是核心 ${escape(versionLabel)}，但所选目录的本地核心是 v${escape(selectedInstallation?.version ?? "未知")}；你可能连接到了另一个正在运行的 ComfyUI 实例。重启服务前请确认端口和安装目录。</div>` : ""}
      <p class="muted">${escape(compatibility.updateHint)}</p>
      ${viewModel.comfyUpdateLog ? `<details class="node-log" open><summary>更新日志</summary><pre>${escape(viewModel.comfyUpdateLog)}</pre></details>` : ""}
    </section>`;
}

export function renderSettingsModelScanCard(
  profile: ModelScanProfile,
  options: SettingsModelScanCardOptions
): string {
  const missingCount = profile.components.filter((component) => !component.found && !component.optional).length;
  const isPromptProfile = profile.category === "prompt";
  const isLlamaProfile = profile.managedBy === "llama-server";
  const isGemmaProfile = isPromptProfile && options.isGemmaPromptModel(profile.id);
  const runtimeUnavailable = profile.runtimeVerified === true && profile.runtimeReady === false;
  const hardwareRecommendation = modelHardwareRecommendation(profile);
  const loraInfoButton = profile.category === "lora"
    ? options.videoLoraInfoButton(profile.id)
    : "";
  const isReady = profile.category === "image"
    ? options.isImageWorkflowReady(profile)
    : profile.available && !runtimeUnavailable;
  const readyLabel = isPromptProfile
    ? "文件完整"
    : isReady
      ? "可用"
      : runtimeUnavailable
        ? "运行节点未就绪"
        : profile.category === "image"
          ? options.imageWorkflowStatus(profile)
          : "组件完整";
  const metaLabel = profile.available
    ? isPromptProfile
      ? isLlamaProfile
        ? "GGUF + mmproj 文件完整；由应用自管理 llama-server"
        : isGemmaProfile
          ? "LLM GGUF + mmproj 文件完整；通过 ComfyUI Prompt Writer 处理视频和图片提示词"
          : "ComfyUI text_encoders 文件完整；可通过原生 TextGenerate 进行本地扩写"
      : profile.category === "image"
        ? options.imageWorkflowStatus(profile)
        : runtimeUnavailable
          ? `缺少运行节点：${profile.runtimeMissingNodes?.join("、") || "请启动 ComfyUI 后重新扫描"}`
          : profile.integrated
            ? "组件完整，可用于配置"
            : "依赖已完整；生成工作流将在下一阶段接入"
    : isPromptProfile
      ? isLlamaProfile
        ? "补齐 GGUF + mmproj，并配置 llama-server.exe 后才能使用"
        : "补齐对应的 ComfyUI text_encoders 文件后才能接入本地扩写"
      : "补齐所有必需组件后才能启用";
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  return `
    <article class="panel model-profile ${isReady ? "available" : "missing"}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escape(profile.name)}</h3>${loraInfoButton}<span class="model-badge">${escape(profile.badge)}</span></div>
          <p class="muted">${escape(profile.description)}</p>
        </div>
        <span class="model-availability ${isReady ? "available" : "missing"}">${profile.available ? `${icon(isReady ? "circle-check" : "circle-alert")} ${escape(readyLabel)}` : `${icon("circle-alert")} 缺少 ${missingCount} 项`}</span>
      </div>
      <div class="model-meta-line"><span>资源 / 策略 · ${escape(profile.vram)}</span><span class="model-hardware-recommendation">推荐硬件 · ${escape(hardwareRecommendation)}</span><span>${metaLabel}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : component.optional ? "optional missing" : "missing"}">
            <span class="component-state">${icon(component.found ? "circle-check" : "circle-alert")}</span>
            <div><strong>${escape(component.label)}</strong>
              ${component.found
                ? `<code title="${escape(component.matches.join("\n"))}">${escape(component.matches.join(" · "))}</code>`
                : `<span>${component.optional ? "可选，4 步 Lightning 档需要：" : "缺失："}${escape(component.expected)}</span>`}
            </div>
            ${component.found ? "" : `<button class="component-info" data-install-profile="${escape(profile.id)}" data-install-component="${componentIndex}" aria-label="查看 ${escape(component.label)} 的下载和安装说明" title="查看下载和安装说明">${icon("info")}</button>`}
          </div>`).join("")}
      </div>
    </article>`;
}

export function renderSettingsInstallGuideDialog(
  viewModel: SettingsInstallGuideDialogViewModel,
  options: SettingsFragmentRenderOptions
): string {
  if (!viewModel.selectedInstallGuide) return "";
  const { profileName, component } = viewModel.selectedInstallGuide;
  const guide = component.installGuide;
  const escape = (value: string | number | null | undefined) => escapeValue(options, value);
  const icon = (name: string, className?: string) => options.icon(name, className);
  if (!guide) {
    return `
      <div class="dialog-backdrop" id="install-guide-backdrop">
        <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
          <div class="install-guide-head">
            <div><span class="eyebrow">${escape(profileName)}</span><h2 id="install-guide-title">${escape(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="关闭">${icon("x")}</button>
          </div>
          <div class="install-note"><strong>扫描数据需要刷新</strong><p>当前结果来自更新前的主进程。请关闭并重新启动应用，然后重新扫描环境。</p></div>
          <div class="dialog-actions"><button class="primary" id="dismiss-install-guide">知道了</button></div>
        </section>
      </div>`;
  }
  const targetDirectory = `${viewModel.configuredModelDirectory.replace(/[\\/]+$/, "")}\\${guide.targetSubdirectory.replaceAll("/", "\\")}`;
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1">
        <div class="install-guide-head">
          <div><span class="eyebrow">${escape(profileName)}</span><h2 id="install-guide-title">${escape(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="关闭">${icon("x")}</button>
        </div>
        <p class="muted">下载完成后，将文件放入下面的目录，再回到设置页重新扫描。</p>
        <div class="install-guide-fields">
          <div><span>下载来源</span><strong>${escape(guide.sourceLabel)}</strong></div>
          <div><span>推荐文件</span><code>${escape(guide.recommendedFilename)}</code></div>
          <div class="install-target"><span>应放目录</span><code>${escape(targetDirectory)}</code></div>
        </div>
        ${guide.notes ? `<div class="install-note"><strong>注意</strong><p>${escape(guide.notes)}</p></div>` : ""}
        <div class="dialog-actions">
          <button class="secondary" id="dismiss-install-guide">关闭</button>
          <button class="primary button-with-icon" id="open-install-download">打开下载页面${icon("external-link")}</button>
        </div>
      </section>
    </div>`;
}