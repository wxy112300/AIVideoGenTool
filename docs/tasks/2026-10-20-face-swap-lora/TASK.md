# BFS 换脸 LoRA 接入

- Status: implemented; Qwen and H3 real generation await user-managed missing weights
- Updated / Owner: 2026-10-20 / 当前 chat
- Scope / Authority: 用户要求调查社区 face swap LoRA 并接入；复用现有 Qwen Image 2.1 图片 LoRA 通路，权重仍由用户管理。
- Execution: direct；无子 agent。

## Resume

- H3 补充（2026-10-20）：上一轮漏查 H3。用户追问后已补入 UntMods FaceSwap Ref2VA v1，限当前普通 INT8 R2V；Akatz V1.5 是整个人物替换、Alissonerdx Head Swap 是实验性整头，不能混称为仅换脸。H3 的 catalog、三语说明、提示词知识、UI/后台/图输入保护和验证已完成，Qwen 接入保留。
- 采用 Alissonerdx/BFS-Best-Face-Swap 的 Qwen Image 2.1 Head V1.1 推荐版；整头（含头发）替换，不能宣传为仅五官替换或客观最优。
- 固定上游 revision `0ca3913ade4b4ada458d60c232354e8586c4c181`；权重 260096144 bytes，SHA-256 `d1d748d5601077f3b6d05766f6823510e901970d916afa404a97e85dc92fa88e`。
- Picture 1 = 目标底图，Picture 2 = 参考头部；恰好两图、强度默认 1.0、`head_swap:` 指令；只开放当前普通 Qwen Image 2.1 家族，不开放独立 Turbo。
- 已完成：catalog / 三语说明 / 空 Prompt 可见默认指令 / 去重触发词 / 输入顺序校验 / UI、IPC 与任务快照；focused 和完整 verify 通过，隔离 Electron 实际鼠标入队已通过。
- 下一步：用户按设置页来源说明手动补齐 BFS 权重、重新扫描，再用普通 Qwen Image 2.1 做真实人像最小输出与同 Seed 无 LoRA 对照。缺权重不再重复推理尝试；不能把本次入队/节点检查视为换脸效果或“全面最优”的证据。
- H3 下一步：手动补齐 UntMods FaceSwap 权重、重新扫描；从普通 Ref2VA、短单镜头、参考脸 + 原视频、标准采样开始真实按钮入队/输出/History 验收，再评估身份/动作/表情/音画及无 LoRA 对照。不使用 FL2VA，不把原生视频输入与 Alissonerdx 的 Add Guide 混用。

## Implementation and resources

- 基线含其他任务未提交的 Strata / 长视频修改，保留全部既有差异。列表确认其他 chat 空闲；未发现 8188 / 9333–9336 listener。修改共享文档前重读，只增本任务内容。
- 本地沙箱初始化失败，已通过外部执行只读命令继续；不变更 ComfyUI/Python/模型安装。
- build / 隔离 Electron / 运行端口使用前再次核对所有权；仅清理本任务资源。
- 版本影响：minor 功能增加；不打包、不提交、不发布。

## Validation — 2026-10-20

- `npm.cmd run verify` 通过：236 单元测试文件 / 2284 tests、6 集成测试文件 / 91 tests，共 2375 tests；clean typechecked production build、20 对文字对比度检查通过。日志在忽略目录 `temp/bfs-verify.log`。
- focused：model-catalog / image-workflow / queue-services 的 90 tests 通过；BFS / 相邻 image-edit DOM 旅程的 7 tests 通过。初次 jsdom 冷启动超过 worker 上限，暖加载后复跑通过；新测试补齐 jsdom 缺少的 CSS.escape fixture，无产品依赖修改。真实输入临时 1px PNG 解码失败，改用 Canvas 编码的 64×64 纯色 PNG 后通过，未放宽文件预检。
- 合成 DOM：缺权重不出现可添加选项 → 文件 profile 就绪后真实 Add 按钮 → 空 Prompt 补入作者指令 → 缺第二图可见阻塞 → 补图后按钮点击创建 task；已有文本保留、后续编辑不改变已入队快照、额外 Paint 输入阻塞。普通/Q8_0/Q6_K 图构建、loader 在 cache 前、图片顺序、触发去重及旧家族/Turbo 排除通过。
- 真实 Electron：自有 `temp/create-smoke-h7Us1w` 空 queue/history fixture，焦点模拟；从 AppApi 准备“恢复的 BFS 草稿”（没有伪造权重/扫描结果），缺第二图可见阻塞 → 补齐 → 实际鼠标点击 → waiting task `15c9f76f-75cd-4bc4-88c6-9e89e63067b6`。两图有序、Prompt、LoRA 1.0 快照正确；未启动队列。
- 真实 Settings：LoRA 卡片/缺件信息/来源弹窗正确展示固定 revision、大小、SHA-256、目标 loras 目录；1280×800、1440×900 无横向溢出，截图人工查看。只有来源说明，没有触发下载。
- 通过应用启动 ComfyUI 成功：core 0.39.0 / Python 3.12.11；普通 Qwen 2.1 文件和节点可用。BFS profile `available=false`，loader/编码节点已注册；实际任务 API 图对照 `/object_info` 唯一错误为 loader 枚举不含缺失的 BFS 文件。未做 `/prompt` 请求、GPU 输出、History 产物、身份/纹理/表情/背景质量或速度 A/B；GGUF 仅静态覆盖。
- 原始扫描、任务/截图、schema 和 cleanup 证据均在该忽略 fixture 内；不提交原始 state、机器路径或临时媒体。cleanup helper 已通过 AppApi 停止自有 ComfyUI 并关闭 fixture，随后确认本次 Electron PID、Python 进程和 CDP/ComfyUI listener 均已退出；这是测试资源清理，未宣称原生窗口退出生命周期验收。

