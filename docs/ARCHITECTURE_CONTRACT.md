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

### Optional LAN history browser

`src/web/` is a separate mobile-first browser entry with no preload. The desktop shell owns `electron/lan-browser-host.ts`, which starts/stops the opt-in HTTP listener from saved Settings and disposes it on normal application exit. `ApplicationRuntime` remains free of HTTP policy; ComfyUI is not required to browse.

The LAN adapter projects video browsing DTOs, facets, fixed-order paginated queries and asset/version media. User-authorized prompt viewing uses a separate on-demand, read-only asset/version endpoint; it returns only identity and the prompt text, using the same version LoRA formatting as desktop History. List/detail browsing DTOs still omit prompts. Only favorite, half-star rating and tags can be written, through the existing serialized metadata service with revision checks. It must not expose AppState, arbitrary file access/paths, workflow graphs, creation, queue or Settings methods. Browser and API share one origin; Host/Origin checks and private-network access remain transport boundaries. Pairing/password is deferred by product decision; the Settings switch defaults off and identifies the current unprotected access.

Desktop and LAN share filtering, preferred-version selection, range streaming and the existing revision-guarded `history-covers/v3` cache. Cache hits are served directly; misses use a bounded serial CPU FFmpeg producer with the same candidate/scoring rules. No GPU generation or whole-library cover regeneration is involved. The desktop process remains the only state writer.

The canonical filter shape uses `modelIds: string[]` (empty means all). Normalization accepts legacy `modelId` when `modelIds` is absent; explicit empty `modelIds` wins. New LAN query URLs and responses use the canonical shape. This does not add desktop filter persistence or change history/queue asset identities.

The optional [NAS browser tool](../Tools/NasBrowser/README.md) runs independently of Electron from a `StudioLibrary` browsing projection plus synced media. Its catalog retains asset/version IDs and relative paths, includes authorized prompt text, favorite, half-star rating and tags, and excludes AppState and absolute paths. It exports only existing files inside the configured media root and source-validated cached covers; the NAS performs no generation or desktop state writes. `BrowseLibraryInfo.readOnly` disables metadata mutations while preserving all browse filters, sorts and metadata display; absence preserves desktop editing behavior. Older projections without favorite/rating remain readable as false/null until the updated PC publisher synchronizes them. NAS transport rejects all mutation methods, confines files through real paths, and checks configured browser origins including the Docker host port. Incomplete catalogs retain the last good snapshot, incomplete media stay unavailable and are retried on polling. The App maintains migrated-library projections automatically; the standalone CLI/watch exporter remains available for legacy unsplit state.

The NAS tool accepts independent `libraryRoot` (catalog/covers) and `mediaRoot` (video) mounts; the PC exporter uses independent `libraryRoot` and `outputRoot`. Portable media paths resolve only within the media root and cover paths only within the library root. Omitting `libraryRoot` preserves the initial same-root configuration. This does not migrate the desktop state or make the original AppState directly consumable by the browser service.

Successful PC video-cover cache writes notify the NAS publisher after the image and validation metadata are installed. The publisher coalesces these with its latest committed snapshot, without requiring a new desktop library commit; closing it detaches the cache subscription. Renderer preview display is separate from cache persistence, and image-history cache writes do not trigger video-library publication.

## Ownership Map

