import { randomUUID } from "node:crypto";
import {
  createPromptRuntimeState,
  promptOperationIsActive,
  reducePromptRuntime,
  type PromptModelPhase,
  type PromptOperationOrigin,
  type PromptRuntimeActivePhase,
  type PromptRuntimePreSubmissionPhase,
  type PromptRuntimeServiceFacts,
  type PromptRuntimeState,
  type PromptRuntimeSubmittedPhase,
  type PromptTerminalStatus
} from "../../src/core/prompt-runtime-state.js";

type PromptRuntimeListener = (state: PromptRuntimeState) => void;

export interface PromptOperationLease {
  operationId: string;
  controller: AbortController;
  signal: AbortSignal;
}

export interface PromptCancellationRequest {
  operationId: string;
  promptId: string | null;
  phase: PromptRuntimeActivePhase;
}

/**
 * The main-process owner for prompt runtime state and cancellation identity.
 *
 * Side effects (ComfyUI startup, queue deletion, interrupt and model release)
 * remain injected by the IPC orchestration layer. This manager owns the facts
 * those effects act on, so renderer pages and backend callbacks cannot create
 * competing copies of prompt state.
 */
export class PromptRuntimeManager {
  private state: PromptRuntimeState;
  private readonly listeners = new Set<PromptRuntimeListener>();
  private activeController: AbortController | null = null;

  constructor(service: PromptRuntimeServiceFacts) {
    this.state = createPromptRuntimeState(service);
  }

  snapshot(): PromptRuntimeState {
    return structuredClone(this.state);
  }

  subscribe(listener: PromptRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  observeService(service: PromptRuntimeServiceFacts): void {
    this.transition({ type: "service-updated", service });
    if ((service.phase === "stopped" || service.phase === "error") && this.activeController) {
      this.activeController.abort(new Error(service.phase === "stopped"
        ? "ComfyUI 已退出。"
        : "ComfyUI 运行状态异常。"));
      this.activeController = null;
    }
  }

  beginOperation(
    origin: PromptOperationOrigin,
    retainModel: boolean,
    phase?: PromptRuntimePreSubmissionPhase
  ): PromptOperationLease {
    if (promptOperationIsActive(this.state)) {
      throw new Error("当前已有提示词任务正在运行。");
    }
    if (this.state.operation.phase === "terminal") {
      this.transition({
        type: "reset-terminal",
        operationId: this.state.operation.operationId
      });
    }
    const operationId = randomUUID();
    const controller = new AbortController();
    this.activeController = controller;
    this.transition({
      type: "begin-operation",
      operationId,
      origin,
      startedAt: Date.now(),
      retainModel,
      ...(phase ? { phase } : {})
    });
    return { operationId, controller, signal: controller.signal };
  }

  setOperationPhase(
    operationId: string,
    phase: PromptRuntimePreSubmissionPhase | PromptRuntimeSubmittedPhase,
    promptId?: string
  ): void {
    this.transition({
      type: "operation-phase",
      operationId,
      phase,
      ...(promptId ? { promptId } : {})
    });
  }

  markSubmitted(operationId: string, promptId: string): void {
    this.transition({ type: "prompt-submitted", operationId, promptId });
  }

  requestCancellation(): PromptCancellationRequest {
    const operation = this.state.operation;
    if (operation.phase === "idle" || operation.phase === "terminal") {
      throw new Error("当前没有正在运行的提示词任务。");
    }
    if (operation.phase === "cancel-requested") {
      return {
        operationId: operation.operationId,
        promptId: operation.promptId,
        phase: operation.phase
      };
    }
    const request = {
      operationId: operation.operationId,
      promptId: operation.promptId,
      phase: operation.phase
    };
    this.transition({ type: "cancel-requested", operationId: operation.operationId });
    this.activeController?.abort(new Error("提示词任务已取消。"));
    return request;
  }

  finishOperation(
    operationId: string,
    status: PromptTerminalStatus,
    reason?: string
  ): void {
    this.transition({
      type: "operation-terminal",
      operationId,
      status,
      ...(reason ? { reason } : {}),
      finishedAt: Date.now()
    });
    if (this.state.operation.phase === "terminal" && this.state.operation.operationId === operationId) {
      this.activeController = null;
    }
  }

  setModel(phase: PromptModelPhase, modelId?: string | null, operationId?: string): void {
    this.transition({
      type: "model-updated",
      modelPhase: phase,
      ...(modelId !== undefined ? { modelId } : {}),
      ...(operationId ? { operationId } : {})
    });
  }

  private transition(event: Parameters<typeof reducePromptRuntime>[1]): void {
    const next = reducePromptRuntime(this.state, event);
    if (next === this.state) return;
    this.state = next;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
