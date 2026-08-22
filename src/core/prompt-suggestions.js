import { h3PromptPackFor } from "./prompts/h3/index.js";
export const promptSnippets = h3PromptPackFor("zh-CN").snippets;
export function promptSnippetFor(id) {
    return promptSnippets.find((snippet) => snippet.id === id)?.text ?? "";
}
