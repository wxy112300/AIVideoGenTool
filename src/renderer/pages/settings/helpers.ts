export function directoryComparisonKey(value: string): string {
  return value.trim().replace(/[\\/]+$/u, "").toLowerCase();
}

export function outputDirectoryWithinRoot(directory: string, root: string): boolean {
  const normalize = (value: string) => {
    const parts: string[] = [];
    for (const part of value.trim().replaceAll("\\", "/").split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part.toLowerCase());
    }
    return parts.join("/");
  };
  if (!directory.trim() || !root.trim()) return false;
  const target = normalize(directory), base = normalize(root);
  return target === base || target.startsWith(`${base}/`);
}
