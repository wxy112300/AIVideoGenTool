// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDefaultSettings } from "../src/core/defaults";
import { renderStrataPreparationPanel, strataProgressPresentation, updateStrataInstallProgress } from "../src/renderer/pages/settings/strata-preparation";
import { withDownloadFileProgress } from "../electron/services/download-file-progress";

const settings = createDefaultSettings();
afterEach(() => { document.body.replaceChildren(); });
describe("Strata installation progress", () => {
  it("shows progress immediately outside folded details and hides it when idle", () => {
    document.body.innerHTML = renderStrataPreparationPanel(settings, undefined, value => value, { installing: true });
    const progress = document.querySelector<HTMLElement>("#strata-install-progress")!;
    expect(progress.hidden).toBe(false);
    expect(progress.closest("details")).toBeNull();
    expect(progress.querySelector("[role=progressbar]")?.classList.contains("indeterminate")).toBe(true);
    expect(progress.textContent).toContain("检查安装环境");
    document.body.innerHTML = renderStrataPreparationPanel(settings, undefined, value => value);
    expect(document.querySelector<HTMLElement>("#strata-install-progress")?.hidden).toBe(true);
  });

  it("patches actual download percentage then switches to an indeterminate stage without remounting or changing focus", () => {
    document.body.innerHTML = renderStrataPreparationPanel(settings, undefined, value => value, { installing: true });
    const input = document.querySelector<HTMLInputElement>("#strata-port")!, bar = document.querySelector<HTMLElement>("[role=progressbar]")!;
    input.focus(); input.value = "43128";
    updateStrataInstallProgress({ stage: "download", percent: 25, receivedBytes: 25000000, totalBytes: 100000000 }, "zh-CN");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.querySelector<HTMLElement>("span")?.style.width).toBe("25%");
    expect(bar.classList.contains("indeterminate")).toBe(false);
    const button = document.querySelector<HTMLButtonElement>("[data-install-active]")!;
    expect(button.dataset.installPercent).toBe("25");
    expect(button.style.getPropertyValue("--dependency-progress")).toBe("25");
    expect(button.querySelector(".node-running-label")?.textContent).toBe("25%");
    expect(document.querySelector("#strata-install-stage")?.textContent).toBe("下载引擎 · 25% · 25.0 / 100.0 MB");
    updateStrataInstallProgress({ stage: "packages" }, "zh-CN");
    expect(bar.classList.contains("indeterminate")).toBe(true);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(button.dataset.installPercent).toBe("indeterminate");
    expect(bar.querySelector<HTMLElement>("span")?.style.width).toBe("");
    expect(document.querySelector("#strata-install-stage")?.textContent).toBe("安装 Python 依赖");
    updateStrataInstallProgress({ stage: "assets" }, "zh-CN");
    expect(document.querySelector("#strata-install-stage")?.textContent).toBe("准备控制向量");
    expect(document.activeElement).toBe(input); expect(input.value).toBe("43128");
    expect(document.querySelector("[role=progressbar]")).toBe(bar);
  });

  it("keeps cancellation feedback and ignores late events on idle cards", () => {
    document.body.innerHTML = renderStrataPreparationPanel(settings, undefined, value => value, { installing: true, cancelling: true, progress: { stage: "download", percent: 60 } });
    updateStrataInstallProgress({ stage: "download", percent: 70 }, "zh-CN");
    expect(document.querySelector("#strata-install-stage")?.textContent).toBe("正在取消…");
    expect(document.querySelector("[role=progressbar]")?.hasAttribute("aria-valuenow")).toBe(false);
    document.body.innerHTML = renderStrataPreparationPanel(settings, undefined, value => value);
    updateStrataInstallProgress({ stage: "download", percent: 70 }, "zh-CN");
    expect(document.querySelector<HTMLElement>("#strata-install-progress")?.hidden).toBe(true);
    expect(document.querySelector("#strata-install-stage")?.textContent).toBe("检查安装环境");
  });

  it("does not invent a total install percentage, localizes stages and clamps invalid transfer values", () => {
    expect(strataProgressPresentation("en-US", { stage: "packages", percent: 80 })).toEqual({ label: "Installing Python packages", percent: null });
    expect(strataProgressPresentation("zh-TW", { stage: "source" }).label).toBe("取得原始碼");
    expect(strataProgressPresentation("zh-CN", { stage: "download", percent: NaN }).percent).toBeNull();
    expect(strataProgressPresentation("zh-CN", { stage: "download", percent: -10 }).percent).toBe(0);
    expect(strataProgressPresentation("zh-CN", { stage: "download", percent: 200 }).percent).toBe(100);
  });

  it.each([false, true])("reports real file growth and stops sampling on completion/failure (failure=%s)", async (failure) => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-progress-"));
    const filename = path.join(folder, "engine.partial"), report = vi.fn();
    let finish!: () => void, fail!: (error: Error) => void;
    const download = new Promise<void>((done, reject) => { finish = done; fail = reject; });
    const pending = withDownloadFileProgress(filename, 1024, report, () => download);
    try {
      expect(report).toHaveBeenCalledWith(0);
      await fs.writeFile(filename, Buffer.alloc(256));
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith(256), { timeout: 1500 });
      expect(report).not.toHaveBeenCalledWith(1024);
      if (failure) {
        const expectedFailure = expect(pending).rejects.toThrow("cancelled"); fail(new Error("cancelled")); await expectedFailure;
      } else {
        await fs.writeFile(filename, Buffer.alloc(1024)); finish(); await pending;
        expect(report).toHaveBeenLastCalledWith(1024);
      }
      const count = report.mock.calls.length;
      await fs.writeFile(filename, Buffer.alloc(512));
      await new Promise(done => setTimeout(done, 300));
      expect(report).toHaveBeenCalledTimes(count);
    } finally { finish(); await pending.catch(() => undefined); await fs.rm(folder, { recursive: true, force: true }); }
  });
});
