# 前置 Handoff: 三类 H3 latent 需求的可行性核查

- 类型：HANDOFF / 源码核查与有界探针，不是实施任务
- 日期：2026-09-19
- 权威状态：[TASK.md](TASK.md)
- 当前交接状态：accepted-with-scope；有限可行性核查通过，以末尾复审结论为准
- 执行者：用户另开的 Luna session；不派子 agent
- 实施门禁：研究通过不代表功能完成；实施仅以交接方修订后的 [HANDOFF_PHASE_1.md](HANDOFF_PHASE_1.md) 状态和范围为准
- 执行结果：Luna已补齐矩阵、源码索引、脚本和结果；交接方校正证据引用与Native适用范围后接受有限结论

## 1. 问题与允许的答案

用户要求先验证：Continuum、Motion Context、Native latent upscale 三类需求，是否真的能共用生成时保存的一份 AV latent 和必要元数据。如果源码或实验反驳此前假设，应重新考虑架构，不是修改节点去强行证明方案正确。

**你的任务是试图证伪并限定方案，不是替既定方案找支持材料。** 已有 `H3AvLatentAsset`、adapter、capability 名称和 Phase 1 字段草案都不是兼容性证据。先读本文件和源码事实，再回头评估 Phase 1；不要先照着 Phase 1 的实现步骤改代码。

三类需求在核查时拆成四条消费路径：

1. Native JointAV latent upscale / 二次采样，包括当前应用允许的模型、role、context 范围。
2. Motion Context 的磁盘载入、上下文提取和采样消费。
3. Continuum 外部 AV 兼容导入 / bootstrap。
4. Continuum 官方 managed Run Storage 续写 / Retry。不能用第3条成功替代第4条结论。

本次是四个实现 phase 之前的一道研究门，不增加一整轮实现，不沿用历史“Phase 0”的完成结论。

## 2. 把“统一”分层回答

| 层次 | 要回答的问题 | 不能混淆的事情 |
| --- | --- | --- |
| 操作统一 | 一个保存开关、一套资产关联/UI 是否可行？ | 即便数据不能共享，UI仍可能统一；不代表只有一个底层文件 |
| 存储统一 | 同一次实际 AV 产物是否可只保存一份原始 video/audio tensor及必要元数据？ | 一条累计MP4可能对应多个chunk；“每个产物不重复”不等于“整条视频一个latent” |
| 消费统一 | 各消费者可否从同一owner无损构造其需要的输入？ | Python wrapper可以不同；但同shape/同key不证明latent含义相同 |
| 运行状态复用 | 这些数据是否足够恢复官方Run、上下文或二采所需的状态？ | Run索引、采样契约、原始conditioning可能不是AV文件本身能提供的 |

“无损适配”允许重建字典/包装、重排可逆结构、按消费者本身的算法从完整源取上下文视图；必须说明具体变换及范围。改变tensor数值、精度、有损量化、缺失前缀的猜补、从MP4重新编码或重新采样，不可称为同一份原始AV的等价复用。

核心假设 H：**对明确列出的生产路径，保留一份真实AV payload和可取得的必要元数据，就足以供适用的消费者按各自合同读取，不必为了包装差异另存一份等价payload。**

另行审查更强命题“所有H3输出都适用于三个消费者”以及“任意AV都能恢复managed Run”。它们不应被当作H的默认前提，也不能只证伪其中一个就不再回答较弱的共享方案。

## 3. 范围、权限与成本

- 只读生产代码、已选Comfy core和custom_nodes源码、现有API图、已有测试文件/运行证据。
- 可在仓库忽略的temp目录编写少量探针、生成小型合成tensor及报告；所有写入只能是本次独有的测试文件，不覆写现有数据。
- 可更新本文件的回填区和TASK当前交接摘要；不改应用TS/Python、workflow、schema、manifest、catalog、版本号或Phase 1实施条目。
- 不安装/升级包，不下载模型，不修改ComfyUI、用户settings/state、真实History/queue或已有latent。
- 本次GPU新生成预算为0，不启动/重启/停止ComfyUI或用户应用。已有本机服务空闲且允许只读查询时可获取 `/object_info`，否则记录schema未在线复核。不要为了核查重跑此前15秒×3。
- 使用适用的 Python fact-grounded coding skill。核查选定Comfy环境、实际类与调用链；解释器来自应用选定安装，不能把VS Code中另一个Python的行为当成生产事实。
- 不做仓库全量build/verify；本次没有生产代码修改。已有窄测试/只读探针按风险选用，不为报告堆检查数量。
- 不修改探针假设连续重试：每个局部问题至多一次修正后重跑；仍不明就列unknown及最小下一实验。遇到需要权重/GPU初始化的import不要绕过核心逻辑制造通过。

