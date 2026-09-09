/** One node-schema request per candidate; the snapshot is shared by scan consumers. */
export async function collectEnvironmentRuntimeEvidence(
  baseUrls: string[],
  request: typeof fetch = fetch
): Promise<{ baseUrl: string; objectInfo: Record<string, unknown> | null }> {
  const bases = [...new Set(baseUrls.map((url) => url.replace(/\/+$/, "")).filter(Boolean))];
  const results = await Promise.all(bases.map(async (baseUrl) => {
    try {
      const response = await request(`${baseUrl}/object_info`, {
        signal: AbortSignal.timeout(3500)
      });
      if (!response.ok) return null;
      const objectInfo: unknown = await response.json();
      if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) return null;
      return { baseUrl, objectInfo: objectInfo as Record<string, unknown> };
    } catch {
      return null;
    }
  }));
  // Configuration order, not response speed, selects the instance.
  return results.find((result) => result !== null) ?? { baseUrl: "", objectInfo: null };
}
