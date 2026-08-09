# UI prototypes

> Baseline synchronized with the implemented desktop UI on 2026-08-09. New modules should be designed here first, then implemented against the approved prototype.

- `create.html`: image generation/video continuation, H3 FL2VA/R2V reference slots, prompt presets/checks, Spectrum, steps and GPU-budget feedback.
- `queue.html`: one expanded running task, live preview, performance telemetry, recovery state, compact pending tasks and retry actions.
- `history.html`: persistent cover-cache behavior, responsive masonry/album layouts, hover playback model and right-click file/task actions.
- `history-detail.html`: sticky return/navigation concepts, playback, version grouping, file operations, delete flow, generation snapshot and performance summary.
- `upscale.html`: target resolution, current SeedVR2 strategy, model/VRAM selection and RTX 4090 estimates.
- `settings.html`: seven current categories covering ComfyUI instances, Python/attention acceleration, models, nodes/workflows, prompt runtimes, upscale and diagnostics logs.
- `studio-prototype.css` / `studio-prototype.js`: shared visual and interaction baseline used by every prototype page.

These files are HTML fragments intended for product interaction review.

The top navigation links all primary pages. History detail intentionally keeps History selected.

Open `preview/history.html` to review the standalone history page. The standalone pages in `preview/` link to one another and include all required CSS without an iframe.

Rebuild the standalone pages after editing a fragment:

`node scripts/build-prototypes.mjs`

## Current prototype boundary

- The prototypes describe behavior already present in the application; sample paths and telemetry are illustrative.
- Output-directory migration and future image-editing modules are deliberately not included yet because they are not implemented or approved.
- Community NSFW/uncensored H3 derivatives are not represented as installable options while the ecosystem remains unstable.

## Automatic output naming

- Output names are created when a task enters the queue; there is no filename field on the creation page.
- Pattern: `{short-model}-{short-prompt}-{yyyyMMdd-HHmmss}.mp4`.
- Prompt summaries are sanitized for Windows filenames and limited to 16 characters.
- Same-second duplicates receive `-02`, `-03`, and so on.
- Safely cancelled partial videos receive `-partial`; future upscales receive `-720p` or `-1080p`.
