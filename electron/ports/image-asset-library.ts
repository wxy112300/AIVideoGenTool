import type {
  AppState,
  ImageAssetLibraryProgress,
  ImageAssetLibraryResult,
  ImageAssetLibraryScan
} from "../../src/types.js";

export type ImageAssetLibraryProgressReporter = (
  progress: ImageAssetLibraryProgress
) => void;

/**
 * Application-facing filesystem capability for the image asset library.
 * The implementation may use native node filesystem APIs, while callers stay
 * independent from Electron and can inject a temporary test implementation.
 */
export interface ImageAssetLibraryFileSystemPort {
  scan(
    state: AppState,
    libraryDirectory: string,
    report?: ImageAssetLibraryProgressReporter
  ): Promise<ImageAssetLibraryScan>;
  organize(
    state: AppState,
    libraryDirectory: string,
    report?: ImageAssetLibraryProgressReporter
  ): Promise<{ state: AppState; result: ImageAssetLibraryResult }>;
  cleanup(
    state: AppState,
    libraryDirectory: string,
    requestedPaths: string[],
    report?: ImageAssetLibraryProgressReporter
  ): Promise<ImageAssetLibraryResult>;
}