## H3 validation — 2026-10-20

- H3 最终 `npm.cmd run verify` 通过：237 单元文件 / 2287 tests、6 集成文件 / 91 tests，共 2378 tests；clean typechecked build 与 20 对对比度检查通过。日志 `temp/h3-faceswap-verify.log`。Focused H3/LoRA/catalog/policy/queue/workflow 共 155 tests 通过到各自覆盖层；无 GPU 输出。
- 新 H3 合成 DOM 正向：缺权重不提供 Add 选项 → fixture profile 就绪后实际 Add → 缺原视频可见阻塞且无 enqueue → 补齐后实际 Enqueue → task ID、Prompt、参考路径和 LoRA 冻结。缺脸/空路径/多视频、FL2VA/INT4/续写不兼容、参考输入 graph 拒绝、native model-only loader、Faceswap 去重、20 步不变均有断言。此正向使用合成外部端口，不冒充真实 Electron 文件就绪。
- 新真实 Electron fixture `temp/create-smoke-H4clEH`：恢复 FaceSwap 测试草稿，缺视频显示专用说明 → 补图/视频后仅剩缺 LoRA 的明确阻塞，按钮仍禁用、queue 为 0；没有伪造权重/扫描结果。真实 H3 新 task ID / 出图 / History 正向因缺权重未验。来源弹窗显示固定版本/大小/hash/文件/目录，截图已人工查看；未触发下载。
- 应用启动自有 ComfyUI 成功：core 0.39.0，SHA `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`，origin 为 `https://gitcode.com/gh_mirrors/co/ComfyUI.git`，本次读取 Git status 为空（已有 Git 身份，未改动安装）。实际 `/object_info` 已注册所有编译图节点，包括 loader 和 native Ref2VA 的 image/video/video-audio 输入组；API 源模板合法，编译后无未替换 token / 悬空链接 / 缺失节点，LoRA 枚举缺目标文件。没有 `/prompt`、模型加载或 GPU 生成；不能称完整 runtime/质量通过。
- 同一 fixture 内保留 `h3-faceswap-ui.json`、`h3-faceswap-schema.json`、截图及 `cleanup.json`。已按 helper 经 AppApi 停止自有 ComfyUI、关闭 Electron，复核主 PID、Python 与 CDP/8188 listener 退出。未修改用户 settings、queue/history、安装或权重；原始路径与媒体只在忽略目录。

## Sources and evidence

- H3 作者原生工作流已从固定 revision 的 `Workflow_Native_FaceSwap.zip` 读取：`MiniMaxH3ReferenceToVideo` + 两个 model-only LoRA，原片经参考视频路径（不是 Add Guide）；FaceSwap 1.0、示例还叠加 Ref2V Turbo 8-step。本应用复用现有普通 R2V，标准采样为独立基准，不自动复制加速参数。该 zip 含示例媒体，仅保存在忽略目录，未加载权重。
- [UntMods 官方卡片](https://huggingface.co/UntMods/FaceSwap_MiniMaxH3_REF2VA)：revision `b2a5823ca64bc78d91725fbfcc576095bfceb764`，`SS_FaceSwap_MiniMax_H3_REF2VA.safetensors`，65623904 bytes，SHA-256 `1e032cf519cc143f434e67516d8ad0aacf4c6e146315b2dcc3b1c2800470326d`；触发词 Faceswap，强度 1.0，适用于 Ref2VA。
- H3 对照：[Akatz V1.5](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA)包含脸/头发/服装的角色替换，作者不承诺一致提升；[Alissonerdx Head Swap](https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/blob/main/docs/head-swap.md)要求原片走 Add Guide，明确实验性且尚无该仓库 Head Swap 示例视频。本次优先专用 FaceSwap，不引入额外编辑/分割/Relay/CRT 框架，不用热度认定绝对最好。
- [作者模型库](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap)，2026-10-20 API：278168 downloads / 1425 likes（热度不能证明质量）。
- [Qwen 2.1 专用说明](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/0ca3913ade4b4ada458d60c232354e8586c4c181/docs/qwen-image-2.1.md)：V1.1 推荐版保留头部姿态，alternative 偏表情；作者称减轻皮肤平滑，尚未本地 A/B。
- [作者工作流](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/0ca3913ade4b4ada458d60c232354e8586c4c181/workflows/Head%20Swap%20V1%20Qwen%202.1%20Workflow.json)：LoraLoaderModelOnly 1.0 + TextEncodeQwenImage21；其中 Pruna 8-step 为可选加速，与 BFS 独立；不引入画布/比较等辅助节点。
- [旧 Qwen Edit 系列](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/docs/qwen-image-edit.md)与 [Klein 系列](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/docs/flux-2-klein.md)需要各自底模，不能混用；项目当前默认普通 Qwen 2.1 已有对应节点/底模通路，优先采用匹配权重。
- [PuLID 官方](https://github.com/ToTheBeginning/PuLID)与 [InfiniteYou 官方](https://github.com/bytedance/InfiniteYou)是其他身份保持方案，不等同此类两图换头 LoRA；InfiniteYou 官方路径使用 FLUX.1-dev 与身份注入网络，另有可选质感 LoRA。本次不引入第二套节点和底模。ReActor 为另一类后处理路线，未做本地比较。尚无统一可复现比较足以认定任何候选全面最优。
