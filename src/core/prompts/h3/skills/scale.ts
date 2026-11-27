import { extractH3MicroFpvIntent, extractH3ScaleIntent } from "../../../h3-scale-preservation.js";
import type { H3PromptSkill, H3PromptSkillContext } from "./types.js";

const scaleDifferencePattern = /(?:\b(?:scale\s+difference|size\s+difference|size\s+comparison|giantess|gts|macro[- /]micro|(?:palm|thumb|finger|hand|pocket|inch)[- ]?(?:sized|tall)|shrink(?:ing|s)?(?:\s+(?:down|a|the))?\s+(?:human|person|woman|man|girl|boy|him|her|me|myself)?|shrunk(?:en)?\s+(?:down|human|person|woman|man|girl|boy)|tiny\s+(?:man|woman|guy|girl|boy|human|person|adult)|miniature\s+(?:man|woman|human|person|adult)|towering\s+(?:woman|girl|man|giant|giantess|figure)|giant(?:ess)?\b[^.!?\n]{0,50}\b(?:tiny|shrunk|small|mini|little|palm|hand|foot|shoe|finger|face|eye|pov))\b|尺寸差|大小差|体[型形]差|身高差|女巨人|巨娘|巨大化|微缩人|掌心小人|手心小人|小人|拇指大小|指尖大小|巴掌大|等比例缩小|正在缩小|慢慢缩小|突然缩小|变小(?:的)?(?:真人|人类|人物|女子|男子|女孩|男孩|成人)|缩小(?:的)?(?:真人|人类|人物|女子|男子|女孩|男孩|成人)|巨大(?:的)?(?:角色|人物|人类|女子|男子|女孩|男孩|巨人|手掌|手指|脚掌|鞋子)|巨手|巨脚|巨足|巨鞋)/iu;

const bodyTraversalPattern = /(?:\b(?:climb(?:s|ing|ed)?|scale(?:s|d|ing)?|scrambl(?:e|es|ing)|crawl(?:s|ing)?|run(?:s|ning)?|sprint(?:s|ing)?|jog(?:s|ging)?|walk(?:s|ing)?|trek(?:s|king)?|step(?:s|ping)?|stand(?:s|ing)?|sit(?:s|ting)?|slide(?:s|ing)?|sliding|hold(?:s|ing)?|grip(?:s|ping)?|grab(?:s|bing)?|interact(?:s|ing|ion)?)\b[^.!?\n]{0,60}\b(?:body|skin|arm|forearm|wrist|hand|palm|finger|thumb|leg|shin|calf|ankle|knee|thigh|foot|feet|shoe|boot|sock|chest|torso|shoulder|collarbone|neck|collar|clothing|shirt|sweater|jeans|denim|trouser|sleeve|skirt|hair|head|face|cheek|nose|ear|tongue|mouth|lips?|teeth|palate)\b|(?:身体|皮肤|肌肤|手臂|胳膊|手腕|手掌|掌心|手指|手背|腿|小腿|脚踝|膝盖|大腿|脚|脚背|鞋|鞋面|鞋带|袜|衣服|裤子|裙子|衣领|衣袖|肩膀|肩头|锁骨|胸口|脖子|头发|头顶|脸|鼻尖|舌头?|舌面|口腔|嘴唇|身体上)[^。！？；;\n]{0,30}(?:攀爬|爬|跑|奔跑|走|行走|跨越|翻越|滑|踩|抓|握|拉|站|坐|互动|接触)|(?:攀爬|爬上|爬向|从脚爬到头|爬到头|奔跑|跑过|走过|滑下|踩在|抓着|拉着)[^。！？；;\n]{0,30}(?:身体|皮肤|肌肤|手臂|胳膊|手掌|掌心|手指|腿|小腿|脚|鞋|袜|衣服|裤子|裙子|肩膀|胸口|脖子|头发|头顶|舌头?|舌面|巨人|巨大))/iu;

