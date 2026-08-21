import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(new URL("../src/styles/00-tokens.css", import.meta.url), "utf8");
const styleEntry = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const foundationSource = readFileSync(new URL("../src/styles/01-foundation.css", import.meta.url), "utf8");
const visualRefreshSource = readFileSync(new URL("../src/styles/02-visual-refresh.css", import.meta.url), "utf8");
const accelerationSource = readFileSync(new URL("../src/styles/03-acceleration.css", import.meta.url), "utf8");
const historyStageSource = readFileSync(new URL("../src/styles/04-history-stage.css", import.meta.url), "utf8");
const densitySource = readFileSync(new URL("../src/styles/05-density-refinement.css", import.meta.url), "utf8");
const settingsLayoutSource = readFileSync(new URL("../src/styles/06-settings-layout.css", import.meta.url), "utf8");
const createComposerSource = readFileSync(new URL("../src/styles/07-create-composer.css", import.meta.url), "utf8");
const createHeaderSource = readFileSync(new URL("../src/styles/09-create-header.css", import.meta.url), "utf8");
const historyCurationSource = readFileSync(new URL("../src/styles/11-history-curation.css", import.meta.url), "utf8");
const finalRefinementsSource = readFileSync(new URL("../src/styles/10-final-refinements.css", import.meta.url), "utf8");

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
    expect(settingsLayoutSource).toContain(".model-availability.available { color: var(--ux-status-success)");
    expect(settingsLayoutSource).toContain(".model-availability.missing { color: var(--ux-status-danger)");
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

  it("declares and routes the seven-level P04 heading scale", () => {
    const typeRoles = [
      "--ux-type-page",
      "--ux-type-section",
      "--ux-type-object",
      "--ux-type-body",
      "--ux-type-label",
      "--ux-type-meta",
      "--ux-type-technical",
    ];
    for (const role of typeRoles) {
      expect(tokenSource).toContain(`${role}:`);
    }
    expect(tokenSource).toContain("--ux-type-page: clamp(20px, 1.65vw, 23px);");
    expect(tokenSource).toContain("--ux-type-technical: .86em;");
    expect(foundationSource).toContain("h1 { margin-bottom: 6px; font-size: var(--ux-type-page); }");
    expect(foundationSource).toContain("h2 { margin-bottom: 4px; font-size: var(--ux-type-section); }");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-page);");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-section);");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-object);");
    expect(densitySource).toContain("font-size: var(--ux-type-page);");
    expect(visualRefreshSource).toContain(".task-main h3 { margin-top: 1px; font-size: 14px; }");
    expect(finalRefinementsSource).not.toContain("var(--ux-type-");
  });

  it("routes body, label, meta, and technical text roles through shared selectors", () => {
    expect(tokenSource).toContain("--ux-type-body: 14px;");
    expect(tokenSource).toContain("--ux-type-label: 12px;");
    expect(tokenSource).toContain("--ux-type-meta: 11px;");
    expect(tokenSource).toContain("--ux-type-technical: .86em;");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-body);");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-label);");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-meta);");
    expect(visualRefreshSource).toContain("font-size: var(--ux-type-technical);");
    expect(foundationSource).toContain("font-size: var(--ux-type-label);");
    expect(foundationSource).toContain("font-size: var(--ux-type-meta);");
    expect(densitySource).toContain("font-size: var(--ux-type-meta);");
  });

  it("keeps Queue, History, and runtime numbers tabular without changing their layout roles", () => {
    expect(finalRefinementsSource).toContain(".queue-rank strong { color: #b9c7d8; font: 700 19px/1 \"Cascadia Mono\", Consolas, monospace; letter-spacing: .02em; font-variant-numeric: tabular-nums; }");
    expect(foundationSource).toContain(".running-progress-value > strong { color: var(--primary); font-size: 20px; font-variant-numeric: tabular-nums; }");
    expect(foundationSource).toContain(".performance-card strong { display: block; margin-top: 4px; font-size: 20px; font-variant-numeric: tabular-nums; }");
    expect(foundationSource).toContain(".history-snapshot-index { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; color: #bcd5ff; background: rgba(88, 137, 218, .18); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }");
    expect(visualRefreshSource).toContain(".performance-card strong { margin-top: 5px; font-size: 23px; font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }");
    expect(visualRefreshSource).toContain(".running-progress-value > strong { font-size: 22px; font-weight: 640; font-variant-numeric: tabular-nums; }");
    expect(historyStageSource).toContain(".history-detail-position { padding: 5px 9px; border: 1px solid rgba(112,159,237,.25); border-radius: 8px; color: #a9c9ff; background: rgba(105,157,243,.08); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }");
    expect(finalRefinementsSource).toContain(".queue-overview-item strong {\n  font-size: 15px;\n  line-height: 1;\n  font-variant-numeric: tabular-nums;\n}");
    expect(finalRefinementsSource).toContain(".queue-run-metric strong,");
    expect(finalRefinementsSource).toContain("font-variant-numeric: tabular-nums;");
    expect(visualRefreshSource).toContain("font-variant-numeric: tabular-nums;");
  });

  it("routes the approved P04 radius families through semantic roles", () => {
    expect(tokenSource).toContain("--ux-radius-control: 10px;");
    expect(tokenSource).toContain("--ux-radius-object: 12px;");
    expect(tokenSource).toContain("--ux-radius-panel: 13px;");
    expect(tokenSource).toContain("--ux-radius-modal: 16px;");
    expect(foundationSource).toContain("border-radius: var(--ux-radius-control);");
    expect(foundationSource).toContain("border-radius: var(--ux-radius-object);");
    expect(foundationSource).toContain("border-radius: var(--ux-radius-panel);");
    expect(foundationSource).toContain("border-radius: var(--ux-radius-modal);");
    expect(visualRefreshSource).toContain("border-radius: var(--ux-radius-panel);");
    expect(visualRefreshSource).toContain("border-radius: var(--ux-radius-control);");
    expect(finalRefinementsSource).toContain("border-radius: var(--ux-radius-panel);");
    expect(finalRefinementsSource).toContain("border-radius: var(--ux-radius-object);");
  });

  it("routes the approved performance-grid spacing family through space roles", () => {
    expect(tokenSource).toContain("--ux-space-3: 12px;");
    expect(tokenSource).toContain("--ux-space-4: 16px;");
    expect(visualRefreshSource).toContain(".performance-grid { gap: var(--ux-space-3); margin-bottom: var(--ux-space-4); }");
  });

  it("routes shared shell height and responsive sticky offsets through geometry roles", () => {
    expect(tokenSource).toContain("--ux-topbar-height: 72px;");
    expect(tokenSource).toContain("--ux-page-sticky-offset: 72px;");
    expect(foundationSource).toContain(".topbar { position: sticky; top: 0; z-index: 10; min-height: var(--ux-topbar-height);");
    expect(visualRefreshSource).toContain("  min-height: var(--ux-topbar-height);");
    expect(historyStageSource).toContain(":root { --ux-page-sticky-offset: 0px; }");
  });

  it("routes Create and Queue headings through the shared sticky offset", () => {
    expect(createHeaderSource).toContain("  top: var(--ux-page-sticky-offset);");
    expect(createHeaderSource).toContain("  z-index: 9;");
    expect(finalRefinementsSource).toContain("  top: var(--ux-page-sticky-offset);");
    expect(finalRefinementsSource).toContain(".queue-page-heading { top: 0; }");
  });

  it("reserves a narrow Image Edit lane for the sticky submit rail", () => {
    expect(finalRefinementsSource).toContain("--image-edit-submit-safe-area: calc(2 * var(--ux-space-6) + var(--ux-space-5));");
    expect(finalRefinementsSource).toContain("margin-bottom: var(--image-edit-submit-safe-area);");
    expect(finalRefinementsSource).toContain("scroll-margin-block-end: var(--image-edit-submit-safe-area);");
    expect(finalRefinementsSource).toContain("--image-edit-submit-safe-area: calc(2 * var(--ux-space-6) + 2 * var(--ux-space-5) + var(--ux-space-2));");
  });

  it("keeps the Create summary single-column at narrow zoomed viewports", () => {
    expect(createComposerSource).toContain(".composer-settings .settings-summary {\n    grid-template-columns: minmax(0, 1fr);\n  }");
  });

  it("routes History and Settings headings through the shared sticky offset", () => {
    expect(historyCurationSource).toContain("  top: var(--ux-page-sticky-offset);");
    expect(historyStageSource).toContain("  top: var(--ux-page-sticky-offset);");
    expect(historyCurationSource).toMatch(/\.history-heading\s*\{\s*top: 0;/);
    expect(densitySource).toMatch(/\.settings-heading\s*\{\s*top: 0;/);
  });

  it("keeps the History album media override singular after L64 cleanup", () => {
    expect(historyCurationSource.match(/\.history-gallery\.album \.history-media \{ aspect-ratio: 1 \/ 1 !important;/g) ?? []).toHaveLength(1);
  });

  it("flattens ordinary panels while preserving overlay elevation", () => {
    expect(tokenSource).toContain("--ux-elevation-panel: none;");
    expect(foundationSource).toContain(".panel { min-width: 0; border: 1px solid var(--border); border-radius: var(--ux-radius-panel); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--ux-elevation-panel); }");
    expect(foundationSource).toContain("box-shadow: var(--ux-elevation-panel); }");
    expect(visualRefreshSource).toContain("box-shadow: var(--ux-elevation-panel);");
    expect(finalRefinementsSource).toContain(".settings-content .settings-section { padding: 18px; border-radius: var(--ux-radius-object); box-shadow: var(--ux-elevation-panel); }");
    expect(historyCurationSource).toContain("box-shadow: 0 14px 34px rgba(0, 0, 0, .34);");
    expect(foundationSource).toContain("box-shadow: 0 24px 80px rgba(0, 0, 0, .5);");
    expect(foundationSource).toContain("box-shadow: 0 28px 100px rgba(0, 0, 0, .7);");
    expect(densitySource).toContain("box-shadow: 0 28px 90px rgba(0, 0, 0, .58);");
  });
});
