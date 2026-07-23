import "./style.css";
import type {
  AppState,
  Draft,
  PromptVersion,
  Settings
} from "./types";
import { createDefaultDraft } from "./core/defaults";

type Page = "create" | "queue" | "history" | "history-detail" | "settings";

const appElement = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let page: Page = "create";
let draftSaveTimer: number | undefined;
let flashMessage = "";
let selectedHistoryAssetId = "";

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
            <option value="sulphur2" ${draft.modelId === "sulphur2" ? "selected" : ""}>Sulphur 2 FP8</option>
            <option value="wan22_5b" ${draft.modelId === "wan22_5b" ? "selected" : ""}>Wan 2.2 I2V 5B</option>
            <option value="hunyuan15" ${draft.modelId === "hunyuan15" ? "selected" : ""}>HunyuanVideo 1.5</option>
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
        <div><strong>ComfyUI API 工作流</strong><p class="muted">${draft.workflowPath ? escapeHtml(draft.workflowPath) : "为当前模型选择从 ComfyUI 导出的 API 格式 JSON"}</p></div>
        <button class="secondary" id="pick-workflow">选择 JSON</button>
      </div>
      <div class="submit-row">
        <button class="ghost danger" id="clear-draft">清空</button>
        <button class="primary" id="enqueue">加入队列</button>
      </div>
    </section>`;
}

function queuePage(): string {
  const running = state.queue.find((task) => task.status === "running");
  return `
    <section class="page-heading">
      <div><h1>生成队列</h1><p>${state.queue.length} 项任务 · ${state.queueRunning ? "正在持续执行" : "当前已暂停"}</p></div>
      <div class="button-row"><button class="secondary" id="optimize-queue" ${state.queue.filter((task) => task.status === "waiting").length < 2 ? "disabled" : ""}>按模型优化顺序</button><button class="primary" id="${state.queueRunning ? "pause-queue" : "start-queue"}">${state.queueRunning ? "暂停队列" : "开始队列"}</button></div>
    </section>
    ${running ? `<section class="panel now-running">
      <div class="section-heading"><div><span class="eyebrow">正在生成</span><h2>${escapeHtml(running.outputFilename)}</h2></div><strong>${Math.round(running.progress ?? 0)}%</strong></div>
      <div class="progress"><span style="width:${running.progress ?? 0}%"></span></div>
      <p class="muted">${escapeHtml(running.prompt)}</p>
    </section>` : ""}
    <section class="task-list">
      ${state.queue.length === 0
        ? `<div class="empty panel"><h2>队列还是空的</h2><p>从创建页加入一个任务后，就可以在这里运行。</p><button class="secondary" data-page="create">去创建</button></div>`
        : state.queue.map((task) => `
          <article class="task-card panel ${task.status}">
            <div class="task-main">
              <div><span class="status ${task.status}">${statusLabel(task.status)}</span><h3>${escapeHtml(task.outputFilename)}</h3></div>
              <p>${escapeHtml(task.prompt)}</p>
              <div class="task-meta"><span>${escapeHtml(modelName(task.modelId))}</span><span>${task.resolution}p</span><span>${task.duration}秒</span><span>Seed ${task.seed}</span></div>
              ${task.error ? `<p class="error">${escapeHtml(task.error)}</p>` : ""}
            </div>
            <div class="task-actions">
              ${task.status === "waiting" ? `<div class="button-row"><button class="icon-button" data-move="${task.id}" data-direction="-1" title="上移">↑</button><button class="icon-button" data-move="${task.id}" data-direction="1" title="下移">↓</button></div>` : ""}
              <button class="secondary" data-duplicate="${task.id}">复制</button>
              ${task.status === "failed" || task.status === "cancelled" ? `<button class="secondary" data-retry="${task.id}">重试</button>` : ""}
              ${task.status === "running" ? `<button class="danger secondary" data-cancel="${task.id}">安全中止</button>` : ""}
              ${task.status !== "running" ? `<button class="ghost danger" data-remove="${task.id}">移除</button>` : ""}
            </div>
          </article>`).join("")}
    </section>`;
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

function settingsPage(): string {
  const settings = state.settings;
  return `
    <section class="page-heading"><div><h1>设置</h1><p>连接本地服务并配置默认目录。</p></div><button class="primary" id="save-settings">保存设置</button></section>
    <section class="panel settings-page">
      <h2>服务连接</h2>
      <div class="settings-grid two">
        <label>ComfyUI 地址
          <div class="input-action"><input id="comfy-url" value="${escapeHtml(settings.comfyUrl)}"><button class="secondary" data-test="comfy">测试</button></div>
        </label>
        <label>LM Studio OpenAI API 地址
          <div class="input-action"><input id="lm-url" value="${escapeHtml(settings.lmStudioUrl)}"><button class="secondary" data-test="lmstudio">测试</button></div>
        </label>
        <label>LM Studio 模型 ID<input id="lm-model" value="${escapeHtml(settings.lmStudioModel)}" placeholder="留空使用 local-model"></label>
        <label>ComfyUI 模型目录<input id="model-directory" value="${escapeHtml(settings.modelDirectory)}"></label>
        <label>ComfyUI 输出目录<div class="input-action"><input id="output-directory" value="${escapeHtml(settings.outputDirectory)}" placeholder="例如 C:\\ComfyUI\\output"><button class="secondary" id="pick-output-directory">选择</button></div></label>
      </div>
      <h2>提示词扩写</h2>
      <label>系统模板<textarea id="prompt-template" rows="5">${escapeHtml(settings.promptSystemTemplate)}</textarea></label>
      <div id="connection-result" class="connection-result muted">尚未测试连接</div>
    </section>
    <section class="panel token-help">
      <h2>工作流占位符</h2>
      <p>在 ComfyUI 导出的 API JSON 中可使用以下占位符，提交任务时会递归替换：</p>
      <div class="token-list">${["PROMPT", "NEGATIVE_PROMPT", "SEED", "INPUT_IMAGE", "END_IMAGE", "WIDTH", "HEIGHT", "DURATION", "FPS", "FRAMES", "OUTPUT_FILENAME"].map((token) => `<code>{{${token}}}</code>`).join("")}</div>
    </section>`;
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
    state = await window.studio.saveDraft(state.draft);
  }, 350);
}

function patchDraft(patch: Partial<Draft>): void {
  state.draft = { ...state.draft, ...patch };
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
  for (const id of ["model", "ratio", "resolution", "motion", "seed"]) {
    document.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      const patch =
        id === "model" ? { modelId: value } :
        id === "ratio" ? { ratio: value as Draft["ratio"] } :
        id === "resolution" ? { resolution: Number(value) as Draft["resolution"] } :
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
    state = await window.studio.saveDraft(createDefaultDraft());
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
  const value = (id: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value.trim() ?? "";
  return {
    comfyUrl: value("comfy-url"),
    lmStudioUrl: value("lm-url"),
    lmStudioModel: value("lm-model"),
    modelDirectory: value("model-directory"),
    outputDirectory: value("output-directory"),
    promptSystemTemplate: value("prompt-template")
  };
}

function bindSettings(): void {
  document.querySelector("#save-settings")?.addEventListener("click", async () => {
    state = await window.studio.saveSettings(formSettings());
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
  document.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
    const directory = await window.studio.pickDirectory();
    const input = document.querySelector<HTMLInputElement>("#output-directory");
    if (directory && input) input.value = directory;
  });
}

window.studio.onStateChanged((nextState) => {
  state = nextState;
  render();
});

void window.studio.getState().then((initialState) => {
  state = initialState;
  render();
});
