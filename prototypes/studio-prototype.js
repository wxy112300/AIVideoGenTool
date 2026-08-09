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
      const gallery = root.querySelector('.gallery');
      gallery?.classList.toggle('album', button.dataset.layout === 'album');
      root.querySelectorAll('[data-layout]').forEach((item) => item.classList.toggle('primary', item === button));
    });
  });
  root.querySelectorAll('[data-input-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-mode-panel]').forEach((panel) => panel.hidden = panel.dataset.modePanel !== button.dataset.inputMode);
      root.querySelectorAll('[data-input-mode]').forEach((item) => item.classList.toggle('primary', item === button));
    });
  });
  root.querySelectorAll('[data-drag-demo]').forEach((well) => {
    ['dragenter','dragover'].forEach((name) => well.addEventListener(name, (event) => { event.preventDefault(); well.classList.add('dragging'); }));
    ['dragleave','drop'].forEach((name) => well.addEventListener(name, (event) => { event.preventDefault(); well.classList.remove('dragging'); }));
  });
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
  root.querySelectorAll('.dialog-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.classList.remove('open'); }));
  root.querySelectorAll('[data-demo-action]').forEach((button) => button.addEventListener('click', () => {
    const status = root.querySelector('[data-demo-status]');
    if (status) status.textContent = button.dataset.demoAction ?? '原型操作已触发';
  }));
})();
