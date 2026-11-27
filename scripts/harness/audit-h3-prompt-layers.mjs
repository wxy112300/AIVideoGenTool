// Static + optional output audit enforcing the Two-Layer H3 Prompt Architecture:
//   Layer 1: Compiler rules, presets & craft skills consumed by Strata (Qwen3.8-Flash-Next)
//   Layer 2: Final positive-only audiovisual prose consumed by MiniMax H3
import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultState } from "../../dist/electron/src/core/defaults.js";
import {
  auditH3Layer1Instructions,
  auditH3Layer2Output
} from "../../dist/electron/src/core/prompts/h3/layer-audit.js";

if (process.argv.includes("--help")) {
  console.log([
    "Usage: node scripts/harness/audit-h3-prompt-layers.mjs [--eval-json <path>] [--output-file <path> [--source-prompt <text>] [--mode I2VA|T2VA|FL2VA|R2V]]",
    "",
    "Audits BOTH layers of the Local Video Studio H3 prompt pipeline:",
    "  Layer 1 (Strata / Qwen3.8-Flash-Next): presets, all Craft Skills, fallback rules, placeholder traps, TitleCase camera-verb traps, token budget, and private thinking worksheet.",
    "  Layer 2 (MiniMax H3 output): optional audit of generated prompt file or eval JSON for Layer-1 leakage, literal placeholder copies, negative/toy leaks, section boundaries, and cross-character age bleed."
  ].join("\n"));
  process.exit(0);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

const settings = createDefaultState().settings;
const layer1 = auditH3Layer1Instructions(settings);

console.log(`[h3-layers] Layer 1 (Qwen teacher / compiler): ${layer1.passed ? "PASS" : "FAIL"} (${layer1.stats.corePresetCount} core / ${layer1.stats.presetCount} total presets, ${layer1.stats.snippetCount} snippets, ${layer1.stats.skillCount} skills, base I2VA=${layer1.stats.maxBaseI2vaChars} chars, complex I2VA=${layer1.stats.maxComplexI2vaChars} chars)`);
for (const issue of layer1.issues) {
  console.error(`  [FAIL] [${issue.layer}] ${issue.code} (${issue.scope}): ${issue.message}`);
}

let allPassed = layer1.passed;

const evalJsonPath = argValue("--eval-json");
if (evalJsonPath) {
  const raw = JSON.parse(await fs.readFile(path.resolve(evalJsonPath), "utf8"));
  const entries = Array.isArray(raw?.results) ? raw.results : [];
  for (const entry of entries) {
    const id = String(entry.id ?? "unnamed");
    const mode = id.toLowerCase().startsWith("i2va") ? "I2VA"
      : id.toLowerCase().startsWith("fl2va") ? "FL2VA"
      : id.toLowerCase().startsWith("r2v") ? "R2V"
      : "T2VA";
    const report = auditH3Layer2Output(String(entry.output ?? ""), {
      sourcePrompt: typeof entry.sourcePrompt === "string" ? entry.sourcePrompt : undefined,
      mode
    });
    console.log(`[h3-layers] Layer 2 (MiniMax H3 output) [${id}]: ${report.passed ? "PASS" : "FAIL"}`);
    for (const issue of report.issues) {
      console.error(`  [FAIL] [${issue.layer}] ${issue.code} (${issue.scope}): ${issue.message}`);
    }
    if (!report.passed) allPassed = false;
  }
}

const outputFilePath = argValue("--output-file");
if (outputFilePath) {
  const text = await fs.readFile(path.resolve(outputFilePath), "utf8");
  const mode = argValue("--mode") ?? "T2VA";
  const sourcePrompt = argValue("--source-prompt") ?? undefined;
  const report = auditH3Layer2Output(text, { mode, sourcePrompt });
  console.log(`[h3-layers] Layer 2 (MiniMax H3 output) [${path.basename(outputFilePath)}]: ${report.passed ? "PASS" : "FAIL"}`);
  for (const issue of report.issues) {
    console.error(`  [FAIL] [${issue.layer}] ${issue.code} (${issue.scope}): ${issue.message}`);
  }
  if (!report.passed) allPassed = false;
}

process.exit(allPassed ? 0 : 1);
