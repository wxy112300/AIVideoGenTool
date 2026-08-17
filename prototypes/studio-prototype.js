(() => {
  const root = document.querySelector('.studio-prototype');
  if (!root) return;
  root.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-settings-tab]').forEach((item) => item.classList.toggle('active', item === button));
      root.querySelectorAll('[data-settings-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.settingsPane === button.dataset.settingsTab));
    });
  });
  root.querySelectorAll('[data-layout]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('.gallery').forEach((gallery) => gallery.classList.toggle('album', button.dataset.layout === 'album'));
      root.querySelectorAll('[data-layout]').forEach((item) => item.classList.toggle('primary', item === button));
    });
  });
  const historyContent = {
    video: { count: '8 个视频', description: '封面读取持久缓存；悬停才加载并播放原视频，退出后回到稳定封面。' },
    image: { count: '4 个图片项目', description: '一个项目包含全部抽卡和后续编辑版本；选择满意图片后可继续编辑或送入视频 Slot 1。' }
  };
  const switchHistoryKind = (kind) => {
    root.querySelectorAll('[data-history-kind]').forEach((item) => item.classList.toggle('active', item.dataset.historyKind === kind));
    root.querySelectorAll('[data-history-panel]').forEach((panel) => panel.hidden = panel.dataset.historyPanel !== kind);
    const content = historyContent[kind];
    if (content) {
      const count = root.querySelector('[data-history-count]');
      const description = root.querySelector('[data-history-description]');
      if (count) count.textContent = content.count;
      if (description) description.textContent = content.description;
    }
  };
  root.querySelectorAll('[data-history-kind]').forEach((button) => button.addEventListener('click', () => switchHistoryKind(button.dataset.historyKind)));
  root.querySelector('[data-history-filter-toggle]')?.addEventListener('click', () => {
    const panel = root.querySelector('[data-history-filter-panel]');
    if (panel) panel.hidden = !panel.hidden;
  });
  let activeCreateMode = 'image';
  const selectedText = (panel, selector, fallback = '') => {
    const element = panel?.querySelector(selector);
    return element?.selectedOptions?.[0]?.textContent?.trim() || element?.value?.trim() || fallback;
  };
  const shortModelName = (value) => value.replace(/ ·.*$/u, '').trim();
  const compactValue = (value) => value.split(' · ')[0].trim();
  const updateCreateActionContext = (mode = activeCreateMode) => {
    const panel = root.querySelector(`[data-mode-panel="${mode}"]`);
    const actionBar = panel?.querySelector('.create-action-bar');
    if (!panel || !actionBar) return;
    let title = '图生视频';
    let context = 'H3 R2V · 768p · 10 秒 · 24 FPS · Seed 固定';
    if (mode === 'video') {
      title = '视频续写';
      const model = shortModelName(selectedText(panel, '[data-summary-model]', 'MiniMax H3 FL2VA'));
      const quality = compactValue(selectedText(panel, '[data-summary-quality]', '768p'));
      const duration = selectedText(panel, '[data-summary-duration]', '5 秒');
      const fps = compactValue(selectedText(panel, '[data-summary-fps]', '24 FPS'));
      context = `${model} · 新增 ${duration} · ${quality} · ${fps}`;
    } else if (mode === 'image-edit') {
      title = '图片处理';
      const modelId = panel.querySelector('[data-image-model]')?.value || 'qwen';
      const model = shortModelName(selectedText(panel, '[data-image-model]', 'Qwen Image Edit 2511'));
      const format = selectedText(panel, '[data-image-format]', 'PNG');
      const count = panel.querySelector('[data-image-count]')?.value || '6';
      const seed = panel.querySelector('[data-image-seed-input]')?.value?.trim() ? 'Seed 固定' : 'Seed 随机';
      context = modelId === 'lama'
        ? 'LaMa · 原图尺寸 · PNG · Mask 必需'
        : `${model} · ${format.split(' · ')[0]} · ${count} 张 · ${seed}`;
    } else {
      const model = shortModelName(selectedText(panel, '[data-summary-model]', 'MiniMax H3 R2V'));
      const quality = compactValue(selectedText(panel, '[data-summary-quality]', '768p'));
      const duration = selectedText(panel, '[data-summary-duration]', '10 秒');
      const fps = compactValue(selectedText(panel, '[data-summary-fps]', '24 FPS'));
      const spectrum = selectedText(panel, '[data-summary-spectrum]', '关闭 · 原生完整计算');
      const seed = panel.querySelector('[data-summary-seed]')?.value?.trim();
      const spectrumLabel = spectrum.startsWith('关闭') ? 'Spectrum 关' : 'Spectrum 开';
      context = `${model} · ${quality} · ${duration} · ${fps} · ${spectrumLabel} · ${seed ? 'Seed 固定' : 'Seed 随机'}`;
    }
    const titleNode = actionBar.querySelector('[data-action-title]');
    const contextNode = actionBar.querySelector('[data-action-context]');
    if (titleNode) titleNode.textContent = title;
    if (contextNode) contextNode.textContent = context;
  };
  const switchCreateMode = (mode) => {
    activeCreateMode = mode;
    root.querySelectorAll('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== mode; });
    root.querySelectorAll('[data-input-mode]').forEach((item) => item.classList.toggle('primary', item.dataset.inputMode === mode));
    updateCreateActionContext(mode);
  };
  root.querySelectorAll('[data-input-mode]').forEach((button) => {
    button.addEventListener('click', () => switchCreateMode(button.dataset.inputMode));
  });
  root.querySelectorAll('[data-summary-model],[data-summary-quality],[data-summary-duration],[data-summary-fps],[data-summary-spectrum],[data-summary-seed],[data-image-model],[data-image-format],[data-image-count],[data-image-seed-input]').forEach((field) => {
    field.addEventListener('input', () => updateCreateActionContext());
    field.addEventListener('change', () => updateCreateActionContext());
  });
  updateCreateActionContext();
  const spectrumMode = root.querySelector('[data-spectrum-mode]');
  const syncSpectrumModelAware = () => {
    const field = root.querySelector('[data-spectrum-model-aware]');
    if (field) field.hidden = spectrumMode?.value !== 'balanced';
  };
  spectrumMode?.addEventListener('change', syncSpectrumModelAware);
  syncSpectrumModelAware();
  root.querySelectorAll('[data-drag-demo]').forEach((well) => {
    ['dragenter','dragover'].forEach((name) => well.addEventListener(name, (event) => { event.preventDefault(); well.classList.add('dragging'); }));
    ['dragleave','drop'].forEach((name) => well.addEventListener(name, (event) => { event.preventDefault(); well.classList.remove('dragging'); }));
  });
  const imagePrompt = root.querySelector('[data-image-prompt]');
  const promptVersions = [
    '把 Picture 2 的人物放到 Picture 1 右侧靠窗的位置，右手举起来，融合自然一点；Picture 1 的其他内容尽量不要变化。',
    '将 Picture 2 的人物放到 Picture 1 右侧靠窗的位置。保持 Picture 2 的人物身份、面部特征、发型和服装；匹配 Picture 1 的透视、尺度、色温、光源方向、接触阴影、景深和胶片颗粒，使人物自然融入场景。仅让人物右手自然抬起挥手，不要改变 Picture 1 中其他内容。',
    '以 Picture 1 为基础画面，将 Picture 2 的人物置于右侧靠窗空位。严格保持 Picture 2 的身份、脸部、发型、服装与身体比例；仅让右手自然抬起挥手。统一人物与 Picture 1 的透视、尺度、暖色主光、接触阴影、边缘柔度、景深和胶片颗粒。保留 Picture 1 的背景结构和全部未指定内容；避免重复肢体、异常手指、重影、面部漂移和过度锐化。'
  ];
  let imagePromptIndex = 1;
  const addPromptClearButton = (textarea, onClear) => {
    if (!textarea) return;
    const actions = textarea.closest('.panel')?.querySelector('.section-head .actions');
    if (!actions || actions.querySelector('[data-prompt-clear]')) return;
    const button = document.createElement('button');
    button.className = 'btn icon-btn danger';
    button.type = 'button';
    button.dataset.promptClear = 'true';
    button.title = '清空当前提示词版本';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<i data-lucide="trash-2"></i>';
    const preset = actions.querySelector('select');
    if (preset) actions.insertBefore(button, preset);
    else actions.insertBefore(button, actions.firstChild);
    button.addEventListener('click', onClear);
    if (window.lucide) window.lucide.createIcons();
  };
  const renderImagePromptVersion = () => {
    if (!imagePrompt) return;
    imagePrompt.value = promptVersions[imagePromptIndex];
    const counter = root.querySelector('[data-image-prompt-counter]');
    if (counter) counter.textContent = `${imagePromptIndex + 1} / ${promptVersions.length}`;
    const previous = root.querySelector('[data-image-prompt-prev]');
    const next = root.querySelector('[data-image-prompt-next]');
    if (previous) previous.disabled = imagePromptIndex === 0;
    if (next) next.disabled = imagePromptIndex === promptVersions.length - 1;
  };
  const saveCurrentImagePrompt = () => {
    if (imagePrompt) promptVersions[imagePromptIndex] = imagePrompt.value;
  };
  addPromptClearButton(
    root.querySelector('[data-mode-panel="image"] textarea'),
    () => {
      const textarea = root.querySelector('[data-mode-panel="image"] textarea');
      if (textarea) textarea.value = '';
    }
  );
  addPromptClearButton(
    root.querySelector('[data-mode-panel="video"] textarea'),
    () => {
      const textarea = root.querySelector('[data-mode-panel="video"] textarea');
      if (textarea) textarea.value = '';
    }
  );
  addPromptClearButton(imagePrompt, () => {
    saveCurrentImagePrompt();
    if (promptVersions.length > 1) {
      promptVersions.splice(imagePromptIndex, 1);
      imagePromptIndex = Math.min(imagePromptIndex, promptVersions.length - 1);
    } else {
      promptVersions[0] = '';
    }
    renderImagePromptVersion();
  });
  root.querySelector('[data-image-prompt-prev]')?.addEventListener('click', () => {
    saveCurrentImagePrompt();
    imagePromptIndex = Math.max(0, imagePromptIndex - 1);
    renderImagePromptVersion();
  });
  root.querySelector('[data-image-prompt-next]')?.addEventListener('click', () => {
    saveCurrentImagePrompt();
    imagePromptIndex = Math.min(promptVersions.length - 1, imagePromptIndex + 1);
    renderImagePromptVersion();
  });
  root.querySelector('[data-insert-image-instruction]')?.addEventListener('click', () => {
    const select = root.querySelector('[data-image-instruction]');
    const instruction = select?.value?.trim();
    if (!imagePrompt || !instruction) return;
    const start = imagePrompt.selectionStart ?? imagePrompt.value.length;
    const end = imagePrompt.selectionEnd ?? start;
    const prefix = start > 0 && !/\s$/.test(imagePrompt.value.slice(0, start)) ? '\n' : '';
    imagePrompt.value = `${imagePrompt.value.slice(0, start)}${prefix}${instruction}${imagePrompt.value.slice(end)}`;
    imagePrompt.focus();
    imagePrompt.selectionStart = imagePrompt.selectionEnd = start + prefix.length + instruction.length;
    saveCurrentImagePrompt();
    select.value = '';
    const status = root.querySelector('[data-image-prompt-status]');
    if (status) status.textContent = '已插入，可继续添加';
  });
  root.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-edit-picture]');
    if (removeButton) {
      removeButton.closest('[data-edit-picture]')?.remove();
    }
  });
  root.querySelector('[data-add-edit-picture]')?.addEventListener('click', () => {
    const list = root.querySelector('[data-edit-picture-list]');
    if (!list) return;
    const used = [...list.querySelectorAll('[data-edit-picture]')].map((item) => Number(item.dataset.editPicture));
    const next = [2, 3, 4, 5, 6].find((number) => !used.includes(number));
    if (!next) return;
    const article = document.createElement('article');
    article.className = 'reference-slot';
    article.dataset.editPicture = String(next);
    article.innerHTML = `<div class="slot-thumb"><i data-lucide="image-plus"></i></div><div><strong>Picture ${next}</strong><p class="muted tiny">新参考图片</p></div><select aria-label="Picture ${next} 的作用"><option>自动</option><option>人物</option><option>物体</option><option>姿态</option><option>风格</option><option>背景</option></select><button class="btn icon-btn danger" data-remove-edit-picture title="删除 Picture ${next}"><i data-lucide="x"></i></button>`;
    list.appendChild(article);
    if (window.lucide) window.lucide.createIcons();
  });
  root.querySelector('[data-optimize-image-prompt]')?.addEventListener('click', () => {
    if (!imagePrompt) return;
    saveCurrentImagePrompt();
    const preset = root.querySelector('[data-image-prompt-preset]')?.selectedOptions?.[0]?.textContent ?? '综合编辑';
    const optimized = `${imagePrompt.value.trim()}\n\n执行要求：按照“${preset}”理解素材图与上方全部指令。准确识别目标对象和修改范围，未明确要求改变的内容应尽量保持一致。所有新增、移除和重绘区域都必须匹配原图的透视、尺度、光照、阴影、景深、噪点与材质。`;
    promptVersions.splice(imagePromptIndex + 1, 0, optimized);
    imagePromptIndex += 1;
    renderImagePromptVersion();
    const status = root.querySelector('[data-image-prompt-status]');
    if (status) status.textContent = '已生成新的优化版本';
  });
  if (imagePrompt) renderImagePromptVersion();
  const imageModelProfiles = {
    lama: { badge: '本地 · 无 Prompt', title: 'LaMa · 局部移除', description: '在 Picture 1 上用半透明高亮绘制一个或多个 Mask；提交时只发送干净原图和独立黑白 Mask，并保持原图尺寸。' },
    qwen: { badge: '本地', title: 'Qwen Image Edit 2511 FP8', description: '多 Picture 编辑与人物一致性主力；按输入顺序编译引用，输出比例默认跟随 Picture 1。' },
    flux: { badge: '本地 · 英文 Prompt', title: 'FLUX.1 Kontext Dev FP8', description: '适合目标修改、角色一致性与风格编辑；提示词助手会转换为更适合 Kontext 的英文指令。' },
    seedream: { badge: '云端 · 需要 API', title: 'Seedream 5.0 Lite', description: 'ComfyUI Partner Node 云端能力，不属于本地模型；使用前需配置 API 与额度，支持更高分辨率输出。' }
  };
  const renderImageModelProfile = () => {
    const model = root.querySelector('[data-image-model]')?.value ?? 'qwen';
    const profile = imageModelProfiles[model] ?? imageModelProfiles.qwen;
    const isLama = model === 'lama';
    const badge = root.querySelector('[data-image-model-badge]');
    const title = root.querySelector('[data-image-model-title]');
    const description = root.querySelector('[data-image-model-description]');
    if (badge) badge.textContent = profile.badge;
    if (title) title.textContent = profile.title;
    if (description) description.textContent = profile.description;
    root.querySelectorAll('[data-lama-hidden]').forEach((element) => {
      element.hidden = isLama;
      element.style.display = isLama ? 'none' : '';
    });
    const promptControls = root.querySelector('[data-image-prompt-controls]');
    const lamaPanel = root.querySelector('[data-lama-panel]');
    if (promptControls) promptControls.hidden = isLama;
    if (lamaPanel) lamaPanel.hidden = !isLama;
    const inputTitle = root.querySelector('[data-image-input-title]');
    const inputSummary = root.querySelector('[data-image-input-summary]');
    const markupLabel = root.querySelector('[data-image-markup-label]');
    if (inputTitle) inputTitle.textContent = isLama ? '待修复图片' : '参考图片';
    if (inputSummary) inputSummary.textContent = isLama ? 'LaMa 单图局部移除 · 原图不会被标记覆盖' : 'Qwen 多图编辑 · 当前 2 / 6';
    if (markupLabel) markupLabel.textContent = isLama ? '绘制移除区域' : '标记图片';
    const quality = root.querySelector('[data-image-quality]');
    if (quality) quality.innerHTML = isLama
      ? '<option>自然边缘</option><option>紧贴 Mask</option><option>扩大修补</option>'
      : '<option>原生质量</option><option>Lightning · 快速</option>';
    const format = root.querySelector('[data-image-format]');
    if (format) {
      if (isLama) format.value = 'png';
      format.disabled = isLama;
    }
  };
  root.querySelector('[data-image-model]')?.addEventListener('change', () => {
    renderImageModelProfile();
    renderImageBatchSettings();
  });
  renderImageModelProfile();
  const renderImageBatchSettings = () => {
    const count = Number(root.querySelector('[data-image-count]')?.value ?? 6);
    const seed = root.querySelector('[data-image-seed-input]')?.value.trim() ?? '';
    const isLama = root.querySelector('[data-image-model]')?.value === 'lama';
    const format = root.querySelector('[data-image-format]')?.selectedOptions?.[0]?.textContent.split(' · ')[0] ?? 'PNG';
    const countValue = root.querySelector('[data-image-count-value]');
    const versionBadge = root.querySelector('[data-image-version-badge]');
    const batchSummary = root.querySelector('[data-image-batch-summary]');
    const outputSummary = root.querySelector('[data-image-output-summary]');
    if (countValue) countValue.textContent = `${count} 张`;
    if (versionBadge) versionBadge.textContent = `预计 ${count} 个版本`;
    if (batchSummary) batchSummary.textContent = isLama
      ? `一个任务 · ${count} 张局部修补结果`
      : seed ? `一个任务 · ${count} 张使用相同 Seed ${seed}` : `一个任务 · ${count} 个随机 Seed 顺序生成`;
    if (outputSummary) outputSummary.textContent = isLama
      ? 'PNG · 保持原图尺寸 · 只处理 Mask 覆盖区域'
      : `${format} · 输出约 1536 × 1024 · 结果归入“黄昏机场人物素材”`;
    if (activeCreateMode === 'image-edit') updateCreateActionContext('image-edit');
  };
  root.querySelector('[data-image-count]')?.addEventListener('input', renderImageBatchSettings);
  root.querySelector('[data-image-format]')?.addEventListener('change', renderImageBatchSettings);
  root.querySelector('[data-image-seed-input]')?.addEventListener('input', renderImageBatchSettings);
  root.querySelector('[data-random-image-seed]')?.addEventListener('click', () => {
    const input = root.querySelector('[data-image-seed-input]');
    if (!input) return;
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    input.value = ((BigInt(values[0]) << 32n | BigInt(values[1])) % 10000000000000000n).toString();
    renderImageBatchSettings();
  });
  root.querySelector('[data-clear-image-seed]')?.addEventListener('click', () => {
    const input = root.querySelector('[data-image-seed-input]');
    if (input) input.value = '';
    renderImageBatchSettings();
  });
  renderImageBatchSettings();
  const switchImageVersion = (version) => {
    const source = root.querySelector(`[data-image-version="${version}"][data-image-seed]`);
    root.querySelectorAll('[data-image-version]').forEach((item) => item.classList.toggle('active', item.dataset.imageVersion === version));
    const stage = root.querySelector('[data-image-stage]');
    if (stage) stage.className = `image-stage variant-${Number(version)}`;
    const seed = source?.dataset.imageSeed ?? '672408119';
    const model = source?.dataset.imageModel ?? 'Qwen Image Edit';
    const meta = root.querySelector('[data-image-stage-meta]');
    const status = root.querySelector('[data-image-action-status]');
    if (meta) meta.textContent = `版本 ${version} · Seed ${seed} · ${model}`;
    root.querySelectorAll('[data-image-seed-label]').forEach((label) => { label.textContent = seed; });
    root.querySelectorAll('[data-image-model-label]').forEach((label) => { label.textContent = model; });
    if (status) status.textContent = version === '12' ? `版本 ${version} · 当前封面` : `版本 ${version} · 当前选中`;
  };
  root.querySelectorAll('[data-image-version]').forEach((button) => button.addEventListener('click', () => switchImageVersion(button.dataset.imageVersion)));
  const menu = root.querySelector('.context-menu');
  root.querySelectorAll('[data-context-card]').forEach((card) => card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!menu) return;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 240)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 250)}px`;
    menu.classList.add('open');
  }));
  document.addEventListener('click', () => menu?.classList.remove('open'));
  root.querySelectorAll('[data-open-dialog]').forEach((button) => button.addEventListener('click', () => root.querySelector(`#${button.dataset.openDialog}`)?.classList.add('open')));
  root.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('.dialog-backdrop')?.classList.remove('open')));
  const markupOverlay = root.querySelector('[data-image-markup-overlay]');
  root.querySelectorAll('[data-open-image-markup]').forEach((button) => button.addEventListener('click', () => {
    const isLama = root.querySelector('[data-image-model]')?.value === 'lama';
    const markupTitle = root.querySelector('[data-markup-title]');
    const saveLabel = root.querySelector('[data-markup-save-label]');
    const inspectorTitle = root.querySelector('[data-markup-inspector-title]');
    const inspectorCopy = root.querySelector('[data-markup-inspector-copy]');
    const footer = root.querySelector('[data-markup-footer]');
    if (markupTitle) markupTitle.textContent = isLama ? '绘制移除区域' : '标记 Picture 1';
    if (saveLabel) saveLabel.textContent = isLama ? '保存 Mask' : '保存标记';
    if (inspectorTitle) inspectorTitle.textContent = isLama ? 'Mask 说明' : '标记说明';
    if (inspectorCopy) inspectorCopy.textContent = isLama ? '用半透明高亮覆盖要移除的内容；可绘制多个区域。' : '区域会自动编号；说明会同时进入 Prompt。';
    if (footer) footer.textContent = isLama ? '高亮仅用于编辑显示；模型收到的是独立黑白 Mask。' : '最终图片会自动要求模型移除红框、箭头、编号和标注文字。';
    root.querySelectorAll('[data-annotation-tool],[data-annotation-demo]').forEach((element) => {
      element.hidden = isLama;
      element.style.display = isLama ? 'none' : '';
    });
    const maskDemo = root.querySelector('[data-mask-demo]');
    if (maskDemo) {
      maskDemo.hidden = !isLama;
      maskDemo.style.display = isLama ? 'block' : 'none';
    }
    root.querySelectorAll('[data-markup-tool]').forEach((tool) => {
      tool.classList.toggle('primary', tool.dataset.markupTool === (isLama ? 'highlight' : 'select'));
    });
    if (markupOverlay) markupOverlay.hidden = false;
  }));
  root.querySelectorAll('[data-markup-cancel],[data-markup-save]').forEach((button) => button.addEventListener('click', () => {
    if (markupOverlay) markupOverlay.hidden = true;
  }));
  root.querySelectorAll('[data-markup-tool]').forEach((button) => button.addEventListener('click', () => {
    root.querySelectorAll('[data-markup-tool]').forEach((item) => item.classList.toggle('primary', item === button));
  }));
  root.querySelectorAll('.dialog-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.classList.remove('open'); }));
  root.querySelectorAll('[data-demo-action]').forEach((button) => button.addEventListener('click', () => {
    const status = root.querySelector('[data-demo-status]');
    if (status) status.textContent = button.dataset.demoAction ?? '原型操作已触发';
  }));
  root.querySelectorAll('[data-demo-enqueue]').forEach((button) => button.addEventListener('click', () => {
    const panel = button.closest('[data-mode-panel]');
    const status = panel?.querySelector('[data-action-status]');
    if (status) {
      status.textContent = '已加入队列';
      status.classList.remove('warn', 'bad');
      status.classList.add('ok');
    }
    button.innerHTML = '<i data-lucide="check"></i>已加入队列';
    button.classList.remove('primary');
    button.classList.add('secondary');
    updateCreateActionContext(panel?.dataset.modePanel || activeCreateMode);
    if (window.lucide) window.lucide.createIcons();
  }));
  const params = new URLSearchParams(location.search);
  const requestedMode = params.get('mode');
  if (requestedMode) root.querySelector(`[data-input-mode="${requestedMode}"]`)?.click();
  if (params.get('slot') === '1') root.querySelector('[data-handoff-banner]')?.removeAttribute('hidden');
  if (params.get('project')) root.querySelector('[data-edit-project-banner]')?.removeAttribute('hidden');
  if (params.get('kind')) switchHistoryKind(params.get('kind'));
})();
