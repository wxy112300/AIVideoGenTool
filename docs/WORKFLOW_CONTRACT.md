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
- When changing a shared input such as width, height, frame count, seed, sampler, or output prefix, search every bundled workflow and adapter that consumes it.
- Preserve a known-good baseline workflow when introducing an experimental acceleration path unless the user explicitly asks to remove it.

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

Do not assume lower dedicated VRAM usage is automatically safer or faster. Record dedicated VRAM, shared GPU memory, system RAM/pagefile, per-step time, and load/unload events when diagnosing long-running degradation.

## Resource and Quality Policy

- One heavy GPU stage runs at a time. Post-processing stages enter the same resource arbitration rather than starting opportunistically.
- Keep a configurable safety reserve, but do not silently override the user's selected budget with an overly conservative model-specific cap.
- Prefer deterministic cleanup at workflow boundaries over repeated global restarts. A restart may be an explicit recovery policy after measured leakage or incompatible profile changes.
- Cache/attention/turbo features are opt-in per compatible workflow. Their quality and determinism must be evaluated against the same source, prompt, seed, dimensions, frames, steps, and output settings.
- Offload by itself should not be described as lowering quality. If quality changes, inspect sampler parameters, cache state, patches, precision, and node execution path.
- Long-video estimates must separate diffusion sampling, VAE/audio decoding, interpolation, upscaling, and muxing.

## Images, Video, and Post-Processing

- Model-native generation FPS and delivery/target FPS are separate. Frame interpolation is an optional post-process and must expose its multiplier/target without changing model generation semantics.
- Upscaling belongs to a result-driven post-process. The user selects a successful image/video version first, then submits an upscale task.
- Image projects group iterative edits and generated variants; each version retains model, prompt, seed, format, dimensions, source-version lineage, generation time, and output path.
- Image format is explicit (`PNG`, `JPEG`, or another supported encoder) and not inferred from a decorative canvas option.
- Visual annotations are non-destructive sidecars: retain the original Picture path, store editable canvas JSON plus a flattened PNG under application user data, and attach both to that Picture snapshot.
- A flattened annotation replaces its Picture's upload input; it does not consume another model reference slot. Prompt compilation must include the per-mark notes and explicitly require removal of all temporary strokes, shapes, arrows, labels, and text from the output.
- Replacing or clearing a Picture invalidates its annotation sidecar reference. Queue tasks receive an immutable copy of the annotation metadata and validate the flattened file before execution.
- Visual guidance and a true binary inpaint mask are separate capabilities. Do not silently route visual marks into a mask socket; add mask-aware workflows only after their model/node contract is validated.
- Video extension modes remain distinct: boundary-frame continuation and native latent/overlap or reference-based extension must not be presented as equivalent.

## Environment Detection and Installation

Represent dependency state along independent axes:

- file present at an expected model path;
- node source present on disk;
- Python/package prerequisites statically inspectable;
- selected ComfyUI version compatible;
- node registered by the running service;
- minimal execution verified.

Offline scans should provide useful results and installation actions. If runtime verification is unavailable, say so without downgrading a known on-disk installation to an error.

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
