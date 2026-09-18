"""Small, app-owned ComfyUI nodes for durable H3 joint AV artifacts.

This package deliberately does not reimplement a sampler or an upscaler.  It
bridges the ComfyUI joint NestedTensor boundary to a safe, restartable file
artifact that the Electron application can validate and commit to History.
The Continuum bridge and facade below delegate state construction and sampling
to the installed ComfyUI-H3-Continuum package.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from functools import lru_cache
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import folder_paths


PACKAGE_VERSION = "0.3.4"
SCHEMA_VERSION = 1
ARTIFACT_SUBDIRECTORY = "h3-native-av"
PAYLOAD_FORMAT = "safetensors"
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
CONTINUUM_STATE_CAPACITY_OPTIONS = (
    "Auto — largest available",
    "5",
    "22",
    "39",
)


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


def _continuum_tensor_fingerprint(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    shape, dtype, finite, mean, std, weighted_sample = value
    return {
        "shape": [int(part) for part in shape],
        "dtype": str(dtype),
        "finite": bool(finite),
        "mean": float(mean),
        "std": float(std),
        "weighted_sample": float(weighted_sample),
    }


def _continuum_package_version() -> str:
    try:
        version_module = _continuum_module("version")
        value = getattr(version_module, "PACKAGE_VERSION", "")
        return str(value).strip() or "unknown"
    except Exception:
        return "unknown"


def _resolved_continuation_transport(
    continuation_backend: Any,
    audio_continuity: Any,
    continuity: Any,
) -> str:
    if str(continuation_backend) == "Compatibility":
        return "reference_context_v1"
    if not bool(audio_continuity):
        return "masked_video_prefix_v1"
    if str(continuity) == "Balanced — 22 frames":
        return "masked_av_prefix_22_v1"
    return "reference_context_v1"


def _continuum_assembly_facts(assembly_plan: Any) -> dict[str, Any]:
    if not isinstance(assembly_plan, dict):
        raise ValueError("assembly_plan 不是对象")
    groups = assembly_plan.get("decode_groups") or assembly_plan.get("chunks")
    if not isinstance(groups, list) or not groups:
        raise ValueError("assembly_plan 缺少 decode_groups/chunks")
    totals: list[int] = []
    trims: list[int] = []
    nets: list[int] = []
    contexts: list[int] = []
    clip_indices: list[int] = []
    for index, group in enumerate(groups, start=1):
        if not isinstance(group, dict):
            raise ValueError(f"assembly_plan 第 {index} 个 chunk 无效")
        try:
            total = int(group["total_frames"])
            trim = int(group["trim_frames"])
            net = int(group["net_frames"])
            context = int(group["context_frames"])
            clip_index = int(group.get("chunk_index", group.get("clip_index", 0)))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"assembly_plan 第 {index} 个 chunk 缺少帧事实") from exc
        if total <= 0 or trim < 0 or net <= 0 or total - trim != net:
            raise ValueError(f"assembly_plan 第 {index} 个 chunk 的 total/trim/net 不一致")
        if context < 0 or clip_index <= 0:
            raise ValueError(f"assembly_plan 第 {index} 个 chunk 的 context/clip 无效")
        totals.append(total)
        trims.append(trim)
        nets.append(net)
        contexts.append(context)
        clip_indices.append(clip_index)
    return {
        "actual_assembly_total_frames": totals,
        "actual_assembly_trims": trims,
        "actual_assembly_net_frames": nets,
        "actual_assembly_context_frames": contexts,
        "total_frames": sum(totals),
        "trim_frames": sum(trims),
        "net_frames": sum(nets),
        "context_frames": max(contexts),
        "output_clip_index": max(clip_indices),
        "continuation": any(trim > 0 for trim in trims),
    }


def _continuum_transport_evidence(
    status: Any,
    *,
    resolved_transport: str,
    context_frames: int,
    trim_frames: int,
) -> tuple[bool, str]:
    """Verify the transport reported after upstream target construction/sampling."""

    expected_context = int(context_frames)
    expected_trim = int(trim_frames)
    if expected_context <= 0 or expected_trim <= 0:
        return False, ""
    sampling_lines = [
        line.strip()
        for line in str(status).splitlines()
        if line.strip().startswith("chunk ")
        and f"trim={expected_trim}," in line
        and f"context={expected_context} (" in line
    ]
    if resolved_transport == "masked_av_prefix_22_v1":
        expected_marker = f"masked AV target prefix {expected_context}f/"
        matched = next(
            (
                line
                for line in sampling_lines
                if expected_marker in line and "interop=not_emitted" in line
            ),
            None,
        )
    elif resolved_transport == "masked_video_prefix_v1":
        matched = next(
            (
                line
                for line in sampling_lines
                if "masked video target prefix" in line
                and "interop=not_emitted" in line
            ),
            None,
        )
    elif resolved_transport == "reference_context_v1":
        matched = next(
            (
                line
                for line in sampling_lines
                if "interop=emitted actual_prefix=" in line
            ),
            None,
        )
    else:
        matched = None
    if matched is None:
        return False, ""
    return True, (
        f"{resolved_transport}:context={expected_context};"
        f"trim={expected_trim};sampling_report=verified"
    )


def _continuum_status_diagnostics(
    *,
    initial_state: dict[str, Any],
    assembly_plan: Any,
    sampler_status: Any,
    continuation_backend: Any,
    audio_continuity: Any,
    continuity: Any,
    run_storage: Any,
) -> dict[str, Any]:
    facts = _continuum_assembly_facts(assembly_plan)
    state_clip_index = int(initial_state.get("clip_index", 0))
    resolved_transport = _resolved_continuation_transport(
        continuation_backend,
        audio_continuity,
        continuity,
    )
    transport_verified, transport_evidence = _continuum_transport_evidence(
        sampler_status,
        resolved_transport=resolved_transport,
        context_frames=int(facts["context_frames"]),
        trim_frames=int(facts["trim_frames"]),
    )
    if str(run_storage) == "Off":
        selected_source = (
            "initial_state"
            if facts["continuation"]
            and facts["output_clip_index"] > state_clip_index
            and transport_verified
            else "fresh_run"
        )
    elif str(run_storage) == "Save + Auto Resume":
        selected_source = "run_storage"
    else:
        selected_source = "unknown"
    return {
        "schema_version": 1,
        "source_frame_count": int(initial_state["source_frame_count"]),
        "capacity_frames": int(initial_state["capacity_frames"]),
        "video_tail_shape": [int(part) for part in initial_state["video_tail"].shape],
        "audio_tail_shape": [int(part) for part in initial_state["audio_tail"].shape],
        "initial_state_nonempty": True,
        "selected_source": selected_source,
        "requested_backend": str(continuation_backend),
        "resolved_transport": resolved_transport,
        "transport_verified": transport_verified,
        "transport_evidence": transport_evidence,
        "state_clip_index": state_clip_index,
        "fresh_fallback": selected_source != "initial_state",
        "continuum_package_version": _continuum_package_version(),
        **facts,
    }


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
        return ({
            "samples": joint,
            "_local_video_studio_h3_native_av_report": {
                "reference": str(artifact),
                "payload_path": str(payload),
                "manifest_path": str(manifest_file),
                "payload_sha256": str(metadata_manifest["payloadSha256"]),
                "payload_bytes": int(metadata_manifest["payloadBytes"]),
                "video_shape": [int(part) for part in video.shape],
                "video_dtype": _dtype_name(video),
                "audio_shape": [int(part) for part in audio.shape],
                "audio_dtype": _dtype_name(audio),
            },
        },)


def _continuum_module(module_name: str):
    """Return one Continuum module without importing its node registry twice.

    ComfyUI loads directory-based custom nodes under a path-derived module name,
    so importing ``ComfyUI-H3-Continuum`` by a normal Python identifier is not
    reliable. Prefer the already loaded module; otherwise create a package
    namespace that points at the installed directory and import only state.py.
    """
    import importlib
    import importlib.machinery
    import sys
    import types

    module_parts = tuple(part.casefold() for part in module_name.split("."))
    expected_path_tail = (
        "comfyui-h3-continuum",
        *module_parts[:-1],
        f"{module_parts[-1]}.py",
    )
    for module in tuple(sys.modules.values()):
        module_file = getattr(module, "__file__", "")
        if not isinstance(module_file, str):
            continue
        module_path = Path(module_file)
        actual_path_tail = tuple(
            part.casefold()
            for part in module_path.parts[-len(expected_path_tail):]
        )
        if actual_path_tail == expected_path_tail:
            return module

    continuum_directory = None
    for custom_nodes_directory in folder_paths.get_folder_paths("custom_nodes"):
        root = Path(custom_nodes_directory)
        if not root.is_dir():
            continue
        for candidate in root.iterdir():
            if candidate.is_dir() and candidate.name.casefold() == "comfyui-h3-continuum":
                continuum_directory = candidate.resolve()
                break
        if continuum_directory is not None:
            break

    if continuum_directory is None:
        raise RuntimeError(
            "未找到 ComfyUI-H3-Continuum；请在设置中安装节点并重启 ComfyUI。"
        )

    package_name = "_local_video_studio_h3_continuum_bridge"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__file__ = str(continuum_directory / "__init__.py")
        package.__path__ = [str(continuum_directory)]
        package.__package__ = package_name
        package.__spec__ = importlib.machinery.ModuleSpec(
            package_name,
            loader=None,
            is_package=True,
        )
        sys.modules[package_name] = package
    return importlib.import_module(f"{package_name}.{module_name}")


def _continuum_state_module():
    return _continuum_module("state")


def _resolve_continuum_capacity(value: Any, source_frame_count: int) -> int:
    normalized = str(value).strip()
    if normalized.startswith("Auto"):
        for capacity in (39, 22, 5):
            if source_frame_count >= capacity:
                return capacity
        raise ValueError(
            f"H3 AV 只有 {source_frame_count} 帧，少于 Continuum 要求的最小 5 帧"
        )
    try:
        capacity = int(normalized)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Continuum state capacity 无效：{value!r}；只能使用 Auto、5、22 或 39"
        ) from exc
    if capacity not in (5, 22, 39):
        raise ValueError(
            f"Continuum state capacity 无效：{capacity}；只能使用 5、22 或 39"
        )
    if capacity > source_frame_count:
        raise ValueError(
            f"Continuum state capacity {capacity} 超过源 AV 的 {source_frame_count} 帧"
        )
    return capacity


class LocalVideoStudioH3ArtifactToContinuumState:
    """Convert a loaded full H3 JointAV latent into Continuum tail state.

    The input is intentionally LATENT rather than a filesystem path. Use
    LocalVideoStudioH3LoadJointAV for the app artifact, then connect its output
    here and connect ``state`` to H3 Continuum's ``previous_state`` or
    ``initial_state`` input. Continuum remains the owner of the state contract.
    """

    DESCRIPTION = (
        "将 Local Video Studio 的完整 H3 JointAV latent 转换为 H3 Continuum "
        "可续写的尾部 state；不复制或修改原始 artifact。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "joint_av": ("LATENT",),
                "source_frame_count": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 1_000_000,
                        "step": 1,
                        "tooltip": "0 = 根据 H3 video latent 的原生时间网格自动推导帧数。",
                    },
                ),
                "clip_index": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 1_000_000,
                        "step": 1,
                        "tooltip": "Continuum state 的逻辑片段序号；首次从 History artifact 开始通常为 1。",
                    },
                ),
                "capacity_frames": (
                    CONTINUUM_STATE_CAPACITY_OPTIONS,
                    {
                        "default": CONTINUUM_STATE_CAPACITY_OPTIONS[0],
                        "tooltip": "尾部上下文容量；Auto 会选择不超过源视频长度的最大 Continuum 容量。",
                    },
                ),
            }
        }

    RETURN_TYPES = ("H3_CONTINUUM_STATE", "STRING")
    RETURN_NAMES = ("state", "bridge_report")
    FUNCTION = "bridge"
    CATEGORY = "Local Video Studio/H3"

    def bridge(
        self,
        joint_av: Any,
        source_frame_count: int = 0,
        clip_index: int = 1,
        capacity_frames: Any = CONTINUUM_STATE_CAPACITY_OPTIONS[0],
    ):
        try:
            continuum_state = _continuum_state_module()
            artifact_report = (
                joint_av.get("_local_video_studio_h3_native_av_report")
                if isinstance(joint_av, dict)
                else None
            )
            if not isinstance(artifact_report, dict):
                raise ValueError(
                    "缺少已验证的 Native AV artifact 诊断元数据；禁止继续创建 state"
                )
            video, _audio = continuum_state.extract_av_streams(joint_av)
            latent_frame_count = int(
                continuum_state.pixel_frames_for_latent_t(int(video.shape[2]))
            )
            requested_frame_count = int(source_frame_count)
            resolved_frame_count = (
                latent_frame_count
                if requested_frame_count == 0
                else requested_frame_count
            )
            if resolved_frame_count <= 0:
                raise ValueError("source_frame_count 必须为 0（自动）或正整数")
            resolved_capacity = _resolve_continuum_capacity(
                capacity_frames,
                resolved_frame_count,
            )
            state = continuum_state.capture_state(
                joint_av,
                source_frame_count=resolved_frame_count,
                clip_index=int(clip_index),
                capacity_frames=resolved_capacity,
            )
            continuum_state.validate_state(state)
            video_fingerprint, audio_fingerprint = continuum_state.context_fingerprint(
                state["video_tail"],
                state["audio_tail"],
            )
        except Exception as exc:
            raise ValueError(f"H3 JointAV → Continuum state 转换失败：{exc}") from exc

        report = json.dumps(
            {
                "bridge": "LocalVideoStudioH3ArtifactToContinuumState",
                "input_artifact": artifact_report,
                "source_frame_count": int(state["source_frame_count"]),
                "clip_index": int(state["clip_index"]),
                "capacity_frames": int(state["capacity_frames"]),
                "video_tail_shape": list(state["video_tail"].shape),
                "audio_tail_shape": list(state["audio_tail"].shape),
                "video_tail_fingerprint": _continuum_tensor_fingerprint(video_fingerprint),
                "audio_tail_fingerprint": _continuum_tensor_fingerprint(audio_fingerprint),
                "initial_state_nonempty": bool(state),
                "source_mode": state.get("source_mode"),
                "state_schema_version": int(state["schema_version"]),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return (state, report)


@lru_cache(maxsize=1)
def _continuum_stateful_v38_class():
    """Build a V3.8 facade whose only change is forwarding initial_state.

    Continuum 3.8 keeps initial_state in its native V3 engine, but its public
    Production/V3.8 facade omits that one value while assembling the internal
    advanced dictionary.  C3 linearization lets this injector sit precisely
    between Production and H3ContinuumSamplerV3, preserving the complete V3.8
    resolution, reference, diagnostics, transport, review, and storage paths.
    """
    driving = _continuum_module("v3.driving_nodes")
    continuum_nodes = _continuum_module("v3.nodes")
    v3_base = continuum_nodes.H3ContinuumSamplerV3
    v38_base = driving.H3ContinuumSamplerV38

    class _InitialStateInjector(v3_base):
        def run(self, *args, **kwargs):
            initial_state = getattr(self, "_local_video_studio_initial_state", None)
            if initial_state is not None:
                advanced = dict(kwargs.get("advanced") or {})
                advanced["initial_state"] = initial_state
                kwargs["advanced"] = advanced
            return super().run(*args, **kwargs)

    class _StatefulV38(v38_base, _InitialStateInjector):
        pass

    return _StatefulV38


class LocalVideoStudioH3ContinuumSamplerV38:
    """Continuum V3.8 facade with its native initial_state input restored."""

    DESCRIPTION = (
        "H3 Continuum V3.8 原生 sampler 的兼容外壳；仅恢复上游内部已支持但"
        "公开 facade 未暴露的 initial_state 输入。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        sampler_class = _continuum_stateful_v38_class()
        schema = sampler_class.INPUT_TYPES()
        optional = dict(schema.get("optional", {}))
        optional["initial_state"] = (
            "H3_CONTINUUM_STATE",
            {
                "tooltip": (
                    "由 LocalVideoStudioH3ArtifactToContinuumState 提供的原生 AV "
                    "尾部状态；不要同时重复连接同一来源的 First Image 或 Video Guide。"
                )
            },
        )
        schema["optional"] = optional
        return schema

    RETURN_TYPES = (
        "LATENT",
        "LATENT",
        "H3_CONTINUUM_ASSEMBLY_PLAN",
        "STRING",
        "AUDIO",
        "H3_CONTINUUM_REFINE_CONTEXT",
    )
    RETURN_NAMES = (
        "video_latents",
        "audio_latents",
        "assembly_plan",
        "status",
        "driving_audio",
        "refine_context",
    )
    OUTPUT_IS_LIST = (True, True, False, False, False, False)
    FUNCTION = "run"
    CATEGORY = "Local Video Studio/H3"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return _continuum_stateful_v38_class().IS_CHANGED(**kwargs)

    def run(self, initial_state=None, **kwargs):
        if initial_state is None:
            raise ValueError("Continuum native-state 续写缺少 initial_state")
        continuum_state = _continuum_state_module()
        continuum_state.validate_state(initial_state)
        sampler = _continuum_stateful_v38_class()()
        sampler._local_video_studio_initial_state = initial_state
        outputs = sampler.run(**kwargs)
        if not isinstance(outputs, tuple) or len(outputs) < 4:
            raise ValueError("Continuum native-state sampler 返回值不完整，无法验证续写来源")
        diagnostics = _continuum_status_diagnostics(
            initial_state=initial_state,
            assembly_plan=outputs[2],
            sampler_status=outputs[3],
            continuation_backend=kwargs.get("continuation_backend", "Standard"),
            audio_continuity=kwargs.get("audio_continuity", True),
            continuity=kwargs.get("continuity", "Balanced — 22 frames"),
            run_storage=kwargs.get("run_storage", "Off"),
        )
        if diagnostics["fresh_fallback"]:
            raise ValueError(
                "H3 Continuum Extend 已拒绝：上游 sampling report 未证明 initial_state "
                "已通过目标构造和 continuation transport；请检查 artifact 分辨率、"
                "state schema、Run Storage、Diagnostics=Basic 以及上下文容量。"
            )
        status = (
            f"{str(outputs[3])}\n"
            "Local Video Studio Continuum diagnostics: "
            f"{json.dumps(diagnostics, ensure_ascii=False, separators=(',', ':'))}"
        )
        return (*outputs[:3], status, *outputs[4:])


class LocalVideoStudioH3ContinuumDiagnostics:
    """Persist and re-check the facts of one Native AV Extend execution."""

    DESCRIPTION = (
        "校验 Continuum Extend 确实使用 Native AV initial_state，并将受控的"
        " artifact、state、transport、assembly 与 Spectrum 事实写入 Comfy history。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "bridge_report": ("STRING", {"default": ""}),
                "status": ("STRING", {"default": ""}),
                "assembly_plan": ("H3_CONTINUUM_ASSEMBLY_PLAN",),
                "assembly_report": ("STRING", {"default": ""}),
                "spectrum_mode": ("STRING", {"default": "unknown"}),
                "spectrum_model_aware_mode": ("STRING", {"default": "unknown"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("diagnostics_report",)
    FUNCTION = "report"
    OUTPUT_NODE = True
    CATEGORY = "Local Video Studio/H3"

    @staticmethod
    def _status_marker(status: Any) -> dict[str, Any]:
        marker = "Local Video Studio Continuum diagnostics:"
        for line in reversed(str(status).splitlines()):
            if marker not in line:
                continue
            value = line.split(marker, 1)[1].strip()
            try:
                parsed = json.loads(value)
            except Exception as exc:
                raise ValueError("sampler diagnostics JSON 无效") from exc
            if isinstance(parsed, dict):
                return parsed
            raise ValueError("sampler diagnostics 必须为对象")
        raise ValueError("sampler status 缺少受控 diagnostics marker")

    @staticmethod
    def _bridge_report(value: Any) -> dict[str, Any]:
        try:
            parsed = json.loads(str(value))
        except Exception as exc:
            raise ValueError("bridge_report JSON 无效") from exc
        if not isinstance(parsed, dict):
            raise ValueError("bridge_report 必须为对象")
        return parsed

    def report(
        self,
        bridge_report: Any,
        status: Any,
        assembly_plan: Any,
        assembly_report: Any,
        spectrum_mode: Any = "unknown",
        spectrum_model_aware_mode: Any = "unknown",
    ):
        bridge = self._bridge_report(bridge_report)
        marker = self._status_marker(status)
        facts = _continuum_assembly_facts(assembly_plan)
        errors: list[str] = []
        if not isinstance(bridge.get("input_artifact"), dict):
            errors.append("缺少 input artifact 事实")
        if bridge.get("initial_state_nonempty") is not True:
            errors.append("bridge state 为空")
        if marker.get("selected_source") != "initial_state":
            errors.append(f"实际来源不是 initial_state：{marker.get('selected_source')!r}")
        if marker.get("fresh_fallback") is not False:
            errors.append("检测到 fresh fallback")
        if marker.get("transport_verified") is not True:
            errors.append("上游 sampling report 未证明 continuation transport 已执行")
        if not str(marker.get("transport_evidence", "")).strip():
            errors.append("缺少 continuation transport 执行证据")
        if marker.get("continuation") is not True or not facts["continuation"]:
            errors.append("assembly plan 没有正重叠 continuation")
        if int(marker.get("trim_frames", 0)) <= 0 or int(facts["trim_frames"]) <= 0:
            errors.append("trim_frames 必须大于 0")
        if int(marker.get("net_frames", 0)) <= 0 or int(facts["net_frames"]) <= 0:
            errors.append("net_frames 必须大于 0")
        if int(marker.get("context_frames", 0)) <= 0 or int(facts["context_frames"]) <= 0:
            errors.append("context_frames 必须大于 0")
        if int(marker.get("output_clip_index", 0)) <= int(marker.get("state_clip_index", 0)):
            errors.append("output clip index 没有推进")
        if not str(assembly_report).strip():
            errors.append("assembly report 为空")
        if errors:
            raise ValueError(
                "H3 Continuum Extend 已拒绝：" + "；".join(errors)
            )

        report = {
            "schema_version": 1,
            "input_artifact": bridge["input_artifact"],
            "source_frame_count": int(bridge["source_frame_count"]),
            "capacity_frames": int(bridge["capacity_frames"]),
            "video_tail_shape": bridge["video_tail_shape"],
            "audio_tail_shape": bridge["audio_tail_shape"],
            "video_tail_fingerprint": bridge["video_tail_fingerprint"],
            "audio_tail_fingerprint": bridge["audio_tail_fingerprint"],
            "initial_state_nonempty": True,
            "selected_source": "initial_state",
            "requested_backend": str(marker["requested_backend"]),
            "resolved_transport": str(marker["resolved_transport"]),
            "transport_verified": True,
            "transport_evidence": str(marker["transport_evidence"]),
            "context_frames": int(facts["context_frames"]),
            "total_frames": int(facts["total_frames"]),
            "trim_frames": int(facts["trim_frames"]),
            "net_frames": int(facts["net_frames"]),
            "state_clip_index": int(marker["state_clip_index"]),
            "output_clip_index": int(facts["output_clip_index"]),
            "continuation": True,
            "fresh_fallback": False,
            "actual_assembly_total_frames": facts["actual_assembly_total_frames"],
            "actual_assembly_trims": facts["actual_assembly_trims"],
            "actual_assembly_net_frames": facts["actual_assembly_net_frames"],
            "actual_assembly_context_frames": facts["actual_assembly_context_frames"],
            "assembly_report_present": True,
            "spectrum_mode": str(spectrum_mode),
            "spectrum_model_aware_mode": str(spectrum_model_aware_mode),
            "continuum_package_version": str(marker.get("continuum_package_version", "unknown")),
        }
        serialized = json.dumps(report, ensure_ascii=False, separators=(",", ":"))
        return {
            "ui": {"h3_continuum_diagnostics": [report]},
            "result": (serialized,),
        }


class LocalVideoStudioH3ContinuumManagedReceipt:
    """Emit a fail-closed receipt for the public V3.8 Run Storage path.

    This node does not sample, copy, or reinterpret Continuum tensors.  It
    only turns the public sampler's detailed Run Storage status into a small
    application receipt so Electron can bind History to the actual manifest
    and chunk files.  The legacy initial_state diagnostics node remains a
    separate contract and is intentionally not accepted here.
    """

    DESCRIPTION = (
        "记录公共 H3 Continuum V3.8 Run Storage + Review Each Chunk 的实际"
        " reused/generated、revision、chunk 文件与 assembly 事实。"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "status": ("STRING", {"default": ""}),
                "assembly_plan": ("H3_CONTINUUM_ASSEMBLY_PLAN",),
                "run_name": ("STRING", {"default": ""}),
                "project_id": ("STRING", {"default": ""}),
                "requested_chunks": ("INT", {"default": 1, "min": 1, "max": 16}),
                "generation_mode": ("STRING", {"default": "Review Each Chunk"}),
                "review_action": ("STRING", {"default": "Continue / Next"}),
                "spectrum_mode": ("STRING", {"default": "off"}),
                "spectrum_model_aware_mode": ("STRING", {"default": "off"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("managed_receipt",)
    FUNCTION = "report"
    OUTPUT_NODE = True
    CATEGORY = "Local Video Studio/H3"

    @staticmethod
    def _storage_facts(status: Any, run_name: Any, requested_chunks: Any) -> dict[str, Any]:
        text = str(status)
        expected_name = str(run_name).strip()
        expected_chunks = int(requested_chunks)
        summary = None
        path_value = None
        first_regenerated_chunk = None
        records: list[dict[str, Any]] = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("Run Storage:"):
                match = re.match(
                    r"^Run Storage:\s*(?P<name>[^/]+?)\s*/\s*revision\s+(?P<revision>[A-Za-z0-9._-]+);\s*(?P<reused>\d+)\s+reused,\s*(?P<generated>\d+)\s+generated,\s*(?P<total>\d+)\s+total;",
                    stripped,
                )
                if match:
                    summary = {
                        "run_name": match.group("name").strip(),
                        "revision_id": match.group("revision"),
                        "reused_count": int(match.group("reused")),
                        "generated_count": int(match.group("generated")),
                        "requested_chunks": int(match.group("total")),
                    }
            elif stripped.startswith("Run Storage path:"):
                path_value = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("stored chunk "):
                match = re.match(
                    r"^stored chunk\s+(?P<index>\d+):\s*(?P<revision>[A-Za-z0-9._-]+)/chunks/(?P<filename>[^\s]+)\s+\(",
                    stripped,
                )
                if match:
                    records.append({
                        "logical_chunk_index": int(match.group("index")),
                        "record_filename": match.group("filename"),
                        "storage_revision_id": match.group("revision"),
                    })
            elif stripped.startswith("Run Storage first regenerated chunk:"):
                value = stripped.split(":", 1)[1].strip()
                if value.isdigit():
                    first_regenerated_chunk = int(value)
                elif value != "none":
                    raise ValueError("managed receipt 的 first regenerated chunk 不是整数或 none")
        if summary is None:
            raise ValueError("managed receipt 缺少详细 Run Storage summary")
        if expected_name and summary["run_name"] != expected_name:
            raise ValueError("Run Storage summary 的 run name 与应用 identity 不一致")
        if summary["requested_chunks"] != expected_chunks:
            raise ValueError("Run Storage summary 的总 Chunk 数与请求不一致")
        if summary["generated_count"] != 1:
            raise ValueError("Review Each Chunk 本次必须且只能生成一个 physical group")
        if not path_value:
            raise ValueError("managed receipt 缺少 Run Storage path")
        if len(records) != expected_chunks:
            raise ValueError("managed receipt 没有为每个最终 Chunk 提供存储记录")
        if first_regenerated_chunk is None:
            raise ValueError("managed receipt 缺少官方 Run Storage first regenerated chunk 事实")
        if first_regenerated_chunk < 1 or first_regenerated_chunk > expected_chunks:
            raise ValueError("managed receipt first regenerated chunk 越出最终 Chunk 序列")
        if first_regenerated_chunk != summary["reused_count"] + 1:
            raise ValueError("Run Storage reused count 与 first regenerated chunk 不一致")
        records.sort(key=lambda item: int(item["logical_chunk_index"]))
        if [item["logical_chunk_index"] for item in records] != list(range(1, expected_chunks + 1)):
            raise ValueError("Run Storage chunk records 不是连续的最终 Chunk 序列")
        if summary["reused_count"] + summary["generated_count"] != expected_chunks:
            raise ValueError("Run Storage reused/generated 计数与最终 Chunk 总数不一致")
        first_generated = first_regenerated_chunk
        revision_root = Path(path_value)
        revisions_root = revision_root.parent
        for index, record in enumerate(records, start=1):
            record["reused"] = index <= summary["reused_count"]
            record["generated"] = index == first_generated
            storage_revision = str(record.get("storage_revision_id") or summary["revision_id"])
            record["payload_path"] = str(
                revisions_root / storage_revision / "chunks" / record["record_filename"]
            )
        return {
            **summary,
            "run_storage_path": path_value,
            "records": records,
            "first_generated_chunk": first_generated,
        }

    def report(
        self,
        status: Any,
        assembly_plan: Any,
        run_name: Any,
        project_id: Any,
        requested_chunks: Any,
        generation_mode: Any = "Review Each Chunk",
        review_action: Any = "Continue / Next",
        spectrum_mode: Any = "off",
        spectrum_model_aware_mode: Any = "off",
    ):
        if str(generation_mode) != "Review Each Chunk":
            raise ValueError("managed receipt 只接受 Review Each Chunk")
        if not str(project_id).strip() or not str(run_name).strip():
            raise ValueError("managed receipt 缺少稳定 project/run identity")
        if str(review_action).strip() not in {
            "Continue / Next",
            "Regenerate Current",
            "Finish Remaining",
        }:
            raise ValueError("managed receipt 的 review action 无效")
        storage = self._storage_facts(status, run_name, requested_chunks)
        facts = _continuum_assembly_facts(assembly_plan)
        try:
            schema_module = _continuum_module("run_storage")
            storage_schema_version = int(getattr(schema_module, "RUN_STORAGE_SCHEMA_VERSION"))
        except Exception as exc:
            raise ValueError(f"无法读取 Continuum Run Storage schema version：{exc}") from exc
        receipt = {
            "schema_version": 1,
            "project_id": str(project_id).strip(),
            "run_name": str(run_name).strip(),
            "run_storage_path": storage["run_storage_path"],
            "revision_id": storage["revision_id"],
            "package_version": _continuum_package_version(),
            "run_storage_schema_version": storage_schema_version,
            "generation_mode": "Review Each Chunk",
            "review_action": str(review_action),
            "run_storage": "Save + Auto Resume",
            "selected_source": "run_storage",
            "fresh_fallback": False,
            "requested_chunks": int(storage["requested_chunks"]),
            "reused_count": int(storage["reused_count"]),
            "generated_count": int(storage["generated_count"]),
            "reused_chunk_indices": [
                int(record["logical_chunk_index"])
                for record in storage["records"]
                if record["reused"]
            ],
            "generated_chunk_indices": [
                int(record["logical_chunk_index"])
                for record in storage["records"]
                if record["generated"]
            ],
            "first_generated_chunk": int(storage["first_generated_chunk"]),
            "chunk_records": storage["records"],
            "actual_assembly_total_frames": facts["actual_assembly_total_frames"],
            "actual_assembly_trims": facts["actual_assembly_trims"],
            "actual_assembly_net_frames": facts["actual_assembly_net_frames"],
            "actual_assembly_context_frames": facts["actual_assembly_context_frames"],
            "spectrum_mode": str(spectrum_mode),
            "spectrum_model_aware_mode": str(spectrum_model_aware_mode),
            "continuum_interop_api": 1,
            "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        }
        serialized = json.dumps(receipt, ensure_ascii=False, separators=(",", ":"))
        return {
            "ui": {"h3_continuum_managed_receipt": [receipt]},
            "result": (serialized,),
        }


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
    "LocalVideoStudioH3ArtifactToContinuumState": LocalVideoStudioH3ArtifactToContinuumState,
    "LocalVideoStudioH3ContinuumSamplerV38": LocalVideoStudioH3ContinuumSamplerV38,
    "LocalVideoStudioH3ContinuumDiagnostics": LocalVideoStudioH3ContinuumDiagnostics,
    "LocalVideoStudioH3ContinuumManagedReceipt": LocalVideoStudioH3ContinuumManagedReceipt,
    "LocalVideoStudioRequireGpuVAE": LocalVideoStudioRequireGpuVAE,
    "LocalVideoStudioH3RequireGpuVAE": LocalVideoStudioRequireGpuVAE,
    "LocalVideoStudioH3AnchorConditioning": LocalVideoStudioH3AnchorConditioning,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LocalVideoStudioH3SaveJointAV": "H3 Save Joint AV (Local Video Studio)",
    "LocalVideoStudioH3LoadJointAV": "H3 Load Joint AV (Local Video Studio)",
    "LocalVideoStudioH3ArtifactToContinuumState": "H3 Joint AV → Continuum State (Local Video Studio)",
    "LocalVideoStudioH3ContinuumSamplerV38": "H3 Continuum V3.8 Native State (Local Video Studio)",
    "LocalVideoStudioH3ContinuumDiagnostics": "H3 Continuum Extend Diagnostics (Local Video Studio)",
    "LocalVideoStudioH3ContinuumManagedReceipt": "H3 Continuum Managed Run Receipt (Local Video Studio)",
    "LocalVideoStudioRequireGpuVAE": "Require GPU VAE (Local Video Studio)",
    "LocalVideoStudioH3RequireGpuVAE": "H3 Require GPU VAE (Local Video Studio)",
    "LocalVideoStudioH3AnchorConditioning": "H3 Anchor Conditioning (Local Video Studio)",
}
