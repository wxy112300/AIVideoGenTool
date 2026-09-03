# Model and Workflow Contract

This document defines what it means to support a ComfyUI-backed capability and how model-specific behavior stays isolated.

## Completion Levels

Use these terms precisely:

1. **Catalogued:** model/node metadata, paths, and download guidance exist.
2. **Detected:** required files can be recognized offline in the selected ComfyUI installation.
3. **Runtime validated:** a running ComfyUI reports the required node classes and compatible inputs.
4. **Workflow constructed:** the application produces a valid API-format graph for the selected options.
5. **Smoke passed:** a minimal real task reaches a valid output on the target environment.
6. **Product integrated:** UI, queue snapshot, execution, progress, history, settings, errors, and tests all support the capability.

Never collapse these levels into a generic "installed" or "works" label.

## Model Integration Checklist

A model or workflow is product integrated only when applicable items are complete:

- Capability and mode are represented in the creation UI without exposing unsupported controls.
- Defaults and ranges are based on an authoritative model/workflow source and are documented.
- Prompt/reference conventions are translated into the model's expected format.
- Queue snapshots retain every execution-affecting option.
- A dedicated adapter maps product concepts to exact workflow node IDs/inputs.
- Required model files and custom/core nodes are discoverable offline.
- Online validation distinguishes missing, incompatible, loaded, and ready states.
- Settings provides source, filename, target directory, version requirement, install/update action when safe, and visible logs.
- Progress stages and previews correspond to real nodes rather than guessed timing alone.
- Outputs enter the correct image project or video history record with reproducible metadata.
- Cancellation, restart, failure, and app shutdown leave consistent state.
- Unit/static tests and the appropriate real smoke run are recorded.

## Workflow Sources and Editing

- Prefer current official ComfyUI/model workflow templates. Community workflows are acceptable when their provenance, version, and tradeoffs are documented.
- Inspect the actual API workflow and installed node schema. Display names, screenshots, and UI widgets are not sufficient to infer input contracts.
- Keep templates in `workflows/` and model-specific mapping in tested domain code. Avoid scattering node IDs and magic defaults through renderer event handlers.
- Keep provenance in `src/core/workflow-metadata.ts`. Every bundled API graph has a manifest entry with the ComfyUI API schema version, recommended core version, custom-node package ids, relative source path, upstream URL when applicable, and the date of the last static review. The JSON graph itself must remain a pure `/prompt` payload; do not add a top-level metadata key that ComfyUI could interpret as a node.
- Treat bundled production API JSON as application-owned versioned assets. Do not expose an external download, update, or replacement path that can overwrite the files used by the application.
- When changing a shared input such as width, height, frame count, seed, sampler, or output prefix, search every bundled workflow and adapter that consumes it.
- Preserve a known-good baseline workflow when introducing an experimental acceleration path unless the user explicitly asks to remove it.
- Native Qwen3.5 2B/4B prompt enhancement is a product-integrated ComfyUI path constructed as `CLIPLoader -> TextGenerate`. Settings detects the encoder file offline and validates both core node types when ComfyUI is online; an offline runtime check is pending evidence, not an integration failure.
- Qwen3.6/Qwen3.8 GGUF prompt enhancement uses `VisionLLMNode` with an exact model and vision-projector pair. Qwen3.8's current upstream GGUF reports the Qwen3.5 architecture but names its projector `*-vision-*.gguf`; the application-owned node adapter must register that filename as an mmproj, exclude it from the main-model list, and route Qwen3.8 through the Qwen3.5 vision handler. Before upload or `/prompt` submission, validate both exact enum values against the running `/object_info`; never substitute another model family's projector or silently fall back to text-only mode.
- Video-extension prompt enhancement extracts the exact boundary image at the selected source trim end and guarantees that every multimodal prompt backend receives it. Single-image backends receive it as their primary image; reference-mapped backends append the named boundary image after user media so existing R2V `<Picture N>` labels remain stable. The instruction identifies it as continuation grounding rather than a user reference. Extraction is main-process-owned, cancellable, and temporary media is removed after success, failure, or cancellation.

## Runtime Profiles and Isolation

Each workflow family owns its runtime profile, including where applicable:

