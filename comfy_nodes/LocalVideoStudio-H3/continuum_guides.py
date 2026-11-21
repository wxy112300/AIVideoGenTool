"""Bundle native still guides without modifying the installed Continuum package."""

import importlib
import logging
from dataclasses import replace
from functools import wraps


class _GuideBundle(tuple):
    pass


class _GuideFrames(int):
    """Carry the bundle through the upstream single-frame call site."""

    def __new__(cls, sources):
        value = super().__new__(cls, sources[0].absolute_frame)
        value.sources = sources
        return value


class _GuideAssets(dict):
    source = None


class _GuideConditioning(list):
    def __init__(self, conditioning, guide_images):
        super().__init__(conditioning)
        self.guide_images = guide_images


def _continuum_guide_modules(registry):
    sampler = registry["H3ContinuumSamplerV38"]
    package, separator, _ = sampler.__module__.rpartition(".v3.")
    if not separator:
        raise RuntimeError("Unsupported Continuum sampler namespace for timed keyframes")
    return package, importlib.import_module(sampler.__module__), importlib.import_module(f"{package}.v2.sequence")


def install_guide_adapter(registry):
    package, driving, sequence = _continuum_guide_modules(registry)
    refine = importlib.import_module(f"{package}.v3.refine_context")
    expected = {"encode_still_image_guide", "resolve_guide_for_physical_group",
                "attach_still_image_guide", "validate_guide_visible_range"}
    if not expected.issubset(sequence._run_runtime_internal.__code__.co_names):
        raise RuntimeError("Installed Continuum changed its still-guide interface")
    if getattr(driving.prepare_still_image_guide_source, "_lvs_guide_bundle", False):
        return driving
    prepare = driving.prepare_still_image_guide_source
    encode = sequence.encode_still_image_guide
    resolve = sequence.resolve_guide_for_physical_group
    attach = sequence.attach_still_image_guide
    validate = sequence.validate_guide_visible_range
    make_refine_group = refine.make_refine_group

    @wraps(prepare)
    def prepare_bundle(guide, **kwargs):
        if not isinstance(guide, _GuideBundle):
            return prepare(guide, **kwargs)
        sources = tuple(prepare(item, **kwargs) for item in guide)
        first = sources[0]
        return replace(first, absolute_frame=_GuideFrames(sources), contract={
            **first.contract, "lvs_guides": [source.contract for source in sources],
        })

    @wraps(validate)
    def validate_bundle(source, **kwargs):
        frames = source.absolute_frame if source is not None else None
        if isinstance(frames, _GuideFrames):
            for item in frames.sources:
                validate(item, **kwargs)
        else:
            validate(source, **kwargs)

    @wraps(encode)
    def encode_bundle(vae, source):
        frames = source.absolute_frame if source is not None else None
        if isinstance(frames, _GuideFrames):
            return _GuideAssets((item.absolute_frame, encode(vae, item)) for item in frames.sources)
        return encode(vae, source)

    @wraps(resolve)
    def resolve_bundle(frame, **geometry):
        if not isinstance(frame, _GuideFrames):
            return resolve(frame, **geometry)
        targets = tuple(target for source in frame.sources
                        if (target := resolve(source.absolute_frame, **geometry)) is not None)
        return {**targets[0], "lvs_targets": targets} if targets else None

    @wraps(attach)
    def attach_bundle(conditioning, assets, target):
        if not isinstance(assets, _GuideAssets):
            return attach(conditioning, assets, target)
        if not target:
            return conditioning
        assets.source = assets[target["absolute_frame"]].source
        guide_images = {}
        for item in (target or {}).get("lvs_targets", ()):
            asset = assets[item["absolute_frame"]]
            conditioning = attach(conditioning, asset, item)
            guide_images[item["resolved_frame_index"]] = (
                asset.source.source_image if asset.source.source_image is not None else asset.source.image
            )
            logging.info("Studio Continuum guide: absolute=%d group=%d trim=%d local=%d",
                         item["absolute_frame"], item["physical_group_index"] + 1,
                         item["context_prefix_frames"], item["resolved_frame_index"])
        return _GuideConditioning(conditioning, guide_images)

    @wraps(make_refine_group)
    def make_bundle_refine_group(*, conditioning, **kwargs):
        if isinstance(conditioning, _GuideConditioning):
            kwargs["guide_images"] = conditioning.guide_images
        return make_refine_group(conditioning=conditioning, **kwargs)

    prepare_bundle._lvs_guide_bundle = True
    sequence.validate_guide_visible_range = validate_bundle
    sequence.encode_still_image_guide = encode_bundle
    sequence.resolve_guide_for_physical_group = resolve_bundle
    sequence.attach_still_image_guide = attach_bundle
    refine.make_refine_group = make_bundle_refine_group
    driving.prepare_still_image_guide_source = prepare_bundle
    return driving


class LocalVideoStudioH3ContinuumTimedGuide:
    RETURN_TYPES = ("H3_CONTINUUM_STILL_IMAGE_GUIDE",)
    FUNCTION = "append"
    CATEGORY = "Local Video Studio/H3"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",), "absolute_frame": ("INT", {"min": 0, "max": 0x7FFFFFFF})},
            "optional": {"previous": ("H3_CONTINUUM_STILL_IMAGE_GUIDE",)},
        }

    def append(self, image, absolute_frame, previous=None):
        import nodes
        driving = install_guide_adapter(nodes.NODE_CLASS_MAPPINGS)
        guide = driving.make_still_image_guide(image, absolute_frame)
        guides = previous if isinstance(previous, _GuideBundle) else (previous,) if previous is not None else ()
        if guides and absolute_frame <= guides[-1]["absolute_frame"]:
            raise ValueError("Continuum timed keyframes require distinct ascending output frames")
        return (_GuideBundle((*guides, guide)),)


class LocalVideoStudioH3ContinuumGuidePlanCheck:
    RETURN_TYPES = ("H3_CONTINUUM_ASSEMBLY_PLAN",)
    FUNCTION = "check"
    CATEGORY = "Local Video Studio/H3"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "plan": ("H3_CONTINUUM_ASSEMBLY_PLAN",), "guide": ("H3_CONTINUUM_STILL_IMAGE_GUIDE",)
        }}

    def check(self, plan, guide):
        import nodes
        package, _, _ = _continuum_guide_modules(nodes.NODE_CLASS_MAPPINGS)
        timeline = importlib.import_module(f"{package}.guide_timeline")
        groups = plan.get("decode_groups") or plan["chunks"]
        usable_target = min(plan["target_frames"], sum(group["net_frames"] for group in groups))
        for item in guide:
            frame = item["absolute_frame"]
            if frame >= usable_target:
                raise ValueError(f"Continuum guide frame {frame} has no sampled output frame; choose frame 0–{usable_target - 1}.")
            timeline.resolve_guide_target(frame, {**plan, "target_frames": usable_target})
        return (plan,)
