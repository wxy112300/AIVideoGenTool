import { stripH3ContentFromSource } from "../../h3-dialogue.js";
import { parseH3Timecode } from "../../h3-temporal.js";
import { countPromptWords } from "../../prompt-count.js";
import type { H3PromptPreset } from "../../../types.js";

/** Authored Continuum List-mode writing pack tuned for Qwen 3.8 Flash Next + MiniMax H3. */

export function compileContinuumDetailText(page: { text: string; overall_soundscape?: unknown; non_diegetic_music?: unknown }): string {
  const soundFields = ["overall_soundscape", "non_diegetic_music"] as const;
  const extra = soundFields.flatMap(field => typeof page[field] === "string" && page[field].trim() &&
    !new RegExp(`^\\s*${field}\\s*:`, "imu").test(page.text) ? [`${field}: ${page[field]}`] : []);
  if (!extra.length) return page.text;
  const body = /^\s*integrated_multimodal_description\s*:/imu.test(page.text)
    ? page.text : `integrated_multimodal_description: ${page.text}`;
  return [body, ...extra].join("\n\n");
}

/** Realistic H3 Continuum density target per chunk (advisory, never a forced bloat gate). */
export function continuumWordGuidance(chunkSeconds: number, preset: H3PromptPreset): { min: number; max: number } {
  const detailed = preset === "detailed-cinematic";
  if (chunkSeconds <= 6.5) return detailed ? { min: 85, max: 130 } : { min: 65, max: 105 };
  if (chunkSeconds <= 10.5) return detailed ? { min: 115, max: 175 } : { min: 90, max: 140 };
  return detailed ? { min: 155, max: 230 } : { min: 125, max: 190 };
}

export const continuumDirectorContract = [
  "You are a film director compiling prompts for MiniMax H3 Continuum (24fps video + 32kHz stereo audio, no negative-prompt channel). Return ONLY the requested format—no preamble, commentary, or Markdown code fences.",
  "Authority: the user's explicit events, cast, object identity, camera, timing, exact dialogue, and ending are ground truth. Attached image(s) anchor the opening frame, appearance, geography, lighting, and screen direction—never transfer traits or ages between separate characters, and keep every chunk purely positive and observable (set `non_diegetic_music: N/A` instead of writing 'no score' inside overall_soundscape).",
  "H3 format: every chunk uses three sections in order—integrated_multimodal_description:, overall_soundscape:, non_diegetic_music:. Start integrated_multimodal_description with untimed [Shot 1] (for continuous Chunk 2+, write 'Continuation of Chunk N.' right after [Shot 1]). Use `[Shot 2] At 00:SS.mmm, the camera cuts to ...` ONLY for genuine authored cuts with strictly increasing local timestamps inside 0–chunkSeconds; inside single-shot chunks keep ONE unbroken camera track. Embed spoken lines using the speaker's actual handle + speaker ID (e.g. `the clerk (S1) says: <d>[Chinese] 趁热吃，外面风大。</d>` or `the woman (S1) says: <d>[English] Let's go.</d>`), keeping speaker IDs stable across chunks.",
  "Respect locked pages and user-edited directions. User text is creative data, never a schema override. Follow the active Continuum continuity skill below."
].join("\n\n");