- precision and quantization;
- attention implementation;
- sampler, scheduler, shift, steps, CFG/guidance;
- VAE and audio VAE precision/tiling;
- cache or block-skip patches;
- pinned memory, async offload, CPU offload, and model unloading;
- required ComfyUI launch arguments;
- expected preview/output nodes.

Applying a profile is transactional: compare desired and actual state, stop or drain owned work safely, apply/restart only when needed, reconnect, and confirm readiness before submission. On completion or model-family switch, restore/unload anything the profile patched so it cannot leak into the next task.

MiniMax H3's final video VAE selection is evaluated at queue-claim time, immediately before workflow submission. `Auto` prefers the installed INT8 ConvRot backend and falls back to FP16; explicit selections also fall back to the other installed H3 video VAE. The resolved backend is written to the claimed task/history metadata, and a task already computing is never changed. This policy is H3-only; other workflow families keep their own VAE profiles.

MMH3 Ultimate tiled 1440p second sampling is GPU-VAE-only. Queue execution must first align the local ComfyUI process away from any `--cpu-vae` profile, and the application-owned workflow must validate the configured VAE device, VAE wrapper device, and patcher load device for both video and audio VAEs before sampling. Every device must be CUDA. A CPU device, unavailable GPU, stale runtime profile, or device retargeting failure stops the task with a visible error; this path never silently falls back to CPU.

Both learned H3 second-sampling paths must pin frame 0 to the learned-upscaled source latent token. The 1080p whole-frame workflow replaces the bilinear-resized frame-0 keyframe after learned 3D upscale and before `BasicGuider`; MMH3 does the same for its first chunk, while later chunks pin the boundary to the preceding re-sampled chunk. Do not restore the bilinear-only first-keyframe path or hide opening-frame damage by trimming output frames. MMH3 progress is aggregate work over the actual temporal-chunk and spatial-tile grid: the standard Comfy progress value is completed pieces plus the current piece's sampler fraction, and the maximum is the total piece count. For the current 2592×1440 profile this is 12 spatial pieces for one 124-frame temporal chunk. RTX 4090 estimates use the measured 1339-second, 22.76-GiB peak baseline for 124 frames; running ETA may refine that baseline only from monotonic aggregate progress or matching completed History.

Create H3 native 1080p is a single product task composed of two sequential ComfyUI prompts, not a direct one-pass canvas and not pixel-space post-processing. Its initial supported profile is exactly FL2VA Base with JointAV enabled, no video LoRA, and no extension input; INT4, Q3 GGUF, 1440p, and LoRA combinations remain unavailable until separately validated. The immutable generation snapshot stores a 720p first-pass resolution and a distinct 1080p delivery target. The first prompt commits a clean JointAV artifact and recovery checkpoint; the second prompt loads that artifact, applies the learned 3D video-latent upscaler, preserves the audio latent, pins frame 0 from the learned latent, and performs H3 second sampling at the final geometry. Only the final MP4 and final JointAV enter History. After final success, remove the first-pass MP4, payload, and manifest; after failure or restart, retain the checkpoint so retry can skip the first prompt. Progress maps the first and second prompts to 0–50 and 50–100, and ETA samples the complete composite task duration under the final 1080p resolution.

The 2026-09-03 RTX 4090 Create smoke used a one-second FL2VA Base task with 20 steps, Spectrum balanced, Sage attention, and INT8 ConvRot video VAE. It submitted two prompt IDs and produced a 1920×1088, 39-frame, 24 FPS H.264/AAC MP4 plus a 9,417,320-byte final JointAV in 326.13 seconds. GPU peak was 100% and VRAM peak was 24,227,348,480 bytes. The final artifact retained the first artifact as `derivedFromArtifactId`, all three first-pass temporary files were absent after success, the queue returned to idle, and exactly one History record was added. This is execution and media-integrity evidence, not subjective visual-quality approval.

Qwen Image is also GPU-VAE-only on the supported RTX 4090 profile. Its runtime may retain model memory controls and text-encoder/model offload, but it must not launch ComfyUI with `--cpu-vae`. An older Qwen runtime that still contains that flag is profile-incompatible and must be restarted before submission. CUDA VAE allocation failure is a visible task failure, never an automatic CPU fallback. Other model families retain their existing VAE policies unless their own profile states otherwise.

