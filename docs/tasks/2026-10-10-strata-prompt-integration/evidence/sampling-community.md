# Strata 官方采样与 H3 社区调查

调查与实施日期：2026-10-14。范围：修正调用参数、核对社区公开实现，不安装社区节点、不更换权重或上游版本。本轮为 patch 级修复。

## 官方建议与实际改动

[Qwen 官方模型卡](https://huggingface.co/Qwen/Qwen3.8-Flash-Next#best-practices)分别提供思考与非思考组合。现有产品主动关闭思考，所以本轮使用非思考组合，不混用思考模式的参数：

| 参数 | 上一轮实际调用 | 当前生产请求 |
| --- | --- | --- |
| temperature | 从通用创意档位读取，实测0.3 | 0.7 |
| top_p | 未显式设置 | 0.8 |
| top_k | 未显式设置 | 20 |
| min_p | 未显式设置 | 0 |
| presence_penalty | 未显式设置 | 1.5 |
| repetition_penalty | 未显式设置 | 1 |
| enable_thinking | false | false |

- 组合集中在 `strata-service.ts`，请求 builder 使用同一温度来源；HTTP 请求明确发送所有字段，不依赖未配置的运行默认值。服务内部仍允许有界诊断指定温度，生产 builder 固定0.7。
- 用户保存的 `promptCreativity` 不改写；Strata 请求不再用它控制温度，其他后端保持原行为。不增加设置控件或持久化字段。
- 已安装固定版本 `fb58e0dbc8399662c0e47c76578c6e878b14f6cf` 的 `serve/server.py::sampling_keys` 支持这些键：中性 min_p/repetition_penalty 不产生 native 附加键；presence_penalty 非零会传 `penalty_present`，未设置 penalty_last_n 时服务使用64-token窗口。官方也提醒各框架支持存在差异，显式参数对齐不等于采样器数值完全一致。
- 保持32K、k8v4、单图1024视觉token、视频8K/图片4K输出和原内存/释放策略；不下载MTP，不改变默认模型，不启用自动重试，不放宽详细预设质量门禁。

## 社区是否有人这样用

以下是调查日可读取的公开资料；社区 main 文档未安装，也不作为固定兼容性承诺。

### 1. 直接实现：T8 H3 Prompt Enhancer 的 Strata 桥接

[项目说明](https://github.com/T8mars/comfyui-minimax-h3-prompt-enhancer-T8#新增strata-本地服务桥接)与[桥接文档](https://github.com/T8mars/comfyui-minimax-h3-prompt-enhancer-T8/blob/main/docs/strata-bridge.md)明确支持 H3，提供文本、Qwen图片编辑、H3首尾帧加视频的示例；沿用节点的 H3 协议和质量流程。

- 桥接调用已存在的 Strata 服务，不管理软件生命周期或权重。我们仍保留应用自有安装/加载/卸载/取消机制，不另装它作为第二套管理器。
- 文档默认思考 none；支持共享采样配置。视频使用显式视觉样本协议、不读取音轨；不能把视觉样本理解为连续观看或听到对白。
- 传输失败不自动重发 chat POST，结构/质量纠正属于另一次请求；它的验收范围也明确不包含成片视频/音乐质量。
- 默认地址示例为8080，**不采用**；本应用继续使用现有受认证 loopback 的43127配置与占用检查。

这能直接确认“有人把 Strata 用于 H3 提示词增强”，但未找到与我们 IQ3_XXS、4090、同一历史图和复杂场记匹配的增强质量对照，不能照搬其通过结论。

### 2. 上游直接证据：PR #334 的 H3 Story/Fast schema

[Strata PR #334](https://github.com/Niko1221/Strata/pull/334)作者报告真实 Windows Qwen 生成通过了 H3 Story/Fast schema，且测试必填对白字段、省略字段诱导、流式和截断。维护者说明相关工作进入0.1.32，但讨论区区分早期“生成后校验”和后续“原生约束解码”实现。

我们核对了[固定安装源码](https://github.com/Niko1221/Strata/blob/fb58e0dbc8399662c0e47c76578c6e878b14f6cf/serve/structured.py)：它明确没有 native grammar decoder，按一次生成后校验；`test_structured.py` 的 H3 Story 样例是 MockEngine 协议测试，不能当成本机模型质量证明。不能只因PR关闭或存在测试就宣称已具备原生schema强制生成。

当前产品仍输出官方纯文本 H3 字段，不改为这套 Story JSON；JSON齐全只能减少格式错误，不能保证动作细节、图片观察或长资料召回。

### 3. 旁证：模型分工与资源实测

[LLM Prompt Studio 作者文档](https://github.com/grandju51/comfyui-llm-prompt-studio)提供 H3 专用卡片，分离 system_prompt 和 user_prompt，并允许独立控制思考和采样；其通用1.0温度建议不是 Flash-Next 非思考专用组合，因此本轮仍以 Qwen 模型卡为准，不替换默认 Pack 或用户自定义内容。

[yuhmak 的第一手记录](https://note.com/yuhmak/n/nba19c8a3bf14?hl=en)说明在24GB显存、96GB内存下使用IQ4_XS，并尝试与H3并行；内存不足和SSD交换使视频生成约慢1.7倍。它不是我们的64GB/IQ3_XXS匹配质量测试；资源经验支持继续保持单重GPU阶段，而不是让增强和H3渲染并行。

## 验证与尚未证明的部分

- Focused：Strata服务/请求/owner/参考素材、H3门禁与用户旅程6文件89测试通过。新增测试覆盖三种通用创意档位均发送模型推荐0.7（图片与视频），以及真实HTTP层完整六项参数与关闭思考。
- `npm.cmd run typecheck`、`npm.cmd run verify`通过；完整verify包含单元、86项integration、干净生产构建、20项文字对比度检查。已有启动修复一并接受本次整合状态回归；此前记录的失败仍保留为历史证据。
- 本轮不启动Electron/Strata/ComfyUI、不发GPU请求、不入队。检查时图形应用占用约5.1GiB显存，有Blender/Unreal进程，未停止其他进程；43127/10304/7763无监听，用户原状态SHA-256保持不变。
- 静态与协议回归不证明增强质量提升。下一步应在资源空闲且归属明确时先用现有带图长例验证这套采样，保留原始输出；关键场记的低优先级位置与既有后处理重复问题仍未在本轮修复。思考开关与27B匹配对照尚未进行。
