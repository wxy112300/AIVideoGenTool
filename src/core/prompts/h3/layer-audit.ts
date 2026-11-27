import type { EnhanceRequest, H3PromptMode, H3PromptPreset, Settings } from "../../../types.js";
import { defaultH3PromptPresets, h3CorePromptPresetOrder } from "./content.js";
import { continuumAllocationInstruction, continuumDirectorContract } from "./continuum.js";
import { h3SnippetDefinitions } from "./snippets.js";
import { h3PromptSkills, resolveH3SkillsByIds, selectH3PromptSkills } from "./skills.js";
import { strataH3InstructionParts } from "./strata.js";

export interface H3LayerAuditIssue {
  layer: "layer1-qwen" | "layer2-h3";
  code: string;
  scope: string;
  message: string;
}

export interface H3Layer1AuditResult {
  passed: boolean;
  issues: H3LayerAuditIssue[];
  stats: {
    presetCount: number;
    corePresetCount: number;
    snippetCount: number;
    skillCount: number;
    maxBaseI2vaChars: number;
    maxComplexI2vaChars: number;
  };
}

export interface H3Layer2AuditOptions {
  sourcePrompt?: string;
  mode?: H3PromptMode;
  allowMultiShot?: boolean;
}

export interface H3Layer2AuditResult {
  passed: boolean;
  issues: H3LayerAuditIssue[];
}

const cjkPattern = /[\u3400-\u9FFF]/u;

/**
 * Layer-1 traps that quantized local reasoning VLMs (like Qwen3.8-Flash-Next IQ3_XXS)
 * literally copy into Layer-2 H3 output if written in prompts/skills/presets.
 */
