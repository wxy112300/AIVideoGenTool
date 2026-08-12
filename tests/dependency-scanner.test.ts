import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanCustomNodes } from "../electron/services/dependency-scanner";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("dependency scanner", () => {
  it("recognizes installed nodes while ComfyUI is offline", async () => {
    const comfyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-node-scan-"));
    temporaryDirectories.push(comfyRoot);
    await fs.mkdir(path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes"), {
      recursive: true
    });
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:1"
    };

    const statuses = await scanCustomNodes(comfyRoot, settings);
    const kjNodes = statuses.find((status) => status.id === "kjnodes");
    const flashVsr = statuses.find((status) => status.id === "flashvsr");

    expect(kjNodes).toMatchObject({
      installed: true,
      runtimeVerified: false,
      loaded: true,
      directory: path.join(comfyRoot, "custom_nodes", "ComfyUI-KJNodes")
    });
    expect(flashVsr).toMatchObject({
      installed: false,
      runtimeVerified: false,
      loaded: false
    });
  });
});
