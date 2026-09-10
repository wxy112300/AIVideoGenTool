# History 封面、缩略图与视频加载提速
- Status: ready
- Updated: 2026-09-10
- Owner: unassigned（用户自行交给 Luna 独立执行）
- Route: bug / performance
- Authority: 用户要求分析优化空间并制定新 plan；本轮不实现、不派子 agent。
- Baseline: HEAD 79c1d6c + 当前工作区。History query/page/fragments/coordinator、媒体相关服务已有大量其他任务改动，执行时重新检查 scoped diff，禁止覆盖。

## Resume
- 已有优化：history-cover-v3 磁盘缓存（源 size/mtime 校验）、renderer URL 缓存、视频缓存读取去重、IntersectionObserver、图片并发 3/视频封面并发 1、Range 流式媒体响应。
- 主要机会：图片卡片先设置原图 src，随后缩略图 miss 又走整图 base64 IPC/解码；图片需保存并再读取成功才显示缩略图；视频 miss 多次 seek 且单队列串行；缓存命中仍有逐卡 IPC/文件检查；快速悬停即加载视频。
- 这些是源码证据，不是本机最新性能归因。旧 500 项测试未测媒体 IPC/解码并发，不能证明封面/首帧快。
- 执行计划：[PLAN.md](PLAN.md)。已细化为 S0–S6 顺序；第 6–11 节给出模块接口、逐消费者共享结果、源 revision 条件保存、preview/final 状态、失效规则、25 个验收用例和三种缓存模式采集规格。
- 已补齐关键边界：无 src 的 img.complete 不能当加载失败；临时视频预览不能阻止最终选帧/保存；同 key 新 DOM 必须收到结果；取消一个订阅者不能取消其他消费者；缺 absolutePath 但协议有效的旧记录仍可展示。
- 下一步：Luna 单 agent 开工，有限基线取证 → 有界实现 → focused + 一次 verify + 真实小样本媒体 smoke；不重做全项目历史研究。

## Ownership / resources
- 本轮仅新建本 TASK/PLAN 并添加任务入口，无应用源码改动。
- 后续允许范围见 PLAN；未预占任何共享文件、dist、端口、userData、GPU 或 ComfyUI。
- 执行者遇到重叠工作先核对 ownership，继续独立工作；不终止其他任务或服务。

## Acceptance
- 冷/热缓存、视频/图片分开计时；具体正确性与性能目标见 PLAN。
- 保留透明图、源路径恢复、历史 ID/版本、详情返回位置、视频播放/seek、缺文件提示、原图查看/复制/导出。
- 本轮只核对当前实现与文档，并细化计划；未运行媒体性能测试、构建或真实 UI，未修改应用代码。
- 子 agent：0；usage unknown。后续实现由执行者分类 patch/minor 并写 Unreleased，不自动发版。
