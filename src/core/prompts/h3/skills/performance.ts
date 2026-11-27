import { extractH3DialogueLocks, extractH3VisibleTextLocks } from "../../../h3-dialogue.js";
import type { H3PromptSkill } from "./types.js";

const multiSubjectPattern = /(?:\b(?:two|three|several)\s+(?:people|men|women|friends|characters|figures|strangers|workers|actors)\b|\b(?:both\s+(?:of\s+them|men|women|characters)|couple|pair\s+of|each\s+other|one\s+another|side\s+by\s+side|hand(?:s|ing|ed)?\s+(?:over|him|her|it|the)|pass(?:es|ing|ed)?\s+(?:him|her|the)|convers(?:ation|ing)|argu(?:e|ing|ment)|face[- ]to[- ]face|crowd|passersby)\b|两人|两个人|二人|三人|双人|多人|对方|彼此|互相|并排|递给|交给|接过|对视|争吵|对话|交谈|面对面|路人|围观|左侧[^。！？；;\n]{0,20}右侧|男子[^。！？；;\n]{0,25}(?:女子|男子|另一)|女子[^。！？；;\n]{0,25}(?:男子|女子|另一)|<Picture 1>[\s\S]{0,200}<Picture 2>|@R1[\s\S]{0,200}@R2)/iu;

const emotionActingPattern = /(?:\b(?:shock(?:ed)?|surpris(?:ed|ing)|angry|furious|sad|heartbroken|crying|tears?|weep(?:s|ing)?|shy|embarrassed|nervous|anxious|scared|terrified|relieved|hesitat(?:e|es|ing|ion)|guilty|suspicious|bittersweet|smile\s+fades|realization|micro[- ]?expression|subtle\s+(?:expression|reaction)|emotional|holding\s+back\s+tears|frown(?:s|ing)?|bites?\s+(?:her|his|their)\s+lip)\b|震惊|惊讶|生气|愤怒|难过|悲伤|委屈|落泪|含泪|流泪|哭|害羞|尴尬|紧张|害怕|惊恐|松了口气|犹豫|愧疚|怀疑|苦笑|笑意收敛|笑容消失|愣住|微表情|情绪|眼神(?:变化|闪烁|躲闪)?|欲言又止|深呼吸|咬唇|皱眉|沉默对视)/iu;

const soundCuePattern = /(?:\b(?:sound|audio|music|score|soundtrack|voice|dialogue|speech|speak|sing|singing|lyrics|ambience|ambient|footsteps?|breathing|whisper|scream|impact|echo|silence|silent|muted?)\w*\b|声音|音频|音乐|配乐|音轨|人声|对白|对话|说话|演唱|歌词|环境声|脚步|呼吸|耳语|尖叫|撞击声|回声|静音|无声)/iu;

export const multiSubjectBlockingSkill: H3PromptSkill = {
  id: "multi-subject-blocking",
  title: "Multi-Subject Blocking, Gaze Alignment & Prop Handoff",
  catalogHint: "two or more interacting people, eye-line alignment, turn-taking, or passing/handing a physical prop between characters",
  priority: 82,
  sharedWithLongVideo: true,
  matches: (ctx) => multiSubjectPattern.test(`${ctx.sourcePrompt}\n${ctx.supplementalContext}`),
  guidance: () => [
    "- Spatial blocking, identity binding & 180° axis lock (anti-identity-bleed): anchor every principal by screen position (frame-left / center / frame-right, foreground vs background) plus ONE consistent wardrobe/hair tag across every beat instead of ambiguous 'he/she/they', so faces, clothes, and spoken lines never swap; preserve left-right spatial axis across camera moves and cuts.",
    "- Eye-line coupling & turn-taking: keep eye-lines genuinely locked onto each other's face or the shared prop (never staring past each other). While one character speaks, describe the listener's quiet gaze focus and attentive stillness before they react or reply so mouths never move out of turn.",
    "- Single-object prop handoff (3 beats, zero duplication): stage every transfer cleanly—giver extends the prop → both hands meet briefly at one shared contact point → giver releases and withdraws while receiver takes the weight and settles it, conserving a single physical object throughout.",
    "- Principal vs background separation: keep background passersby or crowd figures visually subordinate with distinct muted clothing so they never clone or distract from the principals."
  ].join("\n"),
  example: "Example (clean blocking + 3-beat prop handoff): Medium two-shot across a café table: the woman in a cream cardigan sits frame-left while the man in a dark denim jacket sits frame-right, their eye-lines locked across the table. She slides a brass key forward with her right fingertips; his left hand meets the key at the center of the wood surface, their fingers briefly overlapping before she withdraws her hand and he draws the single key back into his palm while watching her face intently."
};

