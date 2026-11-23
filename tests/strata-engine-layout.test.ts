import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRATA_ENGINE_FILES, STRATA_ENGINE_MANIFEST_SHA256, STRATA_ENGINE_VERSION, STRATA_RELEASES, strataBundledLibrariesForRevision, strataEngineFilesForRevision, strataCompatibilityEnvironment } from "../src/core/catalog/dependencies/strata.js";
import { createDefaultSettings } from "../src/core/defaults.js";
import * as installation from "../electron/services/strata-installation.js";
import { scanStrataPreparation } from "../electron/services/strata-preparation.js";

afterEach(() => vi.restoreAllMocks());
describe("published Strata engine layouts", () => {
  it("disables both broken HC Tensor Core paths only for the audited affected engine", () => {
    expect(strataCompatibilityEnvironment()).toEqual({ STRATA_HC_Q8_TC: "0", STRATA_HC_Q8_BF16TC: "0" });
    expect(strataCompatibilityEnvironment(STRATA_RELEASES.find(item => item.version === "0.2.17")!.revision)).toEqual({});
    expect(strataCompatibilityEnvironment("unknown")).toEqual({});
  });
  it.each([["0.1.60", "0.2.15", "3c6cf75bd471e0b6251f8db0080cb6c4dd1afb2cbd86e41a214bc4c4662f169c"],
    ["0.1.63", "0.2.17", "76ecfdaceeee1a7ce9d4d961f87f17da9c512107483e671fe987b39261a7cb61"],
    [STRATA_ENGINE_VERSION, "0.2.20", STRATA_ENGINE_MANIFEST_SHA256]])("matches the independently captured official %s manifest without requiring the retired quant DLL", async (version, sourceVersion, sha256) => {
    // Extracted from the official archive whose SHA-256 is pinned in the catalog.
    // Git may normalize text line endings; the publisher hashed Windows CRLF bytes.
    const text = await readFile(new URL(`./fixtures/strata-engine-${version}-windows-cuda13.json`, import.meta.url), "utf8");
    expect(createHash("sha256").update(text.replace(/\r?\n/gu, "\r\n")).digest("hex")).toBe(sha256);
    const manifest = JSON.parse(text);
    expect(manifest.version).toBe(version);
    const published = ["engine/engine-component.json", ...manifest.files.map((file: { path: string }) => `engine/${file.path}`)];
    expect([...STRATA_ENGINE_FILES].sort()).toEqual(published.sort());
    expect([...strataEngineFilesForRevision(STRATA_RELEASES.find(item => item.version === sourceVersion)!.revision)].sort()).toEqual(published.sort());
    expect(strataEngineFilesForRevision()).toEqual(STRATA_ENGINE_FILES);
    expect(strataBundledLibrariesForRevision()).not.toContain("strata_kq.dll");
    const old = STRATA_RELEASES.find(item => item.version === "0.2.13")!;
    expect(strataEngineFilesForRevision(old.revision)).toContain("engine/strata_kq.dll");
    expect(strataBundledLibrariesForRevision(old.revision)).toContain("strata_kq.dll");
  });
  it.each(["0.2.20", "0.2.17", "0.2.15", "0.2.13"])("scans the actual %s layout rather than applying the newest file list to every release", async version => {
    vi.spyOn(installation, "strataInstalledRelease").mockReturnValue(STRATA_RELEASES.find(item => item.version === version));
    const inspect = vi.fn(async (filename: string) => filename.endsWith("strata_kq.dll") ? null : { size: 7, header: "" });
    const result = await scanStrataPreparation({ ...createDefaultSettings(), strataInstallDirectory: path.resolve("fixture-strata-layout") }, inspect);
    expect(result.status.enginePresent).toBe(version !== "0.2.13");
    expect(result.status.files.some(file => file.relativePath.startsWith("terminal/"))).toBe(["0.2.17", "0.2.20"].includes(version));
    expect(result.status.files.some(file => file.relativePath.endsWith("strata_kq.dll"))).toBe(version === "0.2.13");
  });
});
