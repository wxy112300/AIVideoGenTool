import type { H3PromptMode } from "../types.js";

export type H3CameraMotionKind =
  | "arc"
  | "pan"
  | "tilt"
  | "push"
  | "pull"
  | "track"
  | "zoom"
  | "roll"
  | "static"
  | "generic";

export interface H3CameraIntent {
  hasViewpointCamera: boolean;
  hasPhysicalCamera: boolean;
  sourceClauses: string[];
  physicalCameraClauses: string[];
  motionKinds: H3CameraMotionKind[];
  targetAnchors: string[];
  requiresViewpoint: boolean;
  requiresSpatial: boolean;
  requiresTarget: boolean;
}

export interface H3CameraIntentAudit {
  required: boolean;
  passed: boolean;
  missing: Array<"camera-movement" | "viewpoint" | "spatial" | "camera-target">;
  sourceClauses: string[];
}

const cameraMentionPattern = /(?:\bcameras?\b|\bcamcorder\b|\blens\b|\bPOV\b|\bpoint[- ]of[- ]view\b|\bviewpoint\b|镜头|相机|摄像机|摄影机|机位|视角)/iu;

const physicalCameraPattern = /(?:\b(?:handheld|digital|film|video|phone|smartphone|security|surveillance|web|webcam|visible|physical)\s+camera\b|\b(?:camera\s+device|camera\s+operator|camera\s+rig|camera\s+lens)\b|\b(?:CCTV)\b|\b(?:a|an)\s+(?:handheld\s+|digital\s+|film\s+|video\s+|phone\s+|security\s+|surveillance\s+)?camera\b[^.!?;\n]{0,45}\b(?:in|on|near|beside|behind|inside|outside|visible|background|shot|frame)\b|(?:相机|摄像机|摄影机)(?:设备|机身|镜头|支架)|镜头盖)/iu;

const physicalCameraActionPattern = /(?:\b(?:hold|holds|held|holding|carry|carries|carried|carrying|use|uses|using|pick(?:s|ed)?\s+up|place|places|placed|mount|mounts|mounted|set|sets|setting|point|points|pointing|aim|aims|aiming|film|films|filming|record|records|recording)\b[^.!?;\n]{0,45}\b(?:a|an|the|this|that|her|his|their|my|your)?\s*camera\b|\bcamera\b[^.!?;\n]{0,45}\b(?:sits?|lies?|rests?|hangs?|is\s+(?:visible|mounted|placed)|appears?|on\s+a\s+tripod)\b|(?:手持|拿着|拿起|携带|使用|放置|架设|安装|可见于画面)(?:[^。！？;\n]{0,35})(?:相机|摄像机|摄影机|camera))/iu;

const cameraMotionPattern = /(?:\b(?:camera|lens|viewpoint)\b[^.!?;\n]{0,90}\b(?:move|moves|moving|rotate|rotates|rotating|revolve|revolves|pan|pans|panning|tilt|tilts|tilting|dolly|dollies|track|tracks|tracking|follow|follows|following|push|pushes|pushing|pull|pulls|pulling|zoom|zooms|zooming|crane|cranes|sweep|sweeps|sweeping|arc|arcs|arcing|orbit|orbits|orbiting|circle|circles|circling|roll|rolls|rolling|stay|stays|remain|remains|hold|holds|locked)\b|\b(?:arc|arcing|orbit|orbiting|orbital|pan|panning|tilt|tilting|dolly|tracking|follow|following|push[- ]in|pull[- ]out|zoom|roll)\s+(?:shot|move|movement|path|around|in|out)\b|\b(?:rotate|rotates|rotating|revolve|revolves|orbit|orbits|orbiting|circle|circles|circling)\b[^.!?;\n]{0,50}\baround\b|(?:镜头|相机|摄像机|摄影机)[^。！？;\n]{0,65}(?:移动|运动|旋转|转动|环绕|围绕|绕着|横摇|摇摄|俯拍|仰拍|俯仰|推进|推近|拉远|后退|跟拍|跟随|升降|变焦|扫过|固定|静止|锁定))/iu;

const viewpointPattern = /(?:\b(?:POV|point[- ]of[- ]view|viewpoint|first[- ]person|subjective\s+(?:view|camera)|over[- ]the\s+shoulder|camera\s+(?:angle|view|perspective|position)|from\s+the\s+(?:camera|lens)|seen\s+(?:from|through)\s+the\s+(?:camera|lens)|the\s+(?:camera|lens)\s+(?:looks?|faces?|shows?|views?|captures?|records?|films?|shoots?)\b|\b(?:looking|viewed|seen|shown)\b[^.!?;\n]{0,70}\b(?:from|through|inside|outside|outward|the\s+camera|the\s+view|the\s+lens)\b|\b(?:toward|towards|into)\s+the\s+lens\b|(?:主观视角|第一人称|镜头视角|摄像机视角|相机视角|从[^。！？;\n]{0,35}(?:内部|里面|内侧|外部|外面|外侧)|向外看|看向外面|从镜头|从机位|视角)))/iu;

