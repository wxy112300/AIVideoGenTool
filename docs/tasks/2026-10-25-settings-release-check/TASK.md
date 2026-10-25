# 设置安装控件与上游版本检测

状态：完成；影响：patch。

用户反馈安装/更新控件偏离原型、重复文案、节点与 Strata 最新版本显示异常。范围为控件呈现和只读版本查询，不升级节点或修改推荐安装线。

## Resume

追加默认模型／Sulphur／LoRA 说明／硬件徽标细节（patch）：默认模型首标签去掉顶部多余分隔线；Sulphur 专用两列 label-over-control，窄屏一列，字段与值不变、超时单位三语本地化。删除 structure 中旧 LoRA 说明的行边框、10px 标签和硬编码配色，改为一致字号／行高的标签与正文及间距分组。标题硬件徽标恢复 surface-2 底色与内边距、截断保留完整 title。确认真实数据为 environmentScan.gpus，由 nvidia-smi index/name/driver/memory.total 解析；不用模型 VRAM 建议或扣预留的预算，多 GPU 逐项显示，检测缺失不显示假型号。定向 `polish-focused.log` 121 项通过；最终全量和窗口证据见后续验收。

本轮细节验收：`temp/settings-install-layout/polish-verify-final.log` 2587 单元 / 91 集成、typechecked build、440 对比度通过。`polish-ui-report.json` 为最终生产窗口实际 Settings 视频／图片／LoRA：两类默认首行边框均 0px，硬件徽标背景 rgb(34,34,34)；AppApi 检测与本机 nvidia-smi 精确一致，RTX 4090 总显存 24564 MiB，格式化 24.0 GB。多 GPU 与检测缺失另有单元回归。Sulphur 1280 / 820 两列、卡高 208.30px，控件分别完全填满 458 / 356px 字段列；547 单列、控件 471px，无横向溢出。LoRA 说明三行无内部边框／额外行 padding、标签正文均 11px、组间距 10px。已人工检查最终 `polish-sulphur-1280.png`、`polish-video-top.png`、`polish-lora-guide.png`。`cleanup.json` 自有 PID 15604 / CDP 5127 正常关闭，5127 / 18188 无监听；初轮 15804 同样已关闭。空队列、ComfyUI 停止、Prompt 空闲；未安装节点或改模型／用户库。

追加 LoRA 瀑布流遗漏修复（patch）：之前共享设置控制器只匹配 `.settings-node-grid`，LoRA 分组仍按 grid 行撑高。现在同时匹配 `.settings-lora-grid`，复用固定交错双列、1100px 以下原序单列和清理逻辑；不改卡片内容、模型目录或草稿。控制器参数化测试覆盖节点／LoRA 两种真实挂载入口、断点原序与 DOM 身份。定向 `lora-focused.log` 19 项通过；最终全量及真实窗口证据随后补充。

LoRA 验收：`temp/settings-install-layout/lora-verify.log` 2586 单元 / 91 集成、typechecked build、440 对比度通过。`lora-ui-report.json` 为最终生产 Electron 实际 LoRA 页面、鼠标展开首张真实卡片的使用说明：左卡增加 173.34px，同列下一卡下移；右列所有卡片 top 不变，滚动位置稳定、卡片身份保留。820 / 547 恢复原序单列，1440 回双列，展开状态与节点身份保留、无页面横向溢出；已人工比对 `lora-before.png` / `lora-expanded.png`。`cleanup.json` 自有 PID 65996 / CDP 2964 正常退出，2964 / 18188 无监听；空队列、ComfyUI 停止、Prompt 空闲，未安装或改动模型文件。

当前追加环境页／升级进度反馈：环境区压缩行高、状态图标和版本长串，统一列与按钮位置；去掉常驻 home 及默认 runtime 未连接段落，保留操作、启动／重启和错误反馈。所有有真实路径的检测项提供打开位置；ComfyUI 行转发既有目录 picker，Python 仍用既有解释器 picker。Node/Git/FFmpeg 等按系统解析，没有新增只改显示不影响运行的假路径覆盖。折叠日志改主题 token。Git clone / pull 加 `--progress`，进程 stdout/stderr 分别做 UTF-8／CR／LF 缓冲，最后一行在结束时刷出；共享纯解析器只读取当前 Git 阶段百分比，后续依赖／重启校验回到等待动画。日志事件局部更新已挂载按钮／细条；finalizing 保持可见活动日志和等待条。未改安装来源、事务、目录或 IPC 持久化字段。