export const actingMicroExpressionsSkill: H3PromptSkill = {
  id: "acting-micro-expressions",
  title: "Restrained Micro-Expressions & Natural Acting Timing",
  catalogHint: "close-up facial acting, emotional reaction beat, restrained micro-expression, or subtle gaze shift",
  priority: 79,
  sharedWithLongVideo: true,
  matches: (ctx) => emotionActingPattern.test(`${ctx.sourcePrompt}\n${ctx.supplementalContext}`),
  guidance: () => [
    "- Observable physiological beats over abstract emotion labels (beats rubbery exaggerated AI faces): never rely on bare labels like 'deeply shocked' or 'very sad' alone. Translate inner emotion into restrained, physically real facial micro-cues—subtle eyelid tightening, soft brow knit or release, a slowed or double blink, faint throat swallow, jaw unclenching, slight lip parting, and a quiet exhale through the nose.",
    "- Natural reaction latency & gradual arc: stage a real 0.3–0.5s processing beat after a visual or spoken trigger—eyes focus on the trigger, breathing pauses briefly, and the expression shifts gradually over 1–2 seconds rather than snapping instantaneously.",
    "- Grounded subtextual body tells: pair quiet facial nuance with natural involuntary upper-body cues—fingers pausing or tightening slightly on a cup, sleeve, or table edge, shoulders settling a fraction, or a subtle chin dip—keeping performance lifelike and controlled."
  ].join("\n"),
  example: "Example (restrained micro-acting): Medium close-up in soft window light as the woman in a charcoal coat reads the folded note. Her eyes scan downward and stop; for half a second her breathing stills and her fingers tighten slightly along the paper edge. She blinks once slowly, her brow softening as a quiet exhale parts her lips, then lowers her gaze toward the tabletop while her shoulders drop gently."
};

export const dialogueAudioSkill: H3PromptSkill = {
  id: "dialogue-audio",
  title: "Dialogue, Lip-Sync & Causal Audio",
  priority: 75,
  sharedWithLongVideo: false,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    return ctx.preset === "dialogue-sound"
      || ctx.preset === "music-video"
      || extractH3DialogueLocks(ctx.sourcePrompt).length > 0
      || extractH3VisibleTextLocks(ctx.sourcePrompt).length > 0
      || soundCuePattern.test(text);
  },
  guidance: () => [
    "- Dialogue & text verbatim: embed spoken lines inside the action timeline as `named speaker (S1) says: <d>[Language] exact words</d>` using the English language tag ([Chinese], [English], [Japanese], etc.), keeping speaker IDs stable across the clip and preserving exact original wording/punctuation. Include subtle jaw/lip articulation and breath settling; never invent unrequested lines.",
    "- Audio separation: diegetic sounds synchronized to their visible cause belong in the main timeline; ongoing room tone and environmental soundscape belong in `overall_soundscape:`; audience-only score belongs in `non_diegetic_music:` (use `N/A` when no score is requested or prohibited—never write 'no score' inside `overall_soundscape`)."
  ].join("\n")
};

export const performanceCraftSkills: readonly H3PromptSkill[] = [
  multiSubjectBlockingSkill,
  actingMicroExpressionsSkill,
  dialogueAudioSkill
];
