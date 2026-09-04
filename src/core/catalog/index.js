import { createModelCatalog } from "./model-catalog.js";
import { minimaxH3Fl2va } from "./models/minimax_h3_fl2va/definition.js";
import { minimaxH3Fl2vaInt4 } from "./models/minimax_h3_fl2va_int4/definition.js";
import { minimaxH3Fl2vaQ3Gguf } from "./models/minimax_h3_fl2va_q3_gguf/definition.js";
import { minimaxH3Fl2vaTurbo } from "./models/minimax_h3_fl2va_turbo/definition.js";
import { minimaxH3Ref2va } from "./models/minimax_h3_ref2va/definition.js";
import { minimaxH3Ref2vaInt4 } from "./models/minimax_h3_ref2va_int4/definition.js";
import { minimaxH3Continuum } from "./models/minimax_h3_continuum/definition.js";
import { sulphur2 } from "./models/sulphur2/definition.js";
import { promptModelEntries } from "./models/prompt.js";
import { imageModelEntries } from "./models/image.js";
import { legacyVideoModelEntries } from "./models/legacy-video.js";
import { postProcessModelEntries } from "./models/post-process.js";
import { depthAnythingModelEntries } from "./models/depth-anything.js";
import { loraModelEntries } from "./models/loras.js";
export const modelCatalog = createModelCatalog([
    minimaxH3Fl2va,
    minimaxH3Fl2vaInt4,
    minimaxH3Fl2vaQ3Gguf,
    minimaxH3Fl2vaTurbo,
    minimaxH3Ref2va,
    minimaxH3Ref2vaInt4,
    minimaxH3Continuum,
    sulphur2,
    ...promptModelEntries,
    ...imageModelEntries,
    ...legacyVideoModelEntries,
    ...postProcessModelEntries,
    ...depthAnythingModelEntries,
    ...loraModelEntries
]);
export { sortProfilesByCatalogOrder } from "./model-catalog.js";
export { customNodeCatalog, customNodeDefinition, compareCustomNodeDefinitions, compareDependencyIds, customNodePriority, H3_ACCELERATION_DEPENDENCY_ID, H3_ACCELERATION_DEPENDENCY_PRIORITY, LLAMA_CPP_PYTHON_DEPENDENCY_ID, LLAMA_CPP_PYTHON_DEPENDENCY_PRIORITY, SPECTRUM_MINIMUM_VERSION, SPECTRUM_TURBO_MINIMUM_VERSION, SPECTRUM_MODEL_AWARE_MINIMUM_VERSION, SPECTRUM_RECOMMENDED_VERSION, H3_MOTION_CONTEXT_MINIMUM_VERSION, H3_MOTION_CONTEXT_RECOMMENDED_VERSION, H3_MOTION_CONTEXT_RECOMMENDED_COMFYUI_VERSION, H3_LATENT_UPSCALER_REVISION, H3_ULTIMATE_UPSCALE_REVISION, H3_AV_SERIALIZER_REVISION, H3_CONTINUUM_MINIMUM_VERSION, H3_CONTINUUM_RECOMMENDED_VERSION, H3_CONTINUUM_REVISION, DLSS5_NODE_ID, DLSS5_NODE_REPOSITORY, DLSS5_NODE_DIRECTORY, DLSS5_NODE_VERSION, DLSS5_NODE_REVISION, DLSS5_NODE_REQUIRED_NODE_TYPES, DLSS5_VAPOURKIT_RELEASE, DLSS5_VAPOURKIT_ARCHIVE, DLSS5_VAPOURKIT_REPOSITORY, DLSS5_VAPOURKIT_URL, DLSS5_VAPOURKIT_SHA256, DLSS5_RUNTIME_BUNDLE_ID, dlss5RuntimeBundle, DLSS5_RUNTIME_BUNDLE, DLSS5_RUNTIME_ARTIFACTS, AETHERSCALE_NODE_ID, AETHERSCALE_NODE_REPOSITORY, AETHERSCALE_NODE_DIRECTORY, AETHERSCALE_NODE_VERSION, AETHERSCALE_NODE_RELEASE, AETHERSCALE_NODE_REVISION, AETHERSCALE_NODE_ARCHIVE, AETHERSCALE_NODE_ARCHIVE_BYTES, AETHERSCALE_NODE_ARCHIVE_SHA256, AETHERSCALE_NODE_RELEASE_URL, AETHERSCALE_NODE_REQUIRED_NODE_TYPES, AETHERSCALE_RUNTIME_BUNDLE_ID, AETHERSCALE_CARRIER_SOURCE, AETHERSCALE_CARRIER_RELEASE, AETHERSCALE_CARRIER_ARCHIVE, AETHERSCALE_CARRIER_ARCHIVE_BYTES, AETHERSCALE_CARRIER_ARCHIVE_SHA256, AETHERSCALE_CARRIER_DOWNLOAD_URL, AETHERSCALE_CARRIER_RUNTIME_FILES, AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST, aetherScaleCarrierRuntimeBundle, AETHERSCALE_CARRIER_RUNTIME_BUNDLE, AETHERSCALE_CARRIER_RUNTIME_ARTIFACTS } from "./dependencies/index.js";
