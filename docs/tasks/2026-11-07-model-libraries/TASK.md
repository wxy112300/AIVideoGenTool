# 多模型库

- Status: complete
- Updated: 2026-11-07
- Authority: 用户授权多模型库逻辑与设置UI，支持新增、移除、拖动排序；每个库选到 models 根，内部使用现有相对路径，不自动识别任意布局。
- Execution: direct，子 agent 0；保留已有无关改动，不提交/打包。

## Resume

已实现有序 models 根列表、旧单目录兼容、扫描与ComfyUI/Strata相同查找顺序、定位真实文件。路径页按用户最新要求改为＋直接新增空行、手动输入/系统选择目录、移除非首行及鼠标拖动排序；第一行标记默认且禁止删除，不再提供上下按钮、独立默认选择或标题下说明。空行保留但不参与扫描，所有图标补hover提示。普通扫描仅进入标准/catalog分类根，分类内递归，每库20,000文件及10秒预算，按配置顺序合并并保留真实位置；异常库显示不可访问/超限，未做权重hash。Strata维持固定子目录和必要文件校验，同组分片同目录。目录登记不搬动/删除文件；新任务冻结显式库列表，旧单目录与旧任务兼容。远程端点仍由远端管理；不声称任意第三方硬编码路径已适配。

验证已完成到真实UI、空行持久化、输入/拖动/默认角色及实际ComfyUI路径解析层，未跑神经生成/性能A/B。＋不再调用原生选择器；输入和目录浏览分开。目录浏览继续复用原IPC，系统目录选择器本身未自动操作，真实NAS断连延迟未验。未修改用户正式模型库配置。

## Acceptance

- 旧单目录行为不变；多库按顺序确定重复相对文件，跨库可提供不同组件。
- 设置支持新增空行、移除非首行及拖动排序，保存/重启保留；移除不删除文件。
- 扫描、实际节点路径和打开目录一致；离线库不阻塞其他库且不可伪报就绪。
- focused、verify及真实隔离UI；运行验证使用自有资源，GPU不可用时明确边界。

## Evidence

- 本轮显示规则：用户选择直接显示完整路径；存在时仅最高优先级实际命中，缺失时默认库完整目标文件路径。卡片使用同一定位/家族目录规则，已有文件弹窗移除默认应放目录与其他副本列表。
- 本轮验收：48项focused通过，完整verify退出0（当前整合工作区3198单元、127集成、类型/双端构建、440对比度）。真实Electron `full-path-report.json` ok：两个库都有SeedVR2同名文件，仅显示首库完整实际路径，详情无次库副本/默认应放目录；Real-ESRGAN缺失项显示首库完整目标文件路径；600px无横向溢出。人工查看详情截图，未运行权重推理、未改正式配置。证据 `temp/model-libraries/full-path-*` 与 `temp/create-smoke-gRyUlg/full-path-*`；AppApi清理成功，PID40012/CDP13475/18462退出。保留队列性能任务的共用runtime/CSS等并行修改。

- 最新追加：按用户要求将模型库原生拖放替换为 LoRA 的 mountSortable；非首库显示顺序编号。安装指南已存在文件使用“打开所在目录”，缺失文件提供默认/编号库目标菜单，空路径禁用、title 显示完整目标，沿用主进程 mkdir + open。Strata 菜单按每个库的模型家族子目录映射；编号按当前顺序更新，空行占位。
- 本次验证：完整 verify 退出0，3194单元、127集成、类型/双端构建及440对比度。之后仅为拖动行补不透明底色，再次干净构建和440对比度通过。真实 Electron 最终 `directory-ui-report.json` ok：鼠标触发共用拖动样式、排序/保存、编号、完整路径title、空库禁用、已存在文件新按钮、600px无溢出；人工查看菜单与拖动截图。`directory-create-report.json` ok：实际鼠标打开Real-ESRGAN指南并选模型库1，原本不存在的upscale_models成功创建。隐藏窗口启用focus emulation；首轮补验缺此条件导致滚动/键盘时序超时，补齐后通过，未改生产逻辑绕过点击门槛。证据在 `temp/create-smoke-gRyUlg/` 与 `temp/model-libraries/directory-*`。未跑推理/GPU、未改正式配置。
- 本次隔离实例通过AppApi清理，PID112572/CDP11118/18462退出；未启动正式ComfyUI。清理日志 `temp/model-libraries/directory-cleanup.log`。

