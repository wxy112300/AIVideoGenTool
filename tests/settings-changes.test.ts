import { expect, it } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { settingsChangedKeys } from "../src/core/settings-changes";

it("counts actual pending fields and excludes immediate appearance saves", () => {
  const saved = createDefaultSettings();
  expect(settingsChangedKeys(saved, null)).toEqual([]);
  expect(settingsChangedKeys(saved, { ...saved, appearance: { accent: "orange", palette: "graphite", depth: "1", motion: "system" } })).toEqual([]);
  expect(settingsChangedKeys(saved, { ...saved, comfyUrl: "http://127.0.0.1:8189", proxyUrl: "http://127.0.0.1:7891" })).toEqual(["comfyUrl", "proxyUrl"]);
});
