# P19 CSS selector owner map

> Status: L61 completed; G17 approval is still required before production CSS is moved. This document is an inventory and proposed move order, not a visual-direction approval.
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
| `10-final-refinements.css` | current Queue composition and remaining Image Edit refinements | split by page family; do not add another final stylesheet |
| `11-history-curation.css` | History gallery, toolbar and curation composition | target owner for History gallery/toolbar family |

## Selector-family map

The target owner is proposed for G17 review. “Keep shared base” means only the generic primitive remains in `01-foundation.css`; page composition moves to the page owner.

| Selector family | Current definitions / leakage | Proposed canonical owner | Package |
| --- | --- | --- | --- |
| `.app-shell`, `.topbar`, shared `.page-heading`, shared controls | `01`, with responsive shell overrides in `02`/`04`/`05` | `01-foundation.css` for shared geometry; page-specific modifiers stay with their page | L62 shared shell, only after parity |
| `.create-workspace`, `.create-workspace > .media-panel` and Create `1120/760` breakpoints | `01`, `02`, `04`, `05`; `04` currently owns Create breakpoints by accident | `07-create-composer.css` | L63 Create breakpoint family |
| `.create-page-heading`, `.create-page-actions`, mode rail | `09`, with Image Edit-specific refinements in `10` | `09-create-header.css` plus an explicitly scoped Image Edit owner | L63 boundary review |
| `.composer-*`, `.h3-*`, `.r2v-*` | `07`, `08`, with a small number of shared field primitives | `07-create-composer.css` / `08-prompt-helper.css` by component | L62 component family |
| `.settings-layout`, `.settings-sidebar`, `.settings-tab`, `.settings-panel`, `.settings-section` | `01`, `02`, `04`, `05`, `06` | `06-settings-layout.css` | L63 Settings geometry family |
| `.settings-content` component layout, `.model-profile`, `.custom-node-card`, `.issue-card`, app logs and Python runtime layout | `06` and `10` | `06-settings-layout.css`; keep status colors semantic | L62 Settings component family |
| `.environment-grid`, `.environment-item` legacy catalogue rules | `01`, `02`; new `.environment-evidence-list` is in `06` | `06-settings-layout.css`, then delete only after live DOM/reference check | L64 legacy cleanup |
| `.history-gallery*`, `.history-heading`, gallery toolbar and album/masonry breakpoints | `01`, `02`, `04`, `05`, `11` | `11-history-curation.css`; shared media primitives remain in `01` | L63 History gallery family |
| `.history-detail-*`, `.image-history-detail-*`, `.history-player`, `.history-summary`, record sections | `04` plus later P15 blocks in `10` | `04-history-stage.css` | L63 History detail family |
| `.queue-page-heading`, `.queue-heading-line`, `.queue-overview`, runtime badges and Queue performance/task composition | `01`, `05`, `10` | Queue-owned region in `10-final-refinements.css`; shared task/card primitives remain in `01` | L63 Queue family |
| `@media (max-width: 1120/900/760px)` blocks | mixed page families, especially `04` | each breakpoint belongs beside the selector family it changes | L63 boundary cleanup |

## Confirmed hotspots for G17

These are the first duplicate/ownership checks to repeat after each package:

```text
create-workspace       01 / 02 / 04 / 05
settings-sidebar       01 / 02 / 04 / 06
settings-layout        01 / 02 / 04 / 06
environment-grid       01 / 02 / 06 (legacy markup must be checked)
history-gallery        01 / 02 / 04 / 05 / 11
queue-page-heading     01 / 05 / 10
queue-overview         01 / 05 / 10
```

The current `!important` inventory is also mixed across `01`, `02`, `05`, and `10`. It is not a blanket-delete target: reduced-motion rules and any precedence that is still required remain until a selector-specific parity check proves they are obsolete. L64 may remove only entries explicitly listed by G17 and confirmed unused or redundant.

## Proposed move order

1. G17 reviews this map and freezes the owner and order; no visual or DOM decision is delegated to a mechanical CSS move.
2. Move one Create breakpoint family from `04` to `07`, preserving declarations exactly. A rehearsal on the current `v0.40.0` renderer already produced 24 before/after Create captures with identical SHA-256 sets; the rehearsal was reverted and is not itself an approval.
3. Move Settings geometry and responsive blocks into `06`, including only Settings-owned selectors; keep shared primitives in `01`.
4. Move History gallery/toolbar and then History detail families, one family per parity run.
5. Move Queue composition, retaining shared task primitives in `01`.
6. Run L64 cleanup only after each family has zero unintended live references, no duplicate owner remains, and the P00 screenshot matrix is unchanged.

## Preserve list and gates

- No DOM, IPC, persisted state, workflow payload, queue state machine, media path, or controller selector changes.
- No color, spacing, radius, typography, or breakpoint value changes in P19.
- No new `12-final-final.css` or equivalent override file.
- Every moved family gets current-renderer screenshots at its boundary widths plus `npm.cmd run verify` before the next family.
- Runtime generation is out of scope for this CSS-only inventory; a real ComfyUI result is not claimed by the synthetic capture rehearsal.
