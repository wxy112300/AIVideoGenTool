# Strata 自动输出预算与去拒绝候选

- 类型：Evidence；日期：2026-10-16 用户授权；预算实施／候选只读评估，新增子 agent 0。
- 基线：`b839c0b`，开始时工作区干净。允许 Strata 自动扩大预算；无审查变体仅调查，未授权入库／下载。未修改其他后端、权重、安装版本或系统设置。

## 自动预算

已加载上下文仍为32K，视频8192／图片编辑4096作为必须容纳的基础输出预留，而非硬上限。通过原官方tokenizer完整计数后：

`max_tokens = 32768 - input_tokens - 图片数 × (1024 + 4) - 256`

只有基础预留也能容纳时才发送请求；输入不截断、预留不静默缩水。思考仍为medium／2048（仅原详细单图路径），计入总输出空间。正常stop提前结束，不要求模型生成满上限；显存／RAM／commit检查、取消、单重型GPU互斥、10分钟请求上限及原质量门禁保留。纠正调用含完整原文和候选，再独立计数预算，最多一次时间点纠正；没有新增无限重试或运行中修改引擎上下文。

服务只记录本次实际input/max/completion tokens、finish reason、思考和正文字符数及operation ID；原始正文／思考／认证不进入日志。用于区别明确length截断、正文为空和H3字段校验失败，不能仅从“主时间线0词”断言预算耗尽。此轮未改变校验失败后的既有释放策略，也不保证解决所有0词／质量失败。