- 最新UI复核：用户明确撤销上下按钮、独立默认选择和标题下说明；首行默认且禁止删除，＋只新增可保存的空行，空目录无效且不扫描，所有图标提供title/aria-label。移除旧控件的文案键。显式空配置与自动发现使用不同扫描缓存身份，默认行为空时指南不回退到其他库。
- 新规则门禁：60项初始focused、22项挂载/定位回归通过。一次全量发现非路径页挂载过早读取formSettings，改为仅模型库列表存在时初始化（保留旧测试断言）；随后完整verify退出0：3192单元、127集成、干净双端构建/类型、440对比度。缓存身份补验106项；默认空行的Desktop/指南边界最终125项相关测试和再次生产构建通过。日志 `temp/model-libraries/ui-revision-*`。
- 最终真实UI：`temp/create-smoke-gRyUlg/revision-ui-report.json` ok。实际点＋新增空行、无系统对话框；保存/Page.reload保留空行；真实输入目录并Tab离开；鼠标发起浏览器原生拖放到首位、默认角色跟随；首行删除disabled，移除非首行后原物理文件保留；再添加空行保存，旧独立默认字段被忽略/清除。人工查看 `libraries-revised.png` 与 `libraries-revised-narrow.png`，无标题下说明、无上下按钮/默认下拉、图标均有hover提示，600px无横向溢出。AppApi清理成功，PID8484/CDP14914/18462退出；未启动GPU或正式ComfyUI。

以下为初版历史证据，其中独立默认、上下按钮和旧UI已被上述用户指令及复核结果替代。

- 157项定向回归通过；最终 `npm.cmd run verify` 退出0：3191项单元、127项集成、干净类型检查/桌面与Web构建、440项对比度通过。日志 `temp/model-libraries/verify-icons.log`。未改其他任务的NAS代码/测试，package版本由既有工作保留。
- 实际选中ComfyUI 0.43.0/Python只读加载 `folder_paths` 与 `utils.extra_config`，同一相对文件在两个根的先后顺序反转时，真实解析切换到相应文件；生成配置与源码的用户额外路径文件分开，未改正式ComfyUI配置、未加载模型。`temp/model-libraries/runtime-paths-report.json`。
- 真实Electron使用合成小文件与一个不存在的库：缺失库提示、跨库组件发现、实际上下排序按钮、默认存放位置不跟排序改变、保存、移除不删文件、页面重载通过。组件扫描的位置指向第二库实际文件。首轮脚本误用了排序后的行号，修正脚本后通过，未改生产逻辑绕断言。`temp/create-smoke-ZckRNy/model-libraries-ui.json`。
- 拖动：仅发送鼠标移动时CDP未完成操作系统拖放；开启浏览器拖动拦截后，实际鼠标产生带正确MIME的原生拖动数据，向真实目标派发浏览器dragEnter/dragOver/drop，排序成功并通过实际保存按钮保存。未直接调用处理函数。`temp/model-libraries/drag-report.json`。完整进程重启后同一顺序保留，`restart-report.json`。
- 桌面/600px窄屏人工查看；发现向下箭头未注册，补齐ArrowDown图标后再次完整verify通过。最终截图 `temp/model-libraries/{desktop-final,narrow-final}.png`，无待保存改动、无横向溢出，正常画面仅保留目录结构/优先级/移除后果的必要说明。
- 夹具首次PID112300/CDP7352、复验PID111108/CDP8577、重启PID112196/CDP10407、最终视觉PID113212/CDP11023均已退出；18461无监听。通过现有AppApi清理夹具，未启动/停止正式ComfyUI或占用GPU，不把JS关闭当作原生窗口退出生命周期证据。原生电脑操作工具失败为helper_unknown_error，非权限拒绝。