| Area | Primary owner | Contract |
| --- | --- | --- |
| Renderer UI and transient draft | `src/main.ts`, `src/style.css`, `src/renderer/pages/` | Display and edit state without losing input focus or mutating queued snapshots; the page composition layer receives explicit renderer dependencies. |
| Renderer preload/client boundary | `src/renderer/entry.ts`, `src/renderer/studio-client.ts`, `src/renderer/context.ts`, `src/renderer/contracts.ts` | Read `window.studio` once, project it into application/events/assets/host capabilities, and pass only the needed capability views into page modules. |
| Renderer render lifecycle | `src/renderer/render-coordinator.ts`, `src/renderer/state-events.ts` | Explicit command renders stay immediate; event-driven refresh requests are coalesced per animation frame; targeted high-frequency patches remain responsible for stable DOM regions. |
| Shared domain logic | `src/core/` | Deterministic, testable transformations without Electron globals. |
| Queue snapshots and pure mutations | `src/core/queue-task-factory.ts`, `src/core/queue.ts` | Create immutable execution snapshots and transform queue state without IPC or process globals. |
| Shared persisted/IPC types | `src/types.ts` | Backward-compatible shapes or explicit migrations. |
| Embedded application composition | `electron/application-runtime.ts`, `electron/services/`, `electron/ports/` | Construct application services and injected state/filesystem/process/runtime seams without importing Electron or owning the window shell. |
| Privileged application lifecycle and composition | `electron/main.ts`, `electron/preload.cts` | BrowserWindow, IPC transport, dialogs, process ownership, clean shutdown, event bridge, and composition of the embedded application graph. Queue/runtime/output orchestration is owned by named application services; main supplies platform implementations and close-decision callbacks. |
| Queue mutation IPC | `electron/queue-registration.ts`, `electron/queue-control-ipc.ts`, `electron/queue-control-service.ts`, `electron/queue-mutation-service.ts` | Register and execute queue commands against the application queue service; execution and side effects remain in the queue application modules. |
| Runtime integrations | `electron/services/` | ComfyUI, environment, media, monitoring, prompt helpers, and child processes. |
| Persistence | `electron/store.ts` | Defaults, migrations, queue/history/settings durability. |
| Workflow templates | `workflows/` | API-format workflow graphs adapted through model-specific code. |
| Product prototypes | `prototypes/` | Approved interaction/layout reference, not production state or proof of runtime support. |

Large entry files are an existing risk, not a pattern to expand. When work introduces reusable state or transformation logic, extract it into a focused `src/core` module or Electron service with tests. Do not perform an unrelated big-bang rewrite.

## Current Composition and Validation Notes

- `electron/application-runtime.ts` is the embedded application composition root. It loads state, constructs the application services, exposes the initial-state barrier, and starts lifecycle alignment through injected ports. It intentionally has no Electron globals, BrowserWindow policy, instance lock, daemon, or HTTP server policy.
- `electron/main.ts` is the Electron composition root and owns BrowserWindow/native shell behavior, named IPC adapter registration, process ownership, clean shutdown, and the single event bridge. Queue/runtime/output orchestration is provided by `QueueRuntimeService` and `ComfyOutputService`; main supplies their platform callbacks and retains only the process-exit/window-close decision shell. This is an Electron modular monolith boundary, not evidence that a headless/API boundary already exists.
- `src/renderer/entry.ts` is the only production TypeScript preload construction site; it reads `window.studio` once. Page modules receive capability views through `RendererContext` and do not access the preload global directly.
- P03 only establishes same-frame event-refresh coalescing and removes an invalid Settings full render from the performance polling path. Synthetic tests and current-renderer fixture smoke are evidence for those boundaries; they are not Chromium Long Task or cold/warm startup measurements.
- C04's `scripts/capture-c04-electron-evidence.mjs` measures the production entry in an explicitly isolated userData/state/media directory and records startup milestones, renderer DOM/Long Task data, CDP traces, screenshots, migration and bounded close results. Its default-off `C04_DISABLE_HARDWARE_ACCELERATION` seam and the corresponding no-sandbox/software-rendering launch switches exist only for hosts where the test renderer cannot start with the host GPU/sandbox; they are not a normal product policy or evidence of equivalent production GPU/security behavior.

### Agent-controlled renderer Application API

Agents and local test harnesses may operate the real application through an explicitly launched Electron renderer and a loopback CDP connection. The supported path is:

```text
loopback CDP -> renderer window.studio -> preload IPC
  -> Electron adapters -> ApplicationRuntime/services
  -> ComfyUI, queue, history and persisted media
```

