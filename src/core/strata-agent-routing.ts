/** Process-local routing; no user/project settings or caller environment writes. */
export function localClaudeRoute(parent: Record<string, string | undefined>, token: string, port: number, model: string, contextTokens = 32768) {
  if (![32768, 65536, 131072, 262144].includes(contextTokens)) throw new Error("本地 Agent 上下文档位无效。");
  if (!token || /[\r\n]/u.test(token) || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 8080 || !model) throw new Error("本地 Claude 路由无效。");
  const env = { ...parent };
  const routing: Record<string, string> = {};
  for (const key of Object.keys(parent)) {
    if (/^(?:ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH|CLAUDE_CODE_SUBAGENT_MODEL)/iu.test(key)) routing[key] = "";
  }
  Object.assign(routing, {
    ANTHROPIC_API_KEY: token, ANTHROPIC_AUTH_TOKEN: "", CLAUDE_CODE_OAUTH_TOKEN: "", ANTHROPIC_CUSTOM_HEADERS: "",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_MODEL: model, ANTHROPIC_SMALL_FAST_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model, ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    CLAUDE_CODE_USE_BEDROCK: "0", CLAUDE_CODE_USE_VERTEX: "0", CLAUDE_CODE_USE_FOUNDRY: "0",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(Math.min(contextTokens, 200000)),
    HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", http_proxy: "", https_proxy: "", all_proxy: "",
    NO_PROXY: "127.0.0.1,localhost,::1", no_proxy: "127.0.0.1,localhost,::1"
  });
  Object.assign(env, routing);
  return { env, settings: { env: routing, apiKeyHelper: "", model } };
}

export function assertLocalPermissions(options: { permissionMode?: string; toolsSettings?: { skipPermissions?: boolean } }) {
  if (options.toolsSettings?.skipPermissions || ![undefined, "default", "plan", "acceptEdits"].includes(options.permissionMode))
    throw new Error("本地 Agent 不允许 bypassPermissions 或跳过权限检查。");
}