const giantHandPattern = /(?:\b(?:pick(?:s|ing|ed)?\s+up|pinch(?:es|ing|ed)?|scoop(?:s|ing|ed)?|cradl(?:e|es|ing|ed)|lift(?:s|ing|ed)?|hold(?:s|ing)?|held|grab(?:s|bing|bed)?|grasp(?:s|ing|ed)?|set(?:s|ting)?\s+down|plac(?:e|es|ing|ed)|drop(?:s|ping|ped)?|pok(?:e|es|ing|ed)|nudg(?:e|es|ing|ed)|press(?:es|ing|ed)?|strok(?:e|es|ing|ed)|pet(?:s|ting|ted)?|palm|fingertip|finger(?:s)?|thumb|cupped\s+hand)\b|捏起|捏住|抓起|拎起|托起|捧起|捧在手心|放在掌心|手心|掌心|手掌|巨手|手指|指尖|拇指|食指|戳|拨弄|轻点|轻按|按住|抚摸|举起|放下)/iu;

const giantFootPattern = /(?:\b(?:footstep(?:s)?|stomp(?:s|ing|ed)?|step(?:s|ping|ped)?\s+(?:over|down|forward|near|beside)|sole|heel|toes?|barefoot|sock(?:s)?|sandal(?:s)?|shoe(?:s)?|boot(?:s)?|sneaker(?:s)?|high\s+heel|ankle|shadow\s+looms?|looming\s+shadow|towering\s+(?:over|above))\b|巨脚|巨足|巨鞋|脚步|踩|踏|跨过|迈过|脚掌|脚底|脚背|脚趾|赤脚|光脚|袜子|丝袜|鞋底|鞋尖|高跟鞋|运动鞋|靴子|脚下|鞋边|阴影笼罩|巨影)/iu;

const giantFaceBreathPattern = /(?:\b(?:lean(?:s|ing|ed)?\s+(?:in|down|close)|look(?:s|ing|ed)?\s+(?:down|up)|peer(?:s|ing|ed)?\s+(?:down|closely)|stare(?:s|d)?\s+down|giant(?:['’]?s)?\s+(?:girl['’]?s\s+)?(?:eye|eyes|eyebrow|face|cheek|nose|lips?|mouth|tongue|teeth)|exhal(?:e|es|ing)|blow(?:s|ing)?\s+(?:air|breath|gently)|warm\s+breath|whisper(?:s|ing)?|giantess\s+pov|tiny\s+pov|looking\s+straight\s+up)\b|凑近|俯视|低头看|低头凝视|仰视|抬头看|巨眼|巨脸|巨大的脸|巨大的眼睛|眉骨|眉毛|鼻梁|鼻尖|嘴唇|吹气|呼气|呼吸声|热气|气浪)/iu;

const clothingGapPattern = /(?:\b(?:underwear|panties|waistband|elastic(?:\s+band)?|pocket|collar|sleeve|fabric\s+wall|skin\s+wall|squeez(?:e|es|ing)\s+(?:in|into|inside|under)|pull(?:s|ed|ing)?\s+back\s+(?:the\s+)?(?:elastic|waistband|collar|pocket|fabric))\b|内衣|内裤|腰带|松紧带|口袋|衣领|袖口|钻进(?:衣服|内衣|裤腰|口袋)|拉开(?:腰带|松紧|衣领))/iu;

const bilateralPressPattern = /(?:\b(?:sandwich(?:ed|ing)?|sole\s+to\s+sole|between\s+(?:her|his|their|the|two)\s+(?:feet|soles|toes|hands|palms|fingers)|two\s+(?:feet|foot|soles|hands|palms)\b[^.!?\n]{0,35}\b(?:press|rub|wiggle|hold|trap|pin|squeeze|sandwich)|clap(?:ping|ped)?\s+(?:her|him|them)|pin(?:ned|ning)?\s+between)\b|双脚夹|脚底相对|脚掌相对|两脚夹|夹住|夹在(?:两脚|双脚|双手|掌心)之间|双手合拢|夹扁)/iu;

const oralHazardPattern = /(?:\b(?:teeth|tooth|molar|chew(?:s|ing)?|bit(?:e|es|ing)|jaw|tongue|lips?|mouth|palate)\b|牙齿|门牙|臼齿|咀嚼|咬|舌头?|舌面|口腔|嘴唇)/iu;

