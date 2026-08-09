import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveExistingHistoryFile,
  stageFileForWindowsClipboard
} from "./windows-clipboard.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("stageFileForWindowsClipboard", () => {
  it("keeps the source intact if Explorer moves the staged clipboard file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-clipboard-"));
    temporaryRoots.push(root);
    const source = path.join(root, "source-video.mp4");
    const stagingRoot = path.join(root, "staging");
    const pasted = path.join(root, "pasted-video.mp4");
    await fs.writeFile(source, "video-data", "utf8");

    const { stagedFilename } = await stageFileForWindowsClipboard(source, stagingRoot);
    await fs.rename(stagedFilename, pasted);

    await expect(fs.readFile(source, "utf8")).resolves.toBe("video-data");
    await expect(fs.readFile(pasted, "utf8")).resolves.toBe("video-data");
  });
});

describe("resolveExistingHistoryFile", () => {
  it("uses a current-machine fallback when the recorded absolute path is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-history-media-"));
    temporaryRoots.push(root);
    const currentFile = path.join(root, "output", "result.mp4");
    await fs.mkdir(path.dirname(currentFile), { recursive: true });
    await fs.writeFile(currentFile, "video-data", "utf8");

    await expect(resolveExistingHistoryFile(
      "C:\\OldComputer\\ComfyUI\\output\\result.mp4",
      [currentFile]
    )).resolves.toBe(currentFile);
  });
});
