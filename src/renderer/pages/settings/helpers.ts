export function directoryComparisonKey(value: string): string {
  return value.trim().replace(/[\\/]+$/u, "").toLowerCase();
}
