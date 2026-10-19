import { AsyncLocalStorage } from "node:async_hooks";
import type { ConnectionResult } from "../../src/types.js";

const context = new AsyncLocalStorage<AbortSignal>();
let activeInstallations = 0;
let softwareMaintenance = false;
export function hasActiveInstallations(): boolean { return activeInstallations > 0; }
/** In-process exclusion; callers additionally hold the cross-process software/GPU lease. */
export async function withSoftwareMaintenance<T>(work: () => Promise<T>): Promise<T> {
  if (activeInstallations || softwareMaintenance) throw new Error("软件正在安装或清理，请等待完成后再试。");
  softwareMaintenance = true;
  try { return await work(); } finally { softwareMaintenance = false; }
}
export function installationSignal(): AbortSignal | undefined { return context.getStore(); }
export function checkInstallationCancelled(): void { installationSignal()?.throwIfAborted(); }

/** Each request owns only its subprocesses; cancellation waits for installer recovery. */
export class InstallationCancellation {
  private readonly operations = new Map<string, { controller: AbortController; done: Promise<ConnectionResult> }>();

  run(id: string, install: () => Promise<ConnectionResult>, parentSignal?: AbortSignal): Promise<ConnectionResult> {
    if (softwareMaintenance) return Promise.resolve({ ok: false, message: "正在清理旧软件，请等待完成后再安装。" });
    if (this.operations.has(id)) return Promise.resolve({ ok: false, message: "该安装正在执行，请等待当前操作结束。" });
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    // Register before invoking install, including synchronous progress callbacks.
    activeInstallations++;
    const done = Promise.resolve().then(() => context.run(controller.signal, async () => {
      try {
        checkInstallationCancelled();
        const result = await install();
        return controller.signal.aborted && !result.ok
          ? { ...result, cancelled: true, message: "安装已取消。可查看日志并重新安装。" }
          : result;
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        return { ok: false, cancelled: true, message: "安装已取消。", log: error instanceof Error ? error.message : String(error) };
      }
    })).finally(() => {
      parentSignal?.removeEventListener("abort", abortFromParent);
      this.operations.delete(id);
      activeInstallations--;
    });
    this.operations.set(id, { controller, done });
    return done;
  }

  async cancel(id: string): Promise<ConnectionResult> {
    const operation = this.operations.get(id);
    if (!operation) return { ok: false, message: "该安装已结束或尚未开始。" };
    operation.controller.abort(new Error("用户取消安装"));
    const result = await operation.done;
    return result.cancelled ? { ...result, ok: true } : { ok: false, message: "安装已经完成，未中止已完成的操作。" };
  }
}
