# UD-Q4_K_XL 共享接入

日期：2026-10-19。类型：implementation/evidence；minor，不bump/提交/推送。用户授权模型卡、提示词与独立Agent接线，明确不下载权重；后续补充Q4必须支持uncensored。开始时工作区包含其他H3长时与本任务图片/tooltip改动，按当前文件增量编辑，未重置或提交其他工作。无子agent。

## 固定身份与上游约束

- 运行组件推荐保持0.1.45，固定`477ac13cbe8e582c20484871ce459d20d82df09d`；不执行安装或更新。
- [该版本Q4说明](https://github.com/Niko1221/Strata/blob/477ac13cbe8e582c20484871ce459d20d82df09d/docs/UNSLOTH_Q4.md)：四分片、跨分片专家v4、约71.7GiB专家、`--compat-bf16`必需、无`experts.bin`复制、共用原版projector/MTP、资源紧张时显式`--resident-budget-gib`。官方文件未对ESP做Q4效果验证，不将它解读为结构必然不兼容，也不声称用户要求的接入已有真实效果证明。
- [Unsloth固定文件](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF/tree/38bb39ee97821de2c9009abb7e93950eec396e66/UD-Q4_K_XL)：本轮仅请求HF JSON元数据，revision、四个bytes/LFS SHA-256与固定官方表一致，总111334654784bytes。许可证metadata为`other / qwen-community-1.0 / LICENSE`，新卡片采用Qwen Community License 1.0，不沿用IQ旧条目的Apache标签。各文件身份只由catalog维护。

## 实施边界

- 新ID `strata/qwen3.8-flash-next-ud-q4_k_xl`。旧ID、顺序默认、设置schema、共享服务端口及原稿/queue/History不迁移。
- Q4共享目录按模型而非软件命名：`LLM/Qwen3.8-Flash-Next-GGUF/UD-Q4_K_XL`；现有GSQ-RCO根与旧strata根仍有界只读扫描，可复用原版附件，不移动/复制/下载文件。显式独立自定义目录保留。
- 准备/复用/验证由量化几何决定四个shard+projector、PLE索引与来源revision，不再把第三个shard当projector。Q4准备先检查离线GGUF解析器，追加兼容转换参数并将转换报告纳入完成事实；旧两分片receipt和精确旧配置升级保持。
- Q4按当前物理RAM、Windows提交、显存及约71.7GiB专家单独预算；充分时完整arena，否则预留系统/workspace/适配器提交空间后显式预算驻留。Agent长context另外计host KV、使用会话级`--kv-resident`，H332K不变。Q4不接受IQ3的42GiB提交特例或commitTrial放宽。至少5GiB显存预留、实时硬保护与遥测重试保留；估计不是加载峰值保证。
- 主应用和Agent均支持off/builtin/community。来源/大小/hash、作用层、当次引擎project模式确认、逐请求true/false与诊断复用现有边界。缺件/未确认失败，不静默关闭或换向量。Agent偏好、模型租约、私有配置、Claude工具权限与H3继续隔离；Q4真实去拒答效果未知。

## 验证

- 最终`npm.cmd run verify`退出0：232文件/2211单元、6文件/89集成、双端类型检查、干净renderer/web/Electron构建、20对比度通过，包含直接记住Q4目录时复用同级IQ附件的边界。首轮仅旧模型清单断言未列新增Q4，更新后完整通过；既有jsdom scrollTo与chunk体积警告不当新失败。
- 额外运行user-journeys/strata-agent/strata-preparation/strata-uncensored共67项通过：Q4缺件不能增强→合成扫描恢复→点击实际生产DOM按钮→失败不保存→完整输出新版本ID，之后已纳入上述最终门禁。非GPU证据，不触碰实际下载。
- Q4离线服务测试包含五个必需源、兼容报告缺失/改变拒绝、不同revision、源文件不修改、缺第四片拒绝、后补MTP复用基础pack、Q4与原IQ两种向量overlay；模拟当前加载确认缺失时停止，不拿旧日志当确认。
- `node Tools/Strata-Agent/prepare.mjs`独立编译通过；`strata-agent.ps1 -Smoke`实际WinForms组件检查Q4选择和三种模式、720×540/1000×720主控件可达与折叠布局通过，无controller/服务/模型启动。不是Claude或完整鼠标旅程。
- 自有隔离Electron实际鼠标点击提示词页与Q4组件信息：缺权重模型不可选，6个组件入口，首/末shard与projector/MTP四个信息弹窗目标正确、固定来源正确，uncensored三选一可用；1440/1280/960宽无横向溢出。正式设置仅用于隔离夹具，不改真实配置。第一次断言误把projector的发布者名称当目标目录，改为只检查目标字段后通过，无产品修补。
- 忽略目录保留完整verify日志、`create-smoke-pQvtXW/q4-ui.json`与截图。隔离状态前后settings/drafts/queue/history一致，runtime unloaded/idle；经AppApi清理helper关闭自有Electron，PID和两个端口已退出，不将其当原生退出生命周期验证。未启动ComfyUI、Strata、模型或下载器。

## 尚未验证

权重下载后才可实测Q4原生加载/视觉、长稿/取消连续增强、Claude工具会话、两种向量实际效果及速度/峰值。旧IQ3真实结果不可替代这些证据。当前代码已接通，不自动选择/下载Q4，也未保证其比IQ3更快或每条prompt更好。
