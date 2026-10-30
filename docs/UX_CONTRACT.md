# UX and Visual Design Contract

This is the acceptance contract for product UI work. It turns subjective requests such as "cleaner" or "more polished" into repeatable decisions without forcing a heavyweight design-system migration. Visual language (color, type, spacing, components, motion) is defined in [DESIGN.md](../DESIGN.md); this contract governs behavior and acceptance.

## Product Character

The application is a focused local creative workstation: calm, dense enough for expert controls, and understandable without knowledge of ComfyUI graphs. The visual hierarchy should prioritize media, the current creative decision, and task state. Decoration must not compete with content.

The optional external LAN browser follows the approved [mobile-first design](archive/2026-10-18-lan-history-browser/DESIGN.md), primarily informed by Grok Imagine: one media-led experience adapts to phone, tablet and desktop. Cards have no separate title rows. Phone portrait masonry uses two columns and preserves original aspect ratios without clamping/cropping; album uses four columns (three on narrow phones) with uniformly sized, cropped-to-fill thumbnails and no letterboxing. Wider screens add columns at each mode's density. The visible layout toggle and both modes retain the same result order. It does not inherit the workstation's minimum width or creation controls.

The external viewer always contains the full video proportionally in the available viewport, allowing black bars. Center tap toggles playback, outer tap toggles information, stationary hold temporarily accelerates playback, and vertical swipe changes the video in the current filtered/sorted sequence. Native device buttons handle volume. Information mode exposes return, favorite, half-star rating and tag editing; mobile/tablet has no date slider. Browser Back restores the list and its position. Password/pairing is deferred, not a prerequisite for this experience.

Sorting lives inside the Filter sheet, without a separate header select. The NAS replica retains the same favorite/rating/tag display, favorite-only and rating-range filters, rating sorts, layouts and playback. Its favorite/rating indicators cannot submit changes, tags cannot be edited, and the server rejects writes. Read-only access does not remove browse conditions or hide existing metadata.

The Filter header and Reset/Apply footer stay visible while the fields scroll independently. The footer respects the iOS bottom safe area, and its actions remain reachable at every scroll position on phone, tablet and desktop. This layout is shared by the editable LAN browser and read-only NAS replica.

On iOS the progress slider's entire 44px touch target stays above `safe-area-inset-bottom` with an additional 18px clearance; landscape also respects left/right insets. The Home indicator region is outside playback taps/holds/feed gestures. Video may still occupy the full viewport; thumbnail fill rules never crop the playing video.

The progress row has a transparent background. One rating button combines the star and current score; it opens a compact floating rating dialog. A separate i information button opens read-only prompt text on demand. Long prompts preserve line breaks, scroll and render as plain text; empty/error states remain dismissible. Opening either dialog pauses playback and closing restores the prior play/pause intent without changing the current video.

The LAN viewer uses an icon-only sound control and a visible loading ring during initial loading/buffering. Pausing briefly shows the play button, then fades it after about two seconds; an outer tap hides controls for a clean paused frame. Scrubbing captures touch separately from the native range thumb, follows the pointer immediately, coalesces decoder seeks and commits the exact release position while preserving play/pause intent. Progress continues updating even if the slider retains keyboard focus. Feed drags move the picture and settle vertically; returning to the list has a short transition. Reduced motion skips displacement animations. The list provides a bottom-right back-to-top button after scrolling, and boolean filters use an iOS-style switch.

## Source and Prototype Workflow

- The current renderer under `src/renderer/` and `src/styles/`, together with renderer screenshot/fixture evidence, is the interaction and layout source of truth for current work.
- The early `prototypes/legacy/` pages are archived reference material because the user has explicitly identified them as an older design. Their screenshots and behavior are not approval evidence.
- `prototypes/` (outside `legacy/`) holds the 2026-10-20 design-system prototypes. The style tile was approved on 2026-10-21 as the visual reference for [DESIGN.md](../DESIGN.md); page layouts become approval evidence only for items the user has explicitly approved in [the UI design-system task](tasks/2026-10-20-ui-design-system/TASK.md).
- Substantial new modules, navigation changes, or page restructuring must first be resolved against the current renderer DOM, states, breakpoints and preserve list unless the user explicitly requests a new prototype.
- Small production fixes may be implemented directly in the current renderer; update a prototype only when it is deliberately being maintained as historical/reference material.
- When maintaining the archived legacy fragments, run `npm.cmd run prototype:build`; do not patch only `prototypes/legacy/preview/`. New prototypes are plain HTML/CSS/JS without a build step.
- A prototype demonstrates intent. It does not prove persistence, IPC, model support, or runtime success.

