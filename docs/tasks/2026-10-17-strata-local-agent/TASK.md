# 可选 Strata 本地 Agent 工具包

- Status: implementing（localhost真实GUI/CLI闭环及262144原生容量通过；LAN/原生窗口完整旅程待续）
- Updated / Owner: 2026-10-18 / 当前 agent；Execution: direct，子 agent 0。
- Scope / Authority: 用户已授权按既有PLAN继续分阶段实现：轻量独立启动器、共享安装/模型、跨进程资源交接、scratch Claude、CC Switch/CloudCLI一键闭环，localhost通过后才处理LAN。软件安装先展示目标/版本/规模/影响并显式确认；不改Codex，不打包/提交/推送/发布。
- Baseline: Local Video Studio0.65.3，`9d5c308084fc4c2c783c94d67bf66be09ad02aee`；开始时工作区干净。
- 关联：[实施计划](PLAN.md)、[调查证据](evidence/assessment.md)、[P1实现与验证](evidence/p1-validation.md)、[接线验证](evidence/wiring-validation.md)、[H3优化经验交接](evidence/h3-optimization-handoff.md)、[原H3集成](../2026-10-10-strata-prompt-integration/TASK.md)。新任务不接管旧任务的提示词质量余项。

## Resume

- 2026-10-18提交收尾：用户要求本轮代码提交推送、不发Release；三模式/0.1.45安装更新及已完成的独立监控/诊断导出一并纳入，不再受此前阶段“不提交”限制。保留0.65.4应用版本，不打包/tag/Release；同一代码完整verify与独立工具准备、组件Smoke/诊断回归已通过。另一台电脑崩溃诊断仍待实际日志，不将提交代码当作问题已治愈。

- 2026-10-18共享升级与三模式接线（由H3任务执行，用户明确授权独立工具一并调整）：保留日用监控/导出诊断改动，将uncensored改为off/builtin/community下拉、旧true迁移自带，复用0.1.45安装事务的固定社区向量。更新受管理旧目录时展示并安装到新目标，成功后只更新Agent路径/重新发现pack，不覆盖手动目录或H3偏好。证据统一放[H3本轮记录](../2026-10-10-strata-prompt-integration/evidence/strata-0145-three-modes.md)，不另开任务、不复做GUI/Claude真实长会话；本轮未启动GPU或替用户安装软件，未提交/发布。

- 故障机器已澄清（2026-10-18）：用户确认频繁掉线发生在另一台电脑，不是当前64GB验证机；尚无该机实际日志，不能归因或套用本机资源结论。已增加独立`Export-Diagnostics.cmd/.ps1`及菜单导出，不依赖Node/Controller/服务启动；查找旧版最近2份操作/3个run日志、受限尾部、严格白名单运行选项、当前真实内存/提交/显存，保存私有本机JSON并显示/打开目录，不上传、不取凭证/会话。旧版缺server.log的证据缺口明确报告。实际Windows文件/ACL/脱敏/偏好异常夹具与WinForms布局检查通过，未加载模型；待那台电脑更新本轮文件、导出已有日志或复现后导出。

- 2026-10-18用户日用缺陷修复（Patch，未提交）：确认固定宽度/强制增高会裁切控件，且UI没有持续读取服务状态。已改主操作固定、设置滚动、可见连接/密钥/日志入口；两秒只读监控区分进程退出、HTTP失联、模型卸载、GUI退出，短暂故障可恢复状态而不重放工具。资源保护/探针失败保留原因、最近资源及本轮server.log/engine.log定位；Agent显式FILE_RELEASE=0，与H3回退一致。720×540/1000×720长状态布局检查、实际Python HTTP+guard的126058ms CPU脚本等待/124次采样和退出记录通过，**不是GPU/真实Agent耐久通过**。本机仅有10月17日旧测试日志，用户已确认故障在另一台电脑，对应日志待取；无法宣布其崩溃根因已解决。原生鼠标工具连续初始化失败，高DPI/焦点未验。细节与最终回归见[日用故障修复证据](evidence/daily-use-recovery.md)。不启动重模型、不改H3阈值/分页文件/原provider/权限。

