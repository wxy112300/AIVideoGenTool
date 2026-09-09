import { afterEach, describe, expect, it, vi } from "vitest";
import { collectEnvironmentRuntimeEvidence } from "../electron/services/environment-runtime-evidence.js";
import { scanCustomNodes } from "../electron/services/dependency-scanner.js";
import { createDefaultSettings } from "../src/core/defaults.js";

afterEach(() => vi.restoreAllMocks());

describe("shared environment runtime evidence", () => {
  it("fetches each distinct candidate once and retains configured instance priority", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      Response.json({ [String(input).includes("8188") ? "SelectedNode" : "DesktopNode"]: {} }));
    const result = await collectEnvironmentRuntimeEvidence([
      "http://localhost:8188/", "http://localhost:8188", "http://localhost:8000"
    ], request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ baseUrl: "http://localhost:8188", objectInfo: { SelectedNode: {} } });
  });

  it("falls back from invalid schema JSON without treating it as an empty online schema", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("startup"))
      .mockResolvedValueOnce(Response.json({ DesktopNode: {} }));
    expect(await collectEnvironmentRuntimeEvidence(["http://selected", "http://desktop"], request))
      .toEqual({ baseUrl: "http://desktop", objectInfo: { DesktopNode: {} } });
    request.mockRejectedValue(new Error("offline"));
    expect(await collectEnvironmentRuntimeEvidence(["http://selected"], request))
      .toEqual({ baseUrl: "", objectInfo: null });
  });

  it.each([null, new Set<string>()])("does not fetch schema again when supplied evidence is %s", async (nodeIds) => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("offline", { status: 503 }));
    await scanCustomNodes("", createDefaultSettings(), "", "", "", {}, { nodeIds });
    expect(request.mock.calls.filter(([input]) => String(input).endsWith("/object_info"))).toHaveLength(0);
  });
});