## Layout Grammar

- Use one compact application header and one page title. Do not create a second hero-sized title area without user value.
- The application header keeps a single-line global resource monitor in the thin gap directly above the top-right navigation, aligned to the navigation's right edge with only a minimal vertical separation. Desktop shows CPU/GPU utilization, GPU temperature, and RAM/VRAM percentage plus used/total capacity. The right-aligned monitor remains visible alongside centered global notices. Narrower layouts progressively move or hide lower-priority detail without increasing the desktop header height. Queue may retain its larger diagnostic cards, but both surfaces share one polling source.
- Keep primary content within a consistent page gutter and readable maximum width. Media viewers may use available width when that materially improves inspection.
- Use the spacing scale defined in [DESIGN.md §4](../DESIGN.md#4-间距圆角尺寸); derive exceptional spacing from an explicit layout need.
- Align labels, controls, card edges, and baselines across a row. A control should not float merely because adjacent copy has a different length.
- Use columns based on available width, not current item count. History waterfall/gallery columns must not collapse just because an item was deleted.
- In detail viewers, thumbnails and the main media belong to one viewer region. Use a single vertical thumbnail rail for image versions, newest first, numbered continuously without meaningless batch grouping.
- Long pages keep navigation/return and important contextual actions reachable through sticky or local persistent placement.

## Hierarchy and Density

- Each page or card region has at most one visually dominant primary action.
- Titles identify; helper text explains only what is necessary. Do not repeat the same state in headings, badges, paragraphs, and cards.
- Avoid nested bordered cards unless each boundary represents a real independent object or interaction group.
- Prefer whitespace, alignment, and typographic hierarchy over extra borders and background panels.
- Keep technical details progressively disclosed. Put the most useful snapshot beside the primary content; extended logs and parameters can follow below.
- Gallery mode uses smaller tiles to maximize visual scanning. Waterfall mode can show richer metadata and larger previews.

## Typography and Color

- Reuse existing CSS variables/tokens. New colors must represent a semantic role or extend the documented palette, not solve a one-off selector.
- Body copy, labels, metadata, headings, and monospace paths each use a consistent size/weight tier.
- Page titles must not dominate the viewport; control labels must remain legible without competing with media titles.
- Status colors retain consistent meaning: success, warning, error, active/accent, and neutral. Do not use accent blue for unrelated decoration.
- Maintain readable contrast in default, hover, focus, disabled, and selected states.

## Interaction Rules

- Never replace a focused editable control during unrelated updates. Prefer targeted state updates; when rerendering is unavoidable, preserve focus, selection, and scroll position.
- Buttons communicate an action; tabs switch peers; selects choose one value; badges report state. Do not style one semantic control as another.
- Destructive actions require a styled application confirmation dialog, not a browser-native alert. The default focus must not make accidental confirmation likely.
- Drag/drop targets accept click-to-select as an equivalent path. Dropping a new reference over an occupied target replaces it only with clear feedback.
- Media reference controls expose an immediate remove action so the prompt can be retained while the image is changed or cleared.
- Seed fields follow the video interaction: blank means random, with explicit randomize and clear actions. Do not invent incrementing seed semantics.
- The detail page remains within its parent navigation context. For example, History stays selected while viewing video or image details.

## Async and Media States

History thumbnail jobs belong to an application-lifetime background queue. Scrolling, leaving the page and hover cleanup release UI consumers and lower pending priority; they do not cancel accepted cache lookup, decoding/refinement or persistence. Visible/interactive requests reorder waiting jobs without preempting running thumbnail work. Returning reuses the in-flight task. Source invalidation/deletion and application disposal may cancel temporary work; exit never deletes completed thumbnail images or metadata.

- Environment scanning is an application-wide lifecycle, not a Settings-only state. Startup and later rescans must show a cross-page scanning notice and replace it immediately with completion or failure feedback when the scan itself settles.
- Overlapping environment scans use the newest request as the visible result. A slower stale scan must not overwrite a newer path selection, status, completion notice, or error.

Every asynchronous media surface must distinguish:

- **Loading:** neutral media background plus visible spinner or skeleton; do not show an error while cache generation is still in progress.
- **Empty:** explain what the user can add or do next.
- **Unavailable:** explain which file/service/dependency cannot be reached and offer a relevant recovery action.
- **Error:** concise cause plus retry/log/details when useful.
- **Ready:** remove loading affordances and reveal the actual media without layout jump where practical.

Hover preview failure must not destroy a valid static cover. Detail playback/viewing and thumbnail loading may use different sources but must share path-resolution rules.

## Page-Specific Contracts

### Create

- The Continuum multi-segment editor persists its confirmed layout, stable page IDs, per-page text versions, locks, active page and whole/segment view in the selected creation draft. Keystrokes save a durable editing buffer; blur/navigation commits a text version without rebuilding the clicked tab. Layout control edits do not change the confirmed layout until adoption; tail pages are archived and restored by ID when growing again. First entry copies the current native intent once; existing scripts and cleared content are not repeatedly replaced. Native prompt/duration and other creation modes retain independent state; a remembered editor key from another model cannot change the native enqueue route. Global text explicitly chooses story notes (not sampled) or shared constraints (prepended to each segment); changing the role requires segment review. The narrow FL2VA first-image route can enqueue one frozen parent task. Completed group-Run History Continue opens Extend with the original profile/seed and fixed chunk length; only future pages are edited. Source head/files are checked before enqueue and sampling. The independent AV-export selector is hidden in group mode; required Run Storage remains enabled. The Strata single-first-image route can plan the whole story and draft unlocked pages in bounded batches; automatic mode targets the package and assisted page mode targets that page. Adoption checks source identity, current text/locks and layout without overwriting later edits. UI enqueue evidence does not certify runtime completion.

- The current media input and prompt are the dominant decisions; advanced generation controls remain compact.
- Every create mode renders its current queue-blocking reason inside the sticky submit bar beside the queue action, so the user can diagnose a disabled action without scrolling to the end of the form.
- Image-to-video and video-extension mode switches resolve their own configured default model independently. An extension model or LoRA selection must not overwrite the image-to-video model when returning to that composer.
- Each prompt composer exposes a clear-current-version action; deleting the last version leaves one blank editable version.
- Prompt composers render rich reference chips and text marks while persisting plain text. `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` use editor history; clearing a prompt version retains its application-level undo/redo transaction. Preserve IME composition, consecutive newlines, selection and focus across refreshes; pasted markup must not become executable HTML.
- Prompt composers grow naturally with content. Two-column desktop layouts may raise the 320px scroll limit into unused viewport space, reserving the other generation controls and a bottom margin, capped at 45% of viewport height (with the existing 320px minimum limit). Single-column layouts retain the compact limit. Recompute on layout/viewport changes, never on document scrolling; do not animate typing-driven height changes or remount the editor.
- Clearing a draft takes effect immediately and offers a six-second Undo notification restoring the complete draft. Hover/focus may pause the notification lifetime; queued snapshots remain unchanged.
- Scalar video controls (duration, resolution, ratio, Seed and LoRA weights) update in place. Adding/removing/reordering LoRAs updates their list and dependent controls without replacing the prompt editor or media player. Draft-save acknowledgements must not rebuild Create; structural changes preserve the viewport and media-column scroll position within the new layout's bounds.
- Reference-chip hover previews use the application's unique body tooltip, including media thumbnails; editor overflow must not clip the preview. Generation modes retain their meaning in Create and Extend: native locks the recommended 15.1-second sampling window, unlocked explicitly permits the 30-second window, and Continuum edits a shared Run with per-segment prompts. Pages do not imply cuts or independent samplers. Motion Context hides only Continuum. Extend limits subtract each route's inherited prefix and respect actual temporal alignment; stored duration remains visible new seconds, without a second subtraction. Existing managed Runs retain frozen chunk duration.
- Prompt assistance updates the same primary prompt editor and supports alternatives/undo where present. Do not introduce a second competing prompt box.
- Quick instructions insert or refine combinable intent; they do not artificially restrict the user to one capability.
- Image creation supports multiple reference pictures using human-readable `<Picture N>` references when the selected model supports them.
- Batch image count is a bounded control based on the active model. Upscaling belongs after result inspection, not in the initial image generation path.
- Image resolution presets are shortcuts. Custom mode exposes a free short-edge slider and number input; they use model alignment rather than snapping to presets. Selection, thumb/fill and output summary stay synchronized without rebuilding the prompt. Source-only tools retain their existing controls.

### Queue

- One logical task is one queue card. The active task expands in place to show stage, progress, preview, elapsed time, telemetry, pause/cancel actions, and recovery state.
- Pending and completed tasks stay compact. Do not duplicate the running task in a separate section.
- Continuum parent cards browse their frozen whole prompt, global notes/shared constraints and adopted segment prompts in place. Extend numbers only future pages using their Run offset. Copy targets the selected page; changing pages never edits the snapshot or follows sampling progress automatically. Native cards retain their single prompt.
- Progress must distinguish total pipeline progress from local node/step progress.
- The queue is a vertical sequence. It may contain one horizontal batch divider between task cards; the divider is an in-flow queue item, not a right-side column or a second queue.
- The divider marks the end of the current batch. Tasks below it keep their queue cards but expose a derived deferred state; completed tasks are removed and must not be shown as queue items.
- The divider is a compact, centered, single-line in-flow control: its widened drag bar and explanation stay centered, while the remove action remains at the far right. The divider must stay after at least the first active task; its text background masks the center rule without adding a text box border. Task cards and the divider can be moved across one another using the same vertical ordering model. Removing the divider only clears the marker; it must not auto-start a paused queue. An ordinary “start queue” action honors an existing divider, while explicit “continue later tasks” clears it and resumes the remaining queue.
- Waiting-task overflow actions include “render through here”, which places the divider after that task without changing the task's persisted status.
- Ending the queue or choosing “finish this task, then pause” places or moves the divider immediately after the running task. When the current batch reaches the divider, it acts as a stop line: the queue stops before the first task below it and the divider is cleared in the same update. Explicitly continuing later must resume the existing queue session when possible, clear the divider, and restore normal waiting/running state without starting a duplicate worker; starting a manually divided queue must leave the divider in place until that stop-line transition.

### History

- Image and video collections use distinct top-level tabs.
- Layout column count responds to container width, not record count.
- Large galleries window card DOM around the viewport without truncating records. Filtering, counts, batch selection/ranges and detail navigation use the full filtered collection. Masonry/album layout, the date timeline and return anchors share numerical positions, including offscreen items; they must not require mounting every card. Keep focused cards attached, maintain keyboard access across window boundaries and release media consumers on departure while preserving the application-owned thumbnail jobs described above.
- History cards use one badge row and two text rows; only the model badge shrinks. The filename and full model remain available on hover and in actions. Masonry uses 10px gaps and original media ratios; album uses 8px gaps and square covers.
- Desktop Appearance exposes masonry columns 3–6 (default 3) and album columns 4–10 (default 5), saved immediately and shared by image/video History. Narrow containers may reduce columns to keep cards usable. Regular and virtual galleries use the same density calculation; retained layouts invalidate their geometry when the preference changes.
- The filter button toggles an inline sticky filter lane; hidden conditions remain effective. Models are an OR multi-selection; included tags are an intersection and any excluded tag removes the result. Tags are edited individually in a searchable picker whose order, scroll and focus survive result refreshes. Rating uses half-star bounds and video duration uses discrete stops; image browsing ignores video-only duration conditions without erasing the video selection.
- Batch selection survives gallery re-layout. The shared sticky area hosts batch actions; the tag dialog commits common/partial tag changes immediately and offers one Done action. Delete confirmation includes type/count, names and at most six thumbnails while preserving linked-file safety checks.
- The date scrubber floats in the right gutter without reserving gallery width, appears only for a time sort and scrolling content, and supports pointer drag, day arrows, month PageUp/PageDown and Home/End. An explicit user scroll intent cancels pending detail-return anchor corrections.
- Individual tags are edited on detail pages below the primary media/viewer; batch edits use the tag dialog. Thumbnail cards remain quiet and show no tag list.
- The tag editor uses pill tokens, free text committed with Enter, and suggestions from existing tags. Tag identity is case-insensitive; the filter can select multiple tags and matches records containing all selected tags.
- Video detail keeps at most four frequent unassigned tags in a single common row. Typing searches the existing tag collection in a positioned suggestion list with pointer and arrow/Enter selection; Esc dismisses the list, and unmatched text can still create a tag. The full collection must not expand the common row into a tag wall.
- Context menu actions are explicit: view details, copy file, copy path when supported, open containing folder, use/continue creation, and delete.
- Loading covers use skeletons and decode before replacement; visible cards stagger on first entry and collection changes, respecting reduced motion. Missing media retains recovery guidance.

### Details

- Use one application navigation layer. Do not add a second page-level navigation system.
- The primary media and its version/thumbnail rail form one viewer.
- Put concise generation information to the right of the viewer when space allows; include generation time.
- Place deeper parameters/performance below the primary viewer.
- Video details keep a sticky back/position/previous/next bar and a flat sidebar grouped as work, creation, files, versions, then record deletion. Copy precedes locate; version actions remain scoped to the selected source version. Below-player tags use a persistent inline input, with the full prompt in its own row. Record cards initially balance actual heights across two columns, stay in their assigned columns during disclosure changes, and collapse in original order on narrow screens. Output files use compact rows with named icon actions and media-type badges; AV technical facts may collapse, while actionable missing/invalid reasons remain visible.
- Video transport keeps previous/next reachable in fullscreen, with progress above the controls and volume expanding horizontally. Duplicate title/curation chrome appears only in fullscreen. Fullscreen item changes preserve the player element and synchronize the selected prompt, files and download filename.
- Image actions distinguish copy pixels from copy file. Core actions include locate, improve resolution, set cover, continue editing, and start video creation.
- Image detail uses the same flat sidebar zones, full-width edit request and fixed, initially height-balanced record columns as video detail. Source versions hide edit requests, generation parameters and input snapshots; their deletion protection remains. Reference previews show actual saved crop/markup output and disclose Mask state. Lightbox fills the viewport, locks/inerts the background, supports pointer-centered zoom and pan, version navigation, reset and blank-area/Escape close, and restores focus. Closing after version navigation synchronizes detail and subsequent actions to that version. Image enqueue preserves the explicitly selected parent when the actual base input still matches, including versions with identical output content.
- Image slot deletion removes the slot, including Slot 1, renumbers the remaining references and prompt references, and promotes the next reference to base. Clearing media keeps its slot. Removing the last slot restores the add action; models that require a base still enforce their input gate.
- New shell, overlay and staged player controls receive their visual classes and SVG icons before connection. Icon refreshes preserve existing SVG nodes. Video version indicator animation state is scoped to the asset, so paging between assets does not animate a selection from another asset. Upscale option refreshes preserve the source thumbnail video when its source is unchanged.
- Opening Upscale and completing an environment scan preserve the detail media node, playback and open Lightbox. An open Upscale refresh preserves scroll and the active model picker; refresh waits for an active input to blur. The compact dialog shows the selected source version and only the chosen model's supported controls. Missing files/components and invalid targets block enqueue with visible reasons; unavailable benchmark estimates remain pending. Large sources retain access to supported native-size enhancement. Existing queued snapshots and retired-model task recovery remain compatible.

### Settings

- Show only information that supports a decision or recovery action. The pending-settings bar lists changed field names across sections, removes reverted fields and never includes setting values. Prompt creativity uses synchronized range/numeric controls; Strata reasoning keeps all four supported levels, including off.
- Long startup library migration/loading has a compact, minimizable status window with stage and actual record counts. Percentage is per stage; backup/switch work without a count stays indeterminate. Migration and ordinary reopening have distinct titles. It has no cancel/close action during the transaction, adds no settings page or explanatory card, and hands off automatically when the main UI is ready. Failures retain the existing recovery choices; a display failure cannot corrupt or abort storage.
- The settings navigation follows the approved section order and becomes a wrapped grid on narrow screens. A bottom commit bar appears only for pending changes or a save in progress; it counts changed settings, supports save/discard and Ctrl+S, and remains below dialogs. Leaving with pending edits offers cancellation or discard. Detected ComfyUI/Python values remain automatic until edited; empty model selects waiting for scan results preserve saved values. Browsing sections or scanning must not create pending changes.
- Separate ComfyUI environment, nodes/dependencies, application paths, temporary H3 acceleration settings, video models, image models, prompt assistance, upscaling and appearance by user goal. Desktop appearance applies and persists immediately; it does not submit or discard other unsaved settings. Save failure restores the previous appearance and offers visible error feedback. Navigation transitions run only when the page changes; telemetry refreshes never trigger them. Sticky offsets follow the measured topbar height, including narrow layouts and zoom.
- `ComfyUI environment` owns the selected installation, core/data directory relationship, service state, Python binding, core compatibility, version/update evidence, and safe core repair actions.
- `Nodes & dependencies` owns installable custom nodes and Python/runtime packages, including `llama-cpp-python` and H3 acceleration dependencies. Dependency repair must not be labeled as a generic ComfyUI core repair.
- H3 performance controls live in Settings under `Performance & acceleration`: dense attention, sparse strategy, native runtime mode and memory compiler are separate persisted selectors. There is no H3 Memory control and no `H3-Optimizations` card. The ComfyUI environment page may show core/package evidence but must not create a second H3 strategy selector.
- H3 selectors are task-level execution inputs for compatible H3 workflows. Saving dense attention, sparse strategy, native runtime, or compiler settings refreshes waiting H3 tasks; a running task remains unchanged, and a failed/cancelled native task refreshes when the user resets it for another attempt. A started Create Run or a bound inherited extension keeps its frozen profile and seed through pause/reset; random-seed actions are hidden. Create copies get a fresh Run; extension copies retain their selected parent and cannot silently fork it. Ordinary Queue editing cannot discard a started execution identity. Spectrum, Turbo/SLA, live preview and the final video VAE keep their own compatibility/readiness states. A page reorganization must not silently migrate or delete these settings.
- Offline file detection is useful and must not be presented as failure merely because ComfyUI is stopped.
- Model cards report file presence, custom-node installation, and runtime validation as separate evidence. Complete weights remain ready while ComfyUI is offline; only a confirmed missing file/node or failed online check is an error.
- Prompt-assistance cards use the same evidence rules as video, image, and upscale cards. An installed node with runtime validation pending remains statically ready; implemented native `CLIPLoader + TextGenerate` profiles must not be labeled as pending integration.
- Every catalog custom-node card reports its locally scanned package version and metadata source. Repositories without a published package version report their scanned Git commit instead; UI copy must not substitute a hardcoded local version.
- Missing dependencies include an info action with source and exact target location; installation/update actions expose logs.
- Settings groups all scanned catalog nodes separately from the three runtime dependencies. Cards retain offline/runtime evidence, source/location and recovery actions. Active installs expose a live console; completed logs collapse but remain reachable. Progress stays indeterminate unless the installer supplies a real numeric value. Cancel waiting atomically removes only queued node installs and never cancels the active install; individual active cancellation stays explicit. Menus close on Escape and restore their trigger focus, and installation motion respects reduced-motion settings.
- Multiple ComfyUI installations show path and version evidence and allow explicit selection.
- LAN browsing uses one switch for start/stop/retry. A confirmed start failure unchecks and persists the switch off and shows one error notification; a new enable attempt retries. Healthy running shows only reachable address rows with copy/open actions, without a duplicate running label or separate retry button. Address rows stay inside the card with normal bottom padding; startup/no-network feedback remains contextual.
- Settings model-download links use the selected Hugging Face source, keeping repository/revision/file identity and query parameters. Official disables rewriting; older mirror-enabled settings resolve to hf-mirror.com until explicitly changed. File-only endpoints leave model cards on the official site; custom HTTPS origins are validated before saving. Source descriptions belong inside the expanded select, and the custom field appears only when selected. This setting does not rewrite GitHub links or third-party runtimes' internal downloads.
- Installation/scan refreshes within the same Settings panel preserve document scroll and the visible node/runtime card anchor; switching panels does not inherit the old panel's anchor.

## Manual UI Check

For shared renderer or substantial CSS work:

1. Run the app or the relevant current-renderer fixture/capture harness. Use a standalone prototype only when the user explicitly asks to maintain or review that historical artifact.
2. Inspect at approximately `1280 x 800` and `1440 x 900`; also shrink until the first responsive breakpoint to catch overflow.
3. Check Create, Queue, History, Settings, and every detail page touched by shared selectors.
4. Use keyboard input in editable controls, scroll long content, open dialogs/context menus, and exercise loading/empty/error states affected by the change.
5. Capture screenshots when visual judgment is material and compare hierarchy, alignment, density, and reachability—not only whether elements exist.

## Anti-Patterns

- Large decorative title blocks that force primary controls below the fold.
- Arbitrary card-within-card-within-card composition.
- Fixed history columns chosen from item count.
- Important back/delete/start actions accessible only at the top of a long page.
- Browser-native dialogs in an otherwise styled application.
- Black media rectangles with no loading or error state.
- Rerendering the full form on each progress or telemetry update.
- Adding UI controls that the selected model/workflow ignores.
