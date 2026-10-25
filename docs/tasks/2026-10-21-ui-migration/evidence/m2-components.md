# M2 共享组件与交互助手

- 类型：Evidence；日期：2026-10-22；状态由 [TASK](../TASK.md) 维护。
- 影响：minor；接入当前动态基线，保留 FastH3/MOSS 增量。未修改持久化字段、preload、IPC、模型能力或执行图。

## 接入范围

- `src/styles/components/{controls,surfaces,motion}.css` 与 `src/renderer/shared/ui/` 承接共享组件；删除旧 foundation/visual-refresh 中被取代的通用按钮声明，其他页面规则继续留在 legacy 层。
- 单选 select 的原生节点继续拥有值、选项、表单与 input/change 事件；自定义按钮/浮层处理分组、禁用、方向键、Home/End、首字母、确认和 Esc。刷新时同步增强，再恢复焦点；多选/显式原生控件不增强。下拉在视口内定位，不被卡片裁切。
- 按钮、文字输入、滑块、checkbox/radio 统一材质；已有分段控件、菜单、评分和对话框保留语义与控制器。播放器/标记编辑器保留专用控制。英文 125% 检查发现输出设置旧 grid 自动列被长说明撑宽，改为 `minmax(0,1fr)`，同时清除共享滑块默认横向边距。
- 一个 tooltip portal 承接 title 与现有富说明，延迟显示、安全文本、视口避让、键盘焦点及 Esc。真实检查发现异步重绘会替换可聚焦说明宿主，已补稳定标识、通用 tabindex 焦点恢复与焦点滚动后的重定位。
- 顶部通知栈独立于页面 DOM，最多四条、逐条计时、悬停/焦点暂停、单独动作与关闭、退出收高及 FLIP。临时无操作通知可以腾位；错误/带操作项排队保留。扫描开始/结束用同一操作 key 替换，避免结束后仍留旧进度。旧 ui.flash* 仅作内部兼容投影，不承担计时或页面显示。
- 动效助手支持 reduced-motion；按钮稳定宽度、真实/不确定进度与排队标记、边缘光已提供。列表相对定位排序（含把手键盘）和两列固定分配/窄屏合列助手已测；其业务挂载分别随 Create/Queue/详情/Settings 页面包推进。骨架 CSS 已提供，等待相应页面接入真实加载状态。
- 本包不声称 chip/评分的逐页排版、邻组边缘光、页面切换/数字补间、所有长操作的取消与排队按钮已接完。它们分别属于后续页面/外壳包；不会用装饰层伪造业务进度或新增取消能力。History 主列表继续保持现有多列布局。

## 验证

- 最终 `npm.cmd run verify` 退出 0：241 文件 / 2396 单元、6 文件 / 91 集成、桌面和 LAN typecheck/build、740 实算 CSS 对比度通过。日志 `temp/ui-migration-m0/m2-verify-close.log`。新测试覆盖 select、通知生命周期/溢出/操作归属、tooltip、焦点恢复、排序、瀑布流与 reduced-motion。
- Vitest 显式排除 `temp/**` 和 `dist/**`，保留默认 exclude；此前临时工作快照被重复扫描，正式 tests 全部保留。共享 UI 与 shell 独立构建 chunk，避免迁移后入口触发大于 500 kB 警告；不据此宣称性能收益。
- 四宽度矩阵：1440×900 18 张、1120×800 16 张、900×800 18 张、820×900 18 张，共 70 张，路径 `temp/ui-migration-m2/matrix`。人工检查四组概览；document 诊断没有整页横向溢出，设置分类条内部横向滚动为既有行为。宽度修复后只复拍受影响图片页，日志 `m2-image-final-*`；en-US/125% 与 zh-TW 补充截图人工核对，document 宽度分别为 875/875 与 1094/1094，无整页横向溢出。
- Queue/History/Settings mock smoke 通过：队列进度更新与操作、历史键盘/菜单/返回/筛选、设置交互；这是模拟状态验收，不代表真实 GPU 执行。
- 真实隔离 Electron：缺 prompt 阻塞 → 键盘输入恢复 → 实际按钮点击 → 任务 `64089625-27e8-40f9-aeb2-824afe85ab72`；继续编辑草稿不改入队快照。工作流 H3 T2VA，1 秒 / 480p，仅入队。记录 `temp/ui-migration-m2/real-enqueue.json`。
- 同一真实 App 实际鼠标打开下拉，End/Enter 保存 12 步，Esc 不改值，刷新后焦点返回；唯一 tooltip 的可见性/视口定位、减少动态及队列快照未变化通过。记录 `temp/ui-migration-m2/real-controls.json`。最终宽度补丁仅影响 CSS；真实控件事件验证使用前一构建，最终构建由截图与完整 verify 覆盖。

## 资源与边界

- 隔离 userData `temp/create-smoke-S6eXuE`，未写用户真实草稿/设置；配置的 ComfyUI 未启动、未运行 GPU 或声称实际出片。
- 独立 App 已请求正常关闭，CDP 14290 与配置 runtime 18188 均无监听；关闭记录 `temp/ui-migration-m2/cleanup.json` 不冒充原生生命周期专项测试。截图静态服务 5175 在收尾停止；既有原型服务及其他任务资源保留。
- 测试、日志与截图均为本机临时证据，不提交生成物；本次不提交、发版或打包。下一阶段按 TASK 进入 M3。
