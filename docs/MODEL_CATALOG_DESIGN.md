# Model Catalog Design

This document defines the modularization boundary for model-related metadata. The first H3 catalog slice is now implemented; the remaining model families are migrated incrementally behind the same contract.

## Goal

Adding or removing a model should normally require:

1. Adding or removing one model definition directory.
2. Registering or unregistering that definition in one catalog index.
3. Adding an adapter only when the model has a new execution contract.

Create, Settings, environment scanning, labels, and download guidance must consume the catalog instead of maintaining parallel model lists.

## Current state

The current model data is split across several implementation surfaces:

- `electron/services/environment.ts`: model scan definitions, component patterns, install guides, and download metadata.
- `src/renderer/shared/labels.ts`: model display-name fallback map.
- `src/renderer/pages/create/helpers.ts`: Create fallback list, ordering, mode suffixes, and some capability checks.
- `src/core/workflow.ts`: model-family predicates, safety limits, output dimensions, and workflow-specific behavior.
- `src/core/image-workflow.ts`: image capabilities and image adapters.
- `src/core/catalog/loras/definitions.ts`: canonical LoRA technical metadata, compatibility rules, scan patterns, install guides, and automatic Prompt prefixes.
- `src/core/video-loras.ts`: runtime selection, persisted-snapshot normalization, policy checks, and compatibility exports derived from the canonical definitions.
- `workflows/`: API-format workflow templates.

The catalog now covers the remaining Prompt, image, legacy video, upscale, interpolation, and LoRA entries as well. H3 models have per-model directories; the other migrated entries are grouped by capability in `src/core/catalog/models/prompt.ts`, `image.ts`, `legacy-video.ts`, `post-process.ts`, and `loras.ts`. `electron/services/environment.ts` consumes catalog scan definitions first, while legacy definitions remain as a compatibility fallback during cleanup.

The first catalog migration should remove duplicate registration data, not rewrite workflow execution logic.

## Proposed structure

```text
src/core/catalog/
  types.ts
  index.ts
  model-catalog.ts
  models/
    minimax_h3_fl2va/
      definition.ts
      locale.zh-CN.ts
      locale.en-US.ts
    minimax_h3_ref2va/
      definition.ts
      locale.zh-CN.ts
      locale.en-US.ts
    qwen-image-edit-2511/
      definition.ts
      locale.zh-CN.ts
      locale.en-US.ts
  loras/
    index.ts
    minimax-h3-lightx2v-turbo.ts
  nodes/
    index.ts
```

`src/core/catalog/index.ts` is the only model registration index. The index imports model definitions and exports the catalog registry. A model directory is not active until it is listed there.

## Model definition

A definition contains stable technical metadata and references existing execution code. It does not contain renderer HTML and does not contain current scan results.

```ts
export const definition: ModelDefinition = {
  id: "minimax_h3_fl2va",
  family: "minimax-h3",
  category: "video",
  adapterId: "minimax-h3",
  promptPackId: "h3",
  order: 100,
  inputModes: ["image"],
  capabilities: {
    supportsEndFrame: true,
    supportsVideoExtension: true,
    supportsSpectrum: true,
    maxReferenceImages: 0,
    maxDurationSeconds: 15,
    resolutions: [480, 540, 720, 768]
  },
  dependencies: {
    files: [],
    nodes: [],
    minimumComfyUiVersion: "0.31.0"
  },
  install: {
    targetRoot: "modelDirectory",
    sources: []
  }
};
```

The exact file and node entries can be migrated from the existing environment scanner. `adapterId` is a code-owned identifier, not a dynamically executable module path.

## Model-localized metadata

Model names and model-specific descriptions must not use the global UI key catalog. Each model owns its own locale files:

```ts
export const zhCN = {
  name: "MiniMax H3 FL2VA",
  badge: "首帧 / 首尾帧",
  description: "...",
  supportSummary: "...",
  limitations: ["..."],
  downloadDescription: "..."
};
```

The catalog exposes a lookup such as `modelCatalog.localized(modelId, locale)`. Missing model translations fall back to that model's Chinese file. Generic UI labels such as `可用`, `缺少组件`, and `查看安装说明` remain in the global UI catalog.

## Runtime state boundary

Static catalog data and environment state remain separate:

```text
ModelDefinition + ModelLocale
          + local file scan
          + ComfyUI runtime node scan
          = ModelScanProfile / ModelAvailability
```

The scan result owns `available`, `missingFiles`, `runtimeVerified`, `runtimeReady`, and matched paths. It must not become the source of truth for model definitions.

For backward compatibility, `ModelScanProfile.id` remains stable. Existing queue and history records keep their model IDs. History should continue to display the stored model snapshot when a model is later retired.

## Consumer changes

### Create

