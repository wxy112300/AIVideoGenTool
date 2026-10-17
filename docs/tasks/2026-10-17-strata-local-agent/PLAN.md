# Strata 本地 Agent：工具包接入计划

- 类型：Plan；日期：2026-10-17；状态：implementing，localhost已实测，后续安全启用与剩余边界见TASK；完成度只由TASK维护。
- 当前摘要唯一入口：[TASK](TASK.md)；本机事实／来源：[Evidence](evidence/assessment.md)。以下是设计和验收门禁，不是执行记录。

## 1. 形态、复用与端口

不把聊天／Terminal／文件管理嵌入Local Video Studio，不加入H3生成队列。做仓库内可选轻量可视启动器，Electron完全关闭时仍可运行；不是让用户逐个执行服务脚本。目标入口（当前实现范围见TASK）：

```text
Tools/Strata-Agent/
  Start.cmd          → 打开启动器小窗口；同一实例重复打开只聚焦
  strata-agent.ps1   → Windows薄UI／bootstrap，不改变全局环境或执行策略
  README.md          → 首次配置、日用、交接、恢复
  templates/         → 无key／本机路径的版本化模板
```

首选Windows自带PowerShell／WinForms薄窗口＋共享controller，启动器UI不依赖先装Node，不为几项按钮再启动整套LVS或自造Web管理后台。脚本复用项目纯逻辑及非Electron运行模块，不复制catalog或安装器；编译产物在工具准备／更新阶段生成，不在每次双击时执行npx latest／全量应用build。窗口实现须验证非阻塞、DPI与Unicode，不因薄UI妥协可取消的阶段反馈。

Strata安装／更新仍走统一推荐线和管理器，工具也可调用提取出的同一安装能力；现机可用安装直接复用，首次跨机缺件时由用户点击安装，不运行上游整套setup、不改ComfyUI Python、不下载或复制几十GB权重。Node缺失时提供常规共享安装方式或官方安装包；先展示目标/版本/规模/影响并确认，不默认创建工具专属运行时或静默提权。

CloudCLI、SDK和Claude作为可复用的常规共享软件，优先发现标准npm prefix和用户选择的现成安装，不加入应用主依赖，不默认装到启动器数据目录。缺件/低版本生成标准npm共享安装/更新计划，展示旧→新、目标、规模和对其他入口的影响，显式确认后先备份旧包/命令入口；已兼容项跳过，使用中拒绝更新，不降级更高版本。直接安装包固定integrity，运行时审核CloudCLI源码/SDK身份，不承诺冻结普通npm的全部传递依赖。取消/失败可能部分生效，重新检测并保留备份/日志，不恢复覆盖其他程序。只有本机偏好、key、日志、数据库、运行profile及恢复备份属于启动器数据；不进Git。

### 日常主界面

```text
Strata Agent                         状态：已停止
模型       [Qwen Flash Next · IQ3_XXS       ▾]
[ ] 无审核模式           [ ] 家庭局域网

[ 启动 ]  [ 停止全部 ]            设置与依赖 ▸
Strata ○   Claude ○   GUI ○   局域网 ○
当前步骤／简短结果                         日志 ▸
```

只保留一个主要启动入口；模型来自已支持catalog及实际文件检测，不让用户手填Claude API model ID。区分“引擎可支持”“文件齐全”“已准备”“已验证”，不把任意GGUF或27B模型当作Strata可运行项。缺文件给恢复入口，不自动改成其他模型。无审核开关仅兼容模型可选；用短说明解释控制向量，不保证永不拒答，不放宽工具权限。

设置中的“启动时打开GUI／原生管理页”默认开，可取消，保存上次选择。Claude CLI是按需运行的harness，不是额外常驻服务器：启动完成表示CLI依赖与本地路由就绪，GUI会话按需调用它；“打开Claude终端”可选，不强制打开空聊天终端或测试推理。LAN只有首次安全验收通过并明确启用后才能记住，后续启动仍检查当前Private网络及认证，条件改变则不开放并提示。

