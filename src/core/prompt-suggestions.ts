import { h3PromptPackFor } from "./prompts/h3/index.js";
import type { LocalizedPromptSnippet } from "./prompts/types.js";

export type PromptSnippet = LocalizedPromptSnippet;
export const promptSnippets: readonly PromptSnippet[] = h3PromptPackFor("zh-CN").snippets;

export function promptSnippetFor(id: string): string {
  return promptSnippets.find((snippet) => snippet.id === id)?.text ?? "";
}