const shrinkingTransformPattern = /(?:\b(?:shrink(?:s|ing)?\s+(?:down|smaller|in\s+real\s+time|gradually|suddenly)|grow(?:s|ing)?\s+(?:bigger|taller|giant|huge|enormous)|oversized\s+cloth(?:es|ing)|clothes?\s+(?:collaps|pool|slip|droop)|shrinking\s+process|growth\s+sequence)\b|正在缩小|慢慢缩小|逐渐缩小|突然缩小|变小过程|缩小过程|正在变大|慢慢变大|巨大化过程|衣服变大|衣服滑落|宽大衣物)/iu;

const millimeterScalePattern = /(?:\b(?:[1-9](?:\.\d+)?\s*mm|millimeter(?:s)?|sub[- ]?centimeter|ant[- ]?size(?:d)?|grain[- ]?of[- ]?sand|microscopic)\b|[1-9](?:\.\d+)?\s*毫米|几毫米|毫米级|蚂蚁大小|尘埃大小|微米)/iu;

const centimeterScalePattern = /(?:\b(?:\d+(?:\.\d+)?\s*(?:cm|centimeter(?:s)?|inch(?:es)?)|(?:finger|thumb|palm|hand|shoe|ankle)[- ]?(?:sized|tall|high))\b|\d+(?:\.\d+)?\s*(?:厘米|公分|英寸)|几厘米|拇指大小|指尖大小|巴掌大|掌心大小|手掌大)/iu;

