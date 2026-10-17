import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import { localClaudeRoute, assertLocalPermissions } from "../src/core/strata-agent-routing.js";
import { AGENT_SOFTWARE, AGENT_NATIVE_CLAUDE, atLeastVersion, checkAgentSoftwareUpstream, inspectAgentSoftware, inspectedAgentSdk, planSharedAgentSoftware, installationFailureHint } from "../electron/services/strata-agent-software.js";
import { backupClaudeAndSwitch } from "../electron/services/strata-agent-cc-switch.js";
import { locateClaude } from "../electron/services/strata-agent-doctor.js";
import * as policy from "../Tools/Strata-Agent/cloudcli-policy.mjs";

const directories: string[] = [];
async function temporary() { const p = await fs.mkdtemp(path.join(os.tmpdir(), "strata-agent-wiring-")); directories.push(p); return p; }
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
function upstream(changes: { tag?: string; advisory?: string; integrity?: string; latest?: string } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    let result: unknown;
    if (url.endsWith("/releases/latest")) result = { tag_name: changes.tag ?? "v1.37.5", prerelease: false, draft: false };
    else if (url.endsWith("/security-advisories")) result = [
      ["GHSA-7fv4-fmmc-86g2", "<=1.23.0", "1.24.0"], ["GHSA-gv8f-wpm2-m5wr", "<= 1.24.0", "1.25.0"], ["GHSA-f2fc-vc88-6w7q", "<=1.23.0", "1.24.0"]
    ].map(([ghsa_id, range, patched]) => ({ ghsa_id, vulnerabilities: [{ vulnerable_version_range: changes.advisory ?? range, patched_versions: patched }] }));
    else if (url.endsWith("/latest")) result = { version: changes.latest ?? AGENT_SOFTWARE.cloud.version };
    else { const pkg = [...Object.values(AGENT_SOFTWARE), AGENT_NATIVE_CLAUDE].find((p) => url.endsWith(`${encodeURIComponent(p.name)}/${p.version}`))!; result = { ...pkg, dist: { integrity: changes.integrity ?? pkg.integrity, unpackedSize: 100, tarball: `https://registry.npmjs.org/${pkg.name}/-/fixture.tgz` }, claudeCodeVersion: AGENT_SOFTWARE.claude.version }; }
    return new Response(JSON.stringify(result), { status: 200 });
  }));
}
describe("local Agent wiring without starting any service or CLI", () => {
  it('caps cloud-declared token budgets at the actual local context without inflating a smaller SDK window', () => {
    vi.stubEnv('CONTEXT_WINDOW', '65536');
    expect(policy.contextWindow(200000)).toBe(65536);
    expect(policy.contextWindow(null)).toBe(65536);
    vi.stubEnv('CONTEXT_WINDOW', '262144');
    expect(policy.contextWindow(200000)).toBe(200000);
    expect(policy.contextWindow(null)).toBe(200000);
  });
  it("reports actionable install causes without copying secret-bearing installer output", () => {
    expect(installationFailureHint("npm error code ECONNRESET https://user:secret@example.test")).toContain("ECONNRESET");
    expect(installationFailureHint("gyp ERR! find VS user-secret")).toContain("Visual C++");
    expect(installationFailureHint("npm error code SELF_SIGNED_CERT_IN_CHAIN secret")).toContain("证书校验失败");
    expect(installationFailureHint("unknown secret-api-key")).not.toContain("secret-api-key");
  });
  it("routes only a child process and masks old cloud auth/proxy/model mappings without losing shared harness paths", () => {
    const parent = Object.freeze({ ANTHROPIC_API_KEY: "original-key", ANTHROPIC_AUTH_TOKEN: "old-token", ANTHROPIC_BASE_URL: "https://old.example", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_OAUTH_TOKEN: "oauth", HTTPS_PROXY: "http://proxy", CLAUDE_CONFIG_DIR: "shared-config", HOME: "shared-home", OPENAI_API_KEY: "untouched-codex" });
    const before = JSON.stringify(parent);
    const route = localClaudeRoute(parent, "local-secret", 43127, "claude-sonnet-4-6");
    expect(JSON.stringify(parent)).toBe(before);
    expect(route.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:43127");
    expect(route.env.ANTHROPIC_API_KEY).toBe("local-secret"); expect(route.env.ANTHROPIC_AUTH_TOKEN).toBe("");
    expect(route.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(""); expect(route.env.CLAUDE_CODE_USE_BEDROCK).toBe("0"); expect(route.env.HTTPS_PROXY).toBe("");
    expect(route.env.CLAUDE_CONFIG_DIR).toBe(parent.CLAUDE_CONFIG_DIR); expect(route.env.HOME).toBe(parent.HOME); expect(route.env.OPENAI_API_KEY).toBe(parent.OPENAI_API_KEY);
    expect(route.settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-sonnet-4-6");
    expect(() => localClaudeRoute(parent, "x", 8080, "m")).toThrow();
    expect(localClaudeRoute(parent, 'local', 43127, 'm', 65536).env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('65536');
    expect(localClaudeRoute(parent, 'local', 43127, 'm', 262144).env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000');
    expect(() => localClaudeRoute(parent, 'local', 43127, 'm', 999999)).toThrow('上下文');
  });
  it("rejects unsafe permission modes for both GUI and CLI while retaining default/Plan", () => {
    for (const permissionMode of ["bypassPermissions", "auto", "dontAsk"]) {
      expect(() => assertLocalPermissions({ permissionMode })).toThrow();
      expect(() => policy.assertPermissions({ permissionMode })).toThrow();
    }
    expect(() => policy.assertPermissions({ toolsSettings: { skipPermissions: true } })).toThrow();
    expect(() => policy.assertPermissions({ permissionMode: "plan" })).not.toThrow();
    expect(() => assertLocalPermissions({ permissionMode: "default" })).not.toThrow();
  });
  it("passes only a settings FILE and explicit selected CLI to SDK, preserving hooks/permissions sources and native resume ID", async () => {
    const directory = await temporary(), cli = path.join(directory, "cli.js"), settings = path.join(directory, "route.json");
    await fs.writeFile(cli, "not executed"); await fs.writeFile(settings, '{"env":{"ANTHROPIC_API_KEY":"local-secret"}}');
    vi.stubEnv("CLAUDE_CLI_PATH", cli); vi.stubEnv("STRATA_CLAUDE_SETTINGS", settings); vi.stubEnv("STRATA_CLAUDE_MODEL", "claude-sonnet-4-6");
    const options = { resume: "native-session", settingSources: ["user", "project", "local"], allowedTools: ["Read"], disallowedTools: ["Bash(rm *)"], settings: { ultracode: true }, effort: "max" };
    const sdk = policy.enforceSDK(options, { permissionMode: "plan" });
    expect(sdk.settings).toBe(settings); expect(sdk.pathToClaudeCodeExecutable).toBe(cli); expect(sdk.permissionMode).toBe("plan");
    expect(sdk.allowDangerouslySkipPermissions).toBe(false); expect(sdk.effort).toBeUndefined();
    expect(sdk.resume).toBe("native-session"); expect(sdk.settingSources).toEqual(["user", "project", "local"]); expect(sdk.disallowedTools).toEqual(["Bash(rm *)"]);
    expect(JSON.stringify({ settings: sdk.settings, path: sdk.pathToClaudeCodeExecutable })).not.toContain("local-secret");
    await fs.unlink(cli); expect(() => policy.enforceSDK({}, {})).toThrow();
  });
  it("refuses a concurrent task instead of interrupting the active task, then allows retry", async () => {
    let finish!: () => void;
    const first = policy.exclusiveRun(() => new Promise<void>((resolve) => { finish = resolve; }), {});
    await expect(policy.exclusiveRun(async () => { throw new Error("must not run"); }, {})).rejects.toThrow("has not been interrupted");
    expect(() => policy.validateTerminalInit({ provider: "claude" })).toThrow("active GUI task");
    finish(); await first;
    await expect(policy.exclusiveRun(async () => "retry", {})).resolves.toBe("retry");
  });
  it("builds a selected local terminal command with safe native resume and refuses login/force restart/bypass", () => {
    vi.stubEnv("CLAUDE_CLI_PATH", "C:\\private path\\cli.js"); vi.stubEnv("STRATA_CLAUDE_SETTINGS", "C:\\private path\\route.json"); vi.stubEnv("STRATA_CLAUDE_MODEL", "claude-sonnet-4-6");
    const result = policy.terminalCommand({}, {}, () => "native-id");
    expect(result.command).toContain("--resume 'native-id'"); expect(result.command).toContain("--permission-mode default"); expect(result.command).not.toContain("local-secret");
    expect(result.command).not.toContain("if ($LASTEXITCODE");
    expect(() => policy.terminalCommand({}, {}, () => "x'; rm files")).toThrow();
    for (const value of [{ bypassPermissions: true }, { initialCommand: "claude /login" }, { forceRestart: true }, { provider: "codex" }]) expect(() => policy.validateTerminalInit(value)).toThrow();
  });
  it("enforces loopback origin on HTTP and WebSocket without replacing upstream JWT auth", () => {
    vi.stubEnv("STRATA_GUI_ORIGIN", "http://127.0.0.1:43128");
    const json = vi.fn(), status = vi.fn(() => ({ json })), next = vi.fn();
    policy.httpGuard({ headers: { host: "127.0.0.1:43128", origin: "https://evil.example" }, path: "/api/git" }, { status }, next);
    expect(status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    policy.httpGuard({ headers: { host: "127.0.0.1:43128" }, path: "/api/plugins/start" }, { status }, next); expect(status).toHaveBeenCalledWith(409);
    policy.httpGuard({ headers: { host: "127.0.0.1:43128" }, path: "/api/git" }, { status }, next); expect(next).toHaveBeenCalledOnce();
    expect(policy.allowWebSocket({ origin: "http://127.0.0.1:43128", req: { url: "/ws?token=local-jwt" } })).toBe(true);
    expect(policy.allowWebSocket({ origin: "https://evil.example", req: { url: "/ws" } })).toBe(false);
    expect(policy.allowWebSocket({ origin: "http://127.0.0.1:43128", req: { url: "/plugin-ws/x" } })).toBe(false);
  });
  it("adds an optional Git onboarding skip without changing the shared Git identity or bypassing authentication", async () => {
    const directory = await temporary(), filename = path.join(directory, 'index.html');
    await fs.writeFile(filename, '<html><head></head><body></body></html>');
    expect(policy.guiIndex(filename)).toContain('/strata-local-onboarding.js');
    vi.stubEnv('STRATA_GUI_ORIGIN', 'http://127.0.0.1:43128');
    const send = vi.fn(), type = vi.fn(() => ({ send })), setHeader = vi.fn(), next = vi.fn();
    policy.httpGuard({ method: 'GET', headers: { host: '127.0.0.1:43128' }, path: '/strata-local-onboarding.js' }, { type, setHeader }, next);
    expect(next).not.toHaveBeenCalled();
    expect(send.mock.calls[0][0]).toContain('/api/user/complete-onboarding');
    expect(send.mock.calls[0][0]).toContain("localStorage.getItem('auth-token')");
    expect(send.mock.calls[0][0]).not.toContain('/git-config');
    expect(send.mock.calls[0][0]).not.toContain('bypassPermissions');
  });
  it("rechecks upstream and refuses changed release, npm latest, package integrity or advisory ranges", async () => {
    upstream(); await expect(checkAgentSoftwareUpstream()).resolves.toMatchObject({ cloudBytes: 100 });
    for (const changes of [{ tag: "v1.37.6" }, { latest: "1.37.6" }, { integrity: "other" }, { advisory: "<=1.37.5" }]) { upstream(changes); await expect(checkAgentSoftwareUpstream()).rejects.toThrow(); }
    expect(atLeastVersion("1.24.0", "1.25.0")).toBe(false); expect(atLeastVersion("1.37.5-beta.1", "1.25.0")).toBe(false);
    expect((await inspectAgentSoftware(await temporary())).available).toBe(false);
  });
  it("recognizes official native npm CLI separately from an unrelated executable and reports old-version incompatibility", async () => {
    const directory = await temporary(); await fs.mkdir(path.join(directory, "bin")); const entry = path.join(directory, "bin", "claude.exe"); await fs.writeFile(entry, "not executed");
    await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.1.165", bin: { claude: "bin/claude.exe" } }));
    expect(await locateClaude(entry)).toMatchObject({ available: true, compatible: true, version: "2.1.165" });
    await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.1.84", bin: { claude: "bin/claude.exe" } }));
    expect(await locateClaude(entry)).toMatchObject({ available: true, compatible: false });
  });
  it("plans shared npm packages while refusing unknown files and preserving unrelated prefix contents", async () => {
    const directory = await temporary(), root = path.join(directory, "node_modules");
    const location = { executable: "not executed", prefix: directory, root };
    const cli = { available: true, compatible: true, path: path.join(directory, "existing-cli.js"), version: "2.1.165" };
    await fs.writeFile(path.join(directory, "unrelated.txt"), "keep");
    const plan = await planSharedAgentSoftware(location, cli);
    expect(plan.items.map((p) => p.key)).toEqual(["cloud", "sdk"]);
    const target = path.join(root, AGENT_SOFTWARE.cloud.name); await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "user-file.txt"), "keep");
    await expect(planSharedAgentSoftware(location, cli)).rejects.toThrow("未知文件");
    expect(await fs.readFile(path.join(target, "user-file.txt"), "utf8")).toBe("keep");
    expect(await fs.readFile(path.join(directory, "unrelated.txt"), "utf8")).toBe("keep");
  });
  it("reuses regular shared CloudCLI without a launcher receipt, and never duplicates a compatible external Claude", async () => {
    const directory = await temporary(), external = await temporary(), cli = path.join(external, "cli.js");
    await fs.writeFile(cli, "not executed");
    await fs.writeFile(path.join(external, "package.json"), JSON.stringify({ name: AGENT_SOFTWARE.claude.name, version: "2.1.165", bin: { claude: "cli.js" } }));
    const cloud = path.join(directory, "node_modules", AGENT_SOFTWARE.cloud.name);
    await fs.mkdir(path.join(cloud, "dist-server", "server"), { recursive: true });
    await fs.writeFile(path.join(cloud, "dist-server", "server", "index.js"), "not executed");
    await fs.writeFile(path.join(cloud, "package.json"), JSON.stringify({ name: AGENT_SOFTWARE.cloud.name, version: AGENT_SOFTWARE.cloud.version }));
    expect(await inspectAgentSoftware(directory)).toMatchObject({ cloudReady: true, sdkReady: false });
    const plan = await planSharedAgentSoftware({ executable: "not executed", prefix: directory, root: path.join(directory, "node_modules") }, await locateClaude(cli));
    expect(plan.items.map((p) => p.key)).toEqual(["sdk"]);
    expect(await fs.stat(path.join(directory, "strata-agent-software.json")).catch(() => null)).toBeNull();
    expect(await fs.readFile(cli, "utf8")).toBe("not executed");
    // A metadata-only impostor SDK is not accepted as a real harness.
    const sdk = path.join(directory, "node_modules", AGENT_SOFTWARE.sdk.name); await fs.mkdir(sdk, { recursive: true });
    await fs.writeFile(path.join(sdk, "package.json"), JSON.stringify({ ...AGENT_SOFTWARE.sdk, claudeCodeVersion: AGENT_SOFTWARE.claude.version }));
    await fs.writeFile(path.join(sdk, "sdk.mjs"), "not the official SDK");
    expect((await inspectedAgentSdk(sdk)).available).toBe(false);
    await fs.writeFile(path.join(sdk, "package.json"), JSON.stringify({ name: AGENT_SOFTWARE.sdk.name, version: "0.3.999" }));
    await expect(planSharedAgentSoftware(plan.location, await locateClaude(cli))).rejects.toThrow("未降级");
  });
  it("backs up to private new files without writing source Claude, CC Switch or Codex configuration", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "");
    const home = await temporary(), directory = await temporary();
    for (const name of [".claude", ".cc-switch", ".codex"]) await fs.mkdir(path.join(home, name));
    const original = '{"original-provider":"keep","env":{"ANTHROPIC_AUTH_TOKEN":"original"}}';
    for (const name of [".claude/settings.json", ".cc-switch/settings.json", ".codex/config.toml"]) await fs.writeFile(path.join(home, name), original);
    const backup = await backupClaudeAndSwitch(directory, "unused-tool", "unused-python", home);
    expect(await fs.readFile(path.join(backup, "claude-settings.json"), "utf8")).toBe(original);
    const manifest = await fs.readFile(path.join(backup, "manifest.json"), "utf8"); expect(manifest).not.toContain("original-provider");
    expect(await fs.stat(path.join(backup, "auth.json")).catch(() => null)).toBeNull();
    for (const name of [".claude/settings.json", ".cc-switch/settings.json", ".codex/config.toml"]) expect(await fs.readFile(path.join(home, name), "utf8")).toBe(original);
  });
  it("resolves an existing custom Claude global file rather than inventing a new session/config root", async () => {
    const directory = await temporary(); vi.stubEnv("CLAUDE_CONFIG_DIR", directory);
    expect(policy.claudeConfigFile()).toBe(path.join(directory, ".claude.json"));
    await fs.writeFile(path.join(directory, ".config.json"), "{}"); expect(policy.claudeConfigFile()).toBe(path.join(directory, ".config.json"));
  });
});
