from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .refiner import LocalVideoStudioH3RefinerPrepare, LocalVideoStudioH3RefinerOutput, LocalVideoStudioH3RefinerLoraGuard

NODE_CLASS_MAPPINGS.update({
    "LocalVideoStudioH3RefinerPrepare": LocalVideoStudioH3RefinerPrepare,
    "LocalVideoStudioH3RefinerOutput": LocalVideoStudioH3RefinerOutput,
    "LocalVideoStudioH3RefinerLoraGuard": LocalVideoStudioH3RefinerLoraGuard,
})

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
