# Local Video Studio Localization Contract

This document defines the localization seam. It does not add translated copy.

## Source of truth

- Key names live in `src/core/i18n-keys.ts`.
- Catalog values live in `src/core/locales/<locale>.ts`.
- `src/core/i18n.ts` owns locale normalization, fallback, loading, and the in-memory catalog cache.
- `zh-CN` remains the default catalog and is loaded with the renderer runtime.
- Non-default locales are loaded through `loadUiLocale()` only when selected; missing entries fall back to `zh-CN`.
- `Settings -> interface language` persists `settings.uiLocale` and is the future locale switch entry.
- Runtime workflow safety and validation keys live in `src/core/runtime/workflow-messages.ts`.
- Workflow graph, safety, and API validation functions accept an optional `UiLocale`; callers should pass `settings.uiLocale` while keeping the default `zh-CN` fallback.

When adding a locale, update the `UiLocale` union, the supported locale list, the locale loader map, and add one catalog file. Do not statically import every locale into the renderer entry.

## Key rules

- Use namespaced semantic keys such as `create.mode.imageToVideo` and `history.lightbox.close`.
- Do not use a full sentence as a key.
- Keep interpolation parameters stable and descriptive, for example `{count}` or `{version}`.
- Add a key before replacing a visible UI string with `t()`.
- Renderer page modules receive `t` through their render options or `RendererContext`; they do not import `main.ts`.
- Escape translated text when it is inserted into HTML attributes or markup.

## Do not translate

Keep these values outside UI catalogs unless they are ordinary labels:

- Model names, workflow IDs, node IDs, file names, paths, and API URLs.
- Runtime-managed model, node, LoRA, acceleration, hardware-recommendation, and component-description metadata. Localize the generic labels around these values, but keep the values themselves outside the UI catalog.
- Prompt contracts, generated prompts, visible user text, dialogue, lyrics, and model-facing instructions.
- Technical values such as `CPU`, `GPU`, `FPS`, `H3`, `R2V`, and `LoRA` may remain literal when they are identifiers.

## Prompt language contract

- Built-in video prompts, image-edit presets, H3 presets, prompt snippets, and model-facing template values are written in English regardless of the selected UI locale.
- A user's manually entered prompt remains authoritative. Chinese, Japanese, quoted visible text, dialogue, lyrics, proper nouns, and other explicitly supplied language must be preserved rather than translated.
- UI labels for those templates may be localized separately from their model-facing values. For example, a shortcut can have a Chinese label while inserting an English instruction.
- Legacy user-configured presets are user content and may be preserved for compatibility; built-in legacy Chinese defaults must normalize to the current English defaults.
- Runtime safety messages keep node names, model names, and technical identifiers literal; only the surrounding explanation is catalog-owned.

## Migration order

1. Shell navigation, shared actions, statuses, and dialogs.
2. Page headings, tabs, primary actions, and empty/loading/error states.
3. Settings labels and recovery messages.
4. Detailed cards, tooltips, prompt builder labels, and runtime messages.
5. Add the `en-US` catalog only when a complete translation batch is reviewed.

Until a locale catalog is complete, fallback to `zh-CN` is intentional and must remain functional.
