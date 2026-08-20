import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(new URL("../src/styles/00-tokens.css", import.meta.url), "utf8");
const styleEntry = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const visualRefreshSource = readFileSync(new URL("../src/styles/02-visual-refresh.css", import.meta.url), "utf8");

const semanticRoles = [
  "--ux-canvas",
  "--ux-surface-base",
  "--ux-surface-object",
  "--ux-surface-raised",
  "--ux-separator-subtle",
  "--ux-separator-strong",
  "--ux-content-primary",
  "--ux-content-heading",
  "--ux-content-secondary",
  "--ux-content-tertiary",
  "--ux-content-technical",
  "--ux-action-primary",
  "--ux-action-primary-strong",
  "--ux-status-danger",
  "--ux-status-success",
  "--ux-status-warning",
  "--ux-focus-ring",
  "--ux-elevation-panel",
  "--ux-type-page",
  "--ux-space-4",
  "--ux-radius-control",
  "--ux-topbar-height",
];

describe("UX/UI semantic token foundation", () => {
  it("loads the semantic token layer before legacy foundation rules", () => {
    expect(styleEntry.indexOf('@import "./styles/00-tokens.css";')).toBe(0);
    expect(styleEntry.indexOf('@import "./styles/01-foundation.css";')).toBeGreaterThan(0);
  });

  it("declares every P02 role without replacing current legacy values", () => {
    for (const role of semanticRoles) {
      expect(tokenSource).toContain(`${role}:`);
    }
    expect(tokenSource).not.toMatch(/--(?:bg|panel|primary|danger|success|warning)\s*:/);
  });

  it("keeps semantic roles mapped to current renderer variables", () => {
    expect(tokenSource).toContain("--ux-canvas: var(--bg)");
    expect(tokenSource).toContain("--ux-surface-base: var(--panel)");
    expect(tokenSource).toContain("--ux-action-primary: var(--primary)");
    expect(tokenSource).toContain("--ux-status-danger: var(--danger)");
  });

  it("routes shared text and separator selectors through semantic roles", () => {
    expect(visualRefreshSource).toContain("color: var(--ux-content-primary)");
    expect(visualRefreshSource).toContain("color: var(--ux-content-secondary)");
    expect(visualRefreshSource).toContain("color: var(--ux-content-tertiary)");
    expect(visualRefreshSource).toContain("color: var(--ux-content-technical)");
    expect(visualRefreshSource).toContain("var(--ux-separator-subtle)");
    expect(visualRefreshSource).toContain("var(--ux-separator-strong)");
  });
});
