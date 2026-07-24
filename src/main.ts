import "./style.css";
import type {
  AppState,
  BundledWorkflow,
  Draft,
  EnvironmentScanResult,
  LocalServiceKind,
  ModelComponentStatus,
  ModelScanProfile,
  PerformanceMetrics,
  PromptVersion,
  QueueTask,
  Settings
} from "./types";
import { createClearedDraft } from "./core/defaults";

type Page = "create" | "queue" | "history" | "history-detail" | "settings";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let page: Page = "create";
let draftSaveTimer: number | undefined;
let draftRevision = 0;
let draftSaveInFlight = 0;
let draftDirty = false;
let flashMessage = "";
let selectedHistoryAssetId = "";
let environmentScan: EnvironmentScanResult | null = null;
let environmentScanning = false;
let serviceStarting: LocalServiceKind | null = null;
let serviceRestarting: LocalServiceKind | null = null;
let serviceStatusMessage = "";
let environmentRepairing = "";
let environmentRepairLogs: Record<string, string> = {};
let customNodeInstalling = "";
let customNodeLogs: Record<string, string> = {};
let settingsDraft: Settings | null = null;
let settingsTab: "system" | "video" | "nodes" | "prompt" | "upscale" = "system";
let selectedInstallGuide: {
  profileName: string;
  component: ModelComponentStatus;
} | null = null;
const bundledWorkflows: Record<string, BundledWorkflow> = {};
const taskPreviews: Record<string, string> = {};
let performanceMetrics: PerformanceMetrics | null = null;
let performancePolling = false;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function activePrompt(draft = state.draft): PromptVersion {
  return (
    draft.promptVersions[draft.activePromptVersion] ??
    draft.promptVersions.at(-1) ?? {
      id: crypto.randomUUID(),
      label: "新建",
      text: "",
      createdAt: new Date().toISOString()
    }
  );
}

function modelName(id: string): string {
  return (
    {
      sulphur2: "Sulphur 2 FP8",
      wan22_5b: "Wan 2.2 I2V 5B",
      hunyuan15: "HunyuanVideo 1.5"
    }[id] ?? id
  );
}

function createModelOptions(draft: Draft): string {
  const scanned = environmentScan?.modelProfiles.filter(
    (profile) => profile.category === "video"
  );
  const profiles = scanned?.length
    ? scanned
    : [
        { id: "sulphur2", name: "Sulphur 2 FP8", available: true },
        { id: "wan22_5b", name: "Wan 2.2 I2V 5B", available: true },
        { id: "hunyuan15", name: "HunyuanVideo 1.5", available: true }
      ];
  return profiles
    .map(
      (profile) =>
        `<option value="${escapeHtml(profile.id)}" ${draft.modelId === profile.id ? "selected" : ""} ${!profile.available && draft.modelId !== profile.id ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`
    )
    .join("");
}

function shell(content: string): string {
  return `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-page="create" aria-label="返回创建页">
          <span class="brand-mark">▶</span><span>Local Video Studio</span>
        </button>
        <nav aria-label="主导航">
          ${(["create", "queue", "history", "settings"] as Array<Exclude<Page, "history-detail">>)
            .map((item) => {
              const labels = { create: "创建", queue: "队列", history: "历史", settings: "设置" };
              const badge = item === "queue" && state.queue.length
                ? `<span class="badge">${state.queue.length}</span>`
                : "";
              return `<button class="nav-button ${page === item ? "active" : ""}" data-page="${item}">${labels[item]}${badge}</button>`;
            })
            .join("")}
        </nav>
      </header>
      ${flashMessage ? `<div class="flash" role="status">${escapeHtml(flashMessage)}</div>` : ""}
      <main>${content}</main>
    </div>`;
}

async function imagePreview(filename: string, targetId: string): Promise<void> {
  if (!filename) return;
  const dataUrl = await window.studio.readImage(filename);
  const image = document.querySelector<HTMLImageElement>(`#${targetId}`);
  if (image && dataUrl) image.src = dataUrl;
}

function createPage(): string {
  const draft = state.draft;
  const prompt = activePrompt();
  return `
    <section class="page-heading">
      <div><h1>创建视频</h1><p>导入参考画面，调整提示词，然后加入本地生成队列。</p></div>
      <span class="save-state">自动保存</span>
    </section>
    <div class="create-workspace">
      <section class="panel media-panel">
      <div class="section-heading">
        <div><h2>参考画面</h2><span class="muted">支持单张首帧和可选尾帧</span></div>
        <button class="secondary" id="toggle-end">${draft.endImagePath ? "移除尾帧" : "添加尾帧"}</button>
      </div>
      <div class="media-grid ${draft.endImagePath ? "paired" : ""}">
        <button class="drop-zone ${draft.startImagePath ? "has-image" : ""}" id="pick-start">
          ${draft.startImagePath
            ? `<img id="start-preview" alt="首帧预览"><span class="image-label">更换首帧</span>`
            : `<span class="drop-icon">＋</span><strong>选择首帧图片</strong><span>PNG、JPG、WEBP</span>`}
        </button>
        ${draft.endImagePath
          ? `<button class="drop-zone has-image" id="pick-end"><img id="end-preview" alt="尾帧预览"><span class="image-label">更换尾帧</span></button>`
          : ""}
      </div>
      </section>
      <section class="panel composer">
      <div class="section-heading">
        <div>
          <h2>提示词</h2>
          <span class="muted">${draft.activePromptVersion + 1} / ${draft.promptVersions.length} · ${escapeHtml(prompt.label)}</span>
        </div>
        <div class="button-row">
          <button class="icon-button" id="prompt-prev" ${draft.activePromptVersion === 0 ? "disabled" : ""}>←</button>
          <button class="icon-button" id="prompt-next" ${draft.activePromptVersion >= draft.promptVersions.length - 1 ? "disabled" : ""}>→</button>
          <button class="secondary" id="enhance-prompt">✨ 本地扩写</button>
        </div>
      </div>
      <textarea id="prompt-input" rows="6">${escapeHtml(prompt.text)}</textarea>
      <div class="settings-grid">
        <label>模型
          <select id="model">
            ${createModelOptions(draft)}
          </select>
        </label>
        <label>画面比例
          <select id="ratio">
            ${["source", "16:9", "9:16", "1:1", "4:3"].map((ratio) =>
              `<option value="${ratio}" ${draft.ratio === ratio ? "selected" : ""}>${ratio === "source" ? "原图（未读取时按 16:9）" : ratio}</option>`
            ).join("")}
          </select>
        </label>
        <label>清晰度
          <select id="resolution">
            ${[480, 540, 720].map((value) =>
              `<option value="${value}" ${draft.resolution === value ? "selected" : ""}>${value}p</option>`
            ).join("")}
          </select>
        </label>
        <label>时长
          <div class="inline-field"><input id="duration" type="range" min="1" max="30" value="${draft.duration}"><input id="duration-number" type="number" min="1" max="60" value="${draft.duration}"><span>秒</span></div>
        </label>
        <label>每秒帧数（FPS）
          <select id="fps">
            ${[8, 12, 16, 24, 25, 30].map((value) =>
              `<option value="${value}" ${draft.fps === value ? "selected" : ""}>${value} FPS${value === 8 ? " · 诊断模式" : value === 24 ? " · Wan 原生推荐" : value === 30 ? " · 压力最高" : ""}</option>`
            ).join("")}
          </select>
        </label>
        <label>动作幅度
          <select id="motion">
            <option value="subtle" ${draft.motion === "subtle" ? "selected" : ""}>轻微</option>
            <option value="natural" ${draft.motion === "natural" ? "selected" : ""}>自然</option>
            <option value="strong" ${draft.motion === "strong" ? "selected" : ""}>强烈</option>
          </select>
        </label>
        <label>随机 Seed
          <input id="seed" type="number" placeholder="留空则随机" value="${draft.seed ?? ""}">
        </label>
        <label class="checkbox-field"><input id="keep-seed" type="checkbox" ${draft.keepSeedOnCopy ? "checked" : ""}><span>复制任务时保留 Seed</span></label>
      </div>
      <div class="workflow-field">
        <div><strong>ComfyUI API 工作流</strong><p class="muted">${draft.workflowPath ? escapeHtml(bundledWorkflows[draft.modelId]?.path === draft.workflowPath ? bundledWorkflows[draft.modelId]!.label : draft.workflowPath) : "为当前模型选择从 ComfyUI 导出的 API 格式 JSON"}</p></div>
        <button class="secondary" id="pick-workflow">${draft.workflowPath ? "更换 JSON" : "选择 JSON"}</button>
      </div>
      <div class="submit-row">
        <button class="ghost danger" id="clear-draft">清空</button>
        <button class="primary" id="enqueue">加入队列</button>
      </div>
      </section>
    </div>`;
}

