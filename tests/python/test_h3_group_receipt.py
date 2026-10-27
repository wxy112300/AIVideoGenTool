"""Run with selected Python and H3_CONTINUUM_TEST_ROOT pointing at official source."""
import copy
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import types
import unittest

import torch
from safetensors.torch import save_file


def namespace(name, directory):
    module = types.ModuleType(name)
    module.__path__ = [str(directory)]
    sys.modules[name] = module


namespace("group_app", Path(__file__).resolve().parents[2] / "comfy_nodes/LocalVideoStudio-H3")
namespace("group_official", Path(os.environ["H3_CONTINUUM_TEST_ROOT"]))
read_receipt = importlib.import_module("group_app.group_receipt").read_group_receipt
upstream = lambda name: importlib.import_module("group_official." + name)


class GroupReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)
        self.root = self.output / "h3_continuum/runs/run/revisions/current"
        self.root.mkdir(parents=True)
        (self.root.parent.parent / "project.json").write_text(json.dumps({"canonical_storage_revision_id": "current"}))
        self.manifest = {"run_storage_schema_version": 3, "sampling_contract_version": 6,
                         "revision_id": "current", "run_name": "run", "contract_sha256": "a" * 64,
                         "resume_safe": True, "status": "review_ready",
                         "review_unit": {"start": 2, "end": 2, "physical_group": 2},
                         "contract": {"chunk_count": 3, "global": {"execution_semantics": {}}}, "chunks": []}
        self.entries = []
        for i in range(1, 3):
            owner = "old" if i == 1 else "current"
            directory = self.root.parent / owner / "chunks"
            directory.mkdir(parents=True, exist_ok=True)
            video = torch.zeros(1, 24, 37, 2, 2)
            audio = torch.zeros(1, 32, 2, 207)
            payload = directory / f"chunk-{i}.safetensors"
            save_file({"video": video, "audio": audio}, str(payload))
            plan = upstream("state").make_plan(continuation=i > 1, clip_index=i, total_frames=124,
                trim_frames=22 if i > 1 else 0, width=32, height=32, context_frames=22 if i > 1 else 0,
                state_capacity_frames=22, requested_extend_seconds=5, debug=False)
            self.entries.append({"video": video, "audio": audio, "plan": plan})
            self.manifest["chunks"].append({"sequence_index": i - 1, "storage_revision_id": owner,
                "filename": payload.name, "file_size": payload.stat().st_size,
                "file_sha256": hashlib.sha256(payload.read_bytes()).hexdigest()})
        self.plan = upstream("v3.plan").make_assembly_plan(self.entries[-1:], chunk_seconds=5, preserve_final_frame=False)
        self.arguments = dict(run_name="run", project_id="project", planned_chunks=3, expected_prefix_chunks=1,
                              expected_parent_revision_id="old", execution_id="execution", step_id="step-2",
                              attempt_id="attempt", output_root=self.output, upstream=upstream)

    def read(self, *, generated=1, root=None):
        filename = self.root / "manifest.json"
        filename.write_text(json.dumps(self.manifest), encoding="utf-8")
        status = f"Run Storage: run / revision current; 1 reused, {generated} generated, {self.arguments['planned_chunks']} total;\nRun Storage path: {root or self.root}"
        before = filename.read_bytes()
        result = read_receipt(status=status, assembly_plan=self.plan, **self.arguments)
        self.assertEqual(filename.read_bytes(), before)
        return result

    def test_partial_prefix_and_scoped_audio_video_are_not_a_final_output(self):
        receipt = self.read()
        self.assertEqual(receipt["accepted_chunks"], 2)
        self.assertEqual(receipt["output_scope"], "current_physical_group")
        self.assertFalse(receipt["final_output"])
        self.assertEqual(receipt["chunk_records"][0]["storage_revision_id"], "old")
        self.assertEqual(receipt["output_groups"][0]["logical_chunks"], [2])
        self.assertFalse(torch.cuda.is_initialized())

    def test_full_prefix_projection_is_still_partial_until_planned_sequence_finishes(self):
        self.plan = upstream("v3.plan").make_assembly_plan(self.entries, chunk_seconds=5, preserve_final_frame=False)
        self.assertEqual(self.read()["output_scope"], "full_accepted_prefix")
        self.assertFalse(self.read()["sequence_complete"])

    def test_rejects_changed_layout_unsealed_manifest_and_unsafe_sampling(self):
        for patch in ({"status": "in_progress"}, {"status": "complete"}, {"sampling_contract_version": 5}, {"resume_safe": False}, {"run_name": "other"}, {"revision_id": "other"}):
            original = copy.deepcopy(self.manifest)
            self.manifest.update(patch)
            with self.assertRaises(ValueError):
                self.read()
            self.manifest = original

    def test_rejects_corrupt_and_missing_raw_payload_without_manifest_rewrite(self):
        payload = self.root / "chunks/chunk-2.safetensors"
        raw = payload.read_bytes()
        payload.write_bytes(raw + b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.read()
        payload.unlink()
        with self.assertRaises(FileNotFoundError):
            self.read()

    def test_rejects_outside_run_and_wrong_generated_count(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            self.read(root=self.output)
        with self.assertRaisesRegex(ValueError, "generated count"):
            self.read(generated=2)

    def test_rejects_half_a_terminal_physical_pair(self):
        self.manifest["contract"]["global"]["execution_semantics"]["flf_execution"] = "terminal_merged_10s_seed_v2"
        with self.assertRaisesRegex(ValueError, "complete physical group"):
            self.read()

    def test_complete_prefix_can_publish_only_a_complete_projection(self):
        self.manifest["status"] = "complete"
        self.manifest["contract"]["chunk_count"] = 2
        self.arguments["planned_chunks"] = 2
        self.assertFalse(self.read()["final_output"])
        self.plan = upstream("v3.plan").make_assembly_plan(self.entries, chunk_seconds=5, preserve_final_frame=False)
        self.assertTrue(self.read()["final_output"])

    def test_rejects_a_head_advanced_after_sampling(self):
        (self.root.parent.parent / "project.json").write_text(json.dumps({"canonical_storage_revision_id": "another-writer"}))
        with self.assertRaisesRegex(ValueError, "head changed"):
            self.read()


if __name__ == "__main__":
    unittest.main()
