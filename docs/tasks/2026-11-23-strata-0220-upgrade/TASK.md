# Strata 0.2.20 推荐与兼容升级

- Status: complete (runtime acceptance with quality limitation recorded)
- Updated: 2026-11-23
- Authority: 用户要求核查提速与升级说明、提升推荐，避免再次无法启动。已手动更新后追加“下好了，你测试看看”，本轮授权真实提示词推理和连续/取消复用测试；不下载权重、不启动生成队列，不改用户草稿/设置。
- Execution: direct，子agent 0；patch影响，不递增应用版本、不提交推送/发布Release。
- Baseline: catalog/本机0.2.17 / 12d491da4a6904eb49aaa6f2f63ec4b1a17582e3、Qwen引擎0.1.63。保留已有H3/长视频、缓存清理等未提交工作。

## Resume

目标最新稳定0.2.20 / a34979fc94f3d126b9bb8210f4ad311345688b52，Qwen引擎0.1.66，固定Windows CUDA13归档494695625bytes、SHA-256 d0fa583e60aaf1d256926b6ea9889ff3ce42a98dbf56f2b556703a76b65e0a64、manifest 606635d430cdd8e3590677e3620493dc4b45c2443ce001404270137640eabe7b。DeepSeek固定0.2.13源码/0.1.59引擎不变，不接入新增HY-4/Inkling或下载DFlash2。

安装源码仍terminal/，根venv、engine、单一runtime指针及用户模型目录保持。实际归档、全部文件摘要和组件签名通过，新Python/服务/gguf解析器导入通过；从归档保存小型公共manifest为回归夹具。MTP词表和ESP向量hash不变，保留现有MTP/uncensored/思考与32K。三个Qwen量化覆盖0.2.17完整pack迁移，不重哈希或pack。

两处真实兼容问题：

1. 现有Windows device VRAM/小缓存及4GiB原生回读修复只匹配版本0.2.17，直接升版会退回旧的重复显存预留逻辑。已改为受信release的deviceVram能力，0.2.17与0.2.20都启用，保留安装根和terminal工作目录区分；无新内存准入门槛。
2. 官方0.1.66自身有HC Q8 Tensor Core共享指针误用__ldg的回归，可首轮warm-up崩溃，甚至无崩溃时产生非法读取。源码与上游#6713、#6714吻合，PR在审计时仍open/未合并。按该PR的即时规避及多台Ada用户复验，仅对此受影响版本设置STRATA_HC_Q8_TC=0和STRATA_HC_Q8_BF16TC=0，保留STRATA_HC_Q8与其他加速。H3和独立Agent共用版本化兼容环境，启动日志明确记录两个开关及问题号；不修改用户保存配置、不自动退模型或重放请求。此为临时兼容而非已修复上游二进制。

## Sources / benefit limits

