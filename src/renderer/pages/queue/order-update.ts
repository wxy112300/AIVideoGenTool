import type { AppState } from "../../../types";
import type { Translate } from "../../../core/i18n";
import { activeQueueTasks, normalizeQueuePauseBoundary } from "../../../core/queue";
import { uiKeys } from "../../../core/i18n-keys";
import type { RendererContext } from "../../contracts";
import { queueLayoutSignature } from "./helpers";

function orderIndependentSignature(state: AppState): string {
  return queueLayoutSignature({ ...state, queuePauseBoundary: undefined,
    queue: [...state.queue].sort((a, b) => a.id.localeCompare(b.id)) });
}

/** Only an order/divider change can reuse the complete cards and their media. */
export function patchQueueOrderDom(root: ParentNode, previous: AppState, next: AppState, t: Translate): boolean {
  if (document.body.classList.contains("queue-drag-active") ||
    orderIndependentSignature(previous) !== orderIndependentSignature(next)) return false;
  const list = root.querySelector<HTMLElement>("[data-queue-drop-list]");
  if (!list) return false;
  const active = activeQueueTasks(next.queue);
  const positions = new Map(active.map((task, index) => [task.id, index]));
  const waiting = active.filter(task => task.status === "waiting");
  if (!waiting.length) return false;
  const cards = new Map([...list.querySelectorAll<HTMLElement>(":scope > [data-queue-task-id]")]
    .map(card => [card.dataset.queueTaskId!, card]));
  if (cards.size !== waiting.length || waiting.some(task => {
    const card = cards.get(task.id);
    return !card?.querySelector("[data-queue-rank-value]") || !card.querySelector(".queue-rank") || !card.querySelector(".queue-task-title");
  })) return false;
  const boundary = normalizeQueuePauseBoundary(next.queue, next.queuePauseBoundary);
  const marker = list.querySelector<HTMLElement>("[data-queue-boundary-marker]");
  if (boundary !== undefined && !marker) return false;

  const nodes: HTMLElement[] = [];
  for (const task of waiting) {
    const card = cards.get(task.id)!;
    const index = positions.get(task.id)!;
    if (boundary === index && marker) nodes.push(marker);
    nodes.push(card);
    const rank = card.querySelector<HTMLElement>("[data-queue-rank-value]")!;
    const position = String(index + 1).padStart(2, "0");
    if (rank.textContent !== position) rank.textContent = position;
    card.querySelector(".queue-rank")!.setAttribute("aria-label", t(uiKeys.queue.card.queuePosition, { count: index + 1 }));
    const deferred = boundary !== undefined && index >= boundary;
    card.classList.toggle("queue-task-deferred", deferred);
    if (deferred) card.dataset.queueTaskDeferred = "true";
    else delete card.dataset.queueTaskDeferred;
    const badge = card.querySelector<HTMLElement>(".queue-task-title > .status.deferred");
    if (deferred && !badge) {
      const status = document.createElement("span");
      status.className = "status deferred";
      status.textContent = t(uiKeys.task.deferred);
      card.querySelector(".queue-task-title > h3")?.after(status);
    } else if (!deferred) badge?.remove();
  }
  if (marker && boundary === active.length) nodes.push(marker);
  if (boundary === undefined) marker?.remove();
  // moveBefore preserves focus and video decode state on supported Chromium.
  const stableList = list as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
  let cursor = list.firstElementChild;
  for (const node of nodes) {
    if (node !== cursor) {
      if (stableList.moveBefore) stableList.moveBefore(node, cursor);
      else list.insertBefore(node, cursor);
    }
    cursor = node.nextElementSibling;
  }
  return true;
}

export function applyQueueOrderState(context: RendererContext, setState: (state: AppState) => void, next: AppState): void {
  const previous = context.getState();
  setState(next);
  if (!previous || context.getRoute().page !== "queue" || !patchQueueOrderDom(context.root, previous, next, context.t)) {
    context.requestRender();
  }
}
