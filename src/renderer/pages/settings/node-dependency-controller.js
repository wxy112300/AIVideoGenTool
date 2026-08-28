import { uiKeys } from "../../../core/i18n-keys";
import { customNodeIdsForBulkAction } from "./node-install-queue";
export function mountSettingsNodeDependencyController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const requestSettingsRender = () => {
        if (context.getRoute().page === "settings")
            context.requestRender();
    };
    root.querySelectorAll("[data-install-node]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopImmediatePropagation();
            const nodeId = button.dataset.installNode;
            const state = context.getState();
            if (!nodeId)
                return;
            if (state?.queue.some((task) => task.status === "running")) {
                context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
                return;
            }
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            const queued = options.enqueueCustomNodeInstall(nodeId, settings);
            if (!queued.accepted) {
                context.notify(context.t(uiKeys.settings.actions.nodeAlreadyQueued), {
                    kind: "warning",
                    renderPage: false
                });
            }
        }, { signal });
    });
    root.querySelectorAll("[data-rescan-node]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopImmediatePropagation();
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            button.disabled = true;
            await options.refreshEnvironment(settings, "manual");
            requestSettingsRender();
        }, { signal });
    });
    root.querySelectorAll("[data-open-node-source]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopImmediatePropagation();
            const sourceUrl = button.dataset.openNodeSource?.trim();
            if (!sourceUrl)
                return;
            const opened = await context.studio.openExternal(sourceUrl);
            if (!opened) {
                context.notify(context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
            }
        }, { signal });
    });
    root.querySelector("#install-all-custom-nodes")?.addEventListener("click", () => {
        const state = context.getState();
        if (state?.queue.some((task) => task.status === "running")) {
            context.notify(context.t(uiKeys.settings.actions.runningTaskBlocked), { kind: "warning" });
            return;
        }
        const nodes = options.getEnvironmentScan()?.customNodes ?? [];
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        let accepted = 0;
        for (const nodeId of customNodeIdsForBulkAction(nodes)) {
            if (options.enqueueCustomNodeInstall(nodeId, settings).accepted)
                accepted += 1;
        }
        if (accepted > 0) {
            context.notify(context.t(uiKeys.settings.actions.nodeBulkQueued, { count: accepted }), {
                kind: "info",
                renderPage: false
            });
        }
        else {
            context.notify(context.t(uiKeys.settings.actions.nodeAlreadyQueued), {
                kind: "warning",
                renderPage: false
            });
        }
    }, { signal });
    root.querySelectorAll("[data-install-workflow]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopImmediatePropagation();
            const workflowId = button.dataset.installWorkflow;
            if (!workflowId)
                return;
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            options.setWorkflowDependencyInstalling(workflowId);
            options.setWorkflowDependencyLog(workflowId, context.t("settings.nodes.installing"));
            context.requestRender();
            try {
                const result = await context.studio.installWorkflowDependency(workflowId, settings);
                options.setWorkflowDependencyLog(workflowId, result.log || result.message);
                if (!result.ok)
                    throw new Error(result.message);
                const scan = await options.refreshEnvironment(settings, "dependency-change");
                if (scan)
                    context.notify(result.message);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                options.setWorkflowDependencyLog(workflowId, options.getWorkflowDependencyLog(workflowId) || message);
                context.notify(context.t(uiKeys.settings.actions.workflowInstallFailed, { message }), { kind: "error" });
            }
            finally {
                options.setWorkflowDependencyInstalling("");
                requestSettingsRender();
            }
        }, { signal });
    });
    return () => events.abort();
}