定向 `environment-focused.log`：136 项通过；typecheck 通过。完整验证与生产窗口证据待本轮完成后追加。

### 环境区／Git 进度验收

- `temp/settings-install-layout/environment-verify.log`：2585 单元 / 91 集成、typechecked build、440 对比度全部通过。`git-report.json` 用独立临时 file:// 仓库实际 clone 与 pull，经最终构建的 runLoggedProcess 获得 57 / 9 条可解析阶段进度；未访问或安装用户节点。Git 的阶段有时跳得很快；等待阶段保持动态条，无总进度估算。`--progress` 的非终端行为见 [Git clone](https://git-scm.com/docs/git-clone) / [Git pull](https://git-scm.com/docs/git-pull) 官方说明。
- `environment-ui-report.json`：生产窗口实际进入环境页，1280px 环境卡 422px 高，工具行 52px、服务行 44.5px；详情列统一 x=469，6 个打开位置按钮与 ComfyUI picker 可达，未解析图标 0、默认重复状态 0。1280 / 820 / 547 无页面溢出，窄屏按标签／详情换行。路径选择另由真实控制器单元测试验证 picker → input → draft → scan，未打开／修改用户系统路径。
- 生产组件显示夹具覆盖 Git 12% → 68% → Resolving 35% → 依赖检查 indeterminate，按钮宽度、节点／图标身份、滚动位置不变；finalizing 活动日志／进度条仍可见。`git-animation.json` 与 `git-frames/` 110 连续 compositor 帧，已人工查看 025 / 075；`environment-compact.png`、`environment-547.png`、`completed-log-theme.png` 已人工检查。折叠日志背景 rgb(17,17,17)、文字 rgb(180,180,180)、无旧边框。阶段呈现夹具不代表执行过真实依赖安装。
- `cleanup.json`：自有 PID 59876 / CDP 14805 正常退出，测试端口 14805 / 18188 无监听，空队列、Prompt 空闲、ComfyUI 停止。未运行 GPU、未改用户推荐线或节点目录。

本轮补修节点安装布局（patch）：复用双列 masonry 固定交错分配，1100px 以下恢复原始单列顺序；安装日志增高只推动所在列，未换卡片 DOM。去掉节点下拉菜单重复的全量扫描，导航更新圆点与文字用显式间距。恢复 custom-node / llama 的等待阶段流动条、Strata / H3 环境此前被 CSS 隐藏的进度条；安装按钮固定定位上下文，避免仅 Hover 时才获得定位导致填充动画错位。Strata 仍使用真实字节百分比，其余阶段不伪造比例。依赖操作不再加入全局“最长文案”宽度缓存，取消／完成后不继承排队或收尾文案宽度，安装期 Hover 取消仍局部预留。

最终 `temp/settings-release-check/layout-verify-final.log`：2580 单元 / 91 集成、typechecked build、440 对比度通过。新增分列节点身份与断点顺序、活动空日志进度条、结束后折叠日志及依赖按钮移除遗留宽度检查。没有修改安装事务、推荐值或用户运行环境。UI 动态证据见后续本轮验收。

### 本轮布局／动画验收

`temp/settings-install-layout/report.json`：最终生产 Electron 实际进入设置／节点页，4 个分组已分列，下拉菜单重复扫描为 0；随后使用生产 renderer 的隔离显示状态。日志增高后右列所有卡片 top 不变、同列后续卡片随高移动、节点身份不变。112 个连续 compositor 帧与 rAF 记录确认按钮填充／圆环／日志上方细条运动，Hover 取消期间按钮宽度固定、控件身份保留；人工查看连续帧及 `independent-columns.png`、`strata-download.png`、`completed-width.png`。状态夹具实际点击取消按钮后经历收尾再恢复更新，主按钮前后均 70.14px；这项是呈现验证，没有启动真实安装／取消进程。Strata 真实百分比呈现使用 38% 事件夹具，按钮与可见 2px 条一致；导航圆点间距 9px。1440 / 820 / 547 无溢出，窄屏恢复单列，减少动画模式停止进度运动。