## 4. 先定位真正的生产与消费代码

先读取 [SOURCE_CONTRACT_MATRIX.md](SOURCE_CONTRACT_MATRIX.md) 的入口，不重复研究完整升级历史。它记录的是此前版本事实，不是当前兼容性结论；核对本机选中版本后再引用。

| 路径 | 起点 | 必须继续追到哪里 |
| --- | --- | --- |
| 自有AV保存/加载 | [nodes.py](../../../comfy_nodes/LocalVideoStudio-H3/nodes.py) 中 `LocalVideoStudioH3SaveJointAV`、`LocalVideoStudioH3LoadJointAV` | 包装解开/重建、真实tensor key/shape/dtype、是否clone/cast/裁切、实际safetensors写入/读取 |
| Native二采 | [minimax_h3_fl2va_learned_3d_second_sample_av_api.json](../../../workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json) 及当前启用二采图；[native-av-artifact.ts](../../../electron/services/native-av-artifact.ts) | 实际latent upscale/二采节点及其消费处、模型/VAE/conditioning、role和context约束；区分应用限制与上游算法限制 |
| Motion Context | 选定安装中的 `ComfyUI-H3-Motion-Context`：`MiniMaxH3MotionContextSaveLatent`、`MiniMaxH3MotionContextLoadLatent`、`MiniMaxH3MotionContext`、`MiniMaxH3MotionContextTrim` | 文件反序列化后的包装、视频/音频上下文长度与切片、prefix/位置编号/采样注入、失败fallback；不只读Save/Load |
| Continuum兼容 | 自有 `LocalVideoStudioH3ArtifactToContinuumState` 与 [兼容API图](../../../workflows/minimax_h3_continuum_v38_extend_api.json) | 官方runtime选择/拒绝initial_state的条件、实际Masked AV/其他transport如何读取、是否重新编码或fresh fallback |
| Continuum managed | 选定安装中的public `H3ContinuumSamplerV38`、RunStorageController和review/assembly实现；[managed API图](../../../workflows/minimax_h3_continuum_v38_managed_extend_api.json) | commit/save与load/validate的chunk内容、采样契约、外部媒体hash、head/manifest/provenance；AV之外有哪些无法凭空重建的状态 |
| 应用适配声明 | [h3-av-adapters.ts](../../../src/core/h3-av-adapters.ts)、[h3-av-asset.ts](../../../src/core/h3-av-asset.ts) | 分清“声称有能力”“选路径”“实际调用loader/消费者”三者，标出尚未连接的部分 |

遇到别名/包装类，沿真实调用继续一跳到计算/变换tensor的函数。记录已安装package版本、Git revision或必要源文件hash；使用包内相对路径、symbol及行号定位，不把机器绝对路径、整份源码或用户Prompt写入仓库文档。

## 5. 必须回答的源码问题

对四条消费路径分别回答，不允许一段“都是safetensors所以兼容”概括：

