# M8b：基础设置表单

2026-10-24，minor，direct。继续设置迁移，本批覆盖应用与路径及 ComfyUI 的基础卡片；不宣称整个 M8 或所有设置细节完成。

## 本批范围

- 对照 `prototypes/settings.html` 与 `prototypes/app/settings.css`：卡片内边距 2px/16px、14px 标题、52px 起的横向设置行、左右 32px 间距；路径名称与图标在上、完整可编辑输入在下。保留当前所有原生 input/select ID 与读取、保存、迁移、目录选择行为。
- 路径新增打开图标，读取当前输入值，经既有 host capability 打开；失败通知，不保存草稿。输入素材库补 `data-auto-directory`，保留空配置的自动目录含义。新增回归覆盖自动路径、实际编辑、标签关联、路径转义及打开失败。
- 素材库整理入口移到路径卡标题旁，仅改变入口位置，仍使用当前扫描/归档/清理窗口。缓存统计改四列，窄屏两列；清理范围和忙碌/错误/真实进度保留。B17 缓存清理窗口和素材库窗口内部尚未迁移。
- 代理、LAN、GPU 策略统一逐行呈现。开关按原型 36×20、16px 滑块并保留焦点框；显存预留使用现有分段动画运行时和方向键，底层仍是同一个 select 值。保留重试开关、次数、watchdog、队列隔离的真实功能组合；代理说明只保留立即生效/保存重启的决策信息。
- ComfyUI 连接/Python 表单去掉嵌套装饰框；安装路径、实例、版本和问题卡收紧。保留真实离线环境清单、起停/连接测试、实例切换、Python 候选、兼容性/更新及问题恢复。真实扫描提供什么就显示什么，不添加原型示例的推荐/最新版本。

## 验证范围

脚本、报告和截图位于忽略目录 `temp/ui-m8b/`。

- `focused.log`：新增路径行回归与相邻 form/accessibility，38 项通过。
- `verify-complete.log`：255 个单元文件 / 2489 项，6 个集成文件 / 91 项，typechecked build 与 740 对比度检查通过。最终样式微调后重做构建/对比度，见 `build-final.log`、`contrast-final.log`。
- `check-final.log`、`report.json`、`matrix.json`：复用隔离历史夹具、真实 Electron AppApi；CDP 原生鼠标/键盘操作，不调用保存 handler。1440/1280/820/547 宽度，三语在 1440/820/547 核对 ComfyUI 与应用路径卡宽、页面溢出、未转换图标、重复 ID、干净保存条；连续输入保留同一节点，真实点击保存/丢弃，分段选择和方向键同步原生值，打开并关闭素材库窗口。背景窗口启用 focus emulation。
- `prototype-system.png` 用于同宽对照；未修改或重建原型。`zoom-150.json/png` 为导出的真实 DOM + 当前样式、Electron 150% 静态布局检查，不是交互证据。窄屏全局顶栏/通知另属末轮 shell 回归。
- `restart-report.json`：重启到最终 `dist/renderer/index.html`，完整设置与保存结果相同，queue/draft 与原基线严格相同；队列暂停、36 视频/10 图片，生产页面四个路径行可达且无未保存误报。
- `cleanup-source.json` / `cleanup-final.json`：自有 Electron 59676/57304 退出，CDP 12419/14715、Vite 5176、ComfyUI 18188 均无监听。夹具恢复到 `temp/ui-m7d/state-before.json`，SHA256 相同；没有开始安装、更新、GPU 生成、缓存清理或媒体删除。这是 harness 清理，不宣称新增原生窗口退出生命周期证据。

## 继续范围

M8 保持进行中。下一批按 B19 迁移节点/运行时条目卡、真实等待队列与控制台、完成/失败/取消状态及安装动效；进度只用真实事件，不确定进度用不确定态。模型/LoRA 分组与卡片、来源/位置窗口、B17、日志、保存字段名摘要以及 ComfyUI 整体顺序/诊断呈现仍需最后逐项比对。原型不替代现有 catalog 或运行能力。
