import type { H3PromptMode } from "../types.js";

export type H3ScaleDirection = "smaller" | "larger" | "relative";

export interface H3MicroFpvIntent {
  detected: boolean;
  viewpoint: boolean;
  terms: string[];
  literalAnimalSubject: boolean;
}

export interface H3ScaleIntent {
  detected: boolean;
  direction: H3ScaleDirection;
  humanSubject: boolean;
  humanIdentity: boolean;
  morphologyChangeRequested: boolean;
  microFpvMetaphor: boolean;
  microFpvViewpoint: boolean;
  terms: string[];
}

const microFpvMetaphorPattern = /(?:\b(?:ant[- ]?size|ant[- ]?scale|ant['’]s\s+(?:view|eye(?:[- ]level)?|perspective|POV)|(?:insect|bug)[- ]?(?:size|scale|eye|view|perspective|POV)|insect[- ]?eye|micro[- ]FPV|micro[- ]first[- ]person|like\s+an?\s+ant(?:['’]s)?\s+(?:view|eye|perspective))\b|蚂蚁(?:大小|尺寸|视角|视线)|昆虫(?:大小|尺寸|视角|视线)|虫眼(?:视角)?|微型FPV|微型第一人称)/iu;
const literalAnimalSubjectPattern = /(?:\b(?:an?|the)\s+(?:ant|insect|bug)\b(?![- ]?(?:size|scale|eye|view|perspective|POV)|['’]s\s+(?:view|eye|perspective|POV))[^.!?;\n]{0,55}\b(?:crawl|crawls|crawling|walk|walks|walking|move|moves|moving|run|runs|running|climb|climbs|climbing|fly|flies|flying|carry|carries)\b|\b(?:ant|insect|bug)\s+(?:crawls?|walks?|moves?|runs?|climbs?)\b|(?:一只)?(?:蚂蚁|昆虫)\s*(?:在|正在|会)[^。！？;\n]{0,35}(?:爬|走|移动|跑|飞))/iu;
const smallerScalePattern = /(?:\b(?:tiny|miniature|miniaturized|miniaturised|diminutive|shrunken|shrunk|shrink(?:s|ing)?|small[- ]scale|small[- ]sized|micro[- ]scale|pocket[- ]sized|ant[- ]?size|ant[- ]?scale|scale(?:d)?\s+down|reduced\s+in\s+size|downsized)\b|缩小化?|变小|微小|微型|迷你|小人|等比例缩小|缩至|缩成)/iu;
const microFpvScaleCuePattern = /(?:\b(?:ant|insect|bug)[- ]?(?:size|scale)\b|\b(?:micro[- ]FPV|micro[- ]first[- ]person)\b[^.!?\n]{0,40}\b(?:size|scale)\b|蚂蚁(?:大小|尺寸)|昆虫(?:大小|尺寸))/iu;
const smallerSubjectPattern = /\b(?:small|little)\s+(?:person|people|human|girl|boy|woman|man|adult|child|character|subject)\b/iu;
const smallerSubjectScalePattern = /(?:\b(?:tiny|miniature|miniaturized|miniaturised|diminutive|shrunken|shrunk|shrink(?:s|ing)?|small[- ]scale|small[- ]sized|micro[- ]scale|pocket[- ]sized|ant[- ]?size|ant[- ]?scale|scale(?:d)?\s+down|reduced\s+in\s+size|downsized)\b(?:[\t ,;:]+(?:a|an|the|real|living|full[- ]grown|adult|young|female|male)){0,5}[\t ,;:]+\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b|\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b[^.!?\n]{0,18}\b(?:shrink(?:s|ing)?|shrunken|shrunk|scale(?:d)?\s+down|reduced\s+in\s+size|downsized|缩小|变小|微小)\b|(?:缩小化?|变小|微小|微型|迷你|小人|等比例缩小|缩至|缩成)(?:的|的一个)?(?:真人|人类|人物|角色|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|少女|女性|男性|人))/iu;
const largerScalePattern = /(?:\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up)\b|巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)/iu;
const largerSubjectScalePattern = /(?:\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up)\b(?:[\t ,;:]+(?:a|an|the|real|living|full[- ]grown|adult|young|female|male)){0,5}[\t ,;:]+\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b|\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b[^.!?\n]{0,18}\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up|巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)\b|(?:巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)(?:的|的一个)?(?:真人|人类|人物|角色|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|少女|女性|男性|人))/iu;
const scaleRelationPattern = /(?:\b(?:scale|scaling|relative\s+(?:size|scale)|physical\s+size|world[- ]scale|same\s+proportions?|proportional(?:ly)?|height\s+ratio)\b|比例|尺度|大小关系|相对于|等比例|世界尺度|物理尺寸)/iu;
const numericScalePattern = /(?:\b\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|feet|inches?|inch)\s*(?:tall|high)?\b|\b\d+\s*[:/]\s*\d+(?:\s*scale)?\b|\d+(?:\.\d+)?\s*(?:厘米|毫米|米)高?)/iu;
const humanSubjectPattern = /(?:\b(?:person|people|human(?:s)?|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject|figure)\b|人类|人物|角色|主体|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|成年|少女|女性|男性|小孩|婴儿|人)/iu;
const humanIdentityPattern = /(?:\b(?:person|people|human(?:s)?|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?)\b|人类|人物|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|成年|少女|女性|男性|小孩|婴儿|真人|人)/iu;
const antiToyPattern = /(?:\b(?:not|never|without|no)\s+(?:a\s+)?(?:toy|doll|figur(?:e|ine)|model|plastic)|\b(?:real|living|flesh[- ]and[- ]blood)\s+(?:human|person)|不要(?:玩具|娃娃|人偶|手办|塑料)|不是(?:玩具|娃娃|人偶|手办|小孩|婴儿)|非(?:玩具|娃娃|人偶)|保持真人|真实的人)/iu;
const explicitMorphologyPattern = /(?:\b(?:chibi|big[- ]headed|oversized\s+head|exaggerated\s+proportions?|doll[- ]like|vinyl\s+toy|toy\s+figure|figurine|diorama)\b|Q版|大头娃娃|夸张比例|卡通化)/iu;
const explicitAntiToyPattern = /(?:\b(?:not|never|without|no)\s+(?:a\s+)?(?:toy|doll|figur(?:e|ine)|model|plastic)|不要(?:玩具|娃娃|人偶|手办|塑料)|不是(?:玩具|娃娃|人偶|手办)|非(?:玩具|娃娃|人偶))/iu;

