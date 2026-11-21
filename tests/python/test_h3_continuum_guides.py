import importlib.util
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "continuum_guides", Path(__file__).resolve().parents[2] / "comfy_nodes/LocalVideoStudio-H3/continuum_guides.py"
)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


@dataclass
class Source:
    absolute_frame: int
    image: str
    source_image: str
    contract: dict


class ContinuumGuideAdapterTests(unittest.TestCase):
    def test_routes_two_sides_of_seam_and_keeps_every_refine_image(self):
        def prepare(guide, **_):
            if guide is None:
                return None
            frame, image = guide
            return Source(frame, image, image, {"absolute_frame": frame, "image": image})

        def resolve(frame, *, start, stop, trim):
            if start <= frame < stop:
                return dict(absolute_frame=frame, resolved_frame_index=frame - start + trim,
                            physical_group_index=int(trim > 0), context_prefix_frames=trim)

        def encode(vae, source):
            return None if source is None else SimpleNamespace(source=source, latent=vae[source.image])

        def attach(conditioning, asset, target):
            return conditioning + [(target["resolved_frame_index"], asset.latent)] if target else conditioning

        def validate(source, *, target_frames):
            if source and source.absolute_frame >= target_frames:
                raise ValueError("outside output")

        def sampling_call_sites():
            return (sequence.encode_still_image_guide, sequence.resolve_guide_for_physical_group,
                    sequence.attach_still_image_guide, sequence.validate_guide_visible_range)

        driving = SimpleNamespace(prepare_still_image_guide_source=prepare)
        sequence = SimpleNamespace(
            _run_runtime_internal=sampling_call_sites, encode_still_image_guide=encode,
            resolve_guide_for_physical_group=resolve, attach_still_image_guide=attach,
            validate_guide_visible_range=validate,
        )
        refine = SimpleNamespace(make_refine_group=lambda **kwargs: kwargs["guide_images"])
        with patch.object(adapter, "_continuum_guide_modules", return_value=("test_package", driving, sequence)), \
                patch.object(adapter.importlib, "import_module", return_value=refine):
            adapter.install_guide_adapter({})
            wrapped = driving.prepare_still_image_guide_source
            adapter.install_guide_adapter({})
            self.assertIs(driving.prepare_still_image_guide_source, wrapped)

        source = driving.prepare_still_image_guide_source(adapter._GuideBundle(((123, "before"), (124, "after"), (239, "tail"))))
        self.assertEqual([item["image"] for item in source.contract["lvs_guides"]], ["before", "after", "tail"])
        sequence.validate_guide_visible_range(source, target_frames=240)
        with self.assertRaisesRegex(ValueError, "outside output"):
            sequence.validate_guide_visible_range(source, target_frames=239)
        assets = sequence.encode_still_image_guide({"before": 1, "after": 2, "tail": 3}, source)
        first = sequence.resolve_guide_for_physical_group(source.absolute_frame, start=0, stop=124, trim=0)
        second = sequence.resolve_guide_for_physical_group(source.absolute_frame, start=124, stop=240, trim=22)
        self.assertEqual(sequence.attach_still_image_guide([], assets, first), [(123, 1)])
        condition = sequence.attach_still_image_guide([], assets, second)
        self.assertEqual(condition, [(22, 2), (137, 3)])
        self.assertEqual(assets.source.source_image, "after")
        self.assertEqual(refine.make_refine_group(conditioning=condition, guide_images={22: "after"}),
                         {22: "after", 137: "tail"})
        original = driving.prepare_still_image_guide_source((124, "after"))
        self.assertEqual(original, Source(124, "after", "after", {"absolute_frame": 124, "image": "after"}))
        self.assertEqual(sequence.attach_still_image_guide([], sequence.encode_still_image_guide({"after": 2}, original),
                                                           sequence.resolve_guide_for_physical_group(124, start=124, stop=240, trim=22)),
                         [(22, 2)])


if __name__ == "__main__":
    unittest.main()
