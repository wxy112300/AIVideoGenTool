# Prototypes

2026-10-20 起的新设计原型，无构建步骤，直接用浏览器打开 HTML 文件即可。早期原型已归档到 [legacy/](legacy/README.md)，只作历史参考。

页面之间无缝切换（跨文档 View Transition，顶栏不动、内容交叉淡入）需要同源 http：在仓库根目录运行 `python -m http.server 5199 --bind 127.0.0.1`，打开 `http://127.0.0.1:5199/prototypes/`。`file://` 下浏览器不允许跨文档过渡，只能淡出再淡入。正式程序是单页应用，用 `document.startViewTransition()`，不存在这个问题。

| 文件 | 内容 |
| --- | --- |
| [index.html](index.html) | 页面原型入口 |
| [create.html](create.html) / [queue.html](queue.html) / [history.html](history.html) / [video-detail.html](video-detail.html) / [image-detail.html](image-detail.html) / [settings.html](settings.html) | P3 页面原型：共用顶栏与导航，按现有 renderer 划分区块，每个区块列出必须保留的入口；区块内容逐页与用户确认后填充 |
| [app/](app/) | 页面框架：`boot.js`（首帧前恢复外观）、`app.js`（顶栏、返回顶部、原型状态、分类标签、设计系统接线）、`app.css`（页面网格、区块占位、原型控制面板） |
| [style-tile.html](style-tile.html) | 设计系统目录：灰阶 / 深度 / 主题色切换、字体与图标、按钮层级与边缘光、输入与下拉、滑块与开关、提示词编辑（快速插入）、媒体输入、LoRA 堆叠、菜单与对话框、状态、导航、历史（筛选 / 批量 / 时间轴）、详情（标签 / 评分 / 收藏 / 版本）、队列、长视频、设置（模型 / LoRA / 节点 / 运行时）、动效、文案 |
| [design-system/tokens.css](design-system/tokens.css) | 设计 token（灰阶、深度、主题色、语义色、字号、间距、圆角、动效），规范见 [DESIGN.md](../DESIGN.md) |
| [design-system/controls.css](design-system/controls.css) | 基础、按钮、边缘光、表单控件 |
| [design-system/surfaces.css](design-system/surfaces.css) | 卡片、状态、菜单、对话框、通知、导航 |
| [design-system/ds.js](design-system/ds.js) | 边缘光、自定义下拉（原生 select 为数据源）、滑块、菜单、对话框、FLIP、进出场、数字补间、通知 |

约定：

- 原型展示视觉与交互意图，不证明持久化、IPC、模型支持或运行结果。
- 媒体用渐变替代，不提交任何生成作品或用户数据。
- 页面原型以当前 renderer 的 DOM 结构和功能入口为准，不删减功能；只有用户在 [任务](../docs/tasks/2026-10-20-ui-design-system/TASK.md) 中确认过的部分才作为实现依据。
- 图标直接加载项目依赖 `node_modules/lucide`（与 renderer 同源），需要先 `npm install`。
- 页面原型左下角“原型”面板不属于产品 UI：切换页面状态（`<script id="proto-states">` 声明，元素用 `data-when="key=a|b"` 控制显示）、模拟窗口宽度（容器查询，对应 renderer 的 1120 / 900 断点与 820 最小宽度）、显示区块标注与保留入口。外观与视图选项保存在 localStorage。
- 区块中的“保留入口”清单来自当前 renderer 的概览，标为“待按现有 DOM 核对”的区块在填充前需对照源码逐项确认。
- 设置卡片中的下载指引对话框对应现有安装指引：字段和“关闭 / 打开目录（不存在则创建）/ 在浏览器中下载”三个操作不变，只添加了复制按钮（待确认）。
