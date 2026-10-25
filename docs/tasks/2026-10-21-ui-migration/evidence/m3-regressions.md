# M3 用户实测回归修复

- 类型：Evidence；日期：2026-10-22；影响：patch；状态由 [TASK](../TASK.md) 维护。
- 用户报告：点击时多个按钮边缘光闪动、进入历史停滞、多处按钮不符合原型。卡死/集体闪动属于回归，不是分阶段迁移的正常边界。此前小数据/空真实历史与完成态截图未覆盖本次场景。

## 修复

- 原生 View Transition 的 update 事务可能暂停绘制；历史列表与延迟播放器挂载在该事务内等待 requestAnimationFrame，会反过来阻塞截图完成。`yieldPresentationTurn` 在截图 update 期间用独立 timer task 保留分段挂载，其他时候继续使用 rAF；不通过删除动画或移除历史功能规避。
- 新控件此前逐个添加样式后立即读取布局，后续按钮会从已计算的旧样式过渡到新样式。现在先批量完成控件写入，再测量标签，并在新 DOM 插入后、几何读取前同步增强。未变标签缓存测量结果，减少缩略图/状态节点更新引起的重复全树布局测量。
- 指针光效只保留一个当前目标，离开/失焦/销毁时清除旧类和坐标；按钮预先获得定位上下文，光效隔离不影响既有 sticky/播放器定位。
- 公共主按钮恢复渐变与内高光，普通图标按钮恢复透明层级，保留 primary/secondary 组合语义。渐变以已通过 AA 的 fill 为最亮端，向下略压暗；没有恢复原型未过对比度的浅蓝白字。页面专属布局与动作层级仍按后续 M4–M8 迁移，不声称全部按钮已逐页对齐。

## 验证与范围

- `npm.cmd run verify` 通过：243 文件 / 2409 单元、6 文件 / 91 集成、类型与桌面/LAN 构建、740 对比度；日志 `temp/ui-migration-m3/regression-verify.log`。最终构建包含修复后的图标组合选择器。新增暂停 rAF 但事务仍必须完成、控件全部分类后才测量、未变标签不重测、旧光效清理的回归断言。
- 自有真实 Electron 夹具种入 500 视频/500 图片合成记录；既有 store 剔除无文件图片版本后保留 500 视频/456 图片。未读取或写入用户真实媒体，所有合成文件路径改到夹具 missing 目录。
- 实际鼠标重复进入 500 条视频历史：668 / 586 / 586ms（本机、focus emulation）；真实键盘打开详情并返回、所有原生事务正常结束，无超时报错。这是修复后的有限样本，不是与旧版本的性能对照。报告 `temp/ui-migration-regression/real-report.json`。
- 实际悬停只产生一个 `.ui-lit`；点击种子按钮前后，无关按钮 border/box-shadow CSS transition 数均为 0；队列未变。光效检查只覆盖该公共按钮路径，不冒充任意页面/任何硬件的逐帧录屏验收。
- 8 条非空历史 mock 的筛选/布局/菜单/键盘/版本/详情返回通过；运行队列的 42→67% 进度、预览与暂停/取消可达；设置 11 分类键盘/焦点/窄屏通过。截图覆盖 900 历史/队列/设置、1120 图片页与 820 英文图片页，人工查看公共按钮及列表。
- 另用空白自有夹具运行既有 prepare-create-smoke：缺 prompt → 输入恢复 → 实际按钮点击 → `adee96e2-bee8-428e-bfdf-7072e0e72c59`，草稿编辑不改入队快照；`temp/ui-migration-regression/real-enqueue.json`。没有清空大列表夹具来迁就空历史前置条件。
- 不启动队列/ComfyUI 或运行 GPU；未验证实际生成。大列表与空白夹具均经 close-fixture helper 关闭，收尾停止自有静态服务 5175 并复核端口/PID；没有操作用户正在使用的 App 窗口。临时证据不提交、不打包。

## 用户复测后的按钮闪光续修

