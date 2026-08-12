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

## Presets

Preset IDs remain stable for persisted Settings and history compatibility. Pack content owns the built-in English default bodies. Locale files only provide the preset label and description shown in Create and Settings.

## Update workflow

- Add a new preset body or snippet to the relevant Pack content file.
- Add its localized index entry in each Pack locale file.
- Keep the stable ID unchanged once it has shipped.
- Add a Prompt Pack test asserting that localized indexes differ while inserted/model-facing text remains identical.
- Do not edit Create page templates for content-only changes.