`cleanup.json`：自有 PID 61320 / CDP 12173 已正常关闭，空队列、Prompt 空闲、ComfyUI 停止，18188 未启动且端口已释放。首轮诊断 PID 47896 也已退出。没有操作用户正在测试安装的窗口或修改依赖目录。

按钮高光与推荐值反馈已完成：灰色重装/修复按钮此前仍继承 primary 的 inset 高光，已在普通/Hover 状态清除；保留蓝色首次安装与浅色更新的状态区分。llama-cpp-python 此前推荐被硬编码为空，已将安装器的 0.4.2 / 20261003 固定线移入共享 core catalog 文件，旧服务导出保持兼容，界面引用同一常量。固定/滚动节点补推荐 revision 或跟随上游策略；原型“固定版/滚动版”类型仍保留。CUDA build suffix 不再导致 0.4.2+cu130 比 0.4.2 被误标更低。

`recommended-verify-delivery.log`：2577 单元 / 91 集成、typechecked build、440 对比度通过；定向 45 项通过。`recommended-report.json`：最终生产 Electron 的 23 张版本/推荐卡片均有目标，llama 推荐 0.4.2 且未误标 behind，普通/Hover box-shadow 都为 none；复制设置的失效本地代理探针使上游查询失败，Continuum 推荐仍为 3.9.1；1440/820/547 无溢出。`recommended-normal.png` / `recommended-hover.png` 已人工查看。未安装或更新依赖，未保存探针代理设置；`recommended-cleanup.json` 自有 PID 44020 / CDP 7818 已退出，空队列、Prompt 空闲、ComfyUI 停止，18188 未启动。

运行时旧设计反馈已收尾：llama-cpp-python 去掉重复组件块、安装详情入口和缓存验证段落，环境信息仅在状态悬停，已安装但未就绪的修复原因保持常显；Strata 删除内部阶段与安装校验大段说明，三语端口提示只保留默认值和 8080 限制。未改安装/扫描/版本逻辑。

`runtime-copy-verify.log`：2576 单元 / 91 集成、typechecked build、440 对比度通过。`runtime-copy-report.json` / `runtime-copy.png`：最终生产窗口真实节点页，llama 卡片高度 112px，无旧组件或说明入口，环境在状态 title；菜单鼠标展开与 Escape、Strata 高级设置、1440/820/547 无溢出通过。markup 回归同时确认失败原因没有被折叠隐藏。`runtime-copy-cleanup.json`：自有 PID 53840 / CDP 6506 已退出，空队列、Prompt 空闲、ComfyUI 停止，18188 未启动；未安装或修改用户依赖。

用户追问大量“未获取”，已确认首批只覆盖 GitHub Release，来源覆盖不足。已补 Comfy Registry：从登记仓库 HEAD 的 project 表读取包 ID，校验 Registry 返回的包 ID 和 repository，选择较新的 Registry / GitHub 正式版本；没有正式发布时显示源码声明版本并在数值悬停注明来源。不会用同名 fork 的 Registry 版本，不改变推荐或安装线。当前 16 个按版本号展示的节点均有真实观测值，增量运行时刷新保留来源；固定与滚动条目仍按原策略显示。下文“首批验收”为上一批证据。

## 来源补全验收

- `sources-verify.log`：269 单元文件 / 2575 项、91 集成、typechecked build、440 对比度全部通过；`sources-focused.log` 48 项通过。新增覆盖 Registry 仓库/包身份拒绝同名 fork、project 表边界、较新的正式发布选择、离线降级、源码身份与来源标注。
- `sources-scan.json` / `sources-finish.log` / `sources-report.json`：最终生产 Electron Settings 实际点击“重新扫描全部”，真实 AppApi 查询覆盖 16 / 16 版本化节点。VHS 1.7.9、KJNodes 1.5.2、SeedVR2 2.5.24 等来自 Registry；维护 fork 的通用 GGUF 2.0.0 来自其自身 HEAD，未串到同名 Registry 原仓库；无正式发布的 FlashVSR 与 Latent Upscaler 标注源码来源。Strata 本轮已更新到 0.2.6。Registry / Release 数值是观测信息，Registry 的发布状态或源码版本不等于应用推荐/兼容验收，不触发安装。
- `sources-ui.png`：真实页面数值恢复，KJNodes 的来源 title 为 Comfy Registry，通用 GGUF 为 pyproject.toml · HEAD；运行时窄范围扫描后版本/来源严格保持。没有为每个节点增加解释段落。
- `sources-cleanup.json`：自有 PID 55404 / CDP 5244 已关闭，队列空、Prompt 空闲、ComfyUI 停止，18188 未启动；真实库与推荐安装线未改，没有安装/下载权重/执行 GPU。

