import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("refiner", Path(__file__).parents[2] / "comfy_nodes/LocalVideoStudio-H3/refiner.py")
refiner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refiner)


class RefinerFramePlanTests(unittest.TestCase):
    def test_an_ignored_adapter_cannot_silently_run_the_base_model(self):
        from types import SimpleNamespace
        base = SimpleNamespace(patches={"qkv": [(1, "turbo")]})
        guard = refiner.LocalVideoStudioH3RefinerLoraGuard()
        with self.assertRaises(RuntimeError):
            guard.check(base, SimpleNamespace(patches=dict(base.patches)), "refiner")
        patched = SimpleNamespace(patches={"qkv": [(1, "turbo"), (1, "refiner")]})
        self.assertIs(guard.check(base, patched, "refiner")[0], patched)

    def test_preserves_full_duration_instead_of_fixed_five_second_crop(self):
        self.assertEqual(refiner.refiner_frame_plan(450, 30), (360, 362))
        self.assertEqual(refiner.refiner_frame_plan(150, 30), (120, 124))
        self.assertEqual(refiner.refiner_frame_plan(1, 24), (1, 5))

    def test_refuses_long_and_invalid_sources(self):
        for count, fps in [(480, 30), (0, 24), (10, 0), (10, float("nan"))]:
            with self.assertRaises(ValueError):
                refiner.refiner_frame_plan(count, fps)

    def test_output_crops_padding_without_dropping_source_opening_frame(self):
        import torch
        frames = torch.arange(5 * 32 * 64 * 3).reshape(5, 32, 64, 3)
        out, = refiner.LocalVideoStudioH3RefinerOutput().restore(frames, 3, 60, 30)
        self.assertEqual(tuple(out.shape), (3, 30, 60, 3))
        self.assertTrue(torch.equal(out[0], frames[0, 1:31, 2:62]))
        with self.assertRaises(ValueError):
            refiner.LocalVideoStudioH3RefinerOutput().restore(frames, 6, 60, 30)


if __name__ == "__main__":
    unittest.main()