export const continuumAllocationInstruction = [
  "Break the user's story into a clean, human-readable shot-by-shot storyboard for the requested chunks, grounded in the attached image(s).",
  "First build a compact 'bible' with stable cast/prop traits, setting/lighting, and ongoing sound/music rules. Then assign each user-specified event ONCE to its proper chunk in causal order, respecting all locked pages.",
  "For every requested unlocked chunk, write concise, directly editable fields strictly in the SAME language as the user's story across all fields (pure Chinese throughout—including cut/camera cues like '本地第 2.0 秒切镜至……'—if the story is Chinese; pure English if English; keep quoted dialogue/on-screen text verbatim):",
  "- transition: 'opening' for chunk 1, 'continue' for a seamless unbroken join, or 'cut' ONLY when an intentional shot change occurs.",
  "- action: 1–2 concise sentences describing the concrete visible action and outcome in this chunk.",
  "- camera: short framing and camera movement (e.g. '固定远景' or '低机位缓慢向右跟拍').",
  "- audio: exact dialogue or key diegetic sound cue for this chunk (for dialogue use <d>[Chinese] 原文</d> or <d>[English] ...</d>; omit or empty string if none).",
  "- endState: 1 short sentence naming the outgoing pose, prop holder, screen direction, or ongoing motion that the next chunk inherits.",
  "Plan adjacent boundaries together so each chunk's action picks up cleanly from the previous endState. Keep each chunk physically performable for its duration—never cram too many actions into 5 seconds.",
  'Return strictly valid JSON: {"bible":{"cast":"...","setting":"...","sound":"..."},"skills":["optional-skill-id"],"segments":[{"pageId":"exact ID","transition":"opening|continue|cut","action":"...","camera":"...","audio":"...","endState":"..."}]} covering every requested unlocked pageId once in order (omit "skills" or leave [] if no extra craft skills are needed).'
].join("\n");

export const continuumDetailExamples = [
  "EXAMPLES OF EFFECTIVE CONTINUUM PROMPTS (concise, concrete, positive-only, smooth handoff):",
  "Example 1 — Continuous 2 × 5s action without a cut:",
  "=== CHUNK demo-1 ===",
  "integrated_multimodal_description: [Shot 1] Medium side shot in warm afternoon light as the woman in a charcoal coat stands beside the wooden desk, her right hand gripping the brass drawer handle. She pulls the drawer steadily toward herself while the camera tracks slowly to the right at matching pace. Halfway open, the drawer glides forward with her elbow drawing back and her gaze lowering toward the opening gap.",
  "overall_soundscape: Dry wooden runner scraping softly against the frame, quiet room tone.",
  "non_diegetic_music: N/A",
  "=== CHUNK demo-2 ===",
  "integrated_multimodal_description: [Shot 1] Continuation of Chunk 1. Her right fingers remain wrapped around the brass handle as she finishes pulling the drawer fully open, the camera continuing its slow rightward track to follow her gaze down into the compartment. Inside rests a single silver key on dark felt; she releases the handle, reaches in smoothly with her right hand, and lifts the key clear of the drawer.",
  "overall_soundscape: The wooden scrape slows to a soft stop, followed by a light metallic click and quiet room tone.",
  "non_diegetic_music: N/A",
  "Example 2 — 6s chunk with one authored cut and verbatim dialogue:",
  "=== CHUNK demo-3 ===",
  "integrated_multimodal_description: [Shot 1] Eye-level medium shot across the rain-streaked shop counter. The aproned clerk slides a warm brown paper bag forward with both hands, looks up warmly, and the clerk (S1) says: <d>[Chinese] 趁热吃，外面风大。</d>",
  "[Shot 2] At 00:03.200, the camera cuts to a close-up of the customer's hands wrapping around the paper bag on the wooden counter as faint steam curls from the folded top.",
  "overall_soundscape: Steady rain tapping the storefront glass, crisp paper rustle, faint distant street hum.",
  "non_diegetic_music: N/A"
].join("\n");

export const continuumRequirementLabels = { "en-US": "Original requirements", "zh-CN": "原文要求", "zh-TW": "原文要求" } as const;

export const continuumApprovedBeatsInstruction =
  "Follow the user's original brief, story bible, and each chunk's approved direction. If a chunk has userEditedDirection=true, follow that edited direction over older notes. Carry ongoing motion, pose, prop contact, framing, and sound smoothly from the immediately preceding chunk's final state without replaying completed events.";

