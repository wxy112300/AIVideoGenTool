import { uiKeys } from "../../../core/i18n-keys";
import { renderIcons } from "../../shared/icons";
function menuButton(icon, label, action, disabled = false) {
    return `<button type="button" role="menuitem" data-queue-menu-action="${action}"${disabled ? " disabled" : ""}><span class="context-icon">${icon}</span><span><strong>${label}</strong></span></button>`;
}
export function mountQueueActionMenu(context, options) {
    const events = new AbortController();
    let menuElement = null;
    let menuEvents = null;
    let menuReturnFocus = null;
    const close = (restoreFocus = true) => {
        const returnFocus = menuReturnFocus;
        menuReturnFocus = null;
        menuEvents?.abort();
        menuEvents = null;
        menuElement?.remove();
        menuElement = null;
        if (returnFocus?.isConnected) {
            returnFocus.setAttribute("aria-expanded", "false");
            if (restoreFocus)
                returnFocus.focus({ preventScroll: true });
        }
    };
    const open = (trigger) => {
        const taskId = trigger.dataset.queueMenuTrigger;
        const task = taskId ? options.getTask(taskId) : undefined;
        if (!taskId || !task)
            return;
        if (menuReturnFocus === trigger) {
            close();
            return;
        }
        close(false);
        const menu = document.createElement("section");
        menu.className = "history-context-menu queue-action-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", context.t(uiKeys.queue.card.moreActions));
        const waiting = task.status === "waiting";
        const hasSeed = waiting && task.taskType !== "image-generation";
        menu.innerHTML = [
            menuButton(options.icon("copy"), context.t(uiKeys.queue.card.duplicate), "duplicate"),
            waiting
            ? menuButton(options.icon("arrow-up"), context.t(uiKeys.queue.card.promote), "promote", !options.canPromote(taskId))
            : "",
            waiting
                ? menuButton(options.icon("pause"), context.t(uiKeys.queue.card.renderThroughHere), "render-through-here")
                : "",
            hasSeed
                ? menuButton(options.icon("refresh-cw"), context.t(uiKeys.queue.card.randomizeSeed), "randomize-seed")
                : ""
        ].join("");
        menu.style.left = "0px";
        menu.style.top = "0px";
        document.body.append(menu);
        renderIcons(menu);
        menuElement = menu;
        menuReturnFocus = trigger;
        trigger.setAttribute("aria-expanded", "true");
        const menuController = new AbortController();
        menuEvents = menuController;
        const menuSignal = menuController.signal;
        const menuItems = [...menu.querySelectorAll("button[role=menuitem]")];
        const enabledMenuItems = menuItems.filter((item) => !item.disabled);
        const focusMenuItem = (index) => {
            if (!enabledMenuItems.length)
                return;
            const nextIndex = (index + enabledMenuItems.length) % enabledMenuItems.length;
            enabledMenuItems.forEach((item, itemIndex) => {
                item.tabIndex = itemIndex === nextIndex ? 0 : -1;
            });
            enabledMenuItems[nextIndex]?.focus({ preventScroll: true });
        };
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
        const left = Math.min(Math.max(8, triggerRect.right - menuRect.width), maxLeft);
        const belowTop = triggerRect.bottom + 6;
        const aboveTop = triggerRect.top - menuRect.height - 6;
        const top = belowTop + menuRect.height <= window.innerHeight - 8
            ? belowTop
            : Math.max(8, aboveTop);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        focusMenuItem(0);
        menu.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: menuSignal });
        menu.addEventListener("click", async (event) => {
            const button = event.target?.closest?.("button[role=menuitem]");
            if (!button || button.disabled)
                return;
            const action = button.dataset.queueMenuAction;
            if (!action)
                return;
            close();
            await options.onAction(action, taskId);
        }, { signal: menuSignal });
        menu.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
            event.preventDefault();
            event.stopPropagation();
            const currentIndex = Math.max(0, enabledMenuItems.indexOf(document.activeElement));
            const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                    ? enabledMenuItems.length - 1
                    : currentIndex + (event.key === "ArrowUp" ? -1 : 1);
            focusMenuItem(nextIndex);
        }, { signal: menuSignal });
        document.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (!menu.contains(target) && !trigger.contains(target))
                close(false);
        }, { capture: true, signal: menuSignal });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape")
                close();
        }, { signal: menuSignal });
        window.addEventListener("blur", () => close(false), { signal: menuSignal });
        window.addEventListener("resize", () => close(false), { signal: menuSignal });
        window.addEventListener("scroll", () => close(false), { capture: true, signal: menuSignal });
    };
    context.root.querySelectorAll("[data-queue-menu-trigger]").forEach((trigger) => {
        trigger.addEventListener("click", () => open(trigger), { signal: events.signal });
        trigger.addEventListener("keydown", (event) => {
            if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
                return;
            event.preventDefault();
            open(trigger);
        }, { signal: events.signal });
    });
    return () => {
        events.abort();
        close(false);
    };
}