const lookAtViewCameraPattern = /(?:\b(?:look|looks|looking|stare|stares|staring|face|faces|facing)\s+(?:at|toward|towards)\s+(?:the\s+)?camera\b|\b(?:look|looks|looking|face|faces|facing)\s+into\s+the\s+lens\b|(?:看向|望向|面对|对着)(?:镜头|相机|摄像机|摄影机))/iu;

const approachesViewCameraPattern = /(?:\b(?:walk|walks|walking|run|runs|running|move|moves|moving|approach|approaches|approaching|step|steps|stepping|crawl|crawls|crawling|drive|drives|driving)\b[^.!?;\n]{0,35}\b(?:toward|towards|to|at)\s+(?:the\s+)?camera\b|(?:走向|跑向|移动到|靠近|接近|朝向)(?:镜头|相机|摄像机|摄影机))/iu;

const cameraOperatorPattern = /(?:\bcamera\s+operator\b|\b(?:cameraman|camerawoman|photographer)\b|摄影师|摄像师)/iu;

const nonOperatorCameraMotionPattern = /(?:^|[\s,])(?:the\s+)?(?:camera|lens|viewpoint)\b(?!\s+operator\b)[^.!?;\n]{0,90}\b(?:move|moves|moving|rotate|rotates|rotating|pan|pans|panning|tilt|tilts|tilting|track|tracks|tracking|follow|follows|following|push|pull|zoom|zooms|arc|arcs|orbit|orbits|roll|rolls|captures?|records?|films?|shoots?)\b/iu;

const spatialSignalPattern = /(?:\b(?:inside|indoors|interior|within|outside|outdoors|exterior|outward|through|behind|in\s+front\s+of|above|below|under|over|left|right|front|back|from\s+inside|from\s+outside|clockwise|counterclockwise|anticlockwise)\b|(?:内部|里面|内侧|室内|外部|外面|外侧|向外|穿过|透过|后方|前方|上方|下方|左侧|右侧|顺时针|逆时针|从[^。！？;\n]{0,30}(?:里面|内部|外面|外部)))/iu;

const motionPatterns: Array<{ kind: H3CameraMotionKind; pattern: RegExp }> = [
  { kind: "arc", pattern: /(?:\barc(?:s|ing)?\b|\borbit(?:s|ing|al)?\b|\bcircl(?:e|es|ing)\b|\brotate(?:s|d|ing)?\b[^.!?;\n]{0,50}\baround\b|\brevolve(?:s|d|ing)?\b[^.!?;\n]{0,50}\baround\b|环绕|围绕|绕着|弧线运动)/iu },
  { kind: "pan", pattern: /(?:\bpan(?:s|ning)?\b|横摇|摇摄|水平摇)/iu },
  { kind: "tilt", pattern: /(?:\btilt(?:s|ing|ed)?\b|俯仰|俯拍|仰拍)/iu },
  { kind: "push", pattern: /(?:\bpush(?:es|ing)?[- ]?in\b|\bdolly(?:s|ing)?[- ]?in\b|\bmove(?:s|ing)?\s+forward\b|推进|推近|前移)/iu },
  { kind: "pull", pattern: /(?:\bpull(?:s|ing)?[- ]?out\b|\bdolly(?:s|ing)?[- ]?out\b|\bmove(?:s|ing)?\s+(?:back|backward)\b|拉远|后退|后移)/iu },
  { kind: "track", pattern: /(?:\btrack(?:s|ing)?\b|\bfollow(?:s|ing)?\b|\btraverse(?:s|ing)?\b|跟拍|跟随|追踪)/iu },
  { kind: "zoom", pattern: /(?:\bzoom(?:s|ing|ed)?\b|变焦|放大|缩小)/iu },
  { kind: "roll", pattern: /(?:\broll(?:s|ing|ed)?\b|\brotate(?:s|d|ing)?\b[^.!?;\n]{0,45}\b(?:lens|optical axis)\b|绕光轴|横滚)/iu },
  { kind: "static", pattern: /(?:\bstatic\b|\blocked[- ]off\b|\bstationary\b|\bdoes not move\b|固定机位|固定镜头|静止机位|锁定机位)/iu },
  { kind: "generic", pattern: /(?:\b(?:camera|lens|viewpoint)\b[^.!?;\n]{0,80}\b(?:move|moves|moving|rotate|rotates|rotating|shift|shifts|sweep|sweeps|sweeping)\b|(?:镜头|相机|摄像机|摄影机)[^。！？;\n]{0,50}(?:移动|运动|旋转|转动|扫过))/iu }
];

