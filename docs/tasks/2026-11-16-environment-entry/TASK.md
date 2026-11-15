# 设置环境下载与 Desktop 入口

- Status: done
- Scope: 核查空环境下载入口，修复 Desktop 打开操作；不安装软件、不更新用户 ComfyUI、不重启用户服务。
- Execution: direct；保留工作区其他 UI、Strata、H3 与推荐版本改动。

## Resume

- 空环境扫描完成后，Node.js、Git、FFmpeg、CUDA Toolkit、NVIDIA 驱动和 ComfyUI 均已有缺失项下载按钮，通过 host openExternal 打开官方入口。不新增重复下载区。
- Desktop 原来复用隐藏后台 launchDetached，继承父进程环境/工作目录；spawn 就报成功，随后触发完整扫描。现改独立可见 GUI 入口、程序自身 cwd、移除 Electron Node 模式/ASAR 和 NODE_OPTIONS；后台服务默认仍隐藏。
- Desktop 打开操作不修改环境，不再触发全扫描或 Python mutation/cache invalidation；Git 更新仍保留 mutation、脏目录保护和复扫。按钮改为“打开 ComfyUI Desktop”，不承诺直达更新页面。
- 下载页打开异常与返回 false 都有错误反馈，官方软件链接不经模型镜像改写。

## 验证与资源

- 定向6文件148测试通过，覆盖可见启动、父环境隔离、后台启动不变、OS错误、6种缺失依赖入口点击，以及 Desktop 不扫描/Git 继续扫描。另补服务分支2项通过，确认 Desktop 打开不进入 mutation、不清空探针缓存，OS错误返回失败。
- 独立源码快照完成 verify 等价门禁：单元336文件3268项、集成7文件132项、类型检查/干净构建通过，对比度440项零失败。服务分支新增测试在快照验证期间另行运行，不计入上述全量计数；产品源文件与最终状态相同。
- 自有可见 Electron 窗口使用生产组件、样式、图标和 primeSharedUi：实际点击6个下载按钮与 Desktop 按钮，记录6个URL、1次更新请求、0次扫描、busy恢复false；1200/820宽度无横向溢出，截图人工检查通过。外部打开动作是替身，不声称穿过真实系统浏览器或官方 Desktop 的完整链路。
- 窗口由新的 launchDesktopApplication 实际启动，故意给父进程设置 ELECTRON_RUN_AS_NODE=1，子进程确认该变量不存在且窗口 visible=true；自有窗口自行退出，验证 PID 已不存在。截图与结果位于 `temp/environment-entry-ui`。自有全量快照 node_modules junction 已移除，共享 dist 未改动。
- 真实官方 Desktop 当时已有8个进程但无 MainWindowHandle；没有终止或接管它们，未断言其隐藏原因已被实机证明，也未验证官方程序自身启动恢复。
- 官方链接在线核对：Comfy download、Git downloads、FFmpeg download、NVIDIA CUDA downloads。FFmpeg 官方页提供 Windows 编译版链接；CUDA Toolkit 仍是可选工具，不改为推理必装。
- Electron 环境变量语义：[官方文档](https://www.electronjs.org/docs/latest/api/environment-variables)。隔离窗口、日志与构建产物只留 gitignored temp。
