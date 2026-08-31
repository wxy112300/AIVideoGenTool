import { createTranslator } from "../core/i18n";
export function createRendererContext(options) {
    const getTranslator = () => createTranslator(options.getState()?.settings.uiLocale);
    return {
        root: options.root,
        ...options.dependencies,
        enhancePrompt: options.enhancePrompt,
        getState: options.getState,
        getRoute: options.getRoute,
        getTranslator,
        t(key, params, fallback) {
            return getTranslator().t(key, params, fallback);
        },
        requestRender: options.requestRender,
        navigate: options.navigate,
        notify: options.notify,
        reportUserAction: options.reportUserAction
    };
}
export function routeState(page, creationMode, historyKind) {
    return { page, creationMode, historyKind };
}
