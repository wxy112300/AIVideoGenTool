import type { H3PromptMode, VideoLoraSelection } from "../types.js";
import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
import { inferH3PromptMode } from "./h3-prompt.js";
import { parseH3Timecode } from "./h3-temporal.js";
import {
  promptContainsVideoLoraTrigger,
  videoLoraDefinition
} from "./video-loras.js";
import {
  extractH3DialogueLocks,
  type H3DialogueLock,
  validateH3DialogueOutput
} from "./h3-dialogue.js";

export type H3PromptCheckLevel = "ok" | "warning";

export interface H3PromptCheckItem {
  level: H3PromptCheckLevel;
  message: string;
}

export interface H3PromptCheckResult {
  mode: H3PromptMode;
  items: H3PromptCheckItem[];
  summary: string;
  valid: boolean;
}

export interface H3PromptCheckOptions {
  t?: Translate;
  hasEndImage?: boolean;
  mode?: H3PromptMode;
  hasImageReference?: boolean;
  hasVideoReference?: boolean;
  durationSeconds?: number;
  videoLoras?: readonly VideoLoraSelection[];
  dialogueLocks?: readonly H3DialogueLock[];
  sourcePrompt?: string;
}

const baseSections = [
  "integrated_multimodal_description:",
  "overall_soundscape:",
  "non_diegetic_music:"
] as const;

const r2vSections = [
  "subject_definitions:",
  "summary:",
  "retention_analysis:",
  "detailed_description:",
  "overall_soundscape:",
  "non_diegetic_music:"
] as const;

function hasDialogue(prompt: string): boolean {
  return /<d>\s*\[[^\]]+\]\s*.+?<\/d>/su.test(prompt);
}

function hasSpeakerId(prompt: string): boolean {
  return /\(S\d+(?:\s*,\s*S\d+)*\)/u.test(prompt);
}

function checkShotTimestamps(prompt: string): boolean {
  const shotNumbers = [...prompt.matchAll(/\[Shot\s+(\d+)\]/giu)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value));
  if (!shotNumbers.some((value) => value >= 2)) return true;
  const shotBlocks = [...prompt.matchAll(/\[Shot\s+(\d+)\][\s\S]*?(?=\[Shot\s+\d+\]|$)/giu)];
  const hasTimestamp = shotBlocks
    .filter((match) => Number(match[1]) >= 2)
    .every((match) => parseH3Timecode(match[0].match(/\bAt\s+(\d{1,2}:\d{2}(?:\.\d{1,3})?)/u)?.[1] ?? "") !== undefined);
  if (!hasTimestamp) return false;
  const timestamps = shotBlocks
    .map((match) => match[0].match(/\bAt\s+(\d{1,2}:\d{2}(?:\.\d{1,3})?)/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => parseH3Timecode(match[1]!));
  return timestamps.every((value, index) => value !== undefined && (index === 0 || value > timestamps[index - 1]!));
}

function firstShotHasTimestamp(prompt: string): boolean {
  const timelineStart = prompt.search(/(?:integrated_multimodal_description:|detailed_description:)/iu);
  if (timelineStart < 0) return false;
  const timeline = prompt.slice(timelineStart);
  const firstShotMarker = /\[Shot\s+1\]/iu.exec(timeline);
  if (!firstShotMarker || firstShotMarker.index === undefined) return false;
  const afterMarker = timeline.slice(firstShotMarker.index + firstShotMarker[0].length);
  const nextShotIndex = afterMarker.search(/\[Shot\s+\d+\]/iu);
  const firstShot = nextShotIndex >= 0
    ? afterMarker.slice(0, nextShotIndex)
    : afterMarker;
  return /\bAt\s+\d{2}:\d{2}(?:\.\d{3})?/u.test(firstShot);
}