运行中改模型／uncensored／LAN只产生待应用选择，不偷偷修改活跃任务；按钮显示“应用并重启”，有活跃任务先等待／确认中止。页地址作为就绪后的快捷入口，不再为每个服务放一排启停按钮。运行状态区分别区分Claude可用和活跃会话数量，不把四个绿灯当真实Agent工具质量验收。

### 首次设置与一键安装

“设置与依赖”集中显示软件版本／路径／状态；自动检测、选择路径、一键安装缺失项为主要动作，更新／修复／打开位置／查看日志放上下文菜单，沿用已有菜单设计语言。模型目录只引用共享根；独立机器可选择既有模型根，不向H3新增根目录字段。

- 检测Node、Claude CLI、CC Switch、Strata、CloudCLI、所选模型／MTP／投影及派生pack，支持便携／非默认路径。结果来自真实版本／receipt／文件，不仅判断文件夹存在；开窗不哈希几十GB或联网查全部版本。
- “一键安装”先显示缺失软件、目标位置、版本、下载规模、是否需权限和配置影响；确认后串行可取消安装、校验并复检，已可用项跳过。Node／CloudCLI／Claude等优先共享安装或官方安装包；旧Claude共享更新须明确说明影响并确认，CC Switch配置不写。
- Strata共用现成安装能力及全局软件写锁，不维护第二套版本源／venv。模型权重始终用户管理，只给模型卡和下载位置，不因“一键安装”直接拉大模型。
- Claude／CC Switch配置变化先备份；provider导入仍走支持的GUI／官方入口，必要首次确认不是每次开机重复。启动器不得直接写SQLite或借安装改Codex。
- 安装失败保留可诊断资料及旧可用版本，不假装完全回滚pip／系统安装；可重试指定缺件。安装和模型准备都有真实阶段进度、字节进度（可得时）及取消，后续再启动不盲目重做。
- 若软件安装或防火墙需要管理员权限，只提升范围明确的短期helper；启动器、CloudCLI和Claude文件／shell工具仍以普通用户运行，不因“一键”继承管理员权限。

### 一键启动／停止的事务

启动：冻结本次选择→离线依赖／路由自检→取得资源租约→准备Agent profile与稳定认证→启动并加载Strata→验证鉴权和模型身份→启动CloudCLI与已选LAN入口→核对真实监听→按选项打开网页。首次provider／账号／防火墙／证书初始化通过向导完成；日用沿用确认结果，不临时索要云登录或全局切provider。

整个链有单次操作ID、组件PID与owner记录，重复点击不重复启动；启动中主按钮可取消。只有选定组件均就绪才称“启动完成”；LAN未选显示“关闭”，不是失败。某组件失败默认逆序回收本次新启组件，保留安装／配置／历史和原有进程；如允许“保留Strata继续用”，须明确呈现部分就绪并由用户选择，不能显示全部成功。

停止：停止新会话／LAN接入→保存并中止／等待本工具活跃Claude任务→停止自有GUI／终端子进程与LAN监听→卸载并停止自有Strata→核验PID／监听／显存释放→释放租约。活跃shell／写文件任务先确认，不保证已经执行的文件操作可回滚。超时可提供再次确认后的强制结束自有树，不能按进程名杀所有node／python／claude。停止不结束用户原有CC Switch、外部Claude终端、浏览器、H3或其他工具；不用服务归属不明的实例冒充本工具拥有。

关闭窗口与停止服务区分：默认退出走同一停止流程；仅明确选择“保持运行并隐藏”才后台继续，提供托盘／重新打开入口。默认不切用户全局provider；停止后普通Claude沿用原后端，本工具本地会话不会自动转云。用户可选手动添加的备用provider保留，若自行选中它，服务停止后明确不可用。停止不清空会话或删安装。防火墙至多处理本工具规则，至少先关监听。

