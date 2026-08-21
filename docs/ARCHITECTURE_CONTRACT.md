# Architecture Contract

This document defines the stable boundaries that code changes must preserve. It describes current product contracts, not every implementation detail.

## System Boundary

Local Video Studio is an Electron desktop client. It manages product state and submits workflows to a user-selected local ComfyUI installation or service. ComfyUI owns model execution; this application owns the creation experience, queue semantics, history metadata, environment discovery, and the processes it starts.

```text
Creation draft
  -> immutable queue snapshot
  -> model/workflow adapter
  -> ComfyUI prompt and progress APIs
  -> generated media
  -> history/project record and cover cache
```

The renderer must not directly access arbitrary local files or spawn processes. Privileged filesystem, process, clipboard, dialog, and service operations pass through the typed preload/IPC boundary.

## Ownership Map

| Area | Primary owner | Contract |
| --- | --- | --- |
| Renderer UI and transient draft | `src/main.ts`, `src/style.css` | Display and edit state without losing input focus or mutating queued snapshots. |
| Shared domain logic | `src/core/` | Deterministic, testable transformations without Electron globals. |
| Queue snapshots and pure mutations | `src/core/queue-task-factory.ts`, `src/core/queue.ts` | Create immutable execution snapshots and transform queue state without IPC or process globals. |
| Shared persisted/IPC types | `src/types.ts` | Backward-compatible shapes or explicit migrations. |
| Privileged application lifecycle | `electron/main.ts`, `electron/preload.cts` | Windows, IPC, dialogs, process ownership, clean shutdown. |
| Queue mutation IPC | `electron/queue-ipc.ts` | Register non-execution queue controls against explicit store/logger/state dependencies. |
| Runtime integrations | `electron/services/` | ComfyUI, environment, media, monitoring, prompt helpers, and child processes. |
| Persistence | `electron/store.ts` | Defaults, migrations, queue/history/settings durability. |
| Workflow templates | `workflows/` | API-format workflow graphs adapted through model-specific code. |
| Product prototypes | `prototypes/` | Approved interaction/layout reference, not production state or proof of runtime support. |

Large entry files are an existing risk, not a pattern to expand. When work introduces reusable state or transformation logic, extract it into a focused `src/core` module or Electron service with tests. Do not perform an unrelated big-bang rewrite.

## State Contracts

### Draft and queue

- Each of the three Create modes owns independent mutable UI state. Image-to-video and video-extension keep complete, separately persisted draft snapshots for model, workflow, media, prompt versions, references, LoRAs, dimensions, duration, sampling, interpolation, motion, seed, and acceleration choices; the visible `draft` is only the active projection. Image editing continues to own `imageDraft`. Switching modes must restore the target snapshot without copying parameters from the page being left.
- An asynchronous prompt operation is owned by the exact Create mode that started it. Completion updates and persists that mode's latest draft snapshot even after navigation. Only the owner projects elapsed progress and cancellation; other Create modes disable prompt enhancement while keeping the shared prompt-model stop/unload control synchronized and available.
- Legacy drafts without separate image-to-video/video-extension snapshots are migrated by preserving the active mode as its snapshot and creating the missing mode from defaults. Legacy drafts without an extension prompt state are migrated by copying the existing prompt once.
- Submission creates a complete execution snapshot: model, mode, prompt, inputs, output settings, seed, workflow options, runtime profile, and display metadata needed later.
- Later draft changes cannot alter queued or running work.
- A multi-output image batch can be one logical queue task while retaining individual output/version identity.
- Pausing, cancelling, retrying, and restoring must use explicit task states; UI labels are projections of state, not the state itself.

### History and media

- The generated media file is the durable artifact. History metadata makes it discoverable and reproducible but must not fabricate media availability.
- Video history and image-project history are distinct user-facing collections even if storage helpers are shared.
- Favorite, rating, and user-defined tags are top-level history/project curation metadata. Tags are normalized on load and IPC writes (trimmed, whitespace-collapsed, case-insensitive identity) and default to an empty list for legacy records.
- Curation metadata updates use the metadata IPC path and must not replace the primary media element; the renderer may patch the detail controls in place while playback continues.
- Image projects keep all derived versions in one project lineage. The newest successful version becomes the default cover unless the user explicitly chooses another.
- Path resolution must support existing records after restart and preserve legacy records through explicit fallback/migration logic.
- Cover images are derived cache artifacts. A missing or stale cover may be regenerated without modifying the original media or history identity.
- Deleting from history removes both the selected record/project data and the corresponding media only after confirmation. Partial failure must be surfaced and must not silently leave metadata claiming success.