来源核对：[官方 Registry 说明](https://docs.comfy.org/registry/overview)、[Manager 的 cnr_utils.py](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/glob/cnr_utils.py)。

已定位：GitHub 请求 3.5 秒超时、成功结果六小时缓存、失败一分钟缓存；节点失败后将 catalog 版本冒充最新，Strata 失败则清空。实测还遇到匿名 REST 额度归零。已改为读取官方稳定版跳转的最终 tag，不抓 HTML，不依赖 REST 额度；12 秒网络预算，Windows 使用 curl 并保留配置代理，无 curl 且直连时使用 fetch。最多四个并行请求，合并同次查询，成功结果供后台复用；用户手动扫描通过新增可选 IPC 字段使上游缓存失效，保持后台任务不重复联网。失败或没有有效 Release 时显示“未获取”，不修改推荐安装线。

安装控件对照原型：保留 28px 主按钮与箭头，修复分体间距、更新圆形向上箭头、更新浅主题色、安装时箭头配色与灰色悬停；去掉菜单箭头重复 title，将“文件与版本检查通过”收紧为“已就绪”。最新值只有高于本机时才强调，避免较旧的上游 release 被误标为更新。

## 首批验收

忽略目录 `temp/settings-release-check/` 留有诊断、真实截图与连续帧，不包含在提交内容中。

- `verify-final.log`：268 单元文件 / 2571 项，6 集成文件 / 91 项，typechecked build 与 440 对比度检查全部通过。覆盖失败重试、成功缓存与手动失效、代理隔离、四并发及失败释放、官方跳转身份、无有效版本不冒用 catalog、设置扫描参数与按钮交互。最终生产代码此后未修改。
- `check-delivery.log` / `scan.json`：最终生产 Electron 经实际 Settings → 节点与依赖 → 重新扫描按钮与真实 AppApi 查询，Strata 0.2.5、Continuum 3.10.2、Motion Context 0.7.1、Writer 0.4.7、MultiModal 1.0.16；SeedVR2 上游 Release 2.5.23 低于本机 2.5.24，按真实观测显示，不倒推“新版本”。KJNodes、VideoHelperSuite 的 latest 入口回到 releases 列表，没有有效 tag，保留未知；不代表它们没有源码或 Registry 更新。
- `report.json`：重装/更新/处理中与排队呈现、菜单鼠标和 Escape、无多余 title、图标均解析、28px 按钮；1440 / 820 / 547 无页面或卡片横向溢出；跟随系统减少动画有效。状态夹具只调用生产 renderer 与生产 CSS，不启动安装事务。
- `animation.json` / `frames/`：84 连续 compositor 帧；圆环旋转、Hover 取消再恢复期间按钮/图标 DOM 身份保持，按钮宽度、位置和滚动位置不变；人工查看 015 / 045 / 075 帧。该证据不声称物理屏幕恒定帧率或真实安装吞吐。
- `cleanup.json`：最终自有 PID 24556 / CDP 3212 已关闭，测试队列为空、历史为空、Prompt 空闲、ComfyUI 停止；18188 未启动。前批 PID 65760 / 60840 已退出。所有操作在独立 `temp/create-smoke-tXamoX`，未修改真实库，不安装/升级依赖、不跑 GPU、不删除用户媒体。

官方来源：[Strata 0.2.5](https://github.com/Niko1221/Strata/releases/tag/v0.2.5)、[Continuum 3.10.2](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.10.2)。仅证明读取到发布身份，不代表这些新版已通过本应用生成兼容验收。
