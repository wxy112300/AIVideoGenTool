# Repository Instructions

This file is the compact, always-loaded contract for work in Local Video Studio. Keep detailed product, UX, and workflow knowledge in the linked contract documents instead of expanding this file into a historical specification.

## Product and Source of Truth

Local Video Studio is a Windows Electron application that wraps local ComfyUI image and video workflows with creation, queue, history, settings, prompt-assistance, and media-management UI.

When sources disagree, use this order:

1. The user's latest explicit instruction or correction.
2. Behavior the user has explicitly accepted and that is currently working.
3. The contracts in `docs/ARCHITECTURE_CONTRACT.md`, `docs/UX_CONTRACT.md`, and `docs/WORKFLOW_CONTRACT.md`.
4. Approved prototypes under `prototypes/`.
5. Current implementation and tests.
6. Research notes, implementation plans, and historical handoff documents.

Do not treat a prototype, research document, example workflow, or static validation as proof that a runtime feature is complete.

## Required Context by Change Type

Read only the contract relevant to the work, plus any directly linked reference it requires:

- State, IPC, paths, queue, history, process lifetime: `docs/ARCHITECTURE_CONTRACT.md`.
- Renderer layout, interaction, copy, responsive behavior, prototypes: `docs/UX_CONTRACT.md`.
- Models, ComfyUI nodes, workflow JSON, parameters, GPU policy: `docs/WORKFLOW_CONTRACT.md`.
- Environment and dependency details: `docs/DEPENDENCIES_AND_SETUP.md`.
- Image workspace implementation status: `docs/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md`.

`docs/LOCAL_CODEX_HANDOFF.md` and research documents are supporting history, not authoritative current requirements. Machine-specific paths in them are examples only.

## Core Product Invariants

Preserve these unless the user explicitly requests a contract change:

- Draft edits never mutate an already queued task; queue entries are immutable execution snapshots.
- Typing, selection, drag/drop, and media playback must not lose focus or reset because of unrelated renderer refreshes.
- A task and its output/history metadata stay consistent across restart, cancel, delete, migration, and path changes.
- Settings can inspect files while ComfyUI is offline. Runtime/API validation may add information but must not unnecessarily block offline management.
- Only one heavy GPU generation or post-processing stage runs at a time.
- Model-specific patches, memory flags, nodes, and defaults are scoped to that workflow. H3, Qwen image, Wan, Hunyuan, SeedVR2, and other workflows must not leak runtime policy into one another.
- Closing the app stops its own watchers, child processes, and active generation. It does not terminate a ComfyUI instance the user started independently.
- Existing fallback paths explicitly requested by the user remain available until the user asks to remove or replace them.
- History detail pages keep their parent navigation selected and keep return/primary actions reachable without scrolling to the page top.

## Interpreting Requests

- **Preserve / keep** means the existing path remains usable alongside the new one.
- **Replace / deprecate** permits removing the old implementation only after checking persisted data and history compatibility.
- **Default** means preselected, not the only allowed value.
- **Integrate a model** means the complete capability described in `docs/WORKFLOW_CONTRACT.md`, not merely a visible option.
- **Works / validated / passed** means an actual relevant execution succeeded. If only types, JSON, or static construction were checked, say "static validation passed."
- **Fix** requires reproducing or understanding the failure, correcting it, and checking adjacent behavior.
- When a request is ambiguous but a reversible, local assumption is safe, proceed and state the assumption. Ask before changing persisted/public contracts or deleting user data.

## Change Protocol

Before editing:

1. Inspect `git status` and preserve unrelated user changes.
2. Identify the direct target, adjacent surfaces, and a short **preserve list**.
3. Read the relevant contract and the implementation/tests for the affected path.
4. For a substantial new UI area or interaction redesign, update the prototype first unless the user explicitly asks for direct implementation. Small fixes may go directly to the app, then must be synchronized back to the prototype when the prototype represents that behavior.

While editing:

- Keep changes focused and use existing TypeScript, Electron, Vite, and Vitest patterns.
- Use `apply_patch` for existing files. Do not overwrite unrelated dirty files.
- Prefer extending shared domain helpers under `src/core/` and Electron services over adding more stateful logic to `src/main.ts` or `electron/main.ts`.
- Do not silently rewrite working workflows, defaults, paths, or user-facing behavior outside the requested scope.
- Do not introduce a second source of truth for application version, task state, model metadata, or media paths.

After editing:

