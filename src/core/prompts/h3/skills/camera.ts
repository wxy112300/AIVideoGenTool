import { extractH3CameraIntent } from "../../../h3-camera-intent.js";
import type { H3PromptSkill } from "./types.js";

const thresholdEntryPattern = /(?:\b(?:fly|flies|flying|glide|glides|gliding|dive|dives|diving|enter|enters|entering|go|goes|going|push|pushes|pushing|pass|passes|passing|slip|slips|slipping|travel|travels|traveling|move|moves|moving|zoom|zooms|zooming)\s+(?:in|into|inside|through|down(?:\s+into)?)\s+(?:[a-z0-9'’-]+\s+){0,4}(?:mouth|throat|gullet|esophagus|jaw|lips|teeth|nostril|ear|eye|pupil|underwear|waistband|pocket|sleeve|shoe|boot|bag|bottle|cup|mug|hole|burrow|tunnel|cave|pipe|tube|vent|keyhole|doorway|crack|gap|opening|cavity)\b|\b(?:inside|into)\s+(?:(?:the|a|an|her|his|their)\s+)?(?:open\s+)?(?:mouth|throat|esophagus|oral\s+cavity)\b|(?:镜头|相机|视角|机位|画面)[^。！？；;\n]{0,25}(?:飞进|飞入|钻进|钻入|进入|穿进|穿入|深入|滑进|滑入|探进|探入|推进|推入)[^。！？；;\n]{0,20}(?:嘴|口中|口腔|喉咙|嗓子|咽喉|口袋|袖口|袖子|鞋|洞|隧道|管道|缝隙|瓶口|杯口|门洞|开口|内部)|(?:飞进|飞入|钻进|钻入|穿入)(?:她的|他的|人的|张开的)?(?:嘴|口中|口腔|喉咙|嗓子|口袋|袖口|鞋里|洞口|隧道|瓶口))/iu;

const dollyZoomPattern = /(?:\b(?:dolly[- ]?(?:in|out|back|zoom)|push[- ]?in|pull[- ]?(?:out|back)|vertigo\s+effect|optical\s+zoom|zoom(?:s|ing)?\s+(?:in|out)|crash\s+zoom)\b|推近|推进|推镜头|拉远|拉出|拉镜头|变焦|希区柯克变焦|滑动变焦)/iu;
const orbitArcPattern = /(?:\b(?:orbit(?:s|ing|al)?|arc\s+shot|arc(?:s|ing)?\s+around|circl(?:e|es|ing)\s+around|rotat(?:e|es|ing)\s+around|revolv(?:e|es|ing)\s+around|360[- ]?degree|180[- ]?degree|90[- ]?degree)\b|环绕|围绕|绕着|弧线运镜|半圈|整圈)/iu;
const staticLockPattern = /(?:\b(?:static\s+(?:shot|camera|frame)|fixed\s+(?:camera|shot|tripod)|locked[- ]?off|tripod\s+shot|camera\s+(?:stays|remains|holds)\s+(?:still|static|fixed))\b|固定机位|固定镜头|静止镜头|静止机位|三脚架固定|镜头不动)/iu;
const trackingTruckPattern = /(?:\b(?:tracking\s+shot|track(?:s|ing)?\s+(?:alongside|behind|with|forward|backward)|follow(?:s|ing)?\s+(?:shot|alongside|behind)|truck(?:s|ing)?\s+(?:left|right)|lateral\s+track|steadicam)\b|跟拍|跟随镜头|横移|横向跟拍|平移跟随|斯坦尼康)/iu;
const craneJibPattern = /(?:\b(?:crane\s+(?:up|down|shot)|jib\s+(?:up|down|shot)|pedestal\s+(?:up|down)|aerial\s+(?:rise|descent|pullback)|boom\s+(?:up|down)|elevat(?:e|es|ing)\s+upward)\b|升降镜头|摇臂|航拍升起|航拍下降|垂直上升|垂直下降)/iu;
const handheldPattern = /(?:\b(?:handheld|shaky\s+cam|documentary\s+(?:camera|style|handheld)|verite|organic\s+shake)\b|手持镜头|手持摄影|纪实手持|轻微晃动)/iu;
const rackFocusPattern = /(?:\b(?:rack\s+focus|pull\s+focus|focus\s+(?:pull|shift|transition)|shift(?:s|ing)?\s+focus\s+from)\b|焦点转移|移焦|跟焦|拉焦|虚实切换|景深切换)/iu;
const whipPanPattern = /(?:\b(?:whip\s+pan|swish\s+pan|snap\s+pan|fast\s+pan|rapid\s+pan)\b|甩镜头|急摇|快速横摇)/iu;
const firstPersonPovPattern = /(?:\b(?:first[- ]?person\s+(?:pov|view|camera|perspective)|subjective\s+(?:pov|view|camera)|through\s+(?:her|his|my|their)\s+eyes)\b|第一人称|主观视角|透过(?:他的|她的|我的)眼睛)/iu;

export const cameraThresholdEntrySkill: H3PromptSkill = {
  id: "camera-threshold-entry",
  title: "Camera Threshold Entry & Interior Transition (Anti-Recursion / Anti-Glitch)",
  catalogHint: "camera flying or gliding through an opening (mouth, throat, doorway, tunnel, pocket, shoe, bottle) into an interior, or orbiting inside to look back out",
  priority: 95,
  sharedWithLongVideo: true,
  matches: (ctx) => thresholdEntryPattern.test(`${ctx.sourcePrompt}\n${ctx.supplementalContext}`),
  guidance: () => [
    "- Prevent H3 from hallucinating a second opening/mouth in the deep back interior by enforcing strict 3D threshold geometry:",
    "  1. Pre-entry & crossing: establish the single opening already wide before entry, then state clearly that its outer rim landmarks (lips and teeth / doorframe / pocket rim) sweep outward past all four borders of the frame and pass completely behind the lens while the deep back interior ahead stays enclosed and dim.",
    "  2. One-way deeper entry: once past the rim and moving deeper inward, stop naming exterior threshold landmarks ('mouth', 'lips', 'teeth', 'doorway', 'outside')—describe only continuous enclosed curved interior walls, surface microtexture, and diffused light spilling from behind the lens fading smoothly into shadowed depth ahead.",
    "  3. Inside-looking-out 180° reverse orbit (ONLY when the user asks to rotate inside and see the outside from within): NEVER reveal outside light or an opening in front of the camera while still facing inward toward the back wall. Explicitly stage a continuous horizontal ~180-degree semicircle arc shot around the subject inside the enclosed cavity that turns away from the dark closed back wall back toward the entry side; ONLY AFTER completing that ~180-degree turnaround, frame the backlit subject against that SAME single original opening (silhouetted rim/teeth/doorframe and bright diffused outside light).",
    "- Keep motion and exposure smooth through tight spaces using positive visual prose (steady continuous glide, smooth directional light falloff)."
  ].join("\n"),
  example: "Example (clean entry + 180° inside-looking-out reverse orbit): Starting outside, the camera glides smoothly forward through the wide open entrance as the parted outer rim sweeps rapidly past all four borders behind the lens. Inside the enclosed dimly lit passage, the camera glides in a smooth 180-degree horizontal arc shot around the foreground subject, turning completely away from the dark closed rear interior until the lens faces back toward the original entry side—now framing the backlit subject in silhouette against the single original opening and the bright diffused daylight beyond."
};

/**
 * Community- & official-grounded MiniMax H3 / video DiT cinematography skill.
 * Injects ONLY the matching camera sub-rules so Qwen3.8-Flash-Next stays focused and lean,
 * while Settings inspection (`ctx.inspectAll`) displays the full camera craft reference.
 */
export const cameraPrecisionSkill: H3PromptSkill = {
  id: "camera-precision",
  title: "Cinematography, Camera Motion & Viewpoint Craft",
  catalogHint: "specific camera moves (dolly/zoom, orbit/arc, static lock-off, tracking/truck, crane/jib, handheld, rack focus, whip pan, first-person POV), angle locks, or a visible physical camera device",
  priority: 85,
  sharedWithLongVideo: true,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const intent = extractH3CameraIntent(ctx.sourcePrompt, ctx.supplementalContext);
    return intent.rotationDegrees.length > 0
      || intent.hasPhysicalCamera
      || intent.angleKinds.length > 0
      || dollyZoomPattern.test(text)
      || orbitArcPattern.test(text)
      || staticLockPattern.test(text)
      || trackingTruckPattern.test(text)
      || craneJibPattern.test(text)
      || handheldPattern.test(text)
      || rackFocusPattern.test(text)
      || whipPanPattern.test(text)
      || firstPersonPovPattern.test(text);
  },
  guidance: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const intent = extractH3CameraIntent(ctx.sourcePrompt, ctx.supplementalContext);
    const lines: string[] = [
      "- Single-trajectory discipline & anti-treadmill rule (H3 uses natural prose, NEVER legacy bracket tags like '[Push in]'): give the camera ONE primary move per phase—stacking push-in + pan + crane at once turns motion into jittery mush. Always describe BOTH subject motion across real landmarks AND camera travel separately so H3 never freezes the subject on a sliding background treadmill."
    ];

    if (ctx.inspectAll || intent.rotationDegrees.length > 0 || orbitArcPattern.test(text)) {
      const degNote = intent.rotationDegrees.length
        ? `${intent.rotationDegrees.join("°, ")}-degree`
        : "180-degree";
      lines.push(
        `- Exact arc shot / orbit (WRONG → RIGHT): WRONG: 'camera rotates around her'. | RIGHT: 'the camera glides in a smooth, steady ${degNote} horizontal arc shot around her, stopping cleanly on the opposite side' (never continuing into an extra lap). State clearly whether the subject stays still or keeps walking so the subject does not spin like a turntable, distinct from camera roll or stationary pan.`
      );
    }
    if (ctx.inspectAll || dollyZoomPattern.test(text)) {
      lines.push(
        "- Physical dolly (push-in / pull-out) vs optical zoom: for a physical push-in or pull-out, state start framing → end framing and describe real 3D parallax passing foreground/background landmarks (never a flat digital crop); for an optical zoom, keep camera position fixed while focal length tightens or widens with flatter perspective."
      );
    }
    if (ctx.inspectAll || staticLockPattern.test(text)) {
      lines.push(
        "- Locked-off static camera (beats I2VA/T2VA floating drift): explicitly establish a locked-off tripod frame with a completely steady horizon and stationary background edges so ONLY the subject and environment move inside the frame."
      );
    }
    if (ctx.inspectAll || trackingTruckPattern.test(text)) {
      lines.push(
        "- Tracking / follow / truck shot: match camera travel speed and direction directly to the subject's pace (e.g. 'tracks smoothly alongside her walking pace from frame-left to frame-right'), keeping consistent framing distance while background landmarks pass steadily behind them."
      );
    }
    if (ctx.inspectAll || craneJibPattern.test(text)) {
      lines.push(
        "- Bounded crane / jib / pedestal elevation (beats infinite-crane warp): ALWAYS cap vertical travel with both starting height and final framing (e.g. 'elevates smoothly upward from street-level eye height into a high-angle view over the courtyard, settling cleanly')—never write bare 'cranes up'."
      );
    }
    if (ctx.inspectAll || handheldPattern.test(text)) {
      lines.push(
        "- Restrained handheld / documentary feel (beats violent seizure shake): WRONG: 'shaky handheld camera'. | RIGHT: 'subtle, natural handheld breathing weight like a stabilized documentary operator', keeping faces and horizons crisp and readable."
      );
    }
    if (ctx.inspectAll || rackFocusPattern.test(text)) {
      lines.push(
        "- Rack focus / depth-of-field handoff: explicitly name BOTH focal planes in chronological order—what starts crisp in focus while the other plane stays softly blurred, then the smooth optical focus shift landing sharply on the second target."
      );
    }
    if (ctx.inspectAll || whipPanPattern.test(text)) {
      lines.push(
        "- Anchored whip pan (beats ghosting and face morphing): ALWAYS anchor BOTH exact origin subject and landing subject—describe a brief directional horizontal whip pan across streaked motion blur that lands sharply and locks cleanly onto the destination subject."
      );
    }
    if (ctx.inspectAll || firstPersonPovPattern.test(text)) {
      lines.push(
        "- True first-person POV (beats accidental third-person): ground the viewer directly behind the character's eyes using visible foreground body cues (hands reaching, holding, or bracing in the lower frame) and natural subtle head-bob or gaze turns rather than describing the POV character from outside."
      );
    }
    if (ctx.inspectAll || intent.angleKinds.length > 0) {
      const angleLabel = intent.angleKinds.length ? intent.angleKinds.join(", ") : "requested viewpoint";
      lines.push(
        `- Angle lock & natural camera grammar: hold the requested viewpoint height/angle (${angleLabel}) consistently unless a transition is explicitly requested, using natural grammatical motion + amplitude + speed phrasing (e.g. 'pushes in slowly', 'tracks smoothly alongside', 'tilts gently upward', 'glides in a steady arc shot').`
      );
    }
    if (ctx.inspectAll || intent.hasPhysicalCamera) {
      lines.push(
        "- Physical camera prop vs invisible viewpoint: keep any visible camera device/tripod/phone prop strictly as an on-screen object, completely distinct from the invisible image-forming viewpoint framing the shot."
      );
    }
    return lines.join("\n");
  },
  example: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    if (rackFocusPattern.test(text)) {
      return "Example (clean rack focus): Locked-off medium close-up across a café counter with shallow depth of field; focus starts sharp on the steaming porcelain cup in the lower foreground while the barista behind stays softly blurred, then smoothly racks focus back onto the barista's eyes as the foreground cup softens.";
    }
    if (craneJibPattern.test(text)) {
      return "Example (bounded crane elevation): Starting at eye level behind the runner pausing at the alley mouth, the camera elevates smoothly upward on a steady crane path past brick eaves until it settles cleanly in a high-angle view revealing the sunlit plaza ahead.";
    }
    if (firstPersonPovPattern.test(text)) {
      return "Example (grounded first-person POV): First-person viewpoint looking down at a weathered wooden desk as two hands reach into the lower foreground, fingers lifting the brass latch and opening the leather case while the viewpoint tilts subtly with natural breathing.";
    }
    if (orbitArcPattern.test(text) || extractH3CameraIntent(ctx.sourcePrompt, ctx.supplementalContext).rotationDegrees.length > 0) {
      return "Example (clean bounded arc shot): Opening in a balanced medium shot of the violinist standing still under warm stage light, the camera glides in a smooth, steady 180-degree horizontal arc shot around her, revealing the dark hall and glowing rim light behind her shoulder before stopping cleanly on the opposite side.";
    }
    return undefined;
  }
};

export const cameraCraftSkills: readonly H3PromptSkill[] = [
  cameraThresholdEntrySkill,
  cameraPrecisionSkill
];