1. 输入是怎样的Python对象？有哪些必需key、辅助mask/index/scaling信息？Save与Load是否丢失任何键？
2. 磁盘到底保存哪些tensor？video/audio是否为同一次采样的clean输出，还是含噪、中间预测、归一化/缩放后的状态？保存节点有无cast、转置、concat、裁切？
3. shape各维的意义、dtype、时间网格、帧率、视频VAE/音频VAE及模型族要求是什么？跨T2V/I2V/R2V/变体是否只是同shape但语义不同？
4. Motion默认视频context22、音频context24具体在哪个坐标系执行？原AV需要保留哪些prefix/tail和完整音频才能重建？不能从assembly trim数直接推断采样transport。
5. Native upscale为何限制FL2VA/context/role？是现有应用产品限制、节点硬检查，还是latent算法本身限制？移除校验不是证明兼容。二采是否还需要原图、conditioning、模型信息？
6. Continuum兼容导入接收的state怎样从AV构造？哪些条件明确拒绝或回退？过去一次成功能覆盖哪些来源，不能覆盖哪些？
7. managed恢复除了chunk AV还验证哪些manifest、contract、媒体hash、版本和父链？普通AV缺失的信息是否可从当次生产合法保存，还是根本没有对应的官方Run历史？
8. 一个被拼接过的Extend成片，对应的AV是新段还是累计序列？Managed最后chunk能否支持对整个累计视频的操作？哪些消费只要末端上下文，哪些需要完整时间轴？
9. 若存在格式差异，能否在内存无损重建consumer wrapper而不另存payload？指出最小适配位置。若必须生成不同tensor，说明为何、是否仍能保留原owner并推迟派生产物，而不是把两份数据称作一份。
10. 不修改上游、只增加应用自有薄适配层是否足够？需要改变第三方不变量/伪造Run/降级为普通接续才成立的方案应判为当前目标下不成立。

## 6. 最小证据与探针

按成本由低到高，够回答就停。源码结论、合成探针、真实采样证据必须分栏，不能混用。

1. **源码链路**：为每条关键结论给出producer与consumer的实际函数、字段和校验条件。README与代码矛盾时记录冲突，不能挑有利的一方。
2. **已有真实文件只读核查**：选择已有的普通/旧JointAV、Motion slot、managed chunk代表文件；缺少某类就记录缺口。核对header、key、shape、dtype、元数据及hash；不要因为不同生成样本hash不同就断言格式不兼容。
3. **CPU小型round-trip**：在合法小尺寸下使用带可辨识非零值的video/audio tensor，经过实际Save/Load或其真实纯函数，再进入可独立调用的consumer输入校验/上下文提取。比较dtype、shape、顺序和值，分别检查video/audio。不要只用全零数据隐藏重排错误。
4. **必要反例**：从实际代码约束选最小反例，例如缺audio/必需元数据、错误前缀范围、错误模型或缺Run状态。记录它应被拒绝还是如何回退，不凭本文件例子预设结果。

文件系统路径可注入本次temp目录；不能mock掉关键加载/校验/变换函数后宣称真实兼容。无法无权重执行consumer时可停在源码证据，并明确哪项仍需运行确认。不要运行整个大图来绕过一个可独立核查的函数。

探针最多4组：自有AV round-trip、Motion消费、Native消费、Continuum兼容/managed合同检查。可共用测试数据，不建立大型测试框架。一次反例足以推翻相应的全称命题，但仍需说明其他已确认可共用的子集。

## 7. 交付：有条件的结论，而不是“应该可以”

### 7.1 必填消费矩阵

每格填：`直接满足`、`无损适配`、`还需额外状态`、`不支持/非等价`或`unknown`，附证据编号。可组合“无损适配 + 额外状态”。每个来源限定到实际版本、生产阶段和范围，不用含糊的“所有H3”。