`AppApi` in `src/types.ts` is the type contract, `electron/preload.cts` exposes the controlled methods, and `src/renderer/entry.ts` reads the preload global once before projecting it through `src/renderer/studio-client.ts`. This path is useful for real application/API smoke tests such as environment scanning, app-managed ComfyUI startup, enqueueing, queue control, state observation and history/media verification. The reusable procedure and evidence vocabulary live in [`AGENT_ELECTRON_API_RUNBOOK.md`](AGENT_ELECTRON_API_RUNBOOK.md).

This loopback bridge is a test/operator seam, not a public HTTP, Headless, Browser or LAN API. It must be enabled explicitly, kept on `127.0.0.1`, and excluded from normal product startup defaults. A raw ComfyUI `/prompt` or `/system_stats` call proves only a lower-level service behavior; it does not prove that the renderer, preload, IPC, queue snapshot, history metadata or media path worked. Likewise, a successful one-model image smoke must not be generalized to every workflow or to the future Headless/API plan.

Application methods must retain their receiver across the composition boundary. Do not spread or destructure class-owned service methods into a capability object unless they are explicitly bound; prefer a bound adapter or closure. A method-level smoke test should call the exposed capability and exercise the relevant state transition, because a typecheck can miss an unbound method that becomes `undefined` or loses `this` only at runtime.

## State Contracts

### Library durability and location

The desktop repository keeps settings, drafts, queue, configuration backups, cover cache and app-owned auxiliary images in system Documents (`app.getPath("documents")`) under `Local Video Studio/Data`. Video/image History uses the separately configured Library (default `Local Video Studio/Library`); an existing library location is retained. Electron userData, sessions, Chromium caches, managed runtimes and GPU coordination remain independent. Explicit `--user-data-dir` profiles keep their own business root and Documents subtree; `--migrate-profile-data` exercises migration entirely inside that isolated profile. AppApi snapshots and asset/version/task identities remain compatible. Library location remains distinct from media output and Run/AV/Motion payloads.

The user-data startup transition inventories only owned state files and auxiliary folders, rejects links/conflicting destinations, and writes a `copying` intent to `Data/user-data-migration.json` before installing any business file. Each active file and exact original under `Data/migration-backup` is copied to a flushed, SHA256-verified file candidate; transient Windows file locks are retried. The transition never renames the whole Data directory. Interrupted copying retains verified files for reuse; startup cannot load the repository until the record reaches `prepared`. Existing prepared/complete records remain compatible. Normal repository transactions update path-bearing fields in hydrated drafts, queue and history; prompt text is unchanged. Only after successful loading and verification of all originals, backups and auxiliary files are unchanged source files removed. Failures retain recoverable data and block startup; a completed transition never imports stale AppData again. User-data scan/copy/verify/reference-update/cleanup reports to the existing startup progress window with saved locale/appearance. Standalone Agent preferences use Documents `Local Video Studio/AgentPreferences` with a verified original; its process coordination and generated runtime state remain local.

Library objects and long text are content addressed; immutable commits include complete ordered record references and explicit deletion markers. The state locator selects the authoritative commit only after independent read-back verification. Initial migration retains the complete legacy state, verifies identities/content including image history and unknown extensions, and switches the locator last. A different/nonempty library destination is a conflict, not an implicit merge. User-initiated library/video/image directory changes require explicit confirmation and a real move with progress. Same-volume moves rename files; cross-volume transfers are verified before durable path commit and source removal. Journals recover pre-commit interruptions to the old paths and finish committed moves at the new paths. Cleanup failure is incomplete migration, not successful copy-only relocation. Library identity is retained; configuration backups and the initial migration original remain protected.

Startup migration reports transient stage/record progress before the main renderer is ready; normal opening of an already migrated library never creates the migration window, including slow reads. A separate read-only window has no preload or AppApi; progress observers cannot reject storage transactions or report completion before the successful locator switch. Counts/percentages describe actual work in the current stage; uncounted stages are indeterminate. Fast completion does not flash a window. The status window closes after main-file load and the initial-state barrier, or before the startup recovery dialog on failure; closing it during startup must not trigger automatic application quit. Its theme comes from the built renderer stylesheet and saved appearance.

