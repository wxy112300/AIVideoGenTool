# P2增量：内部父执行器与重放边界

2026-10-26。用户要求继续；直接执行，无子agent。未开放多段入队，本增量完成可供Queue绑定的内部执行内核，不代表Queue/History闭环完成。

## 实现

- [冻结输入](../../../../src/core/long-video/execution.ts)：独立task/execution身份、确定性project/Run、采用的脚本revision/页版本与显式采样profile，深拷贝后不读取变化中的Draft。执行prompt必须与采用页版本一致；全局brief保留为创作资料，不直接拼接为每段动作。只支持new-Run；已有managed Extend仍用原路径，不自行迁移。
- [父执行器](../../../../electron/services/long-video-execution.ts)：逐组准备→持久化POST意图→记录返回prompt ID→等待并校验receipt→不可覆盖checkpoint→接受组。请求冻结planned、expected prefix与parent revision；下一组额外核对已复用owner、文件名、路径、字节数与SHA。物理组可含终端两页，不按页码虚构采样次数。
- 日志位于调用方指定的私有执行目录：顺序事件、前一事件hash、fsync临时文件与hardlink独占发布；检测缺口/断链/冲突写入，已有事件不能覆盖。保留已接受组；取消后不丢已返回有效收据。进程内阻止重入，跨进程同一事件位置只能一个writer成功；外部资源租约仍由调用方负责，采样前复核。
- [传输适配](../../../../electron/services/long-video-continuum.ts)在既有schema/空闲检查之后、唯一POST之前await持久化回调；失败或取消不会POST。父服务复用该应用传输，不启动第二个runtime，也没有新renderer IPC或用户提交旁路。

## 恢复与发布限制

- 前置检查在POST意图前失败：保留prepared，可重试该准备步骤。意图已经保存、响应丢失：返回`uncertain-submission`；不凭空推断服务端是否采样，不自动生成新attempt。获得prompt ID后等待失败：重启只等待同一prompt，不重采样。
- 已完成所有逻辑段、却只有当前物理组输出：返回`needs-assembly`，不重新采样，不伪装完整成片。完整前缀收据也只提供成片资格；必须由实际媒体端口给出文件hash/bytes、完整解码标记、视频帧与音频内容样本/codec padding事实，再允许发布。
- 验证证据先持久化，发布使用稳定assetId=taskId/versionId=executionId；发布响应丢失后会以相同身份重试，调用方History适配器必须做幂等事务。本轮尚未绑定现有History代码，不能把端口spy次数或固定ID断言当真实History只有一条的证明。
- 没有接入现有Queue claim/recovery/取消/删除、真实媒体解码适配、无新增采样的Run assembly或UI能力投影。UI多段增强/提交继续禁用；父服务调用方必须持有真实资源租约。没有零新增采样真实Run reload、断电恢复或内容质量结论。

## 验证

- 定向回归覆盖：顺序推进、冻结prompt、同prompt恢复、未知POST不重试、已接受组与取消、前置失败重试、current-group不得发布、复用payload改变拒收、媒体证据不符拒收、固定发布身份重试、配置变化、并发owner、损坏日志、可选undefined字段落盘往返及模拟终端合并。传输单测直接调用实际submit函数，mock网络/schema，检查回调阻止POST。
- 最终`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过：279文件2656单元、6文件91集成、干净typechecked build、440对比度。此前4文件30项及双端typecheck通过；后补取消与损坏日志检查已在完整verify覆盖，无超时/断言放宽。
- 这些是内部服务、临时真实文件和合成端口测试；不是UI→新父task ID、实际Comfy输出或History验收。终端合并是协议夹具，不是新增GPU验证；media端口的结构校验也不是独立ffmpeg实测。
- 没有启动Electron/ComfyUI/GPU，无新增H3或Strata调用，未写用户state/Run/媒体/节点。未改Queue union、全局state schema或应用版本，未打包/发布。P0的H3 4/4预算保持耗尽；其他任务改动保留。
