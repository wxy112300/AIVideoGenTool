import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { buildStrataRuntimeConfig, strataPackArtifactFacts, type StrataRuntimePolicy } from "../../electron/services/strata-model-preparation.js";
import { strataModelGeometry } from "../../src/core/catalog/models/strata.js";

export const strataFixturePolicy: StrataRuntimePolicy = { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true, vramReserveMiB: 2048 };
export async function writeStrataPackFixture(directory: string, modelId = ""): Promise<void> {
  const files: Record<string, string> = {
    "native_experts.txt": "synthetic expert table", "index.txt": "synthetic index", "dense.bin": "synthetic dense",
    "tokenizer/vocab.json": JSON.stringify({ a: 0, b: 1, ab: 2 }), "tokenizer/merges.txt": "a b",
    "tokenizer/token_type.json": "[1,1,1]", "tokenizer/tokenizer.json": '{"vocab_size":3}', "tokenizer/chat_template.jinja": "synthetic template"
  };
  if (strataModelGeometry(modelId).compatBf16) {
    files["conversions.json"] = '{"schema":1,"conversions":[]}';
    files["compat-bf16.json"] = '{"fixture":true}';
  }
  for (const [relative, body] of Object.entries(files)) {
    const filename = path.join(directory, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, body);
  }
}

export async function writeStrataPreparedFixture(install: string, configPath: string, modelId = "strata/qwen3.8-flash-next-iq3_xxs"): Promise<void> {
  const pack = path.dirname(configPath);
  const geometry = strataModelGeometry(modelId);
  const assets = [];
  const names = geometry.shardCount === 2 ? ["first.gguf", "second.gguf"] : ["first.gguf", "second.gguf", "third.gguf", "fourth.gguf"];
  for (const name of [...names, "projector.gguf"]) {
    const filename = path.join(pack, name); await fs.mkdir(pack, { recursive: true }); await fs.writeFile(filename, "GGUF synthetic asset");
    const stat = await fs.stat(filename);
    assets.push({ filename, bytes: stat.size, sha256: "a".repeat(64), mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
  }
  await writeStrataPackFixture(pack, modelId);
  const config = buildStrataRuntimeConfig({ installDirectory: install, packDirectory: pack, shards: assets.slice(0, geometry.shardCount).map((asset) => asset.filename),
    pleShard: assets[1].filename, projector: assets[geometry.shardCount].filename, modelId, port: 43127, policy: strataFixturePolicy });
  await fs.writeFile(configPath, JSON.stringify(config));
  await fs.writeFile(path.join(pack, "lvs-strata-model.json"), JSON.stringify({ owner: "local-video-studio", schema: 1, modelId,
    sourceRevision: STRATA_REVISION, modelRevision: geometry.revision, assets, artifacts: await strataPackArtifactFacts(pack, modelId), policy: strataFixturePolicy, pleShard: 1, mtp: false, preparedAt: "fixture" }));
}
