# H3 Continuum Extend source-to-contract matrix

Phase 0 evidence for the accepted Run Storage + Review Each Chunk redesign.
This document records source facts, not inferred behaviour. The app must keep
the legacy JointAV/native-state bridge available for old history, but it must
not label that bridge as an official Continuum Run Storage chunk.

## Version and source facts

| Component | Local source of truth | Observed fact | App consequence |
| --- | --- | --- | --- |
| Continuum package | Installed `ComfyUI-H3-Continuum/version.py`, package `__init__.py`, README | `PACKAGE_VERSION = 3.8.2`; the README and startup log identify 3.8.2 | Use the source/package version in receipts and compatibility checks. |
| Continuum migration note | `docs/V38_RELEASE_AND_MIGRATION.md` | Still says `3.8.1` | Keep as an explicit upstream documentation conflict; it is not version proof. |
| Motion Context package | Installed `ComfyUI-H3-Motion-Context/pyproject.toml`, `CHANGELOG.md` | Package version `0.6.2`; changelog 0.6.2 requires ComfyUI 0.34.0+ | Record 0.6.2 from package metadata. |
| Motion Context module docstring | `__init__.py` | Historical compatibility text still calls 0.3.1 the last pre-0.34.0 release | Do not use the docstring as the current package version. |

## Continuum managed path

| Contract | Source evidence | Required app behaviour |
| --- | --- | --- |
| Public sampler | `v3/driving_nodes.py:H3ContinuumSamplerV38`; `v3/nodes.py:H3ContinuumSamplerProduction` | Use the public V3.8 facade and its actual input names. Do not add an app-only `initial_state` socket to the managed graph. |
| Run Storage | `run_storage.py:RunStorageController`, `prepare`, `commit_group`, `_load_entry`, `finalize` | `Save + Auto Resume` is an immutable raw Video/Audio pair store with manifest validation. The stored pair is the official chunk payload. |
| Review | `v3/review_control.py:resolve_review_execution`, `resolve_take_execution`; `run_storage.py` review-head validation | Managed execution is `Review Each Chunk`; one physical group per queue. Continue/regenerate/finish/take/branch decisions are represented by Run Storage metadata. |
| Identity | `run_storage.py:build_sampling_contract`, `prepare`, project/run/revision metadata | Preserve project/run identity, fixed Base Seed and the full sampling contract across queues and restarts. `Chunks` is the final total, not the amount to add. |
| Output | `v3/assembly_v35.py:H3ContinuumAssembleSeamV35` and the public workflow | Decode/finalize through Continuum's assembly path. The app must not concatenate a second copy with `finalizeExtension` for managed tasks. |
| Interop | Continuum README Spectrum/interop sections and run-storage contract | Spectrum remains a separate optional adapter. A managed receipt must preserve its mode and actual prefix facts. |

## Motion Context adapter

| Contract | Source evidence | Required app behaviour |
| --- | --- | --- |
| Context node | `nodes.py:MiniMaxH3MotionContext`, `MiniMaxH3MotionContextTrim` | Consume an AV latent in the node's plain Comfy latent wrapper; use context 22 and audio context 24 by default. |
| Disk save/load | `nodes.py:MiniMaxH3MotionContextSaveLatent`, `MiniMaxH3MotionContextLoadLatent`; README latent save section | A slot is a safetensors file containing exactly `video` and `audio`. Load 0 means no file; Load N-1/Save N is the chain. This is a model-specific cache, not an official Continuum manifest/chunk. |
| Version | `pyproject.toml` and `CHANGELOG.md` | Track 0.6.2. Preserve old slot files and expose them through the legacy-motion-context storage kind. |

## App-owned adapters and legacy bridge

