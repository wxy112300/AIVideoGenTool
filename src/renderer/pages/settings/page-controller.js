import { rewriteHuggingFaceDownloadUrl } from "../../../core/download-url";
import { uiKeys } from "../../../core/i18n-keys";
export function mountSettingsPageController(options) {
    const events = new AbortController();
    const signal = events.signal;
    const root = options.context.root;
    root.querySelector("#release-prompt-model")?.addEventListener("click", () => {
        void options.togglePromptModel();
    }, { signal });
    root.querySelector("#comfy-python-candidate")?.addEventListener("change", (event) => {
        const selectedPath = event.currentTarget.value;
        if (!selectedPath)
            return;
        const input = root.querySelector("#comfy-python-path");
        if (!input)
            return;
        input.value = selectedPath;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        options.context.reportUserAction("select-comfy-python", { source: "scan-candidate" });
        void options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelector("#pick-comfy-python")?.addEventListener("click", async () => {
        const selectedPath = await options.context.studio.pickPython();
        const input = root.querySelector("#comfy-python-path");
        if (!selectedPath || !input)
            return;
        input.value = selectedPath;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        options.context.reportUserAction("select-comfy-python", { source: "file-picker" });
        await options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelectorAll("[data-install-profile]").forEach((button) => {
        button.addEventListener("click", () => {
            options.rememberModalFocus();
            options.setSettingsDraft(options.formSettings());
            const profile = options.getEnvironmentScan()?.modelProfiles.find((item) => item.id === button.dataset.installProfile);
            const component = profile?.components[Number(button.dataset.installComponent)];
            if (!profile || !component)
                return;
            options.setInstallGuide({ profileName: profile.name, component });
            (options.requestOverlayRender ?? options.context.requestRender)();
        }, { signal });
    });
    const closeInstallGuide = () => {
        options.setInstallGuide(null);
        (options.requestOverlayRender ?? options.context.requestRender)();
        options.restoreModalFocus?.();
    };
    root.querySelector("#close-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
    root.querySelector("#dismiss-install-guide")?.addEventListener("click", closeInstallGuide, { signal });
    root.querySelector("#install-guide-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget)
            closeInstallGuide();
    }, { signal });
    const installGuide = root.querySelector(".install-guide-dialog");
    if (installGuide)
        options.bindModalFocus?.(installGuide, closeInstallGuide, "#dismiss-install-guide");
    root.querySelector("#open-install-download")?.addEventListener("click", async () => {
        const selected = options.getInstallGuide();
        if (!selected)
            return;
        const guide = selected.component.installGuide;
        if (!guide)
            return;
        const url = rewriteHuggingFaceDownloadUrl(guide.downloadUrl, options.formSettings().hfMirrorEnabled);
        const opened = await options.context.studio.openExternal(url);
        if (!opened)
            options.context.notify(options.context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
    }, { signal });
    root.querySelector("#open-install-directory")?.addEventListener("click", async (event) => {
        const directory = event.currentTarget.dataset.installDirectory?.trim();
        if (!directory)
            return;
        const opened = await options.context.studio.openDirectory(directory);
        if (!opened)
            options.context.notify(options.context.t(uiKeys.settings.actions.openDirectoryFailed), { kind: "error" });
    }, { signal });
    root.querySelectorAll("[data-open-environment-download]").forEach((button) => {
        button.addEventListener("click", async () => {
            const sourceUrl = button.dataset.openEnvironmentDownload?.trim();
            if (!sourceUrl)
                return;
            const url = rewriteHuggingFaceDownloadUrl(sourceUrl, options.formSettings().hfMirrorEnabled);
            const opened = await options.context.studio.openExternal(url);
            if (!opened)
                options.context.notify(options.context.t(uiKeys.settings.actions.downloadPageFailed), { kind: "error" });
        }, { signal });
    });
    root.querySelector("#scan-environment")?.addEventListener("click", () => {
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        void options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelector("#save-settings")?.addEventListener("click", async () => {
        const state = options.context.getState();
        if (!state)
            return;
        const nextSettings = options.formSettings();
        try {
            await options.requestSaveSettings(nextSettings);
        }
        catch (error) {
            options.context.notify(error instanceof Error ? error.message : String(error), { renderPage: false, kind: "error" });
        }
    }, { signal });
    root.querySelectorAll("[data-test]").forEach((button) => {
        button.addEventListener("click", async () => {
            options.context.reportUserAction("connection-test", { kind: button.dataset.test });
            const resultElement = root.querySelector("#connection-result");
            if (!resultElement)
                return;
            resultElement.textContent = options.context.t(uiKeys.settings.actions.connectionPending);
            try {
                const result = await options.context.studio.testConnection("comfy", options.formSettings());
                resultElement.className = `connection-result ${result.ok ? "success" : "error"}`;
                resultElement.textContent = result.message;
                options.context.notify(result.message, { kind: result.ok ? "info" : "error" });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                resultElement.className = "connection-result error";
                resultElement.textContent = message;
                options.context.notify(message, { kind: "error" });
            }
        }, { signal });
    });
    root.querySelector("#use-scanned-comfy")?.addEventListener("click", async () => {
        const scan = options.getEnvironmentScan();
        if (!scan?.comfyRoot)
            return;
        const current = options.formSettings();
        const result = await options.requestSaveSettings({
            ...current,
            comfyInstallDirectory: scan.comfyInstallDirectory || current.comfyInstallDirectory,
            modelDirectory: scan.modelDirectory,
            outputDirectory: scan.outputDirectory
        });
        if (result === "saved") {
            options.context.notify(options.context.t(uiKeys.settings.actions.scannedPathsApplied));
        }
    }, { signal });
    root.querySelector("#pick-comfy-install-directory")?.addEventListener("click", async () => {
        const input = root.querySelector("#comfy-install-directory");
        const directory = await options.context.studio.pickDirectory();
        if (!directory || !input)
            return;
        input.value = directory;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        await options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelectorAll("[data-select-comfy-install]").forEach((button) => {
        button.addEventListener("click", async () => {
            const directory = button.dataset.selectComfyInstall;
            const input = root.querySelector("#comfy-install-directory");
            if (!directory || !input)
                return;
            input.value = directory;
            const settings = options.formSettings();
            options.setSettingsDraft(settings);
            await options.runEnvironmentScan(settings);
        }, { signal });
    });
    root.querySelector("#pick-model-directory")?.addEventListener("click", async () => {
        const directory = await options.context.studio.pickDirectory();
        const input = root.querySelector("#model-directory");
        if (!directory || !input)
            return;
        input.value = directory;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        void options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelector("#pick-output-directory")?.addEventListener("click", async () => {
        const input = root.querySelector("#output-directory");
        const directory = await options.context.studio.pickDirectory(input?.value, true);
        if (!directory || !input)
            return;
        input.value = directory;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        void options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelector("#pick-image-output-directory")?.addEventListener("click", async () => {
        const input = root.querySelector("#image-output-directory");
        const directory = await options.context.studio.pickDirectory(input?.value, true);
        if (!directory || !input)
            return;
        input.value = directory;
        options.setSettingsDraft(options.formSettings());
        options.syncSettingsDirtyUi();
    }, { signal });
    root.querySelector("#pick-image-input-library-directory")?.addEventListener("click", async () => {
        const input = root.querySelector("#image-input-library-directory");
        const directory = await options.context.studio.pickDirectory(input?.value, true);
        if (!directory || !input)
            return;
        input.value = directory;
        options.setSettingsDraft(options.formSettings());
        options.syncSettingsDirtyUi();
    }, { signal });
    root.querySelector("#open-image-asset-library")?.addEventListener("click", () => {
        if (options.settingsHaveUnsavedChanges()) {
            options.context.notify(options.context.t(uiKeys.settings.actions.saveLibraryFirst), { renderPage: false });
            return;
        }
        options.openImageAssetLibrary();
    }, { signal });
    root.querySelector("[data-pick-prompt-model-directory]")?.addEventListener("click", async () => {
        const directory = await options.context.studio.pickDirectory();
        const input = root.querySelector("#prompt-model-directory");
        if (!directory || !input)
            return;
        input.value = directory;
        const settings = options.formSettings();
        options.setSettingsDraft(settings);
        void options.runEnvironmentScan(settings);
    }, { signal });
    root.querySelectorAll("[data-pick-lm-install]").forEach((button) => {
        button.addEventListener("click", async () => {
            const directory = await options.context.studio.pickDirectory();
            if (!directory)
                return;
            const input = root.querySelector("#lm-install-directory");
            if (input)
                input.value = directory;
            const result = await options.requestSaveSettings({
                ...options.formSettings(),
                lmStudioInstallDirectory: directory
            });
            if (result === "saved") {
                options.context.notify(options.context.t(uiKeys.settings.actions.lmStudioSaved));
            }
        }, { signal });
    });
    return () => events.abort();
}
