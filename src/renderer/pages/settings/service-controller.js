import { uiKeys } from "../../../core/i18n-keys";
export function mountSettingsServiceController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const requestSettingsRender = () => {
        if (context.getRoute().page === "settings")
            context.requestRender();
    };
    root.querySelectorAll("[data-start-service]").forEach((button) => {
        button.addEventListener("click", async () => {
            const kind = button.dataset.startService;
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            options.setServiceStarting(kind);
            options.setServiceStatusMessage(kind === "comfy"
                ? context.t(uiKeys.settings.actions.serviceStartingComfy)
                : context.t(uiKeys.settings.actions.serviceStartingLmStudio));
            context.requestRender();
            try {
                const result = await context.studio.startLocalService(kind, settings);
                options.setServiceStarting(null);
                options.setServiceStatusMessage(result.message);
                const scan = await options.refreshEnvironment(settings, "service-change");
                if (scan)
                    context.notify(result.message, { kind: result.ok ? "info" : "error" });
            }
            catch (error) {
                options.setServiceStarting(null);
                const message = context.t(uiKeys.settings.actions.startFailed, { error: error instanceof Error ? error.message : String(error) });
                options.setServiceStatusMessage(message);
                context.notify(message, { kind: "error" });
            }
            requestSettingsRender();
        }, { signal });
    });
    root.querySelectorAll("[data-restart-service]").forEach((button) => {
        button.addEventListener("click", async () => {
            const kind = button.dataset.restartService;
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            options.setServiceRestarting(kind);
            options.setServiceStatusMessage(context.t(uiKeys.settings.actions.serviceRestartingComfy));
            context.requestRender();
            try {
                const result = await context.studio.restartLocalService(kind, settings);
                options.setServiceRestarting(null);
                options.setServiceStatusMessage(result.message);
                const scan = await options.refreshEnvironment(settings, "service-change");
                if (scan)
                    context.notify(result.message, { kind: result.ok ? "info" : "error" });
            }
            catch (error) {
                options.setServiceRestarting(null);
                const message = context.t(uiKeys.settings.actions.restartFailed, { error: error instanceof Error ? error.message : String(error) });
                options.setServiceStatusMessage(message);
                context.notify(message, { kind: "error" });
            }
            requestSettingsRender();
        }, { signal });
    });
    root.querySelector("#force-stop-comfy")?.addEventListener("click", () => {
        options.rememberModalFocus();
        options.setSettingsDraft(options.formSettings());
        options.requestForceStopConfirmation();
        context.requestRender();
    }, { signal });
    root.querySelector("#update-comfyui")?.addEventListener("click", async () => {
        const settings = options.formSettings();
        const updateMode = options.getEnvironmentScan()?.comfyCompatibility.updateMode;
        options.setSettingsDraft(settings);
        options.setComfyUpdating(true);
        options.setComfyUpdateLog("");
        context.requestRender();
        try {
            const result = await context.studio.updateComfyUi(settings);
            options.setComfyUpdateLog(result.log || result.message);
            if (!result.ok) {
                context.notify(result.message, { kind: "error" });
            }
            else if (await options.refreshEnvironment(settings, "dependency-change")) {
                context.notify(result.message);
            }
            if (result.ok && updateMode === "git") {
                options.setServiceStatusMessage(context.t(uiKeys.settings.actions.updateCompleted));
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            options.setComfyUpdateLog(message);
            context.notify(context.t(uiKeys.settings.actions.comfyUpdateFailed, { error: message }), { kind: "error" });
        }
        finally {
            options.setComfyUpdating(false);
            requestSettingsRender();
        }
    }, { signal });
    root.querySelector("#repair-h3-core")?.addEventListener("click", async () => {
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        options.setCoreDependencyRepairing(true);
        options.setComfyUpdateLog("");
        context.requestRender();
        try {
            const scan = options.getEnvironmentScan();
            if (!scan?.comfyCompatibility.checkedFrom) {
                const started = await context.studio.startLocalService("comfy", settings);
                options.setComfyUpdateLog(started.message);
                const nextScan = await options.refreshEnvironment(settings, "service-change");
                if (!nextScan)
                    return;
                if (nextScan.comfyCompatibility.h3CoreSupported) {
                    context.notify(context.t(uiKeys.settings.actions.h3CoreLoaded));
                    return;
                }
            }
            const updateMode = options.getEnvironmentScan()?.comfyCompatibility.updateMode;
            const result = await context.studio.updateComfyUi(settings);
            options.setComfyUpdateLog([options.getComfyUpdateLog(), result.log || result.message]
                .filter(Boolean)
                .join("\n\n"));
            if (!result.ok)
                throw new Error(result.message);
            if (updateMode === "git") {
                const restarted = await context.studio.restartLocalService("comfy", settings);
                options.setComfyUpdateLog(`${options.getComfyUpdateLog()}\n\n${restarted.message}`);
            }
            const refreshedScan = await options.refreshEnvironment(settings, "service-change");
            if (!refreshedScan)
                return;
            context.notify(result.message, { kind: result.ok ? "info" : "error" });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            options.setComfyUpdateLog([options.getComfyUpdateLog(), message].filter(Boolean).join("\n\n"));
            context.notify(context.t(uiKeys.settings.actions.coreNodeProcessFailed, { error: message }), { kind: "error" });
        }
        finally {
            options.setCoreDependencyRepairing(false);
            requestSettingsRender();
        }
    }, { signal });
    return () => events.abort();
}
