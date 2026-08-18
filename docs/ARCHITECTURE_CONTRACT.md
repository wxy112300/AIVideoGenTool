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

- A creation draft is mutable UI state.
- Image-to-video and video-extension Create modes own separate prompt-version state; legacy drafts without an extension prompt state are migrated by copying the existing prompt once.
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

## Process and Runtime Ownership

- Track every process started by this application, including development helpers and model-related child processes.
- On normal exit, stop owned watchers/children and cancel or interrupt owned active generation as agreed by the user.
- When an active task exists, request confirmation before closing; a confirmed forced exit still performs best-effort cleanup.
- Do not terminate an independently started ComfyUI Desktop/service. Ownership must be explicit, not inferred only from port or executable name.
- Updating or restarting an app-managed ComfyUI instance must restore connection state and report logs/progress.
- Port `8188` is the application default, but configured endpoints remain valid.

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
