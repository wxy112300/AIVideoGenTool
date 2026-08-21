# P19 CSS selector owner map

> Status: L61 completed; G17 approved the Create breakpoint and Settings navigation/shell geometry packages. The Settings section shell, heading, and content-card packages plus the History gallery/toolbar, History detail, and Queue composition packages are complete with current-renderer evidence. L64 removed one confirmed duplicate History album override and retained all other `!important` declarations with active ownership. P20/L65–L66 QA artifacts now live in `docs/UX_UI_P20_QA_REPORT.md` and `docs/UX_UI_P20_SCREENSHOT_MANIFEST.json`; G18 was completed by the user/integration owner and the UI/UX line is closed at `v0.41.3`. This document remains an owner inventory and execution record, not a visual-direction approval.
>
> Base: `75b20b1` (`v0.40.0`), current renderer and `src/style.css` import order. Historical prototypes are excluded.

## Scope and layering

`src/style.css` currently imports the style layers in this order:

`00-tokens` → `01-foundation` → `02-visual-refresh` → `03-acceleration` → `04-history-stage` → `05-density-refinement` → `06-settings-layout` → `07-create-composer` → `08-prompt-helper` → `09-create-header` → `10-final-refinements` → `11-history-curation`.

P19 keeps that cascade as evidence. A rule may move only after its computed result is captured at the affected breakpoint; values, DOM order, selectors used by controllers, and responsive thresholds stay unchanged.

| Layer | Canonical responsibility | Current note |
| --- | --- | --- |
| `00-tokens.css` | semantic tokens and shared aliases | canonical token source |
| `01-foundation.css` | document reset, shell primitives, shared controls, shared task/media primitives | still contains historical page-specific blocks flagged below |
| `02-visual-refresh.css` | legacy cross-page visual refinements | source of several Settings and History overrides; candidate for extraction |
| `03-acceleration.css` | acceleration-specific UI and global feedback details | keep acceleration ownership |
| `04-history-stage.css` | History detail stage, player, inspector, detail responsive geometry | currently also contains Create/Settings responsive leakage |
| `05-density-refinement.css` | shared density baseline plus historical page refinements | candidate rules must be assigned by selector family before removal |
| `06-settings-layout.css` | Settings page geometry, responsive navigation, environment evidence and Settings-owned content layout | P17/P18 canonical owner for new Settings geometry |
| `07-create-composer.css` | Create composer and Create page-owned responsive layout | target owner for Create frame breakpoints |
| `08-prompt-helper.css` | prompt-helper component family | keep component ownership |
| `09-create-header.css` | Create page heading and mode rail | current canonical owner |
| `10-final-refinements.css` | canonical Queue composition and remaining Image Edit refinements | split by page family; do not add another final stylesheet |
| `11-history-curation.css` | History gallery, toolbar and curation composition | target owner for History gallery/toolbar family |

## Selector-family map

The target owner is proposed for G17 review. “Keep shared base” means only the generic primitive remains in `01-foundation.css`; page composition moves to the page owner.

| Selector family | Current definitions / leakage | Proposed canonical owner | Package |
| --- | --- | --- | --- |
| `.app-shell`, `.topbar`, shared `.page-heading`, shared controls | `01`, with responsive shell overrides in `02`/`04`/`05` | `01-foundation.css` for shared geometry; page-specific modifiers stay with their page | L62 shared shell, only after parity |
| `.create-workspace`, `.create-workspace > .media-panel` and Create `1120/760` breakpoints | `01`, `02`, `04`, `05`; `04` currently owns Create breakpoints by accident | `07-create-composer.css` | L63 Create breakpoint family |
| `.create-page-heading`, `.create-page-actions`, mode rail | `09`, with Image Edit-specific refinements in `10` | `09-create-header.css` plus an explicitly scoped Image Edit owner | L63 boundary review |
| `.composer-*`, `.h3-*`, `.r2v-*` | `07`, `08`, with a small number of shared field primitives | `07-create-composer.css` / `08-prompt-helper.css` by component | L62 component family |
| `.settings-layout`, `.settings-sidebar` | `06` after the completed navigation/shell geometry moves | `06-settings-layout.css` | L63 Settings geometry family — completed |
| `.settings-tab` responsive layout | `01` shared tab primitive plus `06` page-owned responsive rules | `06-settings-layout.css` | L63 Settings navigation family — completed |
| `.settings-panel`, `.settings-section` shell and section headings | `06` after the completed shell/heading moves; no Settings-owned heading rules remain in `01`/`02` | `06-settings-layout.css` | Settings section shell + heading — completed; content subcomponents remain |
| `.settings-content` component layout, `.model-profile`, `.custom-node-card`, `.issue-card`, app logs and Python runtime layout | `06` after the content-card move; Settings card overrides removed from `10` | `06-settings-layout.css`; keep status colors semantic | L62 Settings content component family — card package completed |
| `.environment-grid`, `.environment-item` legacy catalogue rules | `01`, `02`; new `.environment-evidence-list` is in `06` | `06-settings-layout.css`, then delete only after live DOM/reference check | L64 legacy cleanup |
| `.history-gallery*`, `.history-heading`, gallery toolbar and album/masonry breakpoints | `11` after the completed move; shared media primitives remain in `01` and detail rules remain in `04` | `11-history-curation.css` | L63 History gallery/toolbar family — completed |
| `.history-detail-*`, `.image-history-detail-*`, `.history-player`, `.history-summary`, record sections | `04` after the completed detail move; shared media primitives/lightbox remain in `01`, curation/status refinements remain in `11`, and shared title marquee rules remain in `02` | `04-history-stage.css` | L63 History detail family — completed |
| `.queue-page-heading`, `.queue-heading-line`, `.queue-overview`, runtime badges and Queue performance/task composition | `10` after the Queue move; semantic type/status rules and shared task/card/performance primitives remain in `01` | Queue-owned region in `10-final-refinements.css`; shared task/card/performance primitives remain in `01` | L63 Queue family — completed |
| `@media (max-width: 1120/900/760px)` blocks | mixed page families, especially `04` | each breakpoint belongs beside the selector family it changes | L63 boundary cleanup |

