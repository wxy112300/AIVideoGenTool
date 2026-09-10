# Change Verification

Read the applicable sections when selecting checks for a change. These checks supplement the product contracts; unrelated sections are not a mandatory reading list. Commands and code paths are relative to the repository root.

## Regression Boundaries

The following changes require these neighboring checks:

- Renderer refresh, draft binding, or shared event handlers: continuous typing, focus, clear, undo/redo where present, mode switch, and queue submission.
- History media or path resolution: cover loading, loading/error states, hover preview, detail playback/viewing, file actions, and deletion.
- Shared CSS, page shell, or navigation: Create, Queue, History, Settings, affected detail pages, and both supported viewport checks from `UX_CONTRACT.md`.
- Workflow frame/size/seed/token inputs: every bundled workflow using the changed field, not only the current model.
- Persisted types, paths, or IPC payloads: defaults, migration, restart recovery, old queue/history records, and preload typings.
- Environment scanning or dependency cards: offline scan, multiple ComfyUI installations, selected installation, online validation, install/update state, and actionable logs.
- Dependency installation: live stage/output feedback, bounded subprocess execution, retained failure logs, safe backup/replace behavior, selected ComfyUI Python, and restart/runtime recheck.
- Process or queue lifetime: startup takeover, local single-instance enforcement, normal exit, active-task confirmation, forced exit, and child-process cleanup. Remote ComfyUI services must remain untouched.

## Verification Matrix

Use the smallest tier that gives credible evidence; increase it when risk crosses boundaries.

- Documentation/harness instructions only: inspect the diff, local links, command names and internal consistency; no application build or GPU run is required.
- Prototype-only: rebuild and inspect generated pages only when prototype maintenance is in scope.
- Focused logic change: relevant Vitest file(s), then `npm.cmd run typecheck`.
- Shared state, IPC, queue, history, or workflow construction: focused tests plus `npm.cmd run verify`.
- Shared renderer/CSS or substantial UX change: `npm.cmd run verify` plus manual UI checks defined in [UX_CONTRACT.md](UX_CONTRACT.md).
- Model/node/runtime strategy: `npm.cmd run verify`, static workflow validation, then a real minimal ComfyUI run when the environment is available. GPU testing is not required for unrelated UI/docs changes.

`npm.cmd run verify` is the repository-wide local gate: tests, a clean typechecked production build, and the UX text-contrast check (see `package.json`).

## UI and UX Gate

For UI work, "looks better" is not an acceptance criterion. Use [UX_CONTRACT.md](UX_CONTRACT.md) and verify:

- hierarchy, alignment, density, and primary-action priority;
- loading, empty, unavailable, success, and error states;
- keyboard/focus behavior and controls that remain reachable on long pages;
- both waterfall/gallery or image/video variants when sharing a component;
- the current renderer and its approved fixture/screenshot evidence at the required viewport sizes; check a historical prototype only when the task explicitly includes maintaining it.

Do not add arbitrary one-off colors, spacing, radii, or nested bordered containers when an existing token or hierarchy solves the problem.

## Workflow and Runtime Gate

Follow `WORKFLOW_CONTRACT.md`. In particular:

- Never infer node inputs from display names alone; inspect the installed/API node schema or an authoritative workflow.
- Preserve model-specific precision, scheduler, sampler, VAE, attention, cache, unload, and offload policies.
- Treat model files, nodes, and a running service as three distinct states: installed on disk, statically recognizable, and runtime validated.
- Do not claim performance or quality improvements without comparable parameters and measured evidence.
- Destructive media migration/deletion requires explicit targets, confirmation, and recoverable/copy-first behavior where practical.

## Evidence and shared resources

- Run focused checks while iterating, then the required full gate once on the integrated changes. Repeat only when later edits or failures invalidate the evidence.
- Coordinate build/runtime ownership before commands that clean `dist`, regenerate output, launch Electron, restart ComfyUI, or occupy the GPU. Separate worktrees do not isolate ports, GPU resources, or userData automatically.
- Use isolated test state/media and explicit local endpoints for runtime checks. Follow [AGENT_ELECTRON_API_RUNBOOK.md](AGENT_ELECTRON_API_RUNBOOK.md) for real application smoke; launching an app can take over the configured local ComfyUI listener.
- If a dependency or another task prevents a required check, finish independent checks and report the exact missing evidence. Do not claim the gate passed or terminate another task's process to obtain a result.
- Report command/result, relevant environment and tested revision or file state. Concurrent edits during a run can invalidate its result; a sub-agent's passing test is evidence for its tested state, not automatic proof of final integration.

## Avoid duplicate executor checks

The current agent owns verification; a separate senior supervisor/reviewer is not required. Reuse a tool-observed check with its command, result and matching integrated file state, regardless of executor. A worker's focused test does not replace a required full gate. Run missing checks or rerun affected checks only for changed inputs, failures or unresolved evidence; do not repeat a passing gate merely for parent sign-off.