const microFpvPattern = /(?:\b(?:ant[- ]?(?:view|eye|pov|perspective|scale|size)|ant['’]s[- ]?(?:view|eye|perspective|pov)|(?:insect|bug)[- ]?(?:view|eye|pov|perspective)|micro[- ]?(?:fpv|fov|first[- ]person))\b|蚂蚁(?:视角|视线|大小|尺寸)|虫眼(?:视角)?|微型\s*(?:FPV|FOV|第一人称)|微距第一人称)/iu;

const microThirdPersonLowAnglePattern = /(?:\b(?:third[- ]?person|over[- ]?the[- ]?shoulder|\bots\b|behind\s+(?:the\s+)?(?:tiny|shrunk(?:en)?|small|miniature)\s+(?:person|human|woman|man|character|climber)|low[- ]?angle|worm['’]?s[- ]?eye|ground[- ]?level|probe\s+lens|wide[- ]?angle\s+macro|bug[- ]?eye)\b|第三人称|过肩|背后跟拍|贴近(?:小人|微缩|缩小)|贴地(?:视角|低机位|跟拍)|极低(?:机位|角度)|低角度|低机位|仰拍|仰视|微观视角|微距广角|探针镜头)/iu;

const continuousPerspectiveTransitionPattern = /(?:\b(?:macro[- ]?to[- ]?wide|wide[- ]?to[- ]?macro|seamless\s+(?:zoom|transition|pull[- ]?back|push[- ]?in|dive)|continuous\s+(?:zoom|transition|pull[- ]?back|push[- ]?in|camera\s+(?:move|shift|transition)|perspective\s+(?:shift|transition))|pull(?:s|ing)?\s+back\s+to\s+reveal|zoom(?:s|ing)?\s+(?:in|out)\s+(?:from|to|into)|tilts?\s+(?:smoothly\s+)?(?:up|down)\s+(?:from|along|past)|perspective\s+(?:shift|transition))\b|视角转换|视角切换|连续(?:转换|切换|推近|拉远|上摇|下摇|俯仰)|一镜到底[^。！？；;\n]{0,20}(?:推|拉|摇|切|转|钻|俯|仰)|从(?:宏观|全景|远景|正常视角|高处|桌面|脚底)[^。！？；;\n]{0,18}(?:推入|推进|切入|滑入|俯冲|拉远|拉升|摇到|过渡到)[^。！？；;\n]{0,18}(?:微观|微距|特写|小人|全景|远景|头顶|脸)|从(?:微观|微距|小人|脚边|掌心)[^。！？；;\n]{0,18}(?:拉远|拉出|推升|上摇|过渡到)[^。！？；;\n]{0,18}(?:宏观|全景|房间|全身|巨人|脸))/iu;

function hasScaleIntent(ctx: H3PromptSkillContext): boolean {
  const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
  return extractH3ScaleIntent(ctx.sourcePrompt, ctx.supplementalContext).detected
    || scaleDifferencePattern.test(text);
}

/**
 * Consolidated scale-difference, world-physics & giant/body-interaction skill.
 * Injects ONLY the matching scale tier, reference seam-healing, and interaction sub-rules
 * plus at most ONE best-matching example to stay crisp and avoid duplicated rules.
 */
export const scaleWorldCraftSkill: H3PromptSkill = {
  id: "scale-world-craft",
  title: "Scale Difference, World Physics & Giant Interaction",
  catalogHint: "shrunk/tiny human, giant/giantess, dramatic size difference, or scale-locked interaction visible in the reference image or brief",
  priority: 100,
  sharedWithLongVideo: true,
  matches: (ctx) => hasScaleIntent(ctx),
  guidance: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const intent = extractH3ScaleIntent(ctx.sourcePrompt, ctx.supplementalContext);
    const scaleTierLine = millimeterScalePattern.test(text)
      ? "- Millimeter-scale world (~1–5mm): ordinary micro-textures become monumental terrain—carpet yarn loops act like twisted cables, cotton weave like a coarse rope lattice with waist-high lint, skin pores/fingerprint ridges like rolling hills, a water droplet like a trembling surface-tension boulder, dust motes like drifting snowballs, and gentle drafts like stiff wind."
      : centimeterScalePattern.test(text)
        ? "- Centimeter-scale world (match the exact tier—never mix 1mm and 10cm worlds): at ~1–4cm (fingertip/thumb height), shoelaces are climbing ropes, sneaker rims are two-story walls, and palm lifelines loom huge; at ~8–15cm (palm/mug height), a mug or can towers like a silo and keyboard keys are stepping tiles; at ~20–40cm (shoe/shin height), floorboards read as wide flagstones."
        : "- Scale-tier world calibration (1mm vs 2cm vs 10cm are distinct worlds): match texture magnification, droplet/dust physics, wind sensitivity, and terrain landmarks strictly to the exact visual scale in the reference or brief without inventing arbitrary numbers.";

    const lines = [
      "- Two-person identity isolation & locked handles (WRONG → RIGHT): the tiny human and giant human are TWO SEPARATE PEOPLE. WRONG: writing 'she walks on her thigh', calling the shrunk person 'figure'/'tiny figure'/'figurine', or copying '(age 18)' onto the giant. | RIGHT: keep TWO distinct, scale-explicit handles in every clause—e.g. `the tiny adult woman` (plus 2–3 words of her own look if needed) vs `the giant woman`—and describe her body/silhouette, NEVER the word 'figure'.",
      "- Positive adult realism & clean macro optics: describe natural adult proportions, slender mature limbs, living skin, flexible clothing, and grounded weight in wide-angle close-focus macro optics with readable deep background (never toy/doll/tilt-shift words or 'not a toy/baby' bans).",
      ...(ctx.hasReferenceMedia ? [
        "- Reference localization & seam-healing: find the tiny adult's ACTUAL spot and size in `<Picture 1>` (including corners, thighs, hands, shoes, or folds). Anchor each character briefly (<=1 sentence total—never recite full outfits or room decor) and ground the tiny adult with shared room light, bounce light, and crisp contact shadows directly under moving soles and palms (never mention Photoshop/compositing)."
      ] : []),
      scaleTierLine,
      "- Exact tight ratio & scale-true verbs (WRONG → RIGHT): H3 cannot measure bare numbers ('5 mm', 'keep size unchanged') and inflates loose bounds ('no greater than the span of her thigh'). RIGHT: pin ONE tight ratio against the nearest SMALL giant landmark ('shorter than one front tooth', 'half the length of one giant thumb joint', 'about a quarter the height of her kneecap') matching `<Picture 1>` or the brief; translate normal verbs into scale-true full-body contact (WRONG: 'hugging her tongue' | RIGHT: 'pressing her entire body flat against the towering wet side of the tongue').",
      "- Gravity, solid contact & co-scaling camera lock: alternating planted footsteps, real climbing holds, and crisp shadows (zero hovering/clipping). Keep ONE giant landmark visible in frame with the tiny adult so both scale together during camera moves (never isolate the tiny adult in an anchorless close-up or echo meta-rules like 'enlarging at identical rate').",
      "- Psychoacoustic scale sound: crisp dry high-mid tiny footsteps/rustles (zero low-end weight) vs colossal giant sub-bass thuds, low-pass hand/shoe air whooshes, warm breath gusts, and deep room-reverb giant voice."
    ];

    if (ctx.inspectAll || giantHandPattern.test(text)) {
      lines.push(
        "- Giant hand pickup, pinch, palm scoop & finger nudge (3-stage contact—never merge into fingers): (1) descending hand casts an expanding shadow dimming light on the tiny human; (2) oversized fingerprint whorls and warm skin pads press against clothing or slide flat beside feet with slight pad flattening and cloth compression (zero clipping); (3) gravity-true lift/tilt—pinched legs dangle/kick naturally while hands brace against finger pads, or on a rising palm they bend knees and plant palms into lifelines to balance."
      );
    }
    if (ctx.inspectAll || giantFootPattern.test(text)) {
      lines.push(
        "- Looming giant foot, shoe & ground-level arrival: anchor the lens near floor level; lead with the expanding overhead shadow, strong low-angle foreshortening up sole/sock/shoe/ankle, subtle floor micro-vibration and stirred dust motes on heel/ball impact, and a bracing stagger against displaced air—paired with deep sub-bass thud and floor creak."
      );
    }
    if (ctx.inspectAll || bilateralPressPattern.test(text)) {
      lines.push(
        "- Bilateral opposing-plane press / sole-to-sole or palm-to-palm sandwich (explicit 3D planes—never rely on the bare word 'sandwiched'): stage two opposing limbs entering from frame-left and frame-right like two towering vertical soft walls facing each other (e.g., left sole on frame-left facing right sole on frame-right, toes curling softly inward). Hold the scaled-down adult caught inside the narrowing vertical gap between the two opposing skin planes, bracing palms against one sole/palm and back against the opposite sole/palm as both surfaces press, wiggle, and shift gently around them without merging."
      );
    }
    if (ctx.inspectAll || clothingGapPattern.test(text)) {
      lines.push(
        "- Tight clothing, waistband & pocket entry (3D held-open V-gap—beats fabric clipping): NEVER describe 'squeezing through/under closed fabric' (which causes cloth-mesh clipping). Explicitly stage giant fingers pulling the elastic waistband or garment rim clearly outward away from bare skin to form a wide, visible, shaded V-shaped pocket opening; show the scaled-down adult climbing OVER the top elastic rim and stepping/dropping down into that open gap, keeping distinct woven fabric on one vertical side wall and warm bare skin on the opposite wall while the camera looks into or glides inside the open channel."
      );
    }
    if (ctx.inspectAll || bodyTraversalPattern.test(text)) {
      lines.push(
        `- Giant-body climbing/walking & shifting biological surface physics (${ctx.durationSeconds.toFixed(1)}s): advance sequentially through connected anatomical/clothing landmarks (sole rim → shoelaces → trouser twill seams → knee fold → waistband → knit shirt → shoulder → hair strands; cover 1–2 adjacent zones in short clips). Match grip to material—warm bare skin and soft moist undulating surfaces (such as a moving tongue or breathing torso) dimple visibly beneath planted soles and palms, causing realistic micro-slips and balance shifts that motivate smooth knee-bends into hands-and-knees crawling; cloth seams/yarn loops hook and compress; socks stretch subtly around shoe edges; hair strands part and sway—while the giant reacts as a living body.`
      );
    }
    if (ctx.inspectAll || giantFaceBreathPattern.test(text) || oralHazardPattern.test(text)) {
      lines.push(
        "- Local-horizon macro framing on giant face/body (anti-face-deformation): at millimeter/centimeter close-up on a giant's face or torso, frame ONLY the local anatomical horizon (one colossal blinking eye filling half the upper frame, curved nose bridge, lip ridge, skin pores, fine peach fuzz)—NEVER try to squeeze the giant's entire laughing face into a close macro shot alongside a 5mm person (which warps facial geometry). Show the full giant face only in wider establishing beats or deep distant background looking up from far landmarks like toes; warm exhaled breath visibly ripples the tiny subject's hair and sleeves with a soft low rushing breeze."
      );
    }
    if (ctx.inspectAll || oralHazardPattern.test(text)) {
      lines.push(
        "- Oral interior teeth & chewing spatial layering: when teeth or chewing appear inside the mouth, keep upper and lower rows of towering white enamel teeth clearly separated along the outer/side perimeter walls moving smoothly up and down in rhythmic jaw motion, while the scaled-down adult remains strictly on the central moist undulating tongue ridge, dodging falling food crumbs without intersecting tooth geometry."
      );
    }
    if (ctx.inspectAll || shrinkingTransformPattern.test(text)) {
      lines.push(
        "- Dynamic shrinking/growing transformation: keep surrounding room, furniture, and floor grain 100% rigid and unchanged while ONLY the subject scales smoothly along a continuous trajectory; keep clothing physics explicit (collapsing into oversized pooling folds or scaling smoothly together as requested)."
      );
    }
    if (intent.morphologyChangeRequested) {
      lines.push("- Preserve the user's explicitly requested stylized/proportion change while still locking relative world scale against visible anchors.");
    }
    return lines.join("\n");
  },
  example: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    if (bodyTraversalPattern.test(text)) {
      return "Example (body climb + tactile contact): Close wide-angle macro tracking shot following a fully proportioned adult climber ascending the massive denim trouser leg of a seated giant woman. Fingers hook firmly into thick diagonal indigo twill seams while sneakers press into deep fabric folds with tight contact shadows. Reaching her bare knee, palms press into warm fine-pored skin that dimples faintly under each quick handhold; far above, her torso rises gently with slow breathing as her heavy gaze lowers toward the tug along her leg.";
    }
    if (giantHandPattern.test(text)) {
      return "Example (giant palm scoop + shadow): Low macro shot at tabletop level as a broad moving shadow dims sunlit oak grain over a tiny fully proportioned adult man. A giant woman's open hand glides flat beside him, oversized palm lifelines and warm skin pores looming like terrain; he steps onto her palm with crisp contact shadows under his sneakers. As her massive fingers curl loosely and her wrist lifts smoothly, he bends his knees and braces one palm against the ridged skin to keep balance while a slow warm exhale gently ruffles his hair.";
    }
    return "Example (scale anchor + co-scaling camera): In one continuous unbroken low macro shot, positioned in the lower-left foreground on sunlit oak floorboards beside a towering sneaker's rubber sole, a fully proportioned adult woman in a dark sweater and jeans—natural adult head-to-body ratio, room-matched bounce light—stands barely as tall as the white rubber rim. Her sneakers plant firmly with dark contact shadows directly beneath each sole as she takes three alternating steps; as the camera glides smoothly closer, both her body and the towering rubber sole edge and wood grain enlarge together at the exact same rate, keeping her exact height pinned below the rim.";
  }
};

/**
 * Universal micro-perspective, ant-view translation, tiny third-person low-angle &
 * continuous Wide <-> Micro one-take perspective transition skill.
 */
export const microCameraTransitionsSkill: H3PromptSkill = {
  id: "micro-camera-transitions",
  title: "Micro-World Camera, Tiny Third-Person Low-Angle & Continuous Perspective Transitions",
  catalogHint: "micro-scale/ant-view perspective, tiny low-angle third-person over-the-shoulder follow, or continuous wide-to-macro / macro-to-wide perspective shift",
  priority: 92,
  sharedWithLongVideo: true,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const fpv = extractH3MicroFpvIntent(ctx.sourcePrompt, ctx.supplementalContext);
    const hasFpv = !fpv.literalAnimalSubject && (fpv.detected || microFpvPattern.test(text));
    const hasTransition = continuousPerspectiveTransitionPattern.test(text);
    const hasMicroThirdPerson = microThirdPersonLowAnglePattern.test(text);
    const explicitProbe = /(?:\b(?:probe\s+lens|wide[- ]?angle\s+macro)\b|微观视角|微距广角|探针镜头)/iu.test(text);
    return hasFpv || hasTransition || explicitProbe || (hasScaleIntent(ctx) && hasMicroThirdPerson);
  },
  guidance: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const fpv = extractH3MicroFpvIntent(ctx.sourcePrompt, ctx.supplementalContext);
    const hasFpv = !fpv.literalAnimalSubject && (fpv.detected || microFpvPattern.test(text));
    const hasTransition = continuousPerspectiveTransitionPattern.test(text);
    const lines: string[] = [];

    if (hasFpv) {
      lines.push(
        "- Translate micro-view shorthand ('ant view', 'ant-size', 'insect-eye', 'micro-FPV', 'micro-FOV', '虫眼视角') into an invisible ultra-low-clearance wide-angle lens skimming millimeters above the real support surface along one continuous passable route—NEVER write the literal words 'ant', 'insect', 'bug', 'drone', or 'micro-FPV' into the final H3 prompt unless that animal or device belongs on screen."
      );
    }
    if (microThirdPersonLowAnglePattern.test(text) || hasScaleIntent(ctx)) {
      lines.push(
        "- True surface-eye-level low angle & smooth push-in (WRONG → RIGHT): WRONG: teleporting into macro at 0.00s when `<Picture 1>` is wider, or writing bare 'camera flies close' (which tilts H3 into a top-down overhead swoop). | RIGHT: open at `<Picture 1>`'s real framing, glide smoothly forward and downward until the lens settles at the tiny adult's own waist-to-eye height on the surface, tracking horizontally with a slight upward tilt so the tiny adult's sharp body sits in the lower foreground while the giant woman's massive body and distant face rise vertically above with deep readable context. For giant downward POV, frame a subtle giant foreground edge (chin, shoulder, or cupped hands) looking clearly down at the tiny adult."
      );
    }
    if (hasTransition) {
      lines.push(
        "- Continuous unbroken perspective transitions (Wide ↔ Micro / Ground ↔ Giant without cuts or scale drift): use ONE clean continuous camera vector (smooth descending dive-in, seamless pullback reveal, or unbroken upward tilt—never stack conflicting orbit + pan + zoom). Bridge scale leaps through concrete intermediate spatial landmarks along the single path (e.g., wide room → gliding down past a desk edge → skimming wood grain → settling behind the tiny subject's shoulder; or tilting steadily up shoe sole → calf → torso → face), shifting optical depth-of-field and audio perspective smoothly together (room ambience ↔ intimate dry micro-foley)."
      );
    }
    if (!lines.length) {
      lines.push(
        "- Tiny third-person low-angle follow & probe-lens depth: ride the invisible camera millimeters/centimeters off the surface right behind and slightly beside the tiny subject's shoulder or back, keeping their foreground silhouette sharp while a wide-angle close-focus lens looks steeply up past them with deep environmental context.",
        "- Continuous unbroken perspective transitions (Wide ↔ Micro without cuts): use ONE clean continuous camera vector bridged by concrete intermediate spatial landmarks along the single path, shifting depth-of-field and audio perspective smoothly together."
      );
    }
    return lines.join("\n");
  },
  example: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    if (continuousPerspectiveTransitionPattern.test(text)) {
      return "Example (continuous Wide → tiny third-person glide): In one continuous unbroken take, the camera starts at normal room height overlooking sunlit floorboards beside a sneaker, then swoops smoothly downward along a single steady track past the towering rubber sole until the lens skims millimeters above the oak grain right behind a tiny adult man's shoulder. Locked in grounded third-person low-angle wide-macro depth, his sharp silhouette and the colossal sneaker laces ahead remain spatially legible as audio shifts smoothly from quiet room ambience into crisp close sneaker taps under the deep low-frequency hum of the giant figure above.";
    }
    return "Example (micro-level wide glide): Invisible ultra-low-angle wide-macro camera skimming millimeters above textured wooden floorboards at fingertip height, gliding smoothly forward between towering table legs and the massive rubber edge of a sneaker while oversized dust motes drift through a low shaft of window light.";
  }
};

export const scaleCraftSkills: readonly H3PromptSkill[] = [
  scaleWorldCraftSkill,
  microCameraTransitionsSkill
];