| 来源 | Native二采/upscale | Motion Context | Continuum兼容导入 | managed Run续写/Retry |
| --- | --- | --- | --- | --- |
| T2V产物（普通 app sampler AV） | 还需额外状态 / unknown（E06,E11；按实际executionModelId等预检，不按T2V标签判断；非FL2VA模型当前不支持） | 无损适配 + 还需额外状态（E03,E08；格式层依据，来源语义与实际采样未全覆盖） | 无损适配 + 还需额外状态（E02,E04；bounded tail构造，非所有来源transport验收） | 不支持/非等价（E05；没有official Run contract） |
| I2V/FL2VA产物（exact clean AV、context=0） | 无损适配 + 还需额外状态（E06,E08,E11；wrapper可逆，learned二采未运行） | 无损适配 + 还需额外状态（E03,E08；同几何、目标conditioning及消费接线） | 无损适配 + 还需额外状态（E02,E04；仅legacy bootstrap） | 不支持/非等价（E05；普通AV不能冒充managed Run） |
| R2V产物 | 不支持（E06,E11；当前应用FL2VA预检，不是算法不兼容证明） | 无损适配 + 还需额外状态（E03,E08；格式层依据，canonical路径尚未接通） | 无损适配 + 还需额外状态（E02,E04；bounded tail，真实transport仍需验证） | 不支持/非等价（E05） |
| I2V/FL2VA Extend新段 | unknown + 还需额外状态（E11；collector可写context=0，预检不按segment role拒绝；不能把新段当累计成片验收） | 无损适配 + 还需额外状态（E03；仅新段末端context，不代表累计成片） | 无损适配 + 还需额外状态（E02,E04；新段bounded state，不恢复旧前缀） | 不支持/非等价（E05；没有managed manifest/lineage） |
| Motion Extend新段 | 不支持（E06,E11；当前模型/context预检，不是算法结论） | 无损适配 + 还需额外状态（E03,E08；旧slot可读，canonical接线待实现） | 无损适配 + 还需额外状态（E02,E04；只取该段尾部，未全覆盖实际transport） | 不支持/非等价（E05） |
| Continuum兼容输出新段 | 不支持（E06,E11；当前模型/context预检） | unknown + 还需额外状态（E03；wrapper可构造，来源时间范围/尾端语义未运行验证） | 无损适配 + 还需额外状态（E02,E04；仍需transport/fresh-fallback证据） | 不支持/非等价（E05；不能伪造managed Run） |
| managed单个chunk raw file | 还需额外状态 + unknown（E10,E11；缺manifest被拒绝，补manifest也不等于二采适用） | 无损适配 + 还需额外状态（E03,E10；loader可读，chunk尾端与最终assembly对应未验收） | 不支持（E07；应用禁止managed降级为legacy，不是tensor不兼容证明） | 还需额外状态（E05,E08；manifest/contract/head/provenance必需，单chunk不足以Retry） |
| managed完整Run及关联媒体/元数据 | 不支持（E06,E11；当前应用产品范围，非完整Run二采算法证明） | unknown + 还需额外状态（E03,E05；最后raw chunk不自动等于最终成片末端，需核对assembly trim） | 不支持（E07；不以legacy bootstrap代替official Run） | 直接满足（E05及TASK既有Continue/Retry；限原Run、contract、媒体和版本有效，不包含未通过的Take分支） |

“无损适配”仅限格式/取view合同，不承诺各来源已完成采样消费。Turbo/GGUF各变体sampler出口的clean语义尚未逐图证明，保持unknown，由Phase 1图覆盖确认；不能按同shape赋能力。first-pass与second-pass是不同产物，后者有learned变换/再采样。旧文件缺元数据不能猜补，也不代表新生产无法取得这些信息。

### 7.2 选择一种结论并解释边界

- **可行，限定范围**：列出可共享的准确来源和消费者、最小必需元数据、无损适配位置、原实现/真实运行尚待补齐之处。不是保证生成质量。
- **部分可行，需修订方案**：列出可共享子集和必须独立保存的数据；是否还能保留一个UI开关、一套逻辑资产以及自动选择依赖。
- **统一存储假设被反驳**：给出最小反例和不可等价原因。建议改为统一资产入口管理多种真实产物，而不是强迫单payload；说明成本与功能取舍，禁止直接实施替代方案。
- **证据不足**：列出缺失源码/版本/文件/运行条件和一个最小下一实验。不能把unknown自动写成可行，也不能把import失败写成算法不兼容。

任何结论都必须列一条“什么新证据会推翻/缩小本结论”。如果反例只说明某模型不能Native upscale，准确缩小那个组合，不泛化成所有共享都不成立。

### 7.3 对原Phase 1的影响

以 [HANDOFF_PHASE_1.md](HANDOFF_PHASE_1.md) 为待审设计，列出保留、删除、需重新决定的条目。重点审查：单份payload目标、保存开关的managed例外、旧任务兼容标记、sampleScope/context元数据、移除Motion独立writer是否可行以及消费者接通顺序。

不要被原文“已确定/允许”措辞约束结论：用户已经要求将它们退回假设审查。只提出修订，不自动恢复Phase 1的ready状态；由交接方验收证据并重写/放行后再实施。

## 8. Luna 回填区

### 执行摘要

