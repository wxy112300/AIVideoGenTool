import { uiKeys } from "../../../core/i18n-keys";
export function mountSettingsEnvironmentController(context, options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = context.root;
    const requestSettingsRender = () => {
        if (context.getRoute().page === "settings")
            context.requestRender();
    };
    root.querySelector("#install-attention-acceleration")?.addEventListener("click", async () => {
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        options.setAttentionAccelerationInstalling(true);
        options.setAttentionAccelerationLog("");
        context.requestRender();
        try {
            const result = await context.studio.installAttentionAcceleration(settings);
            options.setAttentionAccelerationLog(result.log || options.getAttentionAccelerationLog() || result.message);
            const scan = await options.refreshEnvironment(settings, "dependency-change");
            if (scan)
                context.notify(result.message, { kind: result.ok ? "info" : "error" });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            options.setAttentionAccelerationLog([options.getAttentionAccelerationLog(), message].filter(Boolean).join("\n"));
            context.notify(context.t(uiKeys.settings.actions.attentionInstallFailed, { error: message }), { kind: "error" });
        }
        finally {
            options.setAttentionAccelerationInstalling(false);
            requestSettingsRender();
        }
    }, { signal });
    root.querySelector("#install-llama-cpp-python")?.addEventListener("click", async () => {
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        options.setLlamaCppPythonInstalling(true);
        options.setLlamaCppPythonLog("");
        context.requestRender();
        try {
            const result = await context.studio.installLlamaCppPython(settings);
            options.setLlamaCppPythonLog(result.log || result.message);
            const scan = await options.refreshEnvironment(settings, "dependency-change");
            if (scan)
                context.notify(result.message, { kind: result.ok ? "info" : "error" });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            options.setLlamaCppPythonLog([options.getLlamaCppPythonLog(), message].filter(Boolean).join("\n"));
            context.notify(message, { kind: "error" });
        }
        finally {
            options.setLlamaCppPythonInstalling(false);
            requestSettingsRender();
        }
    }, { signal });
    root.querySelectorAll("[data-repair-issue]").forEach((button) => {
        button.addEventListener("click", async () => {
            const issueId = button.dataset.repairIssue;
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            options.setEnvironmentRepairing(issueId);
            context.requestRender();
            try {
                const result = await context.studio.repairEnvironmentIssue(issueId, settings);
                options.setEnvironmentRepairLog(issueId, result.log || result.message);
                options.setEnvironmentRepairing("");
                const scan = await options.refreshEnvironment(settings, "dependency-change");
                if (scan)
                    context.notify(result.message, { kind: result.ok ? "info" : "error" });
            }
            catch (error) {
                options.setEnvironmentRepairing("");
                const message = error instanceof Error ? error.message : String(error);
                options.setEnvironmentRepairLog(issueId, message);
                context.notify(context.t(uiKeys.settings.actions.environmentRepairFailed, { error: message }), { kind: "error" });
            }
            requestSettingsRender();
        }, { signal });
    });
    return () => events.abort();
}
