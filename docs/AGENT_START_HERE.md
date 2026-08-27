# Agent Start Here

This guide is the shortest reliable route into Local Video Studio. Read the contract named for the change in `AGENTS.md`; then use this map instead of searching from `src/main.ts` outward.

## 1. Classify the request

| Request | Read first | Primary implementation |
| --- | --- | --- |
| Queue, history, paths, IPC, persistence, process exit | `ARCHITECTURE_CONTRACT.md` | `electron/main.ts`, `electron/store.ts`, `electron/services/`, `src/core/` |
| History 大数据量性能、媒体延迟加载、滚动恢复 | `UX_CONTRACT.md`, `HISTORY_PERFORMANCE_OPTIMIZATION_PLAN.md` | `src/renderer/pages/history/`, `src/renderer/render-coordinator.ts` |
| Layout, interaction, focus, media states | `UX_CONTRACT.md` | `src/renderer/`, `src/styles/`, current renderer evidence; prototypes are historical |
| Model, LoRA, workflow, GPU/memory policy | `WORKFLOW_CONTRACT.md` | `src/core/catalog/`, workflow adapters, `workflows/` |
| Long video, video Extend, Native AV continuation | `WORKFLOW_CONTRACT.md`, [`LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md`](LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md) | `src/core/`, `electron/queue-*`, `electron/services/extension-media.ts`, `workflows/` |
| ComfyUI discovery, nodes, Python, installation | `DEPENDENCIES_AND_SETUP.md` | `electron/services/environment.ts`, Settings environment controller |
| Image workspace | `IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md` | image draft/workflow/history modules |

Inspect `git status` before reading or editing hotspot files. This repository is often edited by multiple agents; current disk content wins over an old conversation snapshot.

已完成、被取代或仅用于历史追溯的计划见 [`archive/README.md`](archive/README.md)；归档内容不是当前实现的 source of truth。

## 2. Sources of truth in code

- Model definitions, variants, components, download targets and localized metadata: `src/core/catalog/models/` and `src/core/catalog/index.ts`.
- LoRA compatibility, triggers, strength, ordering and conflicts: `src/core/catalog/loras/definitions.ts`.
- Custom-node repositories, directory names and offline/runtime probes: `customNodeCatalog` in `electron/services/environment.ts`.
- Video workflow selection and placeholder policy: `src/core/workflow.ts`, `src/core/video-policy.ts`, and `workflows/*.json`.
- Image workflow construction and required runtime nodes: `src/core/image-workflow.ts`.
- Queue task snapshots and pure mutations: `src/core/queue-task-factory.ts` and `src/core/queue.ts`.
- Queue mutation IPC: `electron/queue-ipc.ts`; execution worker, ComfyUI submission and runtime validation currently remain in `electron/main.ts` and `electron/services/comfy-ui.ts`.
- Persisted defaults and migrations: `src/core/defaults.ts`, `electron/store.ts`, and `src/types.ts`.
- Settings installation UX: `src/renderer/pages/settings/` plus preload/IPC handlers.

Do not copy the complete catalog into README or another hand-maintained list. User-facing summaries may name model families, but component filenames and download targets belong to the catalog.

## 3. What “integrate a model” means

A visible dropdown option is not an integration. Complete all applicable items:

1. Add or update the catalog entry, including category, adapter, input modes, variants, required/optional components and authoritative install guides.
2. Declare required core/custom node types and add any custom-node package to the environment catalog.
3. Add an API-format workflow or a typed workflow builder. Never use a normal UI workflow as the execution artifact.
4. Implement model-specific prompt, size, frame, seed, sampler, scheduler, precision, attention, offload, VAE and unload policy without leaking it into other models.
5. Make Create availability, queue snapshots, history metadata and Settings scanning use the same identifiers.
6. Keep offline file recognition separate from runtime node validation. A stopped ComfyUI must not make installed files appear missing.
7. Test missing, partially installed and ready states. Verify queue-time validation and execution-time `/object_info` checks.
8. Run repository verification and static workflow validation. Only call the model “working” after a real minimal output succeeds.

When replacing a model or workflow, preserve old history labels and persisted identifiers unless a migration is explicitly designed.

## 4. Correct installation model

There are four distinct operations:

- **Application dependencies:** `npm.cmd ci` installs Electron/TypeScript/Vite packages for this repository.
- **ComfyUI core:** installed separately as Desktop, Portable or source. Settings selects the actual core and data directories.
- **Custom nodes:** Settings → Nodes & dependencies may clone/update registered repositories and run `requirements.txt` with the selected ComfyUI Python. The operation must stream progress, time out, retain logs and restart/recheck when safe.
- **Weights:** large diffusion models, encoders, VAEs and LoRAs are not stored in Git and are not generally downloaded by the app. Settings component info provides the source, filename and exact catalog target directory.

Always inspect the selected instance. Installing a node into one ComfyUI data directory while connecting to another service is a common false-success condition.

## 5. Minimum checks by task

- Catalog/metadata only: catalog tests plus typecheck.
- Node installer or environment scan: offline scan, selected multi-install instance, streamed success/failure output, timeout behavior, restart/recheck and full `npm.cmd run verify`.
- Workflow logic: focused workflow tests, all bundled users of shared fields, static JSON construction, full verify and a real minimal ComfyUI run when available.
- Renderer interaction: focused controller tests, typing/focus preservation, loading/error/success states, both required viewport sizes and full verify.

Report “static validation passed” when no real ComfyUI generation was run. Never convert absence of an error into a performance or quality claim.
