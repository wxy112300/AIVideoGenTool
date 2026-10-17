// Exact-version source adaptation in memory. Installed packages and user files are never patched.
export function transformCloudSource(relative, input, policyUrl) {
  let source = input.replaceAll('\r\n', '\n');
  const prepend = () => {
    const header = source.startsWith('#!') ? source.indexOf('\n') + 1 : 0;
    source = source.slice(0, header) + `import * as strata from ${JSON.stringify(policyUrl)};\n` + source.slice(header);
  };
  const once = (from, to) => {
    if (!source.includes(from) || source.indexOf(from) !== source.lastIndexOf(from)) throw new Error(`CloudCLI adapter shape mismatch: ${relative}`);
    source = source.replace(from, to);
  };
  // Preserve HOME and .claude (sessions/MCP/skills/hooks/permissions); isolate GUI's own writable state.
  source = source.replaceAll("path.join(os.homedir(), '.cloudcli',", "path.join(process.env.STRATA_CLOUD_DATA_ROOT,")
    .replaceAll("path.join(os.homedir(), '.claude-code-ui',", "path.join(process.env.STRATA_CLOUD_DATA_ROOT, 'plugins-state',");
  source = source.replace(/path\.join\(os\.homedir\(\), '\.claude'([,)])/gu, (_, end) => end === ','
    ? "path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),"
    : "(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))")
    .replaceAll("path.join(dependencies.getHomeDirectory(), '.claude',", "path.join(process.env.CLAUDE_CONFIG_DIR || path.join(dependencies.getHomeDirectory(), '.claude'),");
  switch (relative) {
    case 'load-env.js':
      // Shared .env belongs to ordinary CloudCLI launches; only this process gets launcher env.
      return "if (!process.env.STRATA_CLOUD_DATA_ROOT || !process.env.DATABASE_PATH) throw Error('Missing local CloudCLI profile');\n";
    case 'index.js':
      prepend();
      once('const app = express();', 'const app = express();\napp.use(strata.httpGuard);');
      once("app.use(express.static(path.join(APP_ROOT, 'dist'), {", "app.use(express.static(path.join(APP_ROOT, 'dist'), {\n    index: false,");
      once('res.sendFile(indexPath);', 'res.type(\'html\').send(strata.guiIndex(indexPath));');
      once("status: 'ok',", "status: 'ok',\n        strataInstance: process.env.STRATA_GUI_INSTANCE,");
      once('initializeScheduledMessageDispatcher(providerRuntimeService);', '/* Strata: no automatic scheduled runs. */');
      once("startEnabledPluginServers().catch(err => {\n                console.error('[Plugins] Error during startup:', err.message);\n            });", '/* Strata: no unrelated plugin servers. */');
      break;
    case 'modules/providers/provider.registry.js':
      source = source.replace(/^import \{ (?:CodexProvider|CursorProvider|OpenCodeProvider) \}[^\n]+\n/gmu, '')
        .replace(/^    (?:codex|cursor|opencode): new \w+\(\),\n/gmu, '');
      break;
    case 'modules/providers/services/sessions-watcher.service.js': {
      const start = source.indexOf('const PROVIDER_WATCH_PATHS = [');
      const end = source.indexOf('\n];', start);
      if (start < 0 || end < 0) throw new Error('CloudCLI watcher shape mismatch');
      source = source.slice(0, start) + "const PROVIDER_WATCH_PATHS = [{ provider: 'claude', rootPath: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects') }];" + source.slice(end + 3);
      break;
    }
    case 'modules/providers/services/provider-capabilities.service.js':
      once("permissionModes: ['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan'],", "permissionModes: ['default', 'acceptEdits', 'plan'],");
      once("effortLevels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'],", 'effortLevels: [],');
      once('return PROVIDER_CAPABILITIES[provider];', "return provider === 'claude' ? { ...PROVIDER_CAPABILITIES.claude, supportsEffort: false } : undefined;");
      once('return Object.values(PROVIDER_CAPABILITIES);', 'return [{ ...PROVIDER_CAPABILITIES.claude, supportsEffort: false }];');
      break;
    case 'modules/providers/list/claude/claude-runtime.provider.js':
      prepend();
      once('function resolveContextWindow(reportedContextWindow) {\n    if (Number.isFinite(reportedContextWindow) && reportedContextWindow > 0) {\n        return reportedContextWindow;\n    }\n    return parseInt(process.env.CONTEXT_WINDOW, 10) || 160000;\n}', 'function resolveContextWindow(reportedContextWindow) { return strata.contextWindow(reportedContextWindow); }');
      once('return sdkOptions;', 'return strata.enforceSDK(sdkOptions, options);');
      once('async function queryClaudeSDK(command, options = {}, ws, context) {', 'async function queryClaudeSDK(command, options = {}, ws, context) {\n    return strata.exclusiveRun(() => strataQueryClaudeSDK(command, options, ws, context), options);\n}\nasync function strataQueryClaudeSDK(command, options = {}, ws, context) {');
      break;
    case 'modules/providers/services/provider-token-usage.service.js':
      prepend();
      once('total: contextWindow,', 'total: strata.contextWindow(contextWindow),');
      break;
    case 'modules/providers/list/claude/claude-auth.provider.js':
      once('checkInstalled() {', 'checkInstalled() { return !!process.env.CLAUDE_CLI_PATH; }\n    unusedCheckInstalled() {');
      once('async checkCredentials() {', "async checkCredentials() { return { authenticated: true, email: 'Strata local', method: 'api_key' }; }\n    async unusedCheckCredentials() {");
      break;
    case 'modules/providers/list/claude/claude-mcp.provider.js':
      prepend();
      source = source.replaceAll("path.join(os.homedir(), '.claude.json')", 'strata.claudeConfigFile()');
      break;
    case 'modules/providers/list/claude/claude-models.provider.js': {
      const start = source.indexOf('export const CLAUDE_PREDEFINED_MODELS = {');
      const end = source.indexOf('export const findClaudeModelOption', start);
      if (start < 0 || end < 0) throw new Error('CloudCLI models shape mismatch');
      source = source.slice(0, start) + "export const CLAUDE_PREDEFINED_MODELS = { OPTIONS: [{ value: process.env.STRATA_CLAUDE_MODEL, label: 'Strata local (' + (Number(process.env.CONTEXT_WINDOW || 32768) / 1024) + 'K)' }], DEFAULT: process.env.STRATA_CLAUDE_MODEL };\n" + source.slice(end);
      break;
    }
    case 'modules/websocket/services/websocket-server.service.js':
      prepend();
      once('verifyWebSocketClient(info, dependencies.verifyClient)', '(strata.allowWebSocket(info) && verifyWebSocketClient(info, dependencies.verifyClient))');
      break;
    case 'modules/websocket/services/shell-websocket.service.js': {
      prepend();
      const start = source.indexOf('function buildShellCommand(message, dependencies, projectPath) {');
      const end = source.indexOf("// Claude Code's built-in theme ids", start);
      if (start < 0 || end < 0) throw new Error('CloudCLI terminal shape mismatch');
      source = source.slice(0, start) + 'function buildShellCommand(message, dependencies, projectPath) { return strata.terminalCommand(message, dependencies, resolveResumeSessionId); }\n' + source.slice(end);
      once("if (data.type === 'init') {", "if (data.type === 'init') {\n                strata.validateTerminalInit(data);");
      once('ptySessionsMap.set(ptySessionKey, {', 'strata.trackTerminal(shellProcess);\n                ptySessionsMap.set(ptySessionKey, {');
      break;
    }
  }
  return source;
}
