import { describe, expect, it } from "vitest";
import {
  customNodeCatalog,
  customNodeDefinition,
  workflowDependencyCatalog,
  workflowDependencyDefinition
} from "../src/core/catalog";

describe("dependency catalog", () => {
  it("keeps node package identities and install targets unique", () => {
    expect(new Set(customNodeCatalog.map((item) => item.id)).size)
      .toBe(customNodeCatalog.length);
    expect(new Set(customNodeCatalog.map((item) => item.directoryName.toLowerCase())).size)
      .toBe(customNodeCatalog.length);
    for (const definition of customNodeCatalog) {
      expect(definition.repositoryUrl).toMatch(/^https:\/\/github\.com\//);
      expect(definition.aliases.length).toBeGreaterThan(0);
    }
  });

  it("retains runtime and compatibility metadata needed by scanners", () => {
    expect(customNodeDefinition("seedvr2")).toMatchObject({
      minimumVersion: "2.5.24",
      required: true
    });
    expect(customNodeDefinition("minimax-h3-prompt-writer")).toMatchObject({
      runtimeEndpoint: "/h3studio/status",
      required: false
    });
    expect(customNodeDefinition("h3-motion-context")?.nodeTypes).toContain(
      "MiniMaxH3MotionContextSaveLatent"
    );
  });

  it("defines portable workflow destinations without machine paths", () => {
    expect(workflowDependencyCatalog).toHaveLength(1);
    expect(workflowDependencyDefinition("minimax_h3_i2v")).toMatchObject({
      sourceUrl: expect.stringContaining("Comfy-Org/workflow_templates"),
      targetSegments: [
        "user",
        "default",
        "workflows",
        "video_minimax_h3_i2v.json"
      ]
    });
    for (const definition of workflowDependencyCatalog) {
      expect(definition.targetSegments.every((segment) =>
        segment !== ".." && !/[\\/]/.test(segment)
      )).toBe(true);
    }
  });
});
