# Claude / CloudCLI 接线验证

- 类型：Evidence；日期：2026-10-17；唯一状态入口：[TASK](../TASK.md)。本文件记录接线及开发验证，不代表P1/P2/P4真实闭环通过。
- 最新用户指示：先接线，暂不启动产品服务或真实Agent测试；释放内存后再测。可控制旧Claude更新，但普通Claude与CC Switch当前provider必须保留原后端。
- 本轮未运行npm安装/重建、真实Strata/CloudCLI/Claude、Electron或GPU模型；未导入provider、备份真实用户配置、生成日用token、改Codex、网络设施或分页文件。只下载官方元数据/软件源码供审核，测试使用隔离fixture和进程mock。

## 实现边界

1. 主按钮已连接完整启动事务，不再固定抛占位错误。所有依赖和端口先检，取得GPU租约后走已有独立Strata加载，再启动GUI并检查实例nonce、监听PID及127.0.0.1绑定；最后按偏好开GUI/原生页。任一阶段失败逆序清理。运行中选项需“应用并重启”，不热改活跃任务。
2. 默认不写Claude全局/项目路由，不切CC Switch。仅本工具子进程环境与ACL临时settings文件覆盖BASE_URL/认证/主及helper模型；清理该子进程的旧OAuth/云平台/代理冲突。HOME和已有CLAUDE_CONFIG_DIR保留；GUI会话、skills、MCP、权限视图适配同一根。真实CLI内部优先级/网络路由仍待scratch证明。
3. CloudCLI固定1.37.4，SDK0.3.165声明Claude2.1.165。现机全局Claude2.1.84未动。已有兼容官方CLI>=2.1.165复用；不足时准备私有官方2.1.165原生包，跳过SDK内置CLI及其他可选包，显式pathToClaudeCodeExecutable，缺失即报错。实际版本兼容性尚未运行验证，不能把SDK声明当兼容测试。
4. 私有安装先展示目标/版本/规模/影响，确认后执行；前后重核官方release、npm latest、包integrity和3份公告的漏洞/修复范围。CloudCLI主包5,965,591字节、解压约16.7MiB；私有Windows x64 CLI解压约229MiB，其余传递依赖完整大小未知。依赖锁保留；未知非空目录拒绝修改，原可用安装保留，激活失败尝试恢复原位置。修复菜单可重建私有软件，不把待替换安装内部的CLI误当外部可复用路径。
5. GUI使用上游Web UI及Claude Agent SDK，没有自建聊天客户端。版本固定的内存loader审核19个官方文件hash；只注册Claude provider和监听，正常本地账号/JWT，限制HTTP/WS Origin，隔离GUI数据库/附件/插件状态。禁自动插件服务器/定时运行/browser附加服务。default/Plan/acceptEdits保留，bypass/skip/auto及强制重启拒绝；同一时刻一个GUI任务或本地Claude终端，已有任务不被替换。
6. GUI由PowerShell supervisor持有独立Windows Job；Node在Job接管和无BOM UTF-8握手后才导入上游。CLI/终端/MCP后代随Job回收。停止GUI前总是确认，活动状态未经真实验证时不冒充空闲。GUI清理失败仍继续停自有模型，未确认资源保留租约并可重试。新嵌套Job完整运行链仍待验。
7. CC Switch只检测/可选打开，不自动导入或切换、不写SQLite。明确菜单确认后才执行私有备份，SQLite使用只读在线backup，再复制3.20.0支持的GUI JSON备用配置；不用含key的deeplink。建议备用项不设为当前；用户自行选中本地项后停服务会不可用，这不是自动恢复原provider的承诺。
8. 无开发依赖时可用Node内置TypeScript转换器准备controller，另有仓库tsc路径；两者均不需要启动/构建Electron。Node/Git/CC Switch缺件的完整自动安装向导仍待补，当前机器已有这些软件。LAN关闭，context仍只放32K门禁，262K没有放行开关。

## 实际开发检查

