# 本次 Prompt 输出语言覆盖

- Status: done
- Updated / Owner: 2026-10-21 / current Codex task
- Scope / Authority: 用户要求在输入框直接指定本次增强输出语言，并避免对白等误判。
- Baseline: 150d07c + 现有 dirty 工作（含本会话已完成的 H3 画质知识）；直接执行，子 agent=0。

## Resume

- 决定：共享解析明确的开头中英语言指令，与后端 target_language/最终任务保持一致；优先于保存设置。不搜索场景、引号、参考或批注中的语言词，不翻译对白/歌词/画面文字，不扩大局部修订范围。冲突的连续开头指令提示纠正。
- 已完成：共享纯 helper、完整 H3 增强/validator 一致性、固定英文模板的条件默认、误判与内容锁及合成 UI 检查；215 focused 与完整 verify 通过。
- 真实 UI 冲突拒绝、错误可见及版本/队列/History 保护通过；副本和 Prompt 资源已清理。实现与静态/合成验证完成。
- 未验证边界：本次 Strata 真实语言输出被显存门槛拦截（需约 20 GiB、实际 16.2 GiB），未降低门槛/关闭其他进程；三种成功语言输出仍需空闲显存后补。识别范围为明确开头中英指令，不承诺任意自然语言理解。
- 语言范围：保持当前中英，不新增持久化字段或任意语言后端支持。

## Implementation and resources

- 范围：`src/core/prompt-language.ts`、完整 H3 请求编译/语言判定、相关测试及 Prompt Pack 契约/Unreleased。
- 不修改用户保存的默认语言，不删除用户原稿中的任何文字；识别的控制头仅作为创作元数据。
- 真实验收优先恢复本会话隔离 fixture `temp/create-smoke-3TNRrl`，复用已完成的模型准备，不重放权重校验；启动/构建前核对资源占用。

## Evidence / handoff

- `npm.cmd run harness:app -- guide prompt` 已读取；代码与 UI 旅程覆盖分开记录。
- `npx.cmd vitest run --config vite.config.ts tests/prompt-language-override.test.ts tests/multimodal-prompt.test.ts tests/strata-prompt.test.ts tests/lm-studio.test.ts tests/h3-prompt-writer.test.ts tests/comfy-ui.test.ts tests/qwenvl-prompt.test.ts tests/user-journeys.test.ts --reporter=dot --silent=passed-only`：8 文件 / 215 项通过。覆盖中文/英文反向偏好、否定/疑问/对白/字幕/引号/代码/局部批注/晚出现指令/不支持语言及冲突，Strata/validator/native/PEFT/legacy 编译，原文内容锁和真实生产 DOM 的增强按钮。
- `npm.cmd run verify`：2375 unit + 91 integration、typecheck、clean renderer/web/Electron build、20 contrast 通过；日志 `temp/prompt-language-verify.log`。此后仅行尾规范化/文档，无语义更改。
- 真实副本恢复：`temp/create-smoke-3TNRrl`，本次 PID 11688 / CDP 6026；settings/素材/queue/History 保持隔离，队列不运行。`temp/prompt-language-ui-smoke.mjs` 计划三例，首例实际 Enhance 点击产生 operation `47c27bb9-9f5d-41c6-a3fa-a955e46aa00e`，被既有显存保护前置拒绝（20.0 vs 16.2 GiB），模型未加载、原稿保留；后两例未执行。证据 `language-ui.json`，不能记作真实成功增强。
- 真实冲突场景：`temp/prompt-language-conflict-ui-smoke.mjs` 通过键盘输入“用英文 / 用中文”并实际点击增强，operation `a51494a1-ac07-4400-96d1-f0c08918f306`；用户可见“请只保留一种提示词输出语言”，promptVersions、queue、History 严格不变，模型 unloaded。证据 `language-conflict-ui.json`。首次脚本误将通用 runtime terminalReason 当作 UI 错误断言，修正为检查实际 flash 后通过；生产拒绝行为未改。
- 清理：AppApi release 返回未加载；`close-fixture-smoke.mjs` 成功，PID 11688 退出，6026/43127 无 listener。ComfyUI 未启动、未运行视频 GPU stage；未操作其他程序，证据保留 gitignored temp。关闭是 harness 清理，不是原生生命周期验收。
- scoped `git diff --check` 通过；保留其他 dirty 工作，不新增持久化字段或修改权重/生成参数。
- 版本影响：patch；Unreleased 已补；usage unknown；没有子 agent、版本 bump、提交或打包。
