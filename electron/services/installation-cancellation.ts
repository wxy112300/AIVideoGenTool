import { AsyncLocalStorage } from "node:async_hooks";
import type { ConnectionResult, UiLocale } from "../../src/types.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";

const context = new AsyncLocalStorage<AbortSignal>();
let activeInstallations = 0;
let softwareMaintenance = false;
export function hasActiveInstallations(): boolean { return activeInstallations > 0; }
/** In-process exclusion; callers additionally hold the cross-process software/GPU lease. */
export async function withSoftwareMaintenance<T>(work: () => Promise<T>, locale?: UiLocale): Promise<T> {
  if (activeInstallations || softwareMaintenance) throw new Error(createNativeTranslator(locale).t(uiKeys.installService.softwareBusy));
  softwareMaintenance = true;
  try { return await work(); } finally { softwareMaintenance = false; }
}
export function installationSignal(): AbortSignal | undefined { return context.getStore(); }
export function checkInstallationCancelled(): void { installationSignal()?.throwIfAborted(); }

/** Each request owns only its subprocesses; cancellation waits for installer recovery. */
export class InstallationCancellation {
  constructor(private readonly getUiLocale: () => UiLocale | undefined = () => undefined) {}

  private text(key: string): string {
    return createNativeTranslator(this.getUiLocale()).t(key);
  }
  private readonly operations = new Map<string, { controller: AbortController; done: Promise<ConnectionResult> }>();

  run(id: string, install: () => Promise<ConnectionResult>, parentSignal?: AbortSignal): Promise<ConnectionResult> {
    if (softwareMaintenance) return Promise.resolve({ ok: false, message: this.text(uiKeys.installService.cleanupBusy) });
    if (this.operations.has(id)) return Promise.resolve({ ok: false, message: this.text(uiKeys.installService.alreadyRunning) });
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
          ? { ...result, cancelled: true, message: this.text(uiKeys.installService.cancelledWithLog) }
          : result;
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        return { ok: false, cancelled: true, message: this.text(uiKeys.installService.cancelled), log: error instanceof Error ? error.message : String(error) };
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
    if (!operation) return { ok: false, message: this.text(uiKeys.uiError.installInactive) };
    operation.controller.abort(new Error(this.text(uiKeys.installService.cancelReason)));
    const result = await operation.done;
    return result.cancelled ? { ...result, ok: true } : { ok: false, message: this.text(uiKeys.installService.finished) };
  }
}
