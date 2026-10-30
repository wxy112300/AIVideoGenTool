import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import path from "node:path";
import type {
  HistoryFile,
  Settings
} from "../../src/types.js";
import {
  extractComfyOutputFiles,
  extractComfyNativeAvOutputFiles,
  isPersistentComfyOutputFile,
  isVideoOutputFilename
} from "../../src/core/comfy-output.js";
import { attachAbsoluteOutputPaths } from "../../src/core/comfy-output-paths.js";
import { imageOutputFormatFromFilename } from "../../src/core/image-workflow.js";
import { H3_MOTION_CONTEXT_SUBFOLDER } from "../../src/core/h3-motion-context.js";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";
import type { StateRepository } from "../ports/state-repository.js";

export interface ComfyOutputServiceDependencies {
  store: StateRepository;
  fileSystem: HistoryFileSystemPort;
  resolveComfyOutputDirectory(settings: Settings): Promise<string>;
}

/**
 * Resolves and verifies ComfyUI output files without coupling queue/history
 * execution to Electron's main-process shell.
 */
export class ComfyOutputService {
  constructor(private readonly deps: ComfyOutputServiceDependencies) {}

  async resolveTaskOutputDirectory(): Promise<string> {
    const settings = this.deps.store.get().settings;
    const configured = settings.outputDirectory.trim();
    const detected = await this.deps.resolveComfyOutputDirectory(settings);
    return detected || configured;
  }

  async requireExistingVideoOutput(
    result: unknown,
    alternateRoots: string[] = []
  ): Promise<HistoryFile[]> {
    const translator = createNativeTranslator(this.deps.store.get().settings.uiLocale);
    const t = translator.t;
    const outputDirectory = await this.resolveTaskOutputDirectory();
    if (!outputDirectory) {
      throw new Error(
        t(uiKeys.outputValidation.videoDirectory)
      );
    }

    const reportedFiles = extractComfyOutputFiles(result).filter(isPersistentComfyOutputFile);
    const roots = [...new Set([outputDirectory, ...alternateRoots].filter(Boolean))];
    let lastFiles = attachAbsoluteOutputPaths(reportedFiles, outputDirectory);
    for (const root of roots) {
      const files = attachAbsoluteOutputPaths(reportedFiles, root);
      lastFiles = files;
      const videoFiles = files.filter(
        (file) => file.absolutePath && isVideoOutputFilename(file.filename)
      );
      for (const file of videoFiles) {
        const resolved = await this.resolveExistingHistoryFile(file.absolutePath!);
        if (!resolved) continue;
        const stat = await this.safeStat(resolved);
        if (stat?.isFile() && stat.size > 0) return this.attachExistingSizes(files);
      }
    }

    const returnedNames = lastFiles.map((file) => file.filename).join(translator.locale === "en-US" ? ", " : "、");
    throw new Error(
      returnedNames
        ? t(uiKeys.outputValidation.videoMissing, { files: returnedNames })
        : t(uiKeys.outputValidation.videoAbsent)
    );
  }

  async requireExistingNativeAvOutput(
    result: unknown,
    expectedNodeId: string,
    alternateRoots: string[] = []
  ): Promise<HistoryFile[]> {
    const translator = createNativeTranslator(this.deps.store.get().settings.uiLocale);
    const t = translator.t;
    const outputDirectory = await this.resolveTaskOutputDirectory();
    if (!outputDirectory) {
      throw new Error(
        t(uiKeys.outputValidation.avDirectory)
      );
    }
    if (!expectedNodeId.trim()) {
      throw new Error(t(uiKeys.outputValidation.avNodeMissing));
    }

    const reportedFiles = extractComfyNativeAvOutputFiles(result, expectedNodeId);
    const roots = [...new Set([outputDirectory, ...alternateRoots].filter(Boolean))];
    let lastFiles = attachAbsoluteOutputPaths(reportedFiles, outputDirectory);
    for (const root of roots) {
      const files = attachAbsoluteOutputPaths(reportedFiles, root);
      lastFiles = files;
      const validFiles: HistoryFile[] = [];
      for (const file of files) {
        if (!file.absolutePath) continue;
        const resolved = await this.resolveExistingHistoryFile(file.absolutePath);
        if (!resolved) continue;
        const stat = await this.safeStat(resolved);
        if (stat?.isFile() && stat.size > 0) {
          validFiles.push({ ...file, absolutePath: resolved, sizeBytes: stat.size });
        }
      }
      if (validFiles.length) return validFiles;
    }

    const returnedNames = lastFiles.map((file) => file.filename).join(translator.locale === "en-US" ? ", " : "、");
    throw new Error(
      returnedNames
        ? t(uiKeys.outputValidation.avMissing, { files: returnedNames })
        : t(uiKeys.outputValidation.avAbsent)
    );
  }

