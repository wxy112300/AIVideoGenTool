# UI prototypes

- `create.html`: approved creation-page interaction prototype.
- `queue.html`: queue management and safe-cancellation interaction prototype.
- `history.html`: successful-video gallery with masonry/album layouts, cover-frame choice, and direct hover playback.
- `history-detail.html`: result playback, immutable generation snapshot, reproducibility parameters, and upscale/queue actions.
- `upscale.html`: reusable modal-page prototype for target resolution, upscale model, VRAM strategy, and RTX 4090 time estimates.
- `settings.html`: paths, ComfyUI/LM Studio connections, RTX 4090 runtime policy, video models, and upscale model configuration.

These files are HTML fragments intended for product interaction review.

The top navigation links the creation, queue, and history prototypes. Settings remains disabled until that page is designed.

Open `preview/history.html` to review the standalone history page. The standalone pages in `preview/` link to one another and include all required CSS without an iframe.

Rebuild the standalone pages after editing a fragment:

`node scripts/build-prototypes.mjs`

## Automatic output naming

- Output names are created when a task enters the queue; there is no filename field on the creation page.
- Pattern: `{short-model}-{short-prompt}-{yyyyMMdd-HHmmss}.mp4`.
- Prompt summaries are sanitized for Windows filenames and limited to 16 characters.
- Same-second duplicates receive `-02`, `-03`, and so on.
- Safely cancelled partial videos receive `-partial`; future upscales receive `-720p` or `-1080p`.