### Settings and environment

- The selected ComfyUI installation, the connected service, and discovered installations are different concepts.
- File-based discovery works while ComfyUI is stopped. API verification augments discovery after a service is reachable.
- Multiple installations must remain visible and selectable. Never silently change the user's selected installation because another scan result looks newer.
- Store portable identifiers and paths where required, but never bake one developer machine's username or drive into defaults.
- Renderer environment refreshes are owned by one coordinator. Startup, manual scans, service changes, and dependency actions request a refresh through it; only the latest request may commit the shared scan snapshot or lifecycle state.
- Environment scans have explicit `full`, `runtime`, and `dependencies` scopes. Runtime refreshes reuse file/GPU/system evidence and recheck service, core, and node registration; dependency refreshes additionally recheck Python, llama, acceleration, and workflow packages. Missing or incompatible cached baselines always fall back to a full scan.
- An environment scan snapshot is immutable renderer evidence with its own `scannedAt`. Live ComfyUI connectivity remains separate runtime state; Settings may combine both through a pure display selector but must not rewrite API items, model evidence, or timestamps in the stored scan snapshot.
- Settings persistence is owned by one save coordinator. Every save source uses the same output-directory migration gate and the same post-save model, workflow, locale, and environment-refresh effects; UI controllers must not call the save IPC directly.
- Settings templates render semantic view state; prompt runtime, core/custom-node status, acceleration runtime, derived directories, GPU policy, and dependency-action availability are computed by pure selectors instead of reinterpreting raw scan fields in markup.
- Settings service lifecycle, environment repair, and node/workflow package actions are mounted by dedicated controllers. The page composition layer supplies shared state callbacks to each independent controller; no controller owns another controller's listener or option contract.

## Process and Runtime Ownership

- Track every process started by this application, including development helpers and model-related child processes.
- App-owned source/Python ComfyUI starts with a visible Windows console whose stdout/stderr remain writable for ComfyUI wrappers and progress output. Disk log tailing and failure capture supplement that console; they do not replace it with a blank or hidden process.
- On normal exit, stop owned watchers/children and cancel or interrupt active generation as agreed by the user.
- When an active task exists, request confirmation before closing; a confirmed forced exit still performs best-effort cleanup.
- A local ComfyUI endpoint selected by the user is application-managed while Local Video Studio is running. Before starting or restarting it, terminate other local ComfyUI process trees discovered for the selected installation or configured listener, then launch exactly one managed instance. Remote endpoints are connection-only and are never terminated by this application.
- Updating or restarting an app-managed ComfyUI instance must restore connection state and report logs/progress.
- Port `8188` is the application default, but configured endpoints remain valid.
- Prompt-model residency is an explicit main-process lease. Starting the prompt model warms and retains it across prompt requests; manual release, the first queued generation, or application exit ends the lease and unloads it. A one-off prompt request without that lease releases its model when complete.
- Prompt residency uses a dedicated, non-persisted ComfyUI runtime profile with a bounded node cache. Prompt startup aligns an app-owned ComfyUI process to that profile before warmup; queue startup aligns it back to the queued model profile, so task-scoped `--cache-none` policy cannot silently disable prompt reuse.

## IPC Contract

- Define renderer-visible APIs in preload and keep TypeScript declarations synchronized.
- Validate untrusted renderer arguments in the main process, especially paths, URLs, task IDs, and destructive operations.
- Additive fields should have defaults for old persisted records. Removing or reinterpreting fields requires a migration plan.
- IPC errors should preserve actionable context for the UI/logs without exposing secrets.
- Avoid duplicate channels that perform the same operation with subtly different semantics.

## Media Safety

- Copy and move are never interchangeable. Migration uses copy-first, verify, update references, then optional source cleanup after explicit confirmation.
- Resolve and validate exact source and destination paths before destructive operations.
- Original inputs, generated images, generated videos, covers, and temporary files must remain distinguishable even if ComfyUI initially places them under a shared output tree.
- Clipboard pixel copy and Windows file copy are separate user actions and must stay separately named.

## Change Checklist

For an architecture-affecting change, record in the task or final report:

1. Which state or process owns the new behavior.
2. Which persisted/IPC fields change and how old data behaves.
3. Which adjacent flow was checked.
4. Whether ComfyUI was offline, connected, or actually executed.
5. Whether any media operation was destructive and how it was verified.
