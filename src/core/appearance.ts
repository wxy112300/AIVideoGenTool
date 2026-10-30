export const appearanceAccents = ["azure", "sky", "lagoon", "ocean", "orange", "green", "red", "mono"] as const;
export const appearancePalettes = ["graphite", "sand", "slate", "mauve", "apple"] as const;
export const historyMasonryColumnChoices = [3, 4, 5, 6] as const;
export const historyAlbumColumnChoices = [4, 5, 6, 7, 8, 9, 10] as const;
export interface UiAppearance {
  accent: typeof appearanceAccents[number];
  palette: typeof appearancePalettes[number];
  depth: "0" | "1" | "2";
  motion: "system" | "standard" | "reduced";
  historyMasonryColumns?: number;
  historyAlbumColumns?: number;
}

/** Old settings and individual invalid fields safely use the approved defaults. */
export function normalizeAppearance(value: unknown): Required<UiAppearance> {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const columns = (value: unknown, choices: readonly number[], fallback: number) => {
    const number = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
    return typeof number === "number" && choices.includes(number) ? number : fallback;
  };
  return {
    accent: appearanceAccents.includes(input.accent as UiAppearance["accent"]) ? input.accent as UiAppearance["accent"] : "azure",
    palette: appearancePalettes.includes(input.palette as UiAppearance["palette"]) ? input.palette as UiAppearance["palette"] : "graphite",
    depth: input.depth === "0" || input.depth === "2" ? input.depth : "1",
    motion: input.motion === "standard" || input.motion === "reduced" ? input.motion : "system",
    historyMasonryColumns: columns(input.historyMasonryColumns, historyMasonryColumnChoices, 3),
    historyAlbumColumns: columns(input.historyAlbumColumns, historyAlbumColumnChoices, 5)
  };
}
