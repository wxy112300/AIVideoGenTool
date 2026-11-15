# Modern Web Guidance 设计细节修复

- Status: done
- Updated: 2026-11-13
- Scope / Authority: 用户授权修复设计审查中的四项细节；保留既有布局、主题和业务行为。
- Baseline: 06083b9，工作区含其他任务的未提交改动，均保留。
- Execution: direct

## Resume

- Modern Web Guidance 1.0.0 审查发现：窄窗通知遮挡导航、自绘模态框缺少背景隔离、LAN 标签输入缺 IME 保护、tooltip 不能移入阅读。
- 实现选择：共享 UI 补自绘弹层 inert 隔离，保留原关闭/回焦行为；不扩大为原生 dialog 迁移。
- 四项修复及相邻回焦修复完成，验证结果见下；无剩余实现步骤。

## Implementation and resources

- 文件范围：shared/ui 的 tooltip、runtime 和 modal-isolation；shell/presentation；history/context-menus；surfaces.css；web/tag-input；相应测试、UX 契约、本 TASK 与 Unreleased 条目。
- 保留：排队快照、草稿、历史 ID/媒体、下拉框键盘操作、通知操作/关闭、减少动态效果和取消逻辑。
- GPU/ComfyUI：本任务不启动；应用检查使用隔离合成 state。
- patch 级修复，不修改版本号、不打包或发布。

## Evidence

- 前次审查：Modern Web Guidance CLI 1.0.0；原始截图在忽略目录 `temp/mwg-review/screens/`。
- Focused：首轮8文件/71测试通过；增加信息弹层回焦保护后7文件/51测试通过；最终页头避让调整后8文件/67测试通过。均使用 `npx.cmd vitest run --config vite.config.ts ... --reporter=dot`；最后一轮含真实 Create DOM + 合成端口的输入恢复/点击/快照旅程。
- 完整检查在独立源码副本 `temp/ui-details-validation` 执行，避免同仓库活动任务的共享 `dist`。`npm.cmd run verify` 首轮334文件、3239测试：331文件/3234测试通过；3个clipboard用例因副本缺少temp目录失败，另有NAS重命名EPERM和migration超时。补目录并以2 workers只复核这3文件，32测试全部通过；随后 integration 7文件/127测试、完整build及440组对比度检查全部通过。日志：该目录 `verify.log`、`followup.log`。未将首轮失败写成一次性verify全绿。
- 最终增量：context-menus回焦与页头高度调整后，重新通过相关测试、`npm.cmd run typecheck`、独立renderer构建及440组对比度检查；日志为 `temp/ui-details-final-{focused,typecheck,contrast}.log` 和 `temp/ui-details-renderer-build.log`。
- Electron 原生鼠标/键盘探针：900px下4个主导航与3个模式按钮均通过命中检查、无页面横向溢出；tooltip移入后保持并可Escape关闭。1440px下真实点击Upscale，背景无法聚焦、内部下拉portal可用、Escape只关下拉、Cancel关闭后回到原按钮。证据：`temp/ui-details-after/*-1440x900.json`、`create-image-to-video-900x800.json`；探针脚本 `temp/ui-details-probe.cjs` 基于现有fixture启动器，不引入生产桥接。
- 正常界面截图：`temp/ui-details-after/screens/`，21页面/状态各捕获1280×800和1440×900；Create另验900×800、760×800。通知复用实测顶栏和页头高度，不遮挡主导航/模式切换。
- 已知独立限制：既有History通用smoke仍期待旧action strip，且fixture报告横向溢出；修改前 `temp/mwg-review/renderer` 和修改后均产生同样失败。日志 `temp/ui-details-before-video.log`、`temp/ui-details-after-video.log`，未放宽或改写其断言；本次相关原生鼠标探针独立通过。
- 所有本次Electron fixture均已退出；未启动ComfyUI/GPU/本地服务，未操作其他任务的应用或用户库。未验证真机Safari/实际中文输入法/屏幕阅读器；IME用真实DOM composition/229事件回归验证，截图中的媒体不可用来自合成fixture，不能推断真实播放或生成结果。
- 执行模型/effort与usage未通过工具取得，成本unknown；无委派。patch已记入Unreleased，未改版本或打包。
