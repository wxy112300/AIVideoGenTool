import { BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { libraryStorageProgressView, type LibraryStorageProgress } from "../src/core/library-storage-progress.js";

/** Read-only startup status: no preload, IPC or access to application/user data. */
export class LibraryStartupWindow {
  private window?: BrowserWindow;
  private latest?: LibraryStorageProgress;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private ready = false;
  private rendering = false;
  private dirty = false;

  constructor(private assetsDirectory: string, private onError: (error: unknown) => void) {}

  update(value: LibraryStorageProgress): void {
    if (this.disposed || value.operation !== "migration") return;
    this.latest = value; this.dirty = true;
    if (value.stage === "complete" && !this.window) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.window) void this.open(); else void this.render();
    }, this.window ? 100 : 250);
  }

  private async open(): Promise<void> {
    if (this.disposed || this.window || !this.latest) return;
    const view = libraryStorageProgressView(this.latest);
    const window = new BrowserWindow({
      title: `${view.title} · Local Video Studio`, width: 460, height: 216, useContentSize: true,
      show: false, resizable: false, maximizable: false, minimizable: true, closable: false,
      backgroundColor: "#191919", autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.on("closed", () => { this.window = undefined; this.ready = false; });
    try {
      // Use the production renderer's compiled theme, rather than a second token source.
      const name = (await fs.readdir(this.assetsDirectory)).find(name => /^index-.*\.css$/.test(name));
      const theme = name ? await fs.readFile(path.join(this.assetsDirectory, name), "utf8") : "";
      if (this.disposed || window.isDestroyed()) return;
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Local Video Studio</title><style>${theme}
        html,body{margin:0;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}body{display:block;background:var(--canvas,Canvas);color:var(--text-1,CanvasText);font:13px/1.5 Inter,"Segoe UI", "Microsoft YaHei UI",sans-serif}
        #library-startup-progress{box-sizing:border-box;padding:24px;display:flex;flex-direction:column;gap:16px;height:100%}
        #library-startup-progress h1{font-size:20px;line-height:1.25;font-weight:600;margin:0}
        .startup-stage-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
        #stage,#count,#hint{margin:0}#count{font-variant-numeric:tabular-nums;color:var(--text-2,CanvasText)}#hint{font-size:12px;color:var(--text-2,CanvasText)}
        progress{display:block;width:100%;height:8px;border:0;border-radius:4px;overflow:hidden;accent-color:var(--accent,Highlight)}
        progress::-webkit-progress-bar{background:var(--surface-3,ButtonFace);border-radius:4px}progress::-webkit-progress-value{background:var(--accent,Highlight);border-radius:4px}
      </style></head><body><main id="library-startup-progress" aria-busy="true"><h1 id="heading"></h1><div class="startup-stage-row"><p id="stage" role="status"></p><p id="count"></p></div><progress max="100"></progress><p id="hint"></p></main></body></html>`;
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      if (this.disposed || window.isDestroyed()) return;
      this.ready = true;
      await this.render();
      if (!this.disposed && !window.isDestroyed()) window.show();
    } catch (error) { if (!this.disposed) this.onError(error); }
  }

  private async render(): Promise<void> {
    if (!this.ready || this.disposed || !this.window || this.window.isDestroyed() || this.rendering || !this.latest) return;
    this.rendering = true;
    try {
      while (this.dirty && !this.disposed && this.window && !this.window.isDestroyed()) {
        this.dirty = false;
        const progress = this.latest, view = libraryStorageProgressView(progress);
        this.window.setTitle(`${view.title} · Local Video Studio`);
        await this.window.webContents.executeJavaScript(`(() => {
          const state=${JSON.stringify({ progress, view })}, root=document.documentElement;
          root.lang=state.progress.locale;
          Object.assign(root.dataset,state.progress.appearance);
          const pane=document.querySelector('#library-startup-progress');
          pane.dataset.operation=state.progress.operation;pane.dataset.scope=state.progress.scope??'library';pane.dataset.stage=state.progress.stage;
          pane.dataset.completed=String(state.progress.completed??'');pane.dataset.total=String(state.progress.total??'');
          for(const [id,text] of Object.entries({heading:state.view.title,stage:state.view.stage,count:state.view.count+(state.view.percent===undefined?'':' · '+state.view.percent+'%'),hint:state.view.hint})){
            const element=document.getElementById(id);if(element.textContent!==text)element.textContent=text;
          }
          const bar=document.querySelector('progress');bar.setAttribute('aria-label',state.view.stage);
          if(state.view.percent===undefined)bar.removeAttribute('value');else bar.value=state.view.percent;
        })()`);
      }
    } catch (error) { if (!this.disposed) this.onError(error); }
    finally { this.rendering = false; }
  }

  focus(): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show(); this.window.focus();
  }

  close(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.window?.destroy(); this.window = undefined;
  }
}
