import { createModelCatalog } from "./model-catalog.js";
import { minimaxH3Fl2va } from "./models/minimax_h3_fl2va/definition.js";
import { minimaxH3Fl2vaInt4 } from "./models/minimax_h3_fl2va_int4/definition.js";
import { minimaxH3Fl2vaQ3Gguf } from "./models/minimax_h3_fl2va_q3_gguf/definition.js";
import { minimaxH3Fl2vaTurbo } from "./models/minimax_h3_fl2va_turbo/definition.js";
import { minimaxH3Ref2va } from "./models/minimax_h3_ref2va/definition.js";
import { minimaxH3Ref2vaInt4 } from "./models/minimax_h3_ref2va_int4/definition.js";
import { sulphur2 } from "./models/sulphur2/definition.js";
import { promptModelEntries } from "./models/prompt.js";
import { imageModelEntries } from "./models/image.js";
import { legacyVideoModelEntries } from "./models/legacy-video.js";
import { postProcessModelEntries } from "./models/post-process.js";
import { loraModelEntries } from "./models/loras.js";
export const modelCatalog = createModelCatalog([
    minimaxH3Fl2va,
    minimaxH3Fl2vaInt4,
    minimaxH3Fl2vaQ3Gguf,
    minimaxH3Fl2vaTurbo,
    minimaxH3Ref2va,
    minimaxH3Ref2vaInt4,
    sulphur2,
    ...promptModelEntries,
    ...imageModelEntries,
    ...legacyVideoModelEntries,
    ...postProcessModelEntries,
    ...loraModelEntries
]);
export { sortProfilesByCatalogOrder } from "./model-catalog.js";
export { customNodeCatalog, customNodeDefinition, compareCustomNodeDefinitions, compareDependencyIds, customNodePriority, H3_ACCELERATION_DEPENDENCY_ID, H3_ACCELERATION_DEPENDENCY_PRIORITY, LLAMA_CPP_PYTHON_DEPENDENCY_ID, LLAMA_CPP_PYTHON_DEPENDENCY_PRIORITY, SPECTRUM_MINIMUM_VERSION, SPECTRUM_TURBO_MINIMUM_VERSION, SPECTRUM_MODEL_AWARE_MINIMUM_VERSION, SPECTRUM_RECOMMENDED_VERSION } from "./dependencies/index.js";