function queuePage(): string {
  const running = state.queue.find((task) => task.status === "running");
  return `
    <section class="page-heading">
      <div><h1>生成队列</h1><p>${state.queue.length} 项任务 · ${running ? "当前任务已在队列内展开" : state.queueRunning ? "准备执行" : "当前已暂停"}</p></div>
      <div class="button-row">
        <button class="secondary" id="optimize-queue" ${state.queue.filter((task) => task.status === "waiting").length < 2 ? "disabled" : ""}>按模型优化顺序</button>
        ${running ? `<span class="queue-mode">${state.queueRunning ? "自动继续后续任务" : "本条完成后暂停"}</span>` : `<button class="primary" id="start-queue" ${state.queue.some((task) => task.status === "waiting") ? "" : "disabled"}>开始队列</button>`}
      </div>
    </section>
    <section class="performance-grid" aria-label="性能监测">
      ${performanceCard("CPU", "metric-cpu", performanceMetrics?.cpuPercent, "%")}
      ${performanceCard("系统内存", "metric-memory", performanceMetrics ? performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100 : null, "%", performanceMetrics ? `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}` : "")}
      ${performanceCard("GPU", "metric-gpu", performanceMetrics?.gpuPercent, "%", performanceMetrics?.gpuTemperature != null ? `${performanceMetrics.gpuTemperature}°C` : "")}
      ${performanceCard("显存", "metric-vram", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes ? performanceMetrics.vramUsedBytes / performanceMetrics.vramTotalBytes * 100 : null, "%", performanceMetrics?.vramUsedBytes != null && performanceMetrics.vramTotalBytes != null ? `${formatBytes(performanceMetrics.vramUsedBytes)} / ${formatBytes(performanceMetrics.vramTotalBytes)}` : "")}
    </section>
    <section class="task-list">
      ${state.queue.length === 0
        ? `<div class="empty panel"><h2>队列还是空的</h2><p>从创建页加入一个任务后，就可以在这里运行。</p><button class="secondary" data-page="create">去创建</button></div>`
        : state.queue.map(queueTaskCard).join("")}
    </section>`;
}

function queueTaskCard(task: QueueTask): string {
  if (task.status === "running") {
    const preview = taskPreviews[task.id] ?? "";
    return `
      <article class="task-card panel running expanded">
        <div class="expanded-task-head">
          <div><span class="status running">正在运行</span><h3>${escapeHtml(task.outputFilename)}</h3></div>
          <strong id="running-progress-label">${Math.round(task.progress ?? 0)}%</strong>
        </div>
        <div class="running-layout">
          <div class="live-preview">
            <img id="live-preview-image" alt="ComfyUI 实时预览" src="${preview ? escapeHtml(preview) : ""}" style="${preview ? "" : "display:none"}">
            <div id="live-preview-empty" style="${preview ? "display:none" : ""}"><span>◫</span><strong>等待 ComfyUI 预览帧</strong><small>部分节点只会在采样过程中发送预览</small></div>
          </div>
          <div class="running-copy">
            <span class="eyebrow">当前步骤 · <span id="running-stage">${escapeHtml(task.stage ?? "准备中")}</span></span>
            <div class="progress"><span id="running-progress-bar" style="width:${task.progress ?? 0}%"></span></div>
            <p>${escapeHtml(task.prompt)}</p>
            <div class="task-meta"><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${task.duration}秒</span><span>${task.fps} FPS</span><span id="running-elapsed">${elapsedText(task.startedAt)}</span></div>
            <div class="running-controls">
              <button class="secondary" id="${state.queueRunning ? "pause-queue" : "start-queue"}">${state.queueRunning ? "本条完成后暂停" : "继续执行后续任务"}</button>
              <button class="danger secondary" data-cancel="${task.id}">取消当前任务</button>
            </div>
            <p class="control-hint">${state.queueRunning ? "暂停不会冻结当前 GPU 计算；当前任务完成后不会启动下一条。" : "当前任务仍会继续运行，后续任务已暂停。"}</p>
          </div>
        </div>
      </article>`;
  }
  return `
    <article class="task-card panel ${task.status}">
      <div class="task-main">
        <div><span class="status ${task.status}">${statusLabel(task.status)}</span><h3>${escapeHtml(task.outputFilename)}</h3></div>
        <p>${escapeHtml(task.prompt)}</p>
        <div class="task-meta"><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${task.duration}秒</span><span>${task.fps} FPS</span><span>Seed ${task.seed}</span></div>
        ${task.error ? `<p class="error">${escapeHtml(task.error)}</p>` : ""}
      </div>
      <div class="task-actions">
        ${task.status === "waiting" ? `<div class="button-row"><button class="icon-button" data-move="${task.id}" data-direction="-1" title="上移">↑</button><button class="icon-button" data-move="${task.id}" data-direction="1" title="下移">↓</button></div>` : ""}
        <button class="secondary" data-duplicate="${task.id}">复制</button>
        ${task.status === "failed" || task.status === "cancelled" ? `<button class="secondary" data-retry="${task.id}">重试</button>` : ""}
        <button class="ghost danger" data-remove="${task.id}">移除</button>
      </div>
    </article>`;
}

function statusLabel(status: string): string {
  return { waiting: "等待", running: "运行中", completed: "完成", failed: "失败", cancelled: "已取消" }[status] ?? status;
}