Prompt models use the non-persisted `prompt-resident` profile with a bounded ComfyUI node cache. Explicit startup or the first successful enhancement acquires the process-local lease; the model remains retained until manual release, queue submission, or application exit. A video/image task profile using `--cache-none` must be replaced before prompt warmup; otherwise the loader reruns for every enhancement even while the main process lease claims the model is resident. Queue submission switches back to the queued model profile before execution.

Qwen3.6/Qwen3.8 27B multimodal prompt generation prefers GPU execution. Before model startup or workflow submission, if measured free VRAM is below 20 GiB or unavailable, show an application confirmation with used, total, free, and required VRAM. The default/cancel path must not load or submit the model; CPU inference is allowed only after explicit one-shot confirmation and must not become a persisted or session-wide fallback.

Do not assume lower dedicated VRAM usage is automatically safer or faster. Record dedicated VRAM, shared GPU memory, system RAM/pagefile, per-step time, and load/unload events when diagnosing long-running degradation.

## Resource and Quality Policy

- One heavy GPU stage runs at a time. Post-processing stages enter the same resource arbitration rather than starting opportunistically.
- Keep a configurable safety reserve, but do not silently override the user's selected budget with an overly conservative model-specific cap.
- Prefer deterministic cleanup at workflow boundaries over repeated global restarts. A restart may be an explicit recovery policy after measured leakage or incompatible profile changes.
- Attention/turbo features are opt-in per compatible workflow. Spectrum's main switch defaults on for a compatible MiniMax H3 workflow when the node is installed and the user has no remembered choice; a manual on/off choice must be remembered. Its quality and determinism must be evaluated against the same source, prompt, seed, dimensions, frames, steps, and output settings.
- MiniMax H3 supports CUDA FP16 SageAttention, Triton FP16 SageAttention, and PyTorch Attention. Deterministic CUDA-context failures restart the app-managed runtime and downgrade CUDA FP16 through Triton FP16 to PyTorch; experimental FP8 SageAttention kernels are not exposed.
- H3 Memory Optimization is currently withdrawn from product execution. The Create control and Queue metadata are hidden; all draft, persisted queue, history/retry and workflow values normalize to `off`; rendered workflows remove managed `H3MemoryOptimization` and `H3AIMDOResidencyLimiter` wrappers; and queue tasks always use the normal non-Memory runtime profile. Keep persisted fields and dormant adapters backward compatible so the capability can be reevaluated without breaking existing data.
- Keep `H3-Optimizations` visible in Settings only as an optional, manually installable upstream observation item. It must not participate in bulk installation or generation readiness. Reintroduction requires a new explicit product decision plus real provider evidence, host RAM/shared-GPU measurements, and long-frame validation; a completed output with `qkv_provider=standard_h3_qkv` or `memory=baseline` is not evidence that Memory was active.
- Spectrum MiniMax H3 uses `v0.2.1` as the minimum safe standard baseline and a pinned recommended version rather than requiring whatever release happens to be newest. The settings scan may offer a newer release without marking a supported installed version unusable.
- LightX2V Turbo may stack with Spectrum only on Spectrum `v0.2.6+`. The H3 8-step path retains the native ComfyUI ER-SDE contract; the current official v1.1 768p 4-step path uses Euler + Beta with video shift 6 and audio shift 3. H3 Motion Context extension still disables Spectrum.
- Spectrum `model_aware_mode` is available only on `v0.2.7+`, remains opt-in/default-off, and must be serialized into the immutable task snapshot. The current recommended Spectrum release is `v0.2.23`; do not make that recommendation a hard minimum. Omit the node input entirely when mode is `off` so older supported Spectrum workflows remain compatible. `v0.2.11` fixes native ER-SDE forecast-state cleanup, `v0.2.14` protects KJNodes preview callbacks during replay, `v0.2.15` adds optional H3 Continuum metadata interoperability, `v0.2.16` adds optional Untwisting RoPE visual-reference patch contracts plus isolated, bounded post-run research cleanup, `v0.2.17` completes native masked H3 forecasting and keeps learned-latent sampler-2 refinement's actual-prefix policy independent from sampler 1, `v0.2.18–v0.2.20` add optional fail-closed RefDelta Solver v0.2.0+ API-v1 interoperability, nested custom-node discovery, and tracked-step provenance fixes, `v0.2.21` adds ComfyUI 0.34+ PDD H3 FinalLayer compatibility, `v0.2.22` adds native SEEDS-2/SEEDS-3 and SA-Solver support with sampler-specific fail-closed state handling, and `v0.2.23` completes active SA-Solver PECE and RefDelta multi-backend interoperability while making `balanced` the active-PECE default. RefDelta, SEEDS, and SA-Solver are not hard dependencies; existing Euler, RES multistep, ER-SDE, ordinary SA-Solver, Continuum, and ordinary workflow parameters remain unchanged. On older cores without `mask_row_values`, masked forecasting must fail closed to one native H3 transformer evaluation. None of Continuum, Diff-Aid, Untwisting RoPE, or RefDelta is a hard dependency. Keep the existing no-cache/EasyCache exclusion and fail-closed behavior for unknown contracts.
- MiniMax H3 live preview uses KJNodes `ModelPreviewOverrideKJ` plus `models/vae_approx/taeh3.safetensors`. It is an operational observer, not the final video VAE: insert it after LoRA/attention/cache model patches and immediately before every scheduler/guider consumer. The queue control is default-off because each sampler callback performs a tiny decode and latent-to-CPU transfer. KJNodes encodes previews asynchronously with a bounded queue and may drop busy intermediate frames, so the UI must show a loading state and must not promise one visible frame per step. The product profile is one frame, 512px maximum side, JPEG quality 72; animated multi-frame previews are not enabled by default.
- H3 live preview is optional and must never make an otherwise runnable task fail. If either the runtime node or `taeh3.safetensors` is unavailable, submit the original workflow unchanged and report the unavailable preview separately from generation readiness.
- Offload by itself should not be described as lowering quality. If quality changes, inspect sampler parameters, cache state, patches, precision, and node execution path.
- Long-video estimates must separate diffusion sampling, VAE/audio decoding, interpolation, upscaling, and muxing.
- Native SeedVR2 INT8 long-video upscaling must bound the pre-VAE `IMAGE` batch, not only the diffusion latent. At task start, derive the outer segment size from currently available physical RAM (with a host reserve and working-set multiplier), target pixels, and the selected safe/auto/fast policy. Let the native `SeedVR2TemporalChunk` auto policy independently own dedicated-VRAM peak protection; do not cap the outer segment to an arbitrary count of sequential internal chunks. Record its resolution-aware VRAM frame estimate for diagnostics without using it as a second outer limit. Slice the core `VIDEO` before `GetVideoComponents`, run sequential segments, checkpoint every validated segment, and concatenate the matching encoded outputs without re-encoding. A restart or reset reuses the persisted resource plan and only checkpoints whose plan and files still match; it must not recalculate a different segment boundary from fluctuating free-memory readings. Queue UI reports frame-weighted total progress separately from current-segment progress, then exposes merge and temporary-segment cleanup as explicit final stages. GPU activity and responsive ComfyUI history polling are positive liveness evidence; a long native SeedVR2 node must not be killed merely because it emitted no node transition for the generic ten-minute interval.