- focused：`tests/strata-agent.test.ts`、`strata-agent-wiring.test.ts`、`strata-agent-controller.test.ts`共28项通过。覆盖父环境不变、私有路由、CLI身份/版本、settings文件而非内联key、权限拒绝、并发不打断、Origin、元数据变化阻断、原配置备份不修改、启动失败回收和停止确认/失败重试。产品启动入口均为mock；备份/DPAPI仅临时fixture。
- 最终`npm.cmd run verify`：单元221文件/2044项，19.70秒；集成6文件/88项，3.01秒；typecheck、干净构建和20项对比度通过。既有jsdom scrollTo及>500kB chunk提示保留。这是测试套件耗时，不是Agent性能。
- `node Tools/Strata-Agent/verify-source.mjs <CloudCLI包目录>`：19个公开源码hash、接点和转换后语法通过；真实Node loader接点也验证，但上游入口在求值前由测试hook完整替换，没有启动上游服务或CLI。检查发现并修复shebang前插import及Windows绝对路径不能直接用于`--import`（改file URL），并核Windows路径大小写。
- 最终WinForms/supervisor PowerShell AST解析通过，没有运行窗口或supervisor；C#Job代码编译通过，没有为本轮实例化Job。Node内置转换及独立tsc编译均通过；内置转换器的experimental提示保留。
- 首次完整回归错误收集了临时解包中的上游测试，178文件失败，含部分上游node:test纯逻辑输出；未安装上游依赖来迁就它们。将本任务下载源码移到默认排除的临时node_modules缓存后完整复跑通过，未改仓库测试发现规则。不能把该次失败省略，也不能把随后静态检查描述成全轮从未求值任何上游测试模块。
- 一次单测fixture对原生包名称做前缀匹配错误，已改为包名/版本完整匹配；最终全量结果包含修正后的检查。

## 暂缓和清理

- 用户释放内存并恢复启动测试后：先展示实际缺件计划/确认安装，完成真实32K独立Strata启停及H3按钮/队列交接，再在独立scratch验读写文件、shell、git diff、Plan、deny、5–10轮工具、取消/resume；逐轮记录实际耗时与RAM/Windows commit/VRAM。之后验GUI/CLI同native session、普通Claude路由前后基线及CC Switch可选导入，最后LAN。
- 当前机器是RTX4090/约63.8GiB RAM，不是128GB。上次P1的可用RAM27.9GiB、提交余量约25GiB是历史负测快照，本轮未重新加载或据此放行。64K/128K/262K、工具质量、完整权限/MCP/hooks语义、UI点击/DPI、安装取消/修复和新GUI Job运行清理均未验。
- 回归结束后43127/43128无监听，未见匹配本工具/临时上游测试的Node/Python/PowerShell进程，日用GPU owner记录不存在。测试fixture已删除；源码审核缓存、回归日志、C#检查DLL和.runtime留在忽略目录。未清理用户程序或共享权重。
- 17:15收到并行资源任务协调后，已停止对共享service/资源文件的写入及build；其后探针/策略变更由该任务验证，不能用本文件17:09回归冒充新状态通过。见[文件归属答复](resource-watch-coordination.md)。
- 后续已收到并核对资源任务完成证据，源码/build归属释放；其最终verify为221文件2058项单元及6文件88项集成通过。AgentController仍有独立raw采样循环，未自动继承H3的有界复测；本任务本次没有改实现或重跑测试，待后续结合guard/取消单独验证。

## 官方身份来源

