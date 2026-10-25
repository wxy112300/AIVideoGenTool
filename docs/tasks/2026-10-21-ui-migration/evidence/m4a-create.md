# M4a：创建框架与视频提示词卡

- 类型：Evidence；日期：2026-10-22；阶段状态与新授权以 [TASK](../TASK.md) 为准。首批不代表整页迁移完成。

## 设计核对与实现边界

- 先读 `prototypes/create.html`、`prototypes/app/create.css`、`prototypes/app/create.js`、公共 controls/app CSS，再读 DESIGN 6.7–6.9/7/8 与设计 TASK 决定 23/38/39/40/41。第二版理由：参考素材按原始比例、纵向排列；素材与 Slot 操作分开；右侧按编辑流程分卡；说明不挤占操作区；同一信息不重复；动画不打断输入。首批据此迁移框架与提示词卡，素材卡和参数卡不混入未完成的半套新行为。
- 对接前核对 `create/page.ts`、`view-model.ts`、`page-controller.ts`、`prompt-controller.ts`、`helpers.ts`、`prompt-packs.ts`，并复读长视频 TASK 的真实阻塞与快捷片段任务。FastH3/MOSS 等全部现有模型仍来自现行 catalog，片段仍来自现行 prompt pack，未复制原型假数据/JS 或新增 IPC/队列字段。
- 新 `pages/create.css` 接管页头、模式切换、框架与断点；删除旧 `09-create-header.css` 及被替代的多处框架规则。新 `patterns/create-prompt.css` 接管视频提示词卡。图片提示词和参数仍用旧样式，相关 legacy 共享规则暂留给后续批次。
- 视频/续写编辑区从原来的大 composer 拆出独立提示词卡，保留 textarea、版本、预设、预热/卸载、增强取消/进度、字数参考。顺手修正原视频预设容器缺少闭合 div 的标记问题，补结构断言，避免输入框被工具栏吞入。
- 快捷菜单隐藏的原生 options 仅保留作单一片段身份来源；可见入口换为搜索/分组菜单。插入仍调用原 `insertPromptSnippet`，不改片段内容；保留选择范围、连续插入、无结果、方向键、Escape 返回触发器、Tab/外点关闭、销毁清理。同模式/同模型的重绘保存查询、插入位置与焦点；最初实测的启动扫描刷新收起问题据此修复，并增加真实生产 DOM 旅程的重绘断言。
- 分段选中块跨 DOM 替换保存前次位置，仅该块按设计 token 的 spring/240ms 过渡；减少动态时跳过位移。页头与素材吸顶高度实际测量，宽度切换以容器 1120px 为界。

## 原型与实际 UI

- 1440×1000 同视口、空素材与相同短提示词对照。真实 Electron 使用 focus emulation；原型隐藏窗口关闭后台节流。两边同环境实测：页头高 52px、模式底座 322×36px、首按钮 104×30px；工作区宽 1366px、列间距 18px；提示词卡 795.3125×250px、内边距 16px、间距 14px；编辑区 761.3125×132px、内边距 12px/14px。未迁移的工作区总高度不同，不作整页像素一致声明。
- 临时原型截图与量测：`temp/ui-m4a/prototype.png`、`prototype-geometry.json`；实际 `create-desktop.png`、`insert-search.png`、`create-820.png` 和 `report.json`。菜单全量高 360px，搜索后按内容收缩。
- 相邻续写 1440×1000、英文图片模式 820×800/125% 缩放截图及 overflow diagnose；后者 document client/scroll 均 635px，未出现文档横向溢出。素材/图片旧卡片仍待后续精修，原型全部状态不在首批验收范围。截图工具的这些 Create fixture 未输出交互 smoke 报告，不能将其称为完整 UI smoke；实际鼠标证据见下节。

## 验证

- focused 首轮 5 文件 / 39 测试；最终菜单重绘/结构与 token 归属检查 3 文件 / 44 测试，typecheck 通过。完整 verify 243 文件 / 2410 单元、6 文件 / 91 集成，桌面/LAN 构建与 740 对比度通过；日志 `temp/ui-m4a/verify.log`。
- 自有真实 Electron 最终生产构建：搜索、连续两次插入、正文后半段与光标位置保护、无结果、Escape 焦点、三模式往返草稿恢复、单一 portal 清理、820 无横向溢出均通过。先前失败的启动刷新路径通过菜单状态恢复修复；同页重绘另有生产 DOM 单元旅程断言。
- 真实鼠标清空测试提示词并等待其持久化后运行 prepare：缺提示词阻塞 → 键盘输入恢复 → 实际按钮点击 → task `3fb36ce1-f27f-4cb5-b72e-a89446db88ca`，后续草稿编辑不改变入队快照；`temp/ui-m4a/enqueue.json`。Ctrl+Z / Ctrl+Y 实际撤销与重做通过（`undo.json`）。没有运行队列、ComfyUI 或 GPU，不验证成片质量。
- 用户新允许未接通长视频 UI 演示，已记录 TASK/B20；本批尚未实现分页、布局确认或多段演示，真实 Continuum 功能与门槛保持原状。
- 资源：仅操作本次 `temp/create-smoke-ezHx9s`，经 close-fixture helper 关闭；PID 54100/CDP 11378 已退出，确认命令行后停止本次 Vite PID 53576，5175/18188 无监听。原型与相邻截图进程自行退出。保留隔离证据，未操作用户 App/媒体；此清理不作为原生窗口退出生命周期证据。
