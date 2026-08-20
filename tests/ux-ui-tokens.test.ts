import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(new URL("../src/styles/00-tokens.css", import.meta.url), "utf8");
const styleEntry = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const foundationSource = readFileSync(new URL("../src/styles/01-foundation.css", import.meta.url), "utf8");
const visualRefreshSource = readFileSync(new URL("../src/styles/02-visual-refresh.css", import.meta.url), "utf8");
const accelerationSource = readFileSync(new URL("../src/styles/03-acceleration.css", import.meta.url), "utf8");

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
  "--ux-action-primary-fill",
  "--ux-action-primary-hover-fill",
  "--ux-action-secondary-hover-surface",
  "--ux-action-pressed-transform",
  "--ux-action-primary",
  "--ux-action-primary-strong",
  "--ux-brand-mark-text",
  "--ux-brand-mark-surface",
  "--ux-brand-hover-surface",
  "--ux-nav-shell-border",
  "--ux-nav-shell-surface",
  "--ux-nav-text",
  "--ux-nav-hover-text",
  "--ux-nav-hover-surface",
  "--ux-nav-active-text",
  "--ux-nav-active-surface",
  "--ux-nav-active-border",
  "--ux-nav-active-indicator",
  "--ux-status-info",
  "--ux-status-danger",
  "--ux-status-success",
  "--ux-status-warning",
  "--ux-status-badge-text",
  "--ux-status-info-text",
  "--ux-status-info-surface",
  "--ux-status-info-border",
  "--ux-status-danger-text",
  "--ux-status-danger-surface",
  "--ux-status-warning-text",
  "--ux-status-warning-surface",
  "--ux-status-success-ring",
  "--ux-status-info-notice-border",
  "--ux-status-warning-notice-border",
  "--ux-status-danger-notice-border",
  "--ux-status-success-notice-border",
  "--ux-focus-ring",
  "--ux-focus-ring-width",
  "--ux-focus-control-border",
  "--ux-focus-control-glow",
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

  it("declares every semantic role without replacing current legacy values", () => {
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

  it("routes shared action and focus selectors through semantic roles", () => {
    expect(visualRefreshSource).toContain("transform: var(--ux-action-pressed-transform)");
    expect(visualRefreshSource).toContain("outline: var(--ux-focus-ring-width) solid var(--ux-focus-ring)");
    expect(visualRefreshSource).toContain("background: var(--ux-action-primary-fill)");
    expect(visualRefreshSource).toContain("background: var(--ux-action-primary-hover-fill)");
    expect(visualRefreshSource).toContain("border-color: var(--ux-focus-control-border)");
    expect(visualRefreshSource).toContain("var(--ux-focus-control-glow)");
  });

  it("routes the four-state status and badge matrix through semantic roles", () => {
    expect(visualRefreshSource).toContain("color: var(--ux-status-badge-text)");
    expect(visualRefreshSource).toContain("background: var(--ux-status-info)");
    expect(visualRefreshSource).toContain("background: var(--ux-status-danger-surface)");
    expect(visualRefreshSource).toContain("background: var(--ux-status-info-surface-soft)");
    expect(foundationSource).toContain(".warning-badge { color: var(--ux-status-warning)");
    expect(foundationSource).toContain(".model-availability.available { color: var(--ux-status-success)");
    expect(foundationSource).toContain(".model-availability.missing { color: var(--ux-status-danger)");
    expect(accelerationSource).toContain(".flash-info { border-color: var(--ux-status-info-notice-border)");
    expect(accelerationSource).toContain(".flash-warning { border-color: var(--ux-status-warning-notice-border)");
    expect(accelerationSource).toContain(".flash-error { border-color: var(--ux-status-danger-notice-border)");
    expect(accelerationSource).toContain(".flash-task-complete { border-color: var(--ux-status-success-notice-border)");
  });

  it("routes brand and navigation decoration through shell roles without glow", () => {
    const topbar = visualRefreshSource.match(/\.topbar \{[\s\S]*?\n\}/)?.[0] ?? "";
    const brandMark = visualRefreshSource.match(/\.brand-mark \{[\s\S]*?\n\}/)?.[0] ?? "";
    const activeNav = visualRefreshSource.match(/\.nav-button\.active \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(visualRefreshSource).toContain("background: var(--ux-brand-hover-surface)");
    expect(brandMark).toContain("background: var(--ux-brand-mark-surface)");
    expect(brandMark).toContain("box-shadow: none");
    expect(topbar).toContain("box-shadow: none");
    expect(visualRefreshSource).toContain("border: 1px solid var(--ux-nav-shell-border)");
    expect(visualRefreshSource).toContain("background: var(--ux-nav-shell-surface)");
    expect(visualRefreshSource).toContain("background: var(--ux-nav-hover-surface)");
    expect(activeNav).toContain("border-color: var(--ux-nav-active-border)");
    expect(activeNav).toContain("box-shadow: none");
    expect(visualRefreshSource).toContain("background: var(--ux-nav-active-indicator)");
  });
});