## Confirmed hotspots for G17

These are the first duplicate/ownership checks to repeat after each package:

```text
create-workspace       01 / 02 / 04 / 05
settings-sidebar       06
settings-layout        06
environment-grid       01 / 02 / 06 (legacy markup must be checked)
history-gallery        11
queue-page-heading     10
queue-overview         01 / 10
```

The current `!important` inventory is also mixed across `01`, `02`, `05`, and `10`. It is not a blanket-delete target: reduced-motion rules and any precedence that is still required remain until a selector-specific parity check proves they are obsolete. L64 may remove only entries explicitly listed by G17 and confirmed unused or redundant.

## Proposed move order

1. G17 reviews this map and freezes the owner and order for each package; no visual or DOM decision is delegated to a mechanical CSS move.
2. Completed: move the Create breakpoint family from `01`/`04` to `07`, preserving declarations exactly. The current `v0.40.0` renderer produced 24 before/after Create captures with identical SHA-256 sets.
3. Completed in two bounded batches: move Settings navigation responsive declarations and the desktop `.settings-layout`/`.settings-sidebar` geometry into `06`; keep shared tab primitives and content components for their own packages.
4. Completed: move the `.settings-panel` grid shell, `.settings-section` base padding, and section-heading refinements into `06`. The 20-state current-renderer matrix showed no document/body horizontal overflow; expected compact-tab scrolling remains isolated to the category strip.
5. Completed: move the Settings content-card family (model profiles, component rows, custom-node cards, issue cards, and their narrow-screen rules) into `06`; the 1440×900/760×800 video, nodes, and prompt canaries plus the Settings matrix had no document/body overflow, and `npm.cmd run verify` passed.
6. Completed: move History gallery/toolbar composition, heading, and album/masonry breakpoints into `11`; the 8-record mixed-ratio matrix (32 captures across four History fixtures and eight widths) retained the adaptive columns and had no document/body horizontal overflow, and both album interaction smoke checks passed.
7. Completed: move the History video inspector/stage refinements and image detail stage/version rail/responsive rules from `01`/`02` into `04`; the four-width video/image detail matrix (8 captures) retained its computed layout and expected internal text clipping, and both 900px detail interaction smokes passed.
8. Completed: move Queue page/task/preview composition and Queue-only responsive rules from `01`/`02`/`05` into the Queue-owned region of `10`; retain shared task/card/performance primitives plus semantic type/status rules in `01`. The seven Queue states (`mixed`, `running`, `paused`, `failed`, `recoverable`, `empty`, `multiple-pending`) × eight widths produced 56 current-renderer captures with no document/body horizontal overflow; running smoke at 900px and 760px retained progress/stage/elapsed/preview/telemetry updates and pause/cancel reachability.
9. Completed bounded L64 cleanup: removed the second identical `.history-gallery.album .history-media` override from `11-history-curation.css`; the remaining `!important` declarations were reviewed and retained because they still enforce an active cascade boundary. Four History fixtures × eight widths retained the expected gallery columns, document/body overflow status, and album interaction smoke; the owner test now asserts the album media override is singular.
10. Closed: P20/L65–L66 automated QA matrix and screenshot manifest completed; G18 completed the final runtime/visual/keyboard/release gate. Any future visual direction requires a new proposal and phase based on the current renderer.

## Preserve list and gates

- No DOM, IPC, persisted state, workflow payload, queue state machine, media path, or controller selector changes.
- No color, spacing, radius, typography, or breakpoint value changes in P19.
- No new `12-final-final.css` or equivalent override file.
- Every moved family gets current-renderer screenshots at its boundary widths plus `npm.cmd run verify` before the next family.
- Runtime generation is out of scope for this CSS-only inventory; a real ComfyUI result is not claimed by the synthetic capture rehearsal.