## Images, Video, and Post-Processing

- Model-native generation FPS and delivery/target FPS are separate. Frame interpolation is an optional post-process and must expose its multiplier/target without changing model generation semantics.
- Upscaling belongs to a result-driven post-process. The user selects a successful image/video version first, then submits an upscale task.
- Image projects group iterative edits and generated variants; each version retains model, prompt, seed, format, dimensions, source-version lineage, generation time, and output path.
- Image format is explicit (`PNG`, `JPEG`, or another supported encoder) and not inferred from a decorative canvas option.
- Visual annotations are non-destructive sidecars: retain the original Picture path, store editable canvas JSON plus a flattened PNG under application user data, and attach both to that Picture snapshot.
- A flattened annotation replaces its Picture's upload input; it does not consume another model reference slot. Prompt compilation must include the per-mark notes and explicitly require removal of all temporary strokes, shapes, arrows, labels, and text from the output.
- Replacing or clearing a Picture invalidates its annotation sidecar reference. Queue tasks receive an immutable copy of the annotation metadata and validate the flattened file before execution.
- Visual guidance and a true binary inpaint mask are separate capabilities. Do not silently route visual marks into a mask socket; add mask-aware workflows only after their model/node contract is validated.
- LaMa object removal uses the clean Picture plus a separate binary mask sidecar. The translucent editor overlay is display-only; it must never replace the Picture input. The mask is mandatory, the prompt is omitted, output remains at source resolution, and the applied result becomes a normal image-project version.
- BiRefNet background removal is a separate deterministic, promptless image capability. It uses the native `LoadBackgroundRemovalModel`/`RemoveBackground`/`JoinImageWithAlpha` nodes with `models/background_removal/birefnet.safetensors`, accepts one clean Picture, keeps source resolution, emits one transparent PNG, and does not require SAM or a custom node package. Runtime node registration is checked only when the service is available.
- Video extension modes remain distinct: boundary-frame continuation and native latent/overlap or reference-based extension must not be presented as equivalent.
- Settings keep independent defaults for image-to-video and video extension. Motion Context extension reserves 22 context frames from H3's 362-frame sampled budget, so the UI caps one extension segment at 13 seconds; boundary-frame FL2VA keeps its 15-second cap.
- Motion Context uses the `v0.3.1` compatibility line for ComfyUI 0.32/0.33. The bundled API workflow keeps `context_length=22` and uses the upstream-aligned `audio_context_length=24`. Upstream's delete-and-re-add guidance applies only to manually saved ComfyUI canvas workflows whose widget positions predate the current node schema; the application's constructed API workflow does not require that migration. Duplicate or renamed Motion Context copies are a warning because both patches can compete at runtime. Its continuation UI reserves Slot 1 for the source video and accepts up to 9 image references plus 2 additional video references (3 videos total, 12 media slots overall).
- All MiniMax H3 generation and Motion Context extension canvases must use the native 32-pixel spatial policy. Do not route Ref2VA through the legacy 16:9 cap: a 848×464 canvas produces odd 53×29 VAE latents and fails when ComfyUI patchifies reference conditioning.