- 0.65.4代码版本收尾（2026-10-18）：用户明确授权将仓库全部代码含独立Tools/Strata-Agent一并提交推送，覆盖此前不提交的阶段限制；不打包、tag或GitHub Release。复用整合后verify2069单元/88集成/类型构建及20对比度证据；本轮仅版本与文档核对，不启动GPU或安装软件。H3后续已采用独立分模式保护，资源/蓝屏边界以H3任务最新摘要为准；本任务原生窗口/LAN等未验范围不因提交代码而变成完成。

- 当前阶段：localhost服务链与真实GUI/CLI闭环通过；32K基础scratch八轮、64K GUI、128K/262144原生长输入及官方CLI同session恢复通过。日用默认Strata262144，Claude客户端保守200000，折叠设置保留32K/64K/128K。LAN尚未实现首次安全启用，不能称整个任务完成。
- 授权/安装：用户明确确认npm共享安装并更新Claude、允许释放内存后实测。使用现有npm prefix，本机`%APPDATA%/npm`；CloudCLI1.37.5、SDK0.3.165、官方Claude2.1.165及Windows平台包已安装复检，旧2.1.84与命令入口先备份，安装168874ms。再次doctor安装计划为空，不重复安装。SDK可选平台CLI由npm带入，保留共享依赖树但运行时禁用回退；软件及配置不混放。
- 实际P1/P2：独立scratch八轮共203840ms，Read/Write/Edit、Bash/git diff、Plan、权限拒绝、多轮、取消和resume通过。最低RAM2.60GiB、提交7.94GiB、VRAM3.91GiB，现机63.8GiB RAM/4090，绝非128GB。保留配置类型错误、RAM门禁/驻留断言中止、部分回合通过和GUI首轮多换行等失败证据；没有在真实工程试验或提交scratch。
- 逐档实际：64K GUI整链85764ms，真实Read/Write、Allow once、9字节输出、CLI→GUI原session续聊（实际提示35270 tokens）通过，最低RAM2.31/提交8.13/VRAM3.93GiB。128K引擎102630ms、原生80089-token输入42230ms，最低1.70/8.02/4.13GiB。262144引擎67744ms、原生220090-token输入105835ms，最低2.14/7.98/4.10GiB。原生重复文字/首部标记容量探针不是复杂工程质量或Claude220K工具会话；客户端充分利用262144和实际compact仍未验。
- 最终日用路径：不传实验commit/context覆盖，73929ms启动Strata+CloudCLI，按偏好返回GUI43128与原生43127两个无key地址。GUI在同一原CLI session真实Read→Write→Bash `git diff --stat`，一次许可后文件11字节严格等于`DEFAULT_OK`加LF；SDK/GUI双向恢复过同session。276个快照最低RAM2.88/提交7.96/VRAM4.00GiB。GUI used37034/total200000；修复冷启动无SDK报告时预算误显262144后，真实GUI组件负测401/200000预算/DPAPI密文不变通过（该组件检查不加载模型）。
- 资源策略：Agent显示并接受官方文件回读，42GiB提交准入不再误用完整驻留约59.6GiB；固定k8v4/MTP/auto专家缓存，262144实际4943槽/8.02GiB GPU专家缓存，官方按commit选择host补集。实时RAM/提交/显存、有界重测和危险压力停止保留；H3原32K/完整驻留门槛不变，不改分页文件。262K紧接128K时曾因RAM31.55GiB不足被拒，前一自有Job收回、RAM恢复后相同门槛重试通过，未关其他程序。
- 路径/界面/安装：WinForms主界面模型/uncensored/LAN/启动/停止，设置折叠、次要操作菜单；doctor只填空路径、保留手选及异步期间新编辑，安装后复检。标准npm逐包目标/版本/规模/影响确认，兼容项复用，未知文件/npm link/使用中包拒绝覆盖。新GUI账号可真实点击跳过全局Git配置，全局Git文件不变。原生WinForms鼠标/DPI/焦点及开页Shell动作尚未验，不能用浏览器CDP冒充；Node/Git/CC Switch缺件完整向导、实际安装取消/失败重试/修复仍待补/验，本机已存在这些基础软件。
- 归属/兼容：真实另一Studio进程申请被拒，没有中止Agent；完整H3按钮/队列交接旅程仍待验。H3配置/日志/缓存与Agent隔离，GUI/CLI共用Claude项目/sessions/MCP/skills/hooks/permissions。原Claude settings、CC Switch settings/全部13行provider、Codex config/auth与基线一致；Claude全局仅官方CLI的migrationVersion变化，不盲目恢复覆盖历史。CC Switch仅读/备份/可选JSON，不写SQLite或切provider；本工具停止后普通Claude仍沿用原路由。
- 最终检查：focused6文件87项、typecheck；完整verify221文件2065单元、6文件88集成、干净构建和20项对比度全部通过。固定共享CloudCLI的19文件hash/转换语法、真实Node loader与共享SDK绑定检查通过（该静态probe求值前替换上游，不冒充服务成功）；WinForms/supervisor AST另检查。
- 清理/下一步：本次所有自有Strata/GUI/CLI/MCP/浏览器和临时路由已停止/回收，43127/43128与GPU租约释放；共享软件、权重、稳定DPAPI token、会话及备份保留。测试门控stdin保活已修复，后续Job正常退出。剩余原生窗口/H3完整旅程、uncensored效果、冷重载、长时间工具耐久/compact、客户端更大窗口和LAN首用安全阶段；不改防火墙/证书信任或网络设施。未打包、bump、tag、暂存、提交、推送或Release，子agent0。