const allMotionKinds = new Set<H3CameraMotionKind>(motionPatterns.map(({ kind }) => kind));

function splitPromptClauses(promptText: string): string[] {
  return promptText
    .replace(/\r/gu, "")
    .split(/(?<=[.!?。！？；;])\s+|\n+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function motionKindsFor(clause: string): H3CameraMotionKind[] {
  const kinds = motionPatterns
    .filter(({ pattern }) => pattern.test(clause))
    .map(({ kind }) => kind);
  if (kinds.length > 1 && kinds.includes("generic")) {
    return kinds.filter((kind) => kind !== "generic");
  }
  return kinds;
}

function cameraTargetsFor(clause: string): string[] {
  const targets: string[] = [];
  const englishTarget = /\b(?:around|orbit(?:s|ing)?\s+around|circle(?:s|ing)?\s+around|revolve(?:s|ing)?\s+around)\s+(?:(?:the|a|an)\s+)?([^,.;!?]+?)(?=\s+(?:showing|revealing|while|as|from|looking|and)\b|[,.;!?]|$)/iu.exec(clause)?.[1]?.trim();
  if (englishTarget) targets.push(englishTarget);
  const chineseTarget = /(?:环绕|围绕|绕着)\s*([^，。！？；;,\s]{1,20})/u.exec(clause)?.[1]?.trim();
  if (chineseTarget) targets.push(chineseTarget);
  return [...new Set(targets)].slice(0, 4);
}

function isViewpointCameraClause(clause: string): boolean {
  const hasMotion = cameraMotionPattern.test(clause);
  const hasViewpoint = viewpointPattern.test(clause);
  const looksAtViewCamera = lookAtViewCameraPattern.test(clause);
  const hasShotVocabulary = /(?:\b(?:shot|framing|frame|composition|lens|view|perspective)\b|构图|画面|镜头)/iu.test(clause);
  const hasPhysicalOnlyContext = physicalCameraPattern.test(clause) || physicalCameraActionPattern.test(clause);

  if (cameraOperatorPattern.test(clause) && !nonOperatorCameraMotionPattern.test(clause)) return false;
  if (looksAtViewCamera || hasViewpoint || (approachesViewCameraPattern.test(clause) && !hasPhysicalOnlyContext)) return true;
  if (!hasMotion && !hasShotVocabulary) return false;
  if (hasPhysicalOnlyContext && !hasMotion) return false;
  return true;
}

export function extractH3CameraIntent(promptText: string): H3CameraIntent {
  const clauses = splitPromptClauses(promptText);
  const sourceClauses: string[] = [];
  const physicalCameraClauses: string[] = [];
  const motionKinds = new Set<H3CameraMotionKind>();
  const targetAnchors = new Set<string>();
  let hasPhysicalCamera = false;

  for (const clause of clauses) {
    if (!cameraMentionPattern.test(clause)) continue;
    const physical = physicalCameraPattern.test(clause) || physicalCameraActionPattern.test(clause);
    const viewpoint = isViewpointCameraClause(clause);
    if (physical) {
      hasPhysicalCamera = true;
      physicalCameraClauses.push(clause);
    }
    if (!viewpoint) continue;
    sourceClauses.push(clause);
    for (const kind of motionKindsFor(clause)) motionKinds.add(kind);
    for (const target of cameraTargetsFor(clause)) targetAnchors.add(target);
  }

  const normalizedMotionKinds = [...motionKinds].filter((kind) => allMotionKinds.has(kind));
  const hasViewpointCamera = sourceClauses.length > 0;
  const requiresViewpoint = hasViewpointCamera && sourceClauses.some((clause) =>
    viewpointPattern.test(clause) ||
    lookAtViewCameraPattern.test(clause) ||
    approachesViewCameraPattern.test(clause) ||
    spatialSignalPattern.test(clause)
  );
  const requiresSpatial = hasViewpointCamera && sourceClauses.some((clause) => spatialSignalPattern.test(clause));
  return {
    hasViewpointCamera,
    hasPhysicalCamera,
    sourceClauses: [...new Set(sourceClauses)].slice(0, 6),
    physicalCameraClauses: [...new Set(physicalCameraClauses)].slice(0, 6),
    motionKinds: normalizedMotionKinds,
    targetAnchors: [...targetAnchors],
    requiresViewpoint,
    requiresSpatial,
    requiresTarget: targetAnchors.size > 0
  };
}

function cameraIntentInstructionLines(intent: H3CameraIntent): string[] {
  const lines = [
    "Camera disambiguation and preservation lock (community-derived): distinguish the viewpoint camera that creates the image from a physical camera device appearing in the scene. The word camera alone is not enough.",
    "Viewpoint-camera clauses control framing, POV, camera position, or camera motion. Preserve their meaning exactly. Physical-camera clauses describe a prop or device; keep that device as a visible scene object and never turn it into an invisible camera move.",
    "Compile explicit camera motion into one natural sentence inside integrated_multimodal_description (or detailed_description for R2V), not a new top-level CAMERA section. Use the official term Arc Shot for an arc/orbit around a subject, distinguish POV/start position from viewing direction, and keep one primary trajectory per shot. Do not invent direction, speed, lens, endpoint, or a camera path that the user did not provide."
  ];
  if (intent.motionKinds.length) {
    lines.push(`Camera motion signals detected in the viewpoint clauses: ${intent.motionKinds.join(", ")}. Keep every explicit signal; do not replace an orbit/arc with a subject rotation or a generic cinematic move.`);
  }
  if (intent.sourceClauses.length) {
    lines.push(`Explicit viewpoint-camera wording to preserve in meaning:\n${intent.sourceClauses.map((clause) => `- ${clause}`).join("\n")}`);
  }
  if (intent.targetAnchors.length) {
    lines.push(`Explicit camera movement target(s) to preserve: ${intent.targetAnchors.join(", ")}.`);
  }
  if (intent.physicalCameraClauses.length) {
    lines.push(`Physical camera-device wording (keep as a scene object, not a viewpoint instruction):\n${intent.physicalCameraClauses.map((clause) => `- ${clause}`).join("\n")}`);
  }
  return lines;
}

export function h3CameraIntentInstruction(promptText: string): string {
  const intent = extractH3CameraIntent(promptText);
  if (!intent.hasViewpointCamera && !intent.hasPhysicalCamera) return "";
  return cameraIntentInstructionLines(intent).join("\n");
}

function outputHasCameraMotion(output: string, kind: H3CameraMotionKind): boolean {
  const actor = /(?:\b(?:camera|lens|viewpoint|POV|point[- ]of[- ]view)\b|镜头|相机|摄像机|摄影机|机位|视角)/iu;
  if (!actor.test(output)) return false;
  const pattern = motionPatterns.find((candidate) => candidate.kind === kind)?.pattern;
  return Boolean(pattern?.test(output));
}

function outputHasViewpoint(output: string): boolean {
  return viewpointPattern.test(output) || /(?:\b(?:camera|lens|viewpoint|POV)\b[^.!?;\n]{0,90}\b(?:position|starts?|begins?|looks?|faces?|shows?|views?|captures?|records?|films?|shoots?)\b|\b(?:low|high|eye[- ]level|overhead|worm's[- ]eye)\s*[- ]?(?:angle|shot|framing)\b|\b(?:framing|composition|perspective|toward|towards)\s+(?:the\s+)?(?:viewer|lens|camera)\b|(?:镜头|机位|视角)[^。！？;\n]{0,70}(?:位于|从|看向|朝向|呈现|构图|画面))/iu.test(output);
}

function outputHasSpatialEvidence(source: string, output: string): boolean {
  const groups: Array<{ source: RegExp; output: RegExp }> = [
    {
      source: /(?:inside|indoors|interior|within|里面|内部|内侧|室内)/iu,
      output: /(?:inside|indoors|interior|within|indoors|里面|内部|内侧|室内)/iu
    },
    {
      source: /(?:outside|outdoors|exterior|outward|外面|外部|外侧|向外)/iu,
      output: /(?:outside|outdoors|exterior|outward|outwards|外面|外部|外侧|向外|向外看)/iu
    },
    {
      source: /(?:through|穿过|透过)/iu,
      output: /(?:through|穿过|透过|through the opening|through the window)/iu
    },
    {
      source: /(?:behind|后方|后面)/iu,
      output: /(?:behind|rear|后方|后面)/iu
    },
    {
      source: /(?:above|below|under|over|上方|下方)/iu,
      output: /(?:above|below|under|overhead|上方|下方)/iu
    },
    {
      source: /(?:\bleft\b|\bright\b|左侧|右侧)/iu,
      output: /(?:\bleft\b|\bright\b|左侧|右侧)/iu
    },
    {
      source: /(?:\bfront\b|\bback\b|前方|后方|前面|后面)/iu,
      output: /(?:\bfront\b|\bback\b|前方|后方|前面|后面)/iu
    },
    {
      source: /(?:\b(?:clockwise|counterclockwise|anticlockwise)\b|顺时针|逆时针)/iu,
      output: /(?:\b(?:clockwise|counterclockwise|anticlockwise)\b|顺时针|逆时针)/iu
    }
  ];
  const requiredGroups = groups.filter(({ source: sourcePattern }) => sourcePattern.test(source));
  if (!requiredGroups.length) return true;
  return requiredGroups.every(({ output: outputPattern }) => outputPattern.test(output));
}

function outputHasCameraTarget(output: string, target: string): boolean {
  const normalizedTarget = target
    .replace(/^(?:the|a|an)\s+/iu, "")
    .trim()
    .toLowerCase();
  if (!normalizedTarget) return true;
  if (output.toLocaleLowerCase().includes(normalizedTarget)) return true;
  if (/(?:girl|woman|female|she|her|女孩|女人|女性|她)/iu.test(normalizedTarget)) {
    return /(?:\bgirl\b|\bwoman\b|\bfemale\b|\bshe\b|\bher\b|女孩|女人|女性|她)/iu.test(output);
  }
  if (/(?:boy|man|male|he|him|his|男孩|男人|男性|他)/iu.test(normalizedTarget)) {
    return /(?:\bboy\b|\bman\b|\bmale\b|\bhe\b|\bhim\b|\bhis\b|男孩|男人|男性|他)/iu.test(output);
  }
  return /(?:\bsubject\b|\btarget\b|主体|目标)/iu.test(output);
}

export function auditH3CameraIntent(
  sourcePrompt: string,
  generatedPrompt: string
): H3CameraIntentAudit {
  const intent = extractH3CameraIntent(sourcePrompt);
  if (!intent.hasViewpointCamera) {
    return {
      required: false,
      passed: true,
      missing: [],
      sourceClauses: intent.sourceClauses
    };
  }
  const missing: Array<"camera-movement" | "viewpoint" | "spatial" | "camera-target"> = [];
  if (intent.motionKinds.some((kind) => !outputHasCameraMotion(generatedPrompt, kind))) {
    missing.push("camera-movement");
  }
  if (intent.requiresViewpoint && !outputHasViewpoint(generatedPrompt)) {
    missing.push("viewpoint");
  }
  if (intent.requiresSpatial && !outputHasSpatialEvidence(intent.sourceClauses.join(" "), generatedPrompt)) {
    missing.push("spatial");
  }
  if (intent.requiresTarget && intent.targetAnchors.some((target) => !outputHasCameraTarget(generatedPrompt, target))) {
    missing.push("camera-target");
  }
  return {
    required: true,
    passed: missing.length === 0,
    missing,
    sourceClauses: intent.sourceClauses
  };
}

function cameraFallbackSentence(intent: H3CameraIntent): string {
  return `The viewpoint camera must preserve this explicit user direction in the shot: ${intent.sourceClauses.join(" ")}`;
}

export function preserveH3CameraIntentInOutput(
  generatedPrompt: string,
  sourcePrompt: string,
  mode: H3PromptMode
): string {
  const intent = extractH3CameraIntent(sourcePrompt);
  if (!intent.hasViewpointCamera) return generatedPrompt;
  if (auditH3CameraIntent(sourcePrompt, generatedPrompt).passed) return generatedPrompt;

  const section = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
  const fallback = cameraFallbackSentence(intent);
  const sectionPattern = new RegExp(`^[*# \\t]*${section}[ \\t]*:`, "imu");
  const sectionMatch = sectionPattern.exec(generatedPrompt);
  if (!sectionMatch) return `${generatedPrompt.trim()}\n\n${section}: [Shot 1] ${fallback}`.trim();

  const shotPattern = new RegExp(`(^[*# \\t]*${section}[ \\t]*:\\s*)(\\[Shot\\s+1\\])`, "imu");
  if (shotPattern.test(generatedPrompt)) {
    return generatedPrompt.replace(shotPattern, `$1$2 ${fallback} `);
  }
  const insertAt = sectionMatch.index + sectionMatch[0].length;
  return `${generatedPrompt.slice(0, insertAt)} ${fallback}${generatedPrompt.slice(insertAt)}`.trim();
}
