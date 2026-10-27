# P2 Create 入队与 Queue/媒体/History 接线

2026-10-26；minor 功能增量。当前任务状态以 [TASK](../TASK.md) 为准。

## Queue只读分页增量

- `queue/prompt.ts`从冻结execution script或入队plan显示整片、全局用途及每段实际编译prompt。共享约束只按官方编译规则加入每段；创作意图可单独查看但不混入采样。Extend只列未来页并使用Run段号，原生任务保留单prompt。切页保持展开态、焦点和各页DOM；复制当前页，token估算跟随当前页；不改Draft/Queue快照，不跟随采样自动跳页。
- 全量测试284文件2675项及6文件91集成通过；首轮build发现数组首项可空类型错误，补空值处理后重验2文件36项、干净typechecked build和440对比度通过。全量测试证据复用，未宣称首轮verify整体通过。
- `probe-long-video-queue-pages.mjs <fixture> --port <port>`复用已有隔离waiting任务，实际点击整片/全局/未来段，检查焦点、实际prompt/Run段号、queue完全不变；1280×800、1440×900、960×800、480×800均只有一个可见prompt且无内容溢出，四张截图已人工复核。实际用例为accepted3后的第4段；更多页/共享约束及复制由DOM单测覆盖。未改变既有任务或启动Queue/Comfy。
- AppApi清理后PID29828、CDP8195和Comfy18309均复核退出，保留已有waiting任务与证据，不证明原生退出生命周期。外部Unreal仍约98% GPU/22GB；已有Run新增物理组仍0/1，Create3/3及P0 4/4不重开。独立双进度、活动采样取消安全修复仍待完成。

## Continuum 设计校准

- 2026-10-27 Spectrum纠正：下文“首版无Spectrum”是当时已跑通样本条件，不是Continuum要求。应用新增可选冻结spectrumMode并实际构图，旧profile缺字段按off，同Run恢复/Continue继承且不允许随意改变；节点/schema和官方受审计v6兼容检查继续生效。全量2686单元+91集成、typecheck、临时目录干净构建与440对比度通过；未新增Spectrum-on GPU样本，不修改正在看的实际UI观察稿/Queue。

- 对照本机固定 3.10.2 的 README 与 `v2/prompts.py`：同一 Run 保持采样模型、seed、首帧、尺寸、采样参数及兼容前缀；分页不是独立镜头。已完成目标后重复 Review 可能新建 Take，不能充当纯读取或任意恢复。
- 官方 timeline preamble 会加入每一段。全局整片动作直接重复可能造成动作复演；编辑器显式区分“创作意图（不直接采样）”与“共享约束（加入每段）”。旧草稿默认意图；只有显式选择共享用途才编译前缀，变更用途使段落需复核。手写页必须自含所需采样描述；Strata 动作分配尚未接入。
- 同一组必须完整接受，终端合并组不能按逻辑页拆开；完整前缀收据和实际完整音画分别验证。

## 当前实现

- 沿用 `AppApi.enqueue`、generation task、单 Queue worker/GPU lease，没有第二套 worker 或临时 IPC。入队冻结选中页/布局及输出根；首个 claim 冻结实际上传的首帧与采用 profile，继续复用同一 task/execution/Run。
- 首版范围：Create、FL2VA INT8、单首帧、≤720p、无插帧/LoRA/Spectrum/稀疏注意力，compatibility runtime、compiler disabled、Sage/PyTorch。不改变不支持的用户选择。现有离线 scan 检查模型及 Continuum 3.10.2+/应用 H3 0.4.0+；无 scan 遵循既有 Queue 准备阶段检查策略；提交前仍实际核验 object_info/守卫 schema/空运行队列。
- 暂停沿用 Queue flag：完成当前组并保存收据后，下一组前返回 waiting。取消仍走既有 Queue server cleanup；reset 保留已冻结执行身份和 journal，submitted 只等原 prompt。服务端采样已被取消/失败时尚无安全重采样修复；未知 POST 不自动重试。
- 已开始 Run 不接受 waiting acceleration/随机 seed 修改，普通编辑返回入口禁用；复制清除 execution，保留脚本并生成新 task/Run。未开始任务和 History 的调整可恢复选中脚本；普通任务恢复会清除无关长视频草稿字段。
- 媒体适配器实际遍历 video decode frames、完整解码 audio 到计数 PCM，核对尺寸/24fps、目标帧、音频内容样本与编码 padding，计算文件 SHA 并在发布前重验。History 与 Queue 删除在现有 store 事务里完成，固定 task/execution 身份，重复发布只保留一条作品/版本。
- 新成片保存完整 frozen execution/group receipt；尚未冒充 canonical JointAV 或 legacy managed Sequence。Run owner 留在独立输出中；本轮不删除这些文件。

