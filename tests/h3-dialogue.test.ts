import { describe, expect, it } from "vitest";
import {
  extractH3VisibleTextLocks,
  extractH3DialogueLocks,
  h3ContentLockInstruction,
  h3DialogueLockInstruction,
  restoreH3DialogueLocks,
  restoreH3VisibleTextLocks,
  stripH3DialogueFromSource,
  validateH3DialogueOutput
} from "../src/core/h3-dialogue.js";

describe("MiniMax H3 dialogue locks", () => {
  it("does not move a timeline utterance into soundscape metadata or add a second speaker", () => {
    const locks = extractH3DialogueLocks('塔台广播画外音只说“保持中线，等待放行。”。');
    const output = 'integrated_multimodal_description: [Shot 1] 11.5至12.5秒广播：<d>[Chinese] 保持中线，等待放行。</d>。\n\noverall_soundscape: 同一时段无线电只说<d>[Chinese] 保持中线，等待放行。</d>。\n\nnon_diegetic_music: N/A';
    const restored = restoreH3DialogueLocks(output, locks);
    expect(restored.split('overall_soundscape:')[0]).toContain('11.5至12.5秒广播：<d>[Chinese] 保持中线，等待放行。</d>');
    expect(restored.match(/<d>/gu)).toHaveLength(1);
    expect(restored).not.toContain('corresponding speaker');
    expect(restoreH3DialogueLocks(restored, locks)).toBe(restored);
  });
  it("keeps one explicitly single radio event when a continuity note repeats its declaration", () => {
    const source = '一声塔台无线电画外音只说“保持中线，等待放行。”。\n[C-广播] 塔台无线电画外音在11.5秒开始，只说“保持中线，等待放行。”。';
    const locks = extractH3DialogueLocks(source);
    expect(locks).toHaveLength(1);
    const output = 'integrated_multimodal_description: [Shot 1] 11.5秒广播：<d>[Chinese] 保持中线，等待放行。</d>';
    expect(restoreH3DialogueLocks(output, locks)).toBe(output);
    expect(h3ContentLockInstruction(source)).toContain("never add an on-screen person");
    const repeated = '第一次塔台无线电画外音说“准备。”。第二次塔台无线电画外音说“准备。”。';
    expect(extractH3DialogueLocks(repeated)).toHaveLength(2);
    expect(extractH3DialogueLocks('一声塔台无线电画外音说“准备。”。随后又一声塔台无线电画外音说“准备。”。')).toHaveLength(2);
  });
  it("tags exact quoted speech in place without duplicating it or consuming nearby visible text", () => {
    const source = '塔台广播：“保持中线，等待放行。”';
    const output = 'integrated_multimodal_description: [Shot 1] 塔台广播：“保持中线，等待放行。” 标牌写着“EXIT”。';
    const locks = extractH3DialogueLocks(source);
    const restored = restoreH3DialogueLocks(output, locks);
    expect(restored.split("保持中线，等待放行。")).toHaveLength(2);
    expect(restored).toContain("<d>[Chinese] 保持中线，等待放行。</d>");
    expect(restored).toContain("标牌写着“EXIT”");
    expect(restoreH3DialogueLocks(restored, locks)).toBe(restored);
  });
  it("extracts explicit multilingual spoken lines while ignoring visible text", () => {
    const source = "墙上的招牌文字写着“OPEN”，一个女孩用日语说：“大丈夫？”，男人用英语说：\"I am ready!\"";
    const locks = extractH3DialogueLocks(source);

    expect(locks).toHaveLength(2);
    expect(locks.map((lock) => [lock.language, lock.text])).toEqual([
      ["Japanese", "大丈夫？"],
      ["English", "I am ready!"]
    ]);
  });

  it("keeps descriptive-language detection separate from dialogue text", () => {
    const source = "A woman looks at the camera and says in Chinese: \"你好。\"";
    const locks = extractH3DialogueLocks(source);

    expect(stripH3DialogueFromSource(source, locks)).toContain("A woman looks at the camera and says in Chinese");
    expect(stripH3DialogueFromSource(source, locks)).not.toContain("你好");
    expect(h3DialogueLockInstruction(source)).toContain("target output language applies only to explanatory H3 prose");
    expect(h3DialogueLockInstruction(source)).toContain("<d>[Chinese] 你好。</d>");
  });

  it("restores translated or omitted lines into the canonical H3 dialogue form", () => {
    const source = "女孩用日语说：“大丈夫？”；男人用英语说：\"I am ready!\"";
    const locks = extractH3DialogueLocks(source);
    const output = [
      "integrated_multimodal_description: [Shot 1] The girl says <d>[English] Are you okay?</d>.",
      "overall_soundscape: Room tone.",
      "non_diegetic_music: N/A"
    ].join("\n");

    const repaired = restoreH3DialogueLocks(output, locks);
    expect(repaired).toContain("<d>[Japanese] 大丈夫？</d>");
    expect(repaired).toContain("<d>[English] I am ready!</d>");
    expect(validateH3DialogueOutput(repaired, locks).ok).toBe(true);
  });

  it("removes the temporary language-validator quote wrapper", () => {
    const source = "A woman says in Chinese: \"你好。\"";
    const locks = extractH3DialogueLocks(source);
    const repaired = restoreH3DialogueLocks(
      'integrated_multimodal_description: [Shot 1] <d>[Chinese] "你好。"</d>.',
      locks
    );

    expect(repaired).toContain("<d>[Chinese] 你好。</d>");
    expect(repaired).not.toContain('<d>[Chinese] "你好。"</d>');
  });

  it("reports omissions, duplicates, and invented dialogue before repair", () => {
    const locks = extractH3DialogueLocks("女孩说：“你好。”");
    const result = validateH3DialogueOutput(
      "integrated_multimodal_description: [Shot 1] <d>[Chinese] 你好。</d> <d>[Chinese] 你好。</d> <d>[English] Extra.</d>",
      locks
    );

    expect(result.missing).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
    expect(result.unexpected).toHaveLength(1);
    expect(result.ok).toBe(false);
  });

  it("separates nearby spoken words from quoted visible text", () => {
    const source = "A woman says in Chinese: \"你好。\" while a neon sign reads \"OPEN\".";
    const dialogue = extractH3DialogueLocks(source);
    const visibleText = extractH3VisibleTextLocks(source);

    expect(dialogue.map((lock) => lock.text)).toEqual(["你好。"]);
    expect(visibleText.map((lock) => lock.text)).toEqual(["OPEN"]);
    expect(h3ContentLockInstruction(source)).toContain("Compiler-owned visible-text ledger");
  });

  it("preserves vocal form for voiceover and singing", () => {
    const voiceover = extractH3DialogueLocks("An off-screen voiceover says in English: \"Welcome home.\"")[0];
    const singing = extractH3DialogueLocks("The singer sings in Spanish: \"Gracias, mi amor.\"")[0];

    expect(voiceover?.vocalMode).toBe("voiceover");
    expect(singing?.vocalMode).toBe("singing");
    expect(h3DialogueLockInstruction("An off-screen voiceover says: \"Welcome home.\"")).toContain("lips completely closed");
  });

  it("restores missing visible text into the timeline", () => {
    const locks = extractH3VisibleTextLocks("A neon sign reads \"OPEN\".");
    const output = [
      "integrated_multimodal_description: [Shot 1] The subject enters the room.",
      "overall_soundscape: Footsteps.",
      "non_diegetic_music: N/A"
    ].join("\n");

    expect(restoreH3VisibleTextLocks(output, locks)).toContain('reads "OPEN"');
  });
});