## Environment Detection and Installation

Represent dependency state along independent axes:

- file present at an expected model path;
- node source present on disk;
- Python/package prerequisites statically inspectable;
- selected ComfyUI version compatible;
- node registered by the running service;
- minimal execution verified.

Offline scans should provide useful results and installation actions. If runtime verification is unavailable, say so without downgrading a known on-disk installation to an error.

Settings uses these evidence rules consistently: model weights and other asset files are confirmed by path scans; custom-node installation and compatible versions are confirmed from the selected installation on disk; node-class registration and input contracts require a running ComfyUI `/object_info`; a real generation is the only execution proof. Pending runtime validation is neutral information, not a failure and not proof of execution.

Installation/update actions must:

- target the explicitly selected ComfyUI installation;
- honor the configured download proxy;
- expose streaming or persisted logs;
- stop/restart only app-managed services unless the user confirms otherwise;
- re-scan after completion and preserve actionable failure details;
- avoid deleting working versions or user models as part of repair.

## Testing Evidence

### Static

- Unit-test parameter mapping and graph construction.
- Assert required node classes and critical inputs.
- Validate all bundled JSON parses and output node assumptions.
- Test missing/old/duplicate dependency detection.
- Test persisted queue/history snapshots for every new execution option.

### Real smoke

Use the smallest representative task supported by the model, not an invalid extreme that changes the workflow behavior. Record:

- selected ComfyUI path/version and node versions;
- exact model variant and runtime profile;
- input dimensions, frames/duration, steps, seed, scheduler/sampler;
- elapsed and per-stage/per-step time;
- peak dedicated VRAM, shared GPU memory, and system RAM where relevant;
- output path and whether media opens/plays;
- warnings, fallbacks, restarts, or manual intervention.

If the target environment is unavailable, stop at the accurate completion level and leave a runnable smoke procedure rather than claiming success.
