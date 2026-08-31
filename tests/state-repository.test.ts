import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../electron/store.js";
import type { StateRepository } from "../electron/ports/state-repository.js";

describe("StateRepository port", () => {
  it("keeps JsonStore compatible without exposing its persistence implementation", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-state-port-"));
    const filename = path.join(directory, "studio-state.json");
    const repository: StateRepository = new JsonStore(filename);

    await repository.load();
    const settings = repository.getSettings();
    settings.uiLocale = "en-US";
    expect(repository.get().settings.uiLocale).not.toBe("en-US");

    const next = await repository.update((state) => {
      state.queueRunning = true;
    });
    expect(next.queueRunning).toBe(true);
    expect(JSON.parse(await fs.readFile(filename, "utf8")).queueRunning).toBe(true);
  });
});
