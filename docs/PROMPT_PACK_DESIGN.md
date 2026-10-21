# Prompt Pack Design

Prompt Packs own model-facing prompt content and the localized indexes that expose it in the UI.

## Boundary

- `text` and preset bodies are model instructions. They remain English and are never translated.
- Snippet `group` and `label` are UI indexes. They are localized per Pack.
- Preset labels and descriptions are UI metadata. They are localized per Pack.
- Prompt toolbar/helper labels and notices are Pack-owned UI metadata. They are localized per Pack rather than added to the global UI key catalog.
- Prompt version fallback labels, such as a new video version or the original image-edit version, are Pack-owned UI metadata as well.
- User-provided prompt text, dialogue, lyrics, visible text, and saved custom preset bodies remain user content.
- Prompt Pack updates must not overwrite saved settings. Restore-default actions read the current Pack defaults explicitly.

## Loading Boundary

- Renderer modules use `src/renderer/prompt-packs.ts` instead of statically importing `src/core/prompts/index.ts`.
- Create and Settings rendering awaits the Pack loader; Queue and History do not load Prompt Pack content.
- Keep default Draft/image helpers that do not need prompt bodies outside `src/core/defaults.ts`, because that module is also consumed by Electron persistence and must not become a renderer dependency by accident.

## Structure

```text
src/core/prompts/
  types.ts
  index.ts
  h3/
    content.ts
    snippets.ts
    locale.zh-CN.ts
    locale.en-US.ts
    index.ts
  qwen-image-edit/
    content.ts
    locale.zh-CN.ts
    locale.en-US.ts
    index.ts
```

A model reuses an existing Pack through its model catalog `promptPackId`. A model with different prompt requirements gets a new Pack rather than adding model-specific branches to Create.

## Snippets

```ts
{
  id: "camera-push-in",
  groupId: "camera-motion",
  text: "The camera pushes in with small amplitude at slow speed toward the subject."
}
```

The locale file maps that stable ID to labels such as `慢速推近` or `Slow push-in`. The inserted value is always the English `text`.

H3 snippets are editable intent seeds, not complete prompts sent directly to the video model. Every snippet remains available in every H3 mode and passes through the selected prompt enhancer together with the user's surrounding text. The enhancer resolves its camera, sound, dialogue, scale, reference, and continuity meaning for T2VA/I2VA/FL2VA/L2VA/R2VA/Extend; do not hide or silently drop a snippet because one backend needs a different rendering.

Keep snippet text short, positive, and executable. Prefer a concrete subject action, camera path, sound source, or endpoint over a catalogue of failure concepts. Stable snippet IDs and the existing flat picker order are compatibility and UX contracts; changing model-facing wording does not require regrouping the picker.

## H3 visual-quality knowledge

`h3/visual-quality.ts` owns the optional photorealistic intent seed and model-facing visual knowledge. Complete H3 request compilers include this same knowledge separately from the compact execution control header: Strata's layered system contract, the generic compiler and Prompt Writer, including reference-auto and Extend; the legacy LM Studio compiler also retains it. The enhancer interprets the full brief, notes and assigned style references, selecting a few concrete skin/material/light/color/temporal attributes only when compatible with the requested medium. Preserve negation, subject scope, reference roles, keyframes, action and inherited continuation appearance. Animation, painting, CG, intentional gloss, hard light and fast motion must retain their authored meaning. Grain and shallow depth of field are optional looks, not automatic quality fixes.

The `visual-photorealistic-quality` quick insert is editable English intent with three localized indexes. Existing IDs/order and saved presets remain intact. No new negative field, runtime setting, forced suffix or global realism default is introduced: the current BasicGuider graphs have no independent negative conditioning. Targeted revisions retain their local edit boundary and image editing keeps its own Pack. [Sources and unmeasured quality limits](research/h3/2026-10-21-visual-quality.md).

## Per-request H3 output language

`src/core/prompt-language.ts` resolves an explicit positive opening authoring directive before the saved Chinese/English preference and automatic input-language fallback. Supported examples are a standalone `用英文` / `用中文` line or opening clause, `请用英文输出提示词：...`, `输出语言：英文`, `Use English. ...` and `Please write the prompt in Chinese. ...`. Keep the directive separate from the scene with a newline or punctuation. Consecutive conflicting opening language directives fail with an actionable error; duplicates of the same choice are harmless. This does not save a new default or add languages beyond Chinese/English.

