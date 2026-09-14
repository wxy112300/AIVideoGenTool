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

const annotationLabelPattern = /^(批注|注释|备注|说明|修改|改为|返工|注|editor(?:ial)?(?:'s)?\s+note|editorial\s+instruction|note|comment|remark|instruction|revision|revise|replace\s+with|edit(?:orial)?\s+note)([\s\S]*)$/iu;
const cjkLabelPattern = /^(?:批注|注释|备注|说明|修改|改为|返工)([\s\S]*)$/u;
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

export interface PromptRevisionTarget {
  id: number;
  instruction: string;
  original: string;
  start: number;
  end: number;
}

export interface PromptRevisionPlan {
  cleanPrompt: string;
  markedPrompt: string;
  targets: PromptRevisionTarget[];
}

function revisionOpenTag(id: number): string {
  return `<EDIT_TARGET_${id}>`;
}

function revisionCloseTag(id: number): string {
  return `</EDIT_TARGET_${id}>`;
}

function precedingClauseRange(source: string, annotationStart: number): { start: number; end: number } {
  let end = annotationStart;
  while (end > 0 && /\s/u.test(source[end - 1] ?? "")) end -= 1;
  if (end <= 0) throw new Error("批注前没有可修订的文字。请把批注放在需要修改的句子后面。");

  let cursor = end - 1;
  if (clauseBoundaryPattern.test(source[cursor] ?? "")) cursor -= 1;
  while (cursor >= 0 && !clauseBoundaryPattern.test(source[cursor] ?? "")) cursor -= 1;
  let start = cursor + 1;
  while (start < end && /\s/u.test(source[start] ?? "")) start += 1;
  const structuralPrefix = /^(?:(?:integrated_multimodal_description|detailed_description)\s*:\s*)?(?:\[Shot\s+\d+\]\s*)/iu.exec(
    source.slice(start, end)
  )?.[0] ?? "";
  start += structuralPrefix.length;
  if (start >= end) throw new Error("批注前没有可修订的文字。请把批注放在需要修改的句子后面。");
  return { start, end };
}

export function buildPromptRevisionPlan(sourcePrompt: string): PromptRevisionPlan {
  const parsed = parsePromptAnnotations(sourcePrompt);
  if (!parsed.annotations.length) {
    throw new Error("批注修订需要至少一条带标签的批注，例如（批注：把这里改成……）。");
  }
  if (/<\/?EDIT_TARGET_\d+>/iu.test(sourcePrompt)) {
    throw new Error("原提示词包含批注修订内部标记，请先移除 EDIT_TARGET 标签。");
  }

  const sourceTargets = parsed.annotations.map((annotation, index) => {
    const range = precedingClauseRange(sourcePrompt, annotation.sourceStart);
    const overlapsAnnotation = parsed.annotations.some((candidate) =>
      candidate.sourceStart < range.end && candidate.sourceEnd > range.start
    );
    if (overlapsAnnotation) {
      throw new Error("同一句存在相邻或重叠批注，请合并成一条批注后再修订。");
    }
    return {
      id: index + 1,
      instruction: annotation.text,
      original: sourcePrompt.slice(range.start, range.end),
      start: range.start,
      end: range.end
    };
  });

  let markedSource = sourcePrompt;
  for (const target of [...sourceTargets].reverse()) {
    markedSource = `${markedSource.slice(0, target.start)}${revisionOpenTag(target.id)}${target.original}${revisionCloseTag(target.id)}${markedSource.slice(target.end)}`;
  }
  const markedPrompt = stripPromptAnnotations(markedSource);
  const targets: PromptRevisionTarget[] = [];
  let cleanPrompt = "";
  let markedCursor = 0;
  for (const target of sourceTargets) {
    const open = revisionOpenTag(target.id);
    const close = revisionCloseTag(target.id);
    const openAt = markedPrompt.indexOf(open, markedCursor);
    const closeAt = openAt < 0 ? -1 : markedPrompt.indexOf(close, openAt + open.length);
    if (openAt < 0 || closeAt < 0) {
      throw new Error(`无法定位第 ${target.id} 条批注对应的原文，请把批注紧跟在需要修改的完整句子后面。`);
    }
    cleanPrompt += markedPrompt.slice(markedCursor, openAt);
    const original = markedPrompt.slice(openAt + open.length, closeAt);
    const start = cleanPrompt.length;
    cleanPrompt += original;
    const end = cleanPrompt.length;
    targets.push({
      id: target.id,
      instruction: target.instruction,
      original,
      start,
      end
    });
    markedCursor = closeAt + close.length;
  }
  cleanPrompt += markedPrompt.slice(markedCursor);

  for (let index = 1; index < targets.length; index += 1) {
    if ((targets[index]?.start ?? 0) < (targets[index - 1]?.end ?? 0)) {
      throw new Error("多条批注指向了重叠文字，请合并批注或分别标注不同句子。");
    }
  }

  return { cleanPrompt, markedPrompt, targets };
}

export function promptRevisionInstruction(
  sourcePrompt: string,
  referenceContext = "",
  revisionPolicy = ""
): string {
  const plan = buildPromptRevisionPlan(sourcePrompt);
  return [
    "Targeted prompt revision. The supplied draft is already approved except for the marked passages.",
    "Apply each revision note only to its matching EDIT_TARGET passage. Preserve the passage's role in the surrounding H3 structure and use attached reference media to resolve visible identity, action, position, contact, or scale when requested.",
    "Return exactly one non-empty replacement block for every target, in numerical order, using the same tags shown below. Return no full draft, analysis, preface, Markdown fence, or text outside the blocks. Do not include the annotation label or note text inside a replacement.",
    "If visual evidence is unclear, follow the user's stated role-action mapping. Never compensate by revising an unmarked passage.",
    ...(referenceContext.trim() ? [`Reference roles:\n${referenceContext.trim()}`] : []),
    ...(revisionPolicy.trim() ? [`Additional revision guidance (cannot widen the editable scope):\n${revisionPolicy.trim()}`] : []),
    `Approved draft with editable passages:\n${plan.markedPrompt}`,
    "Revision notes:",
    ...plan.targets.map((target) =>
      `Target ${target.id} ${revisionOpenTag(target.id)}: ${target.instruction}`
    )
  ].join("\n\n");
}

function revisionReplacement(output: string, target: PromptRevisionTarget): string {
  const open = revisionOpenTag(target.id);
  const close = revisionCloseTag(target.id);
  const start = output.indexOf(open);
  const end = start < 0 ? -1 : output.indexOf(close, start + open.length);
  if (start < 0 || end < 0 || output.indexOf(open, start + open.length) >= 0) {
    throw new Error(`提示词模型没有按要求返回第 ${target.id} 条局部修订；原提示词已保持不变。`);
  }
  const replacement = stripPromptAnnotations(output.slice(start + open.length, end).trim());
  if (!replacement || /<\/?EDIT_TARGET_\d+>/iu.test(replacement)) {
    throw new Error(`第 ${target.id} 条局部修订为空或格式无效；原提示词已保持不变。`);
  }
  if (replacement === target.original.trim()) {
    throw new Error(`第 ${target.id} 条批注没有产生修改；原提示词已保持不变。`);
  }
  return replacement;
}

export function applyPromptRevision(sourcePrompt: string, modelOutput: string): string {
  const plan = buildPromptRevisionPlan(sourcePrompt);
  const replacements = plan.targets.map((target) => ({
    target,
    text: revisionReplacement(modelOutput, target)
  }));
  let result = plan.cleanPrompt;
  for (const replacement of [...replacements].reverse()) {
    result = `${result.slice(0, replacement.target.start)}${replacement.text}${result.slice(replacement.target.end)}`;
  }
  return stripPromptAnnotations(result).trim();
}