## 安全与验证

- Codex App／CLI保留官方OpenAI配置，不改其文件、凭证及CC Switch的Codex provider／代理。本机配置声明默认provider，未另作网络请求验证。
- Claude／CC Switch默认不持久修改。可选备用JSON仅在菜单明确确认后先备份，SQLite用只读连接在线backup；不裸拷活动库、不写源DB、不使用含token的deeplink。用户自行添加备用provider时保留原项为当前；若用户另行手动选中本地provider，停服务后该项会不可用，不冒充自动云回退。保留MCP／hooks／plugins／skills／permissions／CLAUDE.md／项目历史。
- 第一阶段localhost；不登录Anthropic／Claude.ai／CloudCLI Cloud，不启用bypass，不改路由／VPS／NAS／Tailscale／Headscale／UPnP。LAN是后续显式启用阶段。
- 区分“无Anthropic推理计费”和“全栈离线”；MCP／hooks／遥测／网络工具可能另有外联，逐项验证，不作不存在的离线保证。
- 早期接线验证曾为28项focused及2044项单元，后续共享改造的最新证据以Resume和evidence新增节为准；首次全量误收集临时上游测试的失败记录保留。上游源码已隔离到默认排除的node_modules缓存，未改测试发现规则。
- 早期P1进程/mock证据与本轮真实GPU/工具证据分开：早期曾在加载前被拒，不覆盖当前32K八轮和64K GUI实际结果。WinForms鼠标/DPI/焦点仍未验；当前具体资源归属/清理和更高档结论以Resume及接线evidence最后新增节为准。
- 并行资源监测任务已完成并释放共享源码/build，证据记录221文件2058项单元、6文件88项集成及构建/对比度通过；本任务没有代为重跑。后续AgentController已接入有界重测（见本轮首段），admission/guard/取消语义仍需真实长任务验收，不自动重放工具。早前协调仅更新状态未启动服务；见[协调答复](evidence/resource-watch-coordination.md)。
