"""App-owned shape/time bridges. Sampling/upscaling remains in installed nodes.

Kijai r384 + LightX2V v1.2 is an application adaptation, not NV's LMS/SoL recipe.
Do not use stock AddNoise + DisableNoise: CONST flow would scale the signal twice.
"""
import math
import logging


class LocalVideoStudioH3RefinerLoraGuard:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"base": ("MODEL",), "model": ("MODEL",), "adapter": ("STRING",)}}

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "check"
    CATEGORY = "Local Video Studio/H3"

    def check(self, base, model, adapter):
        before, after = getattr(base, "patches", {}), getattr(model, "patches", {})
        added = sum(max(0, len(patches) - len(before.get(key, []))) for key, patches in after.items())
        if added == 0:
            raise RuntimeError(f"H3 Refiner {adapter}: no LoRA patches applied; refusing unadapted base sampling")
        logging.info("H3 Refiner adapter=%s applied_patch_entries=%s", adapter, added)
        return (model,)


def refiner_frame_plan(frame_count, fps):
    if not isinstance(frame_count, int) or frame_count < 1 or not math.isfinite(fps) or fps <= 0:
        raise ValueError("H3 Refiner input has no usable frames/fps")
    duration = frame_count / fps
    if duration > 15 + 1 / fps:
        raise ValueError("H3 Refiner supports up to 15 seconds; refusing to truncate")
    count = max(1, round(duration * 24))
    padded = max(5, count)
    padded += (5 - padded) % 17
    return count, padded


class LocalVideoStudioH3RefinerPrepare:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "fps": ("FLOAT", {"min": 0.01}),
                             "width": ("INT", {"min": 32, "max": 8192, "step": 32}),
                             "height": ("INT", {"min": 32, "max": 8192, "step": 32})}}

    RETURN_TYPES = ("IMAGE", "INT", "AUDIO", "INT", "SIGMAS")
    RETURN_NAMES = ("images", "frame_count", "silence", "padded_frames", "sigmas")
    FUNCTION = "prepare"
    CATEGORY = "Local Video Studio/H3"

    def prepare(self, images, fps, width, height):
        import torch
        import comfy.utils
        count, padded = refiner_frame_plan(images.shape[0], float(fps))
        logging.info("H3 Refiner prepare: source_frames=%s source_fps=%s frames24=%s padded=%s base=%sx%s; Kijai r384 + Turbo v1.2, Euler 3-step, no LMS/SoL",
                     images.shape[0], fps, count, padded, width, height)
        # Full video at 24 fps, not the reference CLI's fixed 121-frame crop.
        indices = (torch.arange(count, device=images.device) * float(fps) / 24).long().clamp(max=images.shape[0] - 1)
        frames = images[indices, :, :, :3]
        frames = comfy.utils.common_upscale(frames.movedim(-1, 1), width, height, "bilinear", "disabled").movedim(1, -1)
        if padded > count:
            frames = torch.cat((frames, frames[-1:].expand(padded - count, -1, -1, -1)), dim=0)
        silence = {"waveform": torch.zeros((1, 2, round(padded / 24 * 32000))), "sample_rate": 32000}
        return frames, count, silence, padded, torch.tensor([0.909375, 0.8571428571428571, 0.6666666666666666, 0.0])


class LocalVideoStudioH3RefinerOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "frame_count": ("INT", {"min": 1}),
                             "width": ("INT", {"min": 2, "max": 8192, "step": 2}),
                             "height": ("INT", {"min": 2, "max": 8192, "step": 2})}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "restore"
    CATEGORY = "Local Video Studio/H3"

    def restore(self, images, frame_count, width, height):
        if images.shape[0] < frame_count or images.shape[1] < height or images.shape[2] < width:
            raise ValueError("H3 Refiner decoded fewer frames/pixels than requested")
        y, x = (images.shape[1] - height) // 2, (images.shape[2] - width) // 2
        logging.info("H3 Refiner output: decoded_frames=%s retained_frames=%s canvas=%sx%s delivery=%sx%s",
                     images.shape[0], frame_count, images.shape[2], images.shape[1], width, height)
        return (images[:frame_count, y:y + height, x:x + width, :],)
