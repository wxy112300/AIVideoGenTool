# Strata + Qwen3.8-Flash-Next 提示词增强接入计划

- 类型：Plan；状态：partially accepted（用户已要求一键软件安装与简化设置，推理阶段尚待实施）；日期：2026-10-10
- 范围：Windows / 单 RTX 4090 本机增强；不扩张为通用聊天、云 API 或多 GPU 服务。
- 当前状态唯一入口：[TASK](TASK.md)；上游事实：[Evidence](evidence/upstream-assessment.md)。
- 权威：[Workflow](../../WORKFLOW_CONTRACT.md)、[Dependencies](../../DEPENDENCIES_AND_SETUP.md)、[Prompt Pack](../../PROMPT_PACK_DESIGN.md)、[用户旅程](../../runbooks/PRODUCT_JOURNEYS.md#prompt)。下列为候选新设计，不代表当前已支持。

## 1. 接入方向与边界

新增一个更强、支持更大输出预算的可选提示词模型，沿用已有 H3/图片 Prompt Pack、素材和草稿回写能力。先证明质量、端到端延迟与资源安全，再讨论是否成为默认模型。

连接关系：Renderer → 现有 typed AppApi / PromptApplicationService → Strata adapter → 127.0.0.1:实际端口 → Python server → native engine / vision encoder。视频生成仍走 ComfyUI；不增加 ComfyUI 包装节点，不把 Strata 装入其 Python。

- HTTP 不是 engine 必需条件：可通过 token IDs / stdin 原生协议运行，但需要承担 tokenizer、template、视觉与控制维护。首版采用上游本机 HTTP 服务；不是云 API，推理不需要联网，不需要购买 API 平台服务。
- 首版用 Chat Completions + status/load/unload；Responses API 是上游新增能力，但不是本任务硬依赖。
- 新增独立 backend/runtime 标识，保留所有现有模型 ID、默认值、旧队列和历史。不得将旧 lmStudioUrl/lmStudioModel/promptRuntime 遗留值重新解释成 Strata。
- 默认 app-managed：软件通过设置中的一键安装/重装取得，路径与端口放折叠详情，不要求手动下载源码/引擎。应用后续隐藏启动/退出服务，不打开聊天网页；external 只作为调试备用候选，不增加当前主要 UI。
- 用户点击才安装软件，固定源码/引擎与独立 venv；不执行 setup/calibrate 或下载权重。模型共用配置/发现的 ComfyUI 模型根下 LLM/strata，软件安装独立；共享根未知时才使用旧下载记录回退，不设第二个模型根目录，不搬文件。不切默认 Pack，不覆盖模板，不移除旧模型，不改生成策略。

## 2. 模型和运行档位

使用正式名 Qwen3.8-Flash-Next，不登记成另一个“128B”模型。首轮优先原版完整专家，不优先 Coder/第三方微调。

| 资源前提 | 首轮候选 | 决策边界 |
| --- | --- | --- |
| 4090 24GB + 64GB RAM | IQ3_XXS，视觉、MTP、INT8 KV | 质量优先起点；本机不稳时有界对照 IQ2_XS，不承诺速度 |
| 48GB RAM / 质量档不稳 | IQ2_XS | 测 RAM、commit、SSD 流量；不足报错，不静默 CPU 回退 |
| 96GB+ RAM | IQ3_S；UD-IQ4_XS 后续可选 | 精度更高未必更适合增强，不在首轮同时铺开多个下载 |
| 32GB RAM | 暂不承诺质量档 | 部分量化低 RAM 模式可运行，不等于满足本产品质量/延迟目标 |

起始配置提案：单 GPU、单请求 parallel=1；32K context 起步，确需长输入再测128K；INT8 KV；expert cache auto；候选 reserve 2048 MiB，计入视觉占用并由本机校验。reserve 不代表允许视频模型同时驻留。

不开 speed projection、STRATA_ROUTE_RESIDENT、STRATA_STAGE_PIN、GDN chunked 或 batch。稳定基线之后可做一次 STRATA_GDN_CHUNKED=1 开/关 A/B；社区1.8x是局部 prefill 证据，不是整项增强提速承诺。

## 3. 非 8080 接口与端口策略

默认候选 http://127.0.0.1:43127/v1；尚未检查本机当前占用。冷门端口仍会冲突，最终以成功绑定与服务身份为准。

app-managed 模式：

1. 专用设置首选43127；用户可指定合法端口，拒绝8080。不回退8080，不默认8000/8081。
2. 检查 loopback 监听与 Windows 排除范围；候选池43127–43147。只读预检查不能消除绑定竞态。
3. 隐藏启动 server，显式传实际端口、loopback host、受控 config、lazy。绑定冲突最多尝试3个候选，每次确认失败子进程退出；耗尽显示原因和可编辑端口。
4. 记录 endpoint、PID/启动时间与 app-owned 身份；核对子进程存活、监听归属、API key、version/model/status。不能看到 health=200 就接管已有监听。
5. Renderer 只读主进程实际地址，不拼默认值；回退端口不污染其他 backend 设置。
6. 严格固定端口选项：冲突直接报错。external 模式始终使用用户指定地址，不自动换端口、不杀进程、不运行 update。

明确 argv 与配置优先级：app-owned session config 覆盖 port/host/lazy，保留源 config 的 exe/args/vision；不反复执行 setup、不改写用户源配置，不拼 shell 字符串。

仅绑定127.0.0.1；默认关闭 MCP tools、内容监控和任意 tools。key 留在主进程凭据存储，不写日志/证据/导出快照；HTTP 由主进程发出，不放宽 renderer CORS。高位端口不是安全措施；手动本机端点也不使用8080。

## 4. 加载、取消与 GPU 交接

复用 PromptRuntimeManager 的 operationId、origin、取消与驻留租约，不创建第二份页面状态。服务状态与模型状态分开：HTTP在线 ≠ 已加载 ≠ 视觉可用。

顺序：服务 unloaded → 获得共享 GPU 排他权 → 释放 ComfyUI 模型占用 → load engine+vision → 增强并校验 → 回写原草稿 → 按现有策略驻留/释放 → 视频领取前确认 unload → 交还 GPU。

- lazy 启动不抢 GPU；显式“启动提示词模型”预加载，首次增强可 load。保留 queue busy gate，视频允许排队但重型执行不重叠。不静默终止外部 GPU 程序。
- 统一串行 prompt lease、queue claim 与 Comfy free-memory 交接；确认 Comfy 释放完成才 load Strata，不能依赖“看起来显存足够”。
- /v1/unload 要求 authenticated JSON；409 是有活动/等待请求，不能当成功。关闭生成流后等待 status 空闲，unload，确认 loaded=false 与 engine/vision 退出，再释放租约。
- AbortController 不等于已取消/显存已释放；取消或卸载超时保持 busy/error，阻止下一重型任务，提供可见恢复动作。
- app-owned 超时只可有界终止自己拥有的进程树，确认退出后恢复；禁止按进程名清理全部 Python/Strata。app退出清理自己创建的 server/engine/vision、临时媒体/config。
- external 连接不等于控制授权；没有明确 load/unload 管理许可不发控制命令。无法确认同卡安全释放就阻止视频启动并提示手动卸载。外部客户端可能重新 load，不能承诺与 managed 模式等价。
- watchdog/restart 报错或接收部分输出后不自动重试，保留原稿；取消中不重复提交。仅尚未发送的连接建立失败可有界重连。

## 5. Prompt 复用与 Token 预算

先提取已有语义构建/素材准备/输出校验与 Comfy transport 的接缝，不复制另一套 H3 指令。

- 共用指令、标注、精确对话/文字、LoRA、模式、时长、preset、camera/scale 优先级和 normalizer；保留 fail-closed 标注校验。
- 共用 text-only/reference-auto、FL2VA首尾顺序、R2V Picture标签/角色、Extend精确边界。原生视频 API 未验证时沿用应用抽帧语义并明确采样，不宣称理解整段视频。
- 本机图片转受限 data URL，校验大小、张数、尺寸和顺序；缺 vision 权重不静默退文字；边界临时图沿用成功/失败/取消清理。
- models/props 提取实际 model ID、context、modalities；不匹配报错，缺 metadata 记 unknown，不靠名字猜能力。
- SSE分别收正文与reasoning，仅正文写 prompt version。测试UTF-8/拆分事件/keep-alive/finish_reason/断流/空正文/循环/字段不完整；只有终态成功且已有校验通过才能回写。

现有 h3PromptExpansionTokenBudget 最大普通2048、详细3072，这是 adapter 输出预算，不是 context。旧 backend 预算保持不变；Strata独立 policy 提案：普通上限4096，detailed上限8192，按时长/动作密度向下选，不要求填满。

起始 reasoning_effort=none；必要时对照low+512token hard reasoning budget。记录正文/思考/total output cap计数，验证max_tokens是否包含reasoning并预留正文空间。context须容纳模板、文字、图像token和输出预留；超出明确提示，不截掉用户事实。

finish_reason=length/循环保护不当完整成功，保留原稿并显示恢复入口。重试只由用户或已有有限修订协议触发，不无限续写。大 context 不等于同等长度输出；增强文本更长也不改变视频模型文本编码限制。

## 6. 分阶段实施与门槛

用户 2026-10-10 调整顺序：先交付 P3 的设置/下载/离线文件准备子集，用户自行下载源码、engine 与 GGUF。当前新增字段为 strataInstallDirectory、strataModelDirectory、strataPort；不启用新 backend、不监听服务、不执行 setup。P0 的身份/hash、Python、pack、MTP 和资源验证，以及 P1–P4 的实际推理仍需后续完成。

| 阶段 | 工作和入口 | 继续条件 |
| --- | --- | --- |
| P0 本机资格 | 只读盘点RAM/commit/SSD/VRAM、driver/Python；固定tag/source SHA、engine BUILD/version/digest、GGUF/pack/PLE/MTP/vision revision/hash | 文件身份与资源预算完整；缺权重停止，不自动下载 |
| P1 transport/lifecycle | 聚焦Strata client/process service；fake-server测端口、身份、lazy、load/unload、SSE、取消/超时 | 无8080 fallback、无外部进程误杀、失败状态可恢复 |
| P2 核心编排 | src/core/prompt-models.ts、runtime/types、纯请求/budget helper；electron/services/prompt-application-service.ts、prompt-runtime-manager.ts、queue交接 | 旧backend无回归，共用语义、严格GPU互斥 |
| P3 设置/UI | src/types.ts、defaults/store additive migration、Settings/env scanner、Prompt UI、最小typed AppApi/preload扩展 | 离线扫描不加载模型；真实按钮产生operationId，切页/编辑/撤销正常 |
| P4 真实验收 | Prompt/Settings/Extend旅程、有界A/B、Prompt→视频→Prompt往返、minimal generation | 质量/稳定性硬门槛通过，实际收益可接受；否则保持实验可选 |
| P5 可选调优/发布 | 基线后单变量测chunked/128K/高精度；更新契约、runbook、Harness guide、changelog | 不默认新开关；一个release owner处理minor版本 |

不让Strata pack伪装成Comfy mmproj；扩展catalog的runtime-specific能力表达，保留单一事实来源。代码入口实施前重读；composition root不堆进程管理逻辑。

新增持久化/runtime契约需在实施授权后review；本次不提前改写“当前固定ComfyUI”的Workflow/Dependencies。实现完成同步用户旅程和Harness guide，避免指南继续只描述ComfyUI。

## 7. 验证与有限 A/B

文档阶段只查diff/链接/命令；实施按[CHANGE_VERIFICATION](../../CHANGE_VERIFICATION.md)跑focused+verify，runtime/共享状态不能只typecheck。

```powershell
npx.cmd vitest run --config vite.config.ts tests/user-journeys.test.ts tests/h3-auto-prompt.test.ts tests/h3-prompt.test.ts tests/prompt-runtime-manager.test.ts tests/prompt-models.test.ts tests/prompt-environment-services.test.ts tests/queue-runtime-service.test.ts tests/draft-settings-services.test.ts
npm.cmd run verify
npm.cmd run harness:app -- guide prompt
npm.cmd run harness:app -- guide settings-runtime
```

新增覆盖：占用/绑定竞态/排除端口/池耗尽/固定端口/foreign server、key不泄露、404/409/503、lazy视觉、断流/取消、未退出不得标unloaded、external不清理、queue交接、设置重启兼容、快速切模型、超长/截断和origin。

真实Electron按[API runbook](../../AGENT_ELECTRON_API_RUNBOOK.md)：无输入→可见阻塞→补素材/文字→实际点击增强→operationId→新prompt version；失败不破坏原稿。实际点击生成→task ID→最小视频输出与History关联。API-only不替代UI证据。

A/B最多8个固定样例×当前默认/Strata两组×2次：纯文本、中文对话/可见文字、长动作链、reference-auto、FL2VA首尾、R2V角色/衣物、Extend边界、标注修订。固定素材/template/模式/时长/参数/seed；冷启动与已加载耗时分开；首轮不加入第三量化或实验开关。

- 质量硬门槛：逐字保留对话/文字，无角色/衣物错配、首尾交换、boundary漏发；全部源动作覆盖，无新造事实；修订可校验、字段完整可入队。
- 稳定性硬门槛：同卡不重叠，取消/卸载/退出无遗留GPU进程，超限可恢复，重启/旧队列/History不受影响。
- 收益：P0记录用户可接受的冷启动/热增强上限；比较TTFT、正文完成墙钟、prefill/decode、MTP acceptance、RAM/commit/VRAM/SSD IO。少量样本报告median/range，不制造p95，不只凭tok/s宣布更快。
- 下游：选2个明显prompt差异做原/新各一条最小视频，检查动作/身份/连续性，不因文字详细就宣布成片更好。
- 停止：资源不足、连续两次同类崩溃、身份未知或保真失败即停止，记录单一下一实验，不无限调参/下载/扩大context。

## 8. 回退与交付

保留旧模型、默认值和旧字段迁移；切回旧模型即可走原链路。新增配置兼容策略须测试；增强模型变化不重写已排队snapshot或旧prompt versions。

回退只停本次owned进程，恢复旧provider选择；保留用户安装目录、权重、源config。禁止删除用户数据或执行上游destructive Git reset。将来升级以新目录/固定tag验证后切换，不自动覆盖在用版本。

分层交付：files、服务身份、API/视觉、真实UI、真实增强、GPU交接、最小视频、质量/延迟。未测写未验证；未达质量和资源门槛不得替换默认模型。
