import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { agentDirectory, agentSettings, applyAgentDiscovery, normalizeAgentPreferences, readAgentPreferences, saveAgentPreferences, type AgentPreferences } from "./strata-agent-settings.js";
import { agentDoctor } from "./strata-agent-doctor.js";
import { agentLaunchPlan } from "./strata-agent-profile.js";
import { agentToken } from "./strata-agent-token.js";
import { GpuResourceLease } from "./gpu-resource-lease.js";
import { privateLocalDirectory, writePrivateJson } from "./private-local-state.js";
import { StrataService } from "./strata-service.js";
import { readReliableStrataResources } from "./strata-resources.js";
import { planStrataResources, type StrataResources } from "../../src/core/strata-resource-policy.js";
import { AgentResourcePressure } from "../../src/core/strata-agent-resources.js";
import { isLocalPortInUse, localEndpoint } from "./local-service-process.js";
import { prepareStrataModelRuntime } from "./strata-model-preparation.js";
import { installStrata, runLoggedProcess } from "./environment.js";
import { InstallationCancellation } from "./installation-cancellation.js";
import { STRATA_ENGINE_BYTES, STRATA_VERSION } from "../../src/core/catalog/dependencies/strata.js";
import { managedStrataDirectory, resolvedStrataDirectory } from "./strata-installation.js";
import { agentStrataInstallationSettings } from "./strata-agent-settings.js";
import { AgentCloud, verifyCloudAdapter } from "./strata-agent-cloud.js";
import { AGENT_SOFTWARE, atLeastVersion, checkAgentSoftwareUpstream, cloudPackageDirectory, installAgentSoftware, planSharedAgentSoftware, type SharedSoftwarePlan } from "./strata-agent-software.js";
import { backupClaudeAndSwitch, switchBackupConfig } from "./strata-agent-cc-switch.js";
import { AgentRuntimeMonitor } from "./strata-agent-monitor.js";
import { AGENT_RESOURCE_RETRY, AgentResourceSampler } from "./strata-agent-sampler.js";

