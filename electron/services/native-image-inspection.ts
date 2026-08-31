import { nativeImage } from "electron";
import type { ImageInspectionPort } from "../ports/image-inspection.js";

export const nativeImageInspection: ImageInspectionPort = {
  readDimensions(filename) {
    return nativeImage.createFromPath(filename).getSize();
  }
};