function historyPage(): string {
  return `
    <section class="page-heading"><div><h1>历史作品</h1><p>成功完成的视频会保留完整的生成快照。</p></div></section>
    <section class="history-grid">
      ${state.history.length === 0
        ? `<div class="empty panel"><h2>还没有完成的视频</h2><p>队列完成后，结果会自动出现在这里。</p></div>`
        : state.history.map((asset) => `
          <article class="history-card panel" data-history="${asset.id}" tabindex="0">
            <div class="video-placeholder">▶</div>
            <div class="history-copy"><h3>${escapeHtml(asset.title)}</h3><code>${escapeHtml(asset.outputFilename)}</code><p>${escapeHtml(asset.prompt)}</p><div class="task-meta"><span>${escapeHtml(modelName(asset.modelId))}</span><span>${asset.resolution}p</span><span>${asset.duration}秒</span><span>Seed ${asset.seed}</span></div></div>
          </article>`).join("")}
    </section>`;
}

function historyDetailPage(): string {
  const asset = state.history.find((item) => item.id === selectedHistoryAssetId);
  if (!asset) {
    page = "history";
    return historyPage();
  }
  return `
    <section class="page-heading"><div><button class="ghost back-button" data-page="history">← 返回历史</button><h1>${escapeHtml(asset.title)}</h1><p>${escapeHtml(asset.outputFilename)}</p></div></section>
    <section class="panel history-detail">
      <div class="video-placeholder large">▶</div>
      <div class="detail-grid">
        <div><span class="muted">提示词</span><p>${escapeHtml(asset.prompt)}</p></div>
        <div><span class="muted">生成参数</span><p>${escapeHtml(modelName(asset.modelId))} · ${asset.resolution}p · ${asset.duration}秒 · Seed ${asset.seed}</p></div>
        <div><span class="muted">ComfyUI Prompt ID</span><p><code>${escapeHtml(asset.comfyPromptId)}</code></p></div>
      </div>
      <h2>输出文件</h2>
      <div class="output-files">
        ${asset.files.length === 0
          ? `<p class="muted">ComfyUI 返回中没有识别到文件。需要在本地保存一份 history 响应，用于补充该工作流的输出结构。</p>`
          : asset.files.map((file) => `<div class="output-file"><div><strong>${escapeHtml(file.filename)}</strong><p class="muted">${escapeHtml(file.subfolder || ".")} · ${escapeHtml(file.type)}</p></div>${file.absolutePath ? `<button class="secondary" data-show-file="${escapeHtml(file.absolutePath)}">在 Explorer 中显示</button>` : `<span class="muted">请先在设置中填写 ComfyUI 输出目录</span>`}</div>`).join("")}
      </div>
      <details><summary>原始 ComfyUI 输出快照</summary><pre>${escapeHtml(JSON.stringify(asset.comfyOutputs, null, 2))}</pre></details>
    </section>`;
}

function modelScanCard(profile: ModelScanProfile): string {
  const missingCount = profile.components.filter((component) => !component.found).length;
  return `
    <article class="panel model-profile ${profile.available ? "available" : "missing"}">
      <div class="model-profile-head">
        <div>
          <div class="model-title"><h3>${escapeHtml(profile.name)}</h3><span class="model-badge">${escapeHtml(profile.badge)}</span></div>
          <p class="muted">${escapeHtml(profile.description)}</p>
        </div>
        <span class="model-availability ${profile.available ? "available" : "missing"}">${profile.available ? "✓ 可用" : `缺少 ${missingCount} 项`}</span>
      </div>
      <div class="model-meta-line"><span>${escapeHtml(profile.vram)}</span><span>${profile.available ? "组件完整，可用于配置" : "补齐所有必需组件后才能启用"}</span></div>
      <div class="component-list">
        ${profile.components.map((component, componentIndex) => `
          <div class="component-row ${component.found ? "found" : "missing"}">
            <span class="component-state">${component.found ? "✓" : "!"}</span>
            <div><strong>${escapeHtml(component.label)}</strong>
              ${component.found
                ? `<code title="${escapeHtml(component.matches.join("\n"))}">${escapeHtml(component.matches.join(" · "))}</code>`
                : `<span>缺失：${escapeHtml(component.expected)}</span>`}
            </div>
            ${component.found ? "" : `<button class="component-info" data-install-profile="${escapeHtml(profile.id)}" data-install-component="${componentIndex}" aria-label="查看 ${escapeHtml(component.label)} 的下载和安装说明" title="查看下载和安装说明">i</button>`}
          </div>`).join("")}
      </div>
    </article>`;
}

function installGuideDialog(): string {
  if (!selectedInstallGuide) return "";
  const { profileName, component } = selectedInstallGuide;
  const guide = component.installGuide;
  if (!guide) {
    return `
      <div class="dialog-backdrop" id="install-guide-backdrop">
        <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
          <div class="install-guide-head">
            <div><span class="eyebrow">${escapeHtml(profileName)}</span><h2 id="install-guide-title">${escapeHtml(component.label)}</h2></div>
            <button class="dialog-close" id="close-install-guide" aria-label="关闭">×</button>
          </div>
          <div class="install-note"><strong>扫描数据需要刷新</strong><p>当前结果来自更新前的主进程。请关闭并重新启动应用，然后重新扫描环境。</p></div>
          <div class="dialog-actions"><button class="primary" id="dismiss-install-guide">知道了</button></div>
        </section>
      </div>`;
  }
  const configuredModelDirectory =
    environmentScan?.modelDirectory ||
    settingsDraft?.modelDirectory ||
    state.settings.modelDirectory ||
    "ComfyUI\\models";
  const targetDirectory = `${configuredModelDirectory.replace(/[\\/]+$/, "")}\\${guide.targetSubdirectory}`;
  return `
    <div class="dialog-backdrop" id="install-guide-backdrop">
      <section class="install-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
        <div class="install-guide-head">
          <div><span class="eyebrow">${escapeHtml(profileName)}</span><h2 id="install-guide-title">${escapeHtml(component.label)}</h2></div>
          <button class="dialog-close" id="close-install-guide" aria-label="关闭">×</button>
        </div>
        <p class="muted">下载完成后，将文件放入下面的目录，再回到设置页重新扫描。</p>
        <div class="install-guide-fields">
          <div><span>下载来源</span><strong>${escapeHtml(guide.sourceLabel)}</strong></div>
          <div><span>推荐文件</span><code>${escapeHtml(guide.recommendedFilename)}</code></div>
          <div class="install-target"><span>应放目录</span><code>${escapeHtml(targetDirectory)}</code></div>
        </div>
        ${guide.notes ? `<div class="install-note"><strong>注意</strong><p>${escapeHtml(guide.notes)}</p></div>` : ""}
        <div class="dialog-actions">
          <button class="secondary" id="dismiss-install-guide">关闭</button>
          <button class="primary" id="open-install-download">打开下载页面 ↗</button>
        </div>
      </section>
    </div>`;
}