- 状态：ready-for-review；本次为补交，不是 accepted，也不解除实施门禁。
- 最终结论类别：部分可行，需修订方案。
- 一句话结论及适用范围：对当前版本、合法 H3 AV sampler output，原始 `video/audio` payload 可由 app Native Save/Load、Motion Save/Load 和 Core AV wrapper 在限定范围内共享；Motion conditioning、Native 二采派生产物、legacy Continuum bounded state、managed Run contract 仍是不同消费合同，不能宣称任意 H3 产物自动具备四种能力。
- 实际节点/core版本、revision或源码hash：ComfyUI `0.35.0` / `6338e4bd428247a4a8843496aa98fb7f2a9d3632`；Continuum `3.8.2` / `c38c616d54feb0310a3ca7540f2f4addc499fd1f`；Motion Context `0.6.2` / `5335715abe54c1a9bfbe3494da29aae3e8635ce3`；upscaler revision `d7c01b90`。symbol定位与产物hash见 [REPORT.md](../../../temp/h3-latent-feasibility-probe/REPORT.md)；未提供整套源码hash清单。交接方另比较了安装版自有节点与仓库源码，SHA一致。
- 检查的Python环境是否对应应用选定Comfy安装：是；使用应用 Desktop registry 选择的 `Documents/ComfyUI/.venv/Scripts/python.exe`，Python 3.12.11、Torch 2.10.0+cu130。VS Code 当前 Python 未用于生产事实判断。
- `/object_info`：unknown；本次复核时没有启动服务，也没有 listener/process。
- 新GPU提交数：0。
- 生产代码/用户数据改动：无；只新增/更新忽略目录下的探针脚本、JSON 和报告，并更新本 handoff/TASK 摘要。

### 证据索引

