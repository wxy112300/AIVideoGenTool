import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("refiner", Path(__file__).parents[2] / "comfy_nodes/LocalVideoStudio-H3/refiner.py")
refiner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refiner)


class RefinerFramePlanTests(unittest.TestCase):
    def test_tessera_sigmas_and_failed_decode_placeholder(self):
        import torch
        self.assertTrue(torch.allclose(refiner.LocalVideoStudioH3TesseraSigmas().get()[0], torch.tensor([1.0, .7, .4, 0.])))
        with self.assertRaises(ValueError):
            refiner.LocalVideoStudioH3RefinerOutput().restore(torch.zeros(362, 16, 16, 3), 362, 3780, 2160)

    def test_tessera_loader_delegates_core_loaders_and_resolves_unique_subfolders(self):
        import sys
        from types import SimpleNamespace
        from unittest.mock import patch
        calls = []
        def loader(kind):
            return lambda *args: calls.append((kind, args)) or (kind,)
        core = SimpleNamespace(UNETLoader=lambda: SimpleNamespace(load_unet=loader("model")),
                               CLIPLoader=lambda: SimpleNamespace(load_clip=loader("clip")),
                               VAELoader=lambda: SimpleNamespace(load_vae=loader("vae")))
        paths = SimpleNamespace(get_filename_list=lambda category: ["H3/model.safetensors", "H3/clip.safetensors", "H3/vae.safetensors", "H3/audio.safetensors"])
        with patch.dict(sys.modules, {"nodes": core, "folder_paths": paths}):
            result = refiner.LocalVideoStudioH3TesseraLoad().load(object(), "model.safetensors", "clip.safetensors", "vae.safetensors", "audio.safetensors")
        self.assertEqual(result, ("model", "clip", "vae", "vae"))
        self.assertEqual(calls[0], ("model", ("H3/model.safetensors", "default")))
        self.assertEqual(calls[1], ("clip", ("H3/clip.safetensors", "minimax", "default")))
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

    def test_accepts_aligned_native_and_long_sources_without_truncation(self):
        for frames in [362, 724, 736, 1440]:
            count, padded = refiner.refiner_frame_plan(frames, 24)
            self.assertEqual(count, frames)
            self.assertGreaterEqual(padded, frames)
            self.assertEqual((padded - 5) % 17, 0)
            self.assertLess(padded - frames, 17)
        self.assertEqual(refiner.refiner_frame_plan(900, 30), (720, 736))

    def test_refuses_invalid_sources(self):
        for count, fps in [(0, 24), (10, 0), (10, float("nan")), (10, float("inf"))]:
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