## 通过的验证

- 定向：新增真实 DOM 缺首帧→图片 picker 恢复→按钮 task ID→冻结草稿快照；script 共享前言与复核；真实 JsonStore 发布重复回调/媒体被替换/Queue pause；父执行重放、前缀 owner/hash、提交意图；真实 ffmpeg 合成媒体解码。最后邻接4文件47项通过，双端 typecheck 通过。
- 最终固定状态 `VITEST_MAX_WORKERS=2 npm.cmd run verify`：282文件2662单元、6文件91集成、干净 typechecked build、440对比度全部通过。此前整轮有1个既有 managed-software-cache 超时，单独复核4个超时；未放宽断言/超时，最终完整同门禁通过。
- 真实 Electron：独立空 userData/输入/输出，选15秒、3×5秒、480×480、20步、PyTorch，无 LoRA；真实键盘逐页输入、CDP文件拖放首帧、可用 enqueue 按钮，得到稳定 task ID。之后修改草稿不改变 queue plan。第一次连接早于 AppApi ready、第二次探针尝试修改已选且禁用的 Spectrum 控件，均零 task 后停止；修正探针后新的空夹具通过，无盲重提。
- 真关闭/重启同一独立状态后，queue ID、冻结 plan、later draft edit 各自保留，queue 仍停止、History 为空。1440×900、1280×800、960×800、480×800截图复核；全局用途控件和主按钮可达。背景窗口使用 focus emulation。
- 当前媒体适配器只读 P0 已生成10秒成片：240帧，32kHz音轨内容320000样本、AAC padding512样本，完整解码/hash通过。这不是本轮 Queue 生成或发布证据。
- 随后外部GPU工作结束，应用启动独立Comfy，原任务按480×480、20步、PyTorch、无LoRA执行3×5秒。第一组提交后暂停，接受1/3后返回waiting，History空、runtime停止。组后cancel/reset保留同一execution；恢复只采余下两组。journal仅3个submitted，请求prefix为0/1/2；旧owner/hash保持，最终reused2/generated1、accepted3、scope full_accepted_prefix、final=true。
- 最终媒体15秒360帧，32000Hz音轨480000内容样本、AAC padding256，完整视频/音频解码和SHA重验通过（约1.09MB）。仅一条History/一个version，Queue移出并idle。`verify-video-smoke.mjs`真实点History→play→解码帧增长→返回原卡片，通过15秒/480×480/24fps元数据比对；未用`--continue-source`，不冒充同Run新增段验收。

## 未完成与资源

- **P2 GPU3/3，已用尽**。初期外部Unreal占用GPU时未接管；待GPU约6%/5.5GB、物理内存空闲约28GB、无其他Python采样进程后才执行。最终GPU约4%/3.8GB。P0仍4/4，不重开旧2/3 Run；P2也不为补证据重复采样。
- 当前通过的是完整组后的暂停/cancel/reset/续跑；活动采样取消后的安全修复仍未验。下一步为已有Run新增段、AV登记及Queue分段导航。
- 已有Run新增段入口、canonical AV/Sequence登记、Queue分段导航/双进度、采样已取消后的安全重采样、完整History/来源回流和共享文件清理未完成。120秒、长片资源峰值、参考一致性与内容质量未验；第一项/P2继续保留未完成。
- 三个本轮隔离夹具只经现有 helper/AppApi关闭，保留日志/草稿/等待任务作证；没有 Comfy 采样子进程。关闭 helper 不是原生退出生命周期证明。最终PID/监听复核见 TASK 收尾。
- 正式用户 state、正式节点、Run、媒体不修改；已有History hover与加速评估工作保留。应用仍0.67.0，不打包、提交或发布。
