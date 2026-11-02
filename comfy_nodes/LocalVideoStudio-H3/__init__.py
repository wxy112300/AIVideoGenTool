from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .refiner import LocalVideoStudioH3RefinerPrepare, LocalVideoStudioH3RefinerOutput, LocalVideoStudioH3RefinerLoraGuard, LocalVideoStudioH3TesseraSigmas, LocalVideoStudioH3TesseraLoad

NODE_CLASS_MAPPINGS.update({
    "LocalVideoStudioH3TesseraSigmas": LocalVideoStudioH3TesseraSigmas,
    "LocalVideoStudioH3TesseraLoad": LocalVideoStudioH3TesseraLoad,
    "LocalVideoStudioH3RefinerPrepare": LocalVideoStudioH3RefinerPrepare,
    "LocalVideoStudioH3RefinerOutput": LocalVideoStudioH3RefinerOutput,
    "LocalVideoStudioH3RefinerLoraGuard": LocalVideoStudioH3RefinerLoraGuard,
})

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
