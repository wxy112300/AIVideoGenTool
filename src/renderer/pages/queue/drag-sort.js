import { uiKeys } from "../../../core/i18n-keys";
import { activeQueueTaskIds, activeQueueTasks } from "../../../core/queue";
const dragThreshold = 5;
const dragAnimationMs = 170;
const cardAnimationTokens = new WeakMap();
function pendingTaskIds(context) {
    const state = context.getState();
    if (!state)
        return [];
    return activeQueueTaskIds(state.queue).filter((taskId) => state.queue.some((task) => task.id === taskId && task.status === "waiting"));
}
function reorderableTaskIds(context) {
    const state = context.getState();
    if (!state)
        return [];
    const tasks = activeQueueTasks(state.queue);
    const runningIndex = tasks.findIndex((task) => task.status === "running");
    return tasks
        .filter((task, index) => task.status === "waiting" && (runningIndex < 0 || index > runningIndex))
        .map((task) => task.id);
}
function resolvePauseBoundaryDrop(context, drag) {
    const state = context.getState();
    const rawBoundary = state?.queuePauseBoundary;
    if (!state || !Number.isInteger(rawBoundary))
        return undefined;
    const marker = drag.list.querySelector("[data-queue-boundary-marker]");
    if (!marker)
        return undefined;
    const activeIds = activeQueueTaskIds(state.queue);
    const sourceIndex = activeIds.indexOf(drag.taskId);
    if (sourceIndex < 0 || activeIds.length < 2)
        return undefined;
    const boundary = Math.max(1, Math.min(activeIds.length, rawBoundary));
    const markerRect = marker.getBoundingClientRect();
    const markerMiddle = markerRect.top + markerRect.height / 2;
    if (sourceIndex >= boundary && drag.pointerY <= markerMiddle && boundary < activeIds.length) {
        return { target: boundary + 1, side: "before" };
    }
    if (sourceIndex < boundary && drag.pointerY >= markerMiddle && boundary > 1) {
        return { target: boundary - 1, side: "after" };
    }
    return undefined;
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
    const boundaryDrop = resolvePauseBoundaryDrop(context, drag);
    const targetIndex = cards.findIndex((card) => {
        const rect = card.getBoundingClientRect();
        return drag.pointerY < rect.top + rect.height / 2;
    });
    if (targetIndex >= 0) {
        return {
            card: cards[targetIndex],
            side: "before",
            targetIndex,
            pauseBoundaryTarget: boundaryDrop?.target,
            pauseBoundarySide: boundaryDrop?.side
        };
    }
    const last = cards[cards.length - 1];
    return {
        card: last,
        side: "after",
        targetIndex: cards.length,
        pauseBoundaryTarget: boundaryDrop?.target,
        pauseBoundarySide: boundaryDrop?.side
    };
}
function resolveBoundaryDropIndex(context, drag) {
    if (!pointerIsNearList(drag.list, drag.pointerX, drag.pointerY))
        return null;
    const cards = listCards(drag.list, pendingTaskIds(context), drag.sourceMarker);
    const targetIndex = cards.findIndex((card) => {
        const rect = card.getBoundingClientRect();
        return drag.pointerY < rect.top + rect.height / 2;
    });
    const running = context.getState()?.queue.some((task) => task.status === "running") ?? false;
    const minimumInsertionIndex = running ? 0 : 1;
    return Math.max(minimumInsertionIndex, targetIndex >= 0 ? targetIndex : cards.length);
}
function moveBoundaryPlaceholder(context, drag, targetIndex) {
    const placeholder = drag.placeholder;
    if (!placeholder)
        return;
    const cards = listCards(drag.list, pendingTaskIds(context), drag.sourceMarker);
    const targetCard = cards[targetIndex];
    const isAlreadyPlaced = targetCard
        ? placeholder.nextElementSibling === targetCard
        : placeholder.parentElement === drag.list && placeholder === drag.list.lastElementChild;
    drag.targetIndex = targetIndex;
    if (isAlreadyPlaced)
        return;
    const beforeTops = captureCardTops(drag.list, drag.sourceMarker, placeholder);
    if (targetCard)
        drag.list.insertBefore(placeholder, targetCard);
    else
        drag.list.append(placeholder);
    animateCardsIntoPlace(drag.list, drag.sourceMarker, placeholder, beforeTops);
}
function movePlaceholder(drag, position) {
    const placeholder = drag.placeholder;
    if (!placeholder)
        return;
    const marker = position.pauseBoundarySide
        ? drag.list.querySelector("[data-queue-boundary-marker]")
        : null;
    const cardIsAfterMarker = marker && position.card !== marker
        ? Boolean(marker.compareDocumentPosition(position.card) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false;
    const placeBeforeMarker = position.pauseBoundarySide === "before" && Boolean(marker) && cardIsAfterMarker;
    const placeAfterMarker = position.pauseBoundarySide === "after" && Boolean(marker) && !cardIsAfterMarker;
    const isAlreadyPlaced = placeBeforeMarker
        ? placeholder.nextElementSibling === marker
        : placeAfterMarker
            ? placeholder.previousElementSibling === marker
            : position.side === "before"
                ? placeholder.nextElementSibling === position.card
                : placeholder.previousElementSibling === position.card;
    drag.target = position;
    if (isAlreadyPlaced)
        return;
    const beforeTops = captureCardTops(drag.list, drag.sourceCard, placeholder);
    if (placeBeforeMarker)
        drag.list.insertBefore(placeholder, marker);
    else if (placeAfterMarker)
        marker.after(placeholder);
    else if (position.side === "before")
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
    const projectedActiveIds = activeQueueTaskIds(state.queue).map((taskId) => {
        if (!reorderableIdSet.has(taskId))
            return taskId;
        return projectedReorderableIds[projectedReorderableIndex++] ?? taskId;
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
function updateBoundaryDragVisuals(context, drag) {
    drag.sourceMarker.style.left = `${drag.pointerX - drag.offsetX}px`;
    drag.sourceMarker.style.top = `${drag.pointerY - drag.offsetY}px`;
    const targetIndex = resolveBoundaryDropIndex(context, drag);
    if (targetIndex == null) {
        drag.targetIndex = null;
        return;
    }
    moveBoundaryPlaceholder(context, drag, targetIndex);
}
export function mountQueueDragSort(context, setState) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    let drag = null;
    let boundaryDrag = null;
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
        const activeDrag = drag ?? boundaryDrag;
        if (!activeDrag || autoScrollClientY == null || activeDrag.phase !== "dragging")
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
        if (drag)
            updateDragVisuals(context, drag);
        else if (boundaryDrag)
            updateBoundaryDragVisuals(context, boundaryDrag);
        autoScrollFrame.current = window.requestAnimationFrame(tickAutoScroll);
    };
    const startAutoScrollLoop = (clientY) => {
        autoScrollClientY = clientY;
        if (autoScrollFrame.current == null)
            autoScrollFrame.current = window.requestAnimationFrame(tickAutoScroll);
    };
    const clearQueueDragState = () => {
        document.body.classList.remove("queue-drag-active");
    };
    const restoreDragDom = (current) => {
        updateDraggedRank(context, current, null);
        current.placeholder?.remove();
        restoreInlineStyle(current.sourceCard, current.sourceStyle);
        current.sourceCard.classList.remove("queue-dragging");
        clearQueueDragState();
    };
    const restoreBoundaryDragDom = (current) => {
        current.placeholder?.remove();
        restoreInlineStyle(current.sourceMarker, current.sourceStyle);
        current.sourceMarker.classList.remove("queue-pause-boundary-dragging");
        clearQueueDragState();
    };
    const cancelDrag = () => {
        if (!drag) {
            clearQueueDragState();
            return;
        }
        const current = drag;
        drag = null;
        stopAutoScrollLoop();
        restoreDragDom(current);
    };
    const cancelBoundaryDrag = () => {
        if (!boundaryDrag) {
            clearQueueDragState();
            return;
        }
        const current = boundaryDrag;
        boundaryDrag = null;
        stopAutoScrollLoop();
        restoreBoundaryDragDom(current);
    };
    const cancelActiveDrag = () => {
        if (drag)
            cancelDrag();
        else if (boundaryDrag)
            cancelBoundaryDrag();
        else
            clearQueueDragState();
    };
    const cancelDragOnWindowExit = () => {
        if (drag?.phase === "dropping" || boundaryDrag?.phase === "dropping")
            return;
        cancelActiveDrag();
    };
    const commitDrag = async (current, targetIndex, pauseBoundaryTarget) => {
        if (current.placeholder?.isConnected)
            current.placeholder.replaceWith(current.sourceCard);
        restoreDragDom(current);
        drag = null;
        try {
            context.reportUserAction("queue-reorder", {
                taskId: current.taskId,
                targetIndex,
                ...(pauseBoundaryTarget === undefined ? {} : { pauseBoundaryTarget })
            });
            const nextState = pauseBoundaryTarget === undefined
                ? await context.application.reorderTask(current.taskId, targetIndex)
                : await context.application.reorderTask(current.taskId, targetIndex, pauseBoundaryTarget);
            setState(nextState);
            context.requestRender();
        }
        catch (error) {
            updateDraggedRank(context, current, null);
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
            context.requestRender();
        }
    };
    const commitBoundaryDrag = async (current, targetIndex) => {
        if (current.placeholder?.isConnected)
            current.placeholder.replaceWith(current.sourceMarker);
        restoreBoundaryDragDom(current);
        boundaryDrag = null;
        try {
            context.reportUserAction("queue-boundary-drag", { targetIndex });
                setState(await context.application.setQueuePauseBoundary(targetIndex));
            context.requestRender();
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
            context.requestRender();
        }
    };
    const dropDrag = () => {
        if (!drag || drag.phase !== "dragging")
            return;
        const current = drag;
        const targetIndex = current.target?.targetIndex;
        const pauseBoundaryTarget = current.target?.pauseBoundaryTarget;
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
            void commitDrag(current, targetIndex, pauseBoundaryTarget);
        }, dragAnimationMs + 20);
    };
    const dropBoundaryDrag = () => {
        if (!boundaryDrag || boundaryDrag.phase !== "dragging")
            return;
        const current = boundaryDrag;
        const targetIndex = current.targetIndex;
        stopAutoScrollLoop();
        if (targetIndex == null || !current.placeholder) {
            cancelBoundaryDrag();
            return;
        }
        current.phase = "dropping";
        const placeholderRect = current.placeholder.getBoundingClientRect();
        current.sourceMarker.style.transition = `left ${dragAnimationMs}ms cubic-bezier(.2,.8,.2,1), top ${dragAnimationMs}ms cubic-bezier(.2,.8,.2,1), box-shadow ${dragAnimationMs}ms ease`;
        window.requestAnimationFrame(() => {
            current.sourceMarker.style.left = `${placeholderRect.left}px`;
            current.sourceMarker.style.top = `${placeholderRect.top}px`;
        });
        window.setTimeout(() => {
            if (boundaryDrag !== current)
                return;
            void commitBoundaryDrag(current, targetIndex);
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
    const activateBoundaryDrag = (current) => {
        const rect = current.sourceMarker.getBoundingClientRect();
        const placeholder = document.createElement("div");
        placeholder.className = "queue-boundary-drag-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.style.height = `${Math.max(56, rect.height)}px`;
        current.placeholder = placeholder;
        current.list.insertBefore(placeholder, current.sourceMarker);
        current.sourceMarker.style.position = "fixed";
        current.sourceMarker.style.left = `${rect.left}px`;
        current.sourceMarker.style.top = `${rect.top}px`;
        current.sourceMarker.style.width = `${rect.width}px`;
        current.sourceMarker.style.margin = "0";
        current.sourceMarker.style.zIndex = "60";
        current.sourceMarker.style.willChange = "left, top, box-shadow";
        current.sourceMarker.style.transition = "none";
        current.sourceMarker.classList.add("queue-pause-boundary-dragging");
        document.body.classList.add("queue-drag-active");
        current.offsetX = current.startX - rect.left;
        current.offsetY = current.startY - rect.top;
        current.phase = "dragging";
        context.reportUserAction("queue-boundary-drag-start");
    };
    const onPointerMove = (event) => {
        if (drag) {
            if (event.pointerId !== drag.pointerId || drag.phase === "dropping")
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
            return;
        }
        if (!boundaryDrag || event.pointerId !== boundaryDrag.pointerId || boundaryDrag.phase === "dropping")
            return;
        boundaryDrag.pointerX = event.clientX;
        boundaryDrag.pointerY = event.clientY;
        if (boundaryDrag.phase === "pressing") {
            if (Math.hypot(event.clientX - boundaryDrag.startX, event.clientY - boundaryDrag.startY) < dragThreshold)
                return;
            activateBoundaryDrag(boundaryDrag);
        }
        event.preventDefault();
        updateBoundaryDragVisuals(context, boundaryDrag);
        if (pointerIsNearList(boundaryDrag.list, event.clientX, event.clientY))
            startAutoScrollLoop(event.clientY);
        else
            stopAutoScrollLoop();
    };
    const onPointerUp = (event) => {
        if (drag) {
            if (event.pointerId !== drag.pointerId)
                return;
            if (drag.phase === "pressing") {
                cancelDrag();
                return;
            }
            event.preventDefault();
            dropDrag();
            return;
        }
        if (!boundaryDrag || event.pointerId !== boundaryDrag.pointerId)
            return;
        if (boundaryDrag.phase === "pressing") {
            cancelBoundaryDrag();
            return;
        }
        event.preventDefault();
        dropBoundaryDrag();
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
    const focusBoundaryAfterRender = () => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                root.querySelector("[data-queue-boundary-drag]")?.focus({ preventScroll: true });
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
            setState(await context.application.reorderTask(taskId, targetIndex));
            context.requestRender();
            focusHandleAfterRender(taskId);
        }
        catch (error) {
            context.notify(error instanceof Error ? error.message : String(error), { kind: "error" });
        }
    };
    const keyboardMoveBoundary = async (handle, event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
        const state = context.getState();
        const boundary = state?.queuePauseBoundary;
        if (!state || !Number.isInteger(boundary))
            return;
        const ids = pendingTaskIds(context);
        const running = state.queue.some((task) => task.status === "running");
        const minimumIndex = running ? 0 : 1;
        const currentIndex = Math.max(minimumIndex, Math.min(ids.length, boundary - (running ? 1 : 0)));
        const targetIndex = event.key === "ArrowUp"
            ? currentIndex - 1
            : event.key === "ArrowDown"
                ? currentIndex + 1
                : event.key === "Home"
                ? minimumIndex
                    : event.key === "End"
                        ? ids.length
                        : null;
        if (targetIndex == null || targetIndex < minimumIndex || targetIndex > ids.length || targetIndex === currentIndex)
            return;
        event.preventDefault();
        context.reportUserAction("queue-keyboard-boundary", { targetIndex });
        try {
            setState(await context.application.setQueuePauseBoundary(targetIndex));
            context.requestRender();
            focusBoundaryAfterRender();
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
            if (event.button !== 0 || drag || boundaryDrag)
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
        handle.addEventListener("lostpointercapture", (event) => {
            if (drag?.pointerId === event.pointerId && drag.phase !== "dropping")
                cancelDrag();
        }, { signal });
    });
    root.querySelectorAll("[data-queue-boundary-drag]").forEach((handle) => {
        handle.addEventListener("keydown", (event) => {
            void keyboardMoveBoundary(handle, event);
        }, { signal });
        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || drag || boundaryDrag)
                return;
            const sourceMarker = handle.closest("[data-queue-boundary-marker]");
            const list = handle.closest("[data-queue-drop-list]");
            if (!sourceMarker || !list || context.getState()?.queuePauseBoundary === undefined)
                return;
            event.preventDefault();
            boundaryDrag = {
                handle,
                sourceMarker,
                list,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                pointerX: event.clientX,
                pointerY: event.clientY,
                offsetX: 0,
                offsetY: 0,
                sourceStyle: sourceMarker.getAttribute("style"),
                placeholder: null,
                targetIndex: null,
                phase: "pressing"
            };
            try {
                handle.setPointerCapture(event.pointerId);
            }
            catch {
                // Window-level listeners keep the drag usable without capture.
            }
        }, { signal });
        handle.addEventListener("lostpointercapture", (event) => {
            if (boundaryDrag?.pointerId === event.pointerId && boundaryDrag.phase !== "dropping")
                cancelBoundaryDrag();
        }, { signal });
    });
    window.addEventListener("pointermove", onPointerMove, { signal, passive: false });
    window.addEventListener("pointerup", onPointerUp, { signal });
    window.addEventListener("pointercancel", (event) => {
        if (drag?.pointerId === event.pointerId && drag.phase !== "dropping")
            cancelDrag();
        else if (boundaryDrag?.pointerId === event.pointerId && boundaryDrag.phase !== "dropping")
            cancelBoundaryDrag();
    }, { signal });
    window.addEventListener("blur", cancelDragOnWindowExit, { signal });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible")
            cancelDragOnWindowExit();
    }, { signal });
    root.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && (drag || boundaryDrag)) {
            event.preventDefault();
            cancelActiveDrag();
        }
    }, { signal });
    return () => {
        cancelActiveDrag();
        events.abort();
    };
}