const layer1LiteralPlaceholderPatterns: ReadonlyArray<{ code: string; pattern: RegExp; reason: string }> = [
  {
    code: "l1-placeholder-named-speaker",
    pattern: /\bnamed speaker\s*\(S1\)/iu,
    reason: "Qwen copies literal 'named speaker' into dialogue lines; use a concrete real example like 'the young woman (S1) says:' instead."
  },
  {
    code: "l1-placeholder-bracket-formula",
    pattern: /\[Motion Type\]\s*\+\s*\[Amplitude\]/iu,
    reason: "Qwen copies bracketed camera formulas literally; use natural lowercase grammatical examples instead."
  },
  {
    code: "l1-titlecase-backtick-camera-verb",
    pattern: /`(?:Push In|Pull Out|Truck|Pan|Tilt|Pedestal|Arc Shot|Tracking Shot|Static Shot)`/u,
    reason: "Backticked TitleCase camera verbs cause Qwen to emit ungrammatical 'The camera Push In steadily' / 'The camera Arc Shots'; show lowercase natural prose."
  },
  {
    code: "l1-legacy-hailuo-bracket-tag",
    pattern: /(?<!(?:NEVER|never|not|like)\s+['"`]?)\[(?:Push in|Pull out|Pan left|Pan right|Tilt up|Tilt down|Truck left|Truck right|Static shot|Zoom in|Zoom out|Clockwise orbit)\]/iu,
    reason: "Legacy Hailuo-02 bracket camera tags do not belong in MiniMax H3 prose instructions (except inside an explicit negative contrast warning)."
  }
];

/**
 * Audit Layer-1 compiler instructions (presets + all skills + compiled Strata contracts)
 * from the perspective of Strata / Qwen3.8-Flash-Next so future skill/preset additions
 * automatically catch literal-copy traps, bloat, missing two-layer framing, or broken fallbacks.
 */
export function auditH3Layer1Instructions(settings: Settings): H3Layer1AuditResult {
  const issues: H3LayerAuditIssue[] = [];

  // 1. Audit all presets (single source of truth in Settings & Strata)
  const presetEntries = Object.entries(defaultH3PromptPresets) as Array<[H3PromptPreset, string]>;
  for (const [presetId, text] of presetEntries) {
    if (!text.trim()) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-empty-preset",
        scope: `preset:${presetId}`,
        message: "Preset text must not be empty."
      });
    }
    if (cjkPattern.test(text)) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-preset-cjk",
        scope: `preset:${presetId}`,
        message: "Built-in English presets must not contain CJK characters (breaks language neutrality)."
      });
    }
    for (const check of layer1LiteralPlaceholderPatterns) {
      if (check.pattern.test(text)) {
        issues.push({
          layer: "layer1-qwen",
          code: check.code,
          scope: `preset:${presetId}`,
          message: check.reason
        });
      }
    }
  }

  // 1b. Audit Quick-Insert snippets (must work both directly for Layer-2 H3 AND cleanly as Layer-1 intent anchors)
  const seenSnippetIds = new Set<string>();
  for (const snippet of h3SnippetDefinitions) {
    if (seenSnippetIds.has(snippet.id)) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-duplicate-snippet-id",
        scope: `snippet:${snippet.id}`,
        message: `Duplicate snippet ID '${snippet.id}'.`
      });
    }
    seenSnippetIds.add(snippet.id);
    if (!snippet.text.trim() || cjkPattern.test(snippet.text)) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-snippet-format",
        scope: `snippet:${snippet.id}`,
        message: "Quick-insert snippet must be non-empty English prose without CJK characters."
      });
    }
    if (/\b(?:8k|masterpiece|hyperrealistic|flawless porcelain|not a toy|not a figure|no plastic|no jitter|Preserve the requested)\b/iu.test(snippet.text)) {
      issues.push({
        layer: "layer2-h3",
        code: "l2-snippet-buzzword-or-negative",
        scope: `snippet:${snippet.id}`,
        message: "Quick-insert snippet contains empty buzzwords, negative bans, or LLM meta-directives."
      });
    }
    for (const check of layer1LiteralPlaceholderPatterns) {
      if (check.pattern.test(snippet.text)) {
        issues.push({
          layer: "layer1-qwen",
          code: check.code,
          scope: `snippet:${snippet.id}`,
          message: check.reason
        });
      }
    }
  }

  // 2. Audit all registered Craft Skills (unique IDs, inspectAll hygiene, keyword-free fallback)
  const seenSkillIds = new Set<string>();
  const inspectCtx = {
    sourcePrompt: "",
    supplementalContext: "",
    mode: "I2VA" as const,
    preset: "detailed-cinematic" as const,
    durationSeconds: 10,
    hasReferenceMedia: true,
    inspectAll: true
  };
  const blankCtx = {
    sourcePrompt: "She moves forward.",
    supplementalContext: "",
    mode: "I2VA" as const,
    preset: "official-storyboard" as const,
    durationSeconds: 5,
    hasReferenceMedia: true
  };

  for (const skill of h3PromptSkills) {
    if (seenSkillIds.has(skill.id)) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-duplicate-skill-id",
        scope: `skill:${skill.id}`,
        message: `Duplicate skill ID '${skill.id}'.`
      });
    }
    seenSkillIds.add(skill.id);

    const inspectedGuidance = skill.guidance(inspectCtx);
    const exampleText = typeof skill.example === "function" ? (skill.example(inspectCtx) ?? "") : (skill.example ?? "");
    const combined = `${inspectedGuidance}\n${exampleText}`;
    for (const check of layer1LiteralPlaceholderPatterns) {
      if (check.pattern.test(combined)) {
        issues.push({
          layer: "layer1-qwen",
          code: check.code,
          scope: `skill:${skill.id}`,
          message: check.reason
        });
      }
    }
    if (skill.catalogHint) {
      const resolved = resolveH3SkillsByIds([skill.id], false);
      const fallbackGuidance = resolved[0]?.guidance(blankCtx).trim() ?? "";
      if (fallbackGuidance.length < 40) {
        issues.push({
          layer: "layer1-qwen",
          code: "l1-weak-lazy-fallback",
          scope: `skill:${skill.id}`,
          message: `Lazy-loadable skill '${skill.id}' emitted <40 chars on a keyword-free brief.`
        });
      }
    }
  }

  // 3. Audit compiled Strata contracts across core modes (T2VA / I2VA / FL2VA / R2V + complex scale/camera I2VA)
  const sampleRequests: Array<{ name: string; req: EnhanceRequest; maxChars: number; expectWorksheetImage: boolean }> = [
    {
      name: "i2va-base",
      req: {
        prompt: "A woman walks across a quiet wooden room and opens the window.",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "I2VA",
        h3PromptPreset: "detailed-cinematic",
        h3DurationSeconds: 10,
        imagePaths: ["first.png"]
      },
      maxChars: 10500,
      expectWorksheetImage: true
    },
    {
      name: "i2va-complex-scale-camera",
      req: {
        prompt: "Camera fly close to the tiny girl(note: a real life scaled down human adult girl, age 18, NOT a figure, keep her size unchanged) walking on giant girl's thigh with an extremely low angle close to tiny girl's perspective and orbiting 180 degrees around her.",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "I2VA",
        h3PromptPreset: "detailed-cinematic",
        h3DurationSeconds: 10,
        imagePaths: ["first.png"]
      },
      maxChars: 18500,
      expectWorksheetImage: true
    },
    {
      name: "fl2va-bridge",
      req: {
        prompt: "The courier walks across the courtyard and hands the parcel to the shopkeeper.",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "FL2VA",
        h3PromptPreset: "official-storyboard",
        h3DurationSeconds: 10,
        imagePaths: ["first.png", "last.png"]
      },
      maxChars: 13000,
      expectWorksheetImage: true
    },
    {
      name: "r2v-multi",
      req: {
        prompt: "Keep <Subject 1> walking down the alley from <Picture 1> with sound from <Audio 1>.",
        modelId: "minimax_h3_ref2va",
        mode: "h3-vision",
        h3PromptMode: "R2V",
        h3PromptPreset: "multi-reference",
        h3DurationSeconds: 10,
        imagePaths: ["ref1.png"],
        referenceContext: "<Subject 1>: woman in red coat. <Picture 1>: wet alley. <Audio 1>: distant rain."
      },
      maxChars: 13500,
      expectWorksheetImage: true
    },
    {
      name: "t2va-base",
      req: {
        prompt: "A lone guitarist plays under a streetlamp while rain falls steadily.",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "T2VA",
        h3PromptPreset: "continuous-motion",
        h3DurationSeconds: 10
      },
      maxChars: 10500,
      expectWorksheetImage: false
    }
  ];

  let maxBaseI2vaChars = 0;
  let maxComplexI2vaChars = 0;

  for (const sample of sampleRequests) {
    const parts = strataH3InstructionParts(sample.req, settings, "", "en");
    const totalChars = parts.contract.length + parts.sourceData.length;
    if (sample.name === "i2va-base") maxBaseI2vaChars = totalChars;
    if (sample.name === "i2va-complex-scale-camera") maxComplexI2vaChars = totalChars;

    if (totalChars > sample.maxChars) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-context-bloat",
        scope: `compiled:${sample.name}`,
        message: `Compiled contract+sourceData is ${totalChars} chars (exceeds ${sample.maxChars} Qwen attention budget).`
      });
    }
    if (!parts.contract.includes("ROLE (TWO LAYERS):") || !parts.contract.includes("H3 PITFALLS — WRONG vs RIGHT")) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-missing-two-layer-framing",
        scope: `compiled:${sample.name}`,
        message: "Compiled contract is missing explicit two-layer Qwen→H3 framing or WRONG vs RIGHT pitfall contrast."
      });
    }
    if (!parts.task.includes("PRIVATE THINKING WORKSHEET") || !parts.task.includes("A→B ROUTE, OBSTACLES & TIME BUDGET")) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-missing-worksheet",
        scope: `compiled:${sample.name}`,
        message: "Compiled task is missing the post-image PRIVATE THINKING WORKSHEET or A→B ROUTE, OBSTACLES & TIME BUDGET step for Qwen."
      });
    }
    if (sample.expectWorksheetImage && !parts.task.includes("IMAGE GROUND TRUTH")) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-missing-ground-truth-worksheet",
        scope: `compiled:${sample.name}`,
        message: "Image-backed task is missing the IMAGE GROUND TRUTH ledger."
      });
    }
    const fullText = `${parts.contract}\n${parts.task}`;
    if (parts.activeSkillIds.includes("continuum-continuity")) {
      issues.push({
        layer: "layer1-qwen",
        code: "l1-continuum-skill-leaked-into-single-clip",
        scope: `compiled:${sample.name}`,
        message: "continuum-continuity skill must NEVER activate on non-extend single-clip prompts."
      });
    }
    for (const check of layer1LiteralPlaceholderPatterns) {
      if (check.pattern.test(fullText)) {
        issues.push({
          layer: "layer1-qwen",
          code: check.code,
          scope: `compiled:${sample.name}`,
          message: check.reason
        });
      }
    }
  }

  // 4. Audit Continuum director & allocation contracts + continuum-continuity skill scoping
  for (const [scope, text] of [
    ["continuum:director-contract", continuumDirectorContract],
    ["continuum:allocation-instruction", continuumAllocationInstruction]
  ] as const) {
    for (const check of layer1LiteralPlaceholderPatterns) {
      if (check.pattern.test(text)) {
        issues.push({
          layer: "layer1-qwen",
          code: check.code,
          scope,
          message: check.reason
        });
      }
    }
  }
  const longVideoIds = selectH3PromptSkills({
    sourcePrompt: "A courier rides across the rainy bridge.",
    supplementalContext: "",
    mode: "T2VA",
    preset: "detailed-cinematic",
    durationSeconds: 10,
    hasReferenceMedia: false,
    isLongVideo: true
  }).map((s) => s.id);
  if (!longVideoIds.includes("continuum-continuity")) {
    issues.push({
      layer: "layer1-qwen",
      code: "l1-continuum-skill-missing-long-video",
      scope: "skill:continuum-continuity",
      message: "continuum-continuity skill must activate in Long Video / multi-chunk mode."
    });
  }
  const extendIds = selectH3PromptSkills({
    sourcePrompt: "She opens the door and steps outside.",
    supplementalContext: "",
    mode: "I2VA",
    preset: "detailed-cinematic",
    durationSeconds: 10,
    hasReferenceMedia: true,
    isExtension: true
  }).map((s) => s.id);
  if (!extendIds.includes("continuum-continuity")) {
    issues.push({
      layer: "layer1-qwen",
      code: "l1-continuum-skill-missing-extend",
      scope: "skill:continuum-continuity",
      message: "continuum-continuity skill must activate in Extend mode."
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    stats: {
      presetCount: presetEntries.length,
      corePresetCount: h3CorePromptPresetOrder.length,
      snippetCount: h3SnippetDefinitions.length,
      skillCount: h3PromptSkills.length,
      maxBaseI2vaChars,
      maxComplexI2vaChars
    }
  };
}

/**
 * Audit a final Layer-2 prompt consumed directly by MiniMax H3 for:
 * - Layer-1 compiler/worksheet leakage
 * - Qwen literal-copy artifacts (placeholders, ungrammatical TitleCase verbs, Hailuo-02 bracket tags)
 * - Negative-prompt / toy-word leaks
 * - Section hygiene (overall_soundscape purity, clean [Shot 1] start, single-shot lock)
 * - Cross-character age bleed in scale scenes
 */
export function auditH3Layer2Output(
  output: string,
  options: H3Layer2AuditOptions = {}
): H3Layer2AuditResult {
  const issues: H3LayerAuditIssue[] = [];
  const trimmed = output.trim();
  const mode = options.mode ?? "T2VA";
  const mainField = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const mainMatch = new RegExp(`${mainField}:\\s*([\\s\\S]*?)(?:\\noverall_soundscape:|$)`, "i").exec(trimmed);
  const soundMatch = /overall_soundscape:\s*([\s\S]*?)(?:\nnon_diegetic_music:|$)/i.exec(trimmed);
  const mainText = (mainMatch?.[1] ?? trimmed).trim();
  const soundText = (soundMatch?.[1] ?? "").trim();

  // 1. Layer-1 meta/worksheet leakage into Layer-2 H3 output
  const layer1LeakChecks: Array<{ code: string; pattern: RegExp; label: string }> = [
    { code: "l2-leak-worksheet", pattern: /\b(?:PRIVATE THINKING WORKSHEET|IMAGE GROUND TRUTH|SELF-CHECK before outputting|ROLE \(TWO LAYERS\)|H3 PITFALLS)\b/iu, label: "Layer-1 worksheet or compiler heading" },
    { code: "l2-leak-skill-heading", pattern: /(?:^|\n)\s*###\s*Skill:|^\s*LOAD_SKILLS\s*:/imu, label: "Layer-1 skill header or LOAD_SKILLS directive" },
    { code: "l2-leak-wrong-right", pattern: /\bWRONG:\s+[\s\S]{0,80}\|\s*RIGHT:/u, label: "Layer-1 WRONG/RIGHT teaching syntax" },
    { code: "l2-leak-meta-boilerplate", pattern: /\b(?:Preserve the requested action, camera, lighting|enlarging or shrinking at identical rate)\b/iu, label: "pasted draft/compiler meta-instruction" }
  ];
  for (const check of layer1LeakChecks) {
    if (check.pattern.test(trimmed)) {
      issues.push({
        layer: "layer2-h3",
        code: check.code,
        scope: "output",
        message: `Layer-1 artifact leaked into MiniMax H3 prompt: ${check.label}.`
      });
    }
  }

  // 2. Qwen literal-copy artifacts
  if (/\bnamed speaker\s*\(?S\d+\)?\s+says:/iu.test(mainText)) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-literal-named-speaker",
      scope: mainField,
      message: "Literal placeholder 'named speaker (S1) says:' leaked instead of the character's actual handle."
    });
  }
  if (/\bThe camera\s+(?:Push In|Pull Out|Arc Shots?)\b/u.test(mainText)) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-ungrammatical-camera-token",
      scope: mainField,
      message: "Ungrammatical copied TitleCase camera verb (e.g. 'The camera Push In' / 'The camera Arc Shots')."
    });
  }
  if (/\[(?:Push in|Pull out|Pan left|Pan right|Tilt up|Tilt down|Truck left|Truck right|Static shot|Zoom in|Zoom out|Clockwise orbit)\]/iu.test(mainText)) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-legacy-hailuo-bracket-tag",
      scope: mainField,
      message: "Legacy Hailuo-02 bracket camera tag found in MiniMax H3 timeline prose."
    });
  }

  // 3. Negative-channel & toy-word leaks
  const negMatch = /\b(?:not a figure|not a toy|not a baby|no music|no score|no talking|no jitter|no glitches|no artifacts|no extra limbs|no distortion)\b/iu.exec(trimmed);
  if (negMatch) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-negative-channel-leak",
      scope: "output",
      message: `Negative phrase '${negMatch[0]}' leaked into positive-only MiniMax H3 prompt.`
    });
  }
  const toyMatch = /\b(?:tiny figure|miniature figure|figurine|doll-sized|tiny doll|tilt-shift|diorama)\b/iu.exec(mainText);
  if (toyMatch) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-toy-prior-leak",
      scope: mainField,
      message: `Toy/diorama trigger word '${toyMatch[0]}' leaked into MiniMax H3 prompt.`
    });
  }
  const clipMatch = /\b(?:squeez(?:e|es|ing)\s+through\s+(?:the\s+)?closed\s+(?:fabric|cloth|waistband|door)|pass(?:es|ing)?\s+(?:straight\s+)?through\s+(?:the\s+)?solid|clips?\s+through|teleports?\s+(?:to|onto|into))\b/iu.exec(mainText);
  if (clipMatch) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-impossible-shortcut-clipping",
      scope: mainField,
      message: `Physically impossible barrier-clipping or teleport phrase '${clipMatch[0]}' found in MiniMax H3 prompt.`
    });
  }

  // 4. Section hygiene
  if (mainMatch && !/^\[Shot\s+1\]/iu.test(mainText)) {
    issues.push({
      layer: "layer2-h3",
      code: "l2-main-missing-shot1-start",
      scope: mainField,
      message: `${mainField}: must begin directly with '[Shot 1] ' (never repeat the alignment line inside it).`
    });
  }
  if (!options.allowMultiShot && mainMatch) {
    const shotCount = (mainText.match(/\[Shot\s+\d+\]/giu) ?? []).length;
    if (shotCount > 1) {
      issues.push({
        layer: "layer2-h3",
        code: "l2-unexpected-multi-shot",
        scope: mainField,
        message: `Single-take request produced ${shotCount} [Shot N] markers inside ${mainField}.`
      });
    }
  }
  if (soundMatch) {
    if (/\[Shot\s+\d+\]|<d>|\b\d{2}:\d{2}\.\d{2,3}\b|\bno music\b/iu.test(soundText)) {
      issues.push({
        layer: "layer2-h3",
        code: "l2-soundscape-format-leak",
        scope: "overall_soundscape",
        message: "overall_soundscape must contain ONLY ambient/foley (zero shot labels, timestamps, <d> tags, or 'no music')."
      });
    }
    if (/\b(?:spoken line|dialogue|says:|voice carries)\b/iu.test(soundText)) {
      issues.push({
        layer: "layer2-h3",
        code: "l2-soundscape-speech-leak",
        scope: "overall_soundscape",
        message: "overall_soundscape mentions spoken dialogue/voice; keep dialogue strictly in the main timeline."
      });
    }
  }

  // 5. Cross-character age bleed (when tiny character has an age note in sourcePrompt)
  if (options.sourcePrompt) {
    const tinyAgeMatch = /\b(?:tiny|shrunk(?:en)?|miniature)\s+(?:girl|woman|man|boy|person|adult)[^.!?\n]{0,90}\b(?:age\s*(\d{2})|(\d{2})[- ]?(?:year[- ]?old|years?\s+old))\b/iu.exec(options.sourcePrompt);
    const tinyAge = tinyAgeMatch?.[1] ?? tinyAgeMatch?.[2];
    const giantExplicitAge = /\bgiant(?:ess)?\b[^.!?\n]{0,60}\b(?:age\s*\d{2}|\d{2}[- ]?(?:year[- ]?old|years?\s+old))\b/iu.test(options.sourcePrompt);
    if (tinyAge && !giantExplicitAge) {
      const giantBleedPattern = new RegExp(`\\bgiant(?:ess)?\\s+(?:${tinyAge}[- ]year[- ]old|girl\\s+aged\\s+${tinyAge}|woman\\s+aged\\s+${tinyAge})\\b`, "iu");
      if (giantBleedPattern.test(mainText)) {
        issues.push({
          layer: "layer2-h3",
          code: "l2-cross-character-age-bleed",
          scope: mainField,
          message: `Tiny character's age (${tinyAge}) bled onto the giant character.`
        });
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