function environmentOverview(): string {
  if (!environmentScan) {
    return `<div class="environment-empty">${environmentScanning ? `<span class="scan-spinner"></span><div><strong>正在扫描本机环境与模型目录…</strong><p>检查命令、GPU、本地服务及所有模型组件。</p></div>` : `<div><strong>尚未扫描</strong><p>点击右上角“重新扫描”检查当前电脑。</p></div>`}</div>`;
  }
  return `
    <div class="environment-summary">
      <div><span class="muted">当前用户目录</span><code title="${escapeHtml(environmentScan.userHome)}">${escapeHtml(environmentScan.userHome)}</code></div>
      <span class="scan-time">扫描于 ${new Date(environmentScan.scannedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <div class="environment-grid">
      ${environmentScan.items.map((item) => `
        <article class="environment-item ${item.ok ? "available" : "missing"}">
          <span class="environment-state">${item.ok ? "✓" : "!"}</span>
          <div>
            <div class="environment-item-heading">
              <div class="environment-name"><strong>${escapeHtml(item.label)}</strong>${item.optional ? `<span class="optional-tag">可选</span>` : ""}</div>
              ${item.id === "comfyui-api"
                ? item.ok
                  ? `<button class="service-start secondary" data-restart-service="comfy" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${serviceRestarting === "comfy" ? "重启中…最多等待 2 分钟" : "重启服务"}</button>`
                  : `<button class="service-start" data-start-service="comfy" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${serviceStarting === "comfy" ? "启动中…最多等待 2 分钟" : "一键启动"}</button>`
                : !item.ok && item.id === "lmstudio-api"
                  ? `<button class="service-start" data-start-service="lmstudio" ${serviceStarting || serviceRestarting ? "disabled" : ""}>${serviceStarting === "lmstudio" ? "启动中…" : "一键启动"}</button>`
                  : ""}
            </div>
            <p>${escapeHtml(item.detail)}</p>
            ${item.path ? `<code title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</code>` : ""}
          </div>
        </article>`).join("")}
    </div>
    ${serviceStatusMessage ? `<div class="service-status ${serviceStarting || serviceRestarting ? "working" : ""}">${escapeHtml(serviceStatusMessage)}</div>` : ""}
    ${environmentScan.comfyRoot || environmentScan.comfyInstallDirectory ? `
      <div class="detected-path">
        <div><span class="eyebrow">检测到 ComfyUI ${
          environmentScan.comfyInstallType === "desktop" ? "桌面版" :
          environmentScan.comfyInstallType === "portable" ? "便携版" :
          environmentScan.comfyInstallType === "manual" ? "手动安装" : "数据目录"
        }</span>
        <strong>${escapeHtml(environmentScan.comfyInstallDirectory || environmentScan.comfyRoot)}</strong>
        <p class="muted">核心源码：${escapeHtml(environmentScan.comfySourceDirectory || "未找到")}<br>数据目录：${escapeHtml(environmentScan.comfyRoot || "等待初始化")}<br>服务：${escapeHtml(environmentScan.comfyUrl)}<br>模型：${escapeHtml(environmentScan.modelDirectory || "等待初始化")}<br>输出：${escapeHtml(environmentScan.outputDirectory || "等待初始化")}</p></div>
        <button class="secondary" id="use-scanned-comfy">采用这些路径</button>
      </div>` : ""}`;
}

function environmentIssuesPanel(): string {
  const issues = environmentScan?.issues ?? [];
  if (!issues.length) return "";
  return `
    <section class="panel settings-section environment-issues">
      <div class="section-heading"><div><h2>检测到的问题</h2><span class="muted">修复操作只针对已识别的问题，并保留执行日志或备份。</span></div><span class="model-badge">${issues.length} 项</span></div>
      <div class="issue-list">
        ${issues.map((issue) => `
          <article class="issue-card ${issue.severity}">
            <div>
              <strong>${escapeHtml(issue.label)}</strong>
              <p class="muted">${escapeHtml(issue.detail)}</p>
              ${environmentRepairLogs[issue.id] ? `<details class="node-log" open><summary>修复日志</summary><pre>${escapeHtml(environmentRepairLogs[issue.id])}</pre></details>` : ""}
            </div>
            ${issue.repairable ? `<button class="primary" data-repair-issue="${escapeHtml(issue.id)}" ${environmentRepairing ? "disabled" : ""}>${environmentRepairing === issue.id ? "修复中…" : escapeHtml(issue.repairLabel)}</button>` : ""}
          </article>`).join("")}
      </div>
    </section>`;
}

