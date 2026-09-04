# Repository Instructions

This file is the compact, always-loaded contract for work in Local Video Studio. Keep detailed product, UX, and workflow knowledge in the linked contract documents instead of expanding this file into a historical specification.

## Product and Source of Truth

Local Video Studio is a Windows Electron application that wraps local ComfyUI image and video workflows with creation, queue, history, settings, prompt-assistance, and media-management UI.

When sources disagree, use this order:

1. The user's latest explicit instruction or correction.
2. Behavior the user has explicitly accepted and that is currently working.
3. The contracts in `docs/ARCHITECTURE_CONTRACT.md`, `docs/UX_CONTRACT.md`, and `docs/WORKFLOW_CONTRACT.md`.
4. Current implementation, tests, and current-renderer fixture/screenshot evidence.
5. Explicitly maintained design artifacts approved for the current renderer.
6. Historical prototypes under `prototypes/`, research notes, implementation plans, and historical handoff documents.

Do not treat a prototype, research document, example workflow, or static validation as proof that a runtime feature is complete.

## Required Context by Change Type

Read only the contract relevant to the work, plus any directly linked reference it requires:

- State, IPC, paths, queue, history, process lifetime: `docs/ARCHITECTURE_CONTRACT.md`.
- Renderer layout, interaction, copy, responsive behavior, prototypes: `docs/UX_CONTRACT.md`.
- Models, ComfyUI nodes, workflow JSON, parameters, GPU policy: `docs/WORKFLOW_CONTRACT.md`.
- Environment and dependency details: `docs/DEPENDENCIES_AND_SETUP.md`.
- Image workspace implementation status: `docs/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md`.
- History large-dataset rendering, media scheduling, and scroll restoration: `docs/HISTORY_PERFORMANCE_OPTIMIZATION_PLAN.md`.
- New contributors and agents should begin with `docs/AGENT_START_HERE.md`. It maps product requests to the authoritative code, tests, and runtime checks.

`docs/LOCAL_CODEX_HANDOFF.md` and research documents are supporting history, not authoritative current requirements. Machine-specific paths in them are examples only.

## Start With the Runtime Boundary

Do not assume that a model file makes a feature usable. A working generation path has separate, independently checked layers:

1. the selected ComfyUI core and its data directory;
2. required model/LoRA/VAE/encoder files in the catalog-declared subdirectories;
3. required core nodes and custom nodes, including Python requirements;
4. an API-format workflow and its application adapter;
5. queue-time static validation and run-time `/object_info` validation;
6. a real minimal generation when claiming runtime support.

For any model, node, workflow, or setup request, follow the exact source map and integration checklist in `docs/AGENT_START_HERE.md`. Settings may install registered custom nodes, but large model weights are user-managed downloads unless the current UI explicitly implements otherwise.

## Core Product Invariants

Preserve these unless the user explicitly requests a contract change:

- Draft edits never mutate an already queued task; queue entries are immutable execution snapshots.
- Typing, selection, drag/drop, and media playback must not lose focus or reset because of unrelated renderer refreshes.
- A task and its output/history metadata stay consistent across restart, cancel, delete, migration, and path changes.
- Settings can inspect files while ComfyUI is offline. Runtime/API validation may add information but must not unnecessarily block offline management.
- Only one heavy GPU generation or post-processing stage runs at a time.
- Model-specific patches, memory flags, nodes, and defaults are scoped to that workflow. H3, Qwen image, Sulphur, SeedVR2, and retained legacy Wan/Hunyuan records must not leak runtime policy into one another.
- While the app is running, the configured local ComfyUI endpoint is application-managed and single-instance. Startup takes over an existing local listener; closing the app stops that managed runtime. Remote ComfyUI endpoints remain connection-only.
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
4. For a substantial UI area or interaction redesign, first establish a proposal from the current renderer DOM, states, breakpoints, fixture/screenshot evidence, and preserve list. Implement against the current renderer after approval. Update a historical prototype only when the user explicitly asks to maintain or review it; prototype synchronization is not a production gate.

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
- Dependency installation: live stage/output feedback, bounded subprocess execution, retained failure logs, safe backup/replace behavior, selected ComfyUI Python, and restart/runtime recheck.
- Process or queue lifetime: startup takeover, local single-instance enforcement, normal exit, active-task confirmation, forced exit, and child-process cleanup. Remote ComfyUI services must remain untouched.

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
- the current renderer and its approved fixture/screenshot evidence at the required viewport sizes; check a historical prototype only when the task explicitly includes maintaining it.

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

