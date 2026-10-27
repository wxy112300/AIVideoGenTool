# Continuum 加速与 LoRA 边界复核

2026-10-27。用户要求检查官方文档和社区，纠正应用自行增加的限制。本机固定基线仍为官方 Continuum 3.10.2 / `308653cff108061a94381cef446fef985384b214`；未安装其他 fork、升级节点或下载权重。

## 结论

无 LoRA、稀疏关闭、仅 Sage CUDA/PyTorch、兼容运行时、编译关闭，是应用首轮窄路线的实现范围，不是 Continuum 的通用使用条件。此前把这些范围合成一条产品入队要求，混淆了官方能力与应用接线缺口。保留用户配置并补接实际图、冻结快照和恢复契约，不能只删除校验后丢弃设置。

| 项目 | 官方/社区证据 | 应用当前差距与处理 |
| --- | --- | --- |
| LoRA | 官方工作流包含 rgthree LoRA loader，指南明确提供 LightX2V Turbo；Sampler 的 MODEL 可以带上游 LoRA | group compiler 已有单 LoRA 参数，但 Create/claim/Continue 一概拒绝；现有有序 LoRA 栈、触发词、Turbo 专用采样/步数配方未完整进入 group profile。这是未完成的接线，不能称为 Continuum 禁止 LoRA |
| 稀疏 | 开放集成契约明确 Sage/Sol/Spectrum 属外部 MODEL wrapper，Continuum 不选择后端 | 应用普通 H3 已通过 Core `BlockSparseAttention` 构图，但 group compiler 独立走最小链，未复用它。应该冻结实际稀疏配置并接入共享构图；不能用“需要 dense”概括 |
| 注意力 | Issue #31 已有 PyTorch、Kitchen INT8 + Spectrum 的后续分段实证；具体 wrapper 的复用观测需匹配 | 本次补上 Sage Triton 的 UI→task→claim→graph→Run 身份，保留 CUDA/SDPA；Kitchen 仍是应用尚未接入，非官方禁令 |
| 运行时/Compiler | Continuum 的公共边界不替外部组件选择这些策略 | group profile 尚未冻结对应策略，不能假装已经应用。后续复用 H3 执行策略与图构建器，不扩大为全局启动参数变化 |
| 已有 Run 复用 | 新生成与 Take 复用不同：未知 wrapper 仍可能生成，但其缓存复用可能不可用；相同前缀须有匹配的真实契约 | 不放宽 accepted-prefix、owner、真实 manifest/hash 或 `resume_safe` 检查；不因新组合的支持而修饰旧不安全 Take |

## 查阅来源

