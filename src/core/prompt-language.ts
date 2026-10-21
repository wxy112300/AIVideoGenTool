import type { EnhanceRequest, Settings } from "../types.js";
import { stripH3ContentFromSource } from "./h3-dialogue.js";

export type PromptOutputLanguage = "zh" | "en";
type LanguageSettings = Pick<Settings, "promptLanguage" | "uiLocale">;

const languageNames = "English|Mandarin Chinese|Chinese|英文|英语|英語|中文|汉语|漢語";
// Require an entire opening instruction clause, never a language word inside a scene.
const boundary = "(?=[ \\t]*(?:$|[\\r\\n,，。.!?！？;；:：]))";
const openingDirectives = [
  `(?:输出语言|輸出語言|提示词语言|提示詞語言|(?:prompt|output|response)\\s+language)\\s*[:：=]\\s*(${languageNames})`,
  `(?:请(?:你)?|請(?:你)?|麻烦|麻煩)?\\s*(?:用|使用|采用|採用)\\s*(${languageNames})(?:\\s*(?:来|來)?(?:输出|輸出|撰写|撰寫|编写|編寫|写|寫|改写|改寫|扩写|擴寫|增强|增強|生成|描述|回答)(?:以下|下面|最终|最終|完整)?的?(?:Prompt|提示词|提示詞|正文|描述|结果|結果|答案)?)?`,
  `(?:请|請)?(?:本次|最终|最終)?(?:Prompt|提示词|提示詞|描述正文)\\s*(?:请|請)?(?:用|使用|采用|採用)\\s*(${languageNames})(?:输出|輸出|撰写|撰寫|编写|編寫)?`,
  `(?:please\\s+)?use\\s+(${languageNames})(?:\\s+for\\s+(?:the\\s+)?(?:prompt|description|response|output))?(?:\\s+only)?`,
  `(?:please\\s+)?(?:write|rewrite|expand|enhance|output|respond|reply|answer)(?:\\s+(?:the\\s+)?(?:(?:final|enhanced)\\s+)?(?:prompt|description|response|answer))?\\s+(?:in\\s+)?(${languageNames})(?:\\s+only)?`
].map(pattern => new RegExp(`^(?:${pattern})${boundary}`, "iu"));

/** Conservative, positive, opening-only authoring directives; no scene/literal/annotation scan. */
export function openingPromptLanguage(prompt: string): PromptOutputLanguage | undefined {
  let remaining = prompt.trimStart();
  let selected: PromptOutputLanguage | undefined;
  while (remaining) {
    const match = openingDirectives.map(pattern => pattern.exec(remaining)).find(Boolean);
    if (!match) break;
    const language: PromptOutputLanguage = /^(?:英文|英语|英語|English)$/iu.test(match[1]!) ? "en" : "zh";
    if (selected && selected !== language) {
      throw new Error("开头同时指定了中文和英文输出，请只保留一种提示词输出语言。");
    }
    selected = language;
    remaining = remaining.slice(match[0].length).replace(/^[\s,，。.!?！？;；:：]+/u, "");
  }
  return selected;
}

export function promptTargetLanguage(request: EnhanceRequest, settings: LanguageSettings): PromptOutputLanguage {
  const explicit = request.mode !== "image-edit" && request.promptStrategy !== "targeted-revision"
    ? openingPromptLanguage(request.prompt) : undefined;
  if (explicit) return explicit;
  if (settings.promptLanguage === "zh" || settings.promptLanguage === "en") return settings.promptLanguage;
  const descriptiveText = stripH3ContentFromSource(request.prompt.trim() || request.referenceContext?.trim() || "");
  if (descriptiveText.trim()) return /\p{Script=Han}/u.test(descriptiveText) ? "zh" : "en";
  return settings.uiLocale?.startsWith("zh") ? "zh" : "en";
}

/** Shared authoring instruction. With no settings, preserve the backend's default unless explicitly overridden. */
export function h3PromptOutputLanguageInstruction(request: EnhanceRequest, settings?: LanguageSettings): string {
  if (request.mode === "image-edit" || request.promptStrategy === "targeted-revision") return "";
  const language = settings ? promptTargetLanguage(request, settings) : openingPromptLanguage(request.prompt);
  if (!language) return "";
  return [
    language === "en" ? "Use English explanatory prose." : "Use Chinese explanatory prose.",
    "Keep official H3 field headings in English ASCII. The resolved prose language applies only to the prompt description, never dialogue, lyrics, voiceover words or visible text; preserve those literals verbatim in their original language.",
    "A recognized opening output-language instruction is authoring metadata, not a video event: do not copy, render, speak or add it to the soundscape. Language words inside scene actions, quotes, references or local editorial notes are not global output-language instructions. Preserve all other source actions and constraints."
  ].join(" ");
}
