const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const screenshotPath = path.join(os.tmpdir(), "image-markup-visual-result.png");
const resultPath = path.join(os.tmpdir(), "image-markup-visual-result.json");

app.whenReady().then(async () => {
  let server;
  try {
    const { createServer } = await import("vite");
    server = await createServer({
      root: workspace,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 }
    });
    await server.listen();
    const url = `${server.resolvedUrls?.local[0] ?? ""}tests/fixtures/image-markup-visual.html`;
    const window = new BrowserWindow({ width: 1280, height: 840, show: false });
    await window.loadURL(url);
    let result = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      result = await window.webContents.executeJavaScript("window.__markupVerification ?? null");
      if (result?.ready) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!result?.ready) throw new Error("Markup verification page did not become ready");
    const screenshot = await window.webContents.capturePage();
    await fs.writeFile(screenshotPath, screenshot.toPNG());
    const tolerance = 1.5;
    const aligned = [result.wrapper, result.lower, result.upper].every((rect) =>
      Math.abs(rect.width - result.shell.width) <= tolerance &&
      Math.abs(rect.height - result.shell.height) <= tolerance &&
      Math.abs(rect.x - result.shell.x) <= tolerance &&
      Math.abs(rect.y - result.shell.y) <= tolerance
    );
    const { width: bitmapWidth, height: bitmapHeight } = screenshot.getSize();
    const bitmap = screenshot.toBitmap();
    const isGreen = (x, y) => {
      const pixelX = Math.max(0, Math.min(bitmapWidth - 1, Math.round(x)));
      const pixelY = Math.max(0, Math.min(bitmapHeight - 1, Math.round(y)));
      const offset = (pixelY * bitmapWidth + pixelX) * 4;
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      return green > 180 && red < 130 && blue < 170;
    };
    const edgeHasGreen = (x, y, horizontal) => {
      for (let offset = -8; offset <= 8; offset += 1) {
        if (isGreen(x + (horizontal ? 0 : offset), y + (horizontal ? offset : 0))) return true;
      }
      return false;
    };
    const shell = result.shell;
    const contentCoversCanvas = [
      edgeHasGreen(shell.x + shell.width / 2, shell.y + 3, true),
      edgeHasGreen(shell.x + shell.width / 2, shell.y + shell.height - 3, true),
      edgeHasGreen(shell.x + 3, shell.y + shell.height / 2, false),
      edgeHasGreen(shell.x + shell.width - 3, shell.y + shell.height / 2, false)
    ].every(Boolean);
    const interaction = await window.webContents.executeJavaScript(`(async () => {
      const stage = document.querySelector('.image-markup-stage');
      const upper = document.querySelector('.upper-canvas');
      const zoom = document.querySelector('[data-markup-zoom-value]');
      const stageRect = stage.getBoundingClientRect();
      const clientX = stageRect.left + stageRect.width / 2;
      const clientY = stageRect.top + stageRect.height / 2;
      const zoomBefore = zoom.textContent;
      stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -900, clientX, clientY, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const zoomAfter = zoom.textContent;
      const scrollBeforeDrag = { left: stage.scrollLeft, top: stage.scrollTop };
      upper.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX, clientY, bubbles: true, cancelable: true }));
      upper.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: clientX - 120, clientY: clientY - 80, bubbles: true, cancelable: true }));
      upper.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: clientX - 120, clientY: clientY - 80, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        zoomBefore,
        zoomAfter,
        scrollBeforeDrag,
        scrollAfterDrag: { left: stage.scrollLeft, top: stage.scrollTop }
      };
    })()`);
    const wheelZoomWorks = Number.parseInt(interaction.zoomAfter, 10) > Number.parseInt(interaction.zoomBefore, 10);
    const dragPanWorks = interaction.scrollAfterDrag.left - interaction.scrollBeforeDrag.left > 80 &&
      interaction.scrollAfterDrag.top - interaction.scrollBeforeDrag.top > 50;
    const arrowPreview = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-markup-fit]').click();
      document.querySelector('[data-markup-tool="arrow"]').click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const shell = document.querySelector('.image-markup-canvas-shell').getBoundingClientRect();
      const upper = document.querySelector('.upper-canvas');
      const start = { x: shell.left + shell.width * .25, y: shell.top + shell.height * .25 };
      const end = { x: shell.left + shell.width * .75, y: shell.top + shell.height * .75 };
      upper.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: start.x, clientY: start.y, bubbles: true, cancelable: true }));
      upper.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: end.x, clientY: end.y, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { start, end, midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
    })()`);
    const arrowScreenshot = await window.webContents.capturePage();
    const arrowSize = arrowScreenshot.getSize();
    const arrowBitmap = arrowScreenshot.toBitmap();
    const hasRedNear = (centerX, centerY) => {
      for (let y = Math.round(centerY) - 7; y <= Math.round(centerY) + 7; y += 1) {
        for (let x = Math.round(centerX) - 7; x <= Math.round(centerX) + 7; x += 1) {
          if (x < 0 || y < 0 || x >= arrowSize.width || y >= arrowSize.height) continue;
          const offset = (y * arrowSize.width + x) * 4;
          const blue = arrowBitmap[offset];
          const green = arrowBitmap[offset + 1];
          const red = arrowBitmap[offset + 2];
          if (red > 190 && green < 130 && blue < 150) return true;
        }
      }
      return false;
    };
    const liveArrowPreviewWorks = hasRedNear(arrowPreview.midpoint.x, arrowPreview.midpoint.y);
    await window.webContents.executeJavaScript(`(() => {
      const upper = document.querySelector('.upper-canvas');
      upper.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: ${arrowPreview.end.x}, clientY: ${arrowPreview.end.y}, bubbles: true, cancelable: true }));
    })()`);
    const cropInteraction = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-markup-crop]').click();
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const image = document.querySelector('[data-image-cropper-image]');
        if (image?.cropper) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const image = document.querySelector('[data-image-cropper-image]');
      const cropper = image?.cropper;
      if (!cropper) return { ready: false };
      cropper.setData({ x: 200, y: 100, width: 1200, height: 500 });
      document.querySelector('[data-cropper-apply]').click();
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (document.querySelector('[data-image-cropper-dialog]')?.hidden) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const canvas = document.querySelector('.lower-canvas');
      return {
        ready: true,
        dialogHidden: document.querySelector('[data-image-cropper-dialog]')?.hidden === true,
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0
      };
    })()`);
    const cropWorks = cropInteraction.ready && cropInteraction.dialogHidden &&
      cropInteraction.width === 1200 && cropInteraction.height === 500;
    const savedResult = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-markup-save]').click();
      const result = await window.__markupEditorPromise;
      return {
        objectCount: result?.objectCount ?? 0,
        crop: result?.crop ?? null,
        croppedPngByteLength: result?.croppedPng?.byteLength ?? 0
      };
    })()`);
    const cropSaveWorks = savedResult.objectCount > 0 &&
      savedResult.crop?.width === 1200 && savedResult.crop?.height === 500 &&
      savedResult.croppedPngByteLength > 0;
    await fs.writeFile(resultPath, JSON.stringify({
      ...result,
      aligned,
      contentCoversCanvas,
      wheelZoomWorks,
      dragPanWorks,
      liveArrowPreviewWorks,
      cropWorks,
      cropSaveWorks,
      savedResult,
      cropInteraction,
      interaction,
      screenshotPath
    }, null, 2));
    if (!aligned || !contentCoversCanvas || !wheelZoomWorks || !dragPanWorks || !liveArrowPreviewWorks || !cropWorks || !cropSaveWorks) process.exitCode = 1;
    window.destroy();
  } catch (error) {
    await fs.writeFile(resultPath, JSON.stringify({ error: error instanceof Error ? error.stack : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    if (server) await server.close();
    app.quit();
  }
}).catch(async (error) => {
  await fs.writeFile(resultPath, JSON.stringify({ error: error instanceof Error ? error.stack : String(error) }, null, 2));
  app.quit();
});
