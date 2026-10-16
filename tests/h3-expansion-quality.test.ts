import { describe, expect, it } from "vitest";
import { assertDetailedCinematicExpansion, normalizeH3PromptOutput } from "../src/core/h3-prompt.js";
import { h3ExpansionCharacterCount, h3ExpansionUniqueContent, h3ExpansionUsesHanProse } from "../src/core/h3-expansion-quality.js";
import { countPromptWords } from "../src/core/prompt-count.js";
import { extractH3DialogueLocks } from "../src/core/h3-dialogue.js";

const envelope = (text: string) => `integrated_multimodal_description: [Shot 1] ${text}\noverall_soundscape: N/A\nnon_diegetic_music: N/A`;
const words = (count: number) => Array.from({ length: count }, (_, index) => `detail${index}`).join(" ");

describe("H3 model-authored detailed expansion gate", () => {
  it("rejects output that is shorter than a long source even when it exceeds the fixed duration floor", () => {
    const source = words(300);
    expect(() => assertDetailedCinematicExpansion(envelope(words(320)), "T2VA", 5, source)).toThrow("至少 360");
  });

  it("rejects a shorter effective character body even if short-word padding meets the word floor", () => {
    const source = "internationalization ".repeat(200);
    expect(() => assertDetailedCinematicExpansion(envelope("a ".repeat(300)), "T2VA", 5, source)).toThrow("短于原始提示词");
  });

  it("does not let application-inserted scale and dialogue locks rescue under-length output", () => {
    const source = 'A tiny woman says in English: "Ready."';
    const output = envelope(`${source} ${words(218)}`);
    const locks = extractH3DialogueLocks(source);
    const normalized = normalizeH3PromptOutput(output, "I2VA", 5, locks, [], source);
    // The old order could accept this only after application-owned recovery increased the count.
    expect(countPromptWords(normalized)).toBeGreaterThan(250);
    expect(() => normalizeH3PromptOutput(output, "I2VA", 5, locks, [], source, "", false, false,
      undefined, "detailed-cinematic")).toThrow("至少 250");
    expect(() => normalizeH3PromptOutput(output, "I2VA", 5, locks, [], source, "", false, false,
      undefined, "official-storyboard")).not.toThrow();
  });

  it("counts all shots in one field, rejects duplicated fields and ignores unrelated fields", () => {
    const output = `${words(500)}\n${envelope(`${words(130)} [Shot 2] ${words(131)}`)}`;
    expect(() => assertDetailedCinematicExpansion(output, "T2VA", 5, "")).not.toThrow();
    expect(() => assertDetailedCinematicExpansion(`${envelope(words(130))}\nintegrated_multimodal_description: ${words(131)}`,
      "T2VA", 5, "")).toThrow("重复了主时间线字段");
    expect(() => assertDetailedCinematicExpansion(`${envelope(words(100))}\nsummary: ${words(500)}`,
      "T2VA", 5, "")).toThrow("至少 250");
  });

  it("does not count R2V subject inventories or summaries toward the detailed timeline floor", () => {
    const output = `subject_definitions: ${words(600)}\nsummary: ${words(600)}\ndetailed_description: ${words(100)}\noverall_soundscape: ${words(600)}`;
    expect(() => assertDetailedCinematicExpansion(output, "R2V", 5, "")).toThrow("至少 350");
  });

  it("accepts transport wrappers before applying the same raw-body gate", () => {
    const output = words(260);
    for (const wrapped of [JSON.stringify({ prompt: { integrated_multimodal_description: output } }),
      `\`\`\`markdown\n### **integrated_multimodal_description:** ${output}\n\`\`\``]) {
      expect(() => assertDetailedCinematicExpansion(wrapped, "T2VA", 5, "")).not.toThrow();
    }
  });

  it("does not count repeated filler or structural tags as added detail", () => {
    const repeated = "The wheels roll smoothly while the camera maintains its position. ".repeat(30);
    expect(() => assertDetailedCinematicExpansion(envelope(repeated), "T2VA", 5, "")).toThrow("至少 250");
    expect(h3ExpansionCharacterCount("[Shot 1] <Picture 1> <d>[English] Ready.</d> 00:03.000")).toBe(5);
    const requestedRepeat = "The bell rings twice. The bell rings twice.";
    expect(h3ExpansionUniqueContent(requestedRepeat, requestedRepeat).match(/bell/g)).toHaveLength(2);
  });

  it("does not require Chinese control words or verbatim action wording in the expansion", () => {
    const source = "依据参考图设计动作，明确邮差开门、转头、抬手、点头的过程，允许自然扩展。";
    const detail = Array.from({ length: 70 }, (_, index) => `在阶段${index}中，地面反光逐渐移动，镜头始终平稳。`).join(" ");
    const output = `邮差让门向内开启，头部向右转动，手臂抬起，头部微微点动。${detail}`;
    expect(() => assertDetailedCinematicExpansion(envelope(output), "I2VA", 5, source)).not.toThrow();
    for (const term of ["依据", "设计", "明确", "允许", "开门", "转头", "抬手", "点头"]) {
      expect(output).not.toContain(term);
    }
  });

  it("does not treat generic word overlap as a semantic quality gate", () => {
    const source = "The courier opens the entrance, rotates his head and raises his arm.";
    const paraphrase = "A delivery worker pushes the door inward, looks right and lifts a hand.";
    expect(() => assertDetailedCinematicExpansion(envelope(`${paraphrase} ${words(260)}`), "T2VA", 5, source)).not.toThrow();
    // Structure and length cannot certify topic preservation; do not pretend otherwise.
    expect(() => assertDetailedCinematicExpansion(envelope(words(260)), "T2VA", 5, source)).not.toThrow();
  });

  it("does not treat an exact Chinese dialogue or sign as Chinese descriptive prose", () => {
    expect(h3ExpansionUsesHanProse('The tower says in Chinese: "保持中线，等待放行。"')).toBe(false);
    expect(h3ExpansionUsesHanProse('The airliner stops. <d>[Chinese] 保持中线，等待放行。</d>')).toBe(false);
    expect(h3ExpansionUsesHanProse('飞机停下，用英语说："Ready."')).toBe(true);
  });
});