function hasMatch(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function matchedTerms(pattern: RegExp, value: string): string[] {
  const flags = `${pattern.flags.replace("g", "")}g`;
  return Array.from(value.matchAll(new RegExp(pattern.source, flags)))
    .map((match) => match[0]?.trim() ?? "")
    .filter(Boolean);
}

function combinedScaleText(sourcePrompt: string, supplementalText: string): string {
  return [sourcePrompt, supplementalText].map((value) => value.trim()).filter(Boolean).join("\n");
}

export function extractH3MicroFpvIntent(
  sourcePrompt: string,
  supplementalText = ""
): H3MicroFpvIntent {
  const text = combinedScaleText(sourcePrompt, supplementalText);
  const terms = matchedTerms(microFpvMetaphorPattern, text);
  const literalAnimalSubject = hasMatch(literalAnimalSubjectPattern, text);
  const hasHumanContext = hasMatch(humanSubjectPattern, text) || hasMatch(smallerScalePattern, text);
  const hasCameraContext = /(?:\bcamera\b|\blens\b|\bviewpoint\b|\bPOV\b|\bfirst[- ]person\b|\bshot\b|\bframing\b|镜头|相机|机位|视角)/iu.test(text);
  const viewpoint = terms.some((term) => /(?:view|eye|perspective|POV|FPV|视角|视线|虫眼)/iu.test(term)) || (hasCameraContext && terms.length > 0);
  return {
    detected: terms.length > 0 && (hasHumanContext || hasCameraContext) && !literalAnimalSubject,
    viewpoint,
    terms,
    literalAnimalSubject
  };
}

export function extractH3ScaleIntent(
  sourcePrompt: string,
  supplementalText = ""
): H3ScaleIntent {
  const text = combinedScaleText(sourcePrompt, supplementalText);
  const hasSmallerScale = hasMatch(smallerSubjectScalePattern, text) || hasMatch(smallerSubjectPattern, text);
  const hasLargerScale = hasMatch(largerSubjectScalePattern, text);
  const hasRelation = hasMatch(scaleRelationPattern, text) || hasMatch(numericScalePattern, text);
  const humanSubject = hasMatch(humanSubjectPattern, text);
  const humanIdentity = hasMatch(humanIdentityPattern, text);
  const antiToy = hasMatch(antiToyPattern, text);
  const microFpvIntent = extractH3MicroFpvIntent(text);
  const microFpvMetaphor = microFpvIntent.detected;
  const microFpvViewpoint = microFpvIntent.viewpoint;
  const microFpvScaleCue = microFpvMetaphor && (hasSmallerScale || hasMatch(microFpvScaleCuePattern, text));
  const detected = humanSubject && (hasSmallerScale || hasLargerScale || hasRelation || microFpvScaleCue);
  const morphologyChangeRequested = hasMatch(explicitMorphologyPattern, text) && !hasMatch(explicitAntiToyPattern, text);
  const direction: H3ScaleDirection = hasSmallerScale && hasLargerScale
    ? "relative"
    : hasSmallerScale
      ? "smaller"
      : hasLargerScale
        ? "larger"
        : "relative";
  const terms = [
    ...matchedTerms(smallerScalePattern, text),
    ...matchedTerms(smallerSubjectPattern, text),
    ...matchedTerms(largerScalePattern, text),
    ...matchedTerms(scaleRelationPattern, text),
    ...matchedTerms(numericScalePattern, text),
    ...(microFpvMetaphor ? matchedTerms(microFpvMetaphorPattern, text) : []),
    ...(antiToy ? matchedTerms(antiToyPattern, text) : [])
  ].filter((term, index, all) => all.indexOf(term) === index);

  return { detected, direction, humanSubject, humanIdentity, morphologyChangeRequested, microFpvMetaphor, microFpvViewpoint, terms };
}

export function h3ScalePreservationContract(): string {
  return "Scale-semantics rule: bind every size word to a specific subject and express it as a stable, uniform world-scale relationship against visible scene anchors unless the user requests a shape transformation. Preserve only user-supplied or reliably reference-visible identity, appearance, clothing ownership, and full-body proportions. Omit unknown age, gender, measurements, identity, and appearance facts instead of guessing them. Treat ant/insect/micro-FPV shorthand as an observable low viewpoint or relative-scale instruction when context supports that reading.";
}

function modeScaleRule(mode: H3PromptMode): string {
  switch (mode) {
    case "I2VA":
      return "For I2VA, lock this relation in the Picture 1 opening frame and keep it stable as the action develops.";
    case "FL2VA":
      return "For FL2VA, keep the same relation at both keyframes and describe a continuous path without accidental scale drift.";
    case "L2VA":
      return "For L2VA, preserve this relation while the action converges on the exact Picture 1 final frame.";
    case "R2V":
      return "For R2V, assign identity, age, and anatomy to the character reference and use the environment or height reference only as the scale anchor.";
    case "T2VA":
    default:
      return "For T2VA, establish the relation in the opening beat and make it legible against a full-size environmental anchor.";
  }
}

export function h3ScalePreservationInstruction(
  sourcePrompt: string,
  mode: H3PromptMode,
  supplementalText = ""
): string {
  const intent = extractH3ScaleIntent(sourcePrompt, supplementalText);
  if (!intent.detected) return "";
  const explicitChangeRule = intent.morphologyChangeRequested
    ? "The request also contains an explicit stylized or body-proportion change; preserve that explicit change, and apply the uniform-scale lock only to the separate size relationship."
    : "Do not introduce any body-proportion or style change that the user did not explicitly request.";
  const direction = intent.direction === "smaller"
    ? "smaller than the full-size surrounding world"
    : intent.direction === "larger"
      ? "larger than the surrounding world"
      : "at the explicitly requested relative scale";
  const lines = [
    "Scale semantics lock (high priority):",
    `Bind each requested size to its own identified subject and express that subject as ${direction} by one stable, uniform world-space factor. Keep separate subjects, clothing ownership, action roles, and larger-to-smaller relationships distinct.`,
    "Preserve only identity, appearance, clothing, voice, and full-body proportions that the user supplied or the references visibly support. Omit unknown age, gender, exact measurements, and appearance details instead of inferring them from a size word.",
    "Describe natural contact, weight, travel, and camera distance when they make the scale relationship observable. Keep changes in framing separate from changes in world scale.",
    "Reference-derived scale lock: first estimate the subject's relative world scale from the supplied reference image(s), the support surface, and visible environmental anchors such as fingers, fabric weave, floor seams, leaves, cups, furniture, or doors. Use relational scale language when a ruler is not visible; preserve an explicitly supplied measurement, but never assume a fixed centimeter range or invent false precision.",
    modeScaleRule(mode),
    explicitChangeRule,
    "Subject-route continuity: whenever the scaled subject travels from A to B, describe a continuous path through meaningful surfaces, landmarks, obstacles, turns, contact points, and the arrival state. The character's route is not optional camera decoration; do not teleport the subject or let a camera-only path replace the subject's movement."
  ];
  if (intent.microFpvMetaphor) {
    lines.push(
      "Metaphor-to-execution lock: phrases such as ant-size, ant's view, insect-eye, or Micro-FPV are authoring shorthand here, not a request to render an ant, insect, drone, or physical camera. Translate them into an invisible image-forming viewpoint operating at the smallest scale supported by the reference and scene."
    );
  }
  if (intent.microFpvViewpoint) {
    lines.push(
      "Micro-FPV camera relation: keep the viewpoint close to the same support surface as the tiny human and approximately at the tiny subject's own world height or clearance, with a plausible gap above the surface. Do not raise the camera to normal human eye level, detach it from the terrain, or make the camera itself an on-screen object unless explicitly requested."
    );
    lines.push(
      "Micro-FPV path lock: design the camera route as start state → intermediate surface landmarks or passable gaps → turns, obstacles, and motivated course corrections → destination, while keeping the tiny human's own A-to-B route spatially linked to it. Respect actual openings and solid surfaces; do not teleport, pass through closed geometry, or turn every route phase into a new shot."
    );
  }
  lines.push("Encode the lock as natural H3 timeline prose, not a detached negative list.");
  return lines.join("\n");
}

function scaleOutputAlreadyLocked(promptText: string): boolean {
  return /(?:scale (?:continuity|relation)|uniform(?:ly)?\s+(?:world[- ]scale|scaled|reduced|enlarged|smaller|larger)|world[- ]space\s+scale|(?:miniature|tiny|giant|larger|smaller)[^.!?\n]{0,120}(?:full[- ]size|environment|world[- ]scale|relative|throughout|remains?|stable)|(?:保持|维持)[^。！？\n]{0,100}(?:尺度|大小关系|等比例))/iu.test(promptText);
}

function microScaleOutputAlreadyLocked(promptText: string): boolean {
  return /(?:(?:ant[- ]?(?:size|scale)|ant['’]s\s+(?:view|eye)|insect[- ]?(?:eye|view|scale)|micro[- ]FPV)[^.!?\n]{0,180}(?:metaphor|viewpoint|support surface|same[^.!?\n]{0,35}(?:height|clearance))|(?:not|never|do not|without|rather than|instead of)[^.!?\n]{0,90}(?:literal ant|ant or insect|physical camera|drone))/iu.test(promptText);
}

function scaleOutputLock(intent: H3ScaleIntent, promptText: string): string {
  const direction = intent.direction === "smaller"
    ? "physically smaller than the full-size surrounding environment"
    : intent.direction === "larger"
      ? "physically larger than the surrounding environment"
      : "at the requested physical scale relative to the environment";
  if (/[\p{Script=Han}]/u.test(promptText)) {
    return intent.direction === "relative"
      ? "尺度关系：画面中已明确的大、小主体保持各自独立的身份、衣物归属和动作角色，其大小次序相对于可见环境参照全程稳定。"
      : `尺度关系：被描述为${intent.direction === "smaller" ? "微小" : "巨大"}的主体相对于完整尺寸的可见环境保持统一、稳定的世界尺度；仅保留用户或参考画面已经明确的身份、外观、衣物和全身比例。`;
  }
  return intent.direction === "relative"
    ? "Scale relation: the explicitly larger and smaller subjects remain separately identifiable, retain their own clothing and action roles, and keep the requested size ordering stable against visible environment anchors throughout the shot."
    : `Scale relation: the described subject remains ${direction} by one stable, uniform world-scale factor against visible full-size environment anchors. Preserve only the identity, appearance, clothing, and full-body proportions established by the user or reference.`;
}

function microScaleOutputLock(intent: H3ScaleIntent, promptText: string): string {
  if (/[\p{Script=Han}]/u.test(promptText)) {
    return intent.microFpvViewpoint
      ? "尺度视点：将输入中的微型尺度简称落实为贴近主体支撑表面、与主体世界高度相称的不可见成像视点；依据可见环境参照判断相对尺度，并沿真实可通行路径连续跟随。"
      : "尺度执行：将输入中的微型尺度简称落实为主体与可见环境参照之间的相对世界尺度，仅保持用户或参考画面已明确的身份和全身比例。";
  }
  return intent.microFpvViewpoint
    ? "Scale-viewpoint execution: interpret the supplied micro-scale shorthand as an invisible image-forming viewpoint close to the subject's support surface and approximate world height. Infer relative scale from visible environmental anchors and follow one continuous passable route."
    : "Scale execution: interpret the supplied micro-scale shorthand through the subject's relative world scale against visible environmental anchors, preserving only reference-grounded identity and full-body proportions.";
}

export function ensureH3ScalePreservationInOutput(
  promptText: string,
  mode: H3PromptMode,
  sourcePrompt: string,
  supplementalText = ""
): string {
  if (!promptText.trim()) return promptText;
  const intent = extractH3ScaleIntent(sourcePrompt, supplementalText);
  if (!intent.detected || !intent.humanSubject) {
    return promptText;
  }
  const shouldAddScaleLock = !intent.morphologyChangeRequested && !scaleOutputAlreadyLocked(promptText);
  const shouldAddMicroLock = intent.microFpvMetaphor && !microScaleOutputAlreadyLocked(promptText);
  if (!shouldAddScaleLock && !shouldAddMicroLock) return promptText;
  const locks = [
    ...(shouldAddScaleLock ? [scaleOutputLock(intent, promptText)] : []),
    ...(shouldAddMicroLock ? [microScaleOutputLock(intent, promptText)] : [])
  ].join("\n");
  const sectionName = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const sectionPattern = new RegExp(`^[*# \\t]*${sectionName}[ \\t]*:`, "imu");
  if (sectionPattern.test(promptText)) {
    return promptText.replace(sectionPattern, (header) => `${header}\n${locks}`);
  }
  return `${locks}\n${promptText}`;
}