```text
本机浏览器／后续手机 → CloudCLI:43128
  → Claude Agent SDK → 明确选定的本机Claude Code harness
    → Strata Anthropic API 127.0.0.1:43127 → 已有IQ3_XXS
本工具Claude终端（仅子进程临时路由） ─────────────┘
普通Claude Code CLI → 原Claude/CC Switch当前后端（启动/停止均不切换）
Local Video Studio → H3专用Strata profile（同43127，与Agent互斥）
Codex App／CLI → 原OpenAI配置（不接入此链）
```

| 层 | H3增强 | 独立Agent |
| --- | --- | --- |
| 安装／模型／MTP | 既有受信安装与共享权重 | 复用，不另下载 |
| 运行／GPU | 应用所有 | 工具所有，与H3／Comfy互斥 |
| context | 现有32K不变 | 目标262144，逐档真实资源验收 |
| 配置／日志／可写缓存 | 现有应用profile | 独立profile，不改H3 receipt |
| 认证 | 每次临时随机key | 每台PC稳定随机token |
| 原生页面 | Electron只读Monitor | 默认浏览器完整管理页 |
| 对话 | 现有增强草稿版本，不进入Claude | CLI／GUI共用现有Claude sessions |

43127以本机已保存设置为准，不回到8080；43128是GUI建议端口，使用前探测。未知监听拒绝启动，不接管／杀进程，不静默换端口造成provider失联。不能通过不同端口同时加载两份4090模型。

Strata管理页用于管理引擎，不等于Claude Agent客户端；CloudCLI才提供日常chat／文件／工具权限。关闭网页不停止模型，停止有独立操作。原生页启动、HTTP就绪、GPU加载、工具成功分别报告。

## 2. 生命周期与隔离：先于CLI／GUI

现有`StrataRuntimeOwner`为进程内owner，不能直接复用于“外部Agent已占GPU”的情况。提取小型非Electron共享租约及协作协议，不先做常驻Windows服务／通用调度平台：

- 应用与工具共享同一GPU和Strata安装／数据修改排他。原子获取，记录owner类型、PID、启动身份、profile、阶段与epoch；只凭PID／端口／旧锁文件不足以杀进程或判空闲。崩溃恢复复核真实进程与监听。
- 控制通道限当前Windows用户，优先命名管道／等价ACL，不增加无认证HTTP管理端口。工具controller持有自有子进程；应用仍是H3 owner。
- 工具遇应用生成／增强忙，提示等待／退出。H3需资源时请求工具交接：空闲可按用户启用的策略释放；活跃Claude任务等待或请用户确认中止，不能静默杀正在改文件的Agent。
- 两种入口：独立机器不要求ComfyUI安装或LVS配置；发现LVS时复用其软件与权重事实，不因打开LVS就终止Agent。只有实际H3增强／队列需要重型GPU时交接。LVS退出只清理其H3资源，不关闭工具独立持有的会话；启动器“停止全部”也不停止LVS的H3。
- 已获交接许可后：禁止新推理→取消／等待当前请求→卸载停止自有引擎→核验显存和监听释放→释放租约→H3获取。失败则阻塞H3，不抢先加载第二份模型。
- H3结束保留原驻留／手动开关／队列释放语义；首版不自动恢复Agent推理。Claude历史保留，GUI可显示后端已释放，用户重新启动后resume。
- 同机制约束Strata更新／卸载，防止应用替换外部Agent正在用的软件；未获得所有权不停止他人服务。

对话／缓存分界：

- H3仍直接调用Strata API，不经过Claude／CloudCLI，不把增强内容写入`~/.claude/projects`。
- CLI与GUI共用现有Claude根／项目／native session ID；不默认改`CLAUDE_CONFIG_DIR`，它还会改变settings／plugins，不是只换历史目录。保留原CLAUDE.md、MCP、hooks、skills与权限。
- Agent不复用H3 Monitor记录、engine.log、prompt／conversation持久缓存或原生Chat存储。只读pack／tokenizer／MTP可共享，可写缓存必须显式分离；若上游缓存放pack旁，改配置指向，不复制大权重。
- 原生Chat可能有同源浏览器存储，服务端profile隔离不自动清掉它；验证H3未写该存储、Agent页无H3记录混入。
- 工具日志默认只记版本／阶段／资源／请求ID／耗时／token，不存原文／思考／key；原生Monitor可见正文，Claude／GUI本来就有历史持久化，须说明本机数据权限，不能称全链无正文存储。