  /**
   * Motion Context's upstream SaveLatent node does not use the Native AV
   * serializer descriptor. Reconstruct a HistoryFile only after the expected
   * safetensors file is present, so history never advertises a precomputed
   * path as a successful output.
   */
  async findExistingH3MotionContextOutput(
    expectedPath: string
  ): Promise<HistoryFile | undefined> {
    if (!expectedPath.trim()) return undefined;
    const outputDirectory = await this.resolveTaskOutputDirectory();
    if (!outputDirectory) return undefined;
    const resolved = await this.resolveExistingHistoryFile(expectedPath);
    if (!resolved) return undefined;
    const stat = await this.safeStat(resolved);
    if (!stat?.isFile() || stat.size <= 0) return undefined;

    const relative = path.relative(path.resolve(outputDirectory), resolved);
    const [subfolderRoot] = relative.split(path.sep);
    if (
      !subfolderRoot ||
      !new Set([H3_MOTION_CONTEXT_SUBFOLDER, "h3_context"]).has(subfolderRoot) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      path.extname(relative).toLowerCase() !== ".safetensors"
    ) {
      return undefined;
    }

    const subfolder = path.dirname(relative);
    return {
      filename: path.basename(relative),
      subfolder: subfolder === "." ? "" : subfolder.split(path.sep).join("/"),
      type: "output",
      format: "safetensors",
      absolutePath: resolved,
      sizeBytes: stat.size
    };
  }

  async requireExistingImageOutput(
    result: unknown,
    outputRoot: string,
    alternateRoots: string[] = []
  ): Promise<HistoryFile[]> {
    const translator = createNativeTranslator(this.deps.store.get().settings.uiLocale);
    const t = translator.t;
    if (!outputRoot) {
      throw new Error(
        t(uiKeys.outputValidation.imageDirectory)
      );
    }
    const reportedFiles = extractComfyOutputFiles(result).filter(isPersistentComfyOutputFile);
    const configuredRoots = [outputRoot, ...alternateRoots].filter(Boolean);
    const parentRoots = configuredRoots
      .filter((root) => ["images", "videos"].includes(path.basename(path.resolve(root)).toLowerCase()))
      .map((root) => path.dirname(path.resolve(root)));
    const roots = [...new Set([...configuredRoots, ...parentRoots])];
    let lastFiles = attachAbsoluteOutputPaths(reportedFiles, outputRoot);
    for (const root of roots) {
      const files = attachAbsoluteOutputPaths(reportedFiles, root);
      lastFiles = files;
      const imageFiles = files.filter(
        (file) => file.absolutePath && imageOutputFormatFromFilename(file.filename) === "png"
      );
      for (const file of imageFiles) {
        const resolved = await this.resolveExistingHistoryFile(file.absolutePath!);
        if (!resolved) continue;
        const stat = await this.safeStat(resolved);
        if (stat?.isFile() && stat.size > 0) return this.attachExistingSizes(files);
      }
    }
    const returnedNames = lastFiles.map((file) => file.filename).join(translator.locale === "en-US" ? ", " : "、");
    throw new Error(
      returnedNames
        ? t(uiKeys.outputValidation.imageMissing, { files: returnedNames })
        : t(uiKeys.outputValidation.imageAbsent)
    );
  }

  private async safeStat(filename: string) {
    return this.deps.fileSystem.stat(filename).catch(() => null);
  }

  private async attachExistingSizes(files: HistoryFile[]): Promise<HistoryFile[]> {
    return Promise.all(files.map(async (file) => {
      if (!file.absolutePath) return file;
      const resolved = await this.resolveExistingHistoryFile(file.absolutePath);
      if (!resolved) return file;
      const stat = await this.safeStat(resolved);
      return stat?.isFile()
        ? { ...file, absolutePath: resolved, sizeBytes: stat.size }
        : file;
    }));
  }

  private async resolveExistingHistoryFile(filename: string): Promise<string | null> {
    const requested = [filename]
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .map((candidate) => path.resolve(candidate));
    if (!requested.length) return null;
    const candidates = requested.flatMap((resolved) => [
      resolved,
      // VideoHelperSuite can report an `-audio.mp4` output while its finalized
      // file on disk is the otherwise identical `.mp4` path.
      resolved.replace(/-audio(?=\.[^.]+$)/i, "")
    ]);
    for (const candidate of new Set(candidates)) {
      const stat = await this.safeStat(candidate);
      if (stat?.isFile()) return candidate;
    }
    return null;
  }
}
