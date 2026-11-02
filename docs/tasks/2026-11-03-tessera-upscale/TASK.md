# Tessera with optional Qwen first-frame anchor

## Accepted scope

- User explicitly authorized Tessera base integration plus optional Qwen first-frame enhancement. Keep Kijai and other Upscale providers.
- Reuse installed Qwen Image 2.1 edit adapters; default off, enable only with compatible complete model components. No automatic weight downloads. SAM is out of scope.
- Pin Tessera 930c882a17fb9a494308ac0f19ed3a73fa9a4ce0. Author recommends anchors around 2x; user explicitly clarified recommendations must not become restrictions. Enable on installed compatible components at all admitted scales, including H3 768p → 4K. Higher scales get advisory only. Keep exact delivery dimensions, source audio, full duration and History identity.
- Fail on Tessera decode placeholders; do not equate rescue latent with a successful movie. Sequential GPU stages and explicit Qwen unload.

## Current

- Baseline contains many unrelated pending NAS/Strata/localization edits. Preserve them; no commit/reset/build cleanup without ownership check.
- Implemented provider/catalog, fixed node source, Taomate/LMS revision/size/hash, pixel input, exact 1080/1440/2160 delivery and complete-duration/audio restore. Existing Tessera evaluation source and temporary evidence are ignored under temp/tessera-assessment.
- Qwen Image 2.1 official, official Turbo and GGUF adapters exist. Turbo uses a distinct complete checkpoint with official eight-step schedule; do not require the example's older Qwen Turbo LoRA.
- Optional anchor defaults off. Installed compatible model/encoder/VAE evidence selects an explicit variant; offline file readiness is distinct from runtime schema readiness. Backend rechecks and freezes actual filenames, source metadata and model identity. Queued recipe survives target edits/reopen and History. Source is the first frame only; no SAM or automatic weight download.
- Single queue task enforces Qwen IMAGE → VRAM_Debug unload → app bridge's gated core H3 loaders → Tessera encode/refine. H3 model/CLIP/video/audio VAE cannot be preloaded ahead of the barrier. Stages have separate progress bands. Bridge version 0.4.3. Reuses native model loaders; no duplicated diffusion implementation.
- Application adaptation uses dense core attention, low-VRAM spatial tiles, 124-frame temporal budget and 39-frame encode windows; no sparse/Spectrum/Qwen global-policy leakage. Default workflow's older Taomate filename is not accepted as a fabricated publisher artifact: catalog uses the actual Kijai FL2VA-named file. Its transfer with REF2VA remains a real quality/coverage acceptance item (nonzero LoRA guards are necessary, not proof of full coverage).
- Source review: README, complete LAWS.md, default workflow and relevant nodes.py at 930c882. In particular, Tessera's 2x anchor advice is advisory, off-grid source trimming is avoided with app padding, and decoded 16x16 placeholders fail the output-size guard. Large clips still consume source/latent RAM and disk-backed output buffers. Rescue is output-side latent recovery, not a durable per-tile checkpoint.
- Tests: initial focused 11 files/204 tests passed; final affected 6 files/154 tests passed after queue recipe reopen and loading barrier changes. Python CPU tests 7 passed (including sigma schedule, delegated core loader paths and failed-placeholder rejection). Static graph tests cover first-frame link, official Turbo sigmas, no Qwen when off, output/audio links, dependency DAG and H3 barrier.
- Full `verify` unit phase: 316 files/3049 tests passed; 2 unrelated 5s timeouts in dependency-scanner/software-git-files. Reran those unchanged files with relevant focused tests: 5 files/96 tests passed. Continued integration: 7 files/127 tests passed. Final desktop/web clean typechecked build passed, 440 contrast pairs/0 failures, diff check passed. Original `verify` command did not itself exit 0. Other chats kept disjoint changes during checks, so this is evidence for the tested state, not their later edits.
- Physical Electron fixture FJPpbn, PID 92172/CDP8774: real History → Upscale click showed Tessera as disabled "缺组件", with Kijai and old providers retained; queue stayed empty. Did not bypass disabled controls. Production DOM test separately proves missing-Qwen recovery → toggle at 768p→4K → actual button → correct enqueue payload using synthetic application ports; this is not real IPC/GPU evidence.
- Inspected normal dialog screenshot. Cleanup helper confirmed runtime stopped, closed only fixture; PID92172/CDP8774 gone. No Comfy/GPU stage started. Native window-close lifecycle not tested. Evidence: ignored ui-report.json, ui-missing.png, cleanup.json, verify.log, verify-remaining.log, build-final.log.
- Current configured files include Qwen Image 2.1 INT8 + encoder + VAE and H3 REF2VA INT8. Tessera node and Taomate/LMS files are absent (two LoRAs total ~1.42GB). RTX4090 had ~18.6GB occupied by another process; left it untouched. App bridge in runtime was not updated automatically.
- Feature impact is minor; user subsequently explicitly requested one patch increment and all pending changes committed/pushed. Main application version advanced 0.67.5 → 0.67.6, package/lockfile/README/changelog aligned. This does not authorize packaging or a GitHub Release. No node installation or weight download performed.

## Acceptance still needed

- Install Tessera + update bridge through the app, prepare user-managed Taomate/LMS weights, then with a free owned GPU start Comfy via AppApi and inspect actual schema. Complete real ready-state toggle/button/task ID → output/playback/History/restart, compare anchor off/on on the same 768p source to 4K, record identity/ghosting/seams, peak GPU/RAM/disk and duration. No quality/speed claim yet.

## Sources

- https://github.com/hashu786/ComfyUI-Tessera/tree/930c882a17fb9a494308ac0f19ed3a73fa9a4ce0
- https://github.com/hashu786/ComfyUI-Tessera/blob/930c882a17fb9a494308ac0f19ed3a73fa9a4ce0/docs/LAWS.md
- https://huggingface.co/Kijai/MiniMax-H3-experimental/tree/f5c3b1d5a63e008a691fca1b6096fd57a5307536/loras
- https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/tree/b5755af914cce9c5307e7cd5903a7c59488c41a3/loras