| 编号 | 类别：源码/合成/真实既有 | 包版本 + 相对文件 + symbol/行号，或本地探针报告 | 观察结果 | 支持/反驳哪一命题 |
| --- | --- | --- | --- | --- |
| E01 | 源码 | ComfyUI 0.35.0 `comfy_extras/nodes_minimax_h3.py:7-10`、`comfy/nested_tensor.py:3-6`；`comfy_extras/nodes_lt.py:896-989` | H3 `NestedTensor` 是 video/audio 两个 stream；Separate/Concat 只做 wrapper 拆分/重建，mask 存在时另行拆分。 | 支持有限的内存 wrapper sharing；不证明模型/消费者语义相同。 |
| E02 | 源码 | LocalVideoStudio-H3 0.3.4 `nodes.py:394-490` (`SaveJointAV`/`LoadJointAV`)；`electron/services/native-av-artifact.ts:225-330` | app Save 只写 `video/audio`；Load 要相邻 manifest 并重建 `NestedTensor`；manifest 外校验 geometry/hash/model/VAE/role/context。 | 支持 app payload 的原始 tensor 保存；反驳“两个 key 足够所有消费合同”。 |
| E03 | 源码 | Motion Context 0.6.2 `nodes.py:317-653` (`apply`)、`:677-780` (`trim`)、`:985-1150` (Save/Load) | Save/Load 只写/读 video/audio plain wrapper；`clip_index=0` 不读文件；22 video / 24 audio 在 apply 中转成 keyframe conditioning，trim 同步处理 audio。 | 支持 Motion 的限定 raw wrapper sharing；反驳“Motion slot 是完整 Run/Native state”。 |
| E04 | 源码 | Continuum 3.8.2 `state.py:16-124`；`run_storage.py:847-1035`；`v3/nodes.py:671-1210`；`v3/review_control.py:483-830` | legacy state 只保留带 schema/capacity/clip/source-frame/audio-grid 的 tail；managed sampler/storage/review 另需完整 sampling contract 和 review state。 | 反驳普通 AV 可恢复 managed Run；区分 legacy bootstrap 与 official managed。 |
| E05 | 源码 | Continuum 3.8.2 `run_storage.py:1212-1715`, `:2447-2678`, `:2755-3070`；`v3/assembly_v35.py:570-675` | managed manifest/chunk 校验 file SHA/size/key/plan/prompt hash/chunk contract；prepare/finalize/review/assembly 不是 `_load_entry` 单点行为。 | 支持“完整 Run 需要 AV 外状态”；限制单 chunk 探针证明范围。 |
| E06 | 源码 | upscaler revision `d7c01b90` `nodes/minimax_h3_latent_upscaler_3d.py:467-602`；仓库 `workflows/minimax_h3_fl2va_learned_3d_second_sample_av_api.json`；`electron/queue-enqueue.ts:331-610,1282-1385` | Native 图先分离 AV，只对 video 做 learned transform，再合 audio、AddNoise、二采；应用 preflight 限定 FL2VA/context/geometry/conditioning/provider。 | 反驳任意 H3 AV 可 Native upscale；Native 派生产物不能称原 payload 等价。 |
| E07 | 源码 | `src/core/workflow.ts:79-105`、`electron/services/comfy-ui.ts:564-572,1175-1191`、`src/core/h3-av-adapters.ts:63-101` | 普通图保存开时动态挂接唯一 serializer；managed 图排除 app serializer；adapter 只选择路径/transport，工作区没有真实 Motion/Native consumer call。 | 支持统一生产开关方向；反驳“capability/adapter 已证明消费者接通”。 |
| E08 | 合成 CPU/只读 | `temp/h3-latent-feasibility-probe/probe.py` + `probe-result.json`，命令及断言见 [REPORT.md](../../../temp/h3-latent-feasibility-probe/REPORT.md) | app round-trip、Motion round-trip/apply、Core Separate/Concat、Continuum state、managed `_load_entry` 与错误 hash 反例均按断言通过；GPU=0。 | 支持限定 payload/wrapper sharing；不扩大为 Native 算法或 managed Retry 证明。 |
| E09 | 真实既有/版本 | `output/h3-native-av/...db3c8...safetensors`、`output/h3_context/.../clip_00001.safetensors`、`output/h3_continuum/runs/.../manifest.json`；版本/hash 见 REPORT | 三类文件同为 video/audio key 但 shape/metadata/owner 合同不同；managed alias 与 Run owner 同 file ID。 | 反驳“同 key/safetensors 即同一消费语义”；支持 owner + 协议 manifest 分层。 |
| E10 | 真实既有 consumer 反例 | `probe.py` 的真实 `LocalVideoStudioH3LoadJointAV.load` 与 `MiniMaxH3MotionContextLoadLatent.load` 对 managed hardlink alias | Native 因缺相邻 app manifest 拒绝；Motion 读取 plain wrapper 成功。该反例只证明 loader contract 差异，不证明 tensor 格式不兼容。 | 反驳“当前 alias 可直接被所有 adapter 消费”；不反驳底层 payload 可共享。 |
| E11 | 交接方源码抽查 | [queue-enqueue.ts](../../../electron/queue-enqueue.ts) `enqueueUpscale` 的H3 Native分支；[h3-native-av-collector.ts](../../../electron/services/h3-native-av-collector.ts) `nativeAvArtifactMetadataForTask` | Native检查FL2VA模型/context=0/几何/文件/conditioning等，未按segment role拒绝；collector只给R2V或Continuum Extend写context=22，FL2VA Extend可为0。 | 校正“所有Extend均被Native拒绝”；通过局部预检也不证明新段可代表累计视频。 |

### 消费矩阵与最小反例

第7.1节为补交后经交接方校正的矩阵；证据使用E01-E11。`无损适配`仅表示wrapper重建、可逆拆分或从完整源按consumer算法取view，不包括learned upscale、AddNoise、二次采样、MP4重编码或猜补前缀。

- app AV Save/Load 和 Core Separate/Concat 的合成输入证明值、shape、dtype 可保持，不证明 T2V/I2V/R2V 的 producer 语义自动相同。
- Motion需要source latent或source media、同几何目标latent及conditioning；latent路径不需要再VAE编码源视频/音频。显式文件路径在clip_index>0时忽略slot编号，不要求复制成slot。22/24是context坐标系，不是assembly trim；既有图其他模型/VAE输入须保留，统一adapter尚未接通。
- Native learned 3D probe未执行模型/GPU；preflight证明当前模型/context/几何/conditioning等门禁，不是底层算法不兼容结论，也没有按role一概排除Extend（E11）。first-pass/second-pass不能混称，二采输出必须另作derived artifact。
- Continuum legacy bridge 的 state 是 bounded tail；managed Run 需要 manifest、sampling contract、prompt/media hash、head、review/take/branch provenance。真实 managed `_load_entry` 仅证明一个已存在 chunk 可校验读取，不能替代 `prepare`/review/Retry。
- 最小反例：缺 Native manifest 的 managed hardlink 由真实 Native loader 拒绝而 Motion loader 成功（E10）；删除 Continuum state 的 `audio_tail` 或篡改 managed record SHA 分别触发 `StateValidationError`/`RunStorageError`（E08）。