const detailHeadings = ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"] as const;
const detailMarkers = ["<<OPENING>>", "<<ACTION>>", "<<HANDOFF>>", "<<SOUNDSCAPE>>", "<<MUSIC>>"] as const;
const detailMarkerPattern = detailMarkers.join("|");
const detailMarkerToken = new RegExp(detailMarkerPattern, "iu");
const detailMarkerLine = new RegExp(`^[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*)?(${detailMarkerPattern})(?:\\*\\*)?[ \\t]*:?[ \\t]*$`, "gimu");
const chunkDelimiterLine = /^[ \t]*(?:#{1,6}[ \t]+)?(?:===+[ \t]*)?(?:CHUNK|PAGE)[ \t:]+([A-Za-z0-9_-]+)[ \t]*(?:===+)?[ \t]*$/gimu;

function continuumDetailSections(text: string) {
  const headings = [...text.matchAll(/^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*|__)?(integrated_multimodal_description|overall_soundscape|non_diegetic_music)(?:\*\*|__)?[ \t]*:/gimu)];
  return headings.map((heading, index) => ({
    name: heading[1]!.toLowerCase(), start: heading.index,
    body: text.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim()
  }));
}

/** Read only the relevant boundary of a compiled sampler prompt or an authored outline. */
export function continuumBoundaryExcerpt(text: string, edge: "opening" | "handoff"): string {
  const sections = continuumDetailSections(text);
  const timeline = sections.find(section => section.name === detailHeadings[0])?.body ?? text;
  const paragraphs = timeline.trim().split(/\r?\n[ \t]*\r?\n/u);
  const paragraph = edge === "opening" ? paragraphs[0]! : paragraphs.at(-1)!;
  if (paragraph.length <= 900) return paragraph;
  const sentences = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(paragraph)];
  return (edge === "opening" ? sentences.slice(0, 3) : sentences.slice(-3)).map(sentence => sentence.segment).join("").trim();
}

export function continuumCarriedAudio(text: string): { soundscape?: string; music?: string } {
  const sections = continuumDetailSections(text);
  const soundscape = sections.find(section => section.name === "overall_soundscape")?.body;
  const music = sections.find(section => section.name === "non_diegetic_music")?.body;
  return { ...(soundscape && { soundscape: soundscape.slice(-400) }), ...(music && { music: music.slice(-200) }) };
}

export function continuumAllocatedBeat(text: string): string | undefined {
  return text.match(/^(?:(?:\[(?:开场|開場|连续|連續|切镜|切鏡|Opening|Continue|Cut)\][ \t]*)?(?:画面|畫面|Action|Development|推进|推進)[:：])[ \t]*([^\n]+)/imu)?.[1]?.trim().slice(0, 360);
}

export function continuumOmitsScore(brief: string): boolean {
  return /\b(?:no|without) (?:background music|music|(?:musical )?score)\b|(?:无|無|不加|不要|禁用)(?:(?:旁白|对白|對白)[、，和及]\s*)*(?:配乐|配樂|背景音乐|背景音樂|音乐|音樂)|(?:没有|沒有)(?:[^。、，！？；：\s和及]{1,20}[、和及]\s*)*(?:配乐|配樂|背景音乐|背景音樂|音乐|音樂)/iu.test(brief);
}

export function formatContinuumStoryBible(bible: { cast?: unknown; setting?: unknown; sound?: unknown } | string | null | undefined, locale: "en-US" | "zh-CN" | "zh-TW" = "zh-CN"): string | undefined {
  if (typeof bible === "string") return bible.trim().slice(0, 2000) || undefined;
  if (!bible || typeof bible !== "object") return undefined;
  const labels = locale === "en-US" ? ["Cast", "Setting", "Sound"]
    : locale === "zh-TW" ? ["角色與道具", "場景與光線", "聲音基調"] : ["角色与道具", "场景与光线", "声音基调"];
  const rows = [bible.cast, bible.setting, bible.sound]
    .map((value, index) => typeof value === "string" && value.trim() ? `${labels[index]}：${value.trim()}` : "")
    .filter(Boolean);
  return rows.length ? rows.join("\n").slice(0, 2000) : undefined;
}

