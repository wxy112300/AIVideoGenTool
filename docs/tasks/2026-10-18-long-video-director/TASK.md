# 长视频模式：Strata 编排与 Continuum 自动续接

- 类型：Task；Status: in_progress（P0/P1及P2 Create/Queue分页通过；已有Run Extend采样后因官方导入副本语义被拒收，待补证明恢复；P3/P6单图120秒真实增强受资源门槛阻塞）。
- Updated / Owner: 2026-10-27 / 当前 agent；Execution: direct，新增子 agent 0。
- 本轮交付：完整289文件2716单元+6文件91集成、双typecheck、独立干净生产构建和440对比度通过。已更新本次开发dist后端模块及renderer/web，保留旧资源与其他任务main/preload，不重启当前用户应用/ComfyUI；正式state前后字节不变。正常重启应用后加载完整H3接线。没有新增GPU采样、权重下载、版本提升或打包。
- 2026-10-27完整 H3 配置接线（minor）：已复用共享LoRA栈/模型补丁/Turbo与PDD采样函数，新增可选profile.h3冻结LoRA及SOL/SLA、运行时、Compiler、Spectrum model-aware配置；四种attention均可构图，Compiler auto不再误禁managed Sage原始函数观测。修复History继续创作清空LoRA/覆盖运行时、普通草稿归一化丢失继承LoRA/步数，以及LoRA触发词与严格快照校验不一致。Queue逐页显示真实采样文本，已接受prefix不改；旧profile不写h3、保持旧图/身份。真实隔离120秒草稿采用已安装Realism People LoRA+Kitchen+SOL+Spectrum+native+Compiler auto，经缺图恢复/真实鼠标入队得到98e15ade-7345-406f-9f81-65a2d1733a47；未启动队列或采样。对现有8188只读GET object_info，18节点新图通过实际接口检查。正式state字节未变，29820/13955/18319隔离资源已清理；用户运行实例与8188未重启。最终验证与交付见[加速边界复核](evidence/acceleration-boundaries.md#完整接线完成记录)。
- 2026-10-27加速边界复核：用户指出入队过严，保存配置实际只因Sage Triton被白名单漏掉。已补UI/task/claim/graph/profile/恢复身份，保留Spectrum；定向23项、完整2696单元+91集成、双typecheck/独立生产构建/440对比度通过。新版完整隔离Electron经缺图→真实拖入→鼠标入队得到120秒Triton+Spectrum任务，未启动队列/GPU，正式state字节未变。官方指南/开放集成契约/Issue31及Core文档确认LoRA、稀疏和其他后端并非Continuum通用禁令；仍未接入的部分不能仅删除校验就假装应用设置已生效。见[加速边界复核](evidence/acceleration-boundaries.md)。后续优先复用H3共享LoRA/模型补丁/采样配方，取消一概限制；保留训练权重与真实复用契约。正式非CDP用户窗口未动，新执行代码需正常重启生效；隔离47100/1172/18319已清理。
- 2026-10-27导航最终方向（替代下条换行方案）：用户明确要求保持一行、左右窄箭头切段并滚动、无滚动条。已实现18px箭头，包含全局在内首尾禁用、整片视图/未确认布局禁用；绘制与ResizeObserver让选中页保持可见，键盘导航不滚动整页。真实隔离Electron在1440×900、1280×800、900×800以实际鼠标完整往返0→16→0，均单行、选中页完整可见、scrollbar none，箭头18px；未启动GPU。最终完整2688单元+91集成、双typecheck、独立renderer/web/electron生产构建与440对比度通过，证据`temp/long-arrows-*`。加载新renderer前确认Prompt/Queue空闲及编辑文字已保存，刷新后原草稿、6条队列、137条History、settings逐字段相同，正式9333窗口显示单行/双箭头/automatic并保留；隔离PID33316/CDP10969/18319清理，正式窗口不启动队列。
- 2026-10-27编辑器修复（patch，替代此前仅压缩全局用途下拉的方案）：用户明确要求撤掉后加控件、默认全自动，并修复末段被裁切。已移除全局用途选择及其专用样式/标签；新脚本默认automatic，现有assisted选择与sharedPreamble旧队列兼容不迁移。分段tablist改为自动换行，无新增按钮；真实隔离Electron在1440×900、1280×800、900×800均展示全局+16段，并以实际鼠标坐标点中16段。定向4文件19项、最终287文件2688单元+6文件91集成、双typecheck、独立目录干净renderer/web/electron生产构建及440对比度通过。日志/截图`temp/long-tabs-*`；未运行GPU。用户主窗口已关闭后，把完整验证构建复制到开发dist并正常重开主窗口（PID81468/CDP9333），实际显示automatic、12页及自动换行，无额外控件；草稿、6条队列、137条History和设置与重开前逐字段相同。隔离PID46332/CDP9645及18319已退出，正式窗口保留供用户观察，不启动队列。
- Scope / Authority: 用户授权继续PLAN并要求纠正偏离Continuum的设计，随后授权关闭Unreal且不保存，并重点验收一次真实历史单图→复杂故事增强→120秒整包渲染。保留旧managed/原生回退及正式用户Run/媒体；P0 H3 4/4、旧Create3/3不重开。已有Run Extend 1/1已采样但发布失败，不重采；新增120秒新Run一次授权，计划12×10秒，目前0/12采样。新增Strata规划/分批详稿调用属于本次120秒验收，不用历史Strata0/4冒充新结果。
- Baseline: 原始研究为2026-10-18 / `475722c2c231da2aa8782d66e6c03d22a5913809` / `0.66.0`；P0开始时package为0.66.4，已有Strata服务/提示词、测试及契约改动，全部保留，不归入本任务。
- 权威：当前 [Architecture](../../ARCHITECTURE_CONTRACT.md)、[UX](../../UX_CONTRACT.md)、[Workflow](../../WORKFLOW_CONTRACT.md)。下述方案是提案，尚未替代产品契约。

## Resume

- 2026-10-27用户纠正Spectrum：官方Continuum支持受审计Spectrum并有Review续接实证，先前将off验收条件做成产品硬限制属于适配错误。已修正新Run capability/claim/graph，复用现有Spectrum补丁，冻结可选spectrumMode；旧缺字段等价off，Continue继承，用户中途切换被profile mismatch拒绝。移除三语言“关闭Spectrum”门槛文字；不改用户当前草稿、6条队列、Settings或运行App。34项定向通过，首轮typecheck指出旧task可缺字段，按off兼容修正；全量287文件2686单元+6文件91集成、双端typecheck和440对比度通过。为了保留用户正在观察的dist，在全新temp目录做桌面/Web/Electron干净构建通过（未执行会清理dist的npm verify）。本轮不新增GPU、不重开采样预算；当前窗口仍是此前构建，未自动重载。后续120秒真实验收应尊重用户Spectrum选择，不再默认要求关闭；开启后的GPU/质量仍待验。

- 2026-10-27最新用户指令：先不结束VS Code，改为把测试放进实际草稿/队列以观察UI；停止继续关闭/强杀VS Code，也不启动GPU。已在正式用户库原5条waiting任务后追加唯一`UI观察-手写分段稿-120秒.mp4`，task `1c9b6197-e5b0-40ce-8ef9-63a5baca20c4`，12×10秒/360p/20步/PyTorch/INT8 ConvRot，脚本版本全部source=user，显式标注未经过Strata。因为正式全局配置为sage-triton（当前长视频门槛不支持），用现有纯工厂冻结观察任务的独立PyTorch profile后离线原子导入，**这不是正式UI增强/入队可达性证据**，没有改全局设置来刷新原5条快照。正式App原先未运行，先完整备份并以SHA并发检查后导入，再正常打开主用户库。真实AppApi核对原5条任务全部已有字段、设置、History137条不变，草稿12页/Queue14个浏览按钮通过，截图复核通过。主App PID28024/CDP9333故意保持打开，停在第6条观察卡，queueRunning=false，Comfy未启动。备份/观察报告在忽略temp的`long-video-formal-ui-before-20261027.json`与`long-video-formal-ui-preview.json`；不得清理用户正在看的实际App，后续只能在用户要求继续渲染时处理测试GPU阶段。

- 2026-10-27恢复：已收到用户“允许正常关闭VS Code”的明确授权，向当前核对窗口PID9116发送正常关闭请求（返回true），窗口仍存在，未强杀/丢弃未保存内容。当前VS Code GPU进程58544的Windows分配约8.7GiB，机器空闲显存约12.3GiB，仍不足Strata20GiB门槛；其他用户进程未动。桌面工具Cua与原生node_repl均因`helper_unknown_error: setup refresh had errors`无法启动，已询问用户在窗口正常退出或明确授权不保存强制结束，等待回答。测试fixture/模型均未重开，没有新增模型调用或采样。上轮自有PID74028及11592/18309/43127已复核无残留。补齐Prompt journey新P3路径/测试/验收登记，语法及app-harness 9项通过，其他逻辑保持上轮完整verify证据。

- 当前暂停于真实资源门槛：120秒fixture的唯一实际增强operation完成两份权重校验后，因需要20.0GiB空闲显存/实际18.9GiB拒绝加载，模型稿0/queue0/视频采样0/12。不是后台仍在生成；`story-prepare.json`为真实失败，attempt1/2为模型点击前的探针失败，全部保留。已向用户询问是否可正常关闭额外VS Code（Windows约2.8GiB显存分配）；关闭Unreal的授权不泛化到其他应用。没有换模型/降低门槛。故事/12页布局已保存，测试实例已请求AppApi关闭。见[P3/120秒证据](evidence/p3-story-120.md)。待用户资源选择后，复核无活动请求并保留失败报告后继续真实增强→审稿→enqueue→render，不重采旧Extend。下面“准备中”段为本次操作历史。

- 2026-10-26 120秒准备中：已从真实History引用的36张原图中选桥下涂鸦街区（蓝车/骑手/行人/狗，source asset 207d1be6-2bef-4d2b-b615-8ab9c04b051e），隔离复制原图，固定12×10秒、360p实际640×352、20步/PyTorch/INT8 ConvRot VAE，无LoRA/Spectrum/插帧。真实拖放/布局/故事输入→增强按钮已触发当前Strata IQ3_XXS；实例`temp/create-smoke-6s4Pbb`，PID74028，CDP11592，Comfy18309尚未启动，Strata43127当前准备/哈希模型，operation 22442806-86ac-4f84-9aea-6a404b14bc37。活动probe进程由本轮exec管理；`story-prepare.json`仍running（ok:false初始占位），不得重跑prepare。前两次探针在模型点击前停止，分别是已为off的禁用Spectrum控件与IPC保存时序，零模型调用；失败报告保留attempt1/2，未改门槛或放宽超时。
- P3窄路线已实现：可选结构化longVideo增强请求仍走现有string API/Strata owner，整片planner JSON→每批最多3页详稿→严格ID/数量/布局/锁定/旧响应检查→一次model版本采用；自动模式整包、半自动选中页，普通单段契约不改。按钮缺图/布局/Strata时禁用，输入/换图/锁定/布局变化拒绝过期采用。双进度沿现有Queue transient/IPC增量更新，复制/reset清本地组值，浏览不跟随采样跳页。79项定向通过；完整verify287文件2683单元、6文件91集成、干净typechecked build和440对比度通过。真实LLM内容/整包提交/120秒输出尚未完成，不能用静态成功代替。

- 2026-10-26用户新增重点验收：明确授权关闭Unreal且不保存；PID79344已按授权结束，显存降至约4.8GB，内存空闲约18GB。目标改为从真实视频History挑选元素丰富的单张原图，复杂故事意图→真实Strata增强→一次120秒新Run任务包→渲染/History播放与内容审查；这是新增一次120秒采样授权，不重开旧P0/Create预算。当前开始接P3规划/分批详稿，120秒尚未入队/采样。双进度字段/IPC接线在工作区，尚待测试，不可标完成。
- 2026-10-26已有Run Extend已采样1/1但被应用prefix owner保护拒收，未发布History。真实新head是5a9b5d1103606f99；原三份文件SHA不变，新封装逐tensor的dtype/shape/bytes SHA与原前缀完全一致。对照正式3.10.2 `run_storage.py::_compatible_plan_prefix`明确新计划导入会创建raw副本，故跨计划强制owner/文件SHA不变的假设过严；同计划保护不应放宽。保留失败任务、单次提交journal和20秒输出，不盲重采；后续需具备明确导入来源/逐tensor/契约证明的恢复。当前测试App已关闭，PID13640/CDP9570/18309均无残留。原有prepare/finish失败报告及`temp/long-video-extend-prefix-audit.json`保留；新120秒Run预先固定完整布局，不借此伪造旧Run成功。

- 2026-10-26 Queue分页：单卡只读浏览冻结整片、全局意图/共享约束和实际采用段prompt；Extend用Run偏移显示未来第4段，复制当前页，原生单prompt不改。真实隔离Electron逐页click/焦点/快照不变通过，1280/1440/960/480四尺寸截图及无溢出复核通过。全量284文件2675单元+91集成通过；构建发现首项可空类型错误，修复后36项定向、干净typechecked build、440对比度通过，未放宽断言。自有PID29828及8195/18309复核退出；没有启动Comfy，原waiting任务保留。GPU仍约98%/22GB，Extend仍0/1，双进度/活动取消修复未完成。详见[Queue证据](evidence/p2-queue.md)。

- 2026-10-26已有Run续接入口通过至真实入队：独立`LongVideoRunSource`绑定原profile/head，真实15秒源的manifest及3个prefix owner/bytes/SHA只读通过；首个续组POST前再检查。History Continue→Extend继承seed42/20步/PyTorch/INT8 ConvRot VAE→确认布局/补详稿→错误head拒收且queue0→恢复精确原bytes→实际按钮新task ID通过。新增5秒任务保留waiting，GPU 0/1；当前外部Unreal约98–99% GPU/22GB、空闲RAM约2.4GB，不启动Comfy。自有Electron/9574与18309、Python复核无残留。详见[已有Run证据](evidence/p2-existing-run.md)。完整verify284文件2673单元+91集成/build/440对比度；末次名称与Queue展示调整后2文件39项、typechecked build/440再次通过。没有声称20秒新增组已生成。

- 2026-10-26 P2真实Create闭环通过：隔离AppApi自有Comfy，480×480/20步/PyTorch无LoRA，3×5秒→15秒360帧；32kHz音轨480000内容样本、AAC padding256。首组接受后暂停、runtime停止；waiting组后cancel/reset保留同task/Run，恢复只采余下两组，请求prefix为0/1/2，最后reused2/generated1且full-prefix/final=true。Queue移出、单History单版本，实际播放解码帧推进和返回通过。P2已3/3，P0仍4/4；不得为补证据重跑。详见[Queue接线证据](evidence/p2-queue.md)。

- 2026-10-26本轮第一项继续：Create单首帧FL2VA INT8手写脚本已接实际enqueue→Queue lease→父执行→完整音画/hash校验→稳定ID History事务；静态依赖版本/在线schema分离，已开始Run冻结profile/seed，副本新Run，暂停停在组后。全局文字显式区分创作意图/每段共享约束，遵循本地3.10.2 `v2/prompts.py`，分页不等于切镜。真实Electron键盘/拖放/按钮task ID、草稿隔离和真实重启通过。初期GPU被外部Unreal占用，待其空闲后才运行上述三组。完整verify为282文件2662单元+91集成、build及440对比度通过。已有Run新增段入口、AV登记、Queue分页/双进度、活动采样取消后的安全修复仍待实现；第一项/P2保持未完成。

- 2026-10-26父执行增量：冻结new-Run脚本/采用prompt/profile与稳定task/execution身份；不可覆盖的带hash链事件日志记录prepared→POST意图→prompt ID→accepted→validated→published。复用既有传输，提交前await意图持久化；未知提交停止，同prompt恢复等待，逐组核对prefix owner/hash，current-group完成不能冒充全片。固定发布身份用于幂等端口重试。详见[父执行证据](evidence/p2-parent-engine.md)。此为内部服务/真实临时文件/合成端口验证，未接现有Queue lease/recovery、真实媒体/History、已有Run父执行或UI按钮；不宣称真实多段提交或成片发布通过。

- 2026-10-26 P2编辑器增量：现有布局/分页/整片/锁定/版本控件接P1结构；逐字保存缓冲，失焦/切页形成版本，确认后改布局，尾页归档恢复。首次带入意图，恢复只读独立Draft，取消共享DOM缓存；Create/Extend和清空隔离。真实Electron输入/IPC保存/原生click→taskId及关闭重启恢复通过，四尺寸截图复核；多段增强/入队仍禁用，原生duration/prompt不改。见[P2证据](evidence/p2-editor.md)。本增量不等于完整P2或长片提交可用。

- 2026-10-26继续：P1新增共享布局与脚本内核、可选`Draft.longVideoScript`，不改旧duration/prompt/Queue。稳定ID显式映射、归档页、逐页版本、整包revision、锁定/失效/用户复核、整片原文缓冲与冻结组合均有定向检查；真实JsonStore重启覆盖旧/新草稿。普通组帧投影复核官方累计算法及Python半帧取整，预计帧与实际输出严格分开。见[P1证据](evidence/p1-script-kernel.md)。生成方式的catalog/依赖/schema能力投影以及编辑器UI仍待P2接线，不宣称P1产品交互已经完成。

- 2026-10-26执行：用户升级后的正式Continuum已核实为干净3.10.2 / `308653cff108061a94381cef446fef985384b214`，Core0.42.0。独立GroupReceipt、冻结请求校验、不可覆盖检查点和new-run/next-group内部服务已实现；应用H3包新增能力版本0.4.0，旧AV schema/producer及managed收据不改。证据见[分组执行](evidence/p0-group-execution.md)。此前版本推荐评估保留在[历史记录](evidence/continuum-3.10.2.md)。
- UI现状：现有段数/整片/锁定UI已接结构化持久化；窄路线Create已实跑，已完成group Run可从History进入Extend并实际入队，但新增组GPU待验。Strata增强未接。共同段长、累计16段、物理组与逻辑页分离；独立AV导出控件在分组模式隐藏，不冒充保存AV，必需Run Storage仍保留。原生30秒与旧Extend回退保留。
- 已明确交互：沿用Create图生视频/Extend；时间与运动移至LoRA前，H3生成方式分原生15.1秒/原生解锁30秒/Continuum多段，整包上限120秒；确认段数布局、逐页版本、一次提交、Queue单卡及History普通成片。原生30秒用户负反馈影响默认推荐，不撤销[独立工程交付](../../archive/h3-native-30s/TASK.md)。
- 本次补充：一个Run可含多个段prompt；分页是编辑视图而非执行要求。建议“整片/分段”共用一份结构化脚本，长稿按段编译，不把上万字反复交给每次采样；全自动/半自动负责写作方式，不等于逐段人工审批。
- 时长/身份：同Run共用段长、累计最多16段；约10秒目标是初始化启发式而非实测最优。原图持续参考不简单等同必须Ref2VA；当前Continuum Reference尚未接入，新生成角色采纳与跨Run移交需新增验证，不要求用户预制角色资料。
- 状态：旧managed accepted>0/head保护保持；独立new-run服务不借旧续写入口创建首段。Create UI、整包revision、逐页稳定ID、组后恢复与单History已接；分层修复、已有Run新增段、独占文件回收及完整History回流仍待实施。P0服务层成功不代替P2单独的UI/GPU/History证据。
- P0历史决定（2026-10-20）：实际Continuum为干净3.9.1，已具备当前物理组投影；当时保留此基线。2026-10-26更新推荐至3.10.2，但不以升级代替应用适配。正式new-run独立入口、预设完整布局；旧managed逐次续接与accepted>0/head保护保持不变。见[P0证据](evidence/research.md)。
- 已解除：独立分组receipt明确planned/accepted、物理组及输出scope，并实证计划3段仅完成2段。旧完整前缀收据保持严格；部分输出不标全片。末次Review完整解码/Finalize可生成10秒成片；中间组仅输出当前5秒，Finalize仍不是Run目录读取器。
- 下一步：完成已授权的VS Code正常退出（不保存强制结束须有用户额外授权），资源满足后恢复`temp/create-smoke-6s4Pbb`：先核对无活动请求/queue0，保留真实资源失败的story-prepare报告，再用现有真实按钮重试增强，审阅12段模型脚本→实际enqueue→render唯一120秒Run→音画/History播放/故事质量验收。不能直接重跑wx报告或绕过显存门槛。旧Extend已1/1采样，不再执行其finish盲重采；后续补官方跨计划导入的逐tensor/契约来源证明并安全恢复。P0 4/4、Create3/3不重开；canonical AV、活动取消修复、持续Reference/跨Run与120秒结果仍未完成。

## Implementation and resources

- 2026-10-20变更限本任务文档及[managed回归断言](../../../tests/h3-continuum-managed.test.ts)。2026-10-26新增catalog推荐、版本断言、CPU兼容探针及相关契约/Unreleased更新；保留其他History预览等未提交工作，不升应用版本、不打包。
- 后续实施要按实际改动更新类型/迁移、Queue/History、工作流契约、用户旅程和 Unreleased；预计 minor 功能，尚未发生版本变更。
- 运行资源：独立data/custom_nodes与state/输出均在忽略temp；模型仅junction读取，正式节点/Run未改。两轮自有Electron及8199均经AppApi停止/关闭，5527/6769/8199监听与主PID复核已退出；保留测试Run/视频/检查点作为证据。此cleanup不证明原生窗口退出生命周期。

## Evidence / handoff

- 2026-10-26父执行器：最终`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（279文件2656单元、6文件91集成、干净typechecked build、440对比度）；此前4文件30项定向与双端typecheck通过，新增取消/日志损坏断言由完整verify覆盖。无超时/断言放宽，无GPU/运行时或UI操作；原有历史预览及加速评估工作保留。没有新增Queue类型/IPC/state schema，应用仍0.67.0，未打包/发布。边界与恢复证据见[父执行证据](evidence/p2-parent-engine.md)。

- 2026-10-26 P2编辑器：最终固定状态`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（277文件2640单元、6文件91集成、干净typechecked build、440对比度）。真实隔离Electron `probe-long-video-editor.mjs`通过首次意图/实际输入/IPC保存、原生按钮新task ID、多段禁用与重启同ID/文字/锁定/当前页；1280×800、1440×900、960×800、480×800截图复核。一次启动扫描等待超时先确认零task，再清空合成prompt恢复夹具重验；无盲重提/超时放宽。自有夹具均经现有AppApi清理，未启动Comfy/GPU；资源复核与限制见[P2证据](evidence/p2-editor.md)。

- 2026-10-26 P1内核：最终4文件27项定向、双端typecheck通过；完整`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（275文件2634单元、6文件91集成、干净typechecked build、440对比度）。末次整片缓冲保护定向重验通过。旧/新草稿真实JsonStore文件重启、ID/版本/锁定、原文保留与冻结快照均覆盖；14个本地链接、既有文件CRLF与scoped diff检查通过。无GPU/服务启动，无正式state/Run/媒体写入，应用版本仍0.67.0，未打包/发布。详情见[P1证据](evidence/p1-script-kernel.md)。

- 2026-10-26 P0执行：最终整合`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（272文件2617单元、6文件91集成、干净typechecked build、440对比度），Python8分组+13守卫+2attention通过；无超时/断言放宽。四次GPU采样及两次真实AppApi生命周期、实际AV/hash/帧/音轨/检查点证据见[分组执行](evidence/p0-group-execution.md)。27个本地链接及scoped diff检查通过，原有其他改动保留；应用仍0.67.0，内部节点包0.4.0，无打包/发布。
- 2026-10-26手动刷新跟进：确认“重新扫描全部”穿过实际按钮→coordinator→preload/IPC携带full与refreshReleaseVersions；补强版本缓存失效，旧在途请求不可被复用/回填缓存，旧finally不可清除新pending。真实DOM按钮回归、响应两种先后顺序及扫描调度共5文件33项通过，双端typecheck通过。未改用户窗口、安装或GPU。
- 2026-10-26提示修正：按用户截图将Continuum固定提交设为推荐策略，避免红色revision硬错误和重复更新；最新查询增加GitHub API、保留重定向回退，不长期缓存仅Registry/源码结果，Registry来源直接显示。真实查询返回3.10.2/GitHub Release，5文件63项及双端typecheck通过；详见同一[评估](evidence/continuum-3.10.2.md)。
- 2026-10-26：3.10.2固定源码与正式3.9.1各14项真实文件/CPU协议探针通过，CUDA未初始化；现有Python守卫11项、attention2项通过。5文件44项定向Vitest、集成6文件91项、干净typechecked build及440对比度检查通过。完整verify未全绿：首轮2582通过/11超时；4 worker复跑2589通过/4超时，均余于managed-software-cache；该文件单跑29通过/2超时。未修改超时或断言，未修无关缓存代码。新证据见[评估](evidence/continuum-3.10.2.md)。
- 2026-10-26收尾：本次既有文件CRLF保持、相关文档本地链接与scoped diff --check通过，无本任务意外删除。正式节点未更新、用户state/Run/媒体未写；探针临时AV已清理，候选源码/日志留忽略temp。未启动Electron/ComfyUI/GPU，无监听清理；实际升级后的在线schema与GPU/History续接仍未验。patch影响已入Unreleased，应用仍0.67.0，无打包/发布。
- 实际检查：初始 `git status --short` / `git diff --stat`、受影响当前 TS 与文档、`npm.cmd run harness:app -- list` / `guide extend`、官方源码/模型卡/社区作者仓库与 GitHub 固定 revision。
- 文档验收：2026-10-18，本任务3份文档及任务索引的本地链接/空白检查通过，`git diff --check`通过；索引仅新增1行，保持CRLF，无本任务意外删除。检查源码路径及命令一致性；并发Strata/History改动保留，不归入本任务交付。
- 2026-10-20：已按最新交互重排现有PLAN并补充研究来源，替代旧第四模式/P0-P4描述。3份文档47个本地链接、10张表及P0-P6/交互覆盖检查通过，scoped `git diff --check`通过；保持CRLF并复核最终差异。仅文档变更，不运行build/verify/GPU。
- P0检查：现行managed/comfy-ui基线70项通过；新增预设3/12段首组拒收断言定向通过；Run锁守卫11项通过；安装源码时间自检＋18个网格、6个投影、4个合成receipt场景通过；隔离Electron TS编译及双端typecheck通过。
- P0记录终检：3份文档52个本地链接、11张表、P0-P6标题/阻塞标注及编辑器诊断通过；4个触及文件保持CRLF，scoped diff --check通过。变更限文档与3行测试断言，无新增运行行为或版本变化。
- P0限制：所选Python缺pytest，上游pytest套件未运行，未擅自装包；改为直接执行实际纯函数/receipt方法，不计作完整上游套件通过。在线object_info、new-run真实输出、音画/恢复/零新增采样、Strata规划质量和120秒峰值均未验；按已发现的协议阻塞停止GPU实验，无全量verify/build或模型加载。
- 执行环境的普通沙箱进程中途出现 `helper_unknown_error: setup refresh had errors`；随后通过已批准的只读命令继续调查，未发生自动审批拒绝。
- 实际模型/effort、token usage：工具未提供可靠统计，unknown。