function settingsPage(): string {
  const settings = settingsDraft ?? state.settings;
  const profiles = environmentScan?.modelProfiles ?? [];
  const videoProfiles = profiles.filter((profile) => profile.category === "video");
  const upscaleProfiles = profiles.filter((profile) => profile.category === "upscale");
  const videoAvailable = videoProfiles.filter((profile) => profile.available).length;
  const upscaleAvailable = upscaleProfiles.filter((profile) => profile.available).length;
  const gpu = environmentScan?.items.find((item) => item.id === "nvidia");

  const systemPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>本机环境</h2><span class="muted">必需组件、可选工具和本地服务状态</span></div></div>
        ${environmentOverview()}
      </section>
      ${environmentIssuesPanel()}
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>ComfyUI 连接</h2><span class="muted">连接运行中的 ComfyUI API</span></div><button class="secondary" data-test="comfy">测试连接</button></div>
        <label>服务地址<input id="comfy-url" value="${escapeHtml(settings.comfyUrl)}"></label>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>文件路径</h2><span class="muted">扫描结果可以一键写入，也可以手动定位</span></div></div>
        <div class="settings-grid two">
          <label>ComfyUI 模型目录<div class="input-action"><input id="model-directory" value="${escapeHtml(settings.modelDirectory)}" placeholder="扫描或选择 models 目录"><button class="secondary" id="pick-model-directory">选择</button></div></label>
          <label>视频输出目录<div class="input-action"><input id="output-directory" value="${escapeHtml(settings.outputDirectory)}" placeholder="扫描或选择 output 目录"><button class="secondary" id="pick-output-directory">选择</button></div></label>
        </div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>下载代理</h2><span class="muted">用于自动下载缺失的节点、Python 依赖和工作流；不会影响 ComfyUI 本地连接。</span></div><span class="model-badge">${settings.proxyEnabled ? "已开启" : "已关闭"}</span></div>
        <div class="settings-grid two">
          <label class="switch-field"><input id="proxy-enabled" type="checkbox" ${settings.proxyEnabled ? "checked" : ""}><span>启用下载代理</span></label>
          <label>代理地址<input id="proxy-url" value="${escapeHtml(settings.proxyUrl)}" placeholder="http://127.0.0.1:7890"></label>
        </div>
        <p class="muted proxy-hint">默认关闭。开启后 Git 和 pip 下载使用此地址；可填写 <code>127.0.0.1:7890</code> 或完整代理 URL。</p>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>RTX 4090 运行策略</h2><span class="muted">${gpu?.ok ? escapeHtml(gpu.detail) : "未检测到 NVIDIA GPU"}</span></div><span class="model-badge">推荐预设</span></div>
        <div class="settings-grid two">
          <label>显存安全余量<select id="vram-reserve"><option value="1" ${settings.vramReserveGb === 1 ? "selected" : ""}>1 GB · 更快</option><option value="2" ${settings.vramReserveGb === 2 ? "selected" : ""}>2 GB · 推荐</option><option value="4" ${settings.vramReserveGb === 4 ? "selected" : ""}>4 GB · 保守</option></select></label>
          <label>同时运行任务<select disabled><option>1 · 推荐</option><option>2 · 可能爆显存</option></select></label>
          <label class="switch-field"><input id="auto-offload" type="checkbox" ${settings.autoOffload ? "checked" : ""}><span>自动 CPU 卸载与分块</span></label>
          <label class="switch-field"><input id="safe-cancel" type="checkbox" ${settings.safeCancel ? "checked" : ""}><span>取消时保留可播放片段</span></label>
          <label class="switch-field"><input id="optimize-queue-setting" type="checkbox" ${settings.optimizeQueue ? "checked" : ""}><span>允许一键优化模型顺序</span></label>
          <label class="switch-field"><input type="checkbox" checked disabled><span>持久保存队列和历史</span></label>
        </div>
      </section>
    </section>`;

  const videoPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading">
          <div><h2>视频模型</h2><span class="muted">根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。</span></div>
          <label class="compact-label">默认模型<select id="default-video-model">
            ${(videoProfiles.length ? videoProfiles : [
              { id: "sulphur2", name: "Sulphur 2 FP8", available: false },
              { id: "wan22_5b", name: "Wan 2.2 I2V 5B", available: false },
              { id: "hunyuan15", name: "HunyuanVideo 1.5 I2V", available: false }
            ]).map((profile) => `<option value="${profile.id}" ${settings.defaultVideoModel === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}
          </select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${videoAvailable} 个可运行模型，${videoProfiles.length - videoAvailable} 个待补齐` : "等待首次扫描"}</div>
      </section>
      <div class="model-profile-list">${videoProfiles.length ? videoProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
    </section>`;

  const promptPanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>LM Studio</h2><span class="muted">本地提示词扩写服务</span></div><button class="secondary" data-test="lmstudio">测试并读取模型</button></div>
        <div class="settings-grid two">
          <label>OpenAI API 地址<input id="lm-url" value="${escapeHtml(settings.lmStudioUrl)}"></label>
          <label>模型 ID<input id="lm-model" value="${escapeHtml(settings.lmStudioModel)}" placeholder="留空使用当前加载模型"></label>
          <label>扩写语言<select id="prompt-language"><option value="auto" ${settings.promptLanguage === "auto" ? "selected" : ""}>跟随输入语言</option><option value="zh" ${settings.promptLanguage === "zh" ? "selected" : ""}>中文</option><option value="en" ${settings.promptLanguage === "en" ? "selected" : ""}>英文</option></select></label>
          <label>创造性<select id="prompt-creativity"><option value="0.3" ${settings.promptCreativity === 0.3 ? "selected" : ""}>克制 · 0.3</option><option value="0.7" ${settings.promptCreativity === 0.7 ? "selected" : ""}>平衡 · 0.7</option><option value="1" ${settings.promptCreativity === 1 ? "selected" : ""}>丰富 · 1.0</option></select></label>
        </div>
        <div id="connection-result" class="connection-result muted">尚未单独测试连接</div>
      </section>
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>提示词模板</h2><span class="muted">创建页的“本地扩写”使用</span></div></div>
        <label>系统模板<textarea id="prompt-template" rows="7">${escapeHtml(settings.promptSystemTemplate)}</textarea></label>
      </section>
      <section class="panel settings-section">
        <h2>工作流占位符</h2><p class="muted">ComfyUI API JSON 提交前会递归替换：</p>
        <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "WIDTH", "HEIGHT", "DURATION", "FPS", "FRAMES", "OUTPUT_FILENAME"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
      </section>
    </section>`;

  const upscalePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>分辨率提升模型</h2><span class="muted">只有组件完整的模型才能进入后续提升工作流。</span></div>
          <label class="compact-label">默认模型<select id="default-upscale-model">${upscaleProfiles.map((profile) => `<option value="${profile.id}" ${settings.defaultUpscaleModel === profile.id ? "selected" : ""} ${!profile.available ? "disabled" : ""}>${escapeHtml(profile.name)}${profile.available ? "" : " · 缺组件"}</option>`).join("")}</select></label>
        </div>
        <div class="scan-result">${environmentScanning ? "正在扫描模型目录…" : environmentScan ? `找到 ${upscaleAvailable} 个可运行模型，${upscaleProfiles.length - upscaleAvailable} 个待补齐` : "等待首次扫描"}</div>
      </section>
      <div class="model-profile-list">${upscaleProfiles.length ? upscaleProfiles.map(modelScanCard).join("") : `<div class="panel environment-empty">尚无模型扫描结果</div>`}</div>
    </section>`;

  const nodeInstalled = environmentScan?.customNodes.filter(
    (node) => node.installed && !node.loadError
  ).length ?? 0;
  const nodePanel = `
    <section class="settings-panel">
      <section class="panel settings-section">
        <div class="section-heading"><div><h2>节点与工作流依赖</h2><span class="muted">换电脑后按项目清单复现 ComfyUI 节点环境</span></div><span class="model-badge">${nodeInstalled}/${environmentScan?.customNodes.length ?? 0} 可用</span></div>
        <div class="scan-result">安装只使用项目内置仓库清单；完成后重启 ComfyUI，再重新扫描。</div>
      </section>
      <div class="model-profile-list">
        ${(environmentScan?.customNodes ?? []).map((node) => `
          <article class="panel custom-node-card ${node.installed && !node.loadError ? "available" : "missing"}">
            <div class="custom-node-copy">
              <div class="model-title"><h3>${escapeHtml(node.name)}</h3><span class="model-badge">${node.required ? "项目必需" : "可选"}</span></div>
              <p>${escapeHtml(node.purpose)}</p>
              <code>${escapeHtml(node.directory || node.repositoryUrl)}</code>
              ${node.loadError ? `<span class="node-error">${escapeHtml(node.loadError)}</span>` : ""}
              ${customNodeLogs[node.id] ? `<details class="node-log" open><summary>安装日志</summary><pre>${escapeHtml(customNodeLogs[node.id])}</pre></details>` : ""}
            </div>
            <div class="custom-node-actions">
              <span class="model-availability ${node.installed && !node.loadError ? "available" : "missing"}">${node.installed && !node.loadError ? "✓ 已加载" : node.loadError ? "加载失败" : "未安装"}</span>
              ${node.installed && !node.loadError ? "" : `<button class="primary" data-install-node="${escapeHtml(node.id)}" ${customNodeInstalling ? "disabled" : ""}>${customNodeInstalling === node.id ? "处理中…" : node.installed ? "修复/更新" : "安装"}</button>`}
            </div>
          </article>`).join("") || `<div class="panel environment-empty">等待环境扫描结果</div>`}
      </div>
    </section>`;

  const activePanel =
    settingsTab === "system" ? systemPanel :
    settingsTab === "video" ? videoPanel :
    settingsTab === "nodes" ? nodePanel :
    settingsTab === "prompt" ? promptPanel :
    upscalePanel;

  return `
    <section class="page-heading settings-heading">
      <div><div class="heading-line"><h1>设置</h1>${gpu?.ok ? `<span class="model-badge">${escapeHtml(gpu.detail.split(",").slice(0, 1).join(""))}</span>` : ""}</div><p>模型扫描、4090 运行预设和本地服务集中配置。</p></div>
      <div class="button-row"><button class="secondary" id="scan-environment" ${environmentScanning ? "disabled" : ""}>${environmentScanning ? "扫描中…" : "重新扫描全部"}</button><button class="primary" id="save-settings">保存设置</button></div>
    </section>
    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="设置分类">
        ${([
          ["system", "◫", "系统与路径"],
          ["video", "▦", "视频模型"],
          ["nodes", "◇", "节点与工作流"],
          ["prompt", "✦", "提示词扩写"],
          ["upscale", "↗", "分辨率提升"]
        ] as const).map(([id, icon, label]) => `<button class="settings-tab ${settingsTab === id ? "active" : ""}" data-settings-tab="${id}"><span>${icon}</span>${label}${id === "video" && environmentScan ? `<small>${videoAvailable}/${videoProfiles.length}</small>` : ""}${id === "nodes" && environmentScan ? `<small>${nodeInstalled}/${environmentScan.customNodes.length}</small>` : ""}${id === "upscale" && environmentScan ? `<small>${upscaleAvailable}/${upscaleProfiles.length}</small>` : ""}</button>`).join("")}
      </nav>
      <div class="settings-content">${activePanel}</div>
    </div>
    ${installGuideDialog()}`;
}

