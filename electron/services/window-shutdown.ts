export type WindowShutdownStage = "services" | "storage";

export interface WindowShutdownDependencies {
  stopServices(): Promise<void>;
  saveStorage(): Promise<void>;
  onStage(stage: WindowShutdownStage): void;
  onComplete(): void;
  onError(error: unknown): void;
}

/** Coalesces native close clicks and preserves completed cleanup on retry. */
export class WindowShutdown {
  private operation: Promise<void> | null = null;
  private servicesStopped = false;

  constructor(private readonly deps: WindowShutdownDependencies) {}

  finish(): Promise<void> {
    if (this.operation) return this.operation;
    this.operation = Promise.resolve().then(async () => {
      if (!this.servicesStopped) {
        this.deps.onStage("services");
        await this.deps.stopServices();
        this.servicesStopped = true;
      }
      this.deps.onStage("storage");
      await this.deps.saveStorage();
      this.deps.onComplete();
      this.servicesStopped = false;
    }).catch(error => this.deps.onError(error)).finally(() => { this.operation = null; });
    return this.operation;
  }
}
