# 日用布局与失联诊断修复

- 类型：Evidence；2026-10-18；状态：实现及无GPU验证，真实故障根因待对应日志。摘要唯一入口：[TASK](../TASK.md)。
- 用户报告：控件裁切、按钮无反馈、密钥入口隐蔽、Strata频繁offline但启动器仍显示启动中、缺少崩溃日志；长思考/长输出/uncensored更易触发。此前scratch容量通过不能覆盖这些日用负例。

## 已确认的实现缺口与修复

- WinForms原780×390，硬编码690px内容，设置强制升到820px；嵌套流式面板宽度不受约束。现在主操作固定、设置与日志滚动，按可用宽度布局路径行，折叠不强制调整窗口高度。错误文本高度有界、完整内容仍进日志。连接菜单显式提供复制key、原生页与本轮日志；说明CloudCLI本机账号与原生页API key用途。
- UI原没有轮询status；`running`仅靠start/stop结果，Controller退出也未复原操作状态。现在每两秒非重叠只读状态请求，3次HTTP失败才报持续失联；进程退出、模型卸载、GUI退出、加载与请求busy分别显示。资源值超12秒不更新标记为最近值。并行status返回不再错误解除安装/启动的busy状态。
- Python stdout/stderr原仅保留内存尾8KB；新增私有本轮`server.log`、退出code/signal，保留原native `engine.log`，提供目录入口。token跨输出块先合并整行再脱敏；状态只提取数值/布尔，不传递原生回答。资源保护与监测失败先记原因/最近资源再收尾，停止后仍可查原因；不自动重放工具或杀未知进程。
- 私有latest-run索引保存最近日志位置与异常，重开窗口也能找到；只恢复自有runs下的诊断路径，不恢复PID、租约或进程归属。测试覆盖重开和拒绝越界路径。
- Agent采样显式使用自己的分模式knownPressure，避免缺失某个传感器时先用完整驻留RAM线终止重测；没有降低任何既有阈值。Agent明确`STRATA_FILE_RELEASE=0`，防止继承shell opt-in；H3源策略和32K未改。

## 目前不能认定的原因

- 本机运行目录最新操作日志为10月17日旧验证，没有本次日用崩溃记录。用户随后明确故障发生在另一台电脑，但因找不到日志尚无法提供；不能混用机器条件或拿旧通过替代新故障分析。
- 固定安装上游server.py有`STRATA_ENGINE_STALL_S=90`：无输出且CPU/IO无活动、GPU探测不忙时结束引擎；另有默认300秒engine_silence_s。只是候选机制，尚无本次触发证据，未关掉/放宽这些保护。资源保护、Python退出、CUDA/OOM、客户端流错误也必须用日志区分。
- uncensored当前固定兼容控制向量1.0/project，载入验证与默认启用接线保留。未做本次效果A/B、未增加强度，亦未声称所有请求均无拒答。GUI/CLI权限继续确认。
- H3长资料曾发生Windows GDI内核蓝屏，根因未定，详见其原证据。本轮保持文件页释放关闭，未启动重模型来冒险覆盖该未解条件。

## 实际验证与边界

- `strata-agent.ps1 -Smoke`：实际WinForms控件、720×540/1000×720，含三行busy/uncensored与长故障文本，主按钮/菜单/状态可见，设置行不越界，折叠与日志切换通过，DrawToBitmap已检查。首次检查曾捕获设置行Margin越界，修复后通过。此为组件布局，不是鼠标交互或系统高DPI；原生Computer Use因sandbox helper初始化失败，重试后仍失败，未冒充鼠标通过。
- 相关服务/Agent focused通过；新增HTTP实际fixture覆盖busy142秒数值、三次503失联和恢复/模型卸载，仅GET，不重放请求，状态不含key/回答；进程mock覆盖退出检查、私有日志跨块key脱敏、资源原因清理后保留。
- `prepare.mjs`通过；`verify-http.mjs`实际固定Python/guard的CPU mock鉴权、管理写入拒绝及原生页通过；无GPU或真实Agent。
- `verify-monitor.mjs --long`：实际固定Python/guard、脚本CPU引擎首输出延迟125秒，**126058ms**、124次实际状态采样、busy确认、完整SSE结尾、退出code/signal记录、停后unreachable确认通过。说明这条HTTP链不存在必然两分钟整体中止，不能排除真实CUDA引擎停滞、OOM或Claude长流问题。没有CLI/真实模型/VRAM性能结论。
- `verify-monitor.mjs --crash`：自有实际Python fixture在2秒计时后主动`os._exit(17)`，首轮3489ms、最终重验2504ms，服务snapshot成为error、退出码17入诊断输出、HTTP确认unreachable。不是实际CUDA崩溃或WinForms鼠标证据。
- 最终完整`verify`通过：222文件2073单元、6文件88集成、双端类型检查/干净构建、20项文字对比度。Controller重新编译与WinForms长状态布局复验通过。已有jsdom scrollTo未实现及chunk体积告警，没有失败。