### Changelog Maintenance

- Record every released package version in `CHANGELOG.md`.
- Keep the README current-version section concise; historical release notes belong in the changelog.
- For unreleased work, use the `Unreleased` section and move its entries under the new version when bumping the package.

### Shared Worktree and Multi-Agent Safety

- Prefer delegating deterministic, bounded work to sub-agents when sub-agent tooling is available. Good candidates include repository/file inventory, static comparisons, fixture extraction, localized copy inventories, focused test additions, mechanical refactors within an owned module, and independent read-only research. This keeps the primary context focused on product decisions, integration, and verification.
- Match model cost and reasoning effort to the task. Use a fast, lower-cost model with high or maximum effort for well-specified mechanical work; reserve the strongest model for ambiguous architecture, workflow correctness, persisted-state changes, cross-module integration, and final review. Do not use a stronger model merely because it is available.
- Treat downloaded-artifact inspection as a bounded mechanical task. Explicitly select a lower-cost sub-agent model such as Luna when available, and have it perform downloads, checksum verification, recursive archive/wheel inspection, dependency-metadata checks, and filename/content searches outside the primary context. Require a compact handoff containing the inspected artifact URLs and hashes, relevant package versions, only matching members or a counted negative result, commands/checks performed, and a confidence-qualified conclusion. Do not return complete archive member lists, raw package metadata, or long command output unless the primary agent requests a specific excerpt.
- Delegate by deliverable and file ownership, not by a broad feature name. Each sub-agent brief must state the source of truth, files it may edit, files it must not edit, expected evidence/tests, and the format of its handoff. Prefer read-only investigation before assigning implementation.
- Keep the primary agent responsible for reading applicable contracts, resolving conflicting conclusions, integrating changes, reviewing the complete diff, and running the final verification tier. A sub-agent result is evidence or a proposed patch, not proof that the product behavior works.
- Do not delegate ambiguous UX judgment, destructive data operations, public/persisted contract changes, or final runtime claims without a primary-agent decision. When a task is too small to offset coordination cost, complete it directly instead of spawning a sub-agent.
- Parallelize only tasks with disjoint ownership. If two work packages converge on a hotspot or shared type, finish the read-only work in parallel, then serialize implementation through one owner.
- Re-read every target file immediately before editing it. Never apply a patch prepared from an older conversation snapshot without comparing it to the current worktree.
- If a target file changed after the task began, stop and reconcile the current diff first. Preserve newer fields, schema versions, migrations, adapters, tests, and user changes instead of replaying stale code.
- Do not let multiple agents concurrently own hotspot files such as `src/main.ts`, `electron/main.ts`, `electron/store.ts`, `src/types.ts`, or shared workflow adapters. Use separate Git worktrees/branches or assign one owner per hotspot.
- Before handoff, inspect `git diff --name-status` and the full diff for unexpected deletions. A passing typecheck is not sufficient when persisted-state migrations, model routing, media paths, or queue recovery changed.

## Repository Conventions

- Keep IPC and persisted-state changes backward compatible unless the requested release includes an explicit migration plan.
- When a task explicitly maintains historical prototype pages, rebuild generated output under `prototypes/preview/` with `npm.cmd run prototype:build`; edit the source fragments/shared assets, not only generated output. Prototype rebuilding is not a production UI gate.
- Never commit local model weights, generated media, machine-specific ComfyUI paths, secrets, or temporary logs.
- Preserve line endings and existing user changes; do not use destructive Git commands to clean the worktree.
