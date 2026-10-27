"""CPU file/state compatibility probe against an explicit Continuum checkout.

Run with the selected ComfyUI Python; no sampler, server or user files are used.
The manifest is a synthetic schema-1 fixture, not an application History commit.
"""

import argparse
import gc
import importlib
import json
from pathlib import Path
import sys
import tempfile
import types


def package(name, directory):
    module = types.ModuleType(name)
    module.__path__ = [str(directory)]
    module.__file__ = str(directory / "__init__.py")
    sys.modules[name] = module
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, required=True)
    parser.add_argument("--continuum", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.core.resolve()))
    # Core modules must see CPU policy before model_management is imported.
    from comfy.cli_args import args as core_args
    core_args.cpu = True
    import folder_paths
    import torch
    from comfy.nested_tensor import NestedTensor

    root = Path(__file__).resolve().parents[2]
    package("av_probe", root / "comfy_nodes/LocalVideoStudio-H3")
    av = importlib.import_module("av_probe.nodes")
    package("continuum_probe", args.continuum.resolve())
    # Keep normal module discovery intact; only pin the explicit candidate.
    av._continuum_module = lambda name: importlib.import_module("continuum_probe." + name)
    state_module = av._continuum_module("state")
    temporal = av._continuum_module("temporal")
    checks = []

    def rejected(label, call, text):
        try:
            call()
        except ValueError as error:
            assert text in str(error), str(error)
        else:
            raise AssertionError(label + " unexpectedly accepted")
        checks.append(label)

    with tempfile.TemporaryDirectory(prefix="h3-av-compat-") as directory:
        folder_paths.set_output_directory(directory)
        video = torch.arange(24 * temporal.video_latent_t(56) * 2 * 2, dtype=torch.float32).reshape(1, 24, -1, 2, 2).to(torch.bfloat16)
        audio = torch.arange(32 * 2 * temporal.audio_latent_t(56), dtype=torch.float32).reshape(1, 32, 2, -1)
        joint = {"samples": NestedTensor((video, audio))}
        saved = av.LocalVideoStudioH3SaveJointAV().save(joint, "h3-native-av/probe.safetensors")
        descriptor = saved["ui"]["h3_native_av"][0]
        payload = Path(directory) / descriptor["subfolder"] / descriptor["filename"]
        reference = "h3-native-av/probe.safetensors"
        rejected("uncommitted artifact refused", lambda: av.LocalVideoStudioH3LoadJointAV().load(reference), "manifest")
        facts = descriptor["h3_native_av"]
        manifest = {
            "schemaVersion": 1, "producerNodeVersion": "0.1.0",
            "payload": descriptor, "payloadBytes": facts["payload_bytes"],
            "payloadSha256": facts["payload_sha256"],
            "videoShape": facts["video_shape"], "videoDtype": facts["video_dtype"],
            "audioShape": facts["audio_shape"], "audioDtype": facts["audio_dtype"],
        }
        payload.with_suffix(".json").write_text(json.dumps(manifest), encoding="utf-8")
        loaded = av.LocalVideoStudioH3LoadJointAV().load(reference)[0]
        actual_video, actual_audio = state_module.extract_av_streams(loaded)
        assert torch.equal(video, actual_video) and torch.equal(audio, actual_audio)
        assert actual_video.dtype == video.dtype and actual_audio.dtype == audio.dtype
        checks.append("real safetensors save/load preserves both tensors and dtypes")
        rejected("existing payload refused", lambda: av.LocalVideoStudioH3SaveJointAV().save(joint, "h3-native-av/probe.safetensors"), "已存在")
        for capacity in ("5", "22", "39", "Auto — largest available"):
            state, report = av.LocalVideoStudioH3ArtifactToContinuumState().bridge(loaded, capacity_frames=capacity)
            state_module.validate_state(state)
            assert state["capacity_frames"] == (39 if capacity.startswith("Auto") else int(capacity))
            assert json.loads(report)["initial_state_nonempty"]
            checks.append("official tail state capacity " + capacity)
        rejected("unverified AV refused", lambda: av.LocalVideoStudioH3ArtifactToContinuumState().bridge(joint), "诊断元数据")
        manifest["payloadSha256"] = "0" * 64
        payload.with_suffix(".json").write_text(json.dumps(manifest), encoding="utf-8")
        rejected("payload hash disagreement refused", lambda: av.LocalVideoStudioH3LoadJointAV().load(reference), "SHA-256")
        # safetensors retains mmap ownership in tensors on Windows.
        del loaded, actual_video, actual_audio, state
        gc.collect()

    # Import actual candidate classes, not copied schemas or mocked delegates.
    facade = av._continuum_stateful_v38_class()
    schema = av.LocalVideoStudioH3ContinuumSamplerV38.INPUT_TYPES()
    assert "initial_state" in schema["optional"]
    assert issubclass(facade, av._continuum_module("v3.driving_nodes").H3ContinuumSamplerV38)
    checks.append("actual V38 facade MRO and initial_state schema")
    storage = av._continuum_module("run_storage")
    guard = importlib.import_module("av_probe.managed_prefix_guard")
    guard.install_registered_managed_prefix_guard({"H3ContinuumSamplerV38": av._continuum_module("v3.driving_nodes").H3ContinuumSamplerV38})
    assert storage.RunStorageController._load_validated_review_prefix._local_video_studio_prefix_guard
    checks.append("guard installed on actual registered sampler storage controller")
    # Synthetic controller facts, passed through the actual upstream formatter
    # and app parser. This is protocol evidence, not a persisted/generated Run.
    with tempfile.TemporaryDirectory(prefix="h3-receipt-compat-") as directory:
        controller = storage.RunStorageController.__new__(storage.RunStorageController)
        controller.run_root = Path(directory)
        controller.run_name = "compat-run"
        controller.revision_id = "rev-current"
        controller.revision_root = Path(directory) / "revisions/rev-current"
        controller.reused_count = 1
        controller.generated_count = 1
        controller.contract = {"chunk_count": 2}
        controller.disabled_reasons = []
        controller.notes = []
        controller.effective_reroll_nonce = 0
        controller.nonce_decision = "compatibility fixture"
        controller.io_metrics = {}
        controller.manifest = {"chunks": [
            {"sequence_index": index, "storage_revision_id": revision, "filename": f"chunk-{index + 1}.safetensors", "file_size": 100}
            for index, revision in enumerate(("rev-parent", "rev-current"))
        ]}
        receipt = av.LocalVideoStudioH3ContinuumManagedReceipt._storage_facts(controller.summary(detailed=True), "compat-run", 2)
        assert receipt["records"][0]["storage_revision_id"] == "rev-parent"
        assert receipt["records"][1]["generated"]
        checks.append("official detailed summary parsed with mixed-revision owners")
        controller.contract["chunk_count"] = 3
        rejected("planned three accepted two remains blocked", lambda: av.LocalVideoStudioH3ContinuumManagedReceipt._storage_facts(controller.summary(detailed=True), "compat-run", 3), "存储记录")
        controller.sampler_node_id = "12"
        controller.prompt_graph = {"24": {"class_type": "LocalVideoStudioH3ContinuumManagedReceipt", "inputs": {
            "status": ["12", 3], "run_name": "compat-run", "expected_prefix_chunks": 2,
            "expected_parent_revision_id": "rev-parent",
        }}}
        project = Path(directory) / "project.json"
        project.write_text(json.dumps({"canonical_storage_revision_id": "rev-newer"}), encoding="utf-8")
        before = project.read_bytes()
        rejected("actual controller stale head refused before prefix load", lambda: controller._load_validated_review_prefix({}, resume_safe=True), "head is no longer current")
        assert project.read_bytes() == before and not controller.revision_root.exists()
    assert not torch.cuda.is_initialized()
    print(json.dumps({"package_version": av._continuum_package_version(), "checks": checks, "cuda_initialized": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
