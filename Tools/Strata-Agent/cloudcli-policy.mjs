// Versioned CloudCLI compatibility boundary; upstream GUI and Claude Agent SDK remain the harness.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function claudeConfigFile() {
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const legacy = path.join(config, '.config.json');
  return fs.existsSync(legacy) ? legacy : path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), '.claude.json');
}

let active = 0;
const terminals = new Set();
const state = () => process.send?.({ type: 'strata-activity', active, terminals: terminals.size });
export function assertPermissions(options = {}) {
  if (options.toolsSettings?.skipPermissions || ![undefined, 'default', 'plan', 'acceptEdits'].includes(options.permissionMode))
    throw new Error('Strata: bypassPermissions / skip-permissions is disabled.');
}
export function contextWindow(reported) {
  const configured = Number(process.env.CONTEXT_WINDOW || 32768);
  if (![32768, 65536, 131072, 262144].includes(configured)) throw new Error('Strata: invalid context window.');
  const ceiling = Math.min(configured, 200000); // The selected unmodified Claude model declares 200K.
  return Number.isFinite(reported) && reported > 0 ? Math.min(ceiling, reported) : ceiling;
}
export function enforceSDK(sdk, options) {
  assertPermissions(options);
  if (!process.env.CLAUDE_CLI_PATH || !fs.statSync(process.env.CLAUDE_CLI_PATH).isFile()) throw new Error('Strata: selected Claude CLI is missing; SDK fallback is disabled.');
  if (!process.env.STRATA_CLAUDE_SETTINGS || !fs.statSync(process.env.STRATA_CLAUDE_SETTINGS).isFile()) throw new Error('Strata: private route is unavailable.');
  // A FILE path, never inline JSON: the SDK passes --settings on the CLI command line.
  sdk.settings = process.env.STRATA_CLAUDE_SETTINGS;
  sdk.env = { ...process.env };
  sdk.pathToClaudeCodeExecutable = process.env.CLAUDE_CLI_PATH;
  sdk.model = process.env.STRATA_CLAUDE_MODEL;
  sdk.permissionMode = options.permissionMode || 'default';
  sdk.allowDangerouslySkipPermissions = false;
  delete sdk.effort;
  return sdk;
}
export async function exclusiveRun(work, options) {
  assertPermissions(options);
  if (active || terminals.size) throw new Error('Strata: another Agent task or terminal is active. Finish/cancel it first; it has not been interrupted.');
  active++; state();
  try { return await work(); } finally { active--; state(); }
}
export function trackTerminal(terminal) {
  terminals.add(terminal); state();
  terminal.onExit(() => { terminals.delete(terminal); state(); });
}
export function validateTerminalInit(data) {
  if (data.bypassPermissions || data.forceRestart || data.initialCommand || (data.provider && data.provider !== 'claude'))
    throw new Error('Strata: only the selected local Claude terminal is supported; login, other providers and force-restart are disabled.');
  // Existing terminal reconnect is allowed. New shells must not overlap a GUI run.
  if (active) throw new Error('Strata: finish/cancel the active GUI task before opening a terminal.');
}
export function terminalCommand(message, dependencies, resolveSession) {
  validateTerminalInit(message);
  const session = resolveSession(message, dependencies);
  if (session && !/^[a-zA-Z0-9_.\-:]+$/u.test(session)) throw new Error('Invalid session ID');
  if (terminals.size) throw new Error('Strata: an existing terminal is still active; reconnect to it or close it first.');
  const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const cli = process.env.CLAUDE_CLI_PATH;
  if (!cli) throw new Error('Selected Claude CLI missing');
  const command = /\.[cm]?js$/iu.test(cli) ? `& ${q(process.execPath)} ${q(cli)}` : `& ${q(cli)}`;
  return { command: `${command} --settings ${q(process.env.STRATA_CLAUDE_SETTINGS)} --model ${q(process.env.STRATA_CLAUDE_MODEL)} --permission-mode default${session ? ` --resume ${q(session)}` : ''}`, claudeFollowsAppTheme: false };
}
export function allowWebSocket(info) {
  return info.origin === process.env.STRATA_GUI_ORIGIN && ['/ws', '/shell', '/desktop-notifications'].includes(new URL(info.req.url || '/', 'http://localhost').pathname);
}
export function guiIndex(filename) {
  const html = fs.readFileSync(filename, 'utf8');
  if (!html.includes('</head>')) throw new Error('CloudCLI HTML entry is incompatible.');
  return html.replace('</head>', '<script defer src="/strata-local-onboarding.js"></script></head>');
}
export function httpGuard(req, res, next) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (host !== new URL(process.env.STRATA_GUI_ORIGIN).host || (origin && origin !== process.env.STRATA_GUI_ORIGIN))
    return res.status(403).json({ error: 'Strata: loopback origin required.' });
  if (req.method === 'GET' && req.path === '/strata-local-onboarding.js') {
    res.setHeader('Cache-Control', 'no-store');
    return res.type('application/javascript').send(fs.readFileSync(new URL('./cloudcli-onboarding.js', import.meta.url), 'utf8'));
  }
  if (/^\/api\/(?:system|plugins|browser-use|browser-use-mcp|scheduled-messages|agent|voice|taskmaster)(?:\/|$)/u.test(req.path))
    return res.status(409).json({ error: 'Strata: this optional CloudCLI service is disabled in the local Agent profile.' });
  next();
}