来源：固定安装0.1.44.1的`serve/server.py`上下文room、思考wrap和SSE usage实现；[上游当前源码](https://github.com/Niko1221/Strata/blob/main/serve/server.py)亦支持按剩余上下文分配输出。无预算变更导致的重新哈希／pack失效／下载。

本机只读资源探针：可用物理约32.8GiB、commit约26.0GiB、显存约21.4GiB。原准入预计需约35.5GiB物理及显存容量级额外commit，拒绝GPU加载；未降低门槛或要求用户关闭程序。本次GPU效果待资源充足机器复测，不以mock或用户此前旧预算成功声称新预算真实质量通过。

验收：6文件95项focused、完整verify的216单元文件／1998项与6集成文件／88项、双端类型、干净构建及20对比度通过。上游实际安装的官方mock服务器＋生产StrataService真实HTTP调用通过：官方tokenizer计78输入tokens，自动max_tokens=32434（不是8192），正常stop仅生成56tokens、正文55字符；usage／finish／思考字符诊断与预算回调通过，请求对象未变。该结果验证API与预算，不是神经推理／质量／性能。自有mock PID72812及端口3677已退出；未启动GPU／ComfyUI／队列，也未更改原草稿／History。临时脚本和日志保持忽略。

## 候选A：SC117 固化 abliterated 权重（优先评估）

- [发布者模型卡](https://huggingface.co/SC117/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF)，HF API实时revision：`eec4e10a2c29b440a2ae85591fa11569ce752963`，lastModified 2026-10-03。声明Apache-2.0，基于当前ISTA GSQ-RCO，移植144个去拒绝张量；有专门Strata说明和社区加载报告，不等于H3扩写已验。
- IQ3_XXS第一分片：`IQ3_XXS/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-IQ3_XXS-00001-of-00002.gguf`，47,342,144,896 bytes，LFS SHA256 `03b11926b41a3d7f7a008882b1bc7a6330a3c9c43d3cad4598d31dc73042fdc5`。
- 第二分片：同目录`Qwen3.8-Flash-Next-GSQ-RCO-abliterated-IQ3_XXS-00002-of-00002.gguf`，28,800,138,432 bytes，`316b46f3a2dbd68c900f43136ab9449f9dcc3725dfd8c794847c204bc161e113`，与现有标准第二分片相同。两片合计76,142,283,328 bytes；名称不同、共享文件安排需入库设计，不应直接覆盖原件。
- 根`mtp-q2_0.gguf`：889,017,216 bytes，`a22206a4d74eafbf31063a84610292535fb3b49af9a339963817fd04aed81e4d`，正是现有配套MTP；发布者注明它来自stock，非abliterated head。
- 发布者允许复用上游视觉投影，但其仓库`mmproj-Qwen3.8-Flash-Next-BF16.gguf`本身为907,542,944 bytes／`2e788f8c511d8093c7b43cb87b2fd7e14228340318057f8fb20c86df2efe2355`，不同于当前登记的907,543,008 bytes／`b1a82259702816a5330d7bd7607cd9676b11780e79ff7348c21103ff3ce49bd0`；不得声称文件hash完全相同。
- 必须单独构建native pack/tokenizer：张量偏移改变，不能沿用标准模型`native_experts.txt`。保留标准模型、独立ID和派生数据；不自动应用模型卡的262K／int8等示例参数。当前预算和保护只验证原32K路径。
- 决定：适合后续作为独立可选卡片候选，先验证文本、图片、15秒动作／多镜头、MTP及忠实性。去拒绝不保证从不拒绝、语言质量或速度提升。

## 候选B：alesha-pro 运行时控制向量（小文件替代路线）

- [发布者模型卡](https://huggingface.co/alesha-pro/Qwen3.8-Flash-Next-abliterated-GSQ-RCO-Strata-GGUF)，revision `d4af3be5701549435e0770d625f79dd2def1358f`，lastModified 2026-10-04，元数据license=other，指定Qwen Community License 1.0，不能套用候选A的许可证声明。
- 主GGUF及投影hash与当前标准catalog一致，不是另套固化去拒绝主权重。发布者明确保留原权重，借Strata `experimental-speed-projection`在残差流应用Huihui方向；关闭该选项回到原模型。
- 小文件：`Huihui-Qwen3.8-Flash-Next-refusal-direction-r.gguf`，483,520 bytes，LFS SHA256 `59f9ae8b4372107ae79044278a4406bdfe8f8861fe599aa5848515f0d072be38`。发布者实测IQ3_S／IQ2_XS，未实测IQ3_XXS。
- 本机固定引擎源码存在对应cvec/project参数，但应用配置／receipt目前未接入，不能把小文件复制过去就当作生效；需独立可选身份、配置和开关语义、资源与质量验收。未启用该实验路线、不跑整套setup／下载MTP／改8080。
- 决定：省重复下载的候选实验，不冒充现有已入库模型，也不假定比固化权重等价或更快。

只查询模型卡、源码和文件元数据；无权重／向量下载，无catalog变更、实际安装或推送发布。

## 扩展调查：128GB 与更多去拒答路线（2026-10-17）

用户继续要求研究，不授权入库、启用、下载或切换后端。本节是source/files证据，不是H3实测。保留此前自动预算未提交改动；新增子agent 0。

- GitHub API确认latest仍为v0.1.44.1（2026-10-14发布），main与应用固定SHA同为`296b59d2f73c8f04a805df29c2fa97655adace78`。应用catalog只接两种，不等于引擎只支持两种。
- IQ2_XS／IQ3_XXS是同一完整模型的不同混合精度量化，不是专家删减。平均2.5／3.0bpw，总68.0／75.8GB；IQ3_S为3.5bpw、83.6GB。三者发布者推理／生成均分89.16／92.57／93.26，不是H3质量百分比。来源：[ISTA](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF)。官方同机5070／7600／64GB短答79／62／53tok/s，仅作相对参考：[型号说明](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/MODELS.md)。

### 高精度候选

[固定版量化说明](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/QUANTS.md)的Unsloth源revision为`38bb39ee97821de2c9009abb7e93950eec396e66`，上游称`766911a6b7369840a91dbcd95f9f997acaab6cd6`文件相同；本轮未下载复核。

| 量化 | 下载GB | 专家GiB | 128GB候选判断 |
| --- | ---: | ---: | --- |
| UD-IQ4_XS | 93.7 | 55.4 | 中间档，非全模型均匀4bit |
| UD-Q4_K_XL | 111.3 | 71.7 | 优先高质量候选，需实际可用RAM／commit／视觉余量 |
| UD-Q5_K_XL | 158.3 | 91.6 | 上限实验，其他程序可能挤占余量 |
| UD-Q6_K_XL | 169.2 | 101.7 | 对128GB桌面过紧，非优先 |
| Q8_0 | 188.2 | 119.5 | 无法舒适保留完整专家及系统余量 |

高精度减少量化误差，不移除拒答或保证更好的创作。RAM容量解决驻留；速度仍取决于带宽／CPU／PCIe／VRAM／MTP。当前资源策略的42.9e9 arena常量针对IQ3；新增量化必须按真实布局重新适配，不能只加catalog后沿用预算。

### 不同控制向量

- Strata自带ESP：[说明](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/data/experimental-speed-projection/README.md)。本机固定安装已有483520bytes文件，SHA256 `ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b`；4..44层。应用未接线，不能说已启用；它与alesha的同尺寸文件hash不同。
- alesha／Huihui方向：固定身份见上一节；发布者测IQ2_XS／IQ3_S，未测IQ3_XXS。
- sergqwer局部层向量：[说明](https://github.com/sergqwer/strata-nvfp4/blob/main/data/uncensor/README.md)。约268KB、8..33层；分支HEAD经API固定`257727d58ff85a9aef6f314f9a95f75e4fc330d2`（2026-10-15）。发布者跨Q2_0／IQ2_XS／UD-Q4_K_XL验证，专门测思考结束偏移；是优先实验候选。文件bytes/hash和本机标准引擎加载尚未验证，不能直接入库，也不因分支名称就要求换NVFP4后端。

同一原始checkpoint的不同量化有复用基础，但效果须逐档验收；同架构／hidden size只说明可能加载，不证明有效。Swift、Huihui v2等已改权重，其他Flash代际更不能直接外推。不能做任意模型全局开关。投影不是计算加速，上游称同token有0.2–0.4%成本。

### 完整权重及其他方案

- [Huihui v2](https://huggingface.co/huihui-ai/Huihui-Qwen3.8-Flash-Next-abliterated-v2-GGUF)：卡片声明调整消融重点、不消融专家，目录分Swift与Unsloth。独立登记pack／tokenizer／投影身份，不采用其跳过SHA校验建议；未有本项目图文长稿证据。
- [OrcaRouter](https://huggingface.co/orcarouter/Qwen3.8-Flash-Next-Uncensored-GGUF)：官方有[IQ3_XXS兼容说明](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/ORCA.md)，需compat-bf16与独立pack，文本示例不等于图片已验。
- [SC117 Swift](https://huggingface.co/SC117/Swift-1.5-Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF)：短思考备选，不等于更强。卡片分片大小和IQ3_S有无段落互相矛盾，固定清单前不采用其尺寸。
- [RVN](https://huggingface.co/0bserverx/RVN-Qwen3.8-Flash-Next-Abliterated-Uncensored)：消融加小范围LoRA修复，2%只指严格拒绝，另有32%redirect；关思考／400token测试不能代表中文长思考。[Strata重打包](https://huggingface.co/jimmy31chen/RVN-Qwen3.8-Flash-Next-Abliterated-Uncensored-IQ3_S-Strata)的5090结果不是4090视觉验收。
- [Huihui NVFP4](https://huggingface.co/Maximilian228/Huihui-Qwen3.8-Flash-Next-abliterated-NVFP4-GPTQ-Strata)因长思考循环从其分支菜单撤下；[Orca NVFP4](https://huggingface.co/Maximilian228/OrcaRouter-Qwen3.8-Flash-Next-Uncensored-NVFP4-GPTQ-Strata)随后因代理任务质量撤下。仅限这些构建与任务，不证明所有同源GGUF都坏。
- [Gyro](https://huggingface.co/agentionai/Qwen3.8-Flash-Next-Gyro-abliterated-Huihui-GGUF)需专用rotor引擎，S版64K仍约28.8GiB GPU内存，不适合单4090直替。[DavidAU](https://huggingface.co/DavidAU/Qwen3.8-Flash-Next-Abliterated-Uncensored-Turbo-Brilliance-50x-Reasoning-Instruct-GSQ-RCO-GGUF)卡片仍RELEASE PENDING，不将50x名称当实证。

HF API本机访问失败、连接工具不可用；新增页面／目录可读，但除列出的固定身份外，完整revision+bytes+LFS hash未知。建议先原IQ3_XXS无向量／候选向量隔离A/B，再选IQ3_S或UD-Q4_K_XL。必须含中文复杂图、15s动作／多镜头，记录首token／生成／总耗时、MTP、资源与输出忠实性，不以思考词面或关键词计数判定。此次无GPU／服务／安装／下载／用户state变化，只追加研究记录。
