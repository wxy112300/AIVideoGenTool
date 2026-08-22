let promptPackModule;
let promptPackLoad;
export async function loadPromptPacks() {
    if (promptPackModule)
        return;
    promptPackLoad ??= import("../core/prompts/index");
    promptPackModule = await promptPackLoad;
}
function loadedPromptPacks() {
    if (!promptPackModule) {
        throw new Error("Prompt Pack is not loaded for the active renderer page.");
    }
    return promptPackModule;
}
export function h3PromptPackFor(locale = "zh-CN") {
    return loadedPromptPacks().h3PromptPackFor(locale);
}
export function qwenImagePromptPackFor(locale = "zh-CN") {
    return loadedPromptPacks().qwenImagePromptPackFor(locale);
}
export function h3PromptPresetForMode(mode, requestedPreset = "official-storyboard") {
    return loadedPromptPacks().h3PromptPresetForMode(mode, requestedPreset);
}
export function promptSnippetFor(id) {
    return loadedPromptPacks().promptSnippetFor(id);
}
export function createDefaultH3PromptPresets() {
    return loadedPromptPacks().createDefaultH3PromptPresets();
}
export function createDefaultQwenImagePromptPresets() {
    return loadedPromptPacks().createDefaultQwenImagePromptPresets();
}
