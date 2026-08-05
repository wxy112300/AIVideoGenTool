const modelCodes: Record<string, string> = {
  minimax_h3_fl2va: "H3",
  minimax_h3_fl2va_int4: "H3-INT4",
  minimax_h3_ref2va: "H3-R2V",
  minimax_h3_ref2va_int4: "H3-R2V-INT4",
  sulphur2: "SUL2",
  wan22_5b: "WAN22-5B",
  hunyuan15: "HUN15",
  wan22_14b: "WAN22-14B",
  wan22_14b_nsfw: "WAN22-14B-NSFW",
  remix3: "REMIX3",
  wan22_remix: "REMIX3",
  wan22_smoothmix: "SMOOTHMIX",
  wan22_dasiwa: "DASIWA9"
};

export function compactPrompt(text: string): string {
  const cleaned = text
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/[，。！？、；：,.!?;()[\]{}"'“”‘’]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  return Array.from(cleaned || "video").slice(0, 16).join("");
}

export function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
    "-" +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("")
  );
}

function modelCode(modelId: string): string {
  return (
    modelCodes[modelId] ??
    (modelId.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      "VIDEO")
  );
}

function resolutionTag(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)}p` : "AUTO";
}

function durationTag(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0s";
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace(/\.0$/, "")}s`;
}

function versionTag(version: number): string {
  return `v${String(version).padStart(2, "0")}`;
}

export function createOutputFilename(
  modelId: string,
  resolution: number,
  duration: number,
  existingNames: Iterable<string>,
  date = new Date()
): string {
  const base = `${modelCode(modelId)}-${resolutionTag(resolution)}-${durationTag(duration)}-${timestamp(date)}`;
  const names = new Set([...existingNames].map((name) => name.toLowerCase()));
  let version = 1;
  while (names.has(`${base}-${versionTag(version)}.mp4`.toLowerCase())) {
    version += 1;
  }
  return `${base}-${versionTag(version)}.mp4`;
}
