# 长视频模式：Strata 编排与 Continuum 自动续接

- 类型：Task；Status: blocked（P0离线判定完成；分组receipt适配阻塞有限runtime，P1-P6功能未实施）。
- Updated / Owner: 2026-10-20 / 当前 agent；Execution: direct，新增子 agent 0。
- Scope / Authority: 用户于2026-10-20要求执行P0；先核对实际安装、资源归属和离线schema/graph，再在安全门槛内执行PLAN的有限探针。不安装/升级节点或下载权重，不改变现行managed续接门槛、产品契约或用户数据。
- Baseline: 原始研究为2026-10-18 / `475722c2c231da2aa8782d66e6c03d22a5913809` / `0.66.0`；P0开始时package为0.66.4，已有Strata服务/提示词、测试及契约改动，全部保留，不归入本任务。
- 权威：当前 [Architecture](../../ARCHITECTURE_CONTRACT.md)、[UX](../../UX_CONTRACT.md)、[Workflow](../../WORKFLOW_CONTRACT.md)。下述方案是提案，尚未替代产品契约。

## Resume

- 已明确交互：沿用Create图生视频/Extend；时间与运动移至LoRA前，H3生成方式分原生15.1秒/原生解锁30秒/Continuum多段，整包上限120秒；确认段数布局、逐页版本、一次提交、Queue单卡及History普通成片。原生30秒用户负反馈影响默认推荐，不撤销[独立工程交付](../../archive/h3-native-30s/TASK.md)。
- 本次补充：一个Run可含多个段prompt；分页是编辑视图而非执行要求。建议“整片/分段”共用一份结构化脚本，长稿按段编译，不把上万字反复交给每次采样；全自动/半自动负责写作方式，不等于逐段人工审批。
- 时长/身份：同Run共用段长、累计最多16段；约10秒目标是初始化启发式而非实测最优。原图持续参考不简单等同必须Ref2VA；当前Continuum Reference尚未接入，新生成角色采纳与跨Run移交需新增验证，不要求用户预制角色资料。
- 状态：保留旧managed accepted>0/head保护；新增正式new-run入口，不借续写门槛创建首段。整包revision、逐页稳定ID、采样/解码/合成分层恢复、独占文件回收及History原路线回流均属待实施。
- P0决定：实际Continuum为干净3.9.1，已具备当前物理组投影；暂保留此基线，不以升级3.9.9代替应用适配。正式new-run独立入口、预设完整布局；旧managed逐次续接与accepted>0/head保护保持不变。见[本轮证据](evidence/research.md)。
- 阻塞：旧receipt要求请求总段数与完整accepted记录一致，预设3段但只完成1/2段会拒绝。需独立分组执行收据，明确计划数、accepted数、物理组范围和输出scope；不能放宽旧收据或把局部预览当全片。末次Review返回完整前缀，Finalize只组装已解码数据，不是Run目录读取器。
- 下一步：先实施分组receipt/执行checkpoint的最小内部适配，再恢复P0有界GPU探针；不直接开始P2长片生成。P1纯逻辑可独立开展，但本轮未启动。持续Reference/跨Run仅有源码候选，P5仍须验证真实兼容性；本轮H3采样0/4、Strata规划0/4。

## Implementation and resources

- 本轮拥有本任务内TASK、PLAN、研究补充及[managed回归断言](../../../tests/h3-continuum-managed.test.ts)；无生产代码、任务索引、模型catalog、现行契约、CHANGELOG或版本改动。并发Strata工作全部保留。
- 后续实施要按实际改动更新类型/迁移、Queue/History、工作流契约、用户旅程和 Unreleased；预计 minor 功能，尚未发生版本变更。
- 本轮未启动Electron、ComfyUI或GPU，无端口/媒体资源需要停止或删除；隔离编译和原始探针报告仅留gitignored temp。正式state摘要与节点HEAD/dirty收尾复核未变，不清理其他任务资源。

## Evidence / handoff

- 实际检查：初始 `git status --short` / `git diff --stat`、受影响当前 TS 与文档、`npm.cmd run harness:app -- list` / `guide extend`、官方源码/模型卡/社区作者仓库与 GitHub 固定 revision。
- 文档验收：2026-10-18，本任务3份文档及任务索引的本地链接/空白检查通过，`git diff --check`通过；索引仅新增1行，保持CRLF，无本任务意外删除。检查源码路径及命令一致性；并发Strata/History改动保留，不归入本任务交付。
- 2026-10-20：已按最新交互重排现有PLAN并补充研究来源，替代旧第四模式/P0-P4描述。3份文档47个本地链接、10张表及P0-P6/交互覆盖检查通过，scoped `git diff --check`通过；保持CRLF并复核最终差异。仅文档变更，不运行build/verify/GPU。
- P0检查：现行managed/comfy-ui基线70项通过；新增预设3/12段首组拒收断言定向通过；Run锁守卫11项通过；安装源码时间自检＋18个网格、6个投影、4个合成receipt场景通过；隔离Electron TS编译及双端typecheck通过。
- P0记录终检：3份文档52个本地链接、11张表、P0-P6标题/阻塞标注及编辑器诊断通过；4个触及文件保持CRLF，scoped diff --check通过。变更限文档与3行测试断言，无新增运行行为或版本变化。
- P0限制：所选Python缺pytest，上游pytest套件未运行，未擅自装包；改为直接执行实际纯函数/receipt方法，不计作完整上游套件通过。在线object_info、new-run真实输出、音画/恢复/零新增采样、Strata规划质量和120秒峰值均未验；按已发现的协议阻塞停止GPU实验，无全量verify/build或模型加载。
- 执行环境的普通沙箱进程中途出现 `helper_unknown_error: setup refresh had errors`；随后通过已批准的只读命令继续调查，未发生自动审批拒绝。
- 实际模型/effort、token usage：工具未提供可靠统计，unknown。
