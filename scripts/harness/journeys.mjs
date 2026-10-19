// Navigation, not a second model catalog. Runtime truth stays in catalog/AppApi.
export const journeys = [
  {
    id: "lan-browser", title: "Settings 开关 → 独立网页 → 视频浏览与整理",
    section: "lan-browser",
    paths: ["src/web/main.ts", "src/web/library.ts", "src/web/player.ts", "src/web/gestures.ts", "src/renderer/pages/settings/lan-browser.ts", "electron/lan-browser-host.ts", "electron/services/lan-browser-server.ts", "electron/services/lan-browser-library.ts", "electron/services/lan-browser-covers.ts"],
    tests: ["tests/lan-browser.test.ts", "tests/lan-browser-gestures.test.ts", "tests/lan-browser-seek.test.ts", "tests/lan-browser-covers.test.ts", "tests/lan-browser-settings.test.ts", "tests/main-boundary.test.ts", "tests/history-services.test.ts", "tests/media-document-services.test.ts", "tests/settings-form.test.ts", "tests/store.test.ts"],
    checks: ["真实 Settings 开关启动/停止监听、LAN 地址与复制/打开入口；端口冲突可恢复", "无 preload 的手机双列/平板横竖屏/桌面网页；筛选、相册/瀑布流、分页与返回位置", "视频完整显示、解码帧推进、循环、中心暂停/周围沉浸、长按恢复、上下切换", "透明进度区保留安全区；单个评分按钮与浮层；i 信息窗只读 Prompt、长/空文本与关闭恢复", "收藏/半星评分/标签写入同一库；冲突不静默覆盖；缓存命中不重生成", "CPU 隔离验收：build 后 node scripts/harness/lan-browser-smoke.mjs；按输出目录运行 close-lan-smoke.mjs 正常关闭，真机 Safari/LAN 另验"]
  },
  {
    id: "assets", title: "任务落盘 → 资产检查 / 归档 / 转移 / 删除",
    section: "assets", documentation: "docs/runbooks/ASSET_LIFECYCLE.md",
    paths: ["electron/queue-history.ts", "electron/services/history-destructive-service.ts", "electron/services/image-asset-library-service.ts", "electron/services/settings-service.ts", "src/infrastructure/video-history-migration.ts", "src/core/native-av-artifact-paths.ts", "electron/services/history-query-service.ts", "electron/services/native-av-artifact.ts"],
    tests: ["tests/history-services.test.ts", "tests/history-delete.test.ts", "tests/image-asset-library.test.ts", "tests/image-asset-library-service.test.ts", "tests/video-history-migration.test.ts", "tests/video-migration-consumers.test.ts", "tests/draft-settings-services.test.ts", "tests/native-av-artifact.test.ts", "tests/native-av-artifact-paths.test.ts", "tests/asset-migration-harness.test.ts", "tests/version-delete-harness.test.ts"],
    checks: ["task/version → 媒体 / AV owner / aliases 去重核对；文件存在与续写资格分开", "图片库扫描不覆盖视频；归档复制与孤儿清理分开；新引用必须保护", "apply 不搬旧文件；migrate 校验→提交→清理；新 AV/sequence 引用需单独验收", "共享引用阻塞删除；单版本/作品/辅助数据分别验证；仅操作隔离测试资产"]
  },
  {
    id: "create-video", title: "选模型 → 首尾帧 / R2V → 提示词 → 入队",
    section: "create-video",
    paths: ["src/renderer/pages/create/coordinator.ts", "src/renderer/pages/create/view-model.ts", "src/renderer/pages/create/page-controller.ts", "src/core/video-draft-normalization.ts", "electron/queue-enqueue.ts"],
    tests: ["tests/user-journeys.test.ts", "tests/video-draft-normalization.test.ts", "tests/video-policy.test.ts", "tests/queue-services.test.ts"],
    checks: ["FL2VA: T2VA/I2VA/L2VA/FL2VA 输入转换；R2V 空槽阻塞与补齐恢复", "真实 DOM 按钮启用并点击；新增 task ID，修改 draft 不改变 task", "H3请求时长15.1无警告、严格>15.1显示；三语言hover/键盘与增量显隐保留焦点，警告不阻塞真实按钮", "AV 保存、Spectrum/LoRA、尺寸/FPS/时长分别检查 UI 与快照"]
  },
  {
    id: "prompt", title: "有图无说明自动扩写 / 有说明忠于指令 / 模式切换",
    section: "prompt",
      paths: ["src/renderer/pages/create/prompt-controller.ts", "src/renderer/pages/create/helpers.ts", "src/core/prompts", "src/core/h3-expansion-quality.ts", "src/core/strata-token-budget.ts", "src/core/strata-uncensored.ts", "electron/services/strata-uncensored.ts", "electron/services/prompt-application-service.ts", "electron/services/strata-prompt.ts", "electron/services/strata-reference-media.ts", "electron/services/strata-runtime-owner.ts", "electron/services/strata-model-preparation.ts", "electron/services/strata-mtp.ts"],
      tests: ["tests/user-journeys.test.ts", "tests/renderer-boundary.test.ts", "tests/h3-auto-prompt.test.ts", "tests/multimodal-prompt-logits.test.ts", "tests/llama-cpp-python.test.ts", "tests/dependency-scanner.test.ts", "tests/dependency-installer.test.ts", "tests/h3-prompt.test.ts", "tests/h3-expansion-quality.test.ts", "tests/h3-timing.test.ts", "tests/prompt-runtime-manager.test.ts", "tests/strata-token-budget.test.ts", "tests/strata-uncensored.test.ts", "tests/strata-chat-stream.test.ts", "tests/strata-prompt.test.ts", "tests/strata-service.test.ts", "tests/strata-monitor-window.test.ts", "tests/strata-reference-media.test.ts", "tests/strata-runtime-owner.test.ts", "tests/strata-model-preparation.test.ts"],
      checks: ["媒体 + 空文本为 reference-auto；有文本保留原指令；无媒体无文本不提交", "Extend 带 extensionSource 边界；Continuum 不伪造 R2V 标签", "异步返回写回来源草稿；取消/模型未就绪/GPU 占用可见；质量需真实输出评估", "影视细节扩写：字数不足或短于原稿仅警告，实际按钮仍创建可查看的新版本，不自动凑词；空/缺失/重复主时间线和截断仍拒绝，长度不证明语义", "Strata：缺文件阻塞与补齐恢复；实际增强按钮成功才新增版本；首次准备/缓存/取消/上下文预算与独立服务状态分层验证", "Strata所有增强/单次纠正启用medium/2048有界思考，官方thinking tokenizer先于GPU加载；Extend/R2V分层且保留执行字段，续接只用源末帧不重复采样；推理内容不写回", "Strata三模式：旧true迁移自带，关闭/自带/社区保存与重启保留；不同向量重载，同向量开关复用；安装小资产的失败回退及mode/id/hash/加载与应用分层记录"]
  },
  {
    id: "extend", title: "视频 → Motion Context / Continuum / 边界帧续接",
    section: "extend",
    paths: ["src/renderer/pages/create/video-extension-controller.ts", "src/renderer/pages/create/coordinator.ts", "electron/services/history-artifact-service.ts", "electron/services/extension-media.ts", "electron/services/h3-continuum-asset-registry.ts", "electron/services/comfy-ui.ts", "comfy_nodes/LocalVideoStudio-H3/managed_prefix_guard.py", "electron/queue-enqueue.ts", "src/core/h3-av-asset.ts"],
    tests: ["tests/user-journeys.test.ts", "tests/create-video-extension.test.ts", "tests/h3-continuum-managed.test.ts", "tests/comfy-ui.test.ts", "tests/h3-av-domain.test.ts"],
    checks: ["Motion Context 锁定源 Slot 1；无 latent 可走视频上下文；有 latent 校验文件与尾边界", "Continuum bootstrap 配对 AV；managed 必须已有 accepted Run 前缀，显式 mode/空 sequence 不能解除 UI 门槛", "managed 读取真实 v6 manifest/hash/resume_safe，v5只读且不改写；任务冻结 head/accepted；旧节点缺保护或 sampling evidence schema 时阻止提交；官方 Run 锁内拒绝过期或不兼容前缀后才允许写 manifest。改此前置保护还须运行 python -B tests/python/test_h3_managed_prefix_guard.py；managed Sage 适配另运行 python -B tests/python/test_h3_managed_attention.py；与真实生成分层报告", "checking/missing/available 可恢复；无前缀改用 Motion Context 后真实按钮入队", "H3警告只按新增段严格>15.1触发，来源/成片总长不触发；不阻塞入队，不改变旧Run冻结时长", "prompt、duration、AV 保存与 Spectrum 控件按实际分支变化；A→B→C 保持父版本身份"]
  },
  {
    id: "history", title: "结果详情 → 重新编辑 / Extend / Continuum 分支",
    section: "history",
    paths: ["src/renderer/pages/history/actions.ts", "src/renderer/pages/history/actions-controller.ts", "src/renderer/pages/history/navigation-controller.ts", "src/renderer/pages/history/media-resource-store.ts", "src/renderer/pages/history/media-scheduler.ts", "electron/services/queue-execution-side-effects.ts"],
    tests: ["tests/history-actions.test.ts", "tests/history-workspace-coordinator.test.ts", "tests/history-media-resource-store.test.ts", "tests/history-media-scheduler.test.ts", "tests/history-media-controllers.test.ts", "tests/queue-history.test.ts", "tests/video-output-duration.test.ts", "tests/h3-continuum-managed.test.ts"],
    checks: ["指定版本而非数组最后一项；重新编辑恢复参数，Extend 新 prompt/seed 与源版本关联", "Continue / Next、Regenerate Current、Continue From Here 保持序列与 take 身份", "返回父历史、播放、文件缺失、删除后动作可达性；旧队列/历史重启兼容", "封面队列：滚动/切页只调等待优先级，在途生成/保存不中断；退出保留磁盘缓存，重启命中不解码；真实检查见 history-cover-queue-smoke.mjs"]
  },
  {
    id: "upscale", title: "成功视频版本 → 放大对话框 → 独立队列 → 新版本",
    section: "upscale",
    paths: ["src/renderer/shell/upscale-controller.ts", "src/renderer/shell/secondary-dialogs.ts", "src/core/upscale.ts", "electron/queue-enqueue.ts", "electron/queue-executor.ts"],
    tests: ["tests/upscale-controller.test.ts", "tests/upscale.test.ts", "tests/queue-executor.test.ts", "tests/queue-history.test.ts"],
    checks: ["源 asset/version 固定；换 provider 同步选项和资格；不能把 Create 1080p 当此流程", "H3 原生 AV 路径与 SeedVR2 像素路径分别验证；当前可选 provider 以 catalog/对话框为准", "分段进度、重启 checkpoint、合并/清理与输出可播放性需运行证据", "最小真实路线：隔离 --asset-source-state → upscale-smoke.mjs → 应用启动 ComfyUI/队列 → verify-video-smoke → --audit/重启；具体命令见 runbook"]
  },
  {
    id: "settings-runtime", title: "保存设置 → 离线扫描 → 启动 ComfyUI → 在线验证 → 执行",
    section: "settings-runtime",
    paths: ["src/renderer/pages/settings", "electron/services/settings-service.ts", "electron/services/environment.ts", "electron/services/resumable-download.ts", "electron/services/strata-download-cache.ts", "electron/services/software-update-cleanup.ts", "electron/services/cache-service.ts", "electron/services/managed-software-cache.ts", "electron/cache-ipc.ts", "electron/services/strata-installation.ts", "electron/services/strata-agent-settings.ts", "src/renderer/pages/queue/controller.ts", "electron/services/queue-runtime-service.ts", "src/core/h3-execution-policy.ts", "electron/services/prompt-application-service.ts", "src/core/prompt-models.ts", "electron/services/prompt-runtime-manager.ts", "electron/services/history-query-service.ts"],
    tests: ["tests/draft-settings-services.test.ts", "tests/h3-execution-policy.test.ts", "tests/queue-runtime-service.test.ts", "tests/prompt-models.test.ts", "tests/prompt-environment-services.test.ts", "tests/prompt-runtime-manager.test.ts", "tests/environment.test.ts", "tests/llama-cpp-python.test.ts", "tests/llama-cpp-python-package-path.test.ts", "tests/strata-installation.test.ts", "tests/cache-service.test.ts", "tests/managed-software-cache.test.ts", "tests/resumable-download.test.ts", "tests/strata-uninstallation.test.ts", "tests/renderer-shell-coordinator.test.ts", "tests/strata-install-progress.test.ts", "tests/strata-settings-controller.test.ts", "tests/strata-preparation.test.ts", "tests/settings-node-actions.test.ts", "tests/media-reveal-ipc.test.ts", "tests/installation-cancellation.test.ts", "tests/settings-install-cancellation.test.ts", "tests/node-install-queue.test.ts"],
    checks: ["缓存按钮统一清理受信旧软件；当前版本/用户数据保留，活跃Agent/安装任务只跳过，不请求模型交接", "选中 core/data/Python，files/node schema/graph/output 分层报告", "受管理更新验证后清理旧软件，重复更新不积累；失败恢复，权重/用户数据保留；Strata主应用/Agent共用runtime，手动目录不迁移", "通过真实 AppApi startLocalService 启动；本地 app ownership / remote connection-only", "默认模型影响新草稿；四项 H3 加速设置保存立即更新 waiting，claim 解析、running 冻结；settings-running-smoke.mjs 以真实运行和成片验证 Attention", "Prompt provider 固定 ComfyUI；保存 promptModelId → 下一次增强比较驻留租约 → 日志 promptModelId/promptBackend → 新版本/重启；settings-prompt-smoke.mjs 的 --resident 与 --history 分别验证旧模型驻留和单作品保护"]
  },
  {
    id: "image", title: "图片模型 → Picture / Paint / Mask → 入队 → 项目版本",
    section: "image",
    paths: ["src/renderer/pages/create/image-edit-controller.ts", "src/core/image-workflow", "src/core/image-project.ts", "electron/queue-enqueue.ts"],
    tests: ["tests/create-enqueue.test.ts", "tests/image-workflow.test.ts", "tests/image-project.test.ts", "tests/queue-services.test.ts", "tests/h3-image-retirement.test.ts", "tests/qwen-fusion-retirement.test.ts", "tests/image-edit-journey.test.ts", "tests/strata-qwen-image21.test.ts"],
    checks: ["按 capability 检查文生图/参考图数/无提示词/Mask；缺失输入补齐后可提交", "Paint 与二值 Mask 分离；异步 prompt 回写来源草稿；模型切换不污染视频 draft", "清空只移除内容/lineage，保留当前生成参数；文本token估算随输入更新且保留焦点", "Strata Qwen2.1分离编辑/T2I、保留原始要求及稳定Picture映射；短编辑不被字数门禁拒绝；实际质量单独验", "version.taskId 关联真实输出，重编辑保留 lineage", "退休模型从活动选项/节点排除；旧草稿和默认转Qwen2.1，旧queue/history保持身份"]
  }
];

export function journeyGuide(id) {
  const journey = journeys.find((item) => item.id === id);
  if (!journey) throw new Error(`Unknown journey: ${id}. Choose: ${journeys.map((item) => item.id).join(", ")}`);
  return {
    ...journey,
    map: `docs/runbooks/PRODUCT_JOURNEYS.md#${journey.section}`,
    focused: `npx.cmd vitest run --config vite.config.ts ${journey.tests.join(" ")}`,
    realApp: "npm.cmd run harness:app -- inspect --port 9333",
    runbook: "docs/AGENT_ELECTRON_API_RUNBOOK.md",
    acceptance: "focused 只证明其覆盖层。UI 变更还需实际控件/焦点/布局；runtime 变更还需真实生成。"
  };
}