function render(): void {
  const content =
    page === "create" ? createPage() :
    page === "queue" ? queuePage() :
    page === "history" ? historyPage() :
    page === "history-detail" ? historyDetailPage() :
    settingsPage();
  appElement.innerHTML = shell(content);
  bindShell();
  if (page === "create") {
    bindCreate();
    void imagePreview(state.draft.startImagePath, "start-preview");
    void imagePreview(state.draft.endImagePath, "end-preview");
  } else if (page === "queue") bindQueue();
  else if (page === "history" || page === "history-detail") bindHistory();
  else if (page === "settings") bindSettings();
}

function showMessage(message: string): void {
  flashMessage = message;
  render();
  window.setTimeout(() => {
    if (flashMessage === message) {
      flashMessage = "";
      render();
    }
  }, 3500);
}

function bindShell(): void {
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      page = button.dataset.page as Page;
      flashMessage = "";
      render();
    });
  });
}

function scheduleDraftSave(): void {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(async () => {
    const revision = draftRevision;
    const draftToSave = state.draft;
    draftSaveInFlight += 1;
    try {
      const savedState = await window.studio.saveDraft(draftToSave);
      const localDraft = state.draft;
      state = { ...savedState, draft: localDraft };
      if (revision === draftRevision) draftDirty = false;
    } finally {
      draftSaveInFlight -= 1;
    }
  }, 350);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function elapsedText(startedAt?: string): string {
  if (!startedAt) return "等待计时";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `已运行 ${minutes > 0 ? `${minutes}分` : ""}${seconds % 60}秒`;
}

function performanceCard(
  label: string,
  id: string,
  value: number | null | undefined,
  suffix: string,
  detail = ""
): string {
  const normalized = value == null ? 0 : Math.max(0, Math.min(100, value));
  return `<article class="panel performance-card"><span>${label}</span><strong id="${id}">${value == null ? "—" : `${Math.round(value)}${suffix}`}</strong><small id="${id}-detail">${escapeHtml(detail)}</small><div class="metric-bar"><i id="${id}-bar" style="width:${normalized}%"></i></div></article>`;
}

function patchDraft(patch: Partial<Draft>): void {
  state.draft = { ...state.draft, ...patch };
  draftRevision += 1;
  draftDirty = true;
  scheduleDraftSave();
}

function bindCreate(): void {
  document.querySelector("#pick-start")?.addEventListener("click", async () => {
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ startImagePath: filename });
      render();
    }
  });
  document.querySelector("#pick-end")?.addEventListener("click", async () => {
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ endImagePath: filename });
      render();
    }
  });
  document.querySelector("#toggle-end")?.addEventListener("click", async () => {
    if (state.draft.endImagePath) {
      patchDraft({ endImagePath: "" });
      render();
      return;
    }
    const filename = await window.studio.pickImage();
    if (filename) {
      patchDraft({ endImagePath: filename });
      render();
    }
  });
  document.querySelector("#pick-workflow")?.addEventListener("click", async () => {
    const filename = await window.studio.pickWorkflow();
    if (filename) {
      patchDraft({ workflowPath: filename });
      render();
    }
  });
  const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt-input");
  promptInput?.addEventListener("input", () => {
    const versions = [...state.draft.promptVersions];
    const current = versions[state.draft.activePromptVersion];
    if (current?.label === "手动编辑") {
      versions[state.draft.activePromptVersion] = { ...current, text: promptInput.value };
    } else {
      versions.splice(state.draft.activePromptVersion + 1);
      versions.push({
        id: crypto.randomUUID(),
        label: "手动编辑",
        text: promptInput.value,
        createdAt: new Date().toISOString()
      });
      state.draft.activePromptVersion = versions.length - 1;
    }
    patchDraft({ promptVersions: versions, activePromptVersion: state.draft.activePromptVersion });
  });
  document.querySelector("#prompt-prev")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.max(0, state.draft.activePromptVersion - 1) });
    render();
  });
  document.querySelector("#prompt-next")?.addEventListener("click", () => {
    patchDraft({ activePromptVersion: Math.min(state.draft.promptVersions.length - 1, state.draft.activePromptVersion + 1) });
    render();
  });
  document.querySelector("#enhance-prompt")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "扩写中…";
    try {
      const text = await window.studio.enhancePrompt({
        prompt: activePrompt().text,
        modelId: state.draft.modelId
      });
      const versions = [
        ...state.draft.promptVersions.slice(0, state.draft.activePromptVersion + 1),
        { id: crypto.randomUUID(), label: `扩写 ${state.draft.promptVersions.filter((item) => item.label.startsWith("扩写")).length + 1}`, text, createdAt: new Date().toISOString() }
      ];
      patchDraft({ promptVersions: versions, activePromptVersion: versions.length - 1 });
      render();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
  for (const id of ["model", "ratio", "resolution", "fps", "motion", "seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", async (event) => {
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (id === "model") {
        const oldBundledPath = bundledWorkflows[state.draft.modelId]?.path;
        const bundled =
          bundledWorkflows[value] ??
          (await window.studio.getBundledWorkflow(value));
        if (bundled) bundledWorkflows[value] = bundled;
        patchDraft({
          modelId: value,
          workflowPath:
            bundled?.path ??
            (state.draft.workflowPath === oldBundledPath
              ? ""
              : state.draft.workflowPath)
        });
        render();
        return;
      }
      const patch =
        id === "ratio" ? { ratio: value as Draft["ratio"] } :
        id === "resolution" ? { resolution: Number(value) as Draft["resolution"] } :
        id === "fps" ? { fps: Number(value) as Draft["fps"] } :
        id === "motion" ? { motion: value as Draft["motion"] } :
        { seed: value ? Number(value) : null };
      patchDraft(patch);
    });
  }
  document.querySelector("#keep-seed")?.addEventListener("change", (event) => {
    patchDraft({ keepSeedOnCopy: (event.target as HTMLInputElement).checked });
  });
  const range = document.querySelector<HTMLInputElement>("#duration");
  const number = document.querySelector<HTMLInputElement>("#duration-number");
  const updateDuration = (value: string) => {
    const duration = Math.max(1, Math.min(60, Number(value) || 1));
    patchDraft({ duration });
    if (range) range.value = String(Math.min(30, duration));
    if (number) number.value = String(duration);
  };
  range?.addEventListener("input", () => updateDuration(range.value));
  number?.addEventListener("input", () => updateDuration(number.value));
  document.querySelector("#clear-draft")?.addEventListener("click", async () => {
    if (!window.confirm("确定清空当前草稿吗？此操作会移除图片和提示词版本。")) return;
    window.clearTimeout(draftSaveTimer);
    draftRevision += 1;
    draftDirty = false;
    state = await window.studio.saveDraft(createClearedDraft(state.draft));
    render();
  });
  document.querySelector("#enqueue")?.addEventListener("click", async () => {
    try {
      state = await window.studio.enqueue(state.draft);
      showMessage(`已加入队列：${state.queue.at(-1)?.outputFilename ?? ""}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
    }
  });
}

function bindQueue(): void {
  document.querySelector("#start-queue")?.addEventListener("click", async () => {
    state = await window.studio.startQueue();
    render();
  });
  document.querySelector("#pause-queue")?.addEventListener("click", async () => {
    state = await window.studio.pauseQueue();
    render();
  });
  document.querySelector("#optimize-queue")?.addEventListener("click", async () => {
    state = await window.studio.optimizeQueue();
    showMessage("等待任务已按模型和工作流重新分组。");
  });
  document.querySelectorAll<HTMLElement>("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.removeTask(button.dataset.remove!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.cancelTask(button.dataset.cancel!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.moveTask(
        button.dataset.move!,
        Number(button.dataset.direction) as -1 | 1
      );
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.duplicateTask(button.dataset.duplicate!);
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-retry]").forEach((button) => {
    button.addEventListener("click", async () => {
      state = await window.studio.retryTask(button.dataset.retry!);
      render();
    });
  });
}

function bindHistory(): void {
  document.querySelectorAll<HTMLElement>("[data-history]").forEach((card) => {
    const open = () => {
      selectedHistoryAssetId = card.dataset.history!;
      page = "history-detail";
      render();
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-show-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      const shown = await window.studio.showItemInFolder(button.dataset.showFile!);
      if (!shown) showMessage("文件不存在或当前路径还没有在本机生成。");
    });
  });
}

function formSettings(): Settings {
  const base = settingsDraft ?? state.settings;
  const value = (id: string, fallback: string) =>
    document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? fallback;
  const checked = (id: string, fallback: boolean) =>
    document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? fallback;
  return {
    comfyUrl: value("comfy-url", base.comfyUrl),
    lmStudioUrl: value("lm-url", base.lmStudioUrl),
    lmStudioModel: value("lm-model", base.lmStudioModel),
    modelDirectory: value("model-directory", base.modelDirectory),
    outputDirectory: value("output-directory", base.outputDirectory),
    promptSystemTemplate: value("prompt-template", base.promptSystemTemplate),
    defaultVideoModel: value("default-video-model", base.defaultVideoModel),
    vramReserveGb: Number(value("vram-reserve", String(base.vramReserveGb))),
    autoOffload: checked("auto-offload", base.autoOffload),
    safeCancel: checked("safe-cancel", base.safeCancel),
    optimizeQueue: checked("optimize-queue-setting", base.optimizeQueue),
    promptLanguage: value("prompt-language", base.promptLanguage) as Settings["promptLanguage"],
    promptCreativity: Number(value("prompt-creativity", String(base.promptCreativity))),
    defaultUpscaleModel: value("default-upscale-model", base.defaultUpscaleModel),
    proxyEnabled: checked("proxy-enabled", base.proxyEnabled),
    proxyUrl: value("proxy-url", base.proxyUrl)
  };
}

async function runEnvironmentScan(settings: Settings): Promise<void> {
  environmentScanning = true;
  render();
  try {
    environmentScan = await window.studio.scanEnvironment(settings);
  } catch (error) {
    showMessage(`环境扫描失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    environmentScanning = false;
    render();
  }
}

function bindSettings(): void {
  if (!environmentScan && !environmentScanning) {
    void runEnvironmentScan(settingsDraft ?? state.settings);
    return;
  }
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(".settings-content input, .settings-content textarea, .settings-content select").forEach((input) => {
    const update = () => {
      settingsDraft = formSettings();
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });
  document.querySelector<HTMLInputElement>("#proxy-enabled")?.addEventListener("change", () => {
    settingsDraft = formSettings();
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      settingsDraft = formSettings();
      settingsTab = button.dataset.settingsTab as typeof settingsTab;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-install-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      settingsDraft = formSettings();
      const profile = environmentScan?.modelProfiles.find(
        (item) => item.id === button.dataset.installProfile
      );
      const component = profile?.components[Number(button.dataset.installComponent)];
      if (!profile || !component) return;
      selectedInstallGuide = { profileName: profile.name, component };
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-start-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.startService as LocalServiceKind;
      settingsDraft = formSettings();
      serviceStarting = kind;
      serviceStatusMessage = kind === "comfy"
        ? "正在启动 ComfyUI 后端并检测接口，首次加载节点可能需要 1–2 分钟…"
        : "正在启动 LM Studio…";
      render();
      try {
        const result = await window.studio.startLocalService(kind, settingsDraft);
        serviceStarting = null;
        serviceStatusMessage = result.message;
        environmentScan = await window.studio.scanEnvironment(settingsDraft);
        showMessage(result.message);
      } catch (error) {
        serviceStarting = null;
        serviceStatusMessage = `启动失败：${error instanceof Error ? error.message : String(error)}`;
        showMessage(serviceStatusMessage);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-restart-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.restartService as LocalServiceKind;
      settingsDraft = formSettings();
      serviceRestarting = kind;
      serviceStatusMessage = "正在停止并重新启动 ComfyUI，节点加载期间会持续检测，最多等待 2 分钟…";
      render();
      try {
        const result = await window.studio.restartLocalService(kind, settingsDraft);
        serviceRestarting = null;
        serviceStatusMessage = result.message;
        environmentScan = await window.studio.scanEnvironment(settingsDraft);
        showMessage(result.message);
      } catch (error) {
        serviceRestarting = null;
        serviceStatusMessage = `重启失败：${error instanceof Error ? error.message : String(error)}`;
        showMessage(serviceStatusMessage);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-repair-issue]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.dataset.repairIssue as NonNullable<EnvironmentScanResult["issues"]>[number]["id"];
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      environmentRepairing = issueId;
      render();
      try {
        const result = await window.studio.repairEnvironmentIssue(issueId, currentSettings);
        environmentRepairLogs = {
          ...environmentRepairLogs,
          [issueId]: result.log || result.message
        };
        environmentRepairing = "";
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        showMessage(result.message);
      } catch (error) {
        environmentRepairing = "";
        const message = error instanceof Error ? error.message : String(error);
        environmentRepairLogs = { ...environmentRepairLogs, [issueId]: message };
        showMessage(`自动修复失败：${message}`);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-install-node]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nodeId = button.dataset.installNode!;
      const currentSettings = formSettings();
      settingsDraft = currentSettings;
      customNodeInstalling = nodeId;
      render();
      try {
        const result = await window.studio.installCustomNode(nodeId, currentSettings);
        customNodeLogs = {
          ...customNodeLogs,
          [nodeId]: result.log || result.message
        };
        customNodeInstalling = "";
        environmentScan = await window.studio.scanEnvironment(currentSettings);
        showMessage(result.message);
      } catch (error) {
        customNodeInstalling = "";
        const message = error instanceof Error ? error.message : String(error);
        customNodeLogs = { ...customNodeLogs, [nodeId]: message };
        showMessage(`节点安装失败：${message}`);
      }
    });
  });
  const closeInstallGuide = () => {
    selectedInstallGuide = null;
    render();
  };
  document.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide);
  document.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeInstallGuide();
  });
  document.querySelector("#open-install-download")?.addEventListener("click", async () => {
    if (!selectedInstallGuide) return;
    const opened = await window.studio.openExternal(
      selectedInstallGuide.component.installGuide.downloadUrl
    );
    if (!opened) showMessage("下载页面无法打开，请检查链接或系统浏览器设置。");
  });
  document.querySelector("#scan-environment")?.addEventListener("click", () => {
    settingsDraft = formSettings();
    void runEnvironmentScan(settingsDraft);
  });
  document.querySelector("#save-settings")?.addEventListener("click", async () => {
    state = await window.studio.saveSettings(formSettings());
    settingsDraft = null;
    showMessage("设置已保存，将对下一项尚未开始的任务生效。");
  });
  document.querySelectorAll<HTMLElement>("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      const resultElement = document.querySelector("#connection-result")!;
      resultElement.textContent = "正在连接…";
      const result = await window.studio.testConnection(
        button.dataset.test as "comfy" | "lmstudio",
        formSettings()
      );
      resultElement.className = `connection-result ${result.ok ? "success" : "error"}`;
      resultElement.textContent = result.message;
    });
  });
  document.querySelector("#use-scanned-comfy")?.addEventListener("click", async () => {
    if (!environmentScan?.comfyRoot) return;
    const nextSettings = {
      ...formSettings(),
      comfyUrl: environmentScan.comfyUrl,
      modelDirectory: environmentScan.modelDirectory,
      outputDirectory: environmentScan.outputDirectory
    };
    state = await window.studio.saveSettings(nextSettings);
    settingsDraft = null;
    showMessage("已采用扫描到的 ComfyUI 模型和输出目录。");
  });
  document.querySelector("#pick-model-directory")?.addEventListener("click", async () => {
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#model-directory");
    if (directory && input) {
      input.value = directory;
      settingsDraft = formSettings();
    }
  });
  document.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#output-directory");
    if (directory && input) {
      input.value = directory;
      settingsDraft = formSettings();
    }
  });
}