- 用户再次报告：创建页点击任意按钮会使整页按钮的边缘光一起闪。前次修复的批量样式写入仍发生在 DOM 连接之后；上节点击前后采样为当时有限证据，未覆盖连接瞬间和短暂过渡，不能证明该问题已彻底消失。
- 本次用自有真实 Electron 在根 DOM 连接后立即读取按钮 computed style，模拟同步布局读数；同时拦截旧 innerHTML 与新 replaceChildren，保持前后复现条件一致。修复前，种子随机、清空、切图片编辑、图片编辑种子随机、切图片五条路径均使多枚无关按钮发生 border-color/box-shadow transition（包括增强、清空、入队等）。这证实旧挂载顺序存在问题，但未单独定位用户现场首先触发布局读取的组件。
- 现在先在 inert template 中执行不测量的 primeSharedUi，再连接完整树；连接后的 select/tooltip、标签测量和事件绑定照常执行，播放器控件保持既有排除规则。新增 custom element connectedCallback 同步读样式的测试，防止重新退回“先连接、后分类”。
- 事件从鼠标按下前连续追踪到点击后 450ms，非点击完成后单点取样。开发加载及最新生产 file 页面各跑同五条路径，无关动作按钮的 border/box-shadow 事件均为 0；当前目标自身悬停/焦点过渡仍保留。临时对照为 `temp/ui-flash-investigation/early-layout-before.json`、`early-layout-after.json`、`production-after.json`。
- focused：4 文件 / 25 测试、typecheck 通过；完整 verify：243 文件 / 2410 单元、6 文件 / 91 集成、生产桌面/LAN 构建和 740 对比度通过，日志 `temp/ui-flash-investigation/verify.log`。
- 最新生产应用空白隔离夹具中：缺提示词阻塞 → 键盘补齐 → 实际鼠标点击 → task `b3a872f6-e05a-4ebc-af0d-17c53a392ece`；后续草稿编辑未改变队列快照。使用后台 focus emulation，未启动队列或 GPU；`temp/ui-flash-investigation/real-enqueue.json`。
- 相邻非空历史（8 条）筛选/菜单/键盘/详情返回及运行队列进度/预览/暂停取消可达 smoke 通过，截图位于 `temp/ui-flash-investigation/screens/900x800/`。这是合成数据交互证据，不证明实际成片或模型质量。
- 两个自有 Electron 夹具经 close-fixture helper 关闭，PID 3548/67364 与 CDP 10783/12514 已退出；确认命令行后仅停止本次 Vite PID 36384，5175/18188 无监听。未启动 ComfyUI/队列/GPU；helper 清理不作为原生窗口退出生命周期证据。

## 外观设置按原型收尾

- 用户指出色块被替换为文字按钮、分段选择被拆为独立按钮，并明确后续按像素级还原原型体验验收。本轮修正 M3 新增外观卡片，原型与用户数据均不改动。
- 直接核对 `prototypes/settings.html`、`prototypes/app/settings.css` 与 `prototypes/design-system/controls.css`：26×26 色块、10px 间距、双环选中/悬停缩放；分段底座 2px 内边距/间距、8px 圆角、26px 按钮、6px 按钮圆角、12px 字号、240ms 弹性选中底块。保留 radio 与 roving tabindex，监听 resize 更新底块，销毁时释放 observer。
- 先实际测到中文灰阶组宽 266.78125px，而原型为 266px；定位到 legacy 的 `.005em` 字距后在新卡片内明确恢复 normal，并将说明从 12px 修正为原型 11px。最终中文灰阶组 266×32px，首按钮 48×26px、色块组 278×26px，与同环境原型一致。
- 补齐说明、中文/繁中灰阶名和预览行；主题色名字继续用于可访问名称和 tooltip。预览按钮只呈现公共按压/悬停效果、开关只改变本地演示状态，不提交业务任务。预览主按钮保留 M1 已批准的 AA fill 修正，不复制原型未达 AA 的亮色白字。
- 原型与真实生产 App 使用 1120×840 对照；生产 App 另验 820×800 无文档横向溢出。人工检查截图和三组底块的位置；原型隐藏窗口关闭 background throttling，真实 App 用 focus emulation。临时截图/数据位于 `temp/ui-appearance-finish/` 的 `prototype.png`、`prototype-geometry.json`、`appearance-desktop.png`、`appearance-820.png`、`report.json`。整体 Settings 导航与旧页面标题仍随设置页面阶段迁移，不把此次卡片修正称为整页像素验收。
- 真实生产 App 鼠标点色块/深度/动态效果、方向键选择灰阶，逐次等待保存完成并核对 AppApi 状态、DOM 选中态、键盘焦点与底块位置；reduced 生效，预览不新增队列。既有失败回退与保存不覆盖其他草稿的 focused 检查通过（3 文件 / 13 测试），typecheck 通过。
- 最终 verify：243 文件 / 2410 单元、6 文件 / 91 集成、桌面/LAN 构建、740 对比度通过；最终字号调整后重新执行。真实返回创建页，缺提示词阻塞 → 输入恢复 → 鼠标入队 `07777d42-a211-484b-99ba-c3a47e9eb05c`，后续草稿编辑不改队列快照；`temp/ui-appearance-finish/enqueue.json`。未启动队列、ComfyUI 或 GPU，未验证实际生成。
- 显式去除外观 radio 继承的旧按钮按压缩放，色块继续按原型只在悬停时缩放。自有 Electron PID 26484/CDP 14185 已退出；核对命令行后停止本次 Vite PID 16404，5175/18188 无监听。原型截图进程自行退出；helper 清理不作为原生退出生命周期验证。
