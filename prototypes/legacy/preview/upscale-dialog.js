(() => {
  const modelProfiles = {
    seedvr2: { name: 'SeedVR2 3B', speed: 1.7, note: '视频一致性最好 · 推荐' },
    realesrgan: { name: 'Real-ESRGAN x4plus', speed: 0.46, note: '速度最快 · 细节偏锐利' },
    flashvsr: { name: 'FlashVSR', speed: 1.15, note: '质量与速度平衡' }
  };
  let dialog;
  let currentOptions = {};
  let targetHeight = 1080;
  let returnFocus;

  function ensureDialog() {
    if (dialog) return dialog;
    const style = document.createElement('style');
    style.textContent = `
      .upscale-dialog {
        width: min(680px, calc(100% - 28px));
        max-height: calc(100% - 28px);
        padding: 0;
        color: var(--foreground);
        background: var(--background);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 24px 80px color-mix(in srgb, var(--foreground) 24%, transparent);
      }
      .upscale-dialog::backdrop {
        background: color-mix(in srgb, var(--background) 36%, transparent);
        backdrop-filter: blur(8px);
      }
      .upscale-dialog * { box-sizing: border-box; }
      .upscale-form,
      .upscale-body,
      .upscale-source-copy,
      .upscale-estimate-copy {
        display: grid;
        gap: 14px;
      }
      .upscale-header,
      .upscale-source,
      .upscale-options,
      .upscale-resolution,
      .upscale-footer,
      .upscale-estimate,
      .upscale-model-note {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .upscale-header,
      .upscale-footer,
      .upscale-estimate,
      .upscale-model-note {
        justify-content: space-between;
      }
      .upscale-header {
        padding: 16px 18px;
        border-bottom: 1px solid var(--border);
      }
      .upscale-header h2 { margin: 0; }
      .upscale-body { padding: 18px; }
      .upscale-source {
        padding: 12px;
        background: var(--muted);
        color: var(--muted-foreground);
        border-radius: 12px;
      }
      .upscale-source-icon {
        width: 74px;
        aspect-ratio: 16 / 9;
        display: grid;
        place-items: center;
        flex: 0 0 74px;
        background: color-mix(in srgb, var(--card) 70%, transparent);
        color: var(--card-foreground);
        border-radius: 8px;
      }
      .upscale-source-copy {
        gap: 4px;
        min-width: 0;
      }
      .upscale-source-copy code {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .upscale-options {
        align-items: flex-end;
      }
      .upscale-options > label {
        flex: 1 1 260px;
      }
      .upscale-resolution .btn { flex: 1 1 86px; }
      .upscale-estimate {
        padding: 13px;
        background: var(--muted);
        color: var(--muted-foreground);
        border-radius: 12px;
      }
      .upscale-estimate-copy { gap: 3px; }
      .upscale-estimate strong { color: var(--foreground); }
      .upscale-footer {
        padding: 14px 18px;
        border-top: 1px solid var(--border);
      }
      .upscale-footer-actions {
        display: flex;
        gap: 8px;
        margin-left: auto;
      }
      @media (max-width: 520px) {
        .upscale-dialog { width: calc(100% - 18px); max-height: calc(100% - 18px); }
        .upscale-body { padding: 14px; }
        .upscale-footer-actions { width: 100%; }
        .upscale-footer-actions .btn { flex: 1; }
      }
    `;
    document.head.appendChild(style);

    dialog = document.createElement('dialog');
    dialog.className = 'upscale-dialog';
    dialog.innerHTML = `
      <form class="upscale-form" id="upscale-form">
        <header class="upscale-header">
          <div>
            <h2>提升分辨率</h2>
            <span class="text-small text-muted" id="upscale-mode-label">创建独立的放大任务</span>
          </div>
          <button class="btn btn-ghost" id="upscale-close" type="button" aria-label="关闭"><i data-lucide="x" aria-hidden="true"></i></button>
        </header>
        <div class="upscale-body">
          <div class="upscale-source">
            <div class="upscale-source-icon"><i data-lucide="film" aria-hidden="true"></i></div>
            <div class="upscale-source-copy">
              <strong id="upscale-source-title">当前视频</strong>
              <code class="text-small" id="upscale-source-file"></code>
              <span class="text-small" id="upscale-source-meta"></span>
            </div>
          </div>

          <div>
            <label class="form-label">目标分辨率</label>
            <div class="upscale-resolution" id="upscale-resolution">
              <button class="btn" type="button" data-height="720" aria-pressed="false">720p</button>
              <button class="btn" type="button" data-height="1080" aria-pressed="true">1080p</button>
              <button class="btn" type="button" data-height="1440" aria-pressed="false">1440p</button>
              <button class="btn" type="button" data-height="2160" aria-pressed="false">4K</button>
            </div>
          </div>

          <div class="upscale-options">
            <label class="form-label" for="upscale-model">提升模型
              <select class="form-select" id="upscale-model">
                <option value="seedvr2">SeedVR2 3B · 视频一致性</option>
                <option value="flashvsr">FlashVSR · 平衡</option>
                <option value="realesrgan">Real-ESRGAN x4plus · 快速</option>
              </select>
            </label>
            <label class="form-label" for="upscale-tile">显存策略
              <select class="form-select" id="upscale-tile">
                <option value="auto">自动 · 预留 2 GB</option>
                <option value="safe">保守 · 分块处理</option>
                <option value="fast">优先速度</option>
              </select>
            </label>
          </div>

          <div class="upscale-model-note">
            <span class="text-small text-muted" id="upscale-model-note"></span>
            <span class="viz-badge" id="upscale-vram">预计峰值 18–21 GB</span>
          </div>

          <div class="form-check form-switch">
            <input class="form-check-input" id="upscale-face" type="checkbox">
            <label class="form-check-label" for="upscale-face">轻度人脸细节修复</label>
          </div>

          <div class="upscale-estimate">
            <div class="upscale-estimate-copy">
              <span class="text-small">预计输出</span>
              <strong id="upscale-output">1872 × 1080 · 1080p</strong>
              <code class="text-small" id="upscale-output-file"></code>
            </div>
            <div class="upscale-estimate-copy">
              <span class="text-small">预计耗时</span>
              <strong id="upscale-time">约 7–10 分钟</strong>
              <span class="text-small">按 RTX 4090 当前配置估算</span>
            </div>
          </div>
        </div>
        <footer class="upscale-footer">
          <span class="text-small text-muted">加入后可在队列中再次打开并编辑</span>
          <div class="upscale-footer-actions">
            <button class="btn btn-ghost" id="upscale-cancel" type="button">取消</button>
            <button class="btn btn-primary" type="submit"><i data-lucide="list-plus" aria-hidden="true"></i>加入队列</button>
          </div>
        </footer>
      </form>
    `;
    document.body.appendChild(dialog);

    const close = () => dialog.close();
    dialog.querySelector('#upscale-close').addEventListener('click', close);
    dialog.querySelector('#upscale-cancel').addEventListener('click', close);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', () => {
      currentOptions.onClose?.();
      returnFocus?.focus?.();
    });
    dialog.querySelector('#upscale-resolution').addEventListener('click', event => {
      const button = event.target.closest('[data-height]');
      if (!button) return;
      targetHeight = Number(button.dataset.height);
      update();
    });
    dialog.querySelector('#upscale-model').addEventListener('change', update);
    dialog.querySelector('#upscale-tile').addEventListener('change', update);
    dialog.querySelector('#upscale-face').addEventListener('change', update);
    dialog.querySelector('#upscale-form').addEventListener('submit', event => {
      event.preventDefault();
      const task = snapshot();
      persistTask(task);
      currentOptions.onSubmit?.(task);
      dialog.close();
    });
    return dialog;
  }

  function dimensions() {
    const sourceWidth = Number(currentOptions.sourceWidth) || 832;
    const sourceHeight = Number(currentOptions.sourceHeight) || 480;
    const targetWidth = Math.max(16, Math.round((targetHeight * sourceWidth / sourceHeight) / 16) * 16);
    return { targetWidth, targetHeight };
  }

  function formatMinutes(seconds) {
    const low = Math.max(1, Math.round(seconds * .82 / 60));
    const high = Math.max(low + 1, Math.round(seconds * 1.24 / 60));
    return `约 ${low}–${high} 分钟`;
  }

  function outputFilename() {
    const source = currentOptions.filename || 'video.mp4';
    return source.replace(/(?:-\d{3,4}p)?\.mp4$/i, `-${targetHeight === 2160 ? '4K' : `${targetHeight}p`}.mp4`);
  }

  function estimateSeconds() {
    const model = modelProfiles[dialog.querySelector('#upscale-model').value];
    const duration = Number(currentOptions.duration) || 5;
    const resolutionFactor = Math.pow(targetHeight / 480, 1.72);
    const faceFactor = dialog.querySelector('#upscale-face').checked ? 1.18 : 1;
    const tileFactor = dialog.querySelector('#upscale-tile').value === 'safe' ? 1.2 : dialog.querySelector('#upscale-tile').value === 'fast' ? .88 : 1;
    return 34 + duration * resolutionFactor * model.speed * 11 * faceFactor * tileFactor;
  }

  function update() {
    const modelValue = dialog.querySelector('#upscale-model').value;
    const model = modelProfiles[modelValue];
    const { targetWidth } = dimensions();
    dialog.querySelectorAll('[data-height]').forEach(button => {
      const selected = Number(button.dataset.height) === targetHeight;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('btn-ghost', !selected);
    });
    dialog.querySelector('#upscale-model-note').textContent = model.note;
    dialog.querySelector('#upscale-vram').textContent =
      modelValue === 'realesrgan' ? '预计峰值 6–9 GB' :
      targetHeight >= 1440 ? '预计峰值 21–23 GB' : '预计峰值 18–21 GB';
    dialog.querySelector('#upscale-output').textContent =
      `${targetWidth} × ${targetHeight} · ${targetHeight === 2160 ? '4K' : `${targetHeight}p`}`;
    dialog.querySelector('#upscale-output-file').textContent = outputFilename();
    dialog.querySelector('#upscale-time').textContent = formatMinutes(estimateSeconds());
  }

  function snapshot() {
    const { targetWidth } = dimensions();
    return {
      id: currentOptions.taskId || `UP-${Date.now()}`,
      type: 'upscale',
      title: currentOptions.title || '视频分辨率提升',
      sourceFilename: currentOptions.filename || 'video.mp4',
      outputFilename: outputFilename(),
      sourceWidth: Number(currentOptions.sourceWidth) || 832,
      sourceHeight: Number(currentOptions.sourceHeight) || 480,
      targetWidth,
      targetHeight,
      duration: Number(currentOptions.duration) || 5,
      model: dialog.querySelector('#upscale-model').value,
      modelName: modelProfiles[dialog.querySelector('#upscale-model').value].name,
      tileMode: dialog.querySelector('#upscale-tile').value,
      faceRestore: dialog.querySelector('#upscale-face').checked,
      estimateMinutes: Math.max(1, Math.round(estimateSeconds() / 60)),
      createdAt: new Date().toISOString()
    };
  }

  function persistTask(task) {
    try {
      const key = 'aivideo.upscaleQueue';
      const tasks = JSON.parse(localStorage.getItem(key) || '[]');
      const index = tasks.findIndex(item => item.id === task.id);
      if (index >= 0) tasks[index] = task;
      else tasks.push(task);
      localStorage.setItem(key, JSON.stringify(tasks));
    } catch (_) {}
  }

  function open(options = {}) {
    ensureDialog();
    currentOptions = options;
    returnFocus = options.trigger || document.activeElement;
    targetHeight = Number(options.targetHeight) || 1080;
    dialog.querySelector('#upscale-mode-label').textContent =
      options.taskId ? '编辑队列中的放大任务' : '创建独立的放大任务';
    dialog.querySelector('#upscale-source-title').textContent = options.title || '当前视频';
    dialog.querySelector('#upscale-source-file').textContent = options.filename || 'video.mp4';
    dialog.querySelector('#upscale-source-meta').textContent =
      `${options.sourceWidth || 832} × ${options.sourceHeight || 480} · ${options.duration || 5}秒`;
    dialog.querySelector('#upscale-model').value = options.model || 'seedvr2';
    dialog.querySelector('#upscale-tile').value = options.tileMode || 'auto';
    dialog.querySelector('#upscale-face').checked = Boolean(options.faceRestore);
    update();
    dialog.showModal();
    globalThis.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
  }

  globalThis.UpscaleDialog = { open };
})();
