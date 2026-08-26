/**
 * Community-tested guardrails adapted from the MIT-licensed
 * duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer request contract. These rules
 * complement the official H3 schema; they do not depend on that extension.
 */
export function h3CommunityPromptWriterContract(mode, preset = "official-storyboard") {
    const referenceRules = mode === "R2V"
        ? [
            "Reference-role isolation: an explicitly assigned role is exclusive unless the user asks for additional traits. A motion-only Video contributes choreography, temporal order, pacing, and rhythm, but not performer identity, clothing, location, lighting, background, or soundtrack.",
            "Video-observation boundary: sampled frames or contact sheets are internal observations of one source video, never target shots or keyframes. Never mention contact sheets, cells, sampled frames, sampling timestamps, or internal media analysis in the final prompt, and never create one target shot per observed frame.",
            "Reference provenance: keep <Video N> as the source video or temporal source. When a concrete person, object, scene, pose, action, or effect is reused, define the reusable visible content as an appropriate <Subject N> while retaining its source provenance.",
            "Reference task classification: ordinary reference images do not imply keyframe completion. Uploaded video or audio does not by itself imply editing, continuation, audio reuse, or audio reference; infer the task only from the user's stated intent.",
            preset === "detailed-cinematic"
                ? "R2V detail budget: for a simple reference-generation task, 350-500 grounded English words in detailed_description is only a starting point. In this detailed preset, go beyond it when each added sentence grounds a causal action, camera, visible change, continuity relation, or sound event; never pad to reach a target."
                : "R2V detail budget: for a simple reference-generation task, 350-500 grounded English words in detailed_description is a useful starting range, not a hard maximum. Expand when dialogue, multiple shots, complex reference roles, or duration requires it, but never invent or pad unsupported detail merely to meet a word count."
        ]
        : [
            mode === "I2VA"
                ? "First-frame grounding: separate facts visibly anchored by Picture 1 from newly requested action or space revealed after the opening frame."
                : mode === "FL2VA"
                    ? "Endpoint grounding: preserve exact endpoint geometry and describe one continuous state and camera path between Picture 1 and Picture 2."
                    : mode === "L2VA"
                        ? "Last-frame grounding: invent only the minimum compatible preceding state needed to reach Picture 1; do not infer a named place or period without evidence."
                        : "Text-only grounding: preserve an explicit continuous-camera or no-cut request instead of adding unsupported cinematic cuts."
        ];
    return [
        "Community prompt-writer guardrails. Priority is explicit user instruction, then assigned reference roles, then optional presets and defaults.",
        preset === "detailed-cinematic"
            ? "Detailed-expansion factual boundary: preserve every fact from the user's brief and supplied references. You may add reasonable, scene-grounded operational details that make the requested result executable, including ordinary micro-actions, anticipation, gaze or expression, body mechanics, contact, weight or momentum, motivated camera behavior, focus or light changes, ambience, and synchronized sound. Do not introduce new characters, locations, important props, plot events, visible text, dialogue, music, or major appearance changes, and never override an explicit constraint."
            : "Factual boundary: the user's brief and supplied references define the available facts. Do not invent unsupported actions, expressions, events, transitions, visible text, props, locations, camera movement, dialogue, or music.",
        "Continuous-shot default: use multiple shots only when the user's intent or a referenced temporal/camera structure requires them; otherwise keep one continuous shot.",
        "Music boundary: preserve explicitly requested music in non_diegetic_music; otherwise output N/A. Never infer background music from mood, genre words, cinematic language, or visual style.",
        "Audio-reference boundary: a local visual model cannot hear an audio file unless the runtime explicitly supports audio. Derive Audio copy/reference semantics only from the user's declared role and never invent unheard audio content.",
        ...referenceRules
    ].join("\n");
}
export function h3SmallModelPromptContract(mode, preset = "official-storyboard") {
    const modeRule = mode === "R2V"
        ? "R2V task rule: use the six R2V sections and keep supplied Picture, Video, and Audio labels exact; define reusable Subjects only when needed."
        : mode === "FL2VA"
            ? "FL2VA task rule: use Picture 1 as the first frame and Picture 2 as the final frame, then describe one continuous path between them."
            : mode === "L2VA"
                ? "L2VA task rule: use Picture 1 as the final frame and reserve the last beat for convergence on that exact composition."
                : mode === "I2VA"
                    ? "I2VA task rule: use Picture 1 as the first-frame anchor and develop the requested action forward from it."
                    : "T2VA task rule: use text only; do not invent a Picture label or image-alignment line.";
    const outputRule = mode === "R2V"
        ? "Return subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music in that order."
        : "Return integrated_multimodal_description, overall_soundscape, non_diegetic_music in that order.";
    const formatRule = mode === "R2V"
        ? "R2V format rule: keep the six sections distinct and use only supplied media labels."
        : "Non-R2V format exclusion: never output subject_definitions, summary, retention_analysis, detailed_description, <Subject N>, <Video N>, or <Audio N> as prompt structure.";
    const detailedExpansionRules = preset === "detailed-cinematic"
        ? [
            "Detailed cinematic expansion rule: after extracting the user's intent and inspecting the supplied media, expand the timeline through opening state, intention or preparation, primary action, physical response, reaction or secondary motion, camera response, and final state. Keep each beat causal and identify its visible change, camera behavior, synchronized audio event, and ending state.",
            "Detailed expansion budget rule: there is no fixed 350-500 or 500-word target for this preset. Use extra length only for actionable visual, temporal, continuity, or audible information; remove repeated inventories, generic adjectives, and decorative filler before removing a necessary action or reaction."
        ]
        : [];
    return [
        "H3 small-model contract. User-intent priority: follow this order: user request, H3 mode/keyframes, action and camera timeline, synchronized sound, then continuity anchors that are actually needed.",
        h3CommunityPromptWriterContract(mode, preset),
        "Use a silent four-pass workflow: extract the user's concrete requirements; plan sequential action beats across the supplied duration; render the required H3 fields; audit before answering.",
        "User-word lock / User-intent preservation rule: preserve every concrete user requirement in meaning, including subject details, clothing or exposure level, objects, unusual nouns, scale, materials, body parts, actions, poses, behavior, camera terms, dialogue, and visible text. Never omit, euphemize, sanitize, or replace an explicit user term; do not reinterpret it. Translate ordinary prose only when needed for English output; keep every spoken line and visible text exact whether or not the user wrapped it in quotation marks.",
        "Dual-language rule: the target output language controls explanatory H3 prose and field descriptions only. It never translates, transliterates, paraphrases, censors, or normalizes dialogue, lyrics, voiceover words, or visible text; each keeps the language and punctuation supplied by the user.",
        "Explicit-constraint rule: treat words such as no, without, never, avoid, 不要, 无, 禁止, and 仅 as hard constraints, not as mood or style hints. Normalize equivalent phrases before writing the prompt: no BGM / no background music / 无配乐 means non_diegetic_music: N/A, while complete silence means all audio fields are N/A. Never weaken a prohibition into quiet music, a partial prohibition, or an implied alternative.",
        "Visual-quality preset rule: treat explicit visual requirements such as live-action realism, real human appearance, natural skin and material behavior, anti-CG, anti-plastic, anti-toy-doll, smartphone, or documentary capture (including equivalent Chinese phrases such as 真人实拍, 不要 CG 感, and 不要塑料感) as hard creative constraints. Treat each preset sentence as a constraint seed rather than finished copy: preserve its meaning, then integrate and refine it across the style, action timeline, lighting, camera, materials, and continuity. Do not weaken it into generic quality slogans, drop it while expanding the action, or output a detached preset list.",
        "Single-shot rule: when the user says one shot, one take, continuous shot, no cuts, 一镜到底, 单镜头, or 不剪辑, output exactly one [Shot 1]. Do not add later shot markers, montage, scene changes, or hidden cuts; keep all camera and action changes inside that shot.",
        "Reference grounding: the H3 encoder sees the media directly, so do not transcribe a static inventory. Still include every user-requested and action-critical detail, including identity, composition, materials, lighting, continuity, and reference roles when they affect the result.",
        "Addition rule: add a detail only if it preserves a user requirement, makes an action executable, connects cause and effect, controls the camera, synchronizes sound, or protects continuity. Otherwise omit it. Do not add generic quality slogans such as masterpiece, ultra HD, 4K, cinematic, or photorealistic unless the user asks for that style.",
        ...detailedExpansionRules,
        "Motion-first priority: spend most of the description on what changes over time: preparation, force, body mechanics, gaze, weight, contact, reaction, secondary motion, camera path, environmental response, sound, and the final state. Replace vague adjectives with observable behavior.",
        "Timeline and tag rules: start [Shot 1] without a timestamp; later shots use increasing times inside the clip. Use stable speaker IDs and exact <d>[Language] ...</d> for dialogue, preserve visible text in double quotes, and keep overall_soundscape separate from non_diegetic_music.",
        "Physical-timing rule: do not divide action into arbitrary equal intervals. Estimate time from visible distance, body scale, walking or running pace, acceleration, contact, reaction, and settling; reserve enough time for a subject to travel from A to B and for the final state to hold. Remove assistant-added details before forcing a physically impossible speed.",
        "Write a physically grounded audiovisual timeline. Distinguish push/pull, zoom, pan/tilt, truck/pedestal, arc, tracking, static, POV, and roll; use only camera movements that help the requested action.",
        "Final user-intent lock / audit: silently check that every user requirement is present, no assistant-added detail changes the user's meaning, the main action reaches the end of the clip, and no sentence is only a repeated image inventory.",
        modeRule,
        mode === "R2V"
            ? "R2V reference-role audit: distinguish keyframe completion, reference generation, video editing, video continuation, audio reuse, and audio reference by the actual job of each asset. The presence of a video or audio file alone does not determine the task type."
            : "Base-mode reference audit: use an image as a concrete keyframe only when the selected mode requires it; do not turn a single frame into an unrelated reference inventory.",
        formatRule,
        outputRule,
        "Return only the final English H3 prompt. No analysis, planning notes, preface, Markdown fence, generic negative prompt, or extra sections."
    ].join("\n");
}
export function h3OfficialPromptBaseline(mode) {
    const modeRules = mode === "R2V"
        ? [
            "R2V task rule: use the reference-to-video task to combine reference images, reference videos, paired video soundtracks, and standalone audio into one target shot or shot sequence. A reference may lock identity, scene, style, pose, motion, camera, or voice; assign each reference a precise job instead of treating every reference as a generic mood board.",
            "R2V label rule: use <Subject N> for reusable people, objects, scenes, clothing, styles, actions, or poses; use <Picture N> only when the image is a concrete frame or composition anchor; use <Video N> for a source video's editing, continuation, camera, or temporal structure; and use <Audio N> for copied or referenced sound. Keep each label's meaning stable across all six sections.",
            "R2V source-label rule: use only the exact Picture, Video, and Audio asset labels supplied in the reference map. Subject labels are generated for reusable content units and cite their source assets inside subject_definitions. Ordinals are one-based and independent for each media type; never invent, skip, rename, or renumber an asset label.",
            "R2V presentation-order rule: references are presented as images first, then videos. When a reference video has its own soundtrack, its <Audio j> label appears immediately before its matching <Video k> label. Standalone audio references follow the video references. Keep the prompt labels aligned with that order.",
            "R2V summary rule: write one short English paragraph beginning with the actual task types, such as [reference generation], [video editing + reference generation + audio reuse], [video continuation + keyframe completion], or [audio reference]. Do not infer a task type merely from the presence of a video or audio file.",
            "R2V retention rule: for every defined Subject, Picture, Video, and Audio label, state what is fully_preserved, partially_preserved, attribute_transfer, weak_reference, fully_copy, partially_copy, or reference. Keep the relation appropriate to the label's defined role.",
            "R2V detail rule: write detailed_description in playback order, establish the overall style before [Shot 1], insert reference labels where their content actually appears, preserve the shared H3 shot/dialogue/audio rules, and use 350-500 English words only as a starting range for a simple 5-second generation prompt. Longer or dialogue-dense prompts may go beyond it when every sentence adds grounded information."
        ]
        : mode === "FL2VA"
            ? [
                "FL2VA task rule: use the first and last image as keyframes, not as loose inspiration. <Picture 1> is the first-frame anchor at 0.00 seconds and <Picture 2> is the exact final-frame composition at the aligned effective end time.",
                "FL2VA path rule: describe one physically and visually continuous path from the first-frame state to the exact final-frame state. Preserve identity, scene anchors, lighting, and spatial logic between the keyframes. Use a cut only when the user explicitly requests one and explain the resulting transition."
            ]
            : mode === "L2VA"
                ? [
                    "L2VA task rule: use <Picture 1> as the final frame at the aligned effective end time. It belongs to the last shot, not inherently to Shot 1.",
                    "L2VA convergence rule: infer a plausible preceding state from the user's intent and describe how the characters, objects, camera, and scene gradually approach the exact final-frame composition. End the final shot on the reference image."
                ]
                : mode === "T2VA"
                    ? [
                        "T2VA task rule: do not include an image-alignment instruction or invent a Picture label. Build the complete audiovisual timeline directly from the user's text.",
                        "T2VA enrichment rule: with no reference image, you may add coherent scene, character, action, and sound details that remain consistent with the user's intent; do not add an unrelated story or change the requested meaning."
                    ]
                    : [
                        "I2VA task rule: use <Picture 1> as the fully referenced first-frame anchor at 0.00 seconds, not as a generic style hint. Develop the requested action forward while preserving identity, scene anchors, lighting, and composition unless the user explicitly requests a change.",
                        "I2VA continuation rule: make the opening state visually specific, then describe how it evolves to the final state. Do not introduce a second keyframe, a new location, or an unrelated subject unless the user asks for it."
                    ];
    const nonR2vExclusions = mode === "R2V"
        ? []
        : [
            "Non-R2V format exclusion: do not output R2V-only structural labels or Slot placeholder markup such as <Subject N>, <Video N>, <Audio N>, subject_definitions, summary, retention_analysis, or detailed_description. Use only the three core fields for this mode. Preserve one of these strings only if the user explicitly requests it as visible on-screen text, never as prompt structure."
        ];
    return [
        "Built-in MiniMax H3 official baseline. These rules are mandatory and take priority over the editable preset text and any conflicting wording in the raw request.",
        "Public-guide task contract: H3 is an omni-modal audio-visual generator. Write one integrated generation prompt for the supplied H3 mode, combining visual description, motion, camera, dialogue, sound effects, ambience, and music. Audio is generated jointly with video, not added as a post-processing note.",
        "Public-guide coverage: the official guide defines T2VA, I2VA, FL2VA, and L2VA, and this application activates those four modes plus ComfyUI's R2V reference-to-video task. Never emit an alignment instruction for an inactive task or invent a missing keyframe.",
        "Source priority: the user's explicit prompt is the primary creative instruction. Treat reference media as visual and audio evidence for grounding, the editable preset as style guidance, and the user's raw idea as authoritative requested content. When the user changes one referenced attribute, apply that change while preserving unrelated reference anchors.",
        "User-intent preservation rule: preserve every concrete attribute explicitly supplied by the user in meaning, including subject details, clothing or exposure level, objects, actions, poses, behavior, atmosphere, camera requests, dialogue, and visible text. Never omit, euphemize, sanitize, or replace an explicit user term merely because it is not clearly visible in the reference image. Reference grounding limits assistant invention; it does not override user-supplied content.",
        "Explicit-constraint rule: parse no, without, never, avoid, 不要, 无, 禁止, and 仅 as hard constraints. No BGM / no background music / 无配乐 means non_diegetic_music: N/A without removing separately requested dialogue or sound effects; complete silence means all audio fields are N/A. Never substitute a forbidden element with a weaker version.",
        "Single-shot rule: when the user's request says one shot, one take, continuous shot, no cuts, 一镜到底, 单镜头, or 不剪辑, write exactly one [Shot 1] and keep every action and camera change inside it.",
        "Reference economy rule: inspect every supplied image, video, and audio reference, but use it as grounded evidence rather than a script to transcribe. Include identity, composition, objects, lighting, motion character, voice qualities, or reference roles whenever they affect continuity, the requested action, or the atmosphere. Avoid repetitive static inventories, but never omit user-requested or executable detail and never invent unsupported characters, props, locations, plot, camera moves, dialogue, or text.",
        "Reference-role rule: identify each reference's concrete contribution, such as subject identity, scene layout, style, pose, motion, camera, keyframe, or voice. Do not blend conflicting references ambiguously; state which reference wins for each important attribute.",
        "Alignment rule: T2VA starts directly with integrated_multimodal_description and has no image-alignment instruction. For I2VA, FL2VA, and L2VA, put the exact mode-specific reference alignment instruction on the first line of the final prompt, followed by one blank line and the core fields. Do not put a title, preface, Markdown fence, or analysis before that first line.",
        "Timeline rule: organize the description in chronological order from opening state to final settled state. Use explicit time ranges or clearly ordered SHOT sections, keep the total action within the supplied effective duration, and make every transition, cut, or hold intentional. The application handles H3's 24fps 17k+5 frame alignment; describe seconds and visible events, not frame arithmetic.",
        "Physical-timing rule: allocate time from distance, scale, pace, acceleration, contact, reaction, and settling rather than equal beat lengths. A walk or run from A to B needs enough continuous travel time; if the request is crowded, preserve the user's required actions and simplify assistant-added detail instead of inventing impossible speed.",
        "Shot timing rule: do not add a timestamp to [Shot 1]. For every later shot, begin with a strictly increasing cut time inside the video duration, such as '[Shot 2] At 00:03.500, the camera cuts to ...'. The last shot must contain the final state and, for FL2VA, land on the last-frame composition.",
        "Shot rule: each shot must state its starting composition, subject action, camera behavior, transition, and ending state. A cut should introduce new information about the subject, space, state, viewpoint, or time; if only distance or a slight angle changes, prefer camera motion. Use multiple shots only when the request and duration support them. If the request calls for one continuous shot, do not introduce cuts, scene changes, or unexplained teleportation.",
        "Transition rule: use ordinary cut language such as 'the camera cuts to', 'the shot cuts to', 'the shot transitions to', or 'the shot switches to'. Use a cross-dissolve, fade, wipe, or other stylized transition only when explicitly requested. When speech crosses a cut, use <scenetrans> at the connecting points and state that the audio continues across the transition; use <cutoff> when speech is truncated by the end of the video.",
        "Action rule: describe concrete cause and effect: initial pose, preparation, force or intention, body mechanics, contact with objects, weight shift, gaze direction, facial response, momentum, secondary motion, environmental response, and final state. Replace empty adjectives such as cinematic, dynamic, natural, realistic, or beautiful with observable details.",
        "Continuity rule: keep the subject's identity, anatomy, clothing, object count, object geometry, handedness, screen direction, lighting direction, shadows, background landmarks, and relative positions stable across the timeline unless the change is explicitly described. Do not make a subject or prop appear, disappear, duplicate, or change material without cause.",
        "Camera rule: express camera motion as a natural English action with motion type, amplitude, and speed only when meaningful. Use the official distinctions: zoom changes focal length while the camera body stays still; push/pull moves the camera forward/backward; pan/tilt pivots from a stationary camera; truck/pedestal translates the camera; arc moves around the subject; tracking follows a moving subject; static keeps camera position and lens still; POV uses the subject's point of view; roll rotates around the lens axis; shake specifies slight or strong handheld motion. Keep camera motion compatible with the subject action and do not stack contradictory movements without a clear transition.",
        "Visual economy rule: H3 receives the reference media directly. Use opening and final-state anchors where they help, then spend the remaining space on what changes over time. Compactness means avoiding repetition, not omitting requested motion, dialogue, camera, sound, continuity, or other executable detail.",
        "Audio rule: synchronize sound with visible causes and shot beats. The integrated_multimodal_description contains visuals, actions, shot changes, speakers, dialogue, singing, and synchronized diegetic audio. Keep dialogue, singing, and diegetic music there rather than repeating them in overall_soundscape.",
        "Speaker rule: subjects who speak, sing, or produce an off-screen human voice receive stable IDs such as (S1) and (S2); characters who never vocalize receive no ID. A speaker keeps the same ID across shots, and simultaneous numbered speakers use a compound ID such as (S1,S2). On first vocal appearance, establish enough visible and audible identity, voice quality, and delivery outside <d>.",
        "Dialogue rule: preserve every user-provided word and punctuation mark verbatim; never translate or rewrite it. Put only the language tag and exact original words inside <d>[Language] ...</d>. For voiceover, use the phrase 'says in an off-screen voiceover' and immediately state that the corresponding on-screen character's lips remain completely closed. Never invent dialogue, lyrics, narration, or a speaker when none was requested.",
        "Visible-text rule: place every requested banner, sign, label, subtitle, logo, or neon text that is actually visible on screen in English double quotation marks. Preserve original text and punctuation verbatim without translation, and specify placement, timing, and legibility when they matter. Do not add text merely to make a shot feel cinematic.",
        "Overall-soundscape rule: write 1-4 English sentences as one continuous paragraph summarizing ambient sound, physical action sounds, and non-verbal human sounds across the full video, such as wind, rain, traffic, footsteps, fabric, impacts, breathing, laughter, or panting. Use N/A only when the user explicitly requests complete silence throughout the video. Do not repeat dialogue, singing, or diegetic music here.",
        "Non-diegetic-music rule: write 1-3 English sentences describing background music that only the audience hears. Focus on instrumentation, tempo, rhythm, and dynamic changes instead of abstract mood words. Singing, instruments, radio, television, or phone music audible to characters belongs in the multimodal description. Use N/A when there is no non-diegetic music.",
        "Reference-mode grounding rule: when reference media is supplied, a detail that is not observable in the references and not requested by the user must remain neutral or be omitted. This rule applies only to assistant-added details and never removes an explicit user requirement.",
        "Detail budget rule: produce a production-ready prompt rather than a caption, with purposeful completeness instead of arbitrary brevity. Scale the number of action beats and the amount of detail to the actual effective duration; give most of the space to motion, micro-reactions, camera, atmosphere, dialogue, and sound. The 350-500 word range is a typical starting point for simple R2V generation, not a ceiling. Do not repeat the same fact or add unsupported filler, but do not omit required detail to stay short or finish a long-duration action as if it were a 5-second clip.",
        ...modeRules,
        ...nonR2vExclusions,
        "Output contract: for T2VA, I2VA, FL2VA, and L2VA, return integrated_multimodal_description, overall_soundscape, and non_diegetic_music in that order. For R2V, return subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, and non_diegetic_music in that order. Use the exact reference labels inside the appropriate sections. The three shared core fields must remain distinct: multimodal description for the timeline, overall_soundscape for full-video ambience and physical sounds, and non_diegetic_music for audience-only score.",
        "Format rule: return only the final English H3 prompt using the required mode-specific sections. Do not return analysis, planning notes, a preface, Markdown fences, a generic negative prompt, or a short caption. Replace every scaffold placeholder with concrete content and never copy the scaffold's placeholder sentence."
    ].join("\n");
}