- [CloudCLI v1.37.4 release](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.4)、[npm包元数据](https://registry.npmjs.org/@cloudcli-ai/cloudcli/1.37.4)。
- [Agent SDK0.3.165元数据](https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.165)、[Claude2.1.165元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.165)、[Windows x64原生包](https://registry.npmjs.org/@anthropic-ai/claude-code-win32-x64/2.1.165)。SDK自身d.ts确认settings文件与显式CLI路径接口；本机2.1.84源码确认apiKeyHelper/schema及提前compact窗口标识，未调用该CLI。
- [CloudCLI安全公告](https://github.com/siteboon/claudecodeui/security/advisories)：GHSA-7fv4-fmmc-86g2、GHSA-gv8f-wpm2-m5wr、GHSA-f2fc-vc88-6w7q；禁止<=1.24.0，公告变化需重新审核。

## 19:20 恢复测试与用户缺陷修复

- 用户已授权恢复真实测试；首次32K真实controller尝试1701ms，在任何pack/权重加载前因提交余量44.9GiB低于当前策略59.6GiB拒绝，RAM约40.0GiB已满足35.6GiB预算，空闲VRAM21.4GiB。没有生成/工具调用结果，不能视为Agent接入成功。未调整分页文件，停止后两个产品端口无监听、GPU租约记录不存在。
- doctor原来返回原始空路径偏好，现只回填空选择器，保留显式手选；UI用请求快照合并，检测/安装期间的新编辑保留，安装完成自动复检。真实离线doctor返回了现机安装/模型/CLI/CC Switch/私有软件目标，pack仍空，符合未准备事实。纯函数回归覆盖空字段和手选保留；UI自动化工具因沙箱初始化失败，真实按钮点击/DPI尚未验收。
- 用户19:06/19:07安装失败日志均止于installationPlan，未开始安装：官方[1.37.5](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.5)于2026-10-17 08:38:22 UTC发布，GitHub/npm latest一致，使旧1.37.4锁被安全拒绝。对新tgz核SRI，19个保护文件中4个变化：utils增加非turn消息判断、token usage和Claude runtime增加SDK上报窗口处理、plugin registry增加git错误处理；插件入口仍禁用，原Claude SDK/CLI接点不变。19文件新hash/形状/生成语法/实际Node loader接点通过（上游仍被替换而未启动）。SDK声明和三份公告/修复范围不变。新版CloudCLI主包6059896字节、解压17915873字节，SDK0.3.165/CLI2.1.165保持独立锁。
- 真实缺件计划已成功产生并交用户明确确认：私有CloudCLI1.37.5/SDK0.3.165/Claude2.1.165；原CLI2.1.84保留。尚未收到确认，因此没有执行npm安装，安装取消/重试/原生模块构建不能宣称已通过。错误原因提示只返回已识别静态原因，不复制含URL/凭证的原始输出；原始npm日志留在受保护失败目录。
- AgentController预检/加载前改用可靠新鲜复测，运行admission最多6秒复测，低于原生guard的8秒新鲜度；取消/停止中止探针并等待清理。硬安全线不变，重试不自动重放Agent工具。实机长任务/瞬时恢复未验证。
- 完整verify（错误提示补丁前）：221文件2059项单元、6文件88项集成、typecheck/干净构建/20项对比度通过。错误提示补丁后相关30项及typecheck通过；独立controller编译、PowerShell AST通过。配置基线比对Claude settings/global、CC Switch settings和Codex config均一致，未读取/改写其凭证或provider。
- [CC Switch3.20.0 ProviderForm](https://github.com/farion1231/cc-switch/blob/v3.20.0/src/components/providers/forms/ProviderForm.tsx)、[AddProviderDialog](https://github.com/farion1231/cc-switch/blob/v3.20.0/src/components/providers/AddProviderDialog.tsx)、[deeplink parser](https://github.com/farion1231/cc-switch/blob/v3.20.0/src-tauri/src/deeplink/parser.rs)。这里只核对支持入口，没有执行导入或写库。

## 共享软件改造与真实安装（用户确认后执行）

- 用户明确拒绝专属软件目录，要求Claude/CloudCLI等为共享软件；后续明确确认npm共享安装和Claude更新。实现改为发现标准npm prefix（本机`%APPDATA%/npm`）或手选位置，正常npm包无需本工具receipt/private lock。配置/token/GUI数据/日志/恢复资料仍隔离，不改变共享软件的普通入口。
- 实际安装CloudCLI1.37.5、Agent SDK0.3.165、Claude Code2.1.84→2.1.165及Windows x64平台包，耗时168874ms。四个直接tgz在任何npm写入前校验固定SRI，下载合计约78.7MiB（Cloud6059896、SDK1250786、Claude入口17353、平台包75209633字节）；传递依赖另由npm解析。旧Claude包及claude/cloudcli现有命令入口先备份，位于启动器本机`installations/<id>`恢复记录。未为本工具创建另一份活动私有Claude，未下载模型。
- 实际共享命令`claude.cmd --version`返回`2.1.165 (Claude Code)`。从CloudCLI实际依赖树加载better-sqlite3并执行内存`select 1`、加载node-pty addon、bcrypt hash/compare均通过；PTY仅加载addon，没有终端交互/Agent工具执行。真实doctor发现所有软件；再次生成安装计划`items=[]`，不重复安装已兼容项。
- 实机npm带入了SDK可选Windows平台包及原生CLI，先前“不安装SDK内置CLI”承诺不准确；已修正实现注释/确认文案/文档，保留常规共享依赖结构而非删除破坏其他使用者。启动器明确选用共享官方Claude的`bin/claude.exe`，SDK绑定共享0.3.165且入口SHA256核对，禁用默认CLI回退。共享CloudCLI实际源码19个hash、转换语法、Node loader及跨目录SDK解析通过；上游/SDK模块在求值前替换，不算真实GUI/Agent成功。
- 共享源码不修改，普通CloudCLI仍用原.env/配置；只有本工具进程的load-env模块被内存替换并使用独立运行数据。普通Claude不持久切provider，本工具子进程单独设路由。安装前后Claude settings/global、CC Switch settings、Codex config的SHA256一致；未操作CC Switch SQLite、登录云账号或放宽权限。
- 共享计划逐包展示旧→新/目标/已知及未知规模，已有兼容项跳过、更高未适配版本不降级、同名未知文件/npm link拒绝覆盖，正在使用的目标包拒绝更新。实际安装阶段的CIM空闲检查通过，未停止其他进程。代码提供下载字节/15秒npm耗时反馈、取消、每次npm20分钟上限；后续原生rebuild限定CloudCLI依赖树。此次完整安装通过，但真实取消/失败重试/修复/备份恢复未测试，不宣称npm全局更新为原子事务。
- 共享安装后实际`start`事务已通过依赖/适配器预检，4308ms后因提交余量约44.8GiB低于59.6GiB预算而拒绝重权重准备/加载；RAM约39.9GiB满足35.6GiB预算，VRAM约21.3GiB空闲。没有模型/Agent结果，没有scratch工具调用数据；不更改分页文件或降低安全线。停止后43127/43128无自有监听，GPU owner不存在。
- 最终相关31项通过，完整verify：221文件2061项单元、6文件88项集成、typecheck/干净构建和20项对比度通过。既有jsdom scrollTo/chunk提示保留。WinForms/supervisor AST解析通过；原生UI自动化工具仍因沙箱初始化失败而未完成真实点击/DPI。没有打包/tag/提交/推送/Release。

## 真实32K加载、官方Claude工具与GUI边界

- 用户明确授权实机验证。现机仍是63.8GiB RAM、4090 24GiB；不能把128GB机器经验代入。本轮不改分页文件、不下载权重，不修改共享H3的32K策略。Strata官方文件回读模式与完整RAM驻留分开：Agent接受前者并明确显示，H3仍严格要求原策略。Agent默认文件回读准入提交预算42GiB；完整驻留旧预算约59.6GiB不再误用为所有Agent运行的硬条件。实时RAM/提交/显存仍采样，缺指标有界复测，危险压力可见地停止自有资源。
- 失败尝试保留：首次90547ms完成官方离线准备后因`mcp_servers=[]`原生配置类型错误失败，已修为对象；第二次74254ms被RAM 3GiB保护中止；第三次81253ms实际加载后被完整驻留断言拒绝；第四次209957ms完成3个SDK回合后在文件映射缓存压力下被驻留RAM门槛停止。均不冒充完整通过。Agent现只在加载期允许最长30秒缓存回收窗口；确认官方文件回读后按其RAM缓存特性保护，RAM低于512MiB、提交危险或显存低于2GiB仍停止，健康提交需至少6GiB。H3未启用此分类器。
- 最终独立scratch真实8回合通过，含加载总计203840ms，102个资源快照最低可用RAM2.60GiB、提交余量7.94GiB、VRAM3.91GiB。实际SDK0.3.165调用明确选择的共享官方Claude2.1.165，无SDK内置CLI回退、无bypass、无云登录。调用前备份Claude/CC Switch；scratch单独git init并只暂存自身fixture，没有任何提交或主仓库暂存。

| 回合 | 实际内容 | 耗时ms | 工具调用数 |
| --- | --- | ---: | ---: |
| read-write-shell | Read/Write、git diff | 26252 | 4 |
| round2 | 多轮读取/更新 | 12930 | 3 |
| plan | Plan只分析，文件未改 | 12885 | 0 |
| deny | Bash权限拒绝，目标文件未产生 | 4952 | 1 |
| round3 | 多轮更新 | 6097 | 2 |
| round4 | 多轮更新 | 9333 | 2 |
| cancel | 实际长Bash任务获许可后发取消 | 31716 | 1 |
| resume | 同一个native session恢复并读取原nonce/多轮内容 | 28646 | 1 |

- 取消耗时包括模型思考/调工具，不宣称是1.5秒端到端终止。结束后Job树清理，未见测试长任务，43127/43128无监听且GPU租约释放。日志/资源快照留在忽略的`temp/strata-agent-trial-*`，scratch/备份/会话留在私有本机数据；不把机器路径、原对话或密钥加入Git。
- 普通默认启动事务（无实验放行参数）真实启动Strata+CloudCLI1.37.5耗时70308ms。使用隔离GUI数据库和自有无头Edge，通过生产DOM真实输入、点击发送和“Allow once”。原生WinForms鼠标/DPI仍因工具初始化失败未验，不能用浏览器CDP替代该证据。
- GUI首次账号为隔离的本地测试账号，未登录CloudCLI Cloud/Anthropic。上游首次Git向导要求写全局身份；初轮测试通过官方`complete-onboarding` API只完成本地账号引导，不填假身份、不写SQLite。随后实现可见的“跳过Git全局配置”动作，仍使用上游认证API；实际新入口待后续新profile验证。
- GUI第一轮真实Read/Write与默认权限正常，但模型误判尾换行：45字节源文件被写成46字节，精确复制失败。同session反馈后再一次许可Write，实际输出恢复45字节并逐字节一致；该回合末尾又发生两次空参数Write，随后原生明确400拒绝32883-token请求超过32768。没有截断请求，也没有把写入恢复视为整个GUI多轮通过。GUI完整工具初始提示约29852 tokens，32K明显不足；下一步按64K→128K→262144逐档验证，再定日用默认。
- 文件回读资源补丁后完整verify为221文件2063项单元、6文件88项集成、typecheck/干净构建/20项对比度通过；后续GUI引导补丁相关5文件81项通过。当前上下文扩展接线仍需新的测试/实机证据，不能沿用此前结果宣称完整通过。

## 64K→128K→262144与最终localhost闭环

| 档位 | 实际验证 | 加载/启动ms | 最低可用RAM GiB | 最低提交余量GiB | 最低空闲VRAM GiB |
| --- | --- | ---: | ---: | ---: | ---: |
| 64K | 完整GUI Read/Write、一次许可、同CLI session续聊，原生实际提示35270 tokens | GUI整链85764 | 2.31 | 8.13 | 3.93 |
| 128K | 原生80089-token长输入、SDK恢复原GUI session并Read | 引擎102630 | 1.70 | 8.02 | 4.13 |
| 262144 | 原生220090-token长输入、SDK恢复原GUI session并Read | 引擎67744 | 2.14 | 7.98 | 4.10 |

- 原生长输入经同一Strata的`count_tokens`实读，分别42230ms/105835ms，输出正确首部随机标记。输入是重复惰性文字和首部标记，用于容量/资源/远端标记读取验证，不代表复杂工程质量或长文推理基准；这两次通过直接Anthropic兼容API，不冒充Claude处理了220K工具会话。SDK同session续聊分别8440ms/8836ms，各实际Read一次，读到GUI写入的`GUI64_OK`并保留原round2/3/4历史。SDK身份仍为共享0.3.165与明确官方Claude2.1.165。
- 262144并非只改数字：保持固定k8v4、MTP spec4、GPU vision和auto专家缓存，实际引擎在5120MiB reserve下调整为4943专家槽/8.02GiB GPU专家缓存，host补集由官方文件回读策略按可用commit选取；私有配置、日志、slots均独立。共享准备记录及H3仍为32768，没有重下/复制权重或改分页文件。容量证据来自上述真实输入和资源采样，不沿用32K估算代替。
- 第一次紧接128K进入262144时，RAM尚只有31.55GiB，小于当时34.6GiB物理RAM门槛，2184ms内拒绝且未加载；该失败保留。前一自有Job完全收回后重新采样RAM约45.7GiB，再按相同门槛单独重试通过，未关闭别人的程序或降低该门槛。
- 64K新profile实际空账号提交被HTML required阻挡，补齐后创建本地账号，再真实点击“跳过Git全局配置”；全局Git文件SHA一致。此前测试浏览器的瞬时viewport切换使一次会话点击未命中，误开了新session，未记为同session成功；修正测试窗口尺寸后核对URL/native session ID，再完成真实续聊。原生WinForms的鼠标/DPI仍未验。
- 最终日用默认设262144，折叠设置保留32K/64K/128K。客户端保守窗口200000，不造1M后缀、不关闭compaction；GUI预算在新SDK报告前和报告后都上限200000，不伪造CLI已完全利用262144。充分利用262144的Claude长工具会话及实际自动compact仍待独立验证。
- 最终普通`start`未传commitTrial或context覆盖，使用同一隔离GUI账号/稳定token，73929ms完成Strata+CloudCLI，并按开页偏好返回43128/43127两个无key地址；真实WinForms Shell打开网页尚未点击验收。通过GUI实际输入/发送，在同一个原CLI session中执行Read→Write→Bash `git diff --stat`；Write点击Allow once，实际`gui-default-result.txt`为11字节、严格等于`DEFAULT_OK`加一个LF。Bash真实显示原answer.txt五行diff，新文件未跟踪不出现在diff stat，未提交/暂存真实工程。
- 最终GUI查询实际used37034/total200000；GUI冷启动预算曾在未有SDK报告时显示262144，已收敛到已知客户端200000保守上限。修补后单独重启真实CloudCLI组件（不启动模型），401未登录负测、200000冷启动预算及DPAPI密文文件未重写均通过；组件退出后监听清理。此前完整verify2065单元/88集成通过，补丁后的最终回归以TASK收尾结果为准。
- 配置审计：Claude settings、CC Switch settings、Codex config和auth哈希不变；只读比较CC Switch全部13行provider数据与测试前在线备份一致，包含当前选择。Claude全局文件仅`migrationVersion`变化，属于共享官方CLI更新后的迁移元数据；没有恢复旧全局文件覆盖会话，也没有写provider。稳定DPAPI token跨GUI重启保留；临时路由文件按停止清理。
- 实际停止收回自有GUI/CLI/MCP/Strata/浏览器，43127/43128监听和GPU租约释放。两次测试根stdin保活曾需回收已核对的空闲自有根；测试门控已暂停/unref stdin并关闭写端，后续128K/262K/最终GUI及预算组件均正常退出。共享软件、权重、备份和Claude历史保留。
- 剩余项明确保留：原生窗口/DPI/焦点、完整H3真实按钮交接、原生管理页冷重载、uncensored实际效果、安装取消/修复/失败重试、Node/Git/CC Switch缺件完整安装向导、长时间工具耐久/实际compact、客户端充分利用262144及LAN首次安全启用。未改防火墙/证书信任或网络设施，未打包、bump、tag、提交、推送或Release。
- 最终收尾：全部当前源码的完整verify为221文件2065单元、6文件88集成，typecheck/干净构建/20项对比度通过；独立controller重新准备及WinForms AST/UTF-8 BOM检查通过。默认GUI运行276个快照最低RAM2.88GiB、提交7.96GiB、VRAM4.00GiB。最终43127/43128无监听，无匹配自有测试Node/CloudCLI进程，GPU租约文件不存在，空闲显存22845/24564MiB。原配置/provider审计再次一致；未清理其他任务改动或用户软件。
