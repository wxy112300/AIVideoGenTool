export interface PromptAnnotation {
  text: string;
  raw: string;
  sourceStart: number;
  sourceEnd: number;
  anchor: string;
}

export interface ParsedPromptAnnotations {
  prompt: string;
  annotations: PromptAnnotation[];
}

const openingDelimiters = new Set([
  "(",
  "（",
  "[",
  "［",
  "【",
  "〔",
  "{",
  "｛"
]);

const closingDelimiters = new Set([
  ")",
  "）",
  "]",
  "］",
  "】",
  "〕",
  "}",
  "｝"
]);

const annotationLabelPattern = /^(批注|注释|备注|说明|注|editor(?:ial)?(?:'s)?\s+note|editorial\s+instruction|note|comment|remark|instruction|edit(?:orial)?\s+note)([\s\S]*)$/iu;
const cjkLabelPattern = /^(?:批注|注释|备注|说明)([\s\S]*)$/u;
const singleChineseLabelPattern = /^注([\s\S]*)$/u;
const englishLabelPattern = /^(?:editor(?:ial)?(?:'s)?\s+note|editorial\s+instruction|note|comment|remark|instruction|edit(?:orial)?\s+note)([\s\S]*)$/iu;
const clauseBoundaryPattern = /[.!?。！？；;\n]/u;
const punctuationAfterPattern = /[,.;:!?，。！？；：、]/u;
const wordLikePattern = /[\p{L}\p{N}_]/u;
const cjkPattern = /[\p{Script=Han}]/u;
const chineseInstructionStartPattern = /^(?:请|要|需要|改|换|翻译|保留|不要|不|保持|删除|添加|这里|注意|强调|将|把|用|采用|设置|避免|增加|减少|说明|指的是|不是)/u;
const quoteClosingByOpening = new Map([
  ["“", "”"],
  ["「", "」"],
  ["『", "』"],
  ["«", "»"]
]);

function isInsideQuotedText(source: string, start: number): boolean {
  const closingStack: string[] = [];
  for (let index = 0; index < start; index += 1) {
    const character = source[index] ?? "";
    if (character === "\"" && source[index - 1] !== "\\") {
      if (closingStack.at(-1) === "\"") closingStack.pop();
      else closingStack.push("\"");
      continue;
    }
    const expectedClosing = quoteClosingByOpening.get(character);
    if (expectedClosing) {
      closingStack.push(expectedClosing);
      continue;
    }
    if (closingStack.at(-1) === character) closingStack.pop();
  }
  return closingStack.length > 0;
}

function findDelimitedEnd(source: string, start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (openingDelimiters.has(character ?? "")) {
      depth += 1;
      continue;
    }
    if (!closingDelimiters.has(character ?? "")) continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return undefined;
}

function stripAnnotationSeparator(value: string): string {
  return value
    .replace(/^\s*[:：]\s*/u, "")
    .replace(/^\s*[-–—]\s*/u, "")
    .trim();
}

function annotationTextFromBody(body: string): string | undefined {
  const trimmed = body.trim();
  const match = annotationLabelPattern.exec(trimmed);
  if (!match) return undefined;

  const label = match[1] ?? "";
  const remainder = match[2] ?? "";
  const isSingleChineseLabel = singleChineseLabelPattern.test(trimmed);
  const isEnglishLabel = englishLabelPattern.test(trimmed);
  const startsWithSeparator = /^[\s:：–—-]/u.test(remainder);

  // A bare Chinese “注” is intentionally stricter so ordinary words such as
  // “注视” are not mistaken for annotations. “批注/备注/注释” may be followed
  // directly by the note text because that is common in Chinese typing.
  if (
    isSingleChineseLabel &&
    remainder &&
    !startsWithSeparator &&
    !chineseInstructionStartPattern.test(remainder.trim())
  ) return undefined;
  // English labels must have a boundary after the label; otherwise words such
  // as “noteworthy” would be parsed as an annotation.
  if (isEnglishLabel && remainder && !startsWithSeparator) return undefined;
  if (!remainder.trim()) return undefined;

  const normalizedLabel = label.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const isChineseLabel = cjkLabelPattern.test(trimmed) || normalizedLabel === "注";
  const note = stripAnnotationSeparator(remainder);
  if (!note) return undefined;
  if (!isChineseLabel && !startsWithSeparator) return undefined;
  return note;
}

function anchorFor(
  source: string,
  start: number,
  previousRanges: readonly { start: number; end: number }[]
): string {
  let before = "";
  let cursor = 0;
  for (const range of previousRanges) {
    if (range.start >= start) break;
    before += source.slice(cursor, range.start);
    before += " ";
    cursor = Math.min(range.end, start);
  }
  before += source.slice(cursor, start);
  let boundary = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (clauseBoundaryPattern.test(before[index] ?? "")) boundary = index + 1;
  }
  const clause = before.slice(boundary).replace(/\s+/gu, " ").trim();
  if (!clause) return "the beginning of the draft";
  return clause.slice(-180);
}

function needsSeparator(before: string | undefined, after: string | undefined): boolean {
  if (!before || !after || /\s/u.test(before) || /\s/u.test(after)) return false;
  if (wordLikePattern.test(before) && openingDelimiters.has(after ?? "")) return true;
  if (closingDelimiters.has(before ?? "") && wordLikePattern.test(after)) return true;
  if (!wordLikePattern.test(before) || !wordLikePattern.test(after)) return false;
  return !cjkPattern.test(before) && !cjkPattern.test(after);
}

export function parsePromptAnnotations(sourcePrompt: string): ParsedPromptAnnotations {
  const source = sourcePrompt ?? "";
  const annotations: PromptAnnotation[] = [];
  const ranges: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < source.length; index += 1) {
    if (!openingDelimiters.has(source[index] ?? "")) continue;
    if (isInsideQuotedText(source, index)) continue;
    const end = findDelimitedEnd(source, index);
    if (end === undefined) continue;
    const raw = source.slice(index, end + 1);
    const text = annotationTextFromBody(source.slice(index + 1, end));
    if (!text) continue;

    ranges.push({ start: index, end: end + 1 });
    annotations.push({
      text,
      raw,
      sourceStart: index,
      sourceEnd: end + 1,
      anchor: anchorFor(source, index, ranges)
    });
    index = end;
  }

  if (!ranges.length) return { prompt: source, annotations };

  let prompt = "";
  let cursor = 0;
  for (const range of ranges) {
    let left = source.slice(cursor, range.start);
    const before = source[range.start - 1];
    const after = source[range.end];
    if (punctuationAfterPattern.test(after ?? "")) left = left.replace(/\s+$/u, "");
    prompt += /\s/u.test(before ?? "") && /\s/u.test(after ?? "")
      ? left.replace(/\s$/u, "")
      : left;
    if (needsSeparator(before, after)) prompt += " ";
    cursor = range.end;
  }
  prompt += source.slice(cursor);

  return {
    prompt: prompt.trim(),
    annotations
  };
}

export function stripPromptAnnotations(sourcePrompt: string): string {
  return parsePromptAnnotations(sourcePrompt).prompt;
}

export function promptAnnotationInstruction(
  parsed: ParsedPromptAnnotations
): string {
  if (!parsed.annotations.length) return "";
  return [
    "Editorial annotation contract: note-labeled text inside parentheses or brackets is an instruction for the prompt editor, never visual content, audio, dialogue, lyrics, subtitles, or visible text.",
    "Apply each annotation at its original position, normally to the nearest preceding clause. Preserve all unannotated user intent. Remove the annotation label, marker, and note text from the final prompt; never mention this contract or internal anchors.",
    "Extracted editorial annotations (in original order):",
    ...parsed.annotations.map((annotation, index) =>
      `Note ${index + 1} (after ${JSON.stringify(annotation.anchor)}): ${annotation.text}`
    )
  ].join("\n\n");
}