## 3. 模型配置与上下文

- 单独生成Agent运行配置，不手改H3 runtime／receipt。先定位可验证完成pack；默认位置没找到不等于全机没有，找不到才显式离线准备。无提示重复SHA或重建不可接受。
- Agent启用`fit_max_tokens:true`：收缩调用方过大的输出上限到剩余context，不截断输入、不扩context；prompt已满仍报错要求compact。这与H3自动扩大输出预算是两个不同功能。
- 已接受的实现调整：32K用于基础工具验证，完整GUI实际初始提示约30K并会超限；64K GUI通过后继续128K/262144逐档实测，目标档原生220K输入与最终GUI闭环通过后设为日用默认，客户端仍保守200K。各档保留在折叠设置。Agent允许官方文件回读且明确显示实际模式；完整RAM驻留估算不再误用为文件回读的硬门槛，H3策略保持原样。实际KV/auto专家缓存、长输入及三项余量证据见TASK，充分利用262144的Claude工具窗口另验。
- 目标262144；先32K工具协议冒烟，再64K→128K→262K检查。按实时物理RAM、Windows commit、VRAM共同准入，128GB也不强行放行。64GB不满足则报告安全可用档，不称262K完成，不自动改分页文件／关程序／上512K或1M。
- 必须按固定安装官方策略核对KV精度、KV streaming／resident、MTP、专家缓存与host内存，不能只改max-context数字，不能沿用32K资源估算证明262K安全；采样先保持已验证值。
- `anthropic_thinking:on_request`作为Agent候选，避免helper短输出被默认思考耗尽；记录thinking／budget／effort实际行为，不将H3影视扩写专用2048思考套到全部Agent任务。
- uncensored是Agent独立显式偏好，沿用兼容ID、hash及引擎确认规则；不自动改H3，不因启用而放开文件／shell权限，无新向量下载。
- Claude客户端窗口与服务器窗口分开验。共享CLI已按用户确认升级2.1.165；客户端仍采用保守窗口／提前compact，不拿环境变量标识存在当实际压缩成功。GUI预算上限取本地与SDK声明中较小者，充分利用262K另验，不伪造1M后缀或关闭compaction绕限制。

## 4. 分阶段实施

### P0 — 只读调查（本轮完成到静态层）

证据见Evidence。未启动HTTP、推理、备份或安装；继续时补变化及缺口，不重跑同一权重扫描。

### P1 — 底座、备份与独立启动

1. 可视启动器／doctor／本机偏好schema／依赖向导；共享租约与路径／版本／pack发现。先实现缺件与安装取消等窗口状态；可用软件不重装，缺件由“一键安装”显式补齐，不能靠技术人员手动执行服务命令才能日用。
2. 修改任何外部配置前创建时间戳、ACL受限、不覆盖的本机备份：Claude settings、全局`.claude.json`、CC Switch settings和SQLite一致性快照。活动SQLite用在线备份或退出后完整一致副本，不能裸拷主DB冒充完整快照，不改源表。
3. Codex配置／凭证只做完整性基线；Claude MCP／hooks／plugins／skills／permissions／项目及CLAUDE.md记录结构和hash，不打印敏感正文／命令。恢复清单说明每项归属。
4. 首次生成稳定本机随机token，受当前用户ACL／DPAPI等保护；不进Git、日志、命令行或URL。轮换要同步provider。H3临时key不适合CC Switch持久provider。
5. lazy HTTP→身份／鉴权／CPU预检→资源准入→GPU加载，日志分阶段、可取消；默认浏览器打开`http://127.0.0.1:43127/`。原生页首次手输token，复制须用户操作且不打日志，不把key拼URL或假设Electron注入能在浏览器使用。
6. 原生管理页只改Agent profile；其load／unload／改context不能绕过controller租约和资源保护。先核对上游管理接口是否可控，必要时做窄会话适配；无法封住则阻塞完整管理模式，不声称原生页已安全接管。

