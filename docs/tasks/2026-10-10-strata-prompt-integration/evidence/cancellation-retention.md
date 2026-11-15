# 取消当前请求时保留Strata

日期：2026-11-14；影响：patch。用户报告正在计算时取消增强会直接退出模型，希望修改后继续使用。

## 原因与行为

旧实现有两层主动停止：StrataService把用户Abort归入流式失败并stopChild；PromptApplicationService的取消分支和增强catch再次调用Owner.stop。因此前端按钮虽然叫取消任务，最终行为是卸载模型。

改为已加载模型的用户取消关闭当前HTTP流，沿用官方server的客户端断连取消；受认证的`/v1/status`必须报告`service=strata`、`loaded=true`、`activity.in_flight=0`，且健康/受保护模型接口复查成功后才确认取消完成。没有/错误/临时缺失的状态不当作0，也不因取消等待超过某个时长而杀模型。仍忙时保持操作占用；用户显式卸载或应用退出能打断该等待。

Owner.cancelRequest只等自己的后台操作，不能等依赖该取消回执的外层Prompt promise。应用丢弃部分输出、保留原稿及resident租约，并记录`strata-cancel-retained`和实际PID。正常取消不切换模型或重做pack；真正丢失模型不误报保留。准备/加载阶段取消、资源/协议失败和显式卸载的原语义保留，未改资源门槛。

## 验证

- 最终分层回归覆盖prefill尚无输出、decode已有输出、临时状态失败、后台仍忙、恢复后同PID再次请求、取消等待时显式停止、后台确认已卸载时拒绝resident状态；Owner与应用还验证busy结束、原稿未变、部分输出丢弃及后续增强复用。
- Create真实生产DOM与协调器的既有33项旅程检查通过（合成外部端口，不冒充真实Electron/神经推理按钮）。双端typecheck通过。
- 全量单元首次3252通过、NAS文件两个真实IO用例5秒超时；NAS整文件原参数14项单独通过，未改断言或时限。其后集成、干净生产构建和440对比度通过；不将组合证据写成首次verify退出0。最后显式停止分支收束后的3个相关文件112项及typecheck通过。
- 安装的官方0.2.13服务实测：真实HTTP/SSE、认证、真实Qwen tokenizer与官方mock脚本引擎，六次连续请求后取消，再次请求保持同PID；随后显式停止、端口关闭、重启和再次请求通过。当前只有旧revision的Qwen pack可供协议测试，因此使用明确`--tokenizer-only`模式，不验证/修复/重建权重。第一次脚本误选了DeepSeek tokenizer导致脚本终止标记不匹配而截断；已将Qwen脚本限制到Qwen tokenizer，未改生产解析器接受截断。
- 既有官方脚本改为更长输出，确保取消时仍有未输出内容；记录`cancellationRetainedModel`、`explicitStopAndRestart`，失败也保存有界诊断。此测试不加载神经权重，不是实际GPU prefill/思考/输出的取消延迟或资源释放峰值验收。

私有日志与协议报告保留在忽略的`temp/strata-cancel-20261114-*`及`temp/strata-protocol-smoke-*`。没有下载、升级软件、改用户设置或运行生成队列；自有协议服务停止并复核端口/PID。用户其他在途源码和文档保留。
