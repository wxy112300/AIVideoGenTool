# H3 Refiner source audit

Type: implementation research. Date: 2026-10-29. Scope: Kijai r384 on the current ComfyUI pipeline. Runtime/quality acceptance is tracked only in [TASK](TASK.md).

## Read sources and decisions

- Read the complete [Kijai release README](https://huggingface.co/Kijai/MiniMax-H3-experimental/blob/f5c3b1d/README.md). It explicitly distributes **only the refiner**, without LMS or LightX2V Turbo. It does not publish a complete Kijai-specific Refiner workflow or benchmark. Do not label an application-built combination an official complete workflow.
- Read the complete [NV reference README](https://github.com/NVlabs/Sana/blob/sol-engine/models/Open-H3-Regenerate-2K/README.md), `infer.py`, `download.py`, and the relevant complete pipeline/forward sections. NV merges refiner + Turbo v1.2 + LMS Sharp, uses Euler at CFG 1 and the three-step sigma grid starting at 0.909375. Its fastest engine is a separate Linux/B200 path, not a consequence of loading its LoRA. This implementation does not import LMS branches or that engine, and inherits no NV speed/quality claim.
- Read the complete [LightX2V model card at the NV reference revision](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/3ec17a324ced54151364f24f8b5fb6bf7e26414f/README.md). Freeze the matching **v1.2** ComfyUI adapter for the initial application recipe; the existing Create catalog has advanced to **v1.3**, which is not silently substituted.
- Read the complete [learned-upscaler README](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/blob/main/README.md), registered 3D input contract, and installed MMH3 schemas/sampling glue. Reuse the existing pinned, application-patched `MMH3UltimateUpscale` provider for temporal/spatial sampling and its learned-source frame-0 anchor. Tiling is an application memory adaptation; it is not mathematically equivalent to the NV full-frame comparison.
- Read [rockerBOO's resampling nodes](https://github.com/rockerBOO/h3-latent-upscaler/blob/main/nodes.py). CONST flow with pre-added noise + DisableNoise can scale the signal twice. The new graph supplies clean latents and RandomNoise directly to the delegated sampler, rather than stacking stock AddNoise and DisableNoise.
- Read the complete relevant [KJ MiniMax memory-node source](https://github.com/kijai/ComfyUI-KJNodes/blob/main/nodes/minimax_nodes.py). Low-memory FFN/head splitting and the attention int32 token limit are distinct from the Refiner itself. The initial graph uses bounded spatial tiles and an explicit core attention backend, not unqualified global sparse/cache/Spectrum settings.
- Verified actual selected core source at ComfyUI 0.42.0, commit `40dcb30a96fc345f54632c56af81a4a320c2fc1e`; actual installed MMH3 commit `d91be5ac41797a3789b4765cdb6eb6d9129a4a4d`. Installed schema was checked from source; this alone does not prove server registration or inference.

## Pinned new weights

| Component | Revision | SHA-256 |
| --- | --- | --- |
| Kijai refiner rank384 BF16 | `7afab6c` | `4bf30291343eef5e51ee867ba37dd31bce3133d1da1ace1a245a7130b88818c2` |
| LightX2V FL2VA 4-step v1.2 ComfyUI BF16 | `3ec17a324ced54151364f24f8b5fb6bf7e26414f` | `c8168ebc17bbacc4296103dda2fec1ba85b24392fa08cf2bfbcef0cff0dc3cc8` |

Metadata is from each publisher's file page. Existing learned-upscaler bytes already have the same hash as the network NV redistributes, despite a different filename. Base H3/encoder/VAEs and their metadata remain in the existing shared catalog. Weights remain user-managed.

## Concrete pitfalls and handling

| Pitfall | Handling / remaining limit |
| --- | --- |
| A LoRA file exists but contributes no patches | Compare patch entries before/after each adapter; fail on zero additions. This is not proof of complete key coverage or visual quality. |
| Standalone refiner mistaken for complete NV release | Explicit application recipe ID; rank384 + pinned Turbo v1.2, no LMS/SoL claim. Its combined visual result still needs real acceptance. |
| Global generation settings change the recipe | Separate `h3-refiner` family and immutable provider snapshot; mode-local INT8 VAE and native attention selection. |
| Quick VAE advertised as universally faster | Keep the established INT8 ConvRot VAE for this first recipe. User authorized mode-local VAE overrides, not a universal speed claim. |
| 1080/2160 is not divisible by H3's 32px grid | Round compute canvas up, then center-crop to exact even delivery dimensions; 16:9 4K is 3840x2160 from 3840x2176. |
| Very wide 4K exceeds one learned upscale's trained range | Add an intermediate learned upscale if either axis would exceed 4x; each stage remains bounded. |
| Upscale target capacity | Allow 1080/1440/2160 short edge; explicit errors above 8192px or 16MP. Never reduce the selected target silently. |
| Whole source decoded to an enormous float image batch | VHS resizes during source decode, before video VAE encoding. |
| CLI silently fixes video length at ~5 seconds | No fixed load cap; process complete input up to 15 seconds. Longer clips fail visibly. |
| H3 time grid and arbitrary source FPS | Resample to 24 FPS, pad to 17k+5 internally, remove only padding after decode. Duration rounding is within one output frame. No opening-frame trimming. |
| Generated/silent model audio replaces original | Use encoded silence for model context; mux the original source audio into the final video. Silent input remains valid. |
| GPU memory displaced by encode/DiT/decode stages | Tiled VAE, tiled sampling, explicit model unload before decoding, GPU-only VAE guard. OOM remains a visible failure. |
| Tile seams, altered identity/text or temporal flicker | Real quality acceptance required; do not hide failed examples or equate static success with quality. |
| Failure/restart | Existing queue reset/retry preserves the recipe; no new per-tile durable checkpoint is claimed. |

The user explicitly authorized 4K admission without waiting for a 4K benchmark. That admission is separate from demonstrated 4K generation, measured VRAM and quality.