验收：Electron关闭可独立启停；双击幂等；缺件→恢复→真实入口→PID／ready；端口冲突不接管；取消／controller崩溃无孤儿GPU；CPU mock与真实短推理分层。实际测H3按钮／开始队列的资源交接及更新／卸载互斥。

### P2 — scratch CLI直连，不先改CC Switch

- 子进程环境／临时高优先级settings overlay设置本机BASE_URL、AUTH_TOKEN及本机CLI识别的完整model ID，首候选`claude-sonnet-4-6`；BASE_URL不加/v1。检查旧API key／OAuth／proxy／主与helper映射冲突，不仅多加一个变量；不持久删除旧值。
- 本机帮助支持settings／setting-sources；实测优先级，防止user env仍指向旧云provider。首轮隔离scratch项目配置／无关MCP，随后逐项恢复完整harness，不把最小模式当日常配置全兼容。
- 仅子进程启用已识别的禁非必要流量／遥测选项，观察实际效果；不用它们证明绝无外联。scratch不使用WebSearch／WebFetch等非必要网络工具。
- 无Anthropic登录；主调用／helper／Plan／compact都到本机，无云fallback。工具由Claude harness执行，不同时打开Strata原生MCP执行同一套文件／shell工具。
- scratch git repo验cwd、列文件、创建／读／改文本、无害shell、git diff、Plan只读与退出后执行，至少5–10轮；allow／deny、坏参数、流式tool arguments、Ctrl+C、Stop、中止后下一请求、resume逐项验。
- 每轮记录准备／load、TTFT、prefill／decode速度、总wall time、工具耗时、token、缓存命中与资源最低余量；不拿单轮热启动声称整体收益。

退出条件：本机真实推理与工具／文件证据一致、无登录／云推理请求、旧配置未被临时测试修改。失败定位协议／工具，不改H3来迁就Claude。

### P3 — CC Switch兼容与可选备用provider

- 使用本机3.20.0支持的GUI／provider JSON／确认导入面；v1/import可用，但不套4.x才有的字段，不写SQLite、不自动升级CC Switch。
- 按用户最新指示，日用不新增/选中/切换全局provider。路由仅在本工具子进程环境与临时高优先级settings文件，普通Claude始终保留原CC Switch选择。不改全局proxy／failover／Codex app_type，也不为了此项关其他provider的代理开关。
- 可选菜单在明确确认、完成一致性备份后复制native Anthropic备用JSON，由用户使用3.20.0 GUI配置编辑器添加；保留原provider为当前。43127以实际设置为准，稳定本机token不进URL／命令行／日志，不使用含key的deeplink，不直接写SQLite。
- 如用户另行选择手动切换备用provider，再验重开CLI及原项↔本地项；这不属于日常启动的必要步骤。已运行harness不热改路由，切换前先处理活跃任务；停服务后被手动选中的本地provider会不可用，不能宣称它自动回原项。
- 检查MCP／hooks／plugins／skills／权限／CLAUDE.md／项目及Codex基线。恢复优先精确撤销本工具变化；用户随后有新修改时不能整库覆盖备份。未演练不称回滚已验。

### P4 — CloudCLI localhost Web（CLI通过后）

