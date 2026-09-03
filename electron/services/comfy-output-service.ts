import path from "node:path";
import type {
  HistoryFile,
  Settings
} from "../../src/types.js";
import {
  extractComfyOutputFiles,
  extractComfyNativeAvOutputFiles,
  isVideoOutputFilename
} from "../../src/core/comfy-output.js";
import { attachAbsoluteOutputPaths } from "../../src/core/comfy-output-paths.js";
import { imageOutputFormatFromFilename } from "../../src/core/image-workflow.js";
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
    const outputDirectory = await this.resolveTaskOutputDirectory();
    if (!outputDirectory) {
      throw new Error(
        "ComfyUI 已返回完成状态，但无法确定输出目录。请在设置中确认 ComfyUI 目录后重试。"
      );
    }

    const reportedFiles = extractComfyOutputFiles(result);
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

    const returnedNames = lastFiles.map((file) => file.filename).join("、");
    throw new Error(
      returnedNames
        ? `ComfyUI 已返回完成状态，但输出视频不存在或为空：${returnedNames}`
        : "ComfyUI 已返回完成状态，但工作流没有返回任何视频文件。任务不会写入历史。"
    );
  }

  async requireExistingNativeAvOutput(
    result: unknown,
    expectedNodeId: string,
    alternateRoots: string[] = []
  ): Promise<HistoryFile[]> {
    const outputDirectory = await this.resolveTaskOutputDirectory();
    if (!outputDirectory) {
      throw new Error(
        "ComfyUI 已返回完成状态，但无法确定 H3 AV 输出目录。请在设置中确认 ComfyUI 目录后重试。"
      );
    }
    if (!expectedNodeId.trim()) {
      throw new Error("H3 AV serializer 输出校验缺少预期节点 ID，任务不会写入历史。");
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

    const returnedNames = lastFiles.map((file) => file.filename).join("、");
    throw new Error(
      returnedNames
        ? `ComfyUI 已返回完成状态，但 H3 AV serializer 输出不存在或为空：${returnedNames}`
        : "ComfyUI 已返回完成状态，但预期 serializer 节点没有返回 H3 AV 文件。任务不会写入历史。"
    );
  }

  async requireExistingImageOutput(
    result: unknown,
    outputRoot: string,
    alternateRoots: string[] = []
  ): Promise<HistoryFile[]> {
    if (!outputRoot) {
      throw new Error(
        "ComfyUI 已返回图片完成状态，但无法确定输出目录。请在设置中确认 ComfyUI 目录后重试。"
      );
    }
    const reportedFiles = extractComfyOutputFiles(result);
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
    const returnedNames = lastFiles.map((file) => file.filename).join("、");
    throw new Error(
      returnedNames
        ? `ComfyUI 已返回完成状态，但图片输出不存在或为空：${returnedNames}`
        : "ComfyUI 已返回完成状态，但图片工作流没有返回任何图片文件。"
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