Video and image targets remain within the current configured ComfyUI output root. Both backend validation and the picker enforce the boundary; real-path checks reject redirected targets outside it. Queues must be idle before migration; History, image versions, drafts and queued file consumers retain IDs and follow moved paths. Independent Run/AV/Motion owners are not implicitly split or moved with media directories. Only confirmed settings saves may change persisted storage paths; appearance saves remain isolated.

Existing I/O/permission/parse/structure/migration errors never initialize an empty state. Verified multi-generation backups, corrupt-original retention and a recovery-source log support startup recovery. After migration, a pre-migration state cannot silently replace the active library. A missing/broken active library blocks startup and offers retry/location recovery. Save failures propagate and restore memory; exhausted Windows rename retries never truncate-copy the primary. Local OS-owned writer leases expire with the process; libraries are not permanently bound to a host or profile path. Multiple active writers/automatic PC merges are unsupported.

The App automatically maintains committed browsing projections under `<Library>/StudioLibrary/<libraryId>`; Drive Client owns synchronization paths, with no NAS publishing directory in App settings. Library relocation pauses/drains publication and moves verified publication objects and pointer with the library, preserving generations. Unavailable media does not block metadata relocation; pending publication resumes from the committed new location or the restored old location, never concurrently with moving files. Legacy external publishing folders are not touched. Records, Prompt objects and cached covers precede a checksummed complete manifest and atomic pointer; missing media is distinct from explicit deletion. The NAS v2 adapter validates complete generations into its own local SQLite data directory and retains the last valid snapshot across upload disorder and restarts. It never writes to Drive source/media mounts; legacy `catalog.json` mode remains explicit. Procedures and recovery limits are in the [storage/NAS runbook](runbooks/LIBRARY_STORAGE_AND_NAS.md).

### Draft and queue

- Each of the three Create modes owns independent mutable UI state. Image-to-video and video-extension keep complete, separately persisted draft snapshots for model, workflow, media, prompt versions, references, LoRAs, dimensions, duration, sampling, interpolation, motion, seed, and acceleration choices; the visible `draft` is only the active projection. Image editing continues to own `imageDraft`. Switching modes must restore the target snapshot without copying parameters from the page being left.
- An asynchronous prompt operation is owned by the exact Create mode that started it. Completion updates and persists that mode's latest draft snapshot even after navigation. Only the owner projects elapsed progress and cancellation; other Create modes disable prompt enhancement while keeping the shared prompt-model stop/unload control synchronized and available.
- Legacy drafts without separate image-to-video/video-extension snapshots are migrated by preserving the active mode as its snapshot and creating the missing mode from defaults. Legacy drafts without an extension prompt state are migrated by copying the existing prompt once.
- Submission creates a complete execution snapshot: model, mode, prompt, inputs, output settings, seed, workflow options, runtime profile, and display metadata needed later.
- Later draft changes cannot alter queued or running work. The MiniMax H3 final video VAE is an explicit runtime-policy exception: a waiting H3 task resolves the current VAE setting and installed alternatives when it is claimed, then keeps that concrete backend fixed for the rest of the task. A task already computing or submitted is never rewritten.
- A multi-output image batch can be one logical queue task while retaining individual output/version identity.
- Pausing, cancelling, retrying, and restoring must use explicit task states; UI labels are projections of state, not the state itself.
- The queue may persist one optional `queuePauseBoundary`, expressed as the number of active queue tasks above a horizontal divider. It is always between the first and last active task, never before the first task; it is a batch boundary, not a new persisted task status. `deferred`/“待后续执行” is derived only for waiting tasks below that boundary.
- Queue mutations, task completion/removal, and reordering must adjust the boundary with the same active-task ordering. Completed tasks are removed without losing the divider's relative position among the remaining active tasks.
- Pausing after the current task places the boundary immediately after the running task (or after the first pending task during the startup race). An ordinary queue start honors an existing boundary, while an explicit continue action clears it and reuses an existing worker/session when one is still finishing. When completion removes every active task above the boundary, the divider is treated as a stop line: clear it and stop the queue in the same state transition so the first task below it is never claimed. Neither path may start a duplicate worker or leave `queueRunning`/lifecycle state stale.