## 清理与下一步

CPU测试使用临时目录和随机loopback端口，finally停止自有Python、删除本轮fixture；不占43127/43128、不申请GPU租约、不修改用户偏好、token、原Claude/CC Switch/Codex配置。未安装软件、下载模型、bump、打包、tag、提交或推送。等待对应机器实际失败日志，之后按长思考/长输出/uncensored逐项重现；仍需原生鼠标/DPI、真实GPU耐久与LAN门禁验收。

只读收尾发现共享协调目录仍有旧Studio租约记录，其记录的三个PID已不存在；这是H3原记录，本轮未删除或接管。不能把“本轮没申请GPU”写成共享目录完全没有历史记录。

## 另一台电脑的取证入口

- 新增`Export-Diagnostics.ps1`和可双击`.cmd`，启动器菜单异步调用；没有Node、Controller或活跃服务也能导出，不改变任何服务归属。UI完成回调在100ms计时器中、位于Controller空值返回之前，导出完成显示文件路径并打开目录；独立入口同样有结果/失败提示。
- 仅扫描普通目录中的最近2份`.jsonl`与最近3个run的固定`engine.log/server.log`；每份最多末256KiB，跳过reparse路径，不跟随外部latest-run指针。原始preferences/runtime.json/token/routes/数据库/sessions/权重不复制；偏好仅经类型/范围校验的上下文、bool模式和端口。稳定token按64hex、凭证行、sk-/JWT特征脱敏，不读取或解密token。
- 使用当前用户/SYSTEM的私有新目录存储JSON，无上传动作。导出前后原日志保留；当前物理RAM/Windows提交余量通过GlobalMemoryStatusEx读取，NVIDIA只读查询限时3秒，未知明示。当前资源不冒充故障时资源，日志仍可能含对话信息，需要分享者检查。
- `verify-diagnostics.ps1`实际Windows临时旧版文件夹验证：操作/引擎错误保留、缺server.log明确报告、排除token/route/runtime/auth/路径、异常偏好对象拒绝、token文件hash不变、导出ACL关闭继承均通过。初次测试发现新中文脚本缺UTF-8 BOM导致PowerShell5.1解析失败，补BOM后复验通过。没有GPU或实际Agent推理；临时fixture清理。
- 本次只增加PowerShell工具/菜单和文档，没有修改上一轮已完整verify通过的TS源码；复用2073单元/88集成及构建证据，并补实际导出、AST和WinForms布局验证。另一台电脑的报告尚未取得，真实崩溃分析仍未完成。

## 收到128GB电脑报告：模态重入与监测主动停止

来源为用户提供的`diagnostics.json`，报告/对话/机器路径不加入Git，仅记录必要派生事实。报告生成时间2026-10-18 19:51:59（Asia/Singapore），物理RAM约127.8GiB，RTX4090；实际服务仍为0.1.44.1，262144上下文、自带ESP。新推荐版本不等于这份日志已在跑0.1.45。