- [固定 3.10.2 用户指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.10.2/docs/USER_GUIDE.md)，尤其 Turbo LoRA/Spectrum 与保持已接受生成条件两节。GitHub connector 读取并与本机版本交叉检查。
- [固定 3.10.2 开放集成契约](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.10.2/docs/V38_OPEN_INTEGRATION_CONTRACT.md)：外部 MODEL wrapper、公共 ModelPatcher 接口、无 attention 后端选择。
- [官方 Issue #31](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/issues/31)：作者的分段继续 GPU 记录与提问者三段复测；其中旧 SolAttn_triton 的问题不能直接套用到应用现用 Core 原生节点。
- [Core BlockSparseAttention 文档](https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/BlockSparseAttention/en.md)：SOL 是 training-free；SLA 需要对应训练权重；VSA 需要 FastH3 权重，不是所有模型的通用稀疏开关。
- [Core Issue #16382](https://github.com/Comfy-Org/ComfyUI/issues/16382)：特定 Larry Turbo + SOL 组合的画质报告，属于具体组合与版本证据，不能推出全部 LoRA/稀疏不兼容。
- [社区长视频经验帖](https://www.reddit.com/r/StableDiffusion/comments/1wrodxx/long_minimaxh3_videos_situation_lets_talk/)：有 Turbo LoRA 的用户经验，仅作发现线索，不当成本机质量/性能验收。

标准官方示例将 Spectrum 和 Turbo LoRA 都保存为关闭，并明确要求按所选 LoRA 的配方使用；这不等于禁用所有 LoRA，也不表示任意 LoRA 与 Spectrum 的组合均已验证。不同 fork 的附加支持、旧外部 SolAttn 与新 Core SOL 不互相替代。

## 本次已完成与证据层

- 实际保存配置为 Sage Triton + Spectrum balanced、无 LoRA、sparse off、compatibility、Compiler disabled、360p。此次直接阻塞来自应用白名单漏掉 Triton。
- profile 新增 `sage-triton` 选项；claim 精确保留其身份，managed Sage 节点显式选择 Triton raw kernel；原 CUDA Sage 和 SDPA profile 的解释保持不变。恢复签名区分 CUDA 与 Triton，不读新设置替换旧 Run。
- 不再展示所有限制的大串要求：LoRA、稀疏、运行时、Compiler、当前 attention 的未接入原因分别指出；未把剩余能力冒充已接入。
- 定向四文件23项通过。完整测试首轮有一个无关缓存用例5秒资源超时，原用例单独31项通过；不改该用例或放宽超时，降低测试并行后完整287文件2696单元、6文件91集成通过。双 typecheck、独立 renderer/web/electron 干净构建、440对比度通过；日志在忽略的 `temp/long-attention-*`。
- 新版完整 Electron 主进程的隔离草稿走缺图禁用→真实图片拖入→实际鼠标点击入队，得到 `551acf6b-af46-4fd2-b457-1d7dc031857e`，冻结120秒/Sage Triton/Spectrum balanced。队列未启动，GPU采样0，不宣称120秒视频或该组合画质已通过。
- 正式 state 字节未变，保留现有非CDP用户应用。隔离 PID47100/CDP1172及Comfy18319已清理，未覆盖其他任务的 dist 构建或关闭其窗口。源码/隔离构建已通过；现有应用主进程需正常重启才加载新执行代码。

## 下一步集成范围

复用普通 H3 的有序 LoRA 栈、`normalizeMiniMaxH3ModelPatchChain` 与实际采样配方，将配置放入兼容旧 profile 的冻结字段并纳入恢复身份。先按普通 LoRA/SOL、Turbo 专用配方、Kitchen/运行时/Compiler 分别验证图与真实契约；只保留权重任务匹配、真实 schema/文件和已有 Run 复用的具体错误，不以未测组合默认禁止新生成。SLA/VSA 的训练权重要求仍遵从 Core 文档。

## 完整接线完成记录

同日用户明确要求完成上述接线，前文“尚未接入/下一步”为此前状态。本次实现：

- 新 Run 的可选 `profile.h3` 保存原始模型ID、有序完整LoRA快照、稀疏、运行时、Compiler与Spectrum model-aware选项；缺字段旧Run继续走原编译分支，不自动套入新图或改原身份数组。旧单LoRA profile仍可读取。
- 共享 `applyVideoLoraStack`、`normalizeMiniMaxH3ModelPatchChain`、Turbo/PDD采样函数，包含4-step、8-step、V4、Turbo-SLA和PDD的sampler/scheduler/sigma配方；freeze保存实际构图后的采样器、scheduler、步数。普通H3的8-step模板隐含配方提到共享函数，避免新适配器复制配方。
- CUDA Sage、Triton Sage、Kitchen、SDPA均进入同一模型consumer链；SOL或匹配Turbo-SLA位于dense fallback与Spectrum之间。managed Sage的原始函数观测使用KJ原始目标，与是否启用模型Compiler是不同选项，不再混为一条禁令。
- History继续创作保留LoRA、步数与Spectrum，恢复task的四项加速配置来自父Run；草稿归一化保留继承配置，profile身份覆盖顺序、权重与模式，编辑继承LoRA触发profile mismatch，不悄悄换配置。
- LoRA触发词经共享去重函数进入每段实际采样文本。new-Run/Extend严格快照校验使用同一编译规则；旧接受前缀不注入或重写。Queue浏览/复制读取冻结实际文本，等待任务使用同一编译规则，原故事页不改。
- 移除“无LoRA、dense、兼容运行时、关闭编译、只用Sage/PyTorch”的固定白名单；保留原有LoRA模型/任务匹配和Core SLA/VSA训练权重要求、真实schema及accepted-prefix契约。首尾帧/额外Reference、720p/插帧仍是独立既有路线边界，本次未擅自重设计。

验证：图链覆盖四种attention、LoRA顺序、SOL/SLA、五种Turbo/PDD配方、History恢复、真实运行时启动flags、旧Run与实际提示词/原稿独立。完整回归首轮暴露其他任务进行中的IPC数量断言，后续稳定状态全量通过；本次又捕获并修复LoRA触发词导致的严格快照不匹配，未放宽校验。最终完整验证日志为 `temp/long-h3-delivery-*`。

新版完整隔离Electron使用真实已安装Realism People LoRA，Kitchen+SOL+Spectrum balanced+native+Compiler auto，经过缺图禁用→实际拖图→真实鼠标入队得到120秒任务 `98e15ade-7345-406f-9f81-65a2d1733a47`。对现有ComfyUI只读GET object_info，LoRA/Kitchen/BlockSparse/Spectrum在内18节点图通过生产接口校验。无prompt POST、无GPU采样或质量/性能结论。报告 `temp/long-h3-ui-report.json`、`temp/long-h3-schema-report.json`；正式state字节保持不变。隔离29820/13955/18319已清理，实际用户应用及8188不动。

最终交付状态：289文件2716单元、6文件91集成、双typecheck、独立干净renderer/web/electron构建和440对比度全部通过。最后Queue预览改动后重新执行完整检查，未沿用先前失败结果。已在确认无并行构建后将本次14个后端模块及新renderer/web资源写入开发dist，保留旧hash资源供当前窗口继续使用，不覆盖其他任务的main/preload模块；逐模块字节比对通过，正式state前后SHA相同。报告 `temp/long-h3-delivery-staged.json`。当前应用与ComfyUI未重启，新执行代码下次正常启动加载；不打包、不升版本、不提交。