`createModelOptionViewModels()` should receive catalog entries and scan state. It should not contain a fallback model array or model-family-specific ordering. Ordering comes from `definition.order`; mode labels and capability suffixes come from definition capabilities.

The model select remains in the same UI location. Only its data source changes.

### Settings

Settings should list catalog entries by category and merge scan state. The video/image fallback arrays should be generated from the catalog, not duplicated in the page template.

Model cards should render:

- generic UI labels from `uiKeys`;
- model-localized metadata from the model catalog;
- runtime file/node state from the environment scan.

### Shared labels

`modelName()` becomes a catalog lookup with an explicit fallback to the raw ID. The technical model ID must remain stable even if a display name changes.

### Workflow code

Existing adapters and workflows remain code-owned. `workflow.ts` and `image-workflow.ts` can gradually replace repeated ID lists with catalog queries such as `modelCatalog.isFamily(modelId, "minimax-h3")` and `modelCatalog.get(modelId)?.capabilities`.

### Runtime policy

Static model capabilities and LoRA compatibility rules are resolved by `src/core/video-policy.ts` into one effective video-generation policy. The policy is consumed by the Create view model, queue/workflow construction, and startup defaults. This keeps interactions such as Turbo changing the available step options, Spectrum version-gating Turbo/model-aware combinations, and R2V Motion Context disabling Spectrum for extension in one decision path.

The policy result contains effective step mode/options, Spectrum availability and reason, and configuration issues. Adding another typed conflict should update the relevant model/LoRA rule and the policy tests; UI and workflow consumers should not grow a second special case.

Do not move arbitrary node-input mapping into editable metadata. A new adapter is required when a model needs new graph construction, output parsing, cancellation, or runtime policy.

### LoRA and nodes

LoRA definitions and custom-node definitions should follow the same pattern, but they are separate registries. A model definition references compatible LoRA IDs and node IDs; it does not duplicate their descriptions.

Built-in video LoRAs use `src/core/catalog/loras/definitions.ts` as their single technical source of truth. Settings/environment scanning and runtime selection are adapters over that registry; filename, default strength, compatible model/input modes, load order, conflicts, download metadata, and automatic Prompt prefixes must not be copied into another list. Localized user guidance remains in locale modules because it is presentation content rather than execution metadata.

When a LoRA is added to a draft or queue task, its execution-relevant fields—including automatic Prompt prefixes—are copied into the persisted `VideoLoraSelection` snapshot. New catalog changes therefore cannot silently alter an already queued task. Normalization may hydrate fields missing from older built-in records for backward compatibility.

## Add-model workflow

For a model using an existing adapter:

1. Add the model definition to the appropriate catalog module (or give it a dedicated `src/core/catalog/models/<model-id>/definition.ts` directory).
2. Add the model's locale data.
3. Add one entry to `src/core/catalog/index.ts` or the registered category module.
4. Add or reference workflow JSON and dependency patterns.
5. Add focused catalog and scan tests.

For a model with a new execution contract, also add an adapter and workflow tests. The UI pages should not need model-specific edits.

## Remove-model workflow

1. Remove the model from the catalog index.
2. Keep migration aliases for old IDs if persisted drafts, queue records, or history records can contain them.
3. Keep history display snapshots and retired-model handling intact.
4. Remove the definition only after queue recovery and history compatibility tests cover the old ID.

Removing a catalog entry must not silently delete user model files or historical media.

## Static first, dynamic later

The first implementation should use TypeScript definitions imported by one registry index. This provides the desired maintenance boundary without introducing remote update risks or asynchronous startup behavior.

The same `ModelDefinition` schema can later be loaded from validated JSON under an application-managed catalog directory. That later loader must:

- validate a schema version;
- reject unknown adapter IDs;
- reject unsafe paths and arbitrary executable commands;
- preserve a bundled fallback catalog for offline use;
- keep workflow and adapter code bundled with the application.

Dynamic metadata updates should be limited to catalog data. They must not be allowed to introduce arbitrary ComfyUI graph execution without a shipped and tested adapter.

## Migration order

1. Add catalog types, model definitions, and one registry index without changing behavior. **Implemented.**
2. Move environment scan definitions and install guides behind the catalog. **Implemented for all current model profiles; legacy fallback remains temporarily.**
3. Make Create and Settings consume catalog entries and remove duplicate fallback arrays. **Implemented for video and image fallbacks.**
4. Replace `modelName()` and family predicates with catalog queries where behavior is equivalent. **Implemented for model names and H3 family/variant predicates.**
5. Split the remaining transition module into per-model directories and migrate image capability/LoRA registries separately. **LoRA technical metadata is now unified; per-LoRA module splitting remains optional as the registry grows.**
6. Add catalog validation, persisted-ID compatibility tests, and a new-model checklist.

Each step should remain independently typechecked and behavior-tested.
