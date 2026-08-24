import { uiKeys } from "../../../core/i18n-keys";
const dragThreshold = 5;
const dragAnimationMs = 170;
const cardAnimationTokens = new WeakMap();
function reorderableTaskIds(context) {
    const state = context.getState();
    if (!state)
        return [];
    const runningIndex = state.queue.findIndex((task) => task.status === "running");
    return state.queue
        .filter((task, index) => task.status === "waiting" && (runningIndex < 0 || index > runningIndex))
        .map((task) => task.id);
}
function restoreInlineStyle(element, style) {
    if (style == null)
        element.removeAttribute("style");
    else
        element.setAttribute("style", style);
}
function listCards(list, ids, sourceCard) {
    const candidates = [...list.querySelectorAll("[data-queue-task-id]")];
    return ids
        .map((id) => candidates.find((card) => card !== sourceCard && card.dataset.queueTaskId === id))
        .filter((card) => Boolean(card));
}
function captureCardTops(list, sourceCard, placeholder) {
    return new Map([...list.querySelectorAll("[data-queue-task-id]")]
        .filter((card) => card !== sourceCard && card !== placeholder)
        .map((card) => [card, card.getBoundingClientRect().top]));
}
function animateCardsIntoPlace(list, sourceCard, placeholder, beforeTops) {
    const cards = [...list.querySelectorAll("[data-queue-task-id]")]
        .filter((card) => card !== sourceCard);
    cards.forEach((card) => {
        card.style.transition = "none";
        card.style.transform = "none";
    });
    const afterTops = new Map(cards.map((card) => [card, card.getBoundingClientRect().top]));
    for (const card of cards) {
        const beforeTop = beforeTops.get(card);
        const afterTop = afterTops.get(card);
        if (beforeTop == null || afterTop == null)
            continue;
        const delta = beforeTop - afterTop;
        if (Math.abs(delta) < 0.5)
            continue;
        const animationToken = (cardAnimationTokens.get(card) ?? 0) + 1;
        cardAnimationTokens.set(card, animationToken);
        card.style.transform = `translate3d(0, ${delta}px, 0)`;
        window.requestAnimationFrame(() => {
            if (!card.isConnected || cardAnimationTokens.get(card) !== animationToken)
                return;
            card.style.transition = `transform ${dragAnimationMs}ms cubic-bezier(.2,.8,.2,1)`;
            card.style.transform = "none";
            window.setTimeout(() => {
                if (cardAnimationTokens.get(card) !== animationToken)
                    return;
                card.style.transition = "";
                card.style.transform = "";
            }, dragAnimationMs + 30);
        });
    }
}
function pointerIsNearList(list, clientX, clientY) {
    const rect = list.getBoundingClientRect();
    return clientX >= rect.left - 32 && clientX <= rect.right + 32 && clientY >= rect.top - 80 && clientY <= rect.bottom + 80;
}
function resolveDropPosition(context, drag) {
    const ids = reorderableTaskIds(context);
    if (!ids.includes(drag.taskId))
        return null;
    if (!pointerIsNearList(drag.list, drag.pointerX, drag.pointerY))
        return null;
    const cards = listCards(drag.list, ids, drag.sourceCard);
    if (!cards.length)
        return null;
    const targetIndex = cards.findIndex((card) => {
        const rect = card.getBoundingClientRect();
        return drag.pointerY < rect.top + rect.height / 2;
    });
    if (targetIndex >= 0) {
        return { card: cards[targetIndex], side: "before", targetIndex };
    }
    const last = cards[cards.length - 1];
    return { card: last, side: "after", targetIndex: cards.length };
}
function movePlaceholder(drag, position) {
    const placeholder = drag.placeholder;
    if (!placeholder)
        return;
    const isAlreadyPlaced = position.side === "before"
        ? placeholder.nextElementSibling === position.card
        : placeholder.previousElementSibling === position.card;
    drag.target = position;
    if (isAlreadyPlaced)
        return;
    const beforeTops = captureCardTops(drag.list, drag.sourceCard, placeholder);
    if (position.side === "before")
        drag.list.insertBefore(placeholder, position.card);
    else
        position.card.after(placeholder);
    animateCardsIntoPlace(drag.list, drag.sourceCard, placeholder, beforeTops);
}
function projectedQueuePosition(context, drag) {
    const target = drag.target;
    const state = context.getState();
    if (!state || !target)
        return null;
    const reorderableIds = reorderableTaskIds(context);
    if (!reorderableIds.includes(drag.taskId))
        return null;
    const remainingIds = reorderableIds.filter((id) => id !== drag.taskId);
    const insertionIndex = Math.max(0, Math.min(target.targetIndex, remainingIds.length));
    const projectedReorderableIds = [...remainingIds];
    projectedReorderableIds.splice(insertionIndex, 0, drag.taskId);
    const reorderableIdSet = new Set(reorderableIds);
    let projectedReorderableIndex = 0;
    const projectedActiveIds = state.queue
        .filter((task) => task.status === "waiting" || task.status === "running")
        .map((task) => {
        if (!reorderableIdSet.has(task.id))
            return task.id;
        return projectedReorderableIds[projectedReorderableIndex++] ?? task.id;
    });
    const projectedIndex = projectedActiveIds.indexOf(drag.taskId);
    return projectedIndex >= 0 ? projectedIndex + 1 : null;
}
function updateDraggedRank(context, drag, queuePosition) {
    const rankValue = drag.sourceCard.querySelector("[data-queue-rank-value]");
    if (rankValue) {
        rankValue.textContent = queuePosition == null
            ? drag.originalRank ?? ""
            : String(queuePosition).padStart(2, "0");
    }
    const rankLabel = drag.sourceCard.querySelector("[data-queue-rank-label]");
    if (!rankLabel)
        return;
    if (queuePosition == null) {
        if (drag.originalRankLabel == null)
            rankLabel.removeAttribute("aria-label");
        else
            rankLabel.setAttribute("aria-label", drag.originalRankLabel);
        return;
    }
    rankLabel.setAttribute("aria-label", context.t(uiKeys.queue.card.queuePosition, { count: queuePosition }));
}
function updateDragVisuals(context, drag) {
    drag.sourceCard.style.left = `${drag.pointerX - drag.offsetX}px`;
    drag.sourceCard.style.top = `${drag.pointerY - drag.offsetY}px`;
    const position = resolveDropPosition(context, drag);
    if (!position) {
        drag.target = null;
        updateDraggedRank(context, drag, null);
        return;
    }
    movePlaceholder(drag, position);
    updateDraggedRank(context, drag, projectedQueuePosition(context, drag));
}
export function mountQueueDragSort(context, setState) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    let drag = null;
    const autoScrollFrame = { current: null };
    let autoScrollClientY = null;
    const stopAutoScrollLoop = () => {
        autoScrollClientY = null;
        if (autoScrollFrame.current != null) {
            window.cancelAnimationFrame(autoScrollFrame.current);
            autoScrollFrame.current = null;
        }
    };
    const tickAutoScroll = () => {
        autoScrollFrame.current = null;
        if (!drag || autoScrollClientY == null || drag.phase !== "dragging")
            return;
        const edge = 72;
        const distance = autoScrollClientY < edge
            ? autoScrollClientY - edge
            : autoScrollClientY > window.innerHeight - edge
                ? autoScrollClientY - (window.innerHeight - edge)
                : 0;
        if (distance === 0)
            return;
        const speed = Math.max(4, Math.min(24, Math.ceil(Math.abs(distance) / edge * 18)));
        window.scrollBy({ top: distance < 0 ? -speed : speed, behavior: "auto" });
        updateDragVisuals(context, drag);
        autoScrollFrame.current = window.requestAnimationFrame(tickAutoScroll);
    };
    const startAutoScrollLoop = (clientY) => {
        autoScrollClientY = clientY;
        if (autoScrollFrame.current == null)
            autoScrollFrame.current = window.requestAnimationFrame(tickAutoScroll);
    };
    const restoreDragDom = (current) => {
        updateDraggedRank(context, current, null);
        current.placeholder?.remove();
        restoreInlineStyle(current.sourceCard, current.sourceStyle);
        current.sourceCard.classList.remove("queue-dragging");
        document.body.classList.remove("queue-drag-active");
    };
    const cancelDrag = () => {
        if (!drag)
            return;
        const current = drag;
        drag = null;
        stopAutoScrollLoop();
        restoreDragDom(current);
    };
    const commitDrag = async (current, targetIndex) => {
        if (current.placeholder?.isConnected)
            current.placeholder.replaceWith(current.sourceCard);
        restoreInlineStyle(current.sourceCard, current.sourceStyle);
        current.sourceCard.classList.remove("queue-dragging");
        drag = null;
        try {
            context.reportUserAction("queue-reorder", { taskId: current.taskId, targetIndex });
            setState(await context.studio.reorderTask(current.taskId, targetIndex));
            context.requestRender();
        }
        catch (error) {
            updateDraggedRank(context, current, null);
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
            context.requestRender();
        }
    };
    const dropDrag = () => {
        if (!drag || drag.phase !== "dragging")
            return;
        const current = drag;
        const targetIndex = current.target?.targetIndex;
        stopAutoScrollLoop();
        if (targetIndex == null || !current.placeholder) {
            cancelDrag();
            return;
        }
        current.phase = "dropping";
        const placeholderRect = current.placeholder.getBoundingClientRect();
        current.sourceCard.style.transition = `left ${dragAnimationMs}ms cubic-bezier(.2,.8,.2,1), top ${dragAnimationMs}ms cubic-bezier(.2,.8,.2,1), box-shadow ${dragAnimationMs}ms ease`;
        window.requestAnimationFrame(() => {
            current.sourceCard.style.left = `${placeholderRect.left}px`;
            current.sourceCard.style.top = `${placeholderRect.top}px`;
        });
        window.setTimeout(() => {
            if (drag !== current)
                return;
            void commitDrag(current, targetIndex);
        }, dragAnimationMs + 20);
    };
    const activateDrag = (current) => {
        const rect = current.sourceCard.getBoundingClientRect();
        const placeholder = document.createElement("div");
        placeholder.className = "queue-drag-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.style.height = `${Math.max(48, rect.height)}px`;
        current.placeholder = placeholder;
        current.list.insertBefore(placeholder, current.sourceCard);
        current.sourceCard.style.position = "fixed";
        current.sourceCard.style.left = `${rect.left}px`;
        current.sourceCard.style.top = `${rect.top}px`;
        current.sourceCard.style.width = `${rect.width}px`;
        current.sourceCard.style.margin = "0";
        current.sourceCard.style.zIndex = "60";
        current.sourceCard.style.willChange = "left, top, box-shadow";
        current.sourceCard.style.transition = "none";
        current.sourceCard.classList.add("queue-dragging");
        document.body.classList.add("queue-drag-active");
        current.offsetX = current.startX - rect.left;
        current.offsetY = current.startY - rect.top;
        current.phase = "dragging";
        context.reportUserAction("queue-drag-start", { taskId: current.taskId });
    };
    const onPointerMove = (event) => {
        if (!drag || event.pointerId !== drag.pointerId || drag.phase === "dropping")
            return;
        drag.pointerX = event.clientX;
        drag.pointerY = event.clientY;
        if (drag.phase === "pressing") {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < dragThreshold)
                return;
            activateDrag(drag);
        }
        event.preventDefault();
        updateDragVisuals(context, drag);
        if (pointerIsNearList(drag.list, event.clientX, event.clientY))
            startAutoScrollLoop(event.clientY);
        else
            stopAutoScrollLoop();
    };
    const onPointerUp = (event) => {
        if (!drag || event.pointerId !== drag.pointerId)
            return;
        if (drag.phase === "pressing") {
            cancelDrag();
            return;
        }
        event.preventDefault();
        dropDrag();
    };
    const focusHandleAfterRender = (taskId) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const nextHandle = [...root.querySelectorAll("[data-queue-drag-handle]")]
                    .find((candidate) => candidate.dataset.queueDragHandle === taskId);
                nextHandle?.focus({ preventScroll: true });
            });
        });
    };
    const keyboardReorder = async (handle, event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
        const taskId = handle.dataset.queueDragHandle;
        if (!taskId)
            return;
        const ids = reorderableTaskIds(context);
        const currentIndex = ids.indexOf(taskId);
        if (currentIndex < 0)
            return;
        const targetIndex = event.key === "ArrowUp"
            ? currentIndex - 1
            : event.key === "ArrowDown"
                ? currentIndex + 1
                : event.key === "Home"
                    ? 0
                    : event.key === "End"
                        ? ids.length - 1
                        : null;
        if (targetIndex == null || targetIndex < 0 || targetIndex >= ids.length || targetIndex === currentIndex)
            return;
        event.preventDefault();
        context.reportUserAction("queue-keyboard-reorder", { taskId, targetIndex });
        try {
            setState(await context.studio.reorderTask(taskId, targetIndex));
            context.requestRender();
            focusHandleAfterRender(taskId);
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    root.querySelectorAll("[data-queue-drag-handle]").forEach((handle) => {
        handle.addEventListener("keydown", (event) => {
            void keyboardReorder(handle, event);
        }, { signal });
        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0)
                return;
            const taskId = handle.dataset.queueDragHandle;
            const sourceCard = handle.closest("[data-queue-task-id]");
            const list = handle.closest("[data-queue-drop-list]");
            if (!taskId || !sourceCard || !list || !reorderableTaskIds(context).includes(taskId))
                return;
            event.preventDefault();
            const rankValue = sourceCard.querySelector("[data-queue-rank-value]");
            const rankLabel = sourceCard.querySelector("[data-queue-rank-label]");
            drag = {
                taskId,
                handle,
                sourceCard,
                list,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                pointerX: event.clientX,
                pointerY: event.clientY,
                offsetX: 0,
                offsetY: 0,
                sourceStyle: sourceCard.getAttribute("style"),
                originalRank: rankValue?.textContent?.trim() ?? null,
                originalRankLabel: rankLabel?.getAttribute("aria-label") ?? null,
                placeholder: null,
                target: null,
                phase: "pressing"
            };
            try {
                handle.setPointerCapture(event.pointerId);
            }
            catch {
                // Window-level listeners keep the drag usable without capture.
            }
        }, { signal });
    });
    window.addEventListener("pointermove", onPointerMove, { signal, passive: false });
    window.addEventListener("pointerup", onPointerUp, { signal });
    window.addEventListener("pointercancel", (event) => {
        if (drag?.pointerId === event.pointerId && drag.phase !== "dropping")
            cancelDrag();
    }, { signal });
    root.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && drag) {
            event.preventDefault();
            cancelDrag();
        }
    }, { signal });
    return () => {
        cancelDrag();
        events.abort();
    };
}
