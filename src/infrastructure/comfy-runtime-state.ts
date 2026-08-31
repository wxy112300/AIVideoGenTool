import type {
  ComfyRuntimeOwnership,
  ComfyRuntimePhase,
  ComfyRuntimeState
} from "../types.js";

type RuntimeListener = (state: ComfyRuntimeState) => void;

const initialState = (): ComfyRuntimeState => ({
  phase: "unknown",
  ownership: "unknown",
  endpoint: "",
  message: "尚未检查 ComfyUI 运行状态。",
  updatedAt: new Date().toISOString(),
  operationId: 0
});

export class ComfyRuntimeStateController {
  private state = initialState();
  private readonly listeners = new Set<RuntimeListener>();
  private operationCounter = 0;
  private consecutiveUnreachableChecks = 0;
  private settleWaiters = new Set<(state: ComfyRuntimeState) => void>();

  snapshot(): ComfyRuntimeState {
    return { ...this.state };
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  begin(
    phase: Extract<ComfyRuntimePhase, "starting" | "restarting" | "stopping">,
    endpoint: string,
    message: string,
    ownership: ComfyRuntimeOwnership = this.state.ownership
  ): number {
    const operationId = ++this.operationCounter;
    this.replace({ phase, endpoint, message, ownership, operationId });
    return operationId;
  }

  finish(
    operationId: number,
    phase: Extract<ComfyRuntimePhase, "ready" | "stopped" | "error">,
    message: string,
    ownership: ComfyRuntimeOwnership = this.state.ownership
  ): ComfyRuntimeState {
    if (operationId !== this.state.operationId) return this.snapshot();
    this.replace({ phase, message, ownership });
    return this.snapshot();
  }

  markStopped(
    endpoint: string,
    message: string,
    ownership: ComfyRuntimeOwnership = "none"
  ): ComfyRuntimeState {
    const operationId = ++this.operationCounter;
    this.replace({
      phase: "stopped",
      endpoint,
      message,
      ownership,
      operationId
    });
    return this.snapshot();
  }

  observeReachability(
    reachable: boolean,
    endpoint: string,
    ownership: ComfyRuntimeOwnership = this.state.ownership,
    taskActive = false
  ): ComfyRuntimeState {
    if (["starting", "restarting", "stopping"].includes(this.state.phase)) {
      return this.snapshot();
    }
    if (!reachable && taskActive && ownership === "app") {
      this.consecutiveUnreachableChecks = 0;
      this.replace({
        phase: "ready",
        endpoint,
        ownership,
        message: "ComfyUI 正在执行任务；接口可能暂时无法响应。"
      });
      return this.snapshot();
    }
    if (reachable) {
      this.consecutiveUnreachableChecks = 0;
      this.replace({
        phase: "ready",
        endpoint,
        ownership: ownership === "unknown" || ownership === "none" ? "external" : ownership,
        message: "ComfyUI 已连接并可用。"
      });
    } else {
      this.consecutiveUnreachableChecks += 1;
      const previouslyObserved = this.state.phase === "ready" ||
        this.state.phase === "degraded" ||
        this.state.ownership === "app" ||
        this.state.ownership === "external";
      this.replace({
        phase: previouslyObserved && this.consecutiveUnreachableChecks < 2 ? "degraded" : "stopped",
        endpoint,
        ownership,
        message: previouslyObserved && this.consecutiveUnreachableChecks < 2
          ? "ComfyUI 接口暂时不可用，正在继续检查。"
          : "ComfyUI 当前未连接。"
      });
    }
    return this.snapshot();
  }

  async waitForSettled(timeoutMs: number): Promise<ComfyRuntimeState> {
    if (!["starting", "restarting", "stopping"].includes(this.state.phase)) {
      return this.snapshot();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (state: ComfyRuntimeState): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.settleWaiters.delete(finish);
        resolve({ ...state });
      };
      const timer = setTimeout(() => finish(this.state), timeoutMs);
      this.settleWaiters.add(finish);
    });
  }

  private replace(patch: Partial<ComfyRuntimeState>): void {
    const next = {
      ...this.state,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const changed = next.phase !== this.state.phase ||
      next.ownership !== this.state.ownership ||
      next.endpoint !== this.state.endpoint ||
      next.message !== this.state.message ||
      next.operationId !== this.state.operationId;
    this.state = next;
    if (!changed) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
    if (!["starting", "restarting", "stopping"].includes(snapshot.phase)) {
      const waiters = [...this.settleWaiters];
      this.settleWaiters.clear();
      for (const waiter of waiters) waiter(snapshot);
    }
  }
}

export const comfyRuntimeState = new ComfyRuntimeStateController();
