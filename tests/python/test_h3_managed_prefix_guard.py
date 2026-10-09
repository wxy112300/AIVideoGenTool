import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "managed_guard", Path(__file__).resolve().parents[2] / "comfy_nodes/LocalVideoStudio-H3/managed_prefix_guard.py"
)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ManagedPrefixGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.project = root / "project.json"
        self.project.write_text(json.dumps({"canonical_storage_revision_id": "accepted-head"}))
        self.original = self.project.read_bytes()

        class Controller:
            def _load_validated_review_prefix(controller, contract, *, resume_safe):
                controller.calls += 1
                return controller.prefix

        self.module = SimpleNamespace(RunStorageController=Controller)
        guard.install_managed_prefix_guard(self.module)
        self.c = Controller()
        self.c.run_root = root
        self.c.run_name = "selected-run"
        self.c.sampler_node_id = "12"
        self.c.calls = 0
        self.c.notes = ["review head incompatible: VAE runtime code identity changed"]
        self.c.review_head = {"revision_id": "accepted-head"}
        self.c.prefix = SimpleNamespace(records=(1, 2, 3))
        self.c.prompt_graph = {"24": {"class_type": "LocalVideoStudioH3ContinuumManagedReceipt", "inputs": {
            "status": ["12", 3], "run_name": "selected-run", "expected_prefix_chunks": 3,
            "expected_parent_revision_id": "accepted-head",
        }}}

    def run_guard(self):
        result = self.c._load_validated_review_prefix({}, resume_safe=True)
        # Official prepare creates/writes a revision only after this call.
        (self.c.run_root / "would-create-revision").write_text("write")
        return result

    def test_incompatible_old_prefix_is_rejected_before_writes(self):
        self.c.review_head = None
        self.c.prefix = SimpleNamespace(records=())
        with self.assertRaisesRegex(ValueError, "sampling contract"):
            self.run_guard()
        self.assertEqual(self.c.calls, 1)
        self.assertEqual(self.project.read_bytes(), self.original)
        self.assertFalse((self.c.run_root / "would-create-revision").exists())

    def test_compatible_full_prefix_passes_without_replacing_official_tensors(self):
        self.assertIs(self.run_guard(), self.c.prefix)
        self.assertEqual(self.c.calls, 1)

    def test_stale_head_blocks_before_prefix_loading(self):
        self.project.write_text(json.dumps({"canonical_storage_revision_id": "another-writer-head"}))
        with self.assertRaisesRegex(ValueError, "no longer current"):
            self.run_guard()
        self.assertEqual(self.c.calls, 0)

    def test_other_compatible_revision_and_partial_prefix_are_rejected(self):
        for candidate, records in [("another-head", (1, 2, 3)), ("accepted-head", (1, 2))]:
            self.c.review_head = {"revision_id": candidate}
            self.c.prefix = SimpleNamespace(records=records)
            with self.assertRaisesRegex(ValueError, "incompatible"):
                self.run_guard()

    def test_missing_expectation_fails_closed_for_app_receipt(self):
        del self.c.prompt_graph["24"]["inputs"]["expected_prefix_chunks"]
        with self.assertRaisesRegex(ValueError, "missing queued"):
            self.run_guard()
        self.assertEqual(self.c.calls, 0)

    def test_pending_first_run_and_unrelated_public_sampler_remain_available(self):
        self.c.prompt_graph["24"]["inputs"].update(expected_prefix_chunks=0, expected_parent_revision_id="")
        self.assertIs(self.run_guard(), self.c.prefix)
        self.c.prompt_graph = {}
        self.assertIs(self.run_guard(), self.c.prefix)

    def test_repeated_schema_probe_does_not_wrap_again(self):
        wrapped = self.module.RunStorageController._load_validated_review_prefix
        guard.install_managed_prefix_guard(self.module)
        self.assertIs(self.module.RunStorageController._load_validated_review_prefix, wrapped)

    def test_schema_probe_imports_the_registered_sampler_namespace_before_wrapping(self):
        sampler = type("RegisteredSampler", (), {})
        sampler.__module__ = "custom_nodes.official_continuum.v3.driving_nodes"
        with patch.object(guard.importlib, "import_module", return_value=self.module) as load:
            guard.install_registered_managed_prefix_guard({"H3ContinuumSamplerV38": sampler})
        load.assert_called_once_with("custom_nodes.official_continuum.run_storage")
        self.assertTrue(self.module.RunStorageController._load_validated_review_prefix._local_video_studio_prefix_guard)

    def test_unsupported_namespace_does_not_advertise_a_guarded_runtime(self):
        with self.assertRaisesRegex(RuntimeError, "unsupported registered"):
            guard.install_registered_managed_prefix_guard({"H3ContinuumSamplerV38": type("UnknownSampler", (), {})})


class SamplingEvidenceTests(unittest.TestCase):
    def test_reads_actual_v6_and_keeps_v5_read_only_without_rewriting(self):
        with TemporaryDirectory() as root:
            filename = Path(root) / "manifest.json"
            for version in (5, 6):
                for safe in (False, True):
                    text = json.dumps({"revision_id": "head", "sampling_contract_version": version, "contract_sha256": "a" * 64, "resume_safe": safe})
                    filename.write_text(text, encoding="utf-8")
                    self.assertEqual(guard.read_sampling_evidence(root, "head"), {"sampling_contract_version": version, "contract_sha256": "a" * 64, "resume_safe": safe})
                    self.assertEqual(filename.read_text(encoding="utf-8"), text)

    def test_rejects_missing_unknown_and_mismatched_manifest_facts(self):
        with TemporaryDirectory() as root:
            filename = Path(root) / "manifest.json"
            base = {"revision_id": "head", "sampling_contract_version": 6, "contract_sha256": "a" * 64, "resume_safe": True}
            for patch in ({"sampling_contract_version": 7}, {"sampling_contract_version": None}, {"contract_sha256": "guess"}, {"resume_safe": None}, {"revision_id": "other"}):
                filename.write_text(json.dumps({**base, **patch}), encoding="utf-8")
                before = filename.read_bytes()
                with self.assertRaises(ValueError):
                    guard.read_sampling_evidence(root, "head")
                self.assertEqual(filename.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
