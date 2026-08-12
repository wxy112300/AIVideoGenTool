import { escapeHtml } from "./dom";

export function appLogTerminalHtml(text: string): string {
  if (!text) return "暂无运行日志";
  return text.split("\n").map((line) => {
    const level = line.match(/\]\[(DEBUG|INFO|WARN|ERROR|FATAL)\s*\]/u)?.[1]?.toLowerCase() ?? "info";
    return `<span class="app-log-line ${level}">${escapeHtml(line)}</span>`;
  }).join("\n");
}

export function appLogTimestampMs(value: string): number {
  const isoTime = Date.parse(value);
  if (Number.isFinite(isoTime)) return isoTime;
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})$/u);
  if (!match) return Number.NaN;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number(match[7])
  ).getTime();
}

export function visibleAppLogText(text: string, clearedAt: number | null | undefined): string {
  if (clearedAt == null) return text;
  return text.split("\n").filter((line) => {
    const timestamp = line.match(/^\[([^\]]+)\]/u)?.[1];
    return timestamp ? appLogTimestampMs(timestamp) >= clearedAt : false;
  }).join("\n");
}