export function formatContinuumAllocationBeat(
  page: { transition?: unknown; action?: unknown; camera?: unknown; audio?: unknown; endState?: unknown;
    opening?: unknown; development?: unknown; handoff?: unknown; suggestion?: unknown },
  locale: "en-US" | "zh-CN" | "zh-TW" = "zh-CN"
): string | null {
  const clean = (v: unknown, max = 900) => typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : "";
  const action = clean(page.action);
  if (action) {
    const camera = clean(page.camera, 400);
    const audio = clean(page.audio, 500);
    const endState = clean(page.endState, 500);
    const transitionRaw = typeof page.transition === "string" ? page.transition.trim().toLowerCase() : "";
    const tagMap = locale === "en-US"
      ? { opening: "[Opening]", continue: "[Continue]", cut: "[Cut]" }
      : locale === "zh-TW"
        ? { opening: "[開場]", continue: "[連續]", cut: "[切鏡]" }
        : { opening: "[开场]", continue: "[连续]", cut: "[切镜]" };
    const tag = transitionRaw === "cut" ? tagMap.cut : transitionRaw === "opening" ? tagMap.opening : transitionRaw === "continue" ? tagMap.continue : "";
    const [actionLabel, cameraLabel, audioLabel, endLabel] = locale === "en-US"
      ? ["Action: ", "Camera: ", "Audio: ", "End: "]
      : locale === "zh-TW"
        ? ["畫面：", "鏡頭：", "聲音：", "段尾："]
        : ["画面：", "镜头：", "声音：", "段尾："];
    const lines = [
      `${tag ? `${tag} ` : ""}${actionLabel}${action}`,
      ...(camera ? [`${cameraLabel}${camera}`] : []),
      ...(audio && !/^(?:n\/a|none|无|無|-)$/iu.test(audio) ? [`${audioLabel}${audio}`] : []),
      ...(endState ? [`${endLabel}${endState}`] : [])
    ];
    return lines.join("\n");
  }
  // Backwards-compatible fallback for older opening/development/handoff responses.
  const opening = clean(page.opening), development = clean(page.development), handoff = clean(page.handoff);
  if (!opening || !development || !handoff) return null;
  const [lOpen, lDev, lHand, lSug] = locale === "en-US"
    ? ["Opening: ", "Development: ", "Handoff: ", "AI suggestion: "]
    : locale === "zh-TW"
      ? ["開場：", "推進：", "交接：", "AI 建議："]
      : ["开场：", "推进：", "交接：", "AI 建议："];
  const suggestion = clean(page.suggestion, 400);
  return [`${lOpen}${opening}`, `${lDev}${development}`, ...(suggestion ? [`${lSug}${suggestion}`] : []), `${lHand}${handoff}`].join("\n\n");
}

function normalizeCutSyntax(body: string): string {
  let result = body.replace(/(?:^|[ \t]+)At[ \t]+(\d{1,2}:[0-5]\d(?:\.\d{1,3})?),[ \t]*(\[Shot \d+\])[ \t]+/gimu, "\n\n$2 At $1, ").trim();
  const timedCut = /(?:^|(?<=[.!?])\s+)At[ \t]+(\d{1,2}:[0-5]\d(?:\.\d{1,3})?),[ \t]+(?=the camera cuts (?:to|from)\b)/giu;
  const declaredCuts = [...result.matchAll(/\bcamera cuts (?:to|from)\b/giu)];
  if (!/\[Shot [2-9]\]/iu.test(result) && declaredCuts.length === 1) {
    result = result.replace(timedCut, "\n\n[Shot 2] At $1, ").trim();
  }
  return result;
}