- 安装时重查stable／npm latest／安全公告；禁prerelease和<=1.24.0。本轮候选1.37.4，固定版本／integrity／依赖锁，保留AGPL许可证；不接Cloud、不装Docker sandbox／插件。
- 显式`HOST=127.0.0.1`、`SERVER_PORT=43128`，监听表复核无0.0.0.0／::。私有GUI数据库／日志，但保留标准Claude会话根；loopback首次设置本地CloudCLI账号／随机JWT，不是Claude.ai账号，不使用platform／跳认证模式。
- 显式CLAUDE_CLI_PATH指向已识别官方npm包JS或原生exe入口，而非claude.cmd；报告实际CLI与SDK版本。用户已允许控制旧CLI更新：安装确认后可更新现有共享CLI，旧包/入口先备份，保留原配置/会话/provider；已有兼容CLI直接复用，不重复安装，不静默回退SDK内置CLI；npm可能带入可选平台包，保留共享依赖结构并如实报告。
- 仅使用Claude provider；上游附带其他适配器不代表可接管用户Codex。验证自动发现是否仅只读，必要时用受支持配置限制；不能以没点Codex代替完整性审计。
- CLI创建→GUI resume→GUI新增→CLI resume，核native session ID，不只看侧栏。实测MCP／skills／hooks／permissions、文件树／diff／Git／Terminal、Plan及工具审批deny／Stop。
- GUI allowed／disallowed／skip有独立语义；default或可审计acceptEdits，shell按规则审批，skip关闭，禁止`--dangerously-skip-permissions`／`bypassPermissions`。不把空allowed列表当所有工具必然禁用，不能假定权限等价。
- 多session可看历史，首版只一个前台Agent运行；核Strata原生排队／槽位与helper并发，不擅自开多副本／多槽。验第二请求等待、取消不误伤他人、无后台无限积压／跨session串内容；不通过就阻塞多session发送，不顺带加新路由代理。

### P5 — 可选Desktop Local Mode

先浏览器，再验证同版本Desktop能指向已运行43128／同数据库／Claude根。其marker发现、自动选端口／自启server可能产生第二runtime，须显式本地URL并复核PID；不能保证就维持Web，不为桌面壳引入第二套配置。

### P6 — Private家庭LAN（本机验收通过后显式启用）

- 默认关闭；只改本PC本工具绑定与最小防火墙规则，不改网络profile来强行通过。非Private网络停下请用户确认网络性质；不碰路由／VPS／NAS／VPN／UPnP。
- Strata始终loopback43127。仅CloudCLI或本机TLS入口对选定Private网卡／本地子网开放；防火墙限Private、程序、端口和LocalSubnet。核对既有宽泛Allow规则，不能仅新增Private规则就称Public已封；不删除用户旧规则达标。
- 本地账号／强随机凭证、JWT与WS鉴权／未认证负测、Origin、上传／路径／shell权限均验。账号必须先在loopback建好；家庭Wi-Fi不是加密传输或RCE安全保证。
- LAN HTTP可作受控网页连通测试，但token／Terminal可能明文，不作安全日用承诺。Safari加主屏入口不等于完整PWA；完整service worker／安全日用需评估仅本机TLS和手机受信证书，不改路由／DNS。TLS入口及证书信任另行选择，不自动装根证书；不选则如实交付LAN浏览器、PWA未验。
- 手机验原session续聊／新会话、审批、diff／文件／Git／Terminal、Stop、后台恢复／断线重连。关页后任务是否继续需可见可中止，不能把重连当重新提交。

## 5. 交付与不做事项

开发先P1＋P2验证底座／CLI，再P3＋P4完成localhost的一键用户闭环，后续P5／P6验证可选桌面／LAN。P1＋P2只是内部里程碑，不作为用户最终“一键全部就绪”的交付；阶段划分不能转嫁成日常手动开服务。完整闭环需真实点击启动／停止，验证开关组合、运行中改选项、缺件恢复／安装取消、双击／重开、半途失败回收、Windows关窗与进程残留，以及无LVS状态的独立机器路径。共享runtime改动按仓库focused＋verify＋真实H3按钮／队列交接；fixture／mock／GPU／质量／LAN分层，不互相代替。

最终说明：安装项与CLI／SDK版本、配置逻辑位置、监听、key轮换、启停／切provider／恢复步骤、真实测试内容和速度／资源、安全与未验边界。工具卸载不删Claude sessions、CC Switch库、共享模型、Strata安装或备份；只撤销本工具明确创建且身份匹配的防火墙规则。

后续只列不实施：NAS／Wake-on-LAN、Tailscale／Headscale、Wonderland VPS、公网Remote、Split DNS、Strata普通Chat手机客户端。无开机常驻／打包／Release授权。
