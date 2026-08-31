export class QueueWorkerController {
  private worker: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private cleanup: Promise<void> | null = null;
  private pendingResume: {
    execute: () => Promise<void>;
    shouldRestart: () => boolean;
  } | null = null;

  get runningWorker(): Promise<void> | null {
    return this.worker;
  }

  get activeController(): AbortController | null {
    return this.controller;
  }

  get cleanupWorker(): Promise<void> | null {
    return this.cleanup;
  }

  trackCleanup(cleanup: Promise<void>): void {
    this.cleanup = cleanup;
    void cleanup.finally(() => {
      if (this.cleanup === cleanup) this.cleanup = null;
    }).catch(() => undefined);
  }

  beginTask(): AbortController {
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }

  endTask(controller?: AbortController): void {
    if (!controller || this.controller === controller) this.controller = null;
  }

  abort(reason: Error): void {
    this.controller?.abort(reason);
  }

  cancelPendingResume(): void {
    this.pendingResume = null;
  }

  resume(
    execute: () => Promise<void>,
    shouldRestart: () => boolean = () => true
  ): void {
    if (this.worker) {
      this.pendingResume = { execute, shouldRestart };
      return;
    }
    this.start(execute);
  }

  start(execute: () => Promise<void>): void {
    if (this.worker) return;
    this.pendingResume = null;
    this.worker = execute().finally(() => {
      this.worker = null;
      this.controller = null;
      const pendingResume = this.pendingResume;
      this.pendingResume = null;
      if (pendingResume?.shouldRestart()) {
        this.start(pendingResume.execute);
      }
    });
  }
}
