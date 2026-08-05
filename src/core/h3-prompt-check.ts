export type H3PromptCheckLevel = "ok" | "warning";

export interface H3PromptCheckItem {
  level: H3PromptCheckLevel;
  message: string;
}

export interface H3PromptCheckResult {
  mode: "I2VA" | "FL2VA" | "R2V";
  items: H3PromptCheckItem[];
  summary: string;
  valid: boolean;
}

export interface H3PromptCheckOptions {
  hasEndImage?: boolean;
  mode?: "I2VA" | "FL2VA" | "R2V";
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
  return shotBlocks
    .filter((match) => Number(match[1]) >= 2)
    .every((match) => /\bAt\s+\d{2}:\d{2}(?:\.\d{3})?/u.test(match[0]));
}

export function checkH3Prompt(
  promptText: string,
  options: H3PromptCheckOptions = {}
): H3PromptCheckResult {
  const prompt = promptText.trim();
  const mode = options.mode ?? (options.hasEndImage ? "FL2VA" : "I2VA");
  const items: H3PromptCheckItem[] = [];
  const requiredSections = mode === "R2V" ? r2vSections : baseSections;
  const missingSections = requiredSections.filter((section) => !prompt.includes(section));
  if (missingSections.length) {
    items.push({
      level: "warning",
      message: `缺少官方字段：${missingSections.join("、")}`
    });
  }

  if (mode === "R2V") {
    if (!prompt.includes("<Picture 1>")) {
      items.push({
        level: "warning",
        message: "R2V 至少需要在提示词中引用 <Picture 1>"
      });
    }
  } else {
    const alignmentPhrase = mode === "FL2VA"
      ? "How the reference pictures align"
      : "For the target video";
    if (!prompt.includes(alignmentPhrase)) {
      items.push({
        level: "warning",
        message: `${mode} 尚未检测到官方参考图对齐说明`
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
  const soundscape = prompt.match(/overall_soundscape:\s*([\s\S]*?)(?=\n\s*non_diegetic_music:|$)/iu)?.[1] ?? "";
  if (/<d>|\bsays\b|\bdialogue\b/iu.test(soundscape)) {
    items.push({
      level: "warning",
      message: "overall_soundscape 不应重复放对白；对白应写在 integrated_multimodal_description"
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