Only complete opening clauses are recognized: never scan quoted speech, lyrics, visible text, code examples, references, local annotations or later scene sentences for a language keyword. Speech/subtitle instructions (`用英文说...`, `Use English dialogue`, `Write English subtitles`), negated or interrogative instructions and unsupported forms retain the existing backend/default behavior. The shared resolver drives Strata's final task and the multimodal node's `target_language` as well as prose instructions, preventing validator conflicts. Generic/native/PEFT H3 and Prompt Writer receive the same explicit override instruction; legacy LM Studio retains compatibility. Recognized directives remain in the editable source but are authoring metadata, never a video event or output prefix. H3 headings stay English; exact dialogue, lyrics, voiceover and visible text stay verbatim. Targeted revisions keep their fragment/splice boundary; image-edit Packs retain their separate language contract.

## Presets

Preset IDs remain stable for persisted Settings and history compatibility. Pack content owns the built-in English default bodies. Locale files only provide the preset label and description shown in Create and Settings.

The eleven H3 presets remain independent choices rather than composable groups: ten general choices plus the R2V-only multi-reference preset. Every ordinary preset first preserves the base prompt and mode/reference semantics. `detailed-cinematic` is an expansion contract: it retains every concrete source instruction and develops each action with grounded mechanics, reactions, camera behavior, timing, or causal sound; it must not become a concise rewrite. Single-shot behavior is a product-level default and is not owned solely by the single-shot preset.

`detailed-cinematic` also has an application-side acceptance gate. Its model-authored main timeline is checked after transport-envelope cleanup and before application-owned dialogue/camera/scale/continuity recovery. It must exceed both the duration/mode coverage floor and the source-prompt baseline; structural tags/timestamps and repeated filler do not supply expansion length. The Chinese/English prose comparison also guards against an effectively shorter character body when the descriptive script matches; dialogue/visible literals do not select the prose script. Generic source-word overlap is not an acceptance criterion: instruction wording and valid paraphrases must not cause rejection. Structure and length do not certify semantic completeness or topic preservation; concrete source instructions remain part of the model contract and require output evaluation. Duplicate timeline fields are rejected; multiple shots belong in one field. A failed gate does not create a new prompt version. This check is deliberately limited to the most-detailed preset; shorter presets and targeted annotation revisions retain their own density tradeoffs. Exact dialogue/visible-text handling and Strata's explicit numeric-timepoint checks are separate and remain unchanged.

## Strata thinking and layered H3 profiles

Strata prompt enhancement snapshots the saved `strataReasoningEffort` on each call: off/low/medium/high, default medium for old and new states. The control sits beside uncensored in prompt settings; saving affects the next enhancement without changing preparation identity, resident policy or reloading the model. Official 0.1.45 maps high and xhigh to the same level, so the UI does not invent a fifth strength. Image editing, text-only, auto seeds, targeted revisions and the bounded correction share this selection. Enabled thinking uses official thinking sampling and `reasoning_budget_tokens: 0` (automatic/no fixed cap); `answer_room` retains final-answer space. Off explicitly disables thinking and uses official non-thinking sampling, not a zero-token thinking budget. The existing automatic 32K output allowance and independent Agent/other backends remain unchanged. Actual streamed reasoning counts drive progress without exposing/persisting private reasoning. Diagnostics distinguish requested effort/budget and actual reasoning/content counts. Targeted revisions retain their fragment/splice contract.

Every complete Strata H3 rewrite uses the same `strataH3InstructionParts` compiler: T2VA, I2VA, FL2VA, L2VA, R2V and all Extend routes, including reference-auto and ordinary presets. There is no production mode-specific flat/layered fallback. Targeted revisions retain their separate fragment/splice contract; image editing retains its own Pack. Shared reference and trigger-based control rules apply to all H3 modes, including FL2VA's ordered endpoint correspondence. A system contract is separated from complete source/reference data and the saved low-priority style preference; the final task follows the visual attachments. Runtime context and image allowances are read from the same policy used for model loading, not separately copied per route. Extend uses the shared exact selected final-frame extraction; Strata does not resample earlier frames of that same source video. Additional named video references retain their silent keyframes and original Video numbering. Execution fields remain I2VA for boundary continuation, R2V for Motion Context and T2VA for native Continuum, not inferred from the number of images. An explicit flat-layout override exists only for internal evaluations, not UI routing.

Upstream API Monitor retains only the first 262144 characters of the raw request body. Serialize thinking/sampling/output controls before `messages` so image base64 cannot hide those controls from its Input pane. This is observability, not an inference change; a truncated Input missing a field does not prove it was not sent. Empty monitor reasoning still requires the matching inference metrics rather than being explained away by input truncation.

