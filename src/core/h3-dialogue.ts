export type H3DialogueSourceKind = "tag" | "quoted";
export type H3DialogueVocalMode = "spoken" | "singing" | "voiceover";

export interface H3DialogueLock {
  id: string;
  speakerId: string;
  speakerHint: string;
  language: string;
  text: string;
  vocalMode: H3DialogueVocalMode;
  sourceKind: H3DialogueSourceKind;
  sourceStart: number;
  sourceEnd: number;
}

export interface H3VisibleTextLock {
  id: string;
  text: string;
  sourceKind: "quoted";
  sourceStart: number;
  sourceEnd: number;
}

export interface H3DialogueBlock {
  language: string;
  text: string;
  start: number;
  end: number;
}

export interface H3DialogueValidationResult {
  ok: boolean;
  missing: H3DialogueLock[];
  duplicates: H3DialogueLock[];
  unexpected: H3DialogueBlock[];
}

type RawDialogueCandidate = Omit<H3DialogueLock, "id" | "speakerId"> & {
  explicitSpeakerId?: string;
};

const languageAliases: readonly {
  name: string;
  patterns: readonly RegExp[];
}[] = [
  { name: "Japanese", patterns: [/日(?:语|文)/u, /日本語/iu, /\bjapanese\b/iu] },
  { name: "Korean", patterns: [/韩(?:语|文)/u, /한국어/iu, /\bkorean\b/iu] },
  { name: "Chinese", patterns: [/中(?:文|国话)|普通话|国语|汉语/u, /中文/iu, /\bmandarin(?: chinese)?\b/iu, /\bchinese\b/iu] },
  { name: "English", patterns: [/英语|英文/u, /\benglish\b/iu] },
  { name: "Spanish", patterns: [/西(?:班牙语|语)/u, /español/iu, /\bspanish\b/iu, /\bcatal(?:an|onian)\b/iu, /加泰罗尼亚语/u] },
  { name: "French", patterns: [/法语|法文/u, /français/iu, /\bfrench\b/iu] },
  { name: "German", patterns: [/德语|德文/u, /deutsch/iu, /\bgerman\b/iu] },
  { name: "Italian", patterns: [/意大利语|意大利文/u, /italiano/iu, /\bitalian\b/iu] },
  { name: "Portuguese", patterns: [/葡萄牙语|葡萄牙文/u, /português/iu, /\bportuguese\b/iu] },
  { name: "Russian", patterns: [/俄语|俄文/u, /русский/iu, /\brussian\b/iu] },
  { name: "Arabic", patterns: [/阿拉伯语|阿拉伯文/u, /العربية/iu, /\barabic\b/iu] },
  { name: "Hindi", patterns: [/印地语|印地文/u, /हिन्दी/iu, /\bhindi\b/iu] },
  { name: "Thai", patterns: [/泰语|泰文/u, /ภาษาไทย/iu, /\bthai\b/iu] },
  { name: "Vietnamese", patterns: [/越南语|越南文/u, /tiếng việt/iu, /\bvietnamese\b/iu] }
];

const speechCuePattern = /(?:\b(?:say|says|said|saying|speak|speaks|spoken|ask|asks|asked|reply|replies|replied|answer|answers|answered|shout|shouts|shouted|yell|yells|yelled|whisper|whispers|whispered|sing|sings|sang|singing|chant|chants|recite|recites|voiceover|dialogue|line)\b|说|说道|说着|喊|叫|问|回答|低声|大声|唱|唱着|念|旁白|台词|对白|発言|言う|話す|喋る|말하|말한다|외치|노래)/iu;
const visualTextCuePattern = /(?:\bon[- ]screen\b|screen\s+text|visible\s+text|banner|sign|label|subtitle|caption|logo|title|text\s+(?:reads?|says?)|written|displayed|显示|写着|招牌|标语|字幕|画面文字|屏幕文字|文字)/iu;
const humanSpeakerCuePattern = /(?:\b(?:character|person|man|woman|girl|boy|speaker|narrator|voice)\b|角色|人物|女孩|男孩|男人|女人|说话人|旁白|声音)/iu;
const voiceoverCuePattern = /(?:\bvoice[- ]?over\b|off[- ]screen\s+(?:voice|narration)|\bnarrat(?:e|es|ed|ion)\b|旁白|画外音|幕后旁白)/iu;
const singingCuePattern = /(?:\bsing(?:s|ing|er)?\b|\bchant(?:s|ing)?\b|singing\s+voice|唱|唱着|歌唱|吟唱|歌词)/iu;