- [0.2.19 release](https://github.com/Niko1221/Strata/releases/tag/v0.2.19)：4090 IQ3_S prefill +39%、decode +20%..31%；UD-Q4_K_XL prefill +42%、decode +47%..59%。量化、输入、内存驻留与drafter配置不同于本机IQ3_XXS，不承诺40%端到端提升。
- [0.2.20 release](https://github.com/Niko1221/Strata/releases/tag/v0.2.20)、[固定feed](https://github.com/Niko1221/Strata/releases/download/v0.2.20/strata-feed.json)：Qwen等三类引擎0.1.66、长上下文NaN/WDDM修复。新增模型能力仅研究，不自动入库。
- [#6713](https://github.com/Niko1221/Strata/issues/6713)、[修复PR #6714](https://github.com/Niko1221/Strata/pull/6714)：精确根因、sanitizer与即时规避。固定a34979f源码仍含问题；不使用main或自行编译替换已签名发行包。
- [Windows IQ3_S #6790](https://github.com/Niko1221/Strata/issues/6790)、[4090笔记本 #6773](https://github.com/Niko1221/Strata/issues/6773)、[4080 SUPER复验 #6767](https://github.com/Niko1221/Strata/issues/6767)：用户报告及两开关复验；用户数据不是本机神经推理证明，未把报告中的双4090吞吐套用本机。

## Validation / remaining

- 最终28个Strata测试文件482项全部通过，覆盖新旧安装识别、事务回滚/清理、三个量化pack迁移、H3/Agent兼容环境、思考预算及取消生命周期。相关日志位于忽略目录temp/strata-0220-final-focused.log。
- 广泛单元层第一轮（排除尚未到达的官方manifest夹具）：349文件3428项，3427通过、1项通用下载测试在5秒截止失败。最终Strata与下载联合跑时，下载文件两项超时且出现取消后EBUSY；单独maxWorkers=1复核仍有一项5秒超时（23/24通过）。本次未修改该文件或放宽限时，不能宣称完整verify绿灯。通过的广泛结果与最终Strata检查组合使用，不反复跑未变文件。
- 集成7文件132项、完整typechecked production build、440项文字对比度检查、独立工具prepare通过。见temp/strata-0220-integration.log、strata-0220-build.log。
- 升级协议harness使用当前应用构造器生成真实配置，官方native二进制接受尾随--help前的MTP/三种控制向量参数，视觉程序--version通过（不支持--help）；lazy原生HTTP后端启动且modelLoaded=false，兼容日志出现。CUDA_VISIBLE_DEVICES为空，未进入权重/GPU计算。
- 新源码+真实现有tokenizer的mock连续6次请求通过：off/low/medium/high思考参数与分离、自动预算、监视输入字段、401认证、长输入400后恢复、取消保留PID、显式stop/restart。报告temp/strata-protocol-smoke-v8w2Ew/report.json，端口2786及自有PID1252548/1256388均由harness结束，cleanup=true。只有文件/参数/协议层结论，不能证明首token内核、图片效果或吞吐。
- 独立工具verify-http与verify-monitor在0.2.20源码上通过：401认证、管理写入409、原生页面、监视连接/退出。CPU模拟短请求仅采样一次，sawBusy=false，不声称已证实长任务busy界面。无Claude/Agent真实工具调用或GPU推理。
- 推荐修改阶段本机仍为0.2.17，未自动安装。已清理temp中的审计源码、解压引擎和494.7MB归档，保留小报告与公共清单；之后用户完成手动更新并授权以下真实推理。

## Installed runtime acceptance (2026-11-23)

- 实际安装receipt为0.2.20固定a34979f / 官方0.1.66归档摘要，驱动616.56，4090 24GB，本机64GB RAM。使用现有IQ3_XXS/MTP、medium思考及用户uncensored设置，32K上下文，不下载、不走队列。
- 真实隔离Electron按钮→preload/IPC→生产Prompt/Owner/Service→真实GPU；原用户state摘要未变。旧脚本的迁移前state路径、示例draft与预设键盘行为不再适用，准备探针时修正临时脚本；这些失败不计作模型失败。正式样本报告在忽略目录temp/strata-0220-real-eAafF7/report.json及results.md，原提示词/图片/输出仅留本机temp，不提交。
- 简单文字：66.478秒（含冷启动），648输出字符；prompt422tokens/946.5ms，生成264tokens/4139.7ms，63.8tok/s。
- 复杂参考图（原历史三角色舞台）：23.014秒，1173输出字符；prompt1831tokens/2730.6ms，生成544tokens/6209.2ms，87.6tok/s。主体人类/银色机器人/橙色假人区分正确，思考实际计数非零。
- 图文15秒三镜头长稿（1835输入字符、原历史复杂街景）：127.175秒，2947输出字符；prompt6621tokens/6178ms，生成8020tokens/110532.6ms，72.6tok/s，实际思考22178字符。自动输出预算25745tokens，非固定4096。长任务耗时主要在思考/生成，不是挂起；没有旧版同条件A/B，不宣称40%本机收益。
- 正文生成时点击真实取消按钮：约1.6秒结束，无新增提示词版本；同PID保留。随即真实按钮再增强19.577秒成功，750字符，73.2tok/s。四次完成+一次主动取消，全部同PID50016，无观察到OOM、崩溃或资源保护强停。
- 采样显存峰值20335MiB（19.86GiB），最低可用RAM约7.19GiB。最后releasePromptModel并关闭隔离窗口；harness断言Strata/CDP端口关闭、用户state不变；进程与GPU余量另复核。未启动或修改用户生成队列。
- 质量限制：长稿正文保留三镜头、动作及声音约束，但integrated摘要头含continuous/high-angle，与低机位多硬切正文不完全一致。运行成功不等于完整语义通过，未擅改并行H3提示词工作。独立Agent实际Claude工具调用、更多量化、32K近上限输入/更长耐久与旧版A/B仍未覆盖。

## Performance configuration follow-up (2026-11-23)

- 用户追问是否漏掉新版接法。再次核对实际engine.log：sm_89的17项精确加速默认打开、on-device hits、CUDA Graph verify窗口与MTP Q2_0 S2实际加载（840MiB），不是缺失MTP或整体未开新内核。完整样本6756/24576 GPU专家槽，32.59GiB专家在RAM中，生成请求file blob reads为0；没有持续读盘卡住的证据。
- 当前builder固定旧MTP --spec 4；尚未适配官方drafting auto/DFlash2选择。0.2.20官方drafting.py的CUDA/Qwen IQ3_XXS auto规则会选择可运行DFlash2，缺文件时可回退既有MTP；DFlash2与MTP为二选一，不能叠加。独立小pack为522458112bytes，selector-Q4变体339694592bytes；不是要重新下载主模型。本次只调查，未下载/切换或承诺必然提速。
- 0.2.19的4090 +39%是IQ3_S预填充，生成+20–31%；Q4预填充+42%、生成+47–59%。这些新内核多数自动启用，不等同于DFlash2单项收益，也不保证IQ3_XXS整次增强+40%。0.1.66两条HC TC临时规避依然启用，上游PR #6714仍open；它们对本机IQ3_XXS吞吐影响未做受控A/B，不能凭猜测归因或直接去掉。
- 上次长稿prompt_ms=6178、decode_ms=110532.6；一万余字符思考令生成阶段占主导，提升预填充40%只节省约1.8秒。下一有判别力的性能工作是同IQ3_XXS/输入/输出预算/思考的受控旧新引擎与MTP/DFlash2对照，分别报告prefill/decode/端到端及正确性，不能只盲加启动开关。
