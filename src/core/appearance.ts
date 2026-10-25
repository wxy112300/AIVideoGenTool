export const appearanceAccents = ["azure", "sky", "lagoon", "ocean", "orange", "green", "red", "mono"] as const;
export const appearancePalettes = ["graphite", "sand", "slate", "mauve", "apple"] as const;
export interface UiAppearance {
  accent: typeof appearanceAccents[number];
  palette: typeof appearancePalettes[number];
  depth: "0" | "1" | "2";
  motion: "system" | "standard" | "reduced";
}

/** Old settings and individual invalid fields safely use the approved defaults. */
export function normalizeAppearance(value: unknown): UiAppearance {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    accent: appearanceAccents.includes(input.accent as UiAppearance["accent"]) ? input.accent as UiAppearance["accent"] : "azure",
    palette: appearancePalettes.includes(input.palette as UiAppearance["palette"]) ? input.palette as UiAppearance["palette"] : "graphite",
    depth: input.depth === "0" || input.depth === "2" ? input.depth : "1",
    motion: input.motion === "standard" || input.motion === "reduced" ? input.motion : "system"
  };
}