function normalizeComparableText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function normalizeSpeakerHint(value: string): string {
  return normalizeComparableText(value)
    .replace(/^(?:the|a|an)\s+/iu, "")
    .toLocaleLowerCase();
}

export function normalizeH3DialogueLanguage(value: string): string {
  const candidate = value.replace(/[\[\]]/gu, " ").replace(/\s+/gu, " ").trim();
  if (!candidate) return "English";
  for (const alias of languageAliases) {
    if (alias.patterns.some((pattern) => pattern.test(candidate))) return alias.name;
  }
  return candidate;
}

function languageFromContext(context: string): string | undefined {
  let latest: { name: string; index: number } | undefined;
  for (const alias of languageAliases) {
    for (const pattern of alias.patterns) {
      const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
      for (const match of context.matchAll(globalPattern)) {
        const index = match.index ?? 0;
        if (!latest || index >= latest.index) latest = { name: alias.name, index };
      }
    }
  }
  return latest?.name;
}

function languageFromText(text: string): string {
  if (/[\u3040-\u30ff]/u.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/u.test(text)) return "Korean";
  if (/[\u0600-\u06ff\u0750-\u077f]/u.test(text)) return "Arabic";
  if (/[\u0900-\u097f]/u.test(text)) return "Hindi";
  if (/[\u0e00-\u0e7f]/u.test(text)) return "Thai";
  if (/[\u0400-\u04ff]/u.test(text)) return "Russian";
  if (/[\u0370-\u03ff]/u.test(text)) return "Greek";
  if (/[\u0590-\u05ff]/u.test(text)) return "Hebrew";
  if (/\p{Script=Han}/u.test(text)) return "Chinese";

  const lower = text.toLocaleLowerCase();
  const lexicalCandidates: readonly [string, readonly string[]][] = [
    ["Spanish", ["hola", "adiós", "que", "quiero", "gracias", "por favor", "el", "la", "los", "las"]],
    ["French", ["bonjour", "merci", "je", "vous", "nous", "avec", "le", "la", "les"]],
    ["German", ["hallo", "danke", "ich", "nicht", "und", "der", "die", "das"]],
    ["Italian", ["ciao", "grazie", "voglio", "non", "con", "il", "lo", "la"]],
    ["Portuguese", ["olá", "obrigado", "você", "não", "quero", "com", "uma"]],
    ["English", ["hello", "thanks", "please", "i", "you", "we", "the", "is", "are"]]
  ];
  let best = "English";
  let bestScore = 0;
  for (const [language, words] of lexicalCandidates) {
    const score = words.reduce(
      (total, word) => total + (new RegExp(`(?:^|[^a-z])${word}(?:$|[^a-z])`, "iu").test(lower) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return best;
}

function dialogueLanguage(context: string, text: string, explicitTag = ""): string {
  return explicitTag.trim()
    ? normalizeH3DialogueLanguage(explicitTag)
    : languageFromContext(context) ?? languageFromText(text);
}

function vocalModeFromContext(context: string): H3DialogueVocalMode {
  if (voiceoverCuePattern.test(context)) return "voiceover";
  if (singingCuePattern.test(context)) return "singing";
  return "spoken";
}

function speakerIdFromContext(context: string): string | undefined {
  const matches = [...context.matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/giu)];
  return matches.at(-1)?.[1]?.replace(/\s+/gu, "")?.toUpperCase();
}

function speakerHintFromContext(context: string): string {
  const line = context.split(/\r?\n/u).at(-1)?.trim() ?? context.trim();
  const cjkMatch = /(?:^|[，,。.!?；;])\s*([^，,。.!?；;:：]{1,32}?)(?:用[^，,。.!?；;:：]{0,12})?(?:说|说道|说着|喊|叫|问|回答|低声|大声|唱|念)\s*$/u.exec(line);
  if (cjkMatch?.[1]) return cjkMatch[1].trim();
  const latinMatch = /(?:^|[,.!?;:])\s*([A-Z][A-Za-z0-9 _-]{0,31})\s+(?:says?|asks?|replies?|answers?|shouts?|yells?|whispers?|sings?)\s*$/iu.exec(line);
  if (latinMatch?.[1]) return latinMatch[1].trim();
  const labelMatch = /([^\s，,。.!?；;:：]{1,32})\s*[:：]\s*$/u.exec(line);
  return labelMatch?.[1]?.trim() ?? "";
}

function isLikelyDialogue(before: string, after: string): boolean {
  const context = `${before}\n${after}`;
  const hasVisualCue = visualTextCuePattern.test(before) || visualTextCuePattern.test(after);
  if (visualTextCuePattern.test(before) && !speechCuePattern.test(before)) return false;
  if (hasVisualCue && !humanSpeakerCuePattern.test(context)) return false;
  if (speechCuePattern.test(context)) return true;
  if (hasVisualCue) return false;
  const line = before.split(/\r?\n/u).at(-1)?.trim() ?? "";
  return /(?:^|[，,])\s*[^，,。.!?；;:：]{1,40}\s*[:：]\s*$/u.test(line);
}

function overlapsExistingRange(
  start: number,
  end: number,
  candidates: readonly RawDialogueCandidate[]
): boolean {
  return candidates.some((candidate) => start < candidate.sourceEnd && end > candidate.sourceStart);
}

function rawCandidate(
  text: string,
  language: string,
  before: string,
  sourceStart: number,
  sourceEnd: number,
  sourceKind: H3DialogueSourceKind,
  explicitSpeakerId?: string
): RawDialogueCandidate | null {
  const spokenText = text.trim();
  if (!spokenText) return null;
  return {
    speakerHint: speakerHintFromContext(before),
    language: dialogueLanguage(`${before}\n${text}`, spokenText, language),
    text: spokenText,
    vocalMode: vocalModeFromContext(`${before}\n${text}`),
    sourceKind,
    sourceStart,
    sourceEnd,
    explicitSpeakerId
  };
}

function nearestCueDistance(
  text: string,
  start: number,
  end: number,
  pattern: RegExp
): number | undefined {
  const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  let nearest: number | undefined;
  for (const match of text.matchAll(globalPattern)) {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const distance = matchEnd < start
      ? start - matchEnd
      : matchStart > end
        ? matchStart - end
        : 0;
    if (nearest === undefined || distance < nearest) nearest = distance;
  }
  return nearest;
}

export function extractH3DialogueLocks(sourcePrompt: string): H3DialogueLock[] {
  const candidates: RawDialogueCandidate[] = [];
  const taggedRanges: Array<{ start: number; end: number }> = [];
  const taggedPattern = /<d>\s*\[([^\]]+)\]\s*([\s\S]*?)<\/d>/giu;
  for (const match of sourcePrompt.matchAll(taggedPattern)) {
    const start = match.index ?? 0;
    const full = match[0] ?? "";
    const end = start + full.length;
    taggedRanges.push({ start, end });
    const before = sourcePrompt.slice(Math.max(0, start - 160), start);
    const candidate = rawCandidate(
      match[2] ?? "",
      match[1] ?? "",
      before,
      start,
      end,
      "tag",
      speakerIdFromContext(before)
    );
    if (candidate) candidates.push(candidate);
  }

  const quotedPattern = /(["“「『«])([\s\S]*?)["”」』»]/gu;
  for (const match of sourcePrompt.matchAll(quotedPattern)) {
    const start = match.index ?? 0;
    const full = match[0] ?? "";
    const end = start + full.length;
    if (taggedRanges.some((range) => start >= range.start && end <= range.end)) continue;
    const before = sourcePrompt.slice(Math.max(0, start - 160), start);
    const after = sourcePrompt.slice(end, Math.min(sourcePrompt.length, end + 100));
    const contextStart = Math.max(0, start - 180);
    const contextEnd = Math.min(sourcePrompt.length, end + 120);
    const context = sourcePrompt.slice(contextStart, contextEnd);
    const relativeStart = start - contextStart;
    const relativeEnd = end - contextStart;
    const vocalDistance = nearestCueDistance(context, relativeStart, relativeEnd, speechCuePattern);
    const visibleDistance = nearestCueDistance(context, relativeStart, relativeEnd, visualTextCuePattern);
    if (visibleDistance !== undefined && (vocalDistance === undefined || visibleDistance < vocalDistance)) continue;
    if (!isLikelyDialogue(before, after)) continue;
      const candidate = rawCandidate(
        match[2] ?? "",
        languageFromContext(before) ?? languageFromContext(after) ?? "",
        before,
      start,
      end,
      "quoted",
      speakerIdFromContext(before)
    );
    if (candidate && !overlapsExistingRange(start, end, candidates)) candidates.push(candidate);
  }

  candidates.sort((left, right) => left.sourceStart - right.sourceStart);
  const speakerIds = new Map<string, string>();
  const usedSpeakerIds = new Set<string>();
  let nextSpeaker = 1;
  return candidates.map((candidate, index) => {
    const explicit = candidate.explicitSpeakerId?.split(",")[0]?.trim();
    const hintKey = normalizeSpeakerHint(candidate.speakerHint);
    const existing = explicit || (hintKey ? speakerIds.get(hintKey) : undefined);
    let speakerId = existing;
    if (!speakerId) {
      while (usedSpeakerIds.has(`S${nextSpeaker}`)) nextSpeaker += 1;
      speakerId = `S${nextSpeaker++}`;
    }
    usedSpeakerIds.add(speakerId);
    if (hintKey && !speakerIds.has(hintKey)) speakerIds.set(hintKey, speakerId);
    return {
      id: `D${index + 1}`,
      speakerId,
      speakerHint: candidate.speakerHint,
      language: candidate.language,
      text: candidate.text,
      vocalMode: candidate.vocalMode,
      sourceKind: candidate.sourceKind,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd
    };
  });
}

export function extractH3VisibleTextLocks(sourcePrompt: string): H3VisibleTextLock[] {
  const dialogueLocks = extractH3DialogueLocks(sourcePrompt);
  const locks: H3VisibleTextLock[] = [];
  const quotedPattern = /(["“「『«])([\s\S]*?)["”」』»]/gu;
  for (const match of sourcePrompt.matchAll(quotedPattern)) {
    const start = match.index ?? 0;
    const full = match[0] ?? "";
    const end = start + full.length;
    if (dialogueLocks.some((lock) => start >= lock.sourceStart && end <= lock.sourceEnd)) continue;

    const contextStart = Math.max(0, start - 180);
    const contextEnd = Math.min(sourcePrompt.length, end + 120);
    const context = sourcePrompt.slice(contextStart, contextEnd);
    const relativeStart = start - contextStart;
    const relativeEnd = end - contextStart;
    const visibleDistance = nearestCueDistance(
      context,
      relativeStart,
      relativeEnd,
      visualTextCuePattern
    );
    if (visibleDistance === undefined) continue;
    const vocalDistance = nearestCueDistance(
      context,
      relativeStart,
      relativeEnd,
      speechCuePattern
    );
    if (vocalDistance !== undefined && vocalDistance < visibleDistance) continue;

    const text = (match[2] ?? "").trim();
    if (!text) continue;
    locks.push({
      id: `T${locks.length + 1}`,
      text,
      sourceKind: "quoted",
      sourceStart: start,
      sourceEnd: end
    });
  }
  return locks.sort((left, right) => left.sourceStart - right.sourceStart)
    .map((lock, index) => ({ ...lock, id: `T${index + 1}` }));
}

export function stripH3DialogueFromSource(
  sourcePrompt: string,
  locks: readonly H3DialogueLock[] = extractH3DialogueLocks(sourcePrompt)
): string {
  if (!locks.length) return sourcePrompt;
  const sorted = [...locks].sort((left, right) => left.sourceStart - right.sourceStart);
  let cursor = 0;
  let result = "";
  for (const lock of sorted) {
    if (lock.sourceStart < cursor || lock.sourceEnd <= lock.sourceStart) continue;
    result += sourcePrompt.slice(cursor, lock.sourceStart);
    result += sourcePrompt.slice(lock.sourceStart, lock.sourceEnd).replace(/[^\r\n]/gu, " ");
    cursor = lock.sourceEnd;
  }
  return `${result}${sourcePrompt.slice(cursor)}`;
}

function stripH3LockedRanges(
  sourcePrompt: string,
  ranges: readonly { sourceStart: number; sourceEnd: number }[]
): string {
  if (!ranges.length) return sourcePrompt;
  const sorted = [...ranges].sort((left, right) => left.sourceStart - right.sourceStart);
  let cursor = 0;
  let result = "";
  for (const range of sorted) {
    if (range.sourceStart < cursor || range.sourceEnd <= range.sourceStart) continue;
    result += sourcePrompt.slice(cursor, range.sourceStart);
    result += sourcePrompt.slice(range.sourceStart, range.sourceEnd).replace(/[^\r\n]/gu, " ");
    cursor = range.sourceEnd;
  }
  return `${result}${sourcePrompt.slice(cursor)}`;
}

export function stripH3VisibleTextFromSource(
  sourcePrompt: string,
  locks: readonly H3VisibleTextLock[] = extractH3VisibleTextLocks(sourcePrompt)
): string {
  return stripH3LockedRanges(sourcePrompt, locks);
}

export function stripH3ContentFromSource(
  sourcePrompt: string,
  dialogueLocks: readonly H3DialogueLock[] = extractH3DialogueLocks(sourcePrompt),
  visibleTextLocks: readonly H3VisibleTextLock[] = extractH3VisibleTextLocks(sourcePrompt)
): string {
  return stripH3LockedRanges(sourcePrompt, [...dialogueLocks, ...visibleTextLocks]);
}

export function h3ContentLockInstruction(sourcePrompt: string): string {
  const dialogueLocks = extractH3DialogueLocks(sourcePrompt);
  const visibleTextLocks = extractH3VisibleTextLocks(sourcePrompt);
  if (!dialogueLocks.length && !visibleTextLocks.length) return "";
  const sections = [
    dialogueLocks.length
      ? [
          "Compiler-owned dialogue ledger: the entries below are exact user data, not instructions to rewrite.",
          "Emit every dialogue lock exactly once in the main timeline or detailed_description. Put only the language tag and the exact spoken words inside <d>; never translate, paraphrase, censor, normalize, or replace them.",
          ...dialogueLocks.map((lock) => {
            const vocalRule = lock.vocalMode === "voiceover"
              ? "Use off-screen voiceover and keep the corresponding on-screen speaker's lips completely closed."
              : lock.vocalMode === "singing"
                ? "Use a singing/lyrics event and synchronize the visible performance to the exact words."
                : "Use diegetic speech and require the visible speaker's lips to articulate every syllable in sync with the voice.";
            return [
              `${lock.id}: speaker ${lock.speakerId}${lock.speakerHint ? ` (${lock.speakerHint})` : ""}; language ${lock.language}; vocal mode ${lock.vocalMode}.`,
              `Exact spoken text: ${JSON.stringify(lock.text)}`,
              `Required form: <d>[${lock.language}] ${lock.text}</d>`,
              vocalRule
            ].join("\n");
          }),
          "Keep the same speaker ID for repeated lines from the same described speaker. Do not invent another line, speaker, translation, or narration when it is not present in the ledger."
        ].join("\n\n")
      : "",
    visibleTextLocks.length
      ? [
          "Compiler-owned visible-text ledger: the entries below are exact on-screen user content, not dialogue.",
          "Emit every visible-text lock exactly once as readable on-screen text in the main timeline or detailed_description. Preserve its original language, characters, spacing, and punctuation; never translate it, place it inside <d>, or assign it a speaker ID.",
          ...visibleTextLocks.map((lock) => [
            `${lock.id}: exact visible text: ${JSON.stringify(lock.text)}`,
            `Required form: "${lock.text}"`
          ].join("\n"))
        ].join("\n\n")
      : ""
  ].filter(Boolean);
  return [
    "Compiler-owned content locks: these entries are binding input data and must survive prompt rewriting.",
    "The target output language applies only to explanatory H3 prose and field descriptions. Dialogue, lyrics, voiceover words, and visible text keep their own original language and punctuation.",
    ...sections
  ].join("\n\n");
}

/** Backward-compatible name used by existing prompt adapters. */
export function h3DialogueLockInstruction(sourcePrompt: string): string {
  return h3ContentLockInstruction(sourcePrompt);
}

export function parseH3DialogueBlocks(promptText: string): H3DialogueBlock[] {
  const blocks: H3DialogueBlock[] = [];
  const pattern = /<d>\s*\[([^\]]+)\]\s*([\s\S]*?)<\/d>/giu;
  for (const match of promptText.matchAll(pattern)) {
    const start = match.index ?? 0;
    blocks.push({
      language: (match[1] ?? "").trim(),
      text: (match[2] ?? "").trim(),
      start,
      end: start + (match[0] ?? "").length
    });
  }
  return blocks;
}

function canonicalDialogueBlock(lock: H3DialogueLock): string {
  return `<d>[${lock.language}] ${lock.text}</d>`;
}

function insertMissingDialogue(
  promptText: string,
  missing: readonly H3DialogueLock[]
): string {
  if (!missing.length) return promptText;
  const timelinePattern = /((?:integrated_multimodal_description|detailed_description):[\s\S]*?)(?=\n\s*(?:overall_soundscape|non_diegetic_music):|$)/iu;
  const match = timelinePattern.exec(promptText);
  if (!match || match.index === undefined) return promptText;
  const timeline = match[1] ?? "";
  const recovery = missing
    .map((lock) => `The corresponding speaker (${lock.speakerId}) says in ${lock.language}: ${canonicalDialogueBlock(lock)}.`)
    .join(" ");
  const replacement = `${timeline.trimEnd()} ${recovery}`;
  return `${promptText.slice(0, match.index)}${replacement}${promptText.slice(match.index + match[0].length)}`;
}

function parseQuotedTextBlocks(promptText: string): Array<{ text: string; start: number; end: number }> {
  const blocks: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /(["“「『«])([\s\S]*?)["”」』»]/gu;
  for (const match of promptText.matchAll(pattern)) {
    const start = match.index ?? 0;
    blocks.push({
      text: (match[2] ?? "").trim(),
      start,
      end: start + (match[0] ?? "").length
    });
  }
  return blocks;
}

function canonicalVisibleTextBlock(lock: H3VisibleTextLock): string {
  return `"${lock.text}"`;
}

function insertMissingVisibleText(
  promptText: string,
  missing: readonly H3VisibleTextLock[]
): string {
  if (!missing.length) return promptText;
  const timelinePattern = /((?:integrated_multimodal_description|detailed_description):[\s\S]*?)(?=\n\s*(?:overall_soundscape|non_diegetic_music):|$)/iu;
  const match = timelinePattern.exec(promptText);
  if (!match || match.index === undefined) return promptText;
  const timeline = match[1] ?? "";
  const recovery = missing
    .map((lock) => `A visible on-screen text element reads ${canonicalVisibleTextBlock(lock)}.`)
    .join(" ");
  const replacement = `${timeline.trimEnd()} ${recovery}`;
  return `${promptText.slice(0, match.index)}${replacement}${promptText.slice(match.index + match[0].length)}`;
}

export function restoreH3VisibleTextLocks(
  promptText: string,
  locks: readonly H3VisibleTextLock[]
): string {
  if (!locks.length) return promptText;
  const blocks = parseQuotedTextBlocks(promptText);
  const used = new Set<number>();
  let repaired = promptText;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    const lockIndex = locks.findIndex((lock, candidateIndex) =>
      !used.has(candidateIndex) && normalizeComparableText(lock.text) === normalizeComparableText(block.text)
    );
    if (lockIndex < 0) continue;
    used.add(lockIndex);
    const replacement = canonicalVisibleTextBlock(locks[lockIndex]!);
    repaired = `${repaired.slice(0, block.start)}${replacement}${repaired.slice(block.end)}`;
  }
  const missing = locks.filter((_lock, lockIndex) => !used.has(lockIndex));
  return insertMissingVisibleText(repaired, missing);
}

export function restoreH3DialogueLocks(
  promptText: string,
  locks: readonly H3DialogueLock[]
): string {
  if (!locks.length) return promptText;
  const blocks = parseH3DialogueBlocks(promptText);
  const used = new Set<number>();
  let repaired = promptText;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    const exactIndex = locks.findIndex((lock, lockIndex) =>
      !used.has(lockIndex) && normalizeComparableText(lock.text) === normalizeComparableText(block.text)
    );
    const fallbackIndex = exactIndex >= 0
      ? exactIndex
      : locks.findIndex((_lock, lockIndex) => !used.has(lockIndex));
    const replacement = fallbackIndex >= 0
      ? canonicalDialogueBlock(locks[fallbackIndex]!)
      : "";
    if (fallbackIndex >= 0) used.add(fallbackIndex);
    repaired = `${repaired.slice(0, block.start)}${replacement}${repaired.slice(block.end)}`;
  }
  const missing = locks.filter((_lock, lockIndex) => !used.has(lockIndex));
  return insertMissingDialogue(repaired, missing);
}

export function validateH3DialogueOutput(
  promptText: string,
  locks: readonly H3DialogueLock[]
): H3DialogueValidationResult {
  const blocks = parseH3DialogueBlocks(promptText);
  if (!locks.length) return { ok: true, missing: [], duplicates: [], unexpected: [] };
  const missing: H3DialogueLock[] = [];
  const duplicates: H3DialogueLock[] = [];
  const matchedBlockIndexes = new Set<number>();
  for (const lock of locks) {
    const matchingIndexes = blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => normalizeComparableText(block.text) === normalizeComparableText(lock.text))
      .map(({ index }) => index);
    if (!matchingIndexes.length) missing.push(lock);
    if (matchingIndexes.length > 1) duplicates.push(lock);
    matchingIndexes.forEach((index) => matchedBlockIndexes.add(index));
  }
  const unexpected = blocks.filter((_block, index) => !matchedBlockIndexes.has(index));
  return {
    ok: missing.length === 0 && duplicates.length === 0 && unexpected.length === 0,
    missing,
    duplicates,
    unexpected
  };
}
