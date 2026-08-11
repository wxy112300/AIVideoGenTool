# UX and Visual Design Contract

This is the acceptance contract for product UI work. It turns subjective requests such as "cleaner" or "more polished" into repeatable decisions without forcing a heavyweight design-system migration.

## Product Character

The application is a focused local creative workstation: calm, dense enough for expert controls, and understandable without knowledge of ComfyUI graphs. The visual hierarchy should prioritize media, the current creative decision, and task state. Decoration must not compete with content.

## Source and Prototype Workflow

- `prototypes/` is the interaction and layout reference for approved designs.
- Substantial new modules, navigation changes, or page restructuring should be resolved in the prototype first unless the user asks for direct implementation.
- Small production fixes may be implemented first, but the matching prototype must be synchronized when it represents that behavior.
- Edit prototype source fragments and shared assets, then run `npm.cmd run prototype:build`; do not patch only `prototypes/preview/`.
- A prototype demonstrates intent. It does not prove persistence, IPC, model support, or runtime success.

## Layout Grammar

- Use one compact application header and one page title. Do not create a second hero-sized title area without user value.
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
- Separate system/path, acceleration, video models, image models, nodes/workflows, prompt assistance, and upscaling by user goal.
- Offline file detection is useful and must not be presented as failure merely because ComfyUI is stopped.
- Missing dependencies include an info action with source and exact target location; installation/update actions expose logs.
- Multiple ComfyUI installations show path and version evidence and allow explicit selection.

## Manual UI Check

For shared renderer or substantial CSS work:

1. Run the app or the relevant standalone prototype.
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
