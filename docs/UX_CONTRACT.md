# UX and Visual Design Contract

This is the acceptance contract for product UI work. It turns subjective requests such as "cleaner" or "more polished" into repeatable decisions without forcing a heavyweight design-system migration.

## Product Character

The application is a focused local creative workstation: calm, dense enough for expert controls, and understandable without knowledge of ComfyUI graphs. The visual hierarchy should prioritize media, the current creative decision, and task state. Decoration must not compete with content.

## Source and Prototype Workflow

- The current renderer under `src/renderer/` and `src/styles/`, together with renderer screenshot/fixture evidence, is the interaction and layout source of truth for current work.
- The repository's existing `prototypes/` pages are historical reference material because the user has explicitly identified them as an older design. Their screenshots and behavior are not approval evidence.
- Substantial new modules, navigation changes, or page restructuring must first be resolved against the current renderer DOM, states, breakpoints and preserve list unless the user explicitly requests a new prototype.
- Small production fixes may be implemented directly in the current renderer; update a prototype only when it is deliberately being maintained as historical/reference material.
- When maintaining prototype source fragments and shared assets, run `npm.cmd run prototype:build`; do not patch only `prototypes/preview/`.
- A prototype demonstrates intent. It does not prove persistence, IPC, model support, or runtime success.

## Layout Grammar

- Use one compact application header and one page title. Do not create a second hero-sized title area without user value.
- The application header keeps a single-line global resource monitor in the thin gap directly above the top-right navigation, aligned to the navigation's right edge with only a minimal vertical separation. Desktop shows CPU/GPU utilization, GPU temperature, and RAM/VRAM percentage plus used/total capacity. The right-aligned monitor remains visible alongside centered global notices. Narrower layouts progressively move or hide lower-priority detail without increasing the desktop header height. Queue may retain its larger diagnostic cards, but both surfaces share one polling source.
- Keep primary content within a consistent page gutter and readable maximum width. Media viewers may use available width when that materially improves inspection.
- Use the existing spacing scale before adding values. Prefer the sequence `4, 8, 12, 16, 24, 32` pixels and derive exceptional spacing from an explicit layout need.
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

- The current media input and prompt are the dominant decisions; advanced generation controls remain compact.
- Every create mode renders its current queue-blocking reason inside the sticky submit bar beside the queue action, so the user can diagnose a disabled action without scrolling to the end of the form.
- Image-to-video and video-extension mode switches resolve their own configured default model independently. An extension model or LoRA selection must not overwrite the image-to-video model when returning to that composer.
- Each prompt composer exposes a clear-current-version action; deleting the last version leaves one blank editable version.
- Prompt text editing preserves native textarea undo/redo: `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` remain available; clearing a prompt version adds an application-level undo/redo transaction for the same shortcuts.
- Prompt assistance updates the same primary prompt editor and supports alternatives/undo where present. Do not introduce a second competing prompt box.
- Quick instructions insert or refine combinable intent; they do not artificially restrict the user to one capability.
- Image creation supports multiple reference pictures using human-readable `<Picture N>` references when the selected model supports them.
- Batch image count is a bounded control based on the active model. Upscaling belongs after result inspection, not in the initial image generation path.

### Queue

- One logical task is one queue card. The active task expands in place to show stage, progress, preview, elapsed time, telemetry, pause/cancel actions, and recovery state.
- Pending and completed tasks stay compact. Do not duplicate the running task in a separate section.
- Progress must distinguish total pipeline progress from local node/step progress.

### History

- Image and video collections use distinct top-level tabs.
- Layout column count responds to container width, not record count.
- Tags are edited only on detail pages, below the primary media/viewer so they do not squeeze the media/sidebar columns; thumbnail cards remain quiet and show no tag list.
- The tag editor uses pill tokens, free text committed with Enter, and suggestions from existing tags. Tag identity is case-insensitive; the filter can select multiple tags and matches records containing all selected tags.
- Context menu actions are explicit: view details, copy file, copy path when supported, open containing folder, use/continue creation, and delete.
- Loading covers display a progress affordance; missing media displays recovery guidance rather than an unexplained black tile.

### Details

- Use one application navigation layer. Do not add a second page-level navigation system.
- The primary media and its version/thumbnail rail form one viewer.
- Put concise generation information to the right of the viewer when space allows; include generation time.
- Place deeper parameters/performance below the primary viewer.
- Image actions distinguish copy pixels from copy file. Core actions include locate, improve resolution, set cover, continue editing, and start video creation.

### Settings

- Show only information that supports a decision or recovery action.
- Separate ComfyUI environment, nodes/dependencies, application paths, temporary H3 acceleration settings, video models, image models, prompt assistance, and upscaling by user goal.
- `ComfyUI environment` owns the selected installation, core/data directory relationship, service state, Python binding, core compatibility, version/update evidence, and safe core repair actions.
- `Nodes & dependencies` owns installable custom nodes and Python/runtime packages, including `llama-cpp-python` and H3 acceleration dependencies. Dependency repair must not be labeled as a generic ComfyUI core repair.
- Until H3 Memory Optimization is complete and has passed its runtime gates, the existing H3 Attention selector remains in Settings under the temporary `Performance & acceleration` surface. The ComfyUI environment page may show its evidence but must not create a second Attention selector.
- The final placement and task-level semantics of Attention, Memory, Spectrum, and Turbo/SLA are a separate post-Memory decision; a page reorganization must not silently migrate or delete the existing Attention setting.
- Offline file detection is useful and must not be presented as failure merely because ComfyUI is stopped.
- Model cards report file presence, custom-node installation, and runtime validation as separate evidence. Complete weights remain ready while ComfyUI is offline; only a confirmed missing file/node or failed online check is an error.
- Prompt-assistance cards use the same evidence rules as video, image, and upscale cards. An installed node with runtime validation pending remains statically ready; implemented native `CLIPLoader + TextGenerate` profiles must not be labeled as pending integration.
- Every catalog custom-node card reports its locally scanned package version and metadata source. Repositories without a published package version report their scanned Git commit instead; UI copy must not substitute a hardcoded local version.
- Missing dependencies include an info action with source and exact target location; installation/update actions expose logs.
- Multiple ComfyUI installations show path and version evidence and allow explicit selection.

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
