# Strata CPU 准备与 lazy HTTP 验证

- 类型：Evidence；Status: preparation-foundation-only；日期：2026-10-10。
- 状态与后续由 [TASK](../TASK.md) 维护。用户授权继续有界小阶段，不加载正在下载的模型、不占GPU、不改默认增强模型。

## 范围

新增 `electron/services/strata-model-preparation.ts`，复用已有 catalog、离线共享目录扫描和安装记录。完整分片/投影不齐即停止，不创建派生目录。生产路径按 catalog 大小/GGUF头/完整SHA-256验证每个源文件；校验与准备后复检文件事实。新旧目录可只读扫描，但两份分片必须在同一目录供官方自动发现，不复制或链接来拼装模型。

只通过已有有界执行器的注入接口运行独立Python：GGUF头读取PLE归属，然后调用官方 `tools/iq_pack.py --gguf <第一分片> --out <独立目录>`。不调用setup、原生engine、下载工具或MTP，不生成几十GB的experts.bin。上下文/KV/视觉/显存策略必须由调用者明确提供；本阶段没有新增设置或改变产品默认策略。

派生文件在管理软件父目录的data下新建唯一子目录，软件和共享模型根的真实路径/别名重叠均拒绝；校验期间目录身份改变也拒绝。失败/取消目录保留供排障，不发布有效完成记录，重试使用独立目录。完成记录最后写入，包含版本、源文件hash/事实、策略、PLE位置及pack/tokenizer事实。启动计划必须复查记录、源文件、产物和精确配置；加入任意before_load等配置字段、文件消失/改变时拒绝。

基础配置使用官方支持的无MTP模式（`--spec 0`），不额外下载约5GB的draft层，也不宣称加速收益。软件独立CUDA13 DLL目录只读核对，不加载驱动。启动加入`-B`避免写Python字节码缓存。软件文件不卸载/重装，真实下载不改动。

## 已验证

- 新增20项准备测试；与服务/离线扫描/卸载邻接合计66项通过。覆盖两种量化、完整校验、取消/失败/重试、目录重叠/别名、源文件及pack改变、配置篡改、PLE拒绝、分片不混根和并发准备。测试中大模型识别使用明确的合成inspector/验证器，不伪造真实Qwen证据；单独对真实小文件验证完整hash/头/大小/取消。
- `npm.cmd run verify`：1830 unit +86 integration、干净类型构建、20项对比度通过。构建前没有Electron运行；旧jsdom scrollTo诊断仍存在但测试通过。没有产品UI变化，不重复安装管理按钮验收。
- 忽略目录的 `temp/strata-pack-lazy-smoke.mjs` 生成自有微型GGUF，借已安装Strata的独立Python运行真实官方pack/tokenizer。夹具的扫描大小和hash期望显式替换为微型文件；这些证据不能证明注册大模型完整性。
- 实际导出index/dense/native_experts和tokenizer，经真实PLE读取与配置生成，再由生产`prepareStrataLaunch/StrataService`启动真实上游`--engine strata --lazy`；HTTP health/受认证models成功，`modelLoaded=false`，不发送生成、load或图像请求。原微型源文件hash严格保留，结束后自有PID/端口退出。不是mock引擎，也不是Qwen加载/生成证明。
- 首轮夹具无merge导致上游tokenizer拒绝，补充非空合并规则验证与回归；第二轮微型词表缺字节字符，完善夹具256字节词表后通过，不为夹具放宽生产门槛。失败服务均由owner回收；留存夹具仅供排障。
- 第一轮临时端口10301、第二轮10398均清理；成功夹具 `temp/strata-pack-lazy-0hjOCF`，PID34160/10435退出核对。最终构建后的复验记录由下方增量补充。
- 最终干净构建后复验同样通过：`temp/strata-pack-lazy-bVPreN`、自有PID57024/端口10783退出核对，仍为loaded=false，无生成请求。只读Git复核用户已安装源码同样为固定SHA；此前失败与成功端口均无监听残留。

## 未验证 / 未接线

完整75GB级模型hash/pack、真实CUDA加载、提示词质量/速度/长上下文、GPU释放/交接均未验证。准备和服务owner尚未接入应用实例/AppApi、退出生命周期与安装/卸载互斥；没有提示词路由、流式输出或UI选项解锁。没有自动启动或缓存复用入口；配置/产物内的机器路径只在本机派生缓存，不进入版本库或用户设置。

版本影响minor，不发布或bump；直接执行，无委派，全树成本unknown。下一步先做应用owner及Prompt接线，完整权重到位后再做真实模型验收。