window.studio.onStateChanged((nextState) => {
  const localDraft = state?.draft;
  state = {
    ...nextState,
    draft:
      localDraft && (draftDirty || draftSaveInFlight > 0)
        ? localDraft
        : nextState.draft
  };
  const activeElement = document.activeElement;
  const isEditing =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;
  if (isEditing || draftSaveInFlight > 0) return;
  render();
});

window.studio.onTaskPreview((preview) => {
  taskPreviews[preview.taskId] = preview.dataUrl;
  const running = state.queue.find((task) => task.status === "running");
  if (page !== "queue" || running?.id !== preview.taskId) return;
  const image = document.querySelector<HTMLImageElement>("#live-preview-image");
  const empty = document.querySelector<HTMLElement>("#live-preview-empty");
  if (image) {
    image.src = preview.dataUrl;
    image.style.display = "";
  }
  if (empty) empty.style.display = "none";
});

function setMetric(
  id: string,
  value: number | null,
  detail = ""
): void {
  const label = document.querySelector<HTMLElement>(`#${id}`);
  const detailElement = document.querySelector<HTMLElement>(`#${id}-detail`);
  const bar = document.querySelector<HTMLElement>(`#${id}-bar`);
  if (label) label.textContent = value == null ? "—" : `${Math.round(value)}%`;
  if (detailElement) detailElement.textContent = detail;
  if (bar) bar.style.width = `${value == null ? 0 : Math.max(0, Math.min(100, value))}%`;
}

