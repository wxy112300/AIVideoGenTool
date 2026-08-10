import type { H3PromptMode } from "../types.js";
import { inferH3PromptMode } from "./h3-prompt.js";

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
  hasEndImage?: boolean;
  mode?: H3PromptMode;
  hasImageReference?: boolean;
  hasVideoReference?: boolean;
  durationSeconds?: number;
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
    .every((match) => /\bAt\s+\d{2}:\d{2}(?:\.\d{3})?/u.test(match[0]));
  if (!hasTimestamp) return false;
  const timestamps = shotBlocks
    .map((match) => match[0].match(/\bAt\s+(\d{2}):(\d{2})(?:\.(\d{3}))?/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]) * 60_000 + Number(match[2]) * 1_000 + Number(match[3] ?? 0));
  return timestamps.every((value, index) => index === 0 || value > timestamps[index - 1]!);
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
  return [...prompt.matchAll(/\bAt\s+(\d{2}):(\d{2})\.(\d{3})/giu)]
    .filter((match) => Number(match[2]) >= 60 || (
      Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000
    ) > durationSeconds! + 0.001)
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

export function checkH3Prompt(
  promptText: string,
  options: H3PromptCheckOptions = {}
): H3PromptCheckResult {
  const prompt = promptText.trim();
  const mode = options.mode ?? inferH3PromptMode(
    options.hasImageReference ?? true,
    Boolean(options.hasEndImage)
  );
  const items: H3PromptCheckItem[] = [];
  const requiredSections = mode === "R2V" ? r2vSections : baseSections;
  const missingSections = requiredSections.filter((section) => !prompt.includes(section));
  if (missingSections.length) {
    items.push({
      level: "warning",
      message: `缺少官方字段：${missingSections.join("、")}`
    });
  }
  if (!sectionsInOrder(prompt, requiredSections)) {
    items.push({
      level: "warning",
      message: "官方字段顺序不正确；请按固定顺序排列，不要把声音或保留关系段落穿插到时间轴中。"
    });
  }
  if (!sectionsInOrder(prompt, requiredSections)) {
    items.push({
      level: "warning",
      message: "官方字段顺序不正确；请按固定顺序排列，不要把声音或保留关系段落穿插到时间轴中。"
    });
  }

  const timeline = prompt.match(/(?:integrated_multimodal_description:|detailed_description:)[\s\S]*/iu)?.[0] ?? "";
  if (!/\[Shot\s+1\]/iu.test(timeline)) {
    items.push({
      level: "warning",
      message: "主时间轴建议以 [Shot 1] 开始，先锁定初始画面再描述动作。"
    });
  }

  if (mode === "R2V") {
    if (/\b(?:contact sheet|sheet cells?|sampled frames?|internal media analysis)\b/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: "最终提示词泄露了接触表或抽帧等内部分析描述；这些内容不能成为目标镜头。"
      });
    }
    if (/\b(?:contact sheet|sheet cells?|sampled frames?|internal media analysis)\b/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: "最终提示词泄露了接触表或抽帧等内部分析描述；这些内容不能成为目标镜头。"
      });
    }
    const hasImageReference = options.hasImageReference ?? true;
    if (hasImageReference && !/<(?:Subject|Picture)\s+1>/iu.test(prompt)) {
      items.push({
        level: "warning",
        message: "R2V 至少需要在提示词中定义或引用 <Subject 1> 或 <Picture 1>"
      });
    }
    if (options.hasVideoReference && !prompt.includes("<Video 1>")) {
      items.push({
        level: "warning",
        message: "当前包含参考视频，建议在提示词中明确引用 <Video 1> 并说明它的作用。"
      });
    }
    const summary = prompt.match(/summary:\s*([\s\S]*?)(?=\n\s*retention_analysis:|$)/iu)?.[1] ?? "";
    if (!/^\s*\[[^\]]+\]/u.test(summary)) {
      items.push({
        level: "warning",
        message: "R2V summary 应以 [reference generation] 等官方任务类型前缀开头"
      });
    }
    const retention = prompt.match(/retention_analysis:\s*([\s\S]*?)(?=\n\s*detailed_description:|$)/iu)?.[1] ?? "";
    if (!/(?:fully_preserved|partially_preserved|attribute_transfer|weak_reference|fully_copy|partially_copy|reference)/iu.test(retention)) {
      items.push({
        level: "warning",
        message: "R2V retention_analysis 应使用官方保留关系词"
      });
    }
  } else if (mode === "T2VA") {
    if (prompt.includes("Picture 1") || prompt.includes("How the reference pictures align")) {
      items.push({
        level: "warning",
        message: "T2VA 没有参考图，不应生成 Picture 对齐语句"
      });
    }
    if (!startsWithOfficialInstruction(prompt, mode)) {
      items.push({
        level: "warning",
        message: "T2VA 的第一个官方字段必须直接位于提示词第一行"
      });
    }
  } else {
    const alignmentPhrase = mode === "I2VA"
      ? "For the target video"
      : "How the reference pictures align";
    if (!prompt.includes(alignmentPhrase)) {
      items.push({
        level: "warning",
        message: `${mode} 尚未检测到官方参考图对齐说明`
      });
    }
    if (!startsWithOfficialInstruction(prompt, mode)) {
      items.push({
        level: "warning",
        message: `${mode} 的官方参考图对齐说明必须位于提示词第一行`
      });
    }
    if (mode === "FL2VA" && !prompt.includes("Picture 2")) {
      items.push({
        level: "warning",
        message: "FL2VA 需要在提示词中说明 Picture 2 的结束状态"
      });
    }
    if (mode === "I2VA" && prompt.includes("Picture 2")) {
      items.push({
        level: "warning",
        message: "当前只有首帧，但提示词提到了 Picture 2；请确认是否应该添加尾帧"
      });
    }
    if (mode === "L2VA" && !prompt.includes("Picture 1")) {
      items.push({
        level: "warning",
        message: "L2VA 需要在提示词中说明 Picture 1 的最终状态"
      });
    }
  }

  if (hasDialogue(prompt)) {
    if (!hasSpeakerId(prompt)) {
      items.push({
        level: "warning",
        message: "检测到对白，但没有稳定说话人 ID，例如 (S1)"
      });
    }
    if (!/<d>\s*\[[A-Za-z-]+\]/u.test(prompt)) {
      items.push({
        level: "warning",
        message: "对白建议使用 <d>[Chinese] ...</d> 或其它明确语言标签"
      });
    }
  }
  if (!checkShotTimestamps(prompt)) {
    items.push({
      level: "warning",
      message: "SHOT 2 及之后的镜头需要递增的 At 00:03.500 时间戳"
    });
  }
  if (firstShotHasTimestamp(prompt)) {
    items.push({
      level: "warning",
      message: "官方格式要求 [Shot 1] 不添加 At 时间戳"
    });
  }
  const outsideDuration = timestampsOutsideDuration(prompt, options.durationSeconds);
  if (outsideDuration.length) {
    items.push({
      level: "warning",
      message: `检测到超出视频时长或格式非法的时间戳：${[...new Set(outsideDuration)].join("、")}`
    });
  }
  const soundscape = prompt.match(/overall_soundscape:\s*([\s\S]*?)(?=\n\s*non_diegetic_music:|$)/iu)?.[1] ?? "";
  if (/<d>|\bsays\b|\bdialogue\b/iu.test(soundscape)) {
    items.push({
      level: "warning",
      message: "overall_soundscape 不应重复放对白；对白应写在 integrated_multimodal_description"
    });
  }
  if (sentenceCount(soundscape) > 4) {
    items.push({
      level: "warning",
      message: "overall_soundscape 按官方指南应控制在 1-4 句"
    });
  }
  const music = prompt.match(/non_diegetic_music:\s*([\s\S]*?)(?=\n\s*(?:subject_definitions:|summary:|retention_analysis:|detailed_description:|integrated_multimodal_description:)|$)/iu)?.[1] ?? "";
  if (sentenceCount(music) > 3) {
    items.push({
      level: "warning",
      message: "non_diegetic_music 按官方指南应控制在 1-3 句"
    });
  }

  const valid = items.length === 0;
  return {
    mode,
    items,
    valid,
    summary: valid
      ? `${mode} 结构完整 · 官方字段、参考图和音频段落已识别`
      : `${mode} 检查发现 ${items.length} 项可改进内容`
  };
}