function sectionsInOrder(prompt: string, sections: readonly string[]): boolean {
  let previous = -1;
  for (const section of sections) {
    const index = prompt.indexOf(section);
    if (index < 0) continue;
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function timestampsOutsideDuration(prompt: string, durationSeconds?: number): string[] {
  if (!Number.isFinite(durationSeconds) || (durationSeconds ?? 0) <= 0) return [];
  return [...prompt.matchAll(/\bAt\s+(\d{1,2}:\d{2}(?:\.\d{1,3})?)/giu)]
    .filter((match) => {
      const seconds = parseH3Timecode(match[1]!);
      return seconds === undefined || seconds > durationSeconds! + 0.001;
    })
    .map((match) => match[0]);
}

function startsWithOfficialInstruction(prompt: string, mode: H3PromptMode): boolean {
  if (mode === "T2VA") return prompt.startsWith("integrated_multimodal_description:");
  if (mode === "I2VA") return prompt.startsWith("For the target video, at 0.00 seconds");
  if (mode === "FL2VA" || mode === "L2VA") {
    return prompt.startsWith("How the reference pictures align with the target video");
  }
  return true;
}

function sentenceCount(section: string): number {
  const content = section.trim();
  if (!content || /^N\/A$/iu.test(content)) return 0;
  return Math.max(1, content.match(/[.!?](?=\s|$)/gu)?.length ?? 1);
}

function promptPrefixesForLora(lora: VideoLoraSelection): string[] {
  return [...new Set((lora.promptPrefixes ?? videoLoraDefinition(lora.id)?.promptPrefixes ?? [])
    .map((prefix) => prefix.trim())
    .filter(Boolean))];
}

export function checkH3Prompt(
  promptText: string,
  options: H3PromptCheckOptions = {}
): H3PromptCheckResult {
  const t = options.t ?? createTranslator("zh-CN").t;
  const prompt = promptText.trim();
  const mode = options.mode ?? inferH3PromptMode(
    options.hasImageReference ?? true,
    Boolean(options.hasEndImage)
  );
  const items: H3PromptCheckItem[] = [];
  for (const lora of options.videoLoras ?? []) {
    const missingTriggers = promptPrefixesForLora(lora)
      .filter((trigger) => !promptContainsVideoLoraTrigger(prompt, trigger));
    if (!missingTriggers.length) continue;
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.loraTriggers, { name: lora.name, triggers: missingTriggers.join(", ") })
    });
  }
  const requiredSections = mode === "R2V" ? r2vSections : baseSections;
  const missingSections = requiredSections.filter((section) => !prompt.includes(section));
  if (missingSections.length) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.missingSections, { sections: missingSections.join(", ") })
    });
  }
  if (!sectionsInOrder(prompt, requiredSections)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.sectionOrder)
    });
  }
  if (!sectionsInOrder(prompt, requiredSections)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.sectionOrder)
    });
  }

  const timeline = prompt.match(/(?:integrated_multimodal_description:|detailed_description:)[\s\S]*/iu)?.[0] ?? "";
  if (!/\[Shot\s+1\]/iu.test(timeline)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.firstShot)
    });
  }

  if (mode === "R2V") {
    if (/\b(?:contact sheet|sheet cells?|sampled frames?|internal media analysis)\b/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.internalAnalysis)
      });
    }
    if (/\b(?:contact sheet|sheet cells?|sampled frames?|internal media analysis)\b/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.internalAnalysis)
      });
    }
    const hasImageReference = options.hasImageReference ?? true;
    if (hasImageReference && !/<(?:Subject|Picture)\s+1>/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.r2vImage)
      });
    }
    if (options.hasVideoReference && !prompt.includes("<Video 1>")) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.r2vVideo)
      });
    }
    const summary = prompt.match(/summary:\s*([\s\S]*?)(?=\n\s*retention_analysis:|$)/iu)?.[1] ?? "";
    if (!/^\s*\[[^\]]+\]/u.test(summary)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.r2vSummary)
      });
    }
    const retention = prompt.match(/retention_analysis:\s*([\s\S]*?)(?=\n\s*detailed_description:|$)/iu)?.[1] ?? "";
    if (!/(?:fully_preserved|partially_preserved|attribute_transfer|weak_reference|fully_copy|partially_copy|reference)/iu.test(retention)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.r2vRetention)
      });
    }
  } else if (mode === "T2VA") {
    if (prompt.includes("Picture 1") || prompt.includes("How the reference pictures align")) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.t2vaAlignment)
      });
    }
    if (!startsWithOfficialInstruction(prompt, mode)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.t2vaOpening)
      });
    }
  } else {
    const alignmentPhrase = mode === "I2VA"
      ? "For the target video"
      : "How the reference pictures align";
    if (!prompt.includes(alignmentPhrase)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.missingAlignment, { mode })
      });
    }
    if (!startsWithOfficialInstruction(prompt, mode)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.alignmentOpening, { mode })
      });
    }
    if (mode === "FL2VA" && !prompt.includes("Picture 2")) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.fl2vaEnd)
      });
    }
    if (mode === "I2VA" && prompt.includes("Picture 2")) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.i2vaEnd)
      });
    }
    if (mode === "L2VA" && !prompt.includes("Picture 1")) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.l2vaEnd)
      });
    }
  }

  if (hasDialogue(prompt)) {
    if (!hasSpeakerId(prompt)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.speakerId)
      });
    }
    if (!/<d>\s*\[[^\]\r\n]+\]/u.test(prompt)) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.dialogueLanguage)
      });
    }
  }
  const dialogueLocks = options.dialogueLocks ?? (
    options.sourcePrompt ? extractH3DialogueLocks(options.sourcePrompt) : []
  );
  if (dialogueLocks.length) {
    const dialogueValidation = validateH3DialogueOutput(prompt, dialogueLocks);
    if (dialogueValidation.missing.length) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.missingDialogue, { count: dialogueValidation.missing.length })
      });
    }
    if (dialogueValidation.duplicates.length) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.duplicateDialogue, { count: dialogueValidation.duplicates.length })
      });
    }
    if (dialogueValidation.unexpected.length) {
      items.push({
        level: "warning",
        message: t(uiKeys.h3PromptCheck.unexpectedDialogue, { count: dialogueValidation.unexpected.length })
      });
    }
  }
  if (!checkShotTimestamps(prompt)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.shotTimestamps)
    });
  }
  if (firstShotHasTimestamp(prompt)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.firstTimestamp)
    });
  }
  const outsideDuration = timestampsOutsideDuration(prompt, options.durationSeconds);
  if (outsideDuration.length) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.invalidTimestamps, { timestamps: [...new Set(outsideDuration)].join(", ") })
    });
  }
  const soundscape = prompt.match(/overall_soundscape:\s*([\s\S]*?)(?=\n\s*non_diegetic_music:|$)/iu)?.[1] ?? "";
  if (/<d>|\bsays\b|\bdialogue\b/iu.test(soundscape)) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.soundscapeDialogue)
    });
  }
  if (sentenceCount(soundscape) > 4) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.soundscapeLength)
    });
  }
  const music = prompt.match(/non_diegetic_music:\s*([\s\S]*?)(?=\n\s*(?:subject_definitions:|summary:|retention_analysis:|detailed_description:|integrated_multimodal_description:)|$)/iu)?.[1] ?? "";
  if (sentenceCount(music) > 3) {
    items.push({
      level: "warning",
      message: t(uiKeys.h3PromptCheck.musicLength)
    });
  }

  const valid = items.length === 0;
  return {
    mode,
    items,
    valid,
    summary: valid
      ? t(uiKeys.h3PromptCheck.valid, { mode })
      : t(uiKeys.h3PromptCheck.review, { mode, count: items.length })
  };
}
