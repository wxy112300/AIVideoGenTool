import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_MODEL_REVISION, STRATA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { buildStrataRuntimeConfig, strataPackArtifactFacts, type StrataRuntimePolicy } from "../../electron/services/strata-model-preparation.js";

export const strataFixturePolicy: StrataRuntimePolicy = { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true, vramReserveMiB: 2048 };
export async function writeStrataPackFixture(directory: string): Promise<void> {
  const files: Record<string, string> = {
    "native_experts.txt": "synthetic expert table", "index.txt": "synthetic index", "dense.bin": "synthetic dense",
    "tokenizer/vocab.json": JSON.stringify({ a: 0, b: 1, ab: 2 }), "tokenizer/merges.txt": "a b",
    "tokenizer/token_type.json": "[1,1,1]", "tokenizer/tokenizer.json": '{"vocab_size":3}', "tokenizer/chat_template.jinja": "synthetic template"
  };
  for (const [relative, body] of Object.entries(files)) {
    const filename = path.join(directory, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, body);
  }
}

export async function writeStrataPreparedFixture(install: string, configPath: string): Promise<void> {
  const pack = path.dirname(configPath);
  const assets = [];
  for (const name of ["first.gguf", "second.gguf", "projector.gguf"]) {
    const filename = path.join(pack, name); await fs.mkdir(pack, { recursive: true }); await fs.writeFile(filename, "GGUF synthetic asset");
    const stat = await fs.stat(filename);
    assets.push({ filename, bytes: stat.size, sha256: "a".repeat(64), mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
  }
  await writeStrataPackFixture(pack);
  const modelId = "strata/qwen3.8-flash-next-iq3_xxs";
  const config = buildStrataRuntimeConfig({ installDirectory: install, packDirectory: pack, shards: assets.slice(0, 2).map((asset) => asset.filename),
    pleShard: assets[1].filename, projector: assets[2].filename, modelId, port: 43127, policy: strataFixturePolicy });
  await fs.writeFile(configPath, JSON.stringify(config));
  await fs.writeFile(path.join(pack, "lvs-strata-model.json"), JSON.stringify({ owner: "local-video-studio", schema: 1, modelId,
    sourceRevision: STRATA_REVISION, modelRevision: STRATA_MODEL_REVISION, assets, artifacts: await strataPackArtifactFacts(pack), policy: strataFixturePolicy, pleShard: 1, mtp: false, preparedAt: "fixture" }));
}
