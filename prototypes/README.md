# Historical UI prototypes

> Baseline synchronized with the implemented desktop UI on 2026-08-09. These files are now historical reference material; new modules must be designed and validated against the current renderer under `src/` first.

The approved image-workspace implementation phases and cross-agent ownership are documented in `docs/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md`.

- `create.html`: three creation modes—image editing, image-to-video/R2F reference slots, and video continuation. Image editing reuses the H3-style single prompt editor, version history, combinable intent hints, reusable instruction inserts, multimodal rewriting and batch controls.
- `queue.html`: one expanded running task, live preview, performance telemetry, recovery state, compact pending tasks, and multi-Seed image batches represented as one task.
- `history.html`: separate video/image tabs; video cover-cache and hover playback behavior; image projects group every generation and edit version.
- `history-detail.html`: sticky return/navigation concepts, playback, version grouping, file operations, delete flow, generation snapshot and performance summary.
- `image-detail.html`: large-image viewer, grouped side album, parent-version lineage, clipboard/file actions, continue-edit flow, and handoff to video Slot 1.
- `upscale.html`: target resolution, current SeedVR2 strategy, model/VRAM selection and RTX 4090 estimates.
- `settings.html`: system/runtime configuration plus separate video and image-editing models, shared workflow dependencies, multimodal prompt presets, upscale and diagnostics logs.
- `studio-prototype.css` / `studio-prototype.js`: shared visual and interaction baseline used by every prototype page.

## Visual review status

These prototype pages are historical reference material. The current renderer under
`src/renderer/` and `src/styles/` is the source of truth for UX/UI execution; do not
use prototype screenshots as approval evidence or assume prototype behavior is live.

These files are HTML fragments intended for product interaction review.

The top navigation links all primary pages. History detail intentionally keeps History selected.

Open `preview/history.html` to review the standalone history page. The standalone pages in `preview/` link to one another and include all required CSS without an iframe.

Rebuild the standalone pages only when maintaining historical reference pages:

`npm.cmd run prototype:build`

## Historical prototype boundary

- The prototypes describe an older interaction snapshot; sample paths and telemetry are illustrative and cannot prove current renderer behavior.
- Current renderer DOM, CSS, screenshots, runtime smoke and the UX contracts are authoritative for implementation and acceptance.
- The image-editing page is an older interaction snapshot, not current approval evidence. Model choices and parameter ranges shown here remain illustrative.
- Community NSFW/uncensored H3 derivatives are not represented as installable options while the ecosystem remains unstable.
- Phase 2A (2026-08-17) is retained as historical prototype context only; its compact creation action bar, progressive disclosure and sticky queue actions must be re-evaluated against the current renderer before reuse.

## Automatic output naming

- Output names are created when a task enters the queue; there is no filename field on the creation page.
- Pattern: `{short-model}-{short-prompt}-{yyyyMMdd-HHmmss}.mp4`.
- Prompt summaries are sanitized for Windows filenames and limited to 16 characters.
- Same-second duplicates receive `-02`, `-03`, and so on.
- Safely cancelled partial videos receive `-partial`; future upscales receive `-720p` or `-1080p`.
