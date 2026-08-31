import {
  cleanupImageAssetLibrary,
  organizeImageAssetLibrary,
  scanImageAssetLibrary
} from "../../src/infrastructure/image-asset-library.js";
import type { ImageAssetLibraryFileSystemPort } from "../ports/image-asset-library.js";

export const nativeImageAssetLibrary: ImageAssetLibraryFileSystemPort = {
  scan: scanImageAssetLibrary,
  organize: organizeImageAssetLibrary,
  cleanup: cleanupImageAssetLibrary
};
