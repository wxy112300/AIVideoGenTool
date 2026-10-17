import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validatePreparedStrataRuntime } from "./strata-model-preparation.js";
import { planStrataResources, type StrataResources } from "../../src/core/strata-resource-policy.js";
import { verifyStrataControlVector } from "./strata-uncensored.js";
import { privateLocalDirectory, writePrivateJson } from "./private-local-state.js";
import type { AgentPreferences } from "./strata-agent-settings.js";
import type { StrataLaunchPlan } from "./strata-service.js";

/** Context validation changes only the private Agent overlay, never the shared H3 pack/receipt. */
export async function agentLaunchPlan(input: {
  preferences: AgentPreferences; install: string; packConfig: string; token: string; directory: string;
  guardScript: string; resources: StrataResources; commitTrial?: boolean; contextTokens?: number;
}): Promise<StrataLaunchPlan> {
  const { preferences: p, install } = input;
  if (await validatePreparedStrataRuntime(input.packConfig, install) !== p.modelId) throw new Error("Agent pack 与所选模型身份不一致。");
  const config = JSON.parse(await fs.readFile(input.packConfig, "utf8"));
  const context = config.args.indexOf("--max-context");
  if (context < 0 || config.args[context + 1] !== "32768") throw new Error("共享pack必须保留已审核32K准备记录；Agent更大上下文只写私有运行配置。");
  const contextTokens = input.contextTokens ?? p.contextTokens;
  if (![32768, 65536, 131072, 262144].includes(contextTokens)) throw new Error("Agent 上下文必须使用逐档验证的32K/64K/128K/262K之一。");
  config.args[context + 1] = String(contextTokens);
  const resourcePlan = planStrataResources(input.resources, 5120, { commitTrial: input.commitTrial, allowFileReadFallback: true });
  const directory = await privateLocalDirectory(path.join(input.directory, "runs", randomUUID()));
  const reserve = config.args.indexOf("--vram-reserve-mib");
  if (reserve < 0) throw new Error("pack 缺少显存策略。");
  config.args[reserve + 1] = String(resourcePlan.vramReserveMiB);
  if (resourcePlan.hostMode === "arena") config.args = config.args.filter((arg: string) => arg !== "--resident-experts");
  const controlVector = p.uncensored ? await verifyStrataControlVector(install) : undefined;
  if (controlVector) config.args.push("--control-vector-scaled", `${controlVector.filename}:1.0`, "--control-vector-layer-range",
    String(controlVector.firstLayer), String(controlVector.lastLayer), "--cvec-mode", "project", "--cvec-dir", "per-layer");
  config.sampling = { ...(config.sampling ?? {}), experimental_speed_projection: p.uncensored };
  config.cwd = directory;
  config.log = path.join(directory, "engine.log");
  config.slot_save_path = path.join(directory, "slots");
  await fs.mkdir(config.slot_save_path);
  config.fit_max_tokens = true; config.anthropic_thinking = "on_request";
  config.aliases = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"];
  config.mcp_servers = {}; config.mcp_config = undefined;
  const executable = path.join(install, ".venv", "Scripts", "python.exe");
  config.before_load = [executable, "-B", input.guardScript, "--check", path.join(input.directory, "admission.json")];
  config.before_load_strict = true;
  config.min_free_vram_mib = Math.ceil(resourcePlan.minimumFreeVramBytes / 1024 ** 2);
  const filename = path.join(directory, "runtime.json");
  await writePrivateJson(filename, config);
  return { executable, cwd: install, port: p.strataPort, modelId: p.modelId, apiKey: input.token,
    args: ["-B", "-u", input.guardScript, "--serve", install, "--engine", "strata", "--config", filename,
      "--host", "127.0.0.1", "--port", String(p.strataPort), "--lazy", "--api-monitor"],
    env: { STRATA_API_KEY: input.token, STRATA_RESIDENT_HEADROOM_GIB: String(resourcePlan.headroomGiB),
      STRATA_AGENT_ADMISSION: path.join(input.directory, "admission.json") },
    resourcePlan, allowResidentFallback: true, engineLog: config.log, ...(config.args.includes("--resident-experts") ? { residentEngineLog: config.log } : {}),
    controlVector, uncensoredRequested: p.uncensored };
}
