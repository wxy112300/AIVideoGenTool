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

## Presets

Preset IDs remain stable for persisted Settings and history compatibility. Pack content owns the built-in English default bodies. Locale files only provide the preset label and description shown in Create and Settings.

The eleven H3 presets remain independent choices rather than composable groups: ten general choices plus the R2V-only multi-reference preset. Every ordinary preset first preserves the base prompt and mode/reference semantics. `detailed-cinematic` is an expansion contract: it retains every concrete source instruction and develops each action with grounded mechanics, reactions, camera behavior, timing, or causal sound; it must not become a concise rewrite. Single-shot behavior is a product-level default and is not owned solely by the single-shot preset.

`detailed-cinematic` also has an application-side acceptance gate. Its main timeline must exceed both the duration/mode coverage floor and the source-prompt baseline, and same-language output must retain enough meaningful source terms to reject obvious topic or action loss. A failed gate does not create a new prompt version. This check is deliberately limited to the most-detailed preset; shorter presets retain their own density tradeoffs.

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
