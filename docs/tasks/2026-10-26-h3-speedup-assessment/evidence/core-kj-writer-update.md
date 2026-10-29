# ComfyUI、KJNodes 与 H3 Prompt Writer 推荐线更新

日期：2026-10-30；影响：patch。用户授权更新推荐线并检查后两个节点的改动及兼容性，不等同于授权本轮替换本机运行实例。

## 采用身份

| 项目 | 原推荐 → 新推荐 | 上游身份 |
| --- | --- | --- |
| ComfyUI | 0.42.3 → 0.43.0 | [官方 Latest](https://github.com/Comfy-Org/ComfyUI/releases/latest)，tag `426f5eea52a7ece1dd599fff4cb6cd1f352ddd24` |
| KJNodes | 1.5.2 → 1.5.3 | [Registry](https://registry.comfy.org/nodes/comfyui-kjnodes)，源码版本提交 `f4bae1f9960e5d643573a2ecf7abd56453a21821`；实际源码审查点 `ab72eda7ffad6280422d71ab7d54d3fb87c0ba18` |
| H3 Prompt Writer | 0.4.7 → 0.4.8 | [stable 发布](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.8)，annotated tag 解引用为 `47514b86c573167f5d0cae2b9d5184c009e332e1`，已更新安装 pin |

ComfyUI 存在更大的 0.43.1 tag，但官方 Latest 仍是 0.43.0，本轮按用户指定与官方 Latest 采用 0.43.0。该版依旧不含 Sol VAE。

KJ 无 GitHub Release/tag；Registry API 返回 1.5.3、deprecated=false，状态字段为 `NodeVersionStatusFlagged`，未返回具体原因。不把该字段解释成已完成官方审核或已证实恶意。HEAD 在版本提交后继续变化，不能把以下 HEAD 源码改动全部算作 Registry 归档内容。保持现有 Git 安装/语义版本策略，没有新增提交 pin；静态审查仅覆盖上述读取点，后续 HEAD 仍需正常 schema/源码检查。

## KJNodes 实际变化与兼容性

相对 1.5.2 版本提交 `d3cfe21`，审查应用使用的 `VRAM_Debug`、`PathchSageAttentionKJ`、`ModelPreviewOverrideKJ`：

- 三者公开输入 schema 不变；预览仅增加 dynprompt hidden input，支持循环/展开节点显示 ID。
- Sage 现在检查内核是否明确接受 attn_mask；仅吞 `**kwargs` 的内核不算支持，存在 mask 时回退 `attention_pytorch`。这是正确性保护，不能宣传所有 mask 路径都变快；大 stride 的 contiguous 保护仍在。
- managed attention 依赖的 `new_attention.__wrapped__` 委托仍在；应用 managed raw 委托回归通过。
- 预览音频缩放改从 `model_sampling` 获取，缺字段只关闭音频预览。TAE RGB 预览不改变最终视频 VAE。
- HEAD 另外更新 MOSS prompt weights、FLUX.2 VAE 不重复打 Triton 补丁、Fast Preview Batch、Vue combo/滚轮、Set/Get 与 subgraph，并新增 ImageCompare。ComfyUI 画布 JS 改进不等同应用 Electron 自有界面变化。
- requirements 未变。旧核心虽保留最低兼容线，但新增 hidden input 和音频预览的本机加载仍须重启后实际 schema/运行验证。

## Prompt Writer 实际变化与兼容性

- Direct GGUF 使用有 `abort()` 能力的后端时，通过短周期 watcher 调用 native abort，避免每 token 的全词表 Python logits callback；旧后端仍保留 logits processor 回退。watcher 退出时停止并 join。应用补丁回放后该逻辑保留。
- projector 已纳入上游驻留签名；避免投影器切换后错误复用模型。
- `LLM/llm` 模型目录未注册时跳过，修复目录发现异常。
- 上游 UI generate/refine 避开新前端一分钟 fetch 超时；这不是应用增强请求已测得提速。
- Anthropic OpenAI-compatible API 修复、可选 API sampling、隐藏启动按钮、媒体拖放改进。应用不因节点升级自动增加这些 UI/API provider 能力。
- `/h3studio/*` 路由保持，新增 API sampling 是可选字段；requirements / requirements-gguf 无变化，共享 llama-cpp-python 安装和固定后端保持。
- 在 v0.4.8 七份实际上游文件上执行当前 `prepareH3PromptWriter` 两遍：输出一致，Python AST 解析成功；Gemma/批处理/清理适配保留，native abort 未被覆盖。此为源码回放，不证明当前机器的 GGUF 推理、取消延迟、显存释放或画质。

## 核心依赖联动与边界

Kitchen 新安装目标由 0.2.39 对齐 0.43.0 requirements 的 0.2.40。就绪探针保留旧 0.2.39 CUDA backend，不因为推荐线更新将原环境判坏；0.2.41 等未知版本仍不自动放行。CUDA 13 / CUDA backend 条件保持。Aimdo 0.6.0 由核心依赖管理，本轮不修改 Python 环境。

实际本机节点/核心没有升级或重扫，本次比较基线是仓库推荐版本及其上游源码，不能代替选中 core/data/Python 的实际运行验收。旧任务、最低核心线、采样配方、权重与运行中快照未修改。

## 验证

- 6 个相关 Vitest 文件 / 196 项通过；包括 catalog、扫描器、安装事务、Prompt Writer AppApi 适配、版本来源与环境探针。
- KJ 实际源码 AST 对比三个公开输入 schema，通过；用不接受 mask 的假 Sage 内核执行实际工厂，确认带 mask 请求回退 PyTorch 且 mask 原样保留。
- `python -B tests/python/test_h3_managed_attention.py`：2 项通过。
- Writer 七文件补丁幂等/语法回放通过；`npm.cmd run typecheck` 通过。
- 桌面/网页 Vite 生产构建及 Electron TypeScript 隔离输出通过，440 对比度检查通过；存在当前 Electron 窗口，因此未清理共享 dist 或运行标准 clean/bundled copy。
- 全量首次 309 文件 / 2933 项，其中 2931 项通过，2 项失败仅为 workflow-metadata 测试硬编码的旧推荐版本；更新该文件断言后单独复验。该阶段没有进一步修改产品代码，复用其余通过结果。原始日志留在忽略的 `temp/node-upgrade-20261030/`。
- 未启动/停止用户 ComfyUI，未运行 GPU 或下载模型，不声称运行层兼容已完成。
