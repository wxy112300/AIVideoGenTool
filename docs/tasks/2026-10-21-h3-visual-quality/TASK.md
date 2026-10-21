# H3 写实画质知识与快捷插入

- Status: done
- Updated / Owner: 2026-10-21 / current Codex task
- Scope / Authority: 用户要求收集 H3 画质提示词资料，加入知识库供增强器理解，并增加写实快速插入。
- Baseline: 150d07c；仓库已有 Omni、History、UI 等未提交改动，保留；本任务直接执行，无子 agent。

## Resume

- 已确认：官方格式包含视觉风格；本库 H3 图为 BasicGuider 正向条件，无独立负向通路。社区对自定义 CFG 和自然语言否定存在不同建议，不能混同为当前图能力。
- 决定：完整增强编译器引用共享视觉知识，与紧凑控制头分开；增加一个三语快捷项；保留所有原快捷项、预设、用户设置及执行参数。动画/绘画/CG 意图与参考连续性受保护。
- 已完成：资料归档、共享知识、三语快捷项与请求/DOM 测试；focused 198 项及完整 verify 通过；真实 Electron 快捷项、输入恢复、实际入队及快照保护通过。
- 已完成真实 Strata 增强：新增 Prompt 版本，正文融入自然肤质、随转头变化的光影和衣料响应；保留固定镜头、动作及无对白/配乐。测试实例和模型已释放。
- 未验证边界：未做实际视频画质 A/B，不声称成片画质增益；其它风格/模式为请求编译与合成 DOM 覆盖，非逐模式真实成片。

## Implementation and resources

- 范围：`src/core/prompts/h3/visual-quality.ts`、完整 H3 请求编译器注入点、snippets/三语索引、对应测试、Prompt Pack 契约和研究。
- 资源：开始前任务列表无其他 active 仓库任务，进程检查无本库 Electron/ComfyUI/构建；不触碰外部进程。构建/运行时操作前重新核对。
- 来源与边界：[研究记录](../../research/h3/2026-10-21-visual-quality.md)。质量词表是方向性启发，需固定参数对照生成才能评价效果。

## Evidence / handoff

- `npm.cmd run harness:app -- guide prompt` 已读取；受影响路径为 Prompt Pack → 完整 H3 请求编译器 → Strata/其它完整增强。初次 focused 发现控制头长度边界回归，已将知识拆成独立共享块，保持原长度断言。
- 版本影响：minor（新增可选快捷项与增强知识），仅追加 Unreleased，不单独 bump。
- `npx.cmd vitest run --config vite.config.ts tests/h3-visual-quality.test.ts tests/prompt-pack.test.ts tests/prompt-snippet-insertion.test.ts tests/user-journeys.test.ts tests/h3-prompt.test.ts tests/strata-prompt.test.ts tests/h3-prompt-writer.test.ts tests/comfy-ui.test.ts tests/lm-studio.test.ts --reporter=dot --silent=passed-only`：9 文件、198 项通过。
- `npm.cmd run verify`：2342 unit + 91 integration、clean/typecheck、renderer/web/Electron build、20 项 contrast 全通过。既有 jsdom scrollTo 和 bundle-size 提示未导致失败。仅行尾规范化与文档更新发生在此后，无语义更改。
- 真实 Electron：`temp/create-smoke-3TNRrl/quality-ui.json`，缺 prompt 门槛、新快捷项键盘选择/实际鼠标插入/焦点保留、实际按钮入队、后续草稿不改 task snapshot 全通过；task `28c7be57-2d3a-4889-b97b-2492f0eacab4` 已取消，队列始终未启动，无视频生成。
- 隔离副本默认 LOCALAPPDATA 无 managed Strata；通过副本 AppApi 指向原已安装目录、刷新 renderer 后恢复，空 prompt 实际按钮提示补媒体且无模型操作。真实 Strata operation `321174b4-f8c7-4797-9216-5fe12f016621` 完成，version `54d5094d-83d0-4640-916d-54bca8589315`；证据 `temp/create-smoke-3TNRrl/quality-inference.json` / `quality-output.txt`。首次权重校验超过 harness 原 240 秒等待，继续观察同一次 operation 后成功，未重提、未下载。
- 文本人工核对：有微纹理/毛孔、随转头平滑变化的高光阴影、衣料褶皱；动作与固定中景连续，无对白、配乐为 N/A，无 negative_prompt 字段；未硬加颗粒、浅景深或 PBR/CG 串。queue/History 与增强前严格一致。仅此例可证明真实文本应用，不扩大为模型全局画质保证。
- 文档链接检查 missing=0；scoped `git diff --check` 通过；无本次删除，预存 dirty 工作保留。
- 清理：`releasePromptModel()` 成功，Strata unloaded/stopped；`close-fixture-smoke.mjs` 通过。PID 38776 已退出，14702/43127/8188 无 listener，Python 无残留。ComfyUI 始终未启动、无视频生成；此次关闭仅为 harness 资源清理，不作为原生退出生命周期验收。证据保留在 gitignored temp；用户草稿/历史/设置未被该副本覆盖。
- 执行：当前主 agent 直接完成，子 agent=0；whole-tree usage unknown，未执行版本 bump、提交或打包。