### 方案影响

- 统一 UI：可行。一个保存/不保存开关可以覆盖普通 T2V、I2V/FL2VA、R2V 和 Extend；managed 仍是必须保存，但 UI 不应承诺 consumer 已接通。
- 统一存储：限定可行。一次 exact sampler output 可保留一份原始 video/audio owner；Motion/Native/legacy 在内存构造协议视图。managed owner 必须仍指向官方 Run Storage；跨 revision upstream plan import 的全局物理去重不成立。
- 统一消费：需修订。可统一逻辑资产入口，不能无条件给所有资产赋 `native-av`/`motion-context`/`continuum-managed-chunk`；adapter 当前未真实调用 Motion/Native loader。
- 官方 Run 恢复：仅真实 managed Run 直接满足。普通 AV、旧 JointAV、Motion slot、legacy Continuum 输出不能伪造 official Run。
- 无损适配位置：在 consumer 调用边界重建 NestedTensor/plain list/tail state；原 owner 不变。Native learned/upscale 和二采改变 tensor 值或空间 shape，必须保存为 derived artifact，不覆盖输入。
- 必须保留或可按真实合同重建：producer workflow/model/CLIP/VAE、geometry/fps/frame grid/dtype/hash、sample scope/role/context；消费者所需source/reference/conditioning；legacy source frame/capacity/clip/transport；managed project/run/revision、manifest、sampling contract、prompt/media hash、head/provenance/review state。不是要求序列化所有中间conditioning tensor；Motion显式owner路径可替代slot寻址。
- 原 Phase 1：保留一个保存开关、旧值兼容、生产侧 exact AV 保存、manifest/hash/geometry 校验、History version 关联和 managed owner 分离；删除“通用 payload 自动满足所有 consumer”的表述；重写 capability 赋值和 managed/native adapter 合同；暂不删除 Motion 独立 writer，直到 canonical owner 真实接入并完成 slot/reroll 回归。
- 会推翻/缩小结论的证据：实际schema不同；producer另需未保存的mask/scaling或原AV尾端不等于成片尾端；同owner经真实consumer出现数值/语义差异。Native二采或canonical Motion成功属于扩大验证范围，不是推翻有限可行结论。官方新增外部Run导入或跨revision去重才会改变相应限制。
- 最小下一实验：交接方授权后在线只读 `/object_info`，再对一个 exact FL2VA owner 做实际 Motion/Native consumer gate；另用无 Run manifest 的普通 AV 验证 managed preflight 拒绝。此次补交不执行 GPU 或服务操作。
- 实际命令与位置：`& <应用选定Python> temp/h3-latent-feasibility-probe/probe.py | Tee-Object .../probe-result.json`；脚本、原始 JSON、合成 payload 位于 [temp/h3-latent-feasibility-probe](../../../temp/h3-latent-feasibility-probe/)，源码定位与边界见 [REPORT.md](../../../temp/h3-latent-feasibility-probe/REPORT.md)。
- 资源状态：无服务启停、无 GPU、新增仅为 ignored temp probe 文件；既有 output/History/queue/Comfy 安装只读。

### 交接方复审结论（当前）

- 状态：accepted-with-scope，2026-09-19；前置研究通过，不是三个消费者或所有工作流的产品验收。
- 已关闭原缺口：矩阵、源码索引、实际脚本与JSON已提供；安装版自有节点与仓库一致，合成payload的bytes/SHA与结果一致；本次不重复CPU/GPU运行。
- 校正：证据引用已更正；E11纠正FL2VA Extend/context与role断言；各变体clean语义、managed assembly末端映射仍为unknown，不赋运行能力。
- 探针限制：app round-trip手工构造小型测试manifest，未覆盖生产collector/TS提交链；Motion合成探针将音频转F32，未验证BF16 Motion往返。脚本用固定产物名，原样重跑会被拒绝覆盖，需要新的独有测试目录。只接受格式层结论，不称生产闭环通过。
- 决策：保留“统一保存意图 + 每个实际AV产物单owner + 分消费者元数据/状态”。不把普通AV伪装成Run，不把Native派生产物算重复副本。Motion writer只允许在替代输出通过旧loader/路径和reroll兼容检查后移除，不能把回归留到Phase 3。
- 下一步：修订Phase 1能力边界和Motion替换门禁后可执行；不启动Phase 2/3/4。最终实施授权只看Phase 1文档状态。

