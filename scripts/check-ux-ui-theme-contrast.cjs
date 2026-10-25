const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const repository = resolve(__dirname, "..");
const directory = process.argv[2];
if (!directory) throw new Error("Missing isolated check directory");
app.setPath("userData", join(directory, "user-data"));
app.disableHardwareAcceleration();

// Runs in Chromium against the real stylesheet entry, including its imports.
function inspectTheme() {
  const root = document.documentElement;
  const probe = document.createElement("span");
  document.body.append(probe);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const color = (value) => {
    probe.style.color = "";
    probe.style.color = `var(${value})`;
    const computed = getComputedStyle(probe).color;
    const raw = getComputedStyle(root).getPropertyValue(value).trim();
    if (!raw) throw new Error(`Missing token ${value}`);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = computed;
    context.fillRect(0, 0, 1, 1);
    const channels = [...context.getImageData(0, 0, 1, 1).data];
    if (channels[3] !== 255) throw new Error(`Expected opaque ${value}: ${computed}`);
    return channels.slice(0, 3);
  };
  const luminance = (rgb) => rgb.map((c) => c / 255)
    .map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0);
  const failures = [];
  let pairs = 0;
  const contrast = (foreground, background, label) => {
    const a = luminance(color(foreground)), b = luminance(color(background));
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    pairs++;
    if (ratio < 4.5) failures.push(`${label}: ${foreground}/${background} ${ratio.toFixed(2)}:1`);
  };
  const legacyTexts = ["--ux-content-primary", "--ux-content-heading", "--ux-content-secondary", "--ux-content-tertiary", "--ux-content-technical"];
  const legacySurfaces = ["--ux-canvas", "--ux-surface-base", "--ux-surface-object", "--ux-surface-raised"];
  if (root.dataset.surface === "lan") {
    for (const text of legacyTexts) for (const surface of legacySurfaces) contrast(text, surface, "LAN");
    for (const [role, expected] of [["--bg", [18, 19, 21]], ["--panel", [28, 30, 34]], ["--primary", [124, 184, 255]]]) {
      if (String(color(role)) !== String(expected)) failures.push(`LAN palette changed: ${role}`);
    }
    return { pairs, failures };
  }
  const palettes = ["graphite", "sand", "slate", "mauve", "apple"];
  const accents = ["azure", "sky", "lagoon", "ocean", "mono", "orange", "green", "red"];
  for (const palette of palettes) for (const depth of ["0", "1", "2"]) {
    root.dataset.palette = palette;
    root.dataset.depth = depth;
    const label = `${palette}/${depth}`;
    for (const text of ["--text-1", "--text-2", "--text-3"]) {
      for (const surface of ["--canvas", "--surface-1", "--surface-2", "--surface-3"]) contrast(text, surface, label);
    }
    // Desktop theme roles have a single source; the LAN theme remains isolated.
    for (const obsolete of ["--bg", "--panel", "--ux-content-tertiary"]) {
      if (getComputedStyle(root).getPropertyValue(obsolete).trim()) failures.push(`${label}: obsolete desktop token ${obsolete}`);
    }
    for (const accent of accents) {
      root.dataset.accent = accent;
      for (const fill of ["--accent-fill", "--accent-fill-hover"]) contrast("--on-accent", fill, `${label}/${accent}`);
    }
  }
  if (getComputedStyle(document.body).backgroundImage !== "none") failures.push("Legacy body wash overrides desktop canvas");
  probe.style.transitionDuration = "var(--dur-4)";
  root.dataset.motion = "reduced";
  if (parseFloat(getComputedStyle(probe).transitionDuration) > .12) failures.push("Reduced motion did not reach legacy elements");
  root.dataset.motion = "standard";
  if (getComputedStyle(root).getPropertyValue("--dur-4").trim() !== "360ms") failures.push("Standard motion token was not restored");
  probe.remove();
  return { pairs, failures };
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    let pairs = 0;
    const failures = [];
    for (const surface of ["desktop", "lan"]) {
      const sheets = surface === "desktop" ? ["src/style.css"] : ["src/web/theme.css", "src/web/style.css"];
      const html = `<!doctype html><html data-surface="${surface}"><head>${sheets.map((sheet) => `<link rel="stylesheet" href="${pathToFileURL(resolve(repository, sheet)).href}">`).join("")}</head><body></body></html>`;
      const file = join(directory, `${surface}.html`);
      writeFileSync(file, html);
      await window.loadFile(file);
      const result = await window.webContents.executeJavaScript(`(${inspectTheme.toString()})()`);
      pairs += result.pairs;
      failures.push(...result.failures);
      console.log(`[contrast] ${surface}: ${result.pairs} text/surface checks, ${result.failures.length} failures`);
    }
    if (failures.length) throw new Error(`Text contrast failed:\n${failures.join("\n")}`);
    console.log(`[contrast] checked ${pairs} computed CSS pairs (minimum 4.50:1)`);
  } finally {
    window.destroy();
  }
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
