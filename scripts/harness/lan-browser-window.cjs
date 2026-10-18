// Browser-only smoke surface: intentionally no preload or window.studio.
const { app, BrowserWindow } = require("electron");
const target = process.argv.find((arg) => arg.startsWith("http://"));
if (!target || !["127.0.0.1", "localhost"].includes(new URL(target).hostname)) throw new Error("Expected an owned loopback browser URL");
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 420, height: 900, show: false, webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  window.webContents.setFrameRate(30);
  window.webContents.on("paint", () => {});
  await window.loadURL(target);
});
app.on("window-all-closed", () => app.quit());