### 首轮交接方验收（历史，已由上述复审取代）

- 状态：changes-requested，2026-09-19；有限方向有源码支持，但研究交付不完整，不能据此放行实施。
- 认可的结论范围：自有 `LocalVideoStudioH3SaveJointAV.save` 与 Motion 的 `MiniMaxH3MotionContextSaveLatent.save` 均保存原始 `video/audio`，没有为落盘转dtype或截断时间轴；Motion loader读取这两个key并构造plain wrapper，自有loader构造NestedTensor。限定于相符的latent语义和几何，包装差异不要求重复保存payload。以上是源码抽查结论，不是所有模型/消费者的运行验收。
- 反例的准确含义：managed别名缺Native manifest而被自有loader拒绝，只反驳“当前loader可直接接通”，不能证明tensor不可共享。自有loader确实在读取tensor之前要求已提交manifest，见 [nodes.py](../../../comfy_nodes/LocalVideoStudio-H3/nodes.py)。managed Run还需官方状态，不能用普通AV或单chunk冒充完整Run。
- 是否需要重新思考方案：需要先限定适用范围，尚无证据要求放弃共享AV方向。保留统一UI/逻辑资产的目标，按消费者保留元数据和状态；不能承诺任意H3产物自动具备三种消费能力。
- Phase 1需要的修订：等待下方来源矩阵后再定，尤其不能先批准删除Motion writer或给全部新AV赋消费capability。原Phase 1不改为ready，本次不修改生产合同。
- 是否解除实施门禁：否。

#### 必须补交，复用原调查，不重新大范围研究

1. **补齐真正的交付内容。** 当前磁盘第7.1节8行均为“待核查”，第8节结论、版本、证据索引和方案影响也是占位符，与TASK“已回填”不符。将原调查的结果写入对应位置；各格附源码/探针证据编号，未证明的组合明确写unknown及原因。至少区分T2V/I2V/R2V、各Extend新段、单chunk/完整Run，以及Native first-pass/second-pass和模型限制。给出Phase 1应保留、删除或需决定的条目。
2. **补齐可复核依据，而不是扩大测试量。** 当前 `temp/h3-latent-feasibility-probe/REPORT.md` 只有结果摘要，目录未留探针脚本，handoff未提供实际命令、关键输入/断言或消费者源码定位。补录原session已执行的命令/脚本与对应结果，列出真实调用及任何mock/注入边界；给出关键producer/consumer函数、行号和版本。若记录已丢失就标为未独立验证，不编造命令或结果。
3. **限制各证据的证明范围。** Save/Load和Separate/Concat验证的是tensor保存/包装，不是Native二采算法或全部模型支持；`_load_entry`验证单chunk载入不等于`prepare`/review恢复通过。补充已读的上游约束源码定位，明确Motion上下文提取、Native角色/模型限制和Continuum外部状态边界；已有真实managed运行证据继续复用。缺manifest的反例不得写成底层格式不兼容。

补交仍沿用本文件权限：无生产改动、无新GPU生成、无服务启停、无子agent，不重跑全量构建。优先整理原调查；确需补一个独立CPU检查时仍受原预算和重试限制约束。完成后只更新此回填区和TASK摘要为ready-for-review，保留本次验收记录，不能自行标accepted或解锁Phase 1。

本次交接方检查：核对TASK、handoff与本地REPORT；直接读磁盘确认8行矩阵未填、结论/证据仍占位、探针目录无脚本；抽查自有Save/Load、Motion Save/Load/apply、managed合同入口和应用adapter。未重跑Luna的CPU探针，未执行GPU生成、应用构建或服务操作。