Strata requests automatically expand their output allowance from the base 8192-token video / 4096-token image-edit reservation to the remaining space in the loaded 32K context after actual tokenizer counts, visual tokens and safety slack. The base reservation must still fit; inputs are never shortened and the loaded context is not increased. A larger allowance does not require filling it. For complete H3 detailed expansion, an absent explicitly authored numeric timepoint permits one correction retaining the call's selected thinking setting with the full original context and candidate, then rechecks both the quality gate and timepoints; a second failure saves no version. Each call recalculates its own tokenizer/32K/output allowance, not an infinite retry. Numeric presence does not prove event identity, ordering or polarity. Other backends retain their instruction compilation; the automatic budget is Strata-only. Full inputs use the matching official tokenizer template before GPU loading, plus the existing visual/output/context reserves; no character estimate may independently veto an input that fits, and no silent truncation is allowed. Completion reason/token usage and reasoning/content character counts are diagnostic metadata, never raw model text. The automatic token allowance remains non-editable; these policies are not a general quality/latency guarantee.

## Strata Qwen Image 2.1 profile

The image editor retains its two preset IDs. Only Strata targeting the Qwen Image 2.1 family uses `qwen-image-2.1-edit-v1`: a separate system contract with image-first source data and authored editing recipes. Operation complexity controls useful detail; neither a universal minimum word count nor generic keyword overlap is an acceptance gate. Shared factory 2511 preset bodies are ignored only in this request profile, not removed from saved Settings; custom bodies remain subordinate guidance. Stable Picture IDs survive deleted slots and are remapped by the existing workflow compiler, including Paint guides. H3 and other providers keep their own contracts. See [sources, decisions and limits](research/qwen-image-21-strata-editing.md).

## Extend prompt profiles

Extend does not infer prompt format from the visible image slots alone. The application extracts the exact selected boundary frame for every visual enhancer, then chooses the H3 prompt contract from the execution workflow:

- FL2VA boundary continuation remains I2VA-shaped for the new segment. Its extracted boundary is the concrete first-frame anchor, so the final prompt begins with the official `<Picture 1>` first-frame alignment declaration and develops forward from that state.
- Continuum V3.8 native-state continuation is T2VA-shaped even though the enhancer receives an extracted boundary image for inspection. The sampler receives the preceding JointAV latent state directly; the image is analysis-only and must not create `<Picture N>`/`<Video N>` labels or a 0-second alignment declaration. Its timeline begins with the next physical and audible increment after the in-progress boundary, retains distinct subject/role ownership, and continues the existing camera framing, direction, velocity, and trajectory. Unless the user explicitly requests an editorial change, Continuum uses the hard single-shot contract and the final normalizer supplies the compact running-shot lock.
- Motion Context remains R2VA video continuation. `<Video 1>` is the locked source video carrying motion/audio context; the extracted boundary image is an enhancer-only inspection aid and must not create or renumber a `<Picture N>` execution reference.

All profiles preserve user-owned subject/action assignments and continue from the observed boundary state. Prompt format follows the execution workflow rather than the presence or absence of a UI Slot 1 image: FL2VA uses its boundary picture as an execution anchor, native Continuum uses its boundary image only for enhancer inspection, and Motion Context keeps the source video as its execution reference. History “继续创作” starts a fresh prompt-version branch: editing an existing History task restores only that task's prompt, while continuing from a media output clears the previous draft prompt so the first new user input becomes version one.

`annotation-revision` is a special editing workflow rather than a full-prompt expansion style. It requires one or more explicitly labeled inline notes, such as `（批注：……）`, `【修改：……】`, `[Note: ...]`, or `{Instruction: ...}`, immediately after the clause to revise. Bare parentheses remain prompt content. The enhancer asks the model for numbered replacement fragments only, then programmatically splices those fragments into the note-stripped approved draft. Missing, empty, unchanged, or malformed replacements fail closed and leave the original prompt untouched; model output outside the requested replacement tags is ignored. Reference media may resolve a marked identity, action, position, contact, or scale correction, but cannot widen the editable scope.

All H3 enhancer outputs pass through one envelope normalizer before version creation. It accepts the official plain-text fields as-is, unwraps a JSON object or common response wrapper when a backend emits one, and removes outer Markdown fences or Markdown emphasis around official field headings. The persisted prompt remains plain H3 text; JSON and Markdown presentation syntax are never part of the prompt version.

An empty editor entry is a placeholder, not a historical prompt version. The first user input replaces that sole placeholder and becomes version one; later manual edits and enhancer results follow the normal branching/version rules.

## Update workflow

- Add a new preset body or snippet to the relevant Pack content file.
- Add its localized index entry in each Pack locale file.
- Keep the stable ID unchanged once it has shipped.
- Add a Prompt Pack test asserting that localized indexes differ while inserted/model-facing text remains identical.
- Do not edit Create page templates for content-only changes.
