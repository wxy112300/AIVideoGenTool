# UI prototypes

> Baseline synchronized with the implemented desktop UI on 2026-08-09. New modules should be designed here first, then implemented against the approved prototype.

The approved image-workspace implementation phases and cross-agent ownership are documented in `docs/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md`.

- `create.html`: three creation modes—image editing, image-to-video/R2F reference slots, and video continuation. Image editing reuses the H3-style single prompt editor, version history, combinable intent hints, reusable instruction inserts, multimodal rewriting and batch controls.
- `queue.html`: one expanded running task, live preview, performance telemetry, recovery state, compact pending tasks, and multi-Seed image batches represented as one task.
- `history.html`: separate video/image tabs; video cover-cache and hover playback behavior; image projects group every generation and edit version.
- `history-detail.html`: sticky return/navigation concepts, playback, version grouping, file operations, delete flow, generation snapshot and performance summary.
- `image-detail.html`: large-image viewer, grouped side album, parent-version lineage, clipboard/file actions, continue-edit flow, and handoff to video Slot 1.
- `upscale.html`: target resolution, current SeedVR2 strategy, model/VRAM selection and RTX 4090 estimates.
- `settings.html`: system/runtime configuration plus separate video and image-editing models, shared workflow dependencies, multimodal prompt presets, upscale and diagnostics logs.
- `studio-prototype.css` / `studio-prototype.js`: shared visual and interaction baseline used by every prototype page.

These files are HTML fragments intended for product interaction review.

The top navigation links all primary pages. History detail intentionally keeps History selected.

Open `preview/history.html` to review the standalone history page. The standalone pages in `preview/` link to one another and include all required CSS without an iframe.

Rebuild the standalone pages after editing a fragment:

`node scripts/build-prototypes.mjs`

## Current prototype boundary

- The prototypes describe behavior already present in the application; sample paths and telemetry are illustrative.
- Image editing is currently an approved interaction prototype. Model choices and parameter ranges remain illustrative until the first ComfyUI image workflows are selected and validated.
- Community NSFW/uncensored H3 derivatives are not represented as installable options while the ecosystem remains unstable.
- Phase 2A (2026-08-17) adds a compact creation action bar, progressive disclosure for low-frequency controls, and sticky queue actions across all three modes. This is prototype-only until the renderer implementation is reviewed.

## Automatic output naming

- Output names are created when a task enters the queue; there is no filename field on the creation page.
- Pattern: `{short-model}-{short-prompt}-{yyyyMMdd-HHmmss}.mp4`.
- Prompt summaries are sanitized for Windows filenames and limited to 16 characters.
- Same-second duplicates receive `-02`, `-03`, and so on.
- Safely cancelled partial videos receive `-partial`; future upscales receive `-720p` or `-1080p`.