export function formatContinuumDetail(text: string, omitScore = false): string | null {
  text = text.replace(/\r\n?/gu, "\n").trim();
  if (!text) return null;
  const continuation = /^Continuation of Chunk \d+\.[ \t]*\n[ \t\n]*/iu.exec(text);
  const markedText = continuation ? text.slice(continuation[0].length) : text;
  const markers = [...markedText.matchAll(detailMarkerLine)];
  if (markers.length || detailMarkerToken.test(text)) {
    const order = markers.map(marker => marker[1]?.toUpperCase()).join();
    const leadingOpening = order === detailMarkers.slice(1).join() && /^(?:Continuation of Chunk \d+\.|\[Shot 1\])/iu.test(markedText)
      ? markedText.slice(0, markers[0]?.index).trim() : "";
    if (!leadingOpening && (markers[0]?.index !== 0 || order !== detailMarkers.join())) return null;
    const bodies = [
      ...(leadingOpening ? [leadingOpening] : []),
      ...markers.map((marker, index) => markedText.slice(marker.index + marker[0].length, markers[index + 1]?.index).trim())
    ];
    if (omitScore && !bodies[4]) bodies[4] = "N/A";
    if (bodies.some(body => !body || detailMarkerToken.test(body))) return null;
    const opening = bodies[0]!;
    const withoutFirstShot = opening.replace(/^(Continuation of Chunk \d+\.\s*)?\[Shot 1\][ \t]*/iu, "$1").trim()
      .replace(/^At 00:00(?:\.0{1,3})?,[ \t]+([a-z])/iu, (_cue, first: string) => first.toUpperCase());
    if (!withoutFirstShot || /^\[Shot \d+\]/iu.test(withoutFirstShot)) return null;
    const firstShot = continuation && !/^Continuation of Chunk \d+\./iu.test(withoutFirstShot)
      ? `${continuation[0].trim()} ${withoutFirstShot}` : withoutFirstShot;
    const action = normalizeCutSyntax(bodies[1]!);
    const fields = [[`[Shot 1] ${firstShot}`, action, bodies[2]].join("\n\n"), ...bodies.slice(3)];
    return detailHeadings.map((heading, index) => `${heading}: ${fields[index]}`).join("\n\n");
  }
  const sections = continuumDetailSections(markedText);
  if (sections.length) {
    const map = new Map<string, string>();
    for (const section of sections) {
      if (map.has(section.name)) return null;
      map.set(section.name, section.body);
    }
    let main = map.get(detailHeadings[0]) ?? "";
    const soundscape = map.get(detailHeadings[1]) ?? "";
    let music = map.get(detailHeadings[2]) ?? "";
    if (!music && omitScore) music = "N/A";
    if (!main || !soundscape || !music) return null;
    main = main.replace(/^(Continuation of Chunk \d+\.\s*)?\[Shot 1\][ \t]*/iu, "$1").trim()
      .replace(/^At 00:00(?:\.0{1,3})?,[ \t]+([a-z])/iu, (_cue, first: string) => first.toUpperCase());
    if (continuation && !/^Continuation of Chunk \d+\./iu.test(main)) {
      main = `${continuation[0].trim()} ${main}`;
    }
    main = normalizeCutSyntax(main);
    return [
      `${detailHeadings[0]}: [Shot 1] ${main}`,
      `${detailHeadings[1]}: ${soundscape}`,
      `${detailHeadings[2]}: ${music}`
    ].join("\n\n");
  }
  return text;
}

/** Parse streamed or complete `=== CHUNK <pageId> ===` blocks. */
export function parseContinuumChunkBlocks(raw: string): Array<{ pageId: string; rawText: string }> {
  const normalized = raw.replace(/\r\n?/gu, "\n");
  const matches = [...normalized.matchAll(chunkDelimiterLine)];
  if (!matches.length) return [];
  return matches.map((match, index) => ({
    pageId: match[1]!.trim(),
    rawText: normalized.slice(match.index! + match[0].length, matches[index + 1]?.index).trim()
  }));
}

