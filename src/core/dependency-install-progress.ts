/** Git reports per-stage progress, never overall installation completion. */
export function gitInstallProgress(log: string): { stage: string; percent: number } | null {
  const line = log.replace(/\u001b\[[0-9;]*m/g, "").split(/[\r\n]+/).filter(line => line.trim()).at(-1)?.trim() ?? "";
  const match = /^(?:remote:\s*)?(Counting objects|Compressing objects|Receiving objects|Resolving deltas|Updating files|Checking out files):\s*(\d{1,3})%(?=\s|$)/i.exec(line);
  if (!match || Number(match[2]) > 100) return null;
  return { stage: match[1]!, percent: Number(match[2]) };
}
