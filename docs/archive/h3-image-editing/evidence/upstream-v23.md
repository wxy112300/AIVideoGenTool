# MiniMax H3 Image Studio v23.0.0 evidence

Status: static source evidence only. The selected ComfyUI instance has not yet
provided a target `/object_info` capture or a real GPU smoke for this task.

## Source and revision

- Package: `ComfyUI-MiniMax-H3-Image-Studio` v23.0.0.
- Repository: <https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/tree/v23.0.0>
- Resolved commit: `f7384aacb7bf35492dc73a3e6054ab6b427f93f6`.
- `pyproject.toml`: Python `>=3.10`, ComfyUI `>=0.30.0`, no Python dependencies.
- `requirements.txt`: explicitly contains no extra runtime dependencies.
- Upstream validation: <https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/docs/validation-v23.md>.
  That document is upstream bounded regression evidence (RTX 4090 / ComfyUI
  0.34.0), not evidence that the user's selected runtime is ready.

## Adopted API graphs

The source API examples are pure ComfyUI `/prompt` payloads. The product keeps
two app-owned templates, one per image route, and maps the two approved quality
profiles in the adapter. The upstream files used as the source records are:

| Product route | Base source | Turbo source | Semantic contract |
| --- | --- | --- | --- |
| `minimax-h3-image-i2i` | [`H3_I2I_API.json`](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/examples/api/H3_I2I_API.json) | [`H3_I2I_TURBO_API.json`](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/examples/api/H3_I2I_TURBO_API.json) | FL2VA source-image-anchored I2I, exactly Picture 1. |
| `minimax-h3-reference-edit` | [`H3_REFERENCE_EDIT_API.json`](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/examples/api/H3_REFERENCE_EDIT_API.json) | [`H3_IMAGE_EDIT_API.json`](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/examples/api/H3_IMAGE_EDIT_API.json) | REF2VA ordered reference edit, Picture 1 through Picture 9. |

`H3_IMAGE_EDIT_API.json` is intentionally recorded under REF2VA: despite its
filename, it uses `H3ReferenceEditPrepare`, the REF2VA diffusion checkpoint and
the REF2VA Turbo adapter. It is not a FL2VA graph and is not interchangeable
with the video R2V model ids.

## Node registry and graph boundary

The v23 registry exposes the following Image Studio classes used by the first
product gate:

- `H3ImageResolutionPreset`
- `H3ImageToImagePrepare` (FL2VA only)
- `H3ReferenceEditPrepare` (REF2VA only; optional `reference_image_2` …
  `reference_image_9` sockets)
- `H3ImageSamplingPreset`
- `H3ImageDecode`
- `H3ImageFrameSelector`

The graph also uses the ComfyUI core `UNETLoader`, `CLIPLoader`, `VAELoader`,
`LoadImage`, `RandomNoise`, `BasicGuider`, `SamplerCustomAdvanced` and
`SaveImage`, plus `LoraLoaderModelOnly` only for an approved Turbo profile.

The Image Studio README confirms the image contract: it generates a short frame
packet, decodes it with the standard H3 video VAE, then selects one still; the
audio VAE is not required for image output. REF2VA sockets preserve the
`<Picture N>` order and are capped at nine inputs. See:
<https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/tree/v23.0.0>.

## Runtime/schema boundary

`evidence/h3-image-studio-v23-schema.json` is a minimal API-derived schema
fixture. It records only the sockets and enum values used by the adopted graphs;
it is not a captured `/object_info` response. The target ComfyUI's real schema
must be captured during P4 and compared before a task can be called runtime
validated. Unknown or changed sockets must fail closed rather than being
silently dropped.

Product baseline remains `ComfyUI 0.35.0` recommended, while the upstream
package minimum is recorded separately as `0.30.0`. The minimum is an import
range, not a product readiness claim.

## Asset matrix

| Asset | Target directory / exact filename | Route | Required in first gate | Source / hash |
| --- | --- | --- | --- | --- |
| FL2VA diffusion | `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | FL2VA | Yes | Comfy-Org / MiniMax-H3 pinned revision; SHA-256 `e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a` |
| REF2VA diffusion | `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | REF2VA | Yes | Comfy-Org / MiniMax-H3 pinned revision; SHA-256 `9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779` |
| Qwen3-VL 32B encoder | `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | Both | Yes | Comfy-Org / MiniMax-H3 pinned revision; SHA-256 `35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6` |
| H3 FP16 video VAE | `vae/minimax_h3_video_vae_fp16.safetensors` | Both | Yes | Comfy-Org / MiniMax-H3 pinned revision; SHA-256 `7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522` |
| FL2VA Turbo adapter | `loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | FL2VA Turbo | Conditional | [Comfy-Org / MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors); SHA-256 `2339acdf19bfe123f46b971ea35d367a84adb85de43627e1eceafa5a5b2b111e` |
| REF2VA Turbo adapter | `loras/minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` | REF2VA Turbo | Conditional | [lightx2v / Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors); SHA-256 `6a56f41ab4229c9dd845b9501bbd475ee57e112d846cf2e819d534a1ae928c5a` |

The audio VAE, T=1 image VAE, hybrid checkpoint, detail refiner and other
experimental adapters are deliberately outside the first product gate.