export class AgentController {
  private readonly lease = new GpuResourceLease("agent", async () => {
    this.emit({ event: "handoff", message: "Studio 请求 GPU。请在此窗口完成或停止会话后点“停止全部”；活跃 Agent 不会被静默中止。" });
    return false; // Explicit stop is required until full harness activity tracking has passed P2/P4.
  });
  private readonly coldPressure = new AgentResourcePressure();
  private readonly sampler = new AgentResourceSampler();
  private readonly service = new StrataService({ onSpawn: (pid) => this.lease.track(pid), resourcePressure: (resources) => this.coldPressure.check(resources),
    knownResourcePressure: (resources) => this.coldPressure.knownPressure(resources),
    readResources: (signal) => this.sampler.read(signal), resourceRetry: AGENT_RESOURCE_RETRY,
    onOutput: (chunk) => this.writeServerLog(chunk) });
  private readonly monitor = new AgentRuntimeMonitor();
  private serverLog = "";
  private serverOutput = "";
  private engineLog = "";
  private fault: { kind: string; message: string; at: string } | null = null;
  private monitorRead: Promise<unknown> | null = null;
  private lastMonitorSignature = "";
  private lastResources: StrataResources | null = null;
  private restoredDiagnostics: Promise<void> | null = null;
  private readonly cloud: AgentCloud;
  private readonly installations = new InstallationCancellation();
  private operation: Promise<unknown> | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sampling: Promise<void> | null = null;
  private sampleAbort: AbortController | null = null;
  private stopping: Promise<unknown> | null = null;
  private installPlan: { id: string; repair: boolean; repairSoftware: boolean; preferences: AgentPreferences; softwarePlan?: SharedSoftwarePlan; items: Array<{ name: string; version: string; target: string; bytes: number; impact: string }> } | null = null;
  private currentToken = "";
  private admissionEnabled = false;
  private operationId = "";
  private logReady: Promise<string> | null = null;
  private logging: Promise<void> = Promise.resolve();
  constructor(private readonly toolDirectory: string, private readonly emit: (value: unknown) => void, private readonly directory = agentDirectory()) {
    this.cloud = new AgentCloud(toolDirectory, directory, (pid) => this.lease.track(pid));
  }
  private log(message: string) {
    message = this.redact(message);
    const record = { event: "progress", operationId: this.operationId, message, at: new Date().toISOString() };
    this.emit(record);
    this.logReady ??= privateLocalDirectory(path.join(this.directory, "logs"));
    this.logging = this.logging.then(async () => {
      const directory = await this.logReady!;
      await fs.appendFile(path.join(directory, `${record.at.slice(0, 10)}.jsonl`), JSON.stringify(record) + "\n", { mode: 0o600 });
    }).catch(() => { this.emit({ event: "logError", message: "本机操作日志无法写入；窗口反馈仍保留。" }); });
  }
  reportFailure(message: string) {
    // Retain the root safety reason instead of replacing it with a secondary abort error.
    if (this.fault && ["resource-protection", "telemetry-failure"].includes(this.fault.kind)) this.log(message);
    else this.recordFault("operation-failed", message);
  }
  private redact(message: string) {
    return message.replaceAll(this.currentToken || "\0", "[redacted]")
      .replace(/(Bearer\s+|(?:api[_-]?key|auth[_-]?token)["'\s:=]+)[^\s"',}]+/giu, "$1[redacted]");
  }
  private writeServerLog(chunk: string) {
    if (!this.serverLog) return;
    this.serverOutput += chunk;
    const end = this.serverOutput.lastIndexOf("\n");
    if (end < 0) return; // Redact whole lines, including secrets split across stdout chunks.
    const filename = this.serverLog, text = this.redact(this.serverOutput.slice(0, end + 1));
    this.serverOutput = this.serverOutput.slice(end + 1);
    this.logging = this.logging.then(() => fs.appendFile(filename, text, { mode: 0o600 })).catch(() => {
      this.emit({ event: "logError", message: "服务日志写入失败；请检查本机数据目录的空间和权限。" });
    });
  }
  private recordFault(kind: string, message: string) {
    if (this.fault?.kind === kind && this.fault.message === message) return;
    this.fault = { kind, message: this.redact(message), at: new Date().toISOString() };
    this.log(`[${kind}] ${this.fault.message}`);
    if (this.lastResources) this.log(`故障时最近资源：RAM=${this.lastResources.memoryAvailableBytes} commit=${this.lastResources.commitAvailableBytes} VRAM=${this.lastResources.vramAvailableBytes} bytes`);
    this.emit({ event: "fault", fault: this.fault, message: this.fault.message });
    this.persistDiagnostics();
  }
  private persistDiagnostics() {
    if (!this.serverLog) return;
    const record = { serverLog: this.serverLog, engineLog: this.engineLog, fault: this.fault };
    this.logging = this.logging.then(() => writePrivateJson(path.join(this.directory, "latest-run.json"), record))
      .catch(() => this.emit({ event: "logError", message: "最近运行诊断索引写入失败；本轮日志仍可在runs目录查找。" }));
  }
  private async restoreDiagnostics() {
    if (this.serverLog) return;
    try {
      const saved = JSON.parse(await fs.readFile(path.join(this.directory, "latest-run.json"), "utf8"));
      const valid = (filename: unknown, basename: string) => {
        if (typeof filename !== "string" || path.basename(filename) !== basename) return false;
        const relative = path.relative(path.join(this.directory, "runs"), filename);
        return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      };
      if (this.serverLog || !valid(saved.serverLog, "server.log") || !valid(saved.engineLog, "engine.log")) return;
      this.serverLog = saved.serverLog; this.engineLog = saved.engineLog;
      if (saved.fault && typeof saved.fault.kind === "string" && typeof saved.fault.message === "string" && typeof saved.fault.at === "string")
        this.fault = { kind: saved.fault.kind.slice(0, 80), message: this.redact(saved.fault.message.slice(0, 4000)), at: saved.fault.at.slice(0, 40) };
    } catch { /* No previous run/index is normal. Never adopt a process from this index. */ }
  }
  private async status() {
    await (this.restoredDiagnostics ??= this.restoreDiagnostics());
    let runtime = this.service.snapshot();
    // Service.inspect is serialized with load/chat. Monitoring must remain responsive while loading.
    let live = !this.operation && !this.stopping && runtime.phase === "ready" && runtime.port && this.currentToken
      ? await this.monitor.read(runtime.port, this.currentToken) : null;
    const current = this.service.snapshot();
    if (current.pid !== runtime.pid || this.operation || this.stopping) { live = null; runtime = current; }
    if (runtime.phase === "error") this.recordFault("process-exit", runtime.message);
    if (this.cloud.running && !this.cloud.alive && !this.operation && !this.stopping)
      this.recordFault("gui-exit", "CloudCLI GUI 进程已退出。模型归属保留；请先停止全部后重试，不会自动中止或重放文件操作。");
    if (live?.connection === "unreachable") this.recordFault("http-unreachable", "Strata 连续三次无法连接。未终止或重放活跃任务；请查看服务日志，确认后停止并重新启动，可恢复原 Claude 会话。");
    if (live?.connection === "online" && live.loaded === false && runtime.modelLoaded === true)
      this.recordFault("model-unloaded", "Strata HTTP 在线，但模型已卸载或引擎已退出。请查看本轮 engine.log / server.log；未自动重试工具或重载模型。");
    const signature = JSON.stringify([runtime.phase, live?.connection, live && "loaded" in live ? live.loaded : null, this.cloud.alive]);
    if (signature !== this.lastMonitorSignature) {
      this.lastMonitorSignature = signature;
      this.log(`服务状态：Strata=${runtime.phase} HTTP=${live?.connection ?? "未探测"} 模型=${live && "loaded" in live ? live.loaded : runtime.modelLoaded} GUI=${this.cloud.alive ? "在线" : "未运行"}`);
    }
    return { runtime: { ...runtime, log: "" }, live, fault: this.fault, gui: { owned: this.cloud.running, alive: this.cloud.alive },
      busy: Boolean(this.operation || this.stopping), ownedGpu: this.lease.held,
      logs: { directory: path.join(this.directory, "logs"), server: this.serverLog, engine: this.engineLog } };
  }
  private async exclusive<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.operation || this.stopping) throw new Error("当前操作尚未结束，请取消或等待后重试。");
    const abort = new AbortController(); this.abort = abort;
    this.operationId = randomUUID();
    const operation = Promise.resolve().then(() => work(abort.signal)); this.operation = operation;
    try { return await operation; }
    finally { if (this.operation === operation) { this.operation = null; this.abort = null; } }
  }
  async dispatch(command: { action: string; mode?: string; preferences?: unknown; planId?: string; confirmed?: boolean; commitTrial?: boolean; contextTokens?: number }) {
    switch (command.action) {
      case "doctor": return this.exclusive(async () => {
        const preferences = command.preferences ? normalizeAgentPreferences(command.preferences) : await readAgentPreferences(this.directory);
        this.log("检测已安装软件、共享模型与实时资源；不下载安装或加载 GPU");
        const doctor = await agentDoctor(preferences, this.directory);
        return { preferences: applyAgentDiscovery(preferences, doctor), doctor, runtime: this.service.snapshot() };
      });
      case "save": return this.exclusive(async () => ({ preferences: await saveAgentPreferences(command.preferences, this.directory) }));
      case "installationPlan": return this.exclusive(async (signal) => {
        const preferences = normalizeAgentPreferences(command.preferences);
        const doctor = await agentDoctor(preferences, this.directory);
        if (this.service.snapshot().pid !== null || this.cloud.running) throw new Error("请先停止全部自有服务，再安装、更新或修复。");
        const repair = command.mode === "repair";
        const update = command.mode === "update" && (doctor.strata.installedVersion !== STRATA_VERSION ||
          path.resolve(doctor.strata.installDirectory).toLowerCase() !== path.resolve(managedStrataDirectory()).toLowerCase());
        const repairSoftware = command.mode === "repairAgentSoftware";
        const onlySoftware = repairSoftware || command.mode === "agentSoftware";
        let softwarePlan: SharedSoftwarePlan | undefined;
        const needsStrata = !onlySoftware && (!doctor.strata.managedInstalled || repair || update);
        if (needsStrata) await agentStrataInstallationSettings(preferences);
        const items = !needsStrata ? [] : [{ name: "Strata", version: STRATA_VERSION,
          target: managedStrataDirectory(), bytes: STRATA_ENGINE_BYTES,
          impact: `固定引擎约${(STRATA_ENGINE_BYTES / 1024 ** 2).toFixed(1)}MiB，附社区向量约262KiB；另需源码和Python依赖（大小未知）。独立venv，不下载模型；无系统PATH/分页文件/provider变更。更新验证后清理旧软件。` }];
        if (!["update", "repair"].includes(command.mode ?? "")) {
          if (!doctor.npm) throw new Error(doctor.npmIssue || "未找到共享 npm 安装位置，请修复 Node/npm 后重试。");
          softwarePlan = await planSharedAgentSoftware(doctor.npm, doctor.claude, repairSoftware);
          if (softwarePlan.items.length) {
            this.log("重新核对 CloudCLI 最新稳定版、公开安全公告和官方包 integrity；不安装软件");
            await checkAgentSoftwareUpstream(signal);
          }
          const sizes = { cloud: "主包下载约5.8MiB、解压约17.1MiB", sdk: "SDK及传递依赖大小未知；npm可能带入可选平台CLI，本工具禁用其回退", claude: "官方npm入口包约142KiB，平台原生包另列", native: "Windows x64原生CLI解压约229MiB" };
          for (const item of softwarePlan.items) items.push({ name: item.name, version: item.version, target: item.target, bytes: item.key === "cloud" ? 6059896 : 0,
            impact: `${item.previousVersion ? `共享升级 ${item.previousVersion} → ${item.version}` : "共享安装"}；${sizes[item.key]}。` });
        }
        this.installPlan = { id: randomUUID(), repair: repair || update, repairSoftware, preferences, softwarePlan, items };
        return { ...this.installPlan, message: items.length ? "确认后仅安装所列项目，已有兼容项跳过。npm -g使用共享安装，更新影响其他使用者；使用中拒绝更新，不额外复制旧包/入口，下载包收尾后清理。原生依赖可能需C++工具链，完整大小未知。取消/失败可能部分生效，需复检后重试。不会修改provider、CC Switch、Codex配置或系统PATH，不下载模型。安装不代表真实Agent验收成功。" : "当前已可用软件无需重装。" };
      });
      case "install": return this.exclusive(async (signal) => {
        const plan = this.installPlan; this.installPlan = null;
        if (!plan || command.planId !== plan.id || command.confirmed !== true) throw new Error("安装必须先展示有效计划并明确确认。");
        if (this.service.snapshot().pid !== null || this.cloud.running) throw new Error("运行中禁止修改自有软件；先停止全部。");
        if (!plan.items.length) return { message: "没有已批准的缺失软件需要安装。" };
        await this.lease.acquire();
        try {
          let installedPreferences = plan.preferences;
          const fresh = await agentDoctor(plan.preferences, this.directory);
          if (fresh.ports.strataPortBusy) throw new Error("Strata 端口仍有监听，归属未确认；未修改软件，请先在原窗口停止。");
          if (plan.items.some((item) => item.name === "Strata") && (!fresh.strata.managedInstalled || plan.repair)) {
            const settings = await agentStrataInstallationSettings(plan.preferences);
            const result = await this.installations.run("strata", () => installStrata(settings, (message, progress) => {
              if (message) this.log(message); if (progress) this.emit({ event: "installProgress", progress });
            }), signal);
            if (!result.ok) throw new Error(result.message);
            installedPreferences = { ...plan.preferences, strataDirectory: "", packConfig: "" };
            await saveAgentPreferences(installedPreferences, this.directory);
          }
          if (plan.softwarePlan?.items.length) {
            const installed = await installAgentSoftware(plan.softwarePlan, this.directory, signal, (message) => this.log(message), fresh.claude);
            if (!installed.available) throw new Error("共享软件安装后复检失败，请重试。");
            await saveAgentPreferences({ ...installedPreferences, cloudDirectory: installed.path, claudeEntry: installed.claudePath }, this.directory);
          }
          return { message: "已批准软件准备完成；共享权重未下载。请重新检测，真实Agent工具仍待验收。", preferences: await readAgentPreferences(this.directory) };
        } finally { await this.lease.release(); }
      });
      case "start": return this.exclusive(async (signal) => {
        this.fault = null; this.monitor.reset();
        const preferences = normalizeAgentPreferences(command.preferences);
        const doctor = await agentDoctor(preferences, this.directory);
        if (!atLeastVersion(process.versions.node, "22.15.0")) throw new Error("CloudCLI版本适配需要 Node 22.15+，推荐现有24 LTS。");
        if (!doctor.cloud.available || !doctor.claude.available || !doctor.claude.compatible) throw new Error(`请先安装缺失软件或选择 Claude >=${AGENT_SOFTWARE.claude.version}；当前未启动任何组件。`);
        if (!doctor.git) throw new Error("未检测到Git；请安装Git for Windows并重新检测，当前未启动组件。");
        if (doctor.ports.guiPortBusy) throw new Error(`GUI端口 ${preferences.guiPort} 已占用，未接管。`);
        await verifyCloudAdapter(this.toolDirectory, cloudPackageDirectory(doctor.cloud.path));
        const contextTokens = command.contextTokens ?? preferences.contextTokens;
        const engine = await this.startEngine(preferences, signal, command.commitTrial === true, contextTokens);
        try {
          this.log(`按需 Claude ${doctor.claude.version} / CloudCLI ${doctor.cloud.version} / SDK ${doctor.cloud.sdkVersion}；原 provider 不变`);
          const gui = await this.cloud.start({ software: doctor.cloud.path, sdkDirectory: doctor.cloud.sdkDirectory, cli: doctor.claude.path, token: this.currentToken,
            strataPort: preferences.strataPort, guiPort: preferences.guiPort, contextTokens }, signal);
          signal.throwIfAborted();
          const pages = [...(preferences.openGui ? [gui.origin] : []), ...(preferences.openNative ? [engine.origin] : [])];
          return { message: `本机服务链已启动（${contextTokens / 1024}K）；Claude由GUI按需调用，具体任务仍需按权限确认。原Claude/CC Switch当前provider未修改。首次GUI创建本地账号，可跳过全局Git身份；原生页密钥可从依赖菜单复制。`, pages };
        } catch (error) { await this.cleanup(); throw error; }
      });
      case "ccSwitchBackup": return this.exclusive(async () => {
        if (command.confirmed !== true) throw new Error("备份/复制备用配置需明确确认；日常启动不需要切换CC Switch。");
        const preferences = normalizeAgentPreferences(command.preferences);
        const doctor = await agentDoctor(preferences, this.directory);
        if (!/^3\.20\.0(?:\.0)?$/u.test(doctor.ccSwitch.version)) throw new Error("当前只核对CC Switch 3.20.0的GUI JSON入口；其他版本未自动套用，未写任何配置。");
        const backup = await backupClaudeAndSwitch(this.directory, this.toolDirectory, path.join(doctor.strata.installDirectory, ".venv", "Scripts", "python.exe"));
        const directory = await privateLocalDirectory(path.join(this.directory, "exports"));
        const filename = path.join(directory, `${randomUUID()}.json`);
        await writePrivateJson(filename, switchBackupConfig(await agentToken(this.directory), preferences.strataPort));
        return { clipboardFile: filename, message: `一致性备份完成：${backup}。仅复制备用配置；请在CC Switch的Claude新增provider JSON编辑器粘贴，不设为当前。启动器不会导入、切换、接管proxy或修改数据库。` };
      });
      case "copyToken": return this.exclusive(async () => {
        if (command.confirmed !== true || !this.currentToken) throw new Error("仅运行时可明确确认复制原生管理页密钥。");
        const directory = await privateLocalDirectory(path.join(this.directory, "exports"));
        const filename = path.join(directory, `${randomUUID()}.txt`);
        await fs.writeFile(filename, this.currentToken, { flag: "wx", mode: 0o600 });
        return { clipboardFile: filename, message: "密钥已复制；仅粘贴到本机Strata原生页的认证输入框。剪贴板60秒后按内容匹配清除。" };
      });
      case "engineValidation": return this.exclusive((signal) => {
        const preferences = normalizeAgentPreferences(command.preferences);
        return this.startEngine(preferences, signal, command.commitTrial === true, command.contextTokens ?? preferences.contextTokens);
      });
      case "cancel": this.abort?.abort(new Error("操作已取消")); await this.operation?.catch(() => undefined); return { message: "操作已收尾。" };
      case "stop": return this.stop(command.confirmed === true);
      case "status": {
        this.monitorRead ??= this.status().finally(() => { this.monitorRead = null; });
        return this.monitorRead;
      }
      default: throw new Error("不支持的启动器操作。");
    }
  }
  private async startEngine(preferences: AgentPreferences, signal: AbortSignal, commitTrial = false, contextTokens = 32768) {
    if (![32768, 65536, 131072, 262144].includes(contextTokens)) throw new Error("上下文档位无效，未加载模型。");
    const started = Date.now();
    if (this.service.snapshot().pid !== null) throw new Error("引擎已由本窗口启动；更改选项前请停止全部。");
    await privateLocalDirectory(this.directory);
    this.log("冻结本次选项并检查独立模式依赖");
    const doctor = await agentDoctor(preferences, this.directory);
    if (!doctor.strata.managedInstalled || !doctor.strata.sourcePresent || !doctor.strata.enginePresent) throw new Error("Strata 运行组件缺失，请检测后安装缺失软件。");
    if (!doctor.models.find((model) => model.id === preferences.modelId)?.available) throw new Error("所选模型文件未齐全，请选择已有共享模型目录；不会下载模型。");
    if (doctor.ports.strataPortBusy) throw new Error(`端口 ${preferences.strataPort} 已占用；未接管或停止任何监听。`);
    const settings = await agentSettings(preferences);
    const endpoint = localEndpoint(settings.discoveredComfyUrl, 8188);
    if (endpoint && await isLocalPortInUse(endpoint.port)) throw new Error("发现配置中的 ComfyUI 仍有监听；请在其所属窗口停止并释放模型后重试。独立 Agent 不接管该服务。");
    this.log("取得跨进程 GPU / 软件租约");
    await this.lease.acquire();
    try {
      signal.throwIfAborted();
      this.log("启动专用轻量资源采样器：Windows原生RAM/提交 + NVML显存；不在每秒采样时启动PowerShell/WMI");
      await this.sampler.start(path.join(doctor.strata.installDirectory, ".venv", "Scripts", "python.exe"),
        path.join(this.toolDirectory, "resources.py"), pid => this.lease.track(pid));
      this.log(`按当前 RAM、Windows 提交余量和显存预检 ${contextTokens / 1024}K；上下文扩展不修改共享H3策略`);
      const resources = await readReliableStrataResources(this.sampler.read, { ...AGENT_RESOURCE_RETRY, signal });
      this.lastResources = resources;
      this.emit({ event: "resources", resources });
      const limits = planStrataResources(resources, 5120, { commitTrial, allowFileReadFallback: true, modelId: preferences.modelId, contextTokens });
      if (commitTrial) this.log("用户授权Agent实测：本次不叠加整卡容量作为提交硬门槛，实时RAM/提交/显存及低资源停止仍启用；不影响H3默认策略。");
      this.emit({ event: "resources", resources, limits });
      let packConfig = doctor.pack;
      if (!packConfig) {
        this.log("未发现完成 pack：开始唯一一次官方离线准备，可取消；不下载权重");
        packConfig = (await prepareStrataModelRuntime(settings, preferences.modelId,
          { maxContext: 32768, kv: "k8v4", visionTokens: 1024, visionGpu: true, vramReserveMiB: 2048 },
          { run: runLoggedProcess }, { signal, onLog: (message) => this.log(message) })).configPath;
      }
      signal.throwIfAborted();
      this.currentToken = await agentToken(this.directory);
      const plan = await agentLaunchPlan({ preferences, install: doctor.strata.installDirectory, packConfig,
        token: this.currentToken, directory: this.directory, guardScript: path.join(this.toolDirectory, "guard.py"), resources: await readReliableStrataResources(this.sampler.read, { ...AGENT_RESOURCE_RETRY, signal }), commitTrial, contextTokens });
      this.fault = null; this.monitor.reset();
      this.serverOutput = "";
      this.engineLog = plan.engineLog ?? "";
      this.serverLog = path.join(path.dirname(this.engineLog), "server.log");
      await fs.writeFile(this.serverLog, `[Agent run] ${new Date().toISOString()} model=${preferences.modelId} context=${contextTokens} hostMode=${plan.resourcePlan?.hostMode} residentBudgetGiB=${plan.resourcePlan?.residentBudgetGiB ?? "none"} uncensoredMode=${preferences.uncensoredMode} vector=${plan.controlVector?.id ?? "none"} sha256=${plan.controlVector?.sha256 ?? "none"}\n`, { flag: "wx", mode: 0o600 });
      this.persistDiagnostics();
      this.log(`本轮日志：${path.dirname(this.serverLog)}（server.log 服务输出；engine.log 原生引擎）`);
      const owner = JSON.parse(await fs.readFile(path.join(this.lease.directory, "gpu-owner.json"), "utf8"));
      this.admissionEnabled = true;
      this.sampleAbort = new AbortController();
      const sampleSignal = this.sampleAbort.signal;
      const sample = async () => {
        // Agent gets a full 30s telemetry grace period. An 8s-stale admission blocks NEW loads;
        // it must not shorten recovery for a model/task already running.
        const fresh = await readReliableStrataResources(this.sampler.read, { ...AGENT_RESOURCE_RETRY, signal: sampleSignal,
          knownPressure: (resources) => this.coldPressure.knownPressure(resources),
          onDiagnostic: (event) => {
            if (event.event === "pressure" && !this.coldPressure.check({ ...event, vramTotalBytes: null })) return;
            this.log(`资源探针 ${event.event} / 第${event.attempt}次 / ${event.elapsedMs}ms / ${event.sources.join(",")} / RAM=${event.memoryAvailableBytes} commit=${event.commitAvailableBytes} VRAM=${event.vramAvailableBytes}`);
          } });
        if (!this.admissionEnabled || sampleSignal.aborted) return;
        this.lastResources = fresh;
        await writePrivateJson(path.join(this.directory, "admission.json"), {
          enabled: this.admissionEnabled, sampledAt: Date.now(), epoch: owner.epoch, controllerPid: process.pid,
          leaseFile: path.join(this.lease.directory, "gpu-owner.json"), limits: plan.resourcePlan
        });
        this.emit({ event: "resources", resources: fresh });
        const pressure = this.coldPressure.check(fresh);
        if (this.admissionEnabled && pressure) {
          this.admissionEnabled = false;
          this.recordFault("resource-protection", pressure);
          this.abort?.abort(new Error("资源保护已触发"));
          // Emergency resource protection is visible, never repurposed as silent handoff.
          if (!this.operation) void this.stop(true).catch(() => this.log("资源保护清理未完成，请重试停止全部"));
        }
      };
      await sample();
      this.timer = setInterval(() => {
        if (!this.sampling) this.sampling = sample().catch((error) => {
          if (sampleSignal.aborted || !this.admissionEnabled) return;
          this.admissionEnabled = false; this.abort?.abort(new Error("实时资源探针失败"));
          this.recordFault("telemetry-failure", error instanceof Error ? error.message : "实时资源探针失败，保护停止自有服务。");
          if (!this.operation) void this.stop(true).catch(() => this.log("探针失败后清理未完成"));
        }).finally(() => { this.sampling = null; });
      }, 1000);
      this.log("启动受认证 loopback Strata HTTP（尚不等于模型或 Agent 验收成功）");
      await this.service.start(plan, signal);
      const unauthorized = await fetch(`http://127.0.0.1:${preferences.strataPort}/v1/models`, { redirect: "error", signal: AbortSignal.timeout(5000) });
      if (![401, 403].includes(unauthorized.status)) throw new Error("Strata 未认证负测失败，停止自有引擎。");
      this.log("HTTP 身份/鉴权通过；加载自有模型，可取消");
      this.log("Agent冷加载允许RAM短时低于3GiB最多30秒，512MiB RAM/3GiB提交/2GiB显存仍停止；健康提交需至少6GiB。加载后按实际驻留/回读模式保护。");
      this.coldPressure.setLoading(true);
      let runtime;
      try { runtime = await this.service.load(signal); }
      finally { this.coldPressure.setLoading(false); }
      const fileRead = runtime.log.includes("[Agent] 官方文件回读模式");
      this.coldPressure.setFileRead(fileRead);
      if (fileRead) this.log("模型已加载：官方文件回读模式；提交>=6GiB且显存>=2GiB时，文件映射RAM缓存不按3GiB驻留余量中止工具；RAM低于512MiB仍保护停止。H3策略不变。");
      signal.throwIfAborted();
      await saveAgentPreferences({ ...preferences, packConfig }, this.directory);
      this.log(`独立引擎已加载；耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒。尚未验证 Claude 工具调用。`);
      return { runtime, packConfig, origin: `http://127.0.0.1:${preferences.strataPort}`, elapsedMs: Date.now() - started };
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }
  async stop(confirmed = false): Promise<unknown> {
    if (this.stopping) return this.stopping;
    if (this.cloud.running && !confirmed) return { requiresConfirmation: true, message: "停止会关闭本工具GUI及其CLI/终端/MCP子进程。活动任务可能正在写文件，执行过的操作无法回滚。确认停止全部？" };
    if (!this.operation && this.service.snapshot().pid !== null && !confirmed) {
      // Native tasks can be active independently of our controller. Unknown status also needs confirmation.
      const state = this.service.snapshot();
      let busy = true;
      try {
        const response = await fetch(`http://127.0.0.1:${state.port}/status`, { headers: { Authorization: `Bearer ${this.currentToken}` }, signal: AbortSignal.timeout(3000) });
        const status = await response.json(); busy = !response.ok || status.busy === true || Number(status.queued ?? 0) > 0;
      } catch { /* Unknown is not idle. */ }
      if (busy) return { requiresConfirmation: true, message: "Strata 有活跃请求或无法确认空闲。停止会中止本工具任务；已执行的文件操作不能回滚。仍要停止？" };
    }
    this.abort?.abort(new Error("用户停止全部"));
    const operation = this.operation;
    this.stopping = (async () => {
      await operation?.catch(() => undefined);
      await this.cleanup();
      return { message: "本工具自有服务已停止，GPU 租约已释放；共享安装/权重/Claude 历史保留。", runtime: this.service.snapshot() };
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }
  private async cleanup() {
    this.coldPressure.setFileRead(false); this.coldPressure.setLoading(false);
    this.admissionEnabled = false;
    this.sampleAbort?.abort(new Error("用户停止资源采样")); this.sampleAbort = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    const errors: string[] = [];
    const attempt = async (work: () => Promise<unknown>) => { try { await work(); } catch (error) { errors.push(error instanceof Error ? error.message : "自有组件清理失败"); } };
    await attempt(async () => { await this.sampling; });
    await attempt(() => this.cloud.stop()); // Always attempt the owned model even if GUI cleanup fails.
    await attempt(() => fs.unlink(path.join(this.directory, "admission.json")).catch((error) => { if (error.code !== "ENOENT") throw error; }));
    const port = this.service.snapshot().port;
    await attempt(() => this.service.stop());
    await attempt(() => this.sampler.stop());
    if (port && await isLocalPortInUse(port)) errors.push("自有服务退出后端口仍有监听；归属未知，未终止其他进程。");
    if (!errors.length) await attempt(() => this.lease.release());
    await this.logging;
    if (errors.length) throw new Error(`${errors.join("；")} 资源归属尚未完全确认，保留租约，请重试停止全部。`);
    this.currentToken = "";
  }
}

// Private stdio control channel. No HTTP admin port, no secrets in emitted events.
if (process.argv.includes("--stdio")) {
  const toolIndex = process.argv.indexOf("--tool-directory");
  const toolDirectory = process.argv[toolIndex + 1];
  if (toolIndex < 0 || !toolDirectory || !path.isAbsolute(toolDirectory)) throw new Error("工具目录无效。");
  const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
  const controller = new AgentController(toolDirectory, emit);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (line.length > 32768) return;
    void (async () => {
      let id: unknown;
      try { const command = JSON.parse(line); id = command.id; emit({ id, ok: true, result: await controller.dispatch(command) }); }
      catch (error) {
        const message = error instanceof Error ? error.message : "启动器操作失败";
        controller.reportFailure(message); emit({ id, ok: false, message });
      }
    })();
  });
  lines.on("close", () => { void controller.stop(true).then(() => process.exit(0), () => process.exit(2)); });
}
