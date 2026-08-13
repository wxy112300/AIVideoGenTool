export function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

export function compareReleaseVersions(left: string, right: string): number {
  const a = normalizeReleaseVersion(left).split(/[.-]/u).map((part) => Number(part) || 0);
  const b = normalizeReleaseVersion(right).split(/[.-]/u).map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export function releaseVersionAtLeast(version: string, minimum: string): boolean {
  return Boolean(version) && compareReleaseVersions(version, minimum) >= 0;
}
