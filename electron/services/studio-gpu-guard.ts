import { GpuResourceLease } from "./gpu-resource-lease.js";
import { isLocalPortInUse, localEndpoint } from "./local-service-process.js";

/** App-wide admission; opening Studio alone never acquires or interrupts an Agent. */
export class StudioGpuGuard {
  private handingOff = false;
  private readonly lease: GpuResourceLease;
  constructor(private readonly deps: { busy(): boolean; releasePrompt(): Promise<unknown>; comfyUrl(): string }) {
    this.lease = new GpuResourceLease("studio", async () => {
      if (this.handingOff || this.deps.busy()) return false;
      this.handingOff = true;
      try {
        await this.deps.releasePrompt();
        // A remote/unowned/retained Comfy listener is not proof of free GPU. The user can
        // stop it in its owning app; never kill a listener to satisfy Agent admission.
        const endpoint = localEndpoint(this.deps.comfyUrl(), 8188);
        return Boolean(endpoint && !await isLocalPortInUse(endpoint.port) && !this.deps.busy());
      } finally { this.handingOff = false; }
    });
  }
  async acquire(): Promise<void> {
    if (this.handingOff) throw new Error("正在向独立 Agent 交接资源，请稍后重试。");
    await this.lease.acquire();
    if (this.handingOff) throw new Error("正在交接 GPU，未提交新任务。");
  }
  track(pid: number): Promise<void> { return this.lease.track(pid); }
}
