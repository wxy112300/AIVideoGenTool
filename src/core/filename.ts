const modelCodes: Record<string, string> = {
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

export function createOutputFilename(
  modelId: string,
  prompt: string,
  existingNames: Iterable<string>,
  date = new Date()
): string {
  const base = `${modelCodes[modelId] ?? modelId.toUpperCase()}-${compactPrompt(prompt)}-${timestamp(date)}`;
  const names = new Set(existingNames);
  if (!names.has(`${base}.mp4`)) return `${base}.mp4`;
  let suffix = 2;
  while (names.has(`${base}-${String(suffix).padStart(2, "0")}.mp4`)) suffix += 1;
  return `${base}-${String(suffix).padStart(2, "0")}.mp4`;
}
