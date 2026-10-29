# H3 Refiner Upscale

## Scope and accepted direction

- Add a distinct Upscale provider using Kijai's Open-H3 refiner conversion; preserve existing Create 1080p and H3 native AV paths.
- Include 1080p, 1440p and 2160p (4K short edge) in this change. Resource requirements and missing dependencies remain explicit; do not silently downgrade resolution.
- Mode-specific VAE selection is authorized. Other workflows and global settings retain their policies.
- Source video input is supported without requiring a pre-existing H3 JointAV artifact. Preserve source audio, duration, aspect ratio and History lineage.
- No claim that this reproduces the full NV SoL engine, nor that three steps work with a standalone refiner without its distillation recipe.

## Resume / current state

- Initial repository status: only unrelated `docs/tasks/2026-10-10-strata-prompt-integration/TASK.md` modified; preserve it.
- Read local-video-studio skill and Upscale harness guide; follow existing History → dialog → enqueue → runtime → derived version route.
- Ordinary terminal launches intermittently fail before execution; read-only escalated commands work.
- Kijai README explicitly distributes only the refiner, excluding LMS and LightX2V Turbo. Rank 384 is the initial quality baseline; rank 16 is not assumed equivalent.
- Implemented the independent provider, pixel-video input, 1080/1440/2160 delivery geometry, fixed recipe/VAE, model catalog + pinned download links, source identity checks, queue editing and History recipe/lineage persistence. Bundled H3 bridge revision is 0.4.1.
- Application recipe: Kijai rank384 + LightX2V Turbo v1.2; Euler three-step grid, explicit core dense attention, tiled MMH3, existing INT8 ConvRot VAE. No LMS/SoL equivalence or speed/quality approval is claimed. Each LoRA must add nonzero model patches.
- Full source review and concrete pitfalls are in [SOURCE_AUDIT](SOURCE_AUDIT.md). Longer-than-15-second inputs fail visibly; internal time/spatial padding is removed without dropping source opening frames, and source audio is reused.
- 2026-10-29 focused: 9 files / 148 tests passed; `npm.cmd run typecheck` passed; Python CPU bridge tests 4 passed. `git diff --check` passed (existing autocrlf warnings only).
- Coordinated verification completed: first unit pass had 300 files / 2821 passing tests and one stale model-catalog enum assertion. Updated that assertion; its focused 11 tests passed. Remaining verification pipeline exited 0: 7 integration files / 104 tests, clean typechecked production build, and 440 contrast pairs with zero failures. The original initial `verify` invocation itself failed at that assertion; the repaired focused test plus remaining pipeline provide the final evidence. No H3 product edits followed this build.
- No new weights downloaded or runtime packages changed. Initial configured models-root search did not find the new LoRAs; current RTX 4090 usage is about 23 GiB, so no GPU inference is authorized against the occupied resource. Complete readiness scan is still required.
- Real Electron physical fixture `temp/create-smoke-nfF0HR` (PID 8868, CDP 2049) verified History → actual Upscale button → model control. Refiner appears as `H3 Refiner · Kijai · 缺组件` and is disabled; queue remains empty. No dependency bypass or synthetic ready state was used. This does not establish ready-state button/task-ID or 4K inference acceptance. Evidence is ignored under `temp/h3-refiner-20261029/` (`ui-report.json`, screenshot, `cleanup.json`).
- Inspected the normal dialog screenshot; existing layout and other providers remain intact. Ready-state Refiner target controls are covered by focused renderer tests, not this blocked real UI session.
- Cleanup helper confirmed runtime stopped with no app-owned ComfyUI, then closed only the matching fixture. PID 8868 and CDP listener 2049 are gone. No H3 GPU stage was started. Native window-close lifecycle was not tested. Preserved unrelated Strata edits and processes.

## Next

1. With user-managed pinned weights and a free GPU, update the app bridge through AppApi, start the owned ComfyUI through the app, inspect actual schema, perform missing-input recovery → real click/task-ID → generated output/History/playback → restart checks. Full inference, 4K peak memory, seams and quality are not yet verified.
2. Treat this as a minor feature integration with pending runtime acceptance. Unreleased changelog updated; no package bump, commit, release or weight download performed.

## Sources

- https://huggingface.co/Kijai/MiniMax-H3-experimental/blob/main/README.md
- https://github.com/NVlabs/Sana/tree/sol-engine/models/Open-H3-Regenerate-2K
- https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler
- https://github.com/kijai/ComfyUI-KJNodes/blob/main/nodes/minimax_nodes.py
