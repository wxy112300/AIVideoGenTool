# Strata 设置 / 文件准备阶段验收

- 类型：Evidence；状态：passed（仅准备层）；日期：2026-10-10。
- 范围与下一步只由 [TASK](../TASK.md) 维护；下载布局见 [DOWNLOADS](../DOWNLOADS.md)。
- 本次运行应用版本为 0.65.0 的工作区最终构建，不代表 Strata 推理接入。

## 实现边界

- catalog 固定 Strata v0.1.41 / 源码 SHA 与 NVIDIA release asset；两种 GSQ-RCO GGUF 使用同一固定 HF revision，保存精确大小 / SHA-256，视觉投影共用。重新读取固定 setup.py、Git tree 和模型 README，确认 serve/server.py、engine 目录、quant 分片目录、根目录 mmproj 和 Apache-2.0。
- 新增 strataInstallDirectory / strataModelDirectory / strataPort；旧记录自动补默认、坏端口归一化，当前写入拒绝 8080/非整数/越界和准备-only 的 Strata promptModelId。原 promptModelId、provider 和 LM Studio 遗留字段不重解释。
- Electron 聚焦服务仅检查 6 个运行组件路径、4 个量化分片路径和共用视觉投影：不递归、不计算巨型文件 hash、不联网下载、不执行子进程。GGUF exact bytes + magic，只证明下载结构检查通过。
- full 与 dependency/runtime refresh 都回传独立 Strata 证据；缓存键包含两个专用目录，ComfyUI 文件根不用于 Strata。renderer 在目录变更时隐藏旧路径证据，未扫描也能打开固定下载说明。
- 新组件不计入 ComfyUI custom-node 安装批次，不把 TextGenerate 依赖附加到 Strata；两份模型卡按 catalog 顺序紧邻下载准备目录说明。它们不能被选作当前增强模型。

## 自动检查

- 聚焦 8 文件 / 179 tests 通过；随后新增后端保存保护、控制器与 catalog 断言，相关 4 文件 / 50 tests 通过。
- 首次 verify：旧模型数固定 10 的断言失败，已改为原 10 项保留 + 两个准备-only ID；dependency-scanner / h3-continuum-managed 各一项 5秒超时，以 4 workers 独立重跑通过。没有改生产超时或放宽正确性断言。
- 后续完整 verify 通过；最终卡片排序调整后再次完整 verify 通过，exit 0：unit + integration，干净 typecheck/Vite/Electron build，20个对比度组合全部通过。既有 jsdom window.scrollTo 未实现警告未造成失败，未做无关修改。
- 聚焦覆盖空目录零 filesystem 调用、齐全文件与 inference 状态区分、共享投影去重、部分/HTML GGUF 拒绝、Comfy 扫描隔离、固定 revision/hash、8080/越界端口、准备 ID 拒绝、跨 tab 字段保留、下载 guide 的独立/未配置目标和三语言文案。

## 真实 UI / AppApi 层

用既有 launch-create-smoke 创建 gitignored 独立 fixture；空队列/History、空闲 Prompt、未占用的本机 Comfy endpoint（无 listener，应用不启动 ComfyUI）。测试仅使用合成小文件，不下载或伪造可运行 engine/真实权重。

1. 实际鼠标点击 Settings / 节点页，缺文件可见；键盘输入 8080，实际点击保存后错误可见且持久化端口仍为 43127。
2. 合法端口 / 专用源码目录，切提示词页键盘输入模型根。真实组件信息按钮打开固定 revision / 大小 / SHA-256 弹窗，目标属于 Strata 根，不是 ComfyUI models。
3. 实际保存按钮经 preload / IPC / SettingsService 持久化合法配置；原增强模型/provider不变，queue/History相同。实际“扫描环境”按钮后，合成 runtime 文件仅显示“存在（未验证可运行）”。4字节 GGUF仍缺失，Strata不存在于活动模型 select。
4. 关闭隔离 fixture、同状态 resume，AppApi 读取字段与旧模型/provider、queue/History 全部保留。不是 mock save 或 API-only 按钮可达性声明。
5. 最终构建 1280×800 / 1440×900 / 960×800 捕获，卡片文件名、目标、下载信息按钮可见；无 document 横向溢出。确认 IQ3_XXS / IQ2_XS 为前两个下载卡。长页 sticky header 的 scrollIntoView 会裁切滚入卡片顶部，不修改其现有滚动行为。

原始报告 / screenshots 位于本机 gitignored fixture（strata-ui.json、strata-restart.json、final-layout.json、cleanup-*.json）；不提交包含机器路径或合成 engine 的原始附件。

## 资源与未测

三次隔离会话结束都通过现有 close-fixture-smoke，经受控应用确认无 active queue/Prompt/owned Comfy 后请求 JS close。自有 PID / CDP 与 fixture Comfy 端口复核退出；没有终止用户外部进程，没有删除用户数据。JS cleanup 不证明原生 Window.CloseRequested / app exit 生命周期。

未测试 engine/GGUF full hashes、CUDA、私有 Python、pack、MTP、API、真实增强/视觉、GPU交接、生成、质量或 tok/s。约64GB本机RAM只支持选择初始下载候选，不是性能/内存可运行保证。无8080监听、无端口池绑定/回退实现；预留端口只有配置层校验。
