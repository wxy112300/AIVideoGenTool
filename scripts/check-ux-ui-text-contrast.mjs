import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokenSource = readFileSync(resolve(repositoryRoot, "src/styles/00-tokens.css"), "utf8");
const visualSource = readFileSync(resolve(repositoryRoot, "src/styles/02-visual-refresh.css"), "utf8");

const variables = new Map();
for (const source of [tokenSource, visualSource]) {
  for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    variables.set(match[1], match[2].trim());
  }
}

function resolveVariable(name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`Cyclic CSS variable reference: ${name}`);
  }
  const value = variables.get(name);
  if (!value) {
    throw new Error(`Missing CSS variable: ${name}`);
  }

  const reference = value.match(/^var\((--[\w-]+)/);
  if (!reference) {
    return value;
  }

  const [, referencedName] = reference;
  if (!variables.has(referencedName)) {
    const fallback = value.match(/,\s*(#[\da-fA-F]{6})\s*\)$/)?.[1];
    if (fallback) return fallback;
    throw new Error(`Missing referenced CSS variable: ${referencedName}`);
  }
  return resolveVariable(referencedName, new Set([...seen, name]));
}

function hexToRgb(value) {
  const match = value.match(/^#([\da-fA-F]{6})$/);
  if (!match) {
    throw new Error(`Expected a six-digit hex color, received: ${value}`);
  }
  return match[1].match(/../g).map((channel) => parseInt(channel, 16) / 255);
}

function luminance(value) {
  return hexToRgb(value)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const textRoles = {
  primary: "--ux-content-primary",
  heading: "--ux-content-heading",
  secondary: "--ux-content-secondary",
  tertiary: "--ux-content-tertiary",
  technical: "--ux-content-technical",
};
const surfaceRoles = {
  canvas: "--ux-canvas",
  base: "--ux-surface-base",
  object: "--ux-surface-object",
  raised: "--ux-surface-raised",
};

const failures = [];
for (const [textName, textRole] of Object.entries(textRoles)) {
  const foreground = resolveVariable(textRole);
  for (const [surfaceName, surfaceRole] of Object.entries(surfaceRoles)) {
    const background = resolveVariable(surfaceRole);
    const ratio = contrastRatio(foreground, background);
    const result = ratio >= 4.5 ? "pass" : "FAIL";
    console.log(`[contrast] ${result} ${textName}/${surfaceName}: ${ratio.toFixed(2)}:1`);
    if (ratio < 4.5) {
      failures.push(`${textRole} on ${surfaceRole} is ${ratio.toFixed(2)}:1`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Text contrast check failed:\n${failures.join("\n")}`);
}

console.log(`[contrast] checked ${Object.keys(textRoles).length * Object.keys(surfaceRoles).length} text/surface pairs (minimum 4.50:1)`);
