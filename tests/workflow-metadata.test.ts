import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bundledWorkflowMetadata,
  workflowMetadataForFilename
} from "../src/core/workflow-metadata";
import { customNodeCatalog } from "../src/core/catalog";

describe("bundled workflow provenance", () => {
  it("has metadata for every bundled API workflow", () => {
    const workflowDirectory = path.resolve(process.cwd(), "workflows");
    const filenames = readdirSync(workflowDirectory)
      .filter((filename) => filename.endsWith(".json"))
      .sort();
    expect(Object.keys(bundledWorkflowMetadata).sort()).toEqual(
      filenames.map((filename) => filename.replace(/\.json$/i, "")).sort()
    );
    for (const filename of filenames) {
      const metadata = workflowMetadataForFilename(filename);
      expect(metadata).toBeDefined();
      expect(metadata?.schema).toMatchObject({
        id: "comfyui-api",
        version: 1,
        endpoint: "/prompt"
      });
      expect(metadata?.source.relativePath).toBe(`workflows/${filename}`);
      expect(metadata?.comfyUi.recommendedVersion).toBe(
        filename === "minimax_h3_r2v_extend_api.json" ? "0.34.0" : "0.33.1"
      );
    }
  });

  it("references only registered custom-node package ids", () => {
    const knownNodeIds = new Set(customNodeCatalog.map((definition) => definition.id));
    for (const metadata of Object.values(bundledWorkflowMetadata)) {
      for (const nodePackage of metadata.nodePackages) {
        expect(knownNodeIds.has(nodePackage)).toBe(true);
      }
    }
  });

  it("records the higher-risk H3 and LTX provenance separately", () => {
    expect(workflowMetadataForFilename("minimax_h3_r2v_extend_api.json")).toMatchObject({
      comfyUi: { minimumVersion: "0.32.0", recommendedVersion: "0.34.0" },
      verifiedAt: "2026-09-03",
      nodePackages: ["video-helper-suite", "h3-motion-context", "kjnodes"]
    });
    expect(workflowMetadataForFilename("sulphur2_ltx23_extend_gguf_q2_api.json")).toMatchObject({
      nodePackages: ["ltx-video", "comfyui-gguf", "video-helper-suite"]
    });
  });
});
