import type { H3PromptSkill } from "./types.js";

const fluidWeatherPattern = /(?:\b(?:water|rain(?:ing|drops?)?|splash(?:es|ing)?|pour(?:s|ing)?|spill(?:s|ing)?|wave(?:s)?|ocean|river|puddle|fire|flame(?:s)?|smoke|steam|mist|fog|snow(?:ing|flakes?)?|wind(?:y)?|breeze|gust|hair\s+blowing|dress\s+billowing)\b|雨水|下雨|泼水|倒水|倒茶|倒咖啡|溅起|水花|海浪|波浪|水流|火苗|火焰|燃烧|烟雾|蒸汽|大风|强风|微风吹|吹起头发|裙摆飘动|飘雪)/iu;

const reflectionOpticsPattern = /(?:\b(?:mirror|reflection|reflected|glass\s+window|shop\s+window|transparent|refraction|flashlight|torch|switch(?:es|ing)?\s+(?:on|off)\s+the\s+light|turn(?:s|ing)?\s+(?:on|off)\s+the\s+light|neon\s+reflection|glasses\s+reflection)\b|镜子|镜中|倒影|反光|橱窗|玻璃杯|透明|折射|手电筒|开灯|关灯|点亮|霓虹倒影|屏幕照亮)/iu;

const fastSlowActionPattern = /(?:\b(?:slow[- ]?motion|slow[- ]?mo|high[- ]?speed\s+chase|sprint(?:s|ing)?|fight(?:s|ing)?|punch(?:es|ing)?|kick(?:s|ing)?|dodge(?:s|ing)?|parkour|leap(?:s|ing)?|car\s+chase|skateboard|sword\s+fight|martial\s+arts)\b|慢动作|升格|高速追逐|追逐|打斗|格斗|出拳|踢腿|闪避|跑酷|飞跃|飙车|滑板|剑斗|武打)/iu;

/**
 * Subtype-selective physical dynamics & optical causality skill.
 * Fires ONLY on fluids/weather, mirrors/refraction/dynamic lights, or fast/slow-mo action,
 * injecting ONLY the 1-2 matching sub-rules.
 */
export const scenePhysicsOpticsSkill: H3PromptSkill = {
  id: "scene-physics-optics",
  title: "Fluid/Weather Dynamics, Reflections & Action Tempo Physics",
  catalogHint: "water/rain/fire/smoke/wind physics, mirrors/glass reflections/dynamic light sweep, or fast action / slow-motion choreography",
  priority: 78,
  sharedWithLongVideo: true,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    return fluidWeatherPattern.test(text)
      || reflectionOpticsPattern.test(text)
      || fastSlowActionPattern.test(text);
  },
  guidance: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const fluidLine = "- Fluid, fire & wind coherence: trace liquid pours/splashes continuously from spout/impact through parabolic arc to ripples and rising liquid level, with realistic darkened wet patches and specular sheen on damp skin/fabric/ground. Keep one unified wind vector driving hair strands, loose cloth, smoke, and drifting particles in the same direction with matching audio.";
    const opticsLine = "- Mirror reflections, glass refraction & dynamic light causality: keep mirror/water/window reflections strictly synchronized with the real subject's pose, gaze, and timing; for glass/liquid containers preserve subtle background refraction and specular rim highlights; whenever a local light source turns on or sweeps (flashlight, flame, screen, lamp), illuminate nearby surfaces and cast corresponding moving shadows.";
    const actionLine = "- Action choreography & slow-motion physics: stage clear anticipation → directional strike/stride path → solid contact impact with garment/hair follow-through → grounded recovery without limb tangling or clipping. For slow-motion, describe silky high-frame-rate physical detail (suspended droplets, slow-unfurling cloth/hair, taut muscle tension) with smooth steady tracking rather than choppy slowed playback.";
    const lines: string[] = [];
    if (fluidWeatherPattern.test(text)) lines.push(fluidLine);
    if (reflectionOpticsPattern.test(text)) lines.push(opticsLine);
    if (fastSlowActionPattern.test(text)) lines.push(actionLine);
    return (lines.length ? lines : [fluidLine, opticsLine, actionLine]).join("\n");
  }
};

export const physicalActionContinuitySkill: H3PromptSkill = {
  id: "physical-action-continuity",
  title: "Physical Causality & Motion Continuity",
  priority: 60,
  sharedWithLongVideo: false,
  matches: (ctx) => !ctx.isLongVideo,
  guidance: (ctx) => {
    const beats = ctx.durationSeconds <= 6.5 ? "1–2" : ctx.durationSeconds <= 11 ? "2–3" : "3–4";
    return [
      `- Grounded physics, human-motion integrity & action semantics: follow real weight transfer, reachable joints, continuous limb ownership across close passes/occlusion, and solid contact (feet plant before pushing off; hands reach, grip, lift; surfaces deform only under force). Preserve exact actor, target, verb meaning, direction, and repetition—never weaken repeated motion into one hold or replace subject A→B travel with camera-only motion.`,
      `- Passable A→B route, obstacle clearing & speed allocation (${ctx.durationSeconds.toFixed(1)}s, WRONG → RIGHT): when moving from A to B is blocked by a closed barrier, rim, fabric seam, door, furniture, or height gap, NEVER teleport, clip through solid geometry, or cover an impossible distance at fast-forward speed. Stage the real physical sequence across ${beats} causal beats with believable speed and time budget: approach barrier → perform concrete clearing/bridging action (pull back elastic/pocket into a visible open gap, turn handle and open door, climb over rim/step, duck/sidestep around obstacle) → cross steadily through connected landmarks → settle naturally.`
    ].join("\n");
  }
};

export const physicsCraftSkills: readonly H3PromptSkill[] = [
  scenePhysicsOpticsSkill,
  physicalActionContinuitySkill
];