### History and media

- The generated media file is the durable artifact. History metadata makes it discoverable and reproducible but must not fabricate media availability.
- Video history and image-project history are distinct user-facing collections even if storage helpers are shared.
- Favorite, rating, and user-defined tags are top-level history/project curation metadata. Tags are normalized on load and IPC writes (trimmed, whitespace-collapsed, case-insensitive identity) and default to an empty list for legacy records.
- Curation metadata updates use the metadata IPC path and must not replace the primary media element; the renderer may patch the detail controls in place while playback continues.
- Image projects keep all derived versions in one project lineage. The newest successful version becomes the default cover unless the user explicitly chooses another.
- Path resolution must support existing records after restart and preserve legacy records through explicit fallback/migration logic.
- Cover images are derived cache artifacts. A missing or stale cover may be regenerated without modifying the original media or history identity.
- Deleting from history removes both the selected record/project data and the corresponding media only after confirmation. Partial failure must be surfaced and must not silently leave metadata claiming success.
- Video deletion with shared History/queue/draft references requires a second consequence confirmation, not a permanent veto. Approval binds the selected target and current matching references; changes require renewed confirmation. Delete only the selected files/records, never cascade into dependent records or recursively remove a Continuum Run. Retained references may become missing and use existing inspection/fallback behavior; immutable queued snapshots are not rewritten.

### Settings and environment

- The selected ComfyUI installation, the connected service, and discovered installations are different concepts.
- File-based discovery works while ComfyUI is stopped. API verification augments discovery after a service is reachable.
- Multiple installations must remain visible and selectable. Never silently change the user's selected installation because another scan result looks newer.
- Store portable identifiers and paths where required, but never bake one developer machine's username or drive into defaults.
- Renderer environment refreshes are owned by one coordinator. Startup, manual scans, service changes, and dependency actions request a refresh through it; only the latest request may commit the shared scan snapshot or lifecycle state.
- Environment scans have explicit `full`, `runtime`, and `dependencies` scopes. Runtime refreshes reuse file/GPU/system evidence and recheck service, core, and node registration; dependency refreshes additionally recheck Python, llama, acceleration, and workflow packages. Missing or incompatible cached baselines always fall back to a full scan.
- An environment scan snapshot is immutable renderer evidence with its own `scannedAt`. Live ComfyUI connectivity remains separate runtime state; Settings may combine both through a pure display selector but must not rewrite API items, model evidence, or timestamps in the stored scan snapshot.
- Settings information architecture separates `ComfyUI environment` ownership (selected installation, core/data directories, Python binding, service lifecycle, core compatibility/update and safe repair) from `nodes & dependencies` ownership (custom nodes and installable Python/runtime packages). The `Performance & acceleration` surface owns H3 Attention and final video VAE selection; H3 VAE changes apply to the next not-yet-started H3 task and never rewrite a running task. Its selectors and persisted settings must not be duplicated or migrated during the environment-page extraction.
- ComfyUI core repair, dependency repair, and H3 acceleration dependency installation are separate operations even when they share scan evidence. A new aggregate environment summary or repair plan may orchestrate these operations only through explicit, additive contracts; it must not turn an acceleration installer into an unbounded ComfyUI repair.
- Settings persistence is owned by one save coordinator. Normal saves use the same output-directory migration gate and post-save model, workflow, locale, and environment-refresh effects; UI controllers must not call the save IPC directly. Desktop appearance uses its dedicated coordinator branch and `appearance` save mode: merge only normalized visual preferences into the current persisted state, preserve the settings draft/native dirty guard, and skip path, model, queue-policy and environment effects. Older settings without this optional field use Azure/Graphite/deep/system defaults.
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
- Prompt resource preflight is measured in the main process after releasable ComfyUI cache is cleared, while the renderer owns the application-styled decision UI. CPU fallback consent is explicit and scoped to one startup or enhancement request; it is never persisted or inherited from a retained CPU model.

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
