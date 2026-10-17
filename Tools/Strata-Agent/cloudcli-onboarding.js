// Only adds a skip action to upstream onboarding; chat and authentication remain CloudCLI's.
(() => {
  const id = 'strata-local-git-skip';
  function sync() {
    const visible = document.querySelector('#gitName') && document.querySelector('#gitEmail');
    const current = document.getElementById(id);
    if (!visible) { current?.remove(); return; }
    if (current) return;
    const panel = document.createElement('aside');
    panel.id = id;
    panel.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px;background:#172033;color:#fff;border:1px solid #64748b;border-radius:8px;max-width:90vw;font:14px sans-serif';
    const note = document.createElement('p');
    note.textContent = '本地聊天和文件工具无需设置全局 Git 身份。提交代码前可在项目内单独配置。';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '跳过 Git 全局配置，继续使用本地 Agent';
    button.style.cssText = 'padding:8px;color:#111;background:#fff;border:1px solid #aaa;border-radius:4px;cursor:pointer';
    button.onclick = async () => {
      button.disabled = true;
      try {
        const token = localStorage.getItem('auth-token');
        if (!token) throw new Error('请先创建或登录本地 GUI 账号。');
        const response = await fetch('/api/user/complete-onboarding', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) throw new Error('跳过失败，请重试。');
        location.reload();
      } catch (error) { note.textContent = error.message; button.disabled = false; }
    };
    panel.append(note, button);
    document.body.append(panel);
  }
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
  sync();
})();
