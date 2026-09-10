/**
 * App-managed Python module installed into the Konohamaru node checkout.
 *
 * The upstream ReShade carrier identifies a video frame by its DLSS jitter
 * values. Konohamaru's standalone video worker submits a constant jitter, so
 * the carrier reuses the first enhanced frame. This module uses the official
 * video2dlssnr raw-frame protocol instead: the native helper owns the
 * temporal motion pipeline and returns one output frame for every input frame.
 */
export const konohamaruVideo2dlssnrSource = String.raw`from __future__ import annotations

import json
import math
import os
import queue
import re
import subprocess
import threading
import time
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from typing import Callable

import av
import numpy as np

from ..core import ffmpeg
from ..core.composition import compose_sdr, composition_report, validate_detail_strength
from ..core.gpu_selection import resolve_runtime_ai_gpu
from ..core.jobs import Cancelled, active_job
from ..core.naming import output_filename, require_available_output, validate_rename
from ..core.paths import VIDEO2DLSSNR_EXE
from ..core.runtime import (
    DLSS_MODEL_PRESETS,
    NR_PRESETS,
    NR_STYLES,
    prepare_runtime,
    resize_fit,
    rotate_frame,
    resolve_output_size,
    resolve_upscaling_mode,
    write_failure_report,
)
from .models import ConversionOptions, ConversionResult


VIDEO2DLSSNR_RELEASE = "v1.3"
VIDEO2DLSSNR_RUNTIME_FILES = (
    "video2dlssnr.exe",
    "nvngx.dll_dlssnr.dll",
    "nvngx_dlss.dll",
    "nvngx_dlssnr.dll",
)


def _validate_preview_options(
    options: ConversionOptions,
) -> tuple[float | None, int | None]:
    preview_seconds: float | None = None
    if options.preview_seconds is not None:
        try:
            preview_seconds = float(options.preview_seconds)
        except (TypeError, ValueError) as exc:
            raise ValueError("Preview duration must be a positive number of seconds.") from exc
        if not math.isfinite(preview_seconds) or preview_seconds <= 0:
            raise ValueError("Preview duration must be a positive number of seconds.")

    preview_frames: int | None = None
    if options.preview_frames is not None:
        if isinstance(options.preview_frames, bool):
            raise ValueError("Preview frame count must be a positive integer.")
        try:
            preview_frames = int(options.preview_frames)
        except (TypeError, ValueError) as exc:
            raise ValueError("Preview frame count must be a positive integer.") from exc
        if preview_frames <= 0 or preview_frames != options.preview_frames:
            raise ValueError("Preview frame count must be a positive integer.")
    if preview_seconds is not None and preview_frames is not None:
        raise ValueError("Choose either a timed preview or a frame preview, not both.")
    return preview_seconds, preview_frames


def _read_exact_into(stream, target: np.ndarray) -> None:
    view = memoryview(target).cast("B")
    offset = 0
    while offset < len(view):
        count = stream.readinto(view[offset:])
        if not count:
            raise EOFError(
                f"video2dlssnr stopped after {offset} of {len(view)} output bytes"
            )
        offset += count


def _terminate_process(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    with suppress(OSError):
        process.terminate()
    try:
        process.wait(timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        with suppress(OSError):
            process.kill()
        with suppress(OSError, subprocess.TimeoutExpired):
            process.wait(timeout=10)


def _validate_video2dlssnr_runtime() -> None:
    if os.name != "nt":
        raise RuntimeError("video2dlssnr DLSS5 视频后端当前只支持 Windows。")
    missing = []
    for name in VIDEO2DLSSNR_RUNTIME_FILES:
        filename = VIDEO2DLSSNR_EXE.parent / name
        try:
            data = filename.read_bytes()
        except OSError:
            missing.append(name)
            continue
        if not data or data[:160].startswith(b"version https://git-lfs.github.com/spec/v1"):
            missing.append(f"{name}（空文件或 Git LFS pointer）")
    if missing:
        raise RuntimeError(
            "Konohamaru video2dlssnr v1.3 runtime 未安装或不完整："
            + "、".join(missing)
            + "。请在设置中重新安装/更新 Konohamaru 节点。"
        )


def _frame_count(
    source: Path,
    metadata: dict,
    preview_seconds: float | None,
    preview_frames: int | None,
) -> int:
    if preview_frames is not None:
        known = int(metadata.get("frames", 0) or 0)
        duration_seconds = float(metadata.get("duration", 0.0) or 0.0)
        expected = duration_seconds * float(metadata.get("fps", 0.0) or 0.0)
        if known <= 0 or expected > max(1.5, known * 1.5):
            exact = ffmpeg.probe_video(source, count_mode="exact")
            known = int(exact["frames"])
            metadata["frames"] = known
            metadata["frame_count_source"] = exact["frame_count_source"]
        return min(known, preview_frames) if known else preview_frames
    if preview_seconds is not None:
        return ffmpeg.preview_frame_count(source, preview_seconds)
    frames = int(metadata.get("frames", 0) or 0)
    duration_seconds = float(metadata.get("duration", 0.0) or 0.0)
    expected = duration_seconds * float(metadata.get("fps", 0.0) or 0.0)
    if frames <= 0 or expected > max(1.5, frames * 1.5):
        exact = ffmpeg.probe_video(source, count_mode="exact")
        frames = int(exact["frames"])
        metadata["frames"] = frames
        metadata["frame_count_source"] = exact["frame_count_source"]
    if frames <= 0:
        raise RuntimeError("The input video contains no decodable frames.")
    return frames


def _style_code(value: str) -> int:
    try:
        return int(NR_STYLES[str(value)])
    except KeyError as exc:
        raise ValueError(f"Unsupported NR style: {value!r}.") from exc


def _nr_preset_code(value: str) -> int:
    try:
        return int(NR_PRESETS[str(value)])
    except KeyError as exc:
        raise ValueError(f"Unsupported NR preset: {value!r}.") from exc


def _sr_preset_name(value: str) -> str:
    value = str(value)
    if value == "Default":
        return "default"
    if value not in {"J", "K", "L", "M"}:
        raise ValueError(f"Unsupported DLSS model preset: {value!r}.")
    return value


def _command(
    options: ConversionOptions,
    input_width: int,
    input_height: int,
    output_width: int,
    output_height: int,
    adapter: int,
    effective_hdr: bool,
) -> list[str]:
    command = [
        str(VIDEO2DLSSNR_EXE),
        "--nr-video",
        "--nr-in",
        f"{input_width}x{input_height}",
        "--adapter",
        str(adapter),
        "--nr-sr-preset",
        _sr_preset_name(options.dlss_model_preset),
        "--nr-style",
        str(_style_code(options.nr_style)),
        "--nr-preset",
        str(_nr_preset_code(options.nr_preset)),
        "--nr-intensity",
        f"{float(options.nr_intensity)}",
        "--nr-local-structure",
        f"{float(options.local_structure_strength)}",
        "--nr-local-tone",
        f"{float(options.local_tone_strength)}",
        "--nr-skin",
        f"{float(options.skin_structure_strength)}",
        "--nr-global-tone",
        "-1",
        "--nr-detail",
        "1.0",
        "--nr-color",
        "1.0",
        "--nr-ui-correction",
        "0",
        "--nr-motion",
        "1",
        "--nr-motion-engine",
        "auto",
        "--nr-width",
        str(output_width),
        "--nr-height",
        str(output_height),
    ]
    if options.automatic_mask:
        command.append("--nr-auto-mask")
    if effective_hdr:
        command.append("--nr-hdr")
    return command


def _adapter_index(gpu: dict) -> int:
    try:
        return max(0, int(gpu.get("index", gpu.get("cuda_ordinal", 0))))
    except (TypeError, ValueError):
        return 0


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return str(value) if hasattr(value, "numerator") and hasattr(value, "denominator") else value


def convert_video_video2dlssnr(
    input_path: str | os.PathLike[str],
    options: ConversionOptions | None = None,
    progress: Callable[[float, str], None] | None = None,
    *,
    output_directory: str | os.PathLike[str],
    jobs_directory: str | os.PathLike[str],
    logs_directory: str | os.PathLike[str],
) -> ConversionResult:
    """Render a complete clip through the official temporal raw-frame backend."""
    options = options or ConversionOptions()
    detail_strength = validate_detail_strength(options.output_detail_strength)
    if options.preserve_hdr and detail_strength != 1.0:
        raise ValueError("Output detail strength is currently SDR-only.")
    source = Path(input_path).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    validate_codec_container = ffmpeg.validate_codec_container
    validate_codec_container(options.codec, options.container)
    validate_rename(options.rename_mode, options.custom_suffix)
    preview_seconds, preview_frames = _validate_preview_options(options)
    is_preview = preview_seconds is not None or preview_frames is not None
    compat_preview = is_preview and bool(getattr(options, "preview_compat", True))
    hdr_requested = bool(options.preserve_hdr)
    if compat_preview:
        hdr_requested = False
    if hdr_requested and not ffmpeg.hdr_mode_supported(options.codec):
        raise ValueError(
            "HDR Mode is only available for H.265, H.265 (NVIDIA NVENC), AV1, "
            "AV1 (NVIDIA NVENC) and ProRes Proxy."
        )
    _validate_video2dlssnr_runtime()
    prepared_runtime = prepare_runtime()

    with active_job() as controller:
        assert controller is not None
        started = time.perf_counter()

        def report_progress(value: float, description: str) -> None:
            if progress is None:
                return
            value = max(0.0, min(1.0, float(value)))
            elapsed = time.perf_counter() - started
            if 0.01 < value < 0.99 and elapsed > 0.5:
                eta = elapsed * (1.0 - value) / max(value, 1e-6)
                description = f"{description} - Time Remaining: {eta:.1f}s"
            progress(value, description)

        metadata: dict = {}
        gpu: dict | None = None
        runtime_bundle: dict | None = None
        output: Path | None = None
        job_dir: Path | None = None
        video_process: subprocess.Popen | None = None
        encoder = None
        encoder_thread: threading.Thread | None = None
        encoder_logs: list[str] = []
        nut = None
        feed_thread: threading.Thread | None = None
        feed_container = None
        feed_queue: queue.Queue = queue.Queue(maxsize=2)
        feed_errors: list[BaseException] = []
        stderr_lines: list[str] = []
        decoded_count = 0
        delivered = 0
        temp_video: Path | None = None
        worker_shutdown_forced = False
        try:
            probe_started = time.perf_counter()
            metadata = ffmpeg.probe_video(source, count_mode="metadata")
            frame_count = _frame_count(source, metadata, preview_seconds, preview_frames)
            timings: dict[str, float] = {
                "probe_seconds": time.perf_counter() - probe_started
            }
            factor, mode = resolve_upscaling_mode(options.upscaling_factor)
            input_width = int(metadata["width"])
            input_height = int(metadata["height"])
            output_width, output_height = resolve_output_size(input_width, input_height, factor)
            gpu = resolve_runtime_ai_gpu(
                prepared_runtime.gpus,
                prepared_runtime.runtime_bundle,
                options.ai_gpu_uuid,
            )
            runtime_bundle = prepared_runtime.runtime_bundle
            effective_hdr = hdr_requested and (not is_preview or not compat_preview)
            hdr_metadata = None
            if effective_hdr:
                hdr_metadata = {
                    "color_space": metadata.get("color_space", "unknown"),
                    "color_primaries": metadata.get("color_primaries", "unknown"),
                    "color_transfer": metadata.get("color_transfer", "unknown"),
                    "hdr": bool(metadata.get("hdr", False)),
                }
            selected_codec = "H.264" if compat_preview else options.codec
            video_gpu = ffmpeg.resolve_video_gpu(
                prepared_runtime.gpus,
                options.video_gpu_uuid,
                selected_codec,
                output_width,
                output_height,
            )
            output_root = Path(output_directory).resolve()
            jobs_root = Path(jobs_directory).resolve()
            logs_root = Path(logs_directory).resolve()
            output_root.mkdir(parents=True, exist_ok=True)
            jobs_root.mkdir(parents=True, exist_ok=True)
            logs_root.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S") + f"-{time.time_ns() % 1_000_000:06d}"
            job_dir = jobs_root / f"{source.stem}-{stamp}-{os.getpid()}"
            job_dir.mkdir(parents=True, exist_ok=False)
            extension = {"MP4": ".mp4", "MKV": ".mkv", "MOV": ".mov"}.get(options.container)
            if extension is None:
                raise ValueError(f"Unknown output container: {options.container!r}.")
            output_kind = (
                "DLSS5"
                if not is_preview
                else ("DLSS5_PREVIEW_FRAME" if preview_frames is not None else "DLSS5_PREVIEW")
            )
            output = output_root / output_filename(
                source,
                extension,
                options.rename_mode,
                options.custom_suffix,
                f"{source.stem}_{output_kind}_{stamp}",
            )
            require_available_output(output)
            temp_video = job_dir / f"processed-video{extension}"
            report_progress(0.01, f"Starting video2dlssnr {VIDEO2DLSSNR_RELEASE} feature 18")
            encoder, encoder_thread, encoder_logs, selected_encoder, encoding_quality = ffmpeg.start_encoder(
                temp_video,
                selected_codec,
                options.quality,
                controller,
                output_width,
                output_height,
                float(metadata["fps"]),
                None if video_gpu is None else int(video_gpu["cuda_ordinal"]),
                video_gpu is not None,
                hdr_mode=effective_hdr,
                hdr_metadata=hdr_metadata,
            )
            assert encoder.stdin is not None
            adapter = _adapter_index(gpu)
            command = _command(
                options,
                input_width,
                input_height,
                output_width,
                output_height,
                adapter,
                effective_hdr,
            )
            command.extend(["--frames", str(frame_count)])
            video_process = subprocess.Popen(
                command,
                cwd=str(VIDEO2DLSSNR_EXE.parent),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            controller.register(video_process)
            assert video_process.stdin is not None
            assert video_process.stdout is not None
            assert video_process.stderr is not None

            def drain_stderr() -> None:
                with video_process.stderr:
                    for raw in iter(video_process.stderr.readline, b""):
                        line = raw.decode("utf-8", "replace").rstrip()
                        if line and len(stderr_lines) < 2000:
                            stderr_lines.append(line)

            stderr_thread = threading.Thread(
                target=drain_stderr,
                name="konohamaru-video2dlssnr-stderr",
                daemon=True,
            )
            stderr_thread.start()

            def feed_frames() -> None:
                nonlocal feed_container, decoded_count
                try:
                    feed_container = av.open(str(source))
                    stream = feed_container.streams.video[0]
                    stream.thread_type = "AUTO"
                    for index, frame in enumerate(feed_container.decode(stream)):
                        if index >= frame_count:
                            break
                        if controller.cancel.is_set():
                            raise Cancelled("Render stopped by user.")
                        rgba = rotate_frame(
                            frame.to_ndarray(format="rgba"), int(metadata["rotation"])
                        )
                        if rgba.shape[1] != input_width or rgba.shape[0] != input_height:
                            rgba = resize_fit(rgba, input_width, input_height)
                        rgba = np.ascontiguousarray(rgba, dtype=np.uint8)
                        pts = int(frame.pts if frame.pts is not None else index)
                        feed_queue.put((index, rgba, pts))
                        video_process.stdin.write(rgba.tobytes())
                        decoded_count += 1
                    video_process.stdin.close()
                except BaseException as exc:
                    feed_errors.append(exc)
                    with suppress(OSError):
                        video_process.stdin.close()
                finally:
                    if feed_container is not None:
                        with suppress(Exception):
                            feed_container.close()

            feed_thread = threading.Thread(
                target=feed_frames,
                name="konohamaru-video2dlssnr-feed",
                daemon=True,
            )
            feed_thread.start()

            nut = av.open(encoder.stdin, mode="w", format="nut")
            raw_stream = nut.add_stream("rawvideo", rate=metadata["rate"])
            raw_stream.width = output_width
            raw_stream.height = output_height
            raw_stream.pix_fmt = "rgba"
            raw_stream.time_base = metadata["time_base"]
            output_frame_bytes = output_width * output_height * 4
            processing_started = time.perf_counter()
            report_progress(
                0.03,
                f"video2dlssnr {mode['name']}: {input_width}×{input_height} → "
                f"{output_width}×{output_height}",
            )
            while delivered < frame_count:
                if controller.cancel.is_set():
                    raise Cancelled("Render stopped by user.")
                try:
                    index, original, pts = feed_queue.get(timeout=0.1)
                except queue.Empty:
                    if feed_errors:
                        raise feed_errors[0]
                    if feed_thread is not None and not feed_thread.is_alive() and decoded_count <= delivered:
                        raise RuntimeError(
                            f"Decoded {decoded_count} frames instead of the expected {frame_count}."
                        )
                    continue
                rendered = np.empty(
                    (output_height, output_width, 4),
                    dtype=np.uint8,
                )
                _read_exact_into(video_process.stdout, rendered)
                rendered = compose_sdr(original, rendered, detail_strength)
                output_frame = av.VideoFrame.from_ndarray(rendered, format="rgba")
                output_frame.pts = pts
                output_frame.time_base = metadata["time_base"]
                for packet in raw_stream.encode(output_frame):
                    nut.mux(packet)
                delivered += 1
                report_progress(
                    0.04 + 0.84 * delivered / frame_count,
                    f"DLSS 5 frame {delivered}/{frame_count}",
                )
            timings["dlss_seconds"] = time.perf_counter() - processing_started
            if feed_thread is not None:
                feed_thread.join(timeout=10)
            if feed_thread is not None and feed_thread.is_alive():
                raise RuntimeError("video2dlssnr input feeder did not finish after the final frame.")
            if feed_errors:
                raise feed_errors[0]
            if decoded_count != frame_count:
                raise RuntimeError(
                    f"Decoded {decoded_count} frames instead of the expected {frame_count}."
                )
            for packet in raw_stream.encode():
                nut.mux(packet)
            nut.close()
            nut = None
            if encoder.stdin and not encoder.stdin.closed:
                encoder.stdin.close()
            encoder_code = encoder.wait(timeout=180)
            controller.unregister(encoder)
            encoder = None
            if video_process.stdin and not video_process.stdin.closed:
                video_process.stdin.close()
            try:
                video_code = video_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                # Some driver/runtime combinations finish the raw stream but
                # linger during D3D12 teardown. All expected output bytes have
                # already been consumed at this point, so bound the cleanup
                # instead of turning a complete render into a false failure.
                worker_shutdown_forced = True
                _terminate_process(video_process)
                video_code = video_process.returncode
            controller.unregister(video_process)
            stderr_thread.join(timeout=5)
            if video_code and not worker_shutdown_forced:
                raise RuntimeError(
                    f"video2dlssnr exited with code {video_code}:\n"
                    + "\n".join(stderr_lines[-60:])
                )
            if encoder_code:
                raise RuntimeError("Video encoder failed:\n" + "\n".join(encoder_logs[-40:]))
            feature_ready = any("feature ready" in line.casefold() for line in stderr_lines)
            completed = any(re.search(r"done:\s*\d+\s+frames\s+in\s+", line, re.I) for line in stderr_lines)
            if not feature_ready:
                raise RuntimeError(
                    "video2dlssnr completed without verifiable feature-18 evidence:\n"
                    + "\n".join(stderr_lines[-80:])
                )
            if worker_shutdown_forced:
                stderr_lines.append(
                    "video2dlssnr raw output reached the expected frame count; "
                    "the worker was terminated after a bounded D3D12 shutdown wait."
                )
            timings["encoding_seconds"] = time.perf_counter() - processing_started
            report_progress(0.91, "Muxing original audio and metadata")
            mux_started = time.perf_counter()
            ffmpeg.final_mux(
                temp_video,
                source,
                output,
                options.container,
                controller,
                preserve_supported_subtitles=True,
            )
            timings["final_mux_seconds"] = time.perf_counter() - mux_started
            verified = ffmpeg.probe_video(output, count_mode="packets")
            if int(verified["frames"]) != delivered:
                verified = ffmpeg.probe_video(output, count_mode="exact")
            if int(verified["frames"]) != delivered:
                raise RuntimeError(
                    f"Output verification found {verified['frames']} frames instead of {delivered}."
                )
            if (int(verified["width"]), int(verified["height"])) != (output_width, output_height):
                raise RuntimeError(
                    f"Output verification found {verified['width']}×{verified['height']} "
                    f"instead of {output_width}×{output_height}."
                )
            timings["verification_seconds"] = time.perf_counter() - mux_started
            elapsed = time.perf_counter() - started
            evidence = [
                line
                for line in stderr_lines
                if "feature ready" in line.casefold()
                or "optical flow:" in line.casefold()
                or "video:" in line.casefold()
                or "done:" in line.casefold()
            ]
            applied_preset = int(DLSS_MODEL_PRESETS.get(options.dlss_model_preset, 0))
            report = {
                "status": "success",
                "input": str(source),
                "output": str(output),
                "options": _json_safe(asdict(options)),
                "input_metadata": _json_safe(metadata),
                "output_metadata": _json_safe(verified),
                "gpu": gpu,
                "ai_gpu": gpu,
                "video_gpu": video_gpu,
                "encoder": selected_encoder,
                "encoding_quality": encoding_quality,
                "frames_processed": delivered,
                "output_composition": composition_report(detail_strength),
                "render_mode": (
                    "full"
                    if not is_preview
                    else ("preview-frame" if preview_frames is not None else "preview")
                ),
                "dlss_mode": mode["name"],
                "dlss_model_preset": options.dlss_model_preset,
                "requested_dlss_model_preset": options.dlss_model_preset,
                "requested_dlss_model_preset_code": applied_preset,
                "applied_dlss_model_preset": applied_preset,
                "applied_dlss_model_preset_name": options.dlss_model_preset,
                "requested_upscaling_factor": factor,
                "input_dimensions": {"width": input_width, "height": input_height},
                "negotiated_render_dimensions": {
                    "width": input_width,
                    "height": input_height,
                    "backend": "video2dlssnr-managed",
                },
                "output_dimensions": {"width": output_width, "height": output_height},
                "effective_factor": {
                    "width": output_width / input_width,
                    "height": output_height / input_height,
                },
                "nr_upscaling_requested": factor > 1.0,
                "nr_upscaling_active": factor > 1.0,
                "nr_native_fallback": False,
                "nr_enhancement_active": True,
                "neural_pipeline": "video2dlssnr-temporal-video",
                "ngx_setup_result": "video2dlssnr-feature18-ready",
                "scene_resets": "managed-by-video2dlssnr",
                "pipeline": "video2dlssnr-dlssnr-feature18",
                "feature_id": 18,
                "feature_18_confirmed": True,
                "carrier_create_result": "not-applicable",
                "successful_neural_rendering_frames": delivered,
                "addon_release": f"video2dlssnr-{VIDEO2DLSSNR_RELEASE}",
                "loaded_module_inventory": [
                    "runtime/video2dlssnr/video2dlssnr.exe",
                    "runtime/video2dlssnr/nvngx.dll_dlssnr.dll",
                    "runtime/video2dlssnr/nvngx_dlss.dll",
                    "runtime/video2dlssnr/nvngx_dlssnr.dll",
                    "system D3D12/DXGI/NGX core",
                ],
                "native_settings": {
                    "backend": "video2dlssnr",
                    "motion": True,
                    "motion_engine": "auto",
                    "adapter": adapter,
                },
                "elapsed_seconds": elapsed,
                "average_fps": delivered / max(elapsed, 1e-6),
                "timings": timings,
                "worker_log": stderr_lines,
                "worker_log_dropped_lines": 0,
                "worker_completed": completed,
                "worker_shutdown_forced": worker_shutdown_forced,
                "encoder_log": encoder_logs,
                "dlssnr_evidence": evidence,
            }
            report_path = logs_root / f"{output.name}.report.json"
            report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
            report_progress(1.0, "Complete — feature 18 confirmed; full video frames preserved")
            return ConversionResult(
                str(output),
                str(report_path),
                delivered,
                delivered,
                elapsed,
                gpu["display_name"],
                input_width,
                input_height,
                input_width,
                input_height,
                output_width,
                output_height,
                factor,
                str(mode["name"]),
                options.dlss_model_preset,
                applied_preset,
            )
        except BaseException as exc:
            was_cancelled = controller.cancel.is_set()
            if was_cancelled and not isinstance(exc, Cancelled):
                raise Cancelled("Render stopped by user.") from exc
            if isinstance(exc, Cancelled):
                raise
            if not isinstance(exc, Exception):
                raise
            controller.terminate_processes()
            if feed_thread is not None:
                feed_thread.join(timeout=2)
            if nut is not None:
                with suppress(Exception):
                    nut.close()
            _terminate_process(video_process)
            if video_process is not None:
                controller.unregister(video_process)
            _terminate_process(encoder)
            if encoder is not None:
                controller.unregister(encoder)
            if output and output.exists():
                with suppress(OSError):
                    output.unlink()
            logs_root = Path(logs_directory).resolve()
            report_path = write_failure_report(
                operation="video-render",
                source=str(source),
                error=exc,
                gpu=gpu,
                runtime_bundle=runtime_bundle,
                worker_code=video_process.poll() if video_process is not None else None,
                worker_logs=stderr_lines,
                reshade_lines=[],
                logs_dir=logs_root,
            )
            raise RuntimeError(f"{exc}\nDiagnostic report: {report_path}") from exc
        finally:
            if feed_thread is not None and feed_thread.is_alive():
                _terminate_process(video_process)
                feed_thread.join(timeout=2)
            if nut is not None:
                with suppress(Exception):
                    nut.close()
            _terminate_process(video_process)
            if video_process is not None:
                controller.unregister(video_process)
                for stream in (video_process.stdin, video_process.stdout, video_process.stderr):
                    if stream is not None:
                        with suppress(Exception):
                            stream.close()
            _terminate_process(encoder)
            if encoder is not None:
                controller.unregister(encoder)
                if encoder_thread is not None:
                    encoder_thread.join(timeout=2)
            if job_dir and job_dir.exists() and job_dir.parent == Path(jobs_directory).resolve():
                import shutil
                shutil.rmtree(job_dir, ignore_errors=True)
`;

export const KONOHAMARU_VIDEO2DLSSNR_SOURCE_FILENAME =
  "dlss_engine/video/video2dlssnr.py" as const;
