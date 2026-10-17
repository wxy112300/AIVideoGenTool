# 本地 Agent 接入：只读调查

- 类型：Evidence；日期：2026-10-17；状态：static-assessed / runtime-unverified。
- 基线0.65.3／`9d5c308`，开始时干净。仅读取配置安全字段／结构、公开源码／metadata，不输出token、完整provider或历史正文。

## 本机事实

| 项目 | 实读 | 边界 |
| --- | --- | --- |
| Claude | 2.1.84，npm shim→包内cli.js | version／help，未推理 |
| Node／npm | 24.16.0／10.2.4 | 未安装GUI或native依赖 |
| CC Switch | exe ProductVersion3.20.0，ccswitch URL已注册 | 未开GUI或导入 |
| Claude settings | AUTH_TOKEN、远端HTTPS BASE_URL、主模型与Haiku／Sonnet／Opus／reasoning映射 | 未记key／第三方域名；顶层未见hooks／permissions／enabledPlugins，不代表所有项目没有 |
| Claude global | `.claude.json`有Chrome DevTools MCP、1条项目状态；projects有4个项目目录 | 未读会话正文，不把目录数当会话数 |
| CC Switch库 | settings.json和SQLite存在；只读schema／数量，Claude provider4个 | 未读取凭证列或写库 |
| 代理 | enableLocalProxy偏好true；Claude／Codex记录enabled、takeover、failover均false，loopback7890 | 偏好true不代表代理运行；不能改全局影响Codex |
| Codex | config.toml／auth.json存在；未声明自定义provider／provider表 | 配置默认，不是新网络连通验证；未修改 |
| Studio | 端口43127，Strata路径空→自动发现；默认prompt仍Qwen3.6 27B | 不切默认模型 |
| Strata | 受信0.1.44.1／296b59d2，保留旧0.1.41；python／engine存在 | 未更新／重装／setup／GPU加载 |
| 模型 | 共享IQ3两分片、mmproj、MTP存在，stat字节符合catalog | 未再SHA大权重；不证明派生pack／GPU可用 |
| 硬件 | 4090 24564MiB、RAM63.8GiB；快照free RAM28.7GiB／VRAM22449MiB | 不是参考方案128GB，快照不代替准入 |
| 监听 | 43127／43128／43129／3001／8080当时无监听 | 未请求未知8080；无HTTP Messages实测 |

路径按现行管理器发现：`%LOCALAPPDATA%/Local Video Studio/strata/<version-revision>`；模型仍在所选ComfyUI模型根`LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`。不记录私有绝对机器路径。

默认strata/data未找到完成pack；受信安装下排除venv／engine／downloads的有界检查也未见完成receipt。不能据此断言其他实验目录不存在，更不能自动重建／重哈希。

CLI帮助支持settings、setting-sources、permission-mode、model。源码仅检查变量标识：禁非必要流量、DISABLE_TELEMETRY、AUTO_COMPACT_WINDOW、DISABLE_1M_CONTEXT存在，MAX_CONTEXT_TOKENS未见。标识不证明覆盖优先级或行为已验。

## 项目与官方依据

1. 项目catalog固定0.1.44.1／43127；`strata-model-preparation.ts`绑定policy与artifact receipt；H3当前32K。`strata-runtime-owner.ts`／`strata-service.ts`是应用进程内owner，尚无跨进程租约。Monitor有Electron注入认证和只读保护，不能直接用于默认浏览器完整管理页。
2. [固定Strata DETAILS](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/DETAILS.md)及[server源码](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/serve/server.py)：官方支持Claude的Anthropic接口、客户端识别model ID、fit输出cap与on_request思考。已装server静态可见/v1/messages、count_tokens及三种API dialect；无需为0.1.17门槛升级，但不等于真实工具调用通过。
3. [CloudCLI stable1.37.4](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.4)：2026-10-09T12:20:28Z，调查时GitHub latest非draft／prerelease，npm latest相同且有integrity。[package](https://github.com/siteboon/claudecodeui/blob/v1.37.4/package.json)为AGPL-3.0-or-later，Agent SDK依赖^0.3.165；[README](https://github.com/siteboon/claudecodeui/blob/v1.37.4/README.md)要求Node22+，可发现现有会话。[server](https://github.com/siteboon/claudecodeui/blob/v1.37.4/server/index.ts)默认HOST0.0.0.0／端口3001，须显式限制。
4. [auth provider](https://github.com/siteboon/claudecodeui/blob/v1.37.4/server/modules/providers/list/claude/claude-auth.provider.ts)识别环境／settings的Auth Token或API Key。[runtime](https://github.com/siteboon/claudecodeui/blob/v1.37.4/server/modules/providers/list/claude/claude-runtime.provider.js)用SDK query、原session ID、user／project／local设置及独立权限；[Windows路径解析](https://github.com/siteboon/claudecodeui/blob/v1.37.4/server/shared/claude-cli-path.ts)接受显式JS入口，未找到本机CLI可能回退SDK内置CLI。当前JS版应显式指定并实测SDK兼容。
5. [auth middleware](https://github.com/siteboon/claudecodeui/blob/v1.37.4/server/modules/auth/auth.middleware.ts)有OSS JWT验证及独立platform分支；不用后者绕认证。[WS／RCE公告](https://github.com/siteboon/claudecodeui/security/advisories/GHSA-gv8f-wpm2-m5wr)影响<=1.24.0，修复1.25.0；[Git用户注入](https://github.com/siteboon/claudecodeui/security/advisories/GHSA-7fv4-fmmc-86g2)与[Git端点注入](https://github.com/siteboon/claudecodeui/security/advisories/GHSA-f2fc-vc88-6w7q)修复1.24.0。版本下限不等于未来安全保证，LAN前重查。
6. [CC Switch3.20.0 README](https://github.com/farion1231/cc-switch/blob/v3.20.0/README.md)与[该版parser](https://github.com/farion1231/cc-switch/blob/v3.20.0/src-tauri/src/deeplink/parser.rs)支持v1/import provider与SQLite存储；不能套最新4.x导入字段，不写库或自动升级。
7. [Claude设置](https://code.claude.com/docs/en/settings)、[变量](https://code.claude.com/docs/en/env-vars)、[模型窗口](https://code.claude.com/docs/en/model-config)在线文档含明显高于本机2.1.84能力，按本机feature probe处理。换配置根会改变history／settings／plugins，客户端声称窗口不能作为服务器容量。
8. [Desktop localServer](https://github.com/siteboon/claudecodeui/blob/v1.37.4/electron/localServer.js)读marker／显式URL并可选端口自启，存在双runtime风险，Web通过后再验。
9. [MDN PWA安全连接](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Secure_connection)：LAN HTTP不属于localhost安全上下文例外；主屏入口和完整PWA／service worker分开验。本轮不装TLS或信任证书。

## 方法与未运行项

已执行git状态、harness list／guide prompt、CLI／Node／npm版本及帮助、脱敏JSON／SQLite只读schema和计数、协议注册／exe版本、安装receipt／模型stat、RAM／nvidia-smi／监听快照、官方源码／GitHub release／npm metadata查询。

未创建备份目录，未改Claude／CC Switch／Codex／Studio配置，未安装CloudCLI／SDK、未启动服务／模型／队列，未改防火墙或网络。只有计划文档／索引改动，不跑生产测试／build／GPU；无自有运行进程需清理。真实无登录、工具、取消、资源交接、GUI／LAN与回滚均待阶段验收。