- 19:51:09记录Windows commit与GPU CLI均约5.3秒超时；19:51:10六秒总预算耗尽，只有两次尝试，controller记录telemetry-failure主动停止；19:51:11 stopping、19:51:13 stopped。最近有效RAM70912311296、commit69045895168、VRAM5073010688 bytes。它们是最近有效样本，不是假定停止瞬间的剩余值。
- server记录Claude实际输入29717 tokens，23秒完成419 tokens（stop、cancel=False），随后服务code=1退出；这份报告未见CUDA异常栈或OOM。能确认本次有监测保护停止，不能推广为所有历史掉线均无GPU问题。较早两次控制向量缺失是加载前阻塞，与本次运行中停止区分。
- 导出BUG根因：完成回调在MessageBox模态循环返回后的finally才清除diagnosticProcess，WinForms Timer在模态循环继续回调。现先截取结果、清空共享完成状态、Dispose自有Process再显示一次消息/打开目录。独立cmd不含该Timer，但菜单导出之前存在此问题；此前只测文件导出漏掉了此用户路径。
- 监测原每秒启动PowerShell/CIM和nvidia-smi，单次helper五秒截止、整轮六秒，重试窗口在该机被进程启动/查询超时吃掉。现仅Agent使用一个自有Python sidecar，GlobalMemoryStatusEx读取RAM/Windows提交，直接NVML读取显存，不为每秒采样创建进程。使用现有Strata Python和驱动DLL，无新依赖、CUDA上下文或模型；加载期StrataService也注入同一reader，避免另一路仍走WMI。退出清理模型后再停采样器、释放自有租约。
- 每请求独立ID、新鲜结果、取消/晚响应隔离；用户指出H3已有修复后再次对照，确认此前Agent六秒预算未完整继承H3默认十二秒，是实施遗漏。最终运行监测去掉六秒覆盖，直接复用共享三次/十二秒，reader单次三秒，加0.5/1秒退避仍容纳三轮。八秒冷加载凭证过期只阻止新的加载，不能与运行任务的恢复截止绑定。加载期也注入Agent的knownPressure，与最终pressure同一模式，H3默认分支保持不变。真实低资源门槛、持续未知保护停止保留，旧值不放行；旧helper迟到close不能影响新一轮。
- NVML ABI参考[NVIDIA设备查询](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html)与[nvmlMemory_t](https://docs.nvidia.com/deploy/nvml-api/latest/api/structnvmlMemory__t.html)；只从Windows系统目录/标准NVIDIA驱动目录加载nvml.dll，单卡身份不符或API不可用则明确未知并拒绝准入。

实际验证：

- `verify-diagnostic-reentry.ps1`提取生产完成函数，真实WinForms嵌套模态消息循环，14次Timer tick、1次结果显示/Dispose通过；不自动操作用户窗口。
- `verify-resources.mjs <已安装Strata Python>`：120次新鲜Windows/NVML采样、单个自有helper，首轮最大116ms/平均1.41ms，最终平均1.40ms，与独立smi的显存总量/空闲一致，结束helper退出。仅当前64GB电脑，无模型/真实Claude或重GPU推理。
- focused五文件70项通过，覆盖取消/晚响应、跨运行迟到close、瞬时缺值恢复、硬压力立即返回、持续未知六秒有界失败、退出及无效协议；Controller清理覆盖GUI失败后仍先停模型再停helper。导出私有ACL/脱敏与三模式/窗口布局复验通过。
- 修正预算后新增报告节奏回归：首轮5.3秒失败，原6秒截止时仍待恢复，6.9秒取得新样本通过；挂起reader有三轮完整三秒机会、持续失败仍停止。加载期低RAM文件缓存/单传感器缺失能按注入模式重试恢复，不能被默认3GiB提前打断。最新focused/全量结果以本节最终补记为准，六秒说明仅对应中间状态，已被替换。
- 完整test:all第一轮228文件2112单元/6文件88集成通过；随后增加一项旧helper迟到close回归，最终全量结果另记。双端typecheck、renderer/web/Electron隔离构建和20对比度通过。另一个LAN任务正在修改同一工作区，因此本轮未执行会删除共享dist的npm verify/build；构建改用忽略temp下独立输出。没有声称覆盖该任务后续改动。

待验/清理：128GB实际Claude首条/长思考/长输出需要同步本轮改动后重试；不能将采样速度或模态回归说成真实整链耐久已过。所有本轮helper和模态测试窗口退出，未运行重模型、占43127/43128、申请共享GPU租约或清理其他任务资源；没有复制原始用户报告入库、修改配置/凭证/provider、安装/打包/提交/推送。

最终补记：预算/加载期已知压力修正后的完整test:all为229文件2117单元、6文件88集成通过；双端typecheck、隔离Electron编译、独立controller准备及真实模态重入复验通过（14次tick仅一次显示）。renderer/web隔离构建和20对比度在同一轮已通过，其后未改renderer/web；其他LAN会话后续代码不在本任务保证范围。43127/43128无监听，无本轮resources.py helper遗留。CHANGELOG当前由活动LAN任务更新，本轮不并写其文件；本任务Patch变化/发布说明保留在此和TASK，待统一收尾协调纳入。

### 2026-10-18 用户要求资源遥测宽限改为30秒（Patch，未提交）

- Agent预检、启动计划采样、StrataService加载监测和运行轮询统一注入`AGENT_RESOURCE_RETRY`：总截止30000ms，持续缺值/超时在截止前继续退避重采样，不因三次失败提前结束。helper单请求仍3000ms；有效新样本即恢复，真实危险值仍立即返回保护，取消仍立即生效。共享函数默认三次/12000ms，H3调用方未注入新策略，保持原行为。
- 30秒是资源遥测宽限，不是思考/输出时限；界面12秒最近值标记与8秒冷加载许可过期保持原义，不以旧样本放行新加载。未修改上游90秒冻结检测、300秒引擎静默配置或Claude权限/路由。
- focused四文件66项通过：挂起/立即返回缺值两类均在29999ms未失败、30000ms拒绝；超过三次及12秒后恢复；取消后无后续采样；已知危险值立即保护；服务加载在14秒恢复成功，未被外层12秒截断。共享默认三次/12秒测试仍通过。以上为模拟时钟/进程协议及服务逻辑测试，不是真实GPU长思考。
- `npm.cmd run test:all`完整单元及集成通过（集成6文件88项，退出0）；`npm.cmd run typecheck`及`node Tools/Strata-Agent/prepare.mjs`通过，独立工具下次启动使用更新后的运行文件。 scoped diff空白检查通过；未运行清理共享dist的verify/build，继续沿用活动LAN任务的构建归属边界。
- 本轮未启动Strata/Claude/GPU、未占端口或生成自有后台helper，无新增服务资源待清理；128GB机器实际首条/长思考/长输出耐久仍待验。保留其他会话改动，未安装/打包/提交/推送；CHANGELOG仍待统一收尾协调纳入。
