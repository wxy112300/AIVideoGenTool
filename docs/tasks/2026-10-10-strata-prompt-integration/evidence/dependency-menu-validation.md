# 节点与依赖菜单修订

类型：Evidence；日期：2026-10-10；范围：设置 UI，不涉及推理。

- Strata、节点与 Python 依赖共用安装/更新分体按钮。未安装项目不渲染三角或位置操作；已安装项保留原有卸载权限，未知位置不提供无效操作，解释器路径不代表 Python 包已安装。
- 位置操作只在三角菜单内，简中/繁中缩短为“打开位置”/“開啟位置”；菜单项单行，浮层宽度按内容适应，收起时整体隐藏。截图透明背景的原因是使用了未定义的 `--raised`，已改为现行 `--ux-surface-raised`；文字、hover 和圆角沿用语义 token。
- 复用既有 `showItemInFolder` 只读定位实际目录；位置失效提示重新扫描、不创建目录。原 History 路径修复、安装/更新/卸载规则不变。
- 最终聚焦测试、`npm.cmd run test:all`、`npm.cmd run typecheck` 与 `npm.cmd run verify:ux-ui-contrast` 通过，integration86项、文字对比度20项；既有 History jsdom `window.scrollTo` 未实现告警未导致失败。
- 用户窗口当时正在运行，生产 renderer 用 `npx.cmd vite build --config vite.config.ts --emptyOutDir false` 更新，保留旧 hashed assets，不执行 clean、不关闭用户窗口。此构建不称为完整 clean `verify`。
- 真实 Electron `temp/create-smoke-NKqAFy`：实际鼠标进入设置和离线扫描，未安装 Strata 无三角/位置操作；已安装 VideoHelperSuite 的菜单收起时隐藏，展开背景为不透明 `rgb(32, 38, 50)`。1280×800、1440×900、960×800的“打开位置”均为一行，无横向溢出或菜单越界；整页截图检查通过，细节裁剪坐标不适用、不作视觉证据。
- 实际点击位置操作经生产 renderer/preload/IPC到系统目录定位，`show-directory-succeeded` 日志匹配本轮 PID；点击后隐藏，持久化 state 完全不变。上一阶段键盘 Enter、菜单互斥、目录消失不创建目录及手动目录拒绝覆盖的证据保留，不以旧截图代替本轮最终样式检查。
- 自有 Electron PID62672、CDP2321、测试 ComfyUI47829已复核退出/无监听；harness清理不是原生窗口退出生命周期证据。没有安装软件、下载权重、启动服务或 GPU 推理，完整实装/模型/性能边界不变。
- 安装/位置菜单为 minor 功能，本次样式与未安装状态修正为 patch，不单独发布或 bump 版本。