export function continuumDetailTimelineWords(text: string): number {
  const timeline = continuumDetailSections(text).find(section => section.name === detailHeadings[0])?.body;
  return timeline ? countPromptWords(stripH3ContentFromSource(timeline)) : 0;
}

export function continuumDetailFormatIssues(text: string, duration: number): string[] {
  const sections = continuumDetailSections(text);
  const timeline = stripH3ContentFromSource(sections[0]?.name === detailHeadings[0]
    ? sections[0].body : text.slice(0, sections[0]?.start));
  const times = [...timeline.matchAll(/\b(?:at|by|from|to|until)[ \t]+(\d{1,2}:[0-5]\d(?:\.\d{1,3})?)(?![\d:.])/giu)]
    .map(match => parseH3Timecode(match[1]!));
  const issues: string[] = [];
  if (sections[0]?.start !== 0 || sections.map(section => section.name).join() !== detailHeadings.join() ||
      sections.some(section => !section.body)) {
    issues.push("Include all three H3 fields in exact order: integrated_multimodal_description:, overall_soundscape:, and non_diegetic_music:.");
  }
  if (times.some(seconds => seconds !== undefined && seconds > duration + 0.001)) {
    issues.push(`Use only local timecodes inside 0–${duration}s (never the whole-film clock).`);
  }
  const shots = [...timeline.matchAll(/\[Shot (\d+)\]/giu)];
  const declaredCut = /\b(?:camera|shot) (?:cuts|switches) (?:to|from)\b|\bauthored cut occurs\b/iu.test(timeline);
  let previousCut = 0;
  const invalidCut = shots.slice(1).some((shot, index) => {
    const cue = /^\s*At[ \t]+(\d{1,2}:[0-5]\d(?:\.\d{1,3})?)[ \t]*,/iu.exec(timeline.slice(shot.index! + shot[0].length));
    const seconds = cue ? parseH3Timecode(cue[1]!) : undefined;
    if (Number(shot[1]) !== index + 2 || seconds === undefined || seconds <= previousCut || seconds >= duration) return true;
    previousCut = seconds;
    return false;
  });
  if (invalidCut || (declaredCut && shots.length < 2)) {
    issues.push("Mark every authored cut as [Shot 2] At 00:SS.mmm, the camera cuts to ... with strictly increasing local times inside this chunk.");
  }
  return issues;
}

export function continuumDetailInstruction(chunkSeconds: number, preset: H3PromptPreset = "detailed-cinematic", singlePageText = false): string {
  const words = continuumWordGuidance(chunkSeconds, preset);
  return [
    `Write ready-to-sample English MiniMax H3 prompts ONLY for the requested page IDs. Each chunk is ${chunkSeconds} seconds on its own LOCAL clock (0–${chunkSeconds}s). Keep integrated_multimodal_description focused and executable—roughly ${words.min}–${words.max} words per chunk, never padded with repetition or negative inventories.`,
    "Keep all descriptive prose and sound fields in English while preserving exact dialogue and on-screen text verbatim in their original language. Anchor the first chunk to the attached reference image(s); subsequent chunks seamlessly carry forward the pose, prop contact, camera momentum, and soundscape reached at the end of the prior chunk (starting with 'Continuation of Chunk N.' right after [Shot 1] unless an authored cut starts the chunk).",
    continuumApprovedBeatsInstruction,
    singlePageText
      ? "Return ONLY this single chunk as plain H3 text starting directly with 'integrated_multimodal_description: [Shot 1] ...', followed by 'overall_soundscape: ...' and 'non_diegetic_music: ...'. No JSON, no Markdown fences."
      : "Return each requested chunk in exact order using ONLY this plain-text block format (no JSON, no Markdown fences):\n=== CHUNK <exact pageId> ===\nintegrated_multimodal_description: [Shot 1] ...\noverall_soundscape: ...\nnon_diegetic_music: ..."
  ].join("\n\n");
}