1. Review the diff for scope and accidental changes.
2. Run the required verification tier below.
3. Exercise the original behavior and the adjacent surfaces identified before editing.
4. Report what was actually tested, what was only statically checked, and any remaining runtime dependency.

## Regression Boundaries

The following changes require these neighboring checks:

- Renderer refresh, draft binding, or shared event handlers: continuous typing, focus, clear, undo/redo where present, mode switch, and queue submission.
- History media or path resolution: cover loading, loading/error states, hover preview, detail playback/viewing, file actions, and deletion.
- Shared CSS, page shell, or navigation: Create, Queue, History, Settings, affected detail pages, and both supported viewport checks from `docs/UX_CONTRACT.md`.
- Workflow frame/size/seed/token inputs: every bundled workflow using the changed field, not only the current model.
- Persisted types, paths, or IPC payloads: defaults, migration, restart recovery, old queue/history records, and preload typings.
- Environment scanning or dependency cards: offline scan, multiple ComfyUI installations, selected installation, online validation, install/update state, and actionable logs.
- Process or queue lifetime: normal exit, active-task confirmation, forced exit, child-process cleanup, and externally started ComfyUI preservation.

## Verification Matrix

Use the smallest tier that gives credible evidence; increase it when risk crosses boundaries.

- Documentation or prototype-only: rebuild prototypes when applicable and inspect the generated pages.
- Focused logic change: relevant Vitest file(s), then `npm.cmd run typecheck`.
- Shared state, IPC, queue, history, or workflow construction: focused tests plus `npm.cmd run verify`.
- Shared renderer/CSS or substantial UX change: `npm.cmd run verify` plus manual UI checks defined in `docs/UX_CONTRACT.md`.
- Model/node/runtime strategy: `npm.cmd run verify`, static workflow validation, then a real minimal ComfyUI run when the environment is available. GPU testing is not required for unrelated UI/docs changes.

`npm.cmd run verify` is the repository-wide local gate: tests followed by a clean typechecked production build.

## UI and UX Gate

For UI work, "looks better" is not an acceptance criterion. Use `docs/UX_CONTRACT.md` and verify:

- hierarchy, alignment, density, and primary-action priority;
- loading, empty, unavailable, success, and error states;
- keyboard/focus behavior and controls that remain reachable on long pages;
- both waterfall/gallery or image/video variants when sharing a component;
- the approved prototype and live renderer at the required viewport sizes.

Do not add arbitrary one-off colors, spacing, radii, or nested bordered containers when an existing token or hierarchy solves the problem.

## Workflow and Runtime Gate

Follow `docs/WORKFLOW_CONTRACT.md`. In particular:

- Never infer node inputs from display names alone; inspect the installed/API node schema or an authoritative workflow.
- Preserve model-specific precision, scheduler, sampler, VAE, attention, cache, unload, and offload policies.
- Treat model files, nodes, and a running service as three distinct states: installed on disk, statically recognizable, and runtime validated.
- Do not claim performance or quality improvements without comparable parameters and measured evidence.
- Destructive media migration/deletion requires explicit targets, confirmation, and recoverable/copy-first behavior where practical.

## Version Management

The application uses semantic versioning during `0.x` development. Read the current version from `package.json`; do not copy a baseline into this file.

- **Patch (`0.x.Y`)**: bug fixes, documentation/harness changes, tests, internal refactors, and small non-breaking UX corrections.
- **Minor (`0.X.0`)**: new user-facing capability, model/workflow integration, substantial UI area, or compatible cross-module feature.
- **Major / `1.0.0`**: only with an explicit migration plan and a stable public/persisted contract ready for release.

For any repository change, classify the impact before completion. When bumping:

1. Keep `package.json`, root `package-lock.json`, and `packages[""].version` identical.
2. Update the README current-version section and milestone description.
3. Do not hardcode a renderer/Electron version; Electron supplies `app.getVersion()` through preload IPC.
4. Prefer `npm.cmd version patch|minor --no-git-tag-version`, review its diff, and keep the bump in the same commit.
5. Verify with `npm.cmd pkg get version` and the appropriate verification tier.

## Repository Conventions

- Keep IPC and persisted-state changes backward compatible unless the requested release includes an explicit migration plan.
- Generated prototype pages under `prototypes/preview/` must be rebuilt with `npm.cmd run prototype:build`; edit the source fragments/shared assets, not only generated output.
- Never commit local model weights, generated media, machine-specific ComfyUI paths, secrets, or temporary logs.
- Preserve line endings and existing user changes; do not use destructive Git commands to clean the worktree.