async function refreshPerformanceMetrics(): Promise<void> {
  if (performancePolling) return;
  performancePolling = true;
  try {
    performanceMetrics = await window.studio.getPerformanceMetrics(state.settings);
    if (page !== "queue") return;
    setMetric("metric-cpu", performanceMetrics.cpuPercent);
    setMetric(
      "metric-memory",
      performanceMetrics.memoryUsedBytes / performanceMetrics.memoryTotalBytes * 100,
      `${formatBytes(performanceMetrics.memoryUsedBytes)} / ${formatBytes(performanceMetrics.memoryTotalBytes)}`
    );
    setMetric(
      "metric-gpu",
      performanceMetrics.gpuPercent,
      performanceMetrics.gpuTemperature == null
        ? ""
        : `${performanceMetrics.gpuTemperature}°C`
    );
    setMetric(
      "metric-vram",
      performanceMetrics.vramUsedBytes != null && performanceMetrics.vramTotalBytes
        ? performanceMetrics.vramUsedBytes / performanceMetrics.vramTotalBytes * 100
        : null,
      performanceMetrics.vramUsedBytes != null && performanceMetrics.vramTotalBytes != null
        ? `${formatBytes(performanceMetrics.vramUsedBytes)} / ${formatBytes(performanceMetrics.vramTotalBytes)}`
        : ""
    );
  } finally {
    performancePolling = false;
  }
}

window.setInterval(() => {
  void refreshPerformanceMetrics();
  const running = state?.queue.find((task) => task.status === "running");
  const elapsed = document.querySelector<HTMLElement>("#running-elapsed");
  if (elapsed && running) elapsed.textContent = elapsedText(running.startedAt);
}, 2_000);

void window.studio.getState().then((initialState) => {
  state = initialState;
  render();
  void refreshPerformanceMetrics();
  void Promise.all([
    window.studio.getBundledWorkflow(state.draft.modelId),
    window.studio.scanEnvironment(state.settings)
  ]).then(([bundled, scan]) => {
    environmentScan = scan;
    if (bundled) {
      bundledWorkflows[bundled.modelId] = bundled;
      if (!state.draft.workflowPath) {
        patchDraft({ workflowPath: bundled.path });
      }
    }
    render();
  }).catch(() => {
    // 创建页仍可手动选择工作流；详细扫描错误可在设置页重试查看。
  });
});