| Adapter | App source | Contract boundary |
| --- | --- | --- |
| Native JointAV | `comfy_nodes/LocalVideoStudio-H3/nodes.py:LocalVideoStudioH3SaveJointAV` and `electron/services/native-av-artifact.ts` | Writes/validates one app-owned H3 AV payload. It may be used by Native JointAV and bootstrap compatibility, but it is not a Run Storage chunk. |
| Legacy Continuum bootstrap | `LocalVideoStudioH3LoadJointAV`, `LocalVideoStudioH3ArtifactToContinuumState`, `initial_state` in `workflows/minimax_h3_continuum_v38_extend_api.json` | Read-only compatibility path for old history/artifacts. Never emit `continuum-run-chunk` metadata from it. |
| Managed Continuum | managed workflow and Run Storage receipt adapter | The Continuum-owned `chunks/...` safetensors file is the owner. The app stores a reference/manifest and, where needed, a same-volume hardlink alias; it does not copy a second physical payload. |

## Runtime evidence status

The original Phase 0 probes were unavailable. On 2026-09-18 the normal
application `startLocalService("comfy", settings)` succeeded on the configured
instance, without alternate directories or a Numba environment override.
The installed Continuum commit is `c38c616d54feb0310a3ca7540f2f4addc499fd1f`.
Live `/object_info/H3ContinuumSamplerV38` confirms six outputs and the public
media sockets, with no `initial_state` socket. Required enums include
`Save + Auto Resume`, `Review Each Chunk`, `Continue / Next`, `Regenerate Current`,
`Detailed Report`, `Standard`, and `Compatibility`.

Additional source-to-application findings:

| Contract | Installed source and observed result | Application correction |
| --- | --- | --- |
| Persistent first image | README: optional media and resume contract; `run_storage.py:build_sampling_contract` stores `first_frame_hash` in the global contract | Preserve the original first-frame extraction source; do not extract the latest extended video's end frame for every managed queue. Old sequences without this evidence remain blocked. |
| Timeline routing | Official `H3-Continuum-Skill-v1.zip`, `write-continuum-h3-prompts/SKILL.md`; `v2/prompts.py:_CHUNK_HEADER`, `_parse_timeline_sections`, `_parse_timeline`, `make_prompt_plan` | Whole-line `[Chunk N]` headers; append only the new body. Retry keeps the existing final body and chunk count. Malformed headers can fall back to Fixed even in explicit Timeline mode. |
| Retry | `run_storage.py:_load_validated_review_prefix`, `find_latest_review_head`; `v3/review_control.py:resolve_review_execution`; real rejection then two successful retries | Unchanged complete prompt hashes and `Regenerate From=Auto` are required. Upstream increments the variation nonce. Do not reinterpret Retry as prompt editing. |
| Take selection | `run_storage.py:_validated_take_selection` resolves provenance group revisions; real `group revision parent is missing` failure | A storage revision ID is not a group revision ID. Current app Take branch is blocked pending correct identity persistence. |
| Final duration | Managed graph `exact_total_duration=true`; final ffprobe 1080 frames, 24 fps, 45 seconds | Keep raw net frame counts in receipts; do not use their sum as final History duration. |
| Physical ownership | Real first-chunk files across three plan revisions have different file IDs, each nlink=2 | App hardlinks do not prevent upstream plan-import copies. Cross-revision single-physical-payload goal remains open; do not rewrite immutable upstream storage without a verified design. |
| Legacy source rejection | `v3/runtime_coordinator.py` state-selection path rejects geometry mismatch/invalid state and records fresh generation | Preserve the app bridge's independent transport diagnostics and fail-closed behavior; never label this as public managed resume. |
| Cached History metadata | Real selected legacy artifact differs from its manifest only in `HistoryFile.absolutePath` and `sizeBytes` | Ignore file-cache fields for reference equality; continue validating payloadBytes, full SHA-256, tensor geometry, dtype and producer identity. No manifest rewrite or payload copy. |

See [TASK.md](TASK.md) for successful 0→1→2→3 and restarted Retry receipts,
the failed old-Take gate, storage duplication, visual checks and remaining
quality/product gates. Static schema and transport success are not quality
or whole-plan acceptance.

## Snapshot policy

The source files and the app workflow contract are the snapshots for this
task. Do not overwrite the upstream plugins or import app-owned JointAV or
Motion Context files into the official Run Storage manifest. Any migration of
existing history is additive and preserves the original files.
