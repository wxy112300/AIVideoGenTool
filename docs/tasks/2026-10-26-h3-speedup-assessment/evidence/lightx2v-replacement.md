# 已接入 LightX2V LoRA 原位替换

类型：Evidence；日期：2026-10-28；状态：source / graph / UI verified，真实权重 runtime / benefit 未验。范围和授权见 [TASK](../TASK.md)。

## 来源与文件

官方 [发布讨论 #57](https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57)、[发布提交](https://huggingface.co/lightx2v/Minimax-h3-Turbo/commit/30f485ed874aa44c8183348ad361c5eabad318da) 与 HF API blobs 元数据本轮刷新，固定 revision `30f485ed874aa44c8183348ad361c5eabad318da`。不是只改模型卡；新权重本轮仅下载 128 KiB 文件头，没有下载完整文件。

| 文件（均含 minimax_h3_ 前缀及 .safetensors 后缀） | 精确 bytes | SHA-256 |
| --- | --- | --- |
| fl2v_turbo_4step_v1.3_768p_comfyui_bf16 | 1956193000 | `70103fd0d80a947ed4e7fe6f88915863d54ef22c5cab03bd5d2fd649385ffe1e` |
| fl2v_turbo_8step_v1.1_768p_comfyui_bf16 | 1956193000 | `fb4c00361c94bad47f878d5e096c6cab2f45063b0968bd5756dcb7da6936f53e` |
| ref2v_turbo_4step_v1.0_768p_comfyui_bf16 | 1956193000 | `b4da466e43588004097dfbcde245ccc439c34a26bc997cb76a0b53a1d549ea0d` |

文件头确认 ComfyUI generic LoRA、训练 rank 128 / alpha 8、QKV block-diagonal B / concat A / alpha×3、SwiGLU value/gate 顺序转换；原生 alpha 由 Comfy loader 处理，不再手动额外乘 0.0625。catalog 默认用户强度为 1，实际质量未验证。

[上游 ComfyUI 说明](https://github.com/ModelTC/Minimax-H3-Turbo/blob/main/COMFYUI_SETUP_AND_INFERENCE.md) 与 I2V 示例（blob `e9ca0673e6e44fc0bfdaaceeebb7ab06e0d2f58c`）确认 Euler/Simple、强度 1。新版公告明确两项 FL2V video shift 6，不适用于 Ref2V；audio 3 与 Ref2V video 12 保留原公开配置。官网旧 README 未列全最新文件，未将旧八步 544p 配方直接套到新版 768p。

作者公告的回复包含新版与内容 LoRA / sparse attention 组合退化、Ref2V 参考/音频质量问题反馈，并有作者后续回应。它们是上游个案，既不证明本机必然失败，也不支持声称新版画质必然提高。沿用用户设置，不自动启用新的叠加策略。

## 兼容边界

- 保留三个产品 ID，避免持久化 ID 改名。入口及下载只指向新版，没有双份新旧卡片；旧文件名不能满足新卡片的文件就绪检查。
- `normalizeVideoLoras` 与 History 仍保留执行 filename 和强度。采样按新文件名匹配；旧八步仍 ER-SDE/Beta 12/3，旧四步仍 Euler/Beta，Ref2V 仍 12/3。没有把旧队列改成新权重。
- `videoLorasForCreation` 仅升级已知旧官方文件，保留自定义路径/文件和自定义强度；旧八步/Ref2V 默认 0.75 升为新版默认 1。原快照不变。
- `normalizeVideoDraft` 接线此替换；已有长视频分组继续沿用冻结配置。新版 FL2VA 八步仅提供 8 步，新版 Ref2V 四步仅提供 4 步；老快照的旧步数选择保持。
- 真实按钮检查发现入队阶段读取的是未编译旧模板，而执行阶段才应用新配方。已让入队预检在克隆模板上运行同一纯采样补丁，之后严格检查新配方；原模板不变，Ref2V 仍必须包含参考节点。没有通过移除 disabled、绕过校验或 API 直接提交来掩盖问题。
- 普通 H3、Larry v4、Turbo-SLA、PDD、Omni 和用户权重目录未改。SLA、Larry 与 PDD 元数据未显示对应更高权重版本；仓库更新时间不等于新权重。

## 检查

- 相关 6 文件 / 145 项通过：新旧采样分流、旧文件不满足新版就绪、缺/错 scheduler 拒绝、草稿替换及不变快照、长视频接线。首轮旧配方断言按新行为更新，额外修复新版 Ref2V 的四步选项门槛。
- 类型检查与第一轮干净构建通过；111 项工作流/队列/新版替换检查包含最终预检修复。默认并发全量检查出现无关 LAN 随机受限端口及 NAS 5 秒超时；LAN 与新版扫描夹具 94 项单独复验通过。后续限制 worker 复查，不修改无关测试或放宽超时；最终稳定状态结果如下。
- 最终稳定源码后全量 `npx.cmd vitest run --config vite.config.ts --exclude 'dist/**' --maxWorkers=4 --reporter=dot --silent=passed-only` 通过 305 文件 / 2892 项（`temp/h3-lora-upgrade/all-stable.log`）；最终 `npm.cmd run build` 与 `npm.cmd run verify:ux-ui-contrast` 通过，440 对比度组合。构建时间晚于最终 workflow/queue-enqueue 源码；不将中途补充 Ref2V 断言时的测试进程当作最终同状态结果。
- 真实 Electron：`temp/create-smoke-5o2OK9`，只有本轮模型扫描占位文件及有效 PNG；不是有效模型。三个入口分别经历旧/缺文件阻塞→新文件扫描恢复→实际按钮→waiting task：四步 `60b8a8b9-6a5b-471d-a96f-8d9a0858db91`、八步 `f9192a72-8362-418e-b0a2-582825a80a37`、Ref2V 四步 `cb0a9d30-a034-4d81-856f-a5af96eb8b11`。文件名/强度 1/步数 4-8-4 正确，后续草稿编辑未改变三条快照。结果 `temp/h3-lora-upgrade/ui-report.json`。
- Cleanup helper 已关闭最终窗口；全部本轮 Electron PID、CDP 和 8347 均已退出/无监听。ComfyUI 全程 stopped，未调用 start-queue；新夹具首次复用旧测试资料库未创建 AppApi，只清理自有 PID 后使用新的物理隔离库完成检查。未影响用户状态、模型目录或其他任务的 GPU。
- 缺少新权重，未执行新版 GPU 生成，不声明速度、参考保真、音画质量或恢复旧环境通过。权重仍由用户管理，未删除旧文件；原始元数据/文件头/日志留忽略的 `temp/h3-lora-upgrade`。
