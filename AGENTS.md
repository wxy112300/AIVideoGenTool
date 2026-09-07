# Repository Instructions

Local Video Studio is a Windows Electron image/video studio backed by ComfyUI. The app owns drafts, queue, media/history, settings and prompt assistance; ComfyUI executes model graphs.

## Start small

- Inspect `git status --short`, target diffs and current files before editing. Preserve unrelated work.
- Use [docs/README.md](docs/README.md) to select one task route; [AGENT_START_HERE](docs/AGENT_START_HERE.md) maps code. Read affected contract sections, not every linked plan.
- Cross-session or multi-stage work uses one `docs/tasks/<date>-<topic>/TASK.md`; resume its summary before searching old plans. Small local fixes need no formal document.
- Within repository requirements: latest user instruction → accepted working behavior → architecture/UX/workflow contracts → current code and evidence → historical plans/prototypes. Current disk is the editing baseline, not proof of correctness.

## Hybrid agents

- Default preference: Astra/Sol owns planning, ambiguous decisions and final integration; Luna handles bulk evidence processing and bounded implementation. The user-selected lead remains the lead; model names do not confer authority over independent tasks.
- Delegate independent, well-specified work when useful. Explicitly select available Luna for workers; avoid accidental inheritance of an expensive lead model. Give exact files, constraints, checks and output limits with fresh/minimal context.
- Standard tasks use [WORKFLOW](docs/development/WORKFLOW.md) and [TASK_TEMPLATE](docs/development/TASK_TEMPLATE.md). Small fixes stay local; workers do not recursively delegate by default.
- Keep raw logs/archive listings out of the lead context. Return concise findings, evidence paths, counterevidence and next steps. Reuse fixed-version/hash evidence; reopen blocked work when its trigger changes or prior evidence is insufficient.
- The lead reviews integration and evidence. Delegation guarantees neither correctness nor savings; report unavailable tools/models.

## Product invariants

- Draft edits never mutate queued execution snapshots; preserve focus, typing, selection, drag/drop and playback across unrelated refreshes.
- Task/output/history identity stays consistent through restart, cancel, delete, migration and path changes. Keep persisted IDs and IPC compatible unless an explicit migration is authorized.
- Settings inspects files offline. Files, node schema, graph construction and real generation are distinct readiness levels.
- Only one heavy GPU stage runs at a time. Precision, sampler/scheduler, VAE, attention, cache/offload and launch policy stay scoped to the workflow family.
- The app manages a single configured local ComfyUI runtime: startup takes over its local listener and exit stops it. Remote endpoints remain connection-only.
- Preserve explicitly requested fallback paths. “Default” is preselected, not exclusive; “replace” requires old queue/history compatibility.
- History details retain parent navigation and reachable return/primary actions.

For model/node/setup work follow [WORKFLOW_CONTRACT](docs/WORKFLOW_CONTRACT.md) and [DEPENDENCIES_AND_SETUP](docs/DEPENDENCIES_AND_SETUP.md): selected core/data/Python, catalog files, actual node schema, API graph, queue validation and real output. Weights remain user-managed unless the UI implements downloading them.

## Changes and ownership

- Proceed with reversible choices within authorization. Do not repeat approvals already given; ask for unresolved product choices, unapproved persisted/public contract changes or destructive user-data operations.
- For substantial UI changes, establish direction from current renderer DOM/states/breakpoints and preserve list. Approved direction is sufficient; historical prototypes are not a production gate.
- One writer per overlapping file, including contracts, AGENTS, changelog and package versions. Re-read immediately before patching; reconcile concurrent changes before writing. Continue disjoint work while resolving overlap.
- Independent tasks are peers. Confirm shared ownership through available coordination, never infer it from model names or a task-local note. Do not stop/reassign other tasks or overwrite their changes.
- Coordinate `dist` cleanup/builds, generated artifacts, ports, Electron/userData, ComfyUI and GPU. Worktrees isolate code, not machine resources; never kill another task's process to run checks.
- Use `apply_patch` for existing files; preserve line endings. Do not reset, clean, stash, restore, stage or commit others' work.
- Prefer shared pure helpers in `src/core/` and focused Electron services; preserve typed preload boundaries. Do not expand composition roots or duplicate state/catalog/path/version sources.

## Verify and close

Read affected neighboring checks in [CHANGE_VERIFICATION](docs/CHANGE_VERIFICATION.md):

- Docs: diff, links and command consistency.
- Focused logic: relevant Vitest tests + `npm.cmd run typecheck`.
- Shared state/IPC/queue/history/workflow: focused tests + `npm.cmd run verify`.
- Shared renderer/CSS/substantial UX: verify + manual [UX](docs/UX_CONTRACT.md) checks.
- Runtime strategy: verify + static graph checks + real minimal generation when available.

`verify` runs tests, clean typechecked build and contrast checks. Repeat only when changed inputs/failures invalidate evidence. Report actual checks, unverified runtime dependencies, preserved behavior and resource cleanup; inspect scoped diff and unexpected deletions. Never infer performance/quality from static success.

Classify patch/minor/major impact. Unreleased changes enter `CHANGELOG.md`; coordinate one release owner, not per-worker bumps. At release align package/lockfile versions and README milestone; Electron supplies `app.getVersion()`. Prefer `npm.cmd version patch|minor --no-git-tag-version` and verify via `npm.cmd pkg get version`.

Follow [DOCUMENT_POLICY](docs/development/DOCUMENT_POLICY.md) for document lifecycle. Do not create new top-level plans or duplicate task state. Never commit secrets, weights, generated media, machine paths or temporary logs. Rebuild prototypes only when explicitly maintained.
