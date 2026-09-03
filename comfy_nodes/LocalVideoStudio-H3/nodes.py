"""Small, app-owned ComfyUI nodes for durable H3 joint AV artifacts.

This package deliberately does not contain a sampler or an upscaler.  It only
bridges the ComfyUI joint NestedTensor boundary to a safe, restartable file
artifact that the Electron application can validate and commit to History.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import folder_paths


PACKAGE_VERSION = "0.2.3"
SCHEMA_VERSION = 1
ARTIFACT_SUBDIRECTORY = "h3-native-av"
PAYLOAD_FORMAT = "safetensors"
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def _managed_directory() -> tuple[Path, Path]:
    output_root = Path(folder_paths.get_output_directory()).resolve()
    managed = (output_root / ARTIFACT_SUBDIRECTORY).resolve()
    managed.relative_to(output_root)
    managed.mkdir(parents=True, exist_ok=True)
    return output_root, managed


def _safe_relative_name(value: str, extension: str = ".safetensors") -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("H3 AV artifact 名称不能为空")
    normalized = value.strip().replace("\\", "/")
    if "\x00" in normalized or PureWindowsPath(normalized).is_absolute() or normalized.startswith("/"):
        raise ValueError("H3 AV artifact 拒绝绝对路径")
    if normalized == ARTIFACT_SUBDIRECTORY:
        raise ValueError("H3 AV artifact 缺少文件名")
    prefix = f"{ARTIFACT_SUBDIRECTORY}/"
    if normalized.startswith(prefix):
        normalized = normalized[len(prefix):]
    parts = PurePosixPath(normalized).parts
    if not parts or any(part in ("", ".", "..") or ":" in part for part in parts):
        raise ValueError("H3 AV artifact 名称包含不安全路径片段")
    if len(parts) != 1:
        raise ValueError("H3 AV artifact 只允许固定目录下的平铺文件名")
    if not normalized.lower().endswith(extension):
        normalized += extension
    return normalized


def _safe_payload_path(value: str | dict[str, Any]) -> tuple[Path, Path]:
    output_root, managed = _managed_directory()
    if isinstance(value, dict):
        if value.get("type", "output") != "output":
            raise ValueError("H3 AV artifact descriptor type 必须为 output")
        filename = value.get("filename")
        subfolder = value.get("subfolder", ARTIFACT_SUBDIRECTORY)
        if not isinstance(filename, str) or not isinstance(subfolder, str):
            raise ValueError("H3 AV artifact descriptor 无效")
        value = f"{subfolder}/{filename}"
    relative = _safe_relative_name(value)
    candidate = (managed / relative).resolve()
    candidate.relative_to(managed)
    return output_root, candidate


def _extract_joint_tensors(value: Any) -> tuple[Any, Any]:
    if isinstance(value, dict):
        if "samples" not in value:
            raise ValueError("H3 joint AV latent 缺少 samples")
        value = value["samples"]
    if not getattr(value, "is_nested", False):
        raise ValueError("H3 AV serializer 只接受 joint NestedTensor")
    parts = tuple(value.unbind())
    if len(parts) != 2:
        raise ValueError("H3 joint AV NestedTensor 必须且只能包含 video/audio 两个 tensor")
    if not all(getattr(part, "is_floating_point", lambda: False)() for part in parts):
        raise ValueError("H3 video/audio tensor 必须为浮点类型")
    return parts[0], parts[1]


def _dtype_name(tensor: Any) -> str:
    name = str(tensor.dtype).replace("torch.", "").lower()
    return {"float16": "F16", "bfloat16": "BF16", "float32": "F32"}.get(name, name.upper())


def _metadata_for(video: Any, audio: Any) -> dict[str, str]:
    return {
        "format": "local-video-studio-h3-joint-av",
        "schema_version": str(SCHEMA_VERSION),
        "keys": "video,audio",
        "video_dtype": _dtype_name(video),
        "video_shape": json.dumps(list(video.shape), separators=(",", ":")),
        "audio_dtype": _dtype_name(audio),
        "audio_shape": json.dumps(list(audio.shape), separators=(",", ":")),
    }


def _sha256_file(filename: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with filename.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def _fsync_file(filename: Path) -> None:
    with filename.open("rb+") as handle:
        handle.flush()
        os.fsync(handle.fileno())


def _descriptor(payload: Path, output_root: Path) -> dict[str, Any]:
    relative = payload.relative_to(output_root).as_posix()
    return {
        "filename": payload.name,
        "subfolder": str(Path(relative).parent).replace("\\", "/"),
        "type": "output",
        "format": PAYLOAD_FORMAT,
    }


def _manifest_path(payload: Path, manifest: str | dict[str, Any] | None) -> Path:
    if manifest:
        _output_root, managed = _managed_directory()
        if isinstance(manifest, dict):
            if manifest.get("type", "output") != "output":
                raise ValueError("H3 AV manifest descriptor type 必须为 output")
            filename = manifest.get("filename")
            subfolder = manifest.get("subfolder", ARTIFACT_SUBDIRECTORY)
            if not isinstance(filename, str) or not isinstance(subfolder, str):
                raise ValueError("H3 AV manifest descriptor 无效")
            manifest = f"{subfolder}/{filename}"
        normalized = _safe_relative_name(manifest, ".json")
        candidate = (managed / normalized).resolve()
        candidate.relative_to(managed)
        return candidate.with_suffix(".json")
    return payload.with_suffix(".json")


def _read_json(filename: Path) -> dict[str, Any]:
    try:
        value = json.loads(filename.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"H3 AV manifest 不是有效 JSON：{exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("H3 AV manifest 必须为对象")
    return value


def _manifest_payload_matches(manifest: dict[str, Any], payload: Path, output_root: Path) -> None:
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("H3 AV manifest schema 版本不受支持")
    payload_ref = manifest.get("payload")
    if not isinstance(payload_ref, dict):
        raise ValueError("H3 AV manifest 缺少 payload descriptor")
    expected = _descriptor(payload, output_root)
    for key in ("filename", "subfolder", "type"):
        if payload_ref.get(key) != expected[key]:
            raise ValueError("H3 AV manifest payload descriptor 不匹配")
    payload_bytes = manifest.get("payloadBytes")
    payload_hash = manifest.get("payloadSha256")
    if not isinstance(payload_bytes, int) or payload_bytes <= 0 or not isinstance(payload_hash, str) or not _SHA256_RE.fullmatch(payload_hash):
        raise ValueError("H3 AV manifest 缺少有效 bytes/SHA-256")


def _tensor_manifest_matches(manifest: dict[str, Any], tensors: dict[str, Any]) -> None:
    expected = (
        ("video", manifest.get("videoShape"), manifest.get("videoDtype")),
        ("audio", manifest.get("audioShape"), manifest.get("audioDtype")),
    )
    for name, shape, dtype in expected:
        tensor = tensors[name]
        if shape != list(tensor.shape) or dtype != _dtype_name(tensor):
            raise ValueError(f"H3 AV manifest 的 {name} shape/dtype 与 payload 不匹配")


class LocalVideoStudioH3SaveJointAV:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "joint_av": ("LATENT",),
                "filename": ("STRING", {"default": "h3-native-av/h3av_"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("artifact_descriptor",)
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "Local Video Studio/H3"

    def save(self, joint_av: Any, filename: str):
        import torch
        from safetensors.torch import save_file

        if filename.strip().replace("\\", "/") in ("h3-native-av/h3av_", "h3av_"):
            filename = f"h3-native-av/h3av_{uuid.uuid4().hex}"
        output_root, payload = _safe_payload_path(filename)
        if payload.suffix.lower() != ".safetensors":
            raise ValueError("H3 AV payload 必须使用 .safetensors")
        if payload.exists():
            raise ValueError("H3 AV payload 已存在，拒绝覆盖已有 artifact")
        video, audio = _extract_joint_tensors(joint_av)
        video = video.detach().to(device="cpu").contiguous()
        audio = audio.detach().to(device="cpu").contiguous()
        if not torch.is_tensor(video) or not torch.is_tensor(audio):
            raise ValueError("H3 joint AV 的两个成员必须为 torch tensor")
        payload.parent.mkdir(parents=True, exist_ok=True)
        partial = payload.with_name(f".{payload.name}.{uuid.uuid4().hex}.partial")
        try:
            save_file({"video": video, "audio": audio}, str(partial), metadata=_metadata_for(video, audio))
            _fsync_file(partial)
            os.replace(partial, payload)
        finally:
            if partial.exists():
                partial.unlink()
        payload_bytes, payload_sha256 = _sha256_file(payload)
        descriptor = _descriptor(payload, output_root)
        descriptor["h3_native_av"] = {
            "schema_version": SCHEMA_VERSION,
            "keys": ["video", "audio"],
            "payload_bytes": payload_bytes,
            "payload_sha256": payload_sha256,
            "video_shape": list(video.shape),
            "video_dtype": _dtype_name(video),
            "audio_shape": list(audio.shape),
            "audio_dtype": _dtype_name(audio),
        }
        return {
            "ui": {"h3_native_av": [descriptor]},
            "result": (json.dumps(descriptor, separators=(",", ":")),),
        }


class LocalVideoStudioH3LoadJointAV:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"artifact": ("STRING", {"default": "h3-native-av/"})},
            "optional": {"manifest": ("STRING", {"default": ""})},
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("joint_av",)
    FUNCTION = "load"
    CATEGORY = "Local Video Studio/H3"

    def load(self, artifact: str, manifest: str = ""):
        from safetensors import safe_open
        from comfy.nested_tensor import NestedTensor

        output_root, payload = _safe_payload_path(artifact)
        if payload.suffix.lower() != ".safetensors" or not payload.is_file():
            raise ValueError("H3 AV payload 不存在或扩展名无效")
        manifest_file = _manifest_path(payload, manifest or None)
        manifest_file.relative_to((output_root / ARTIFACT_SUBDIRECTORY).resolve())
        if not manifest_file.is_file():
            raise ValueError("H3 AV manifest 尚未提交，不能加载未 commit artifact")
        metadata_manifest = _read_json(manifest_file)
        _manifest_payload_matches(metadata_manifest, payload, output_root)
        payload_bytes, payload_sha256 = _sha256_file(payload)
        if payload_bytes != metadata_manifest["payloadBytes"] or payload_sha256 != metadata_manifest["payloadSha256"]:
            raise ValueError("H3 AV payload bytes/SHA-256 与 manifest 不匹配")

        with safe_open(str(payload), framework="pt", device="cpu") as handle:
            keys = set(handle.keys())
            if keys != {"video", "audio"}:
                raise ValueError("H3 AV safetensors 必须且只能包含 video/audio")
            video = handle.get_tensor("video")
            audio = handle.get_tensor("audio")
        tensors = {"video": video, "audio": audio}
        _tensor_manifest_matches(metadata_manifest, tensors)
        # H3 uses ComfyUI's light-weight wrapper because video/audio have
        # different ranks.  torch.nested.nested_tensor is not interchangeable
        # here: it requires a common rank on the Torch versions used by ComfyUI.
        joint = NestedTensor((video, audio))
        return ({"samples": joint},)


class LocalVideoStudioRequireGpuVAE:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"vae": ("VAE",)}}

    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("vae",)
    FUNCTION = "require_gpu"
    CATEGORY = "Local Video Studio/H3"

    def require_gpu(self, vae: Any):
        import comfy.model_management as model_management

        configured_device = model_management.vae_device()
        wrapper_device = getattr(vae, "device", None)
        patcher = getattr(vae, "patcher", None)
        load_device = getattr(patcher, "load_device", None)
        devices = {
            "configured": configured_device,
            "wrapper": wrapper_device,
            "load": load_device,
        }
        invalid = [
            f"{name}={device}"
            for name, device in devices.items()
            if getattr(device, "type", None) != "cuda"
        ]
        if invalid:
            details = ", ".join(invalid)
            raise RuntimeError(
                "H3 GPU VAE 设备校验失败："
                f"{details}。任务已停止，不会自动回退到 CPU。"
            )
        logging.info(
            "Local Video Studio H3 GPU VAE contract: "
            "configured=%s, wrapper=%s, load=%s, fallback=none",
            configured_device,
            wrapper_device,
            load_device,
        )
        return (vae,)


class LocalVideoStudioH3AnchorConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "conditioning": ("CONDITIONING",),
                "video_latent": ("LATENT",),
                "strength": ("FLOAT", {"default": 0.999, "min": 0.0, "max": 1.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("CONDITIONING",)
    RETURN_NAMES = ("conditioning",)
    FUNCTION = "anchor"
    CATEGORY = "Local Video Studio/H3"

    def anchor(self, conditioning: Any, video_latent: dict[str, Any], strength: float):
        samples = video_latent.get("samples") if isinstance(video_latent, dict) else None
        if samples is None or getattr(samples, "ndim", 0) != 5 or samples.shape[2] < 1:
            raise ValueError("H3 conditioning anchor 需要 [B,C,T,H,W] video latent")
        anchor_keyframe = {
            "resolved_frame_index": 0,
            "latent": samples[:, :, 0:1].contiguous(),
        }
        anchored = []
        for embedding, metadata in conditioning:
            next_metadata = dict(metadata)
            keyframes = next_metadata.get("minimax_keyframes") or []
            retained = [
                dict(keyframe)
                for keyframe in keyframes
                if keyframe.get("resolved_frame_index") != 0 or "latent" not in keyframe
            ]
            next_metadata["minimax_keyframes"] = [anchor_keyframe] + retained
            next_metadata["minimax_visual_cond_noise_aug"] = max(0.0, min(1.0, float(strength)))
            anchored.append([embedding, next_metadata])
        return (anchored,)


NODE_CLASS_MAPPINGS = {
    "LocalVideoStudioH3SaveJointAV": LocalVideoStudioH3SaveJointAV,
    "LocalVideoStudioH3LoadJointAV": LocalVideoStudioH3LoadJointAV,
    "LocalVideoStudioRequireGpuVAE": LocalVideoStudioRequireGpuVAE,
    "LocalVideoStudioH3RequireGpuVAE": LocalVideoStudioRequireGpuVAE,
    "LocalVideoStudioH3AnchorConditioning": LocalVideoStudioH3AnchorConditioning,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LocalVideoStudioH3SaveJointAV": "H3 Save Joint AV (Local Video Studio)",
    "LocalVideoStudioH3LoadJointAV": "H3 Load Joint AV (Local Video Studio)",
    "LocalVideoStudioRequireGpuVAE": "Require GPU VAE (Local Video Studio)",
    "LocalVideoStudioH3RequireGpuVAE": "H3 Require GPU VAE (Local Video Studio)",
    "LocalVideoStudioH3AnchorConditioning": "H3 Anchor Conditioning (Local Video Studio)",
}
