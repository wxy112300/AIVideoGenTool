import { extractH3DialogueLocks, extractH3VisibleTextLocks } from "../../../h3-dialogue.js";
import type { H3PromptSkill } from "./types.js";

const multiSubjectPattern = /(?:\b(?:two|three|several)\s+(?:people|men|women|girls|boys|friends|characters|figures|strangers|workers|actors)\b|\b(?:both\s+(?:of\s+them|men|women|girls|boys|characters)|couple|pair\s+of|each\s+other|one\s+another|side\s+by\s+side|hand(?:s|ing|ed)?\s+(?:over|him|her|it|the)|pass(?:es|ing|ed)?\s+(?:him|her|the)|convers(?:ation|ing)|argu(?:e|ing|ment)|face[- ]to[- ]face|crowd|passersby)\b|\b(?:tiny|shrunk(?:en)?|miniature|small)\s+(?:girl|woman|man|boy|person|human|adult)\b[\s\S]{0,160}\b(?:giant(?:ess)?|huge|massive|towering)\s*(?:girl|woman|man|boy|person|human)?\b|\b(?:giant(?:ess)?)\s*(?:girl|woman|man|boy|person|human)?\b[\s\S]{0,160}\b(?:tiny|shrunk(?:en)?|miniature|small)\s+(?:girl|woman|man|boy|person|human|adult)\b|两人|两个人|二人|三人|双人|多人|对方|彼此|互相|并排|递给|交给|接过|对视|争吵|对话|交谈|面对面|路人|围观|左侧[^。！？；;\n]{0,20}右侧|男子[^。！？；;\n]{0,25}(?:女子|男子|另一)|女子[^。！？；;\n]{0,25}(?:男子|女子|另一)|(?:小人|微缩|缩小)[^。！？；;\n]{0,40}(?:巨人|女巨人|巨娘|巨大)|(?:巨人|女巨人|巨娘|巨大)[^。！？；;\n]{0,40}(?:小人|微缩|缩小)|<Picture 1>[\s\S]{0,200}<Picture 2>|@R1[\s\S]{0,200}@R2)/iu;

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
    "- Spatial blocking, identity binding & 180° axis lock: each person is a separate individual—NEVER copy age, notes, or traits between characters. Pin each principal by screen zone (frame-left / center / frame-right, foreground vs background) + ONE locked handle instead of ambiguous 'she/her' in shared clauses, preserving left-right axis across camera moves.",
    "- Directed interaction events (WRONG → RIGHT): WRONG: 'they interact and exchange the key'. | RIGHT: write `actor → action → patient/object → contact surface → result → recovery` explicitly stating whose limb touches what and who is in front/on top so limbs and clothes never merge.",
    "- Eye-line coupling & turn-taking: lock gazes onto each other's face or the shared prop; while one speaks, show the listener's quiet focused stillness with closed lips before reacting.",
    "- Single-object prop handoff (3 beats, zero duplication): giver extends prop → both hands meet briefly at one shared contact point → giver releases and withdraws while receiver takes the weight.",
    "- Background separation: keep passersby subordinate in muted clothes so they never clone the principals."
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
    "- Observable physiological beats (WRONG → RIGHT): WRONG: 'she looks deeply shocked'. | RIGHT: restrained physical micro-cues—subtle eyelid tightening, soft brow knit/release, a slowed blink, faint swallow, jaw unclenching, slight lip parting, and a quiet nasal exhale.",
    "- Natural reaction latency & gradual arc: include a real 0.3–0.5s beat after a trigger—eyes lock on, breathing pauses briefly, and the expression shifts gradually over 1–2s.",
    "- Subtextual body tells: pair facial nuance with small involuntary cues—fingers pausing on a cup or table edge, shoulders settling, or a slight chin dip."
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
    "- Dialogue & text verbatim: embed spoken lines inside the action timeline using the speaker's actual handle + speaker ID (e.g. `the young woman (S1) says: <d>[English] exact words</d>` or `the man in the coat (S1) says: <d>[Chinese] 原话</d>`), keeping speaker IDs stable and preserving exact original wording/punctuation. Include subtle jaw/lip articulation and breath settling; never invent unrequested lines.",
    "- Audio separation: diegetic sounds synchronized to their visible cause belong in the main timeline; ongoing room tone and environmental soundscape belong in `overall_soundscape:`; audience-only score belongs in `non_diegetic_music:` (use `N/A` when no score is requested or prohibited—never write 'no score' inside `overall_soundscape`)."
  ].join("\n")
};

export const performanceCraftSkills: readonly H3PromptSkill[] = [
  multiSubjectBlockingSkill,
  actingMicroExpressionsSkill,
  dialogueAudioSkill
];
