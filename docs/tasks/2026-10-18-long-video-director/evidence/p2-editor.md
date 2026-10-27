# P2增量：结构化草稿编辑 UI

2026-10-26。用户要求继续，直接执行，无子agent。本增量接持久化编辑，不开放多段增强/提交或新父任务。

## 实现与边界

- [现有编辑器](../../../../src/renderer/pages/create/generation-mode.ts)沿用原DOM与控件位置：布局确认、分页/整片、锁定、原有版本前后按钮接P1结构。文字与段ID/版本不再由共享DOM缓存恢复；Create与Extend独立，重绘/清空不能复活旧稿。
- [输入缓冲](../../../../src/core/long-video/script-buffers.ts)逐字保存到可选草稿字段，失焦/切页提交版本，避免逐字生成版本；整片多页待提交缓冲可一次原子提交。待提交缓冲阻止模型写回、重新布局与执行快照。富文本实际获得焦点的元素通过focusout提交，只更新版本控件，不重建用户刚点击的tab。
- 首次切入只带入一次当前原生意图；已有脚本与用户清空后的内容不反复覆盖。原生prompt/duration不改。布局控制值单独保存，确认才修改结构；段数缩减归档尾页，再增加时按稳定ID恢复。已有managed Run使用冻结段长与剩余累计容量提案，确认后采用可表示时长，不重新平均源段。
- 清空全草稿清除新增字段；页内清空/撤销绑定稳定ID，旧组件回调检查当前草稿身份/revision，不覆盖后来替换的草稿。锁定、全自动/半自动选择、视图与页码按结构保存；本轮没有新增Strata请求。
- 多段提交和增强保持禁用及原有原因。生成方式能力投影、父任务、物理组执行/恢复、成片合成与History仍是后续P2范围。本轮原生click→taskId只能证明原生回退，不能证明多段提交可达。

## 验收

- 新增生产DOM回归：打字中保存/新root恢复、版本切换、锁定/整片往返、确认前布局冻结、尾页归档恢复、失焦点击可达、Create/Extend与清空隔离；缓冲纯逻辑另验原子提交与异步保护。
- 实跑发现首次切入全局未带入原生文本，已修；检查草稿key时发现旧DOM未提供输入模式属性，已改由真实Draft取身份并移除WeakMap恢复源。相关失败未放宽断言或超时。
- 最终固定状态`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过：277文件2640单元、6文件91集成、干净typechecked build、440对比度。中途一次verify混用先加载模块与后来添加的清空断言，固定状态重跑通过；没有调整断言或超时。最新两文件18项UI定向及双端typecheck也通过。
- [真实探针](../../../../scripts/harness/probe-long-video-editor.mjs)在自有`temp/create-smoke-xoy2T7`通过：首次带入全局、真实Input.insertText与按钮、IPC持久化、原生新task ID、等待队列未启动，多段submit禁用。实际关闭后`--resume`核对同一brief/segment ID、页文字/锁定/当前页、原生同task ID，全部通过；记录分别为`long-video-editor.json`和`long-video-editor-restart.json`。使用background focus emulation；不是GPU或多段UI入队证据。
- 首次探针在启动扫描未完成时等待原生按钮超时；只读确认仍为原生模式、零task、无script，保存失败记录，再通过可见清空按钮恢复合成prompt后重验通过。未盲目重复入队，未放宽10秒等待。早期`temp/create-smoke-oWL92A`是发现首次全局带入问题的预验，不作为最终修复证明。
- 当前构建四尺寸1280×800、1440×900、960×800、480×800整片截图检查：维持现有双栏/窄屏堆叠、页内滚动、锁定文本与禁用主动作理由；没有添加说明卡或重排页面。该项只覆盖本次编辑器，不外推全部应用窄屏行为。
- 自有Electron经既有AppApi清理helper关闭（所有记录runtime为stopped/unknown，未启动Comfy）；正式state/Run/媒体/节点未写，无采样或模型规划调用，无版本提升/打包/发布。截图、日志、原生waiting任务保留在忽略temp，不能用JS关闭helper证明原生退出生命周期。
- 收尾复核自有PID38316/68276/68784/60120及CDP4842/5732/6405/6898、隔离Comfy端口18299均已退出/无监听。31个任务本地链接、scoped diff --check与Create旅程命令通过；原有History等未提交工作保留。
