# Strata 长资料增强优化候选

后续已获用户授权实施；当前进展与实际结果以 [有界思考对照](bounded-thinking-eval.md) 和 TASK 最新摘要为准。下文保留调查时的候选与未实施边界，不再代表当前实现状态。

- 类型：Research / Evidence；Status: researched-not-implemented；日期：2026-10-14。
- 范围：固定安装版 Strata、Flash-Next IQ3_XXS、带图 H3 影视细节扩写。
- 权威：现行 Prompt Pack；本记录不改变默认行为。前序结果见 [长上下文重测](official-long-context-retest.md)。
- 授权：继续寻找优化方法。本轮检查代码、官方与社区资料；未改生产代码、调用模型、入队、下载或更新。

## 已确认的问题与可验证假设

1. 测试场记进入自定义 detailed-cinematic 预设，但 `comfy-ui.ts::h3PromptInstruction` 将该槽明确标成最低优先级 style hint。关键事实不能当作风格。Strata目前把全部契约、原稿、资料合成一个 user 消息；这种写法合法，不等于已证明是质量失败原因。
2. 上述函数已有内容锁定块，`multimodalPromptInstruction` 又追加同一块。候选是集中约束、规则去重、事实/风格分区，保留全部长资料。此前仅移动 system 指令仍失败，不能重复当新方案。
3. 生成和 count_tokens 均强制关闭思考。官方模型默认思考，但开启思考是否改善H3尚未测试；切换时必须同时修改模板计数和输出预算，不能只改开关。
4. 字符预检误拒绝真实可容纳的长输入已经实测：官方完整预留30,674<32,768，产品却提前拒绝。应在重载GPU前用官方tokenizer计数，不截断原资料。底层22,200含图输入已完成，不能说引擎不能处理长输入。
5. 标题遗漏、词面门禁误伤和真实事实偏差并存。可研究只缺字段名的格式恢复、区分控制性措辞与内容事实；不靠补句、降低字数门禁制造扩写通过。

## 来源与边界

- [Qwen官方模型卡](https://huggingface.co/Qwen/Qwen3.8-Flash-Next)：思考组合 T=1/top_p=.95/top_k=20/min_p=0/presence=0/repetition=1；非思考组合 T=.7/top_p=.8/top_k=20/min_p=0/presence=1.5/repetition=1。不能保留非思考presence再盲目开启思考。原生长上下文不是本机资源保证，也不会自动让答案更长。
- [已安装Strata版本细节](https://github.com/Niko1221/Strata/blob/fb58e0dbc8399662c0e47c76578c6e878b14f6cf/docs/DETAILS.md)：已支持硬预算 reasoning_budget_tokens；预算结束后补收束并续写答案，收束也占输出。max_tokens包含思考与答案；努力级别不是硬预算。penalty_last_n默认64，同参数跨框架未必同效果。JSON schema是生成后校验，不是约束解码。
- [首手循环报告#728](https://github.com/Niko1221/Strata/issues/728)：用户记录过长推理循环，硬预算只是限损；不同任务、温度和设备的报告不构成本机H3质量证据。不采用无限high或个人greedy设置作为默认。
- [T8 H3桥接](https://github.com/T8mars/comfyui-minimax-h3-prompt-enhancer-T8/blob/main/docs/strata-bridge.md)：确有H3用法，默认非思考但可控制努力/预算；证明可接入，不证明当前量化长资料质量。其8080示例不采用，保留应用43127及原冲突策略。
- [社区Prompt Studio](https://github.com/grandju51/comfyui-llm-prompt-studio)区分目标system卡与用户创意，是分层参考，不是匹配对照证据。
- [Anthropic长资料建议](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)的文档分区、来源标记、任务置尾是可迁移假设，不照搬其收益到Qwen。

## 建议有限对照，尚未执行

先修真实tokenizer预检。用同一图片、原稿、完整长资料、量化、KV和输出总上限；先消除旧用例首帧红灯与只允许4/10秒闪烁的冲突，右侧建筑只称建筑。更正输入后重跑基线，不能将旧结果作严格对照。

| 组 | 组织方式 | 模式 |
| --- | --- | --- |
| A | 当前合并模板；事实移出风格槽 | 当前官方非思考组合 |
| B | 短system格式契约；完整原稿/图片/事实分区；风格单列；任务置尾；规则去重 | 与A相同 |
| C | 与B相同 | 官方思考组合，medium，硬预算2048 |

2048是实验起点，不是官方H3推荐。8192总输出包含思考/收束，模板计数必须匹配模式和努力级别并预留图像。每组一次仅筛选候选，不推算稳定失败率；超时、预算无正文、资源异常或用户取消即停止，不循环调参。有收益后再重复并做同题27B对照。

保存原始回答，分别记录传输、格式/长度、事实质量。重点看主体/背景独立性、动作顺序、全程地面、灯光和广播时点、对白逐字、参考图事实、真正新增的执行细节；不靠字数或关键词单独定好坏。思考不写入H3正文，不创建生成任务队列。

第二梯队可试同模型先产简短事实/约束清单，再写H3、仅对具体遗漏做一次纠正，会增加成本。更大量化、KV精度、context和MTP不是第一步；MTP不能作为质量修复。没有匹配27B对照，不能宣称模型更差或保证优化后超过27B。

## 收尾

依local-video-studio技能将社区建议视为待测假设，不替换默认Pack。仅检查文档差异与链接，不重新build/GPU测试；既有未提交修改保留，不bump/提交/推送，新增子agent0，费用/token统计unknown。
