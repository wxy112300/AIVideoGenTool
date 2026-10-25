import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
function source(path: string): string { return readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n?/gu, "\n"); }
const styleEntry=source("../src/style.css"), controlsSource=source("../src/styles/components/controls.css"), queueSource=source("../src/styles/pages/queue.css"), shellSource=source("../src/styles/components/shell.css");
const createPageSource=source("../src/renderer/pages/create/page.ts"), createPromptControllerSource=source("../src/renderer/pages/create/prompt-controller.ts"), createControlsSource=source("../src/styles/patterns/create-controls.css"), imageToVideoControllerSource=source("../src/renderer/pages/create/image-to-video-controller.ts"), createHeaderSource=source("../src/styles/pages/create.css"), createMediaSource=source("../src/styles/patterns/create-media.css"), createFramesSource=source("../src/renderer/pages/create/media-frames.ts");
describe("current desktop style boundaries",()=>{
  it("loads only maintained layers and resolves every stylesheet import",()=>{
    expect(styleEntry).toMatch(/^@layer reset, tokens, base, components, patterns, pages;/);
    expect(styleEntry).not.toMatch(/legacy|styles\/\d{2}-/);
    for(const match of styleEntry.matchAll(/@import "([^"]+)"/g)) expect(existsSync(new URL("../src/"+match[1],import.meta.url))).toBe(true);
  });
  it("uses the approved theme directly without desktop compatibility aliases",()=>{
    for(const match of styleEntry.matchAll(/@import "([^"]+)"/g)) expect(source("../src/"+match[1])).not.toMatch(/--ux-|var\(--(?:bg|panel|primary|border|muted)(?:[,)]|-)/);
    const tokens=source("../src/styles/tokens.css");for(const name of ["--canvas","--surface-1","--text-1","--accent","--focus-ring"])expect(tokens).toContain(name+":");
  });
  it("isolates standalone LAN appearance from the desktop theme",()=>{
    const web=source("../src/web/main.ts");expect(web).toContain('import "./theme.css"');expect(web).not.toContain("../styles/");
    expect(styleEntry).not.toContain("web/theme.css");expect(source("../src/web/theme.css")).toContain("--bg: #121315;");
  });
  it("keeps native SeedVR2 segment progress subordinate to the task total", () => {
    expect(queueSource).toContain(".seedvr2-segment-progress {");
    expect(queueSource).toContain(".seedvr2-local-progress");
    expect(queueSource).toContain("height: 4px;");
  });

  it("routes Create and Queue headings through the shared sticky offset", () => {
    expect(createHeaderSource).toContain("top: var(--topbar-h, 64px)");
    expect(createHeaderSource).toContain("z-index: 30;");
    expect(queueSource).toContain("top: var(--topbar-h, 64px)");
    expect(queueSource).toContain("z-index: 30;");
  });

  it("keeps narrow Create feedback on its own row without squeezing primary actions", () => {
    expect(createControlsSource).toContain(".create-submit-copy { flex-basis: 100%; }");
    expect(createControlsSource).toContain(".create-submit-bar { flex-wrap: wrap; }");
  });

  it("keeps standard Create image previews aligned to the source ratio", () => {
    expect(createMediaSource).toContain("width: min(100%, calc(640px * var(--media-r, 1.7778)))");
    expect(createMediaSource).toContain("aspect-ratio: var(--media-ratio, 16 / 9)");
    expect(createMediaSource).toContain("object-fit: contain");
  });

  it("makes filled Create frame slots drop-only while empty slots remain pickers", () => {
    expect(createFramesSource).toContain('<div class="drop-zone has-image create-frame-surface"');
    expect(createFramesSource).toContain('<button type="button" class="create-media-drop" id="pick-start"');
    expect(imageToVideoControllerSource).toContain("if (!zone || zone.classList.contains(\"has-image\")) return;");
  });

  it("keeps the legacy H3 assistant removed while retaining prompt enhancement", () => {
    expect(createPageSource).not.toContain("h3-prompt-helper");
    expect(createPageSource).not.toContain("h3-prompt-template");
    expect(createPageSource).not.toContain("h3-builder-generate");
    expect(createPromptControllerSource).toContain("#enhance-prompt");
  });

  it("keeps Create continuation artifacts compact with hover-only explanations", () => {
    expect(createPageSource).not.toContain('class="h3-prompt-check');
    expect(createPageSource).not.toContain('class="h3-extension-note"');
    expect(createPageSource).not.toContain("class=\"trim-help\"");
    expect(createPageSource).not.toContain("class=\"continuum-boundary-note\"");
    expect(createPageSource).toContain('title="${escapeHtml(t(uiKeys.create.continuumArtifact.choose))}"');
    expect(createPageSource).toContain('class="continuum-source-row continuum-');
    expect(createPageSource).toContain("continuum-dependency-actions");
    expect(createPageSource).toContain("data-drop-h3-continuum-av");
    expect(createPageSource).toContain("data-clear-h3-continuum-av");
    expect(createPageSource).toContain('data-continuum-source-status');
    expect(createPageSource).toContain('class="continuum-dependency-files"');
    expect(createPageSource).toContain("continuumDependencyProgress");
    expect(createPageSource).not.toContain("viewModel.continuumStatusLabel");
    expect(createPageSource).toContain("viewModel.continuumFileStatus.label");
    expect(createPageSource).not.toContain("viewModel.continuumStatusDetail");
    expect(createPageSource).toContain('title="${escapeHtml(t(uiKeys.create.motionContextLatent.description))}"');
    expect(createPageSource).toContain("id=\"clear-h3-continuum-av\"");
    expect(createPageSource).toContain("id=\"clear-h3-motion-context-latent\"");
  });
});
