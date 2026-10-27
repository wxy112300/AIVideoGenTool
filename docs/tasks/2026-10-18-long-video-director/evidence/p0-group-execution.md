# P0：独立分组收据与真实执行

2026-10-26。用户完成节点升级并授权开始PLAN；本轮直接执行，无子agent。交付内部adapter，不宣称多段产品UI完成。

## 身份与边界

- 正式节点只读核对：Continuum3.10.2 / `308653cff108061a94381cef446fef985384b214`，Git干净；Core0.42.0 / `40dcb30a96fc345f54632c56af81a4a320c2fc1e`；KJNodes / `d3cfe21625e5170126ce06fbfcfe1d88108688c3`。
- 自有Electron夹具、独立Comfy data/custom_nodes副本、userData、输出和Run；模型通过目录junction读取，选中Python3.12.11、Torch2.10.0+cu130、RTX4090。正式节点、用户state、Run与媒体未写入，无权重下载。
- 本轮H3新增采样4/4，Strata0/4。一个2段Run的两组与一个3段Run的前两组，共两个实验，不额外完成第三段。没有120秒、持续Reference、跨Run、10秒单次采样或质量/速度A/B结论。

## 实现

- [GroupReceipt节点](../../../../comfy_nodes/LocalVideoStudio-H3/group_receipt.py)：独立`kind=continuum_group`，不修改旧完整前缀收据。实际读取sealed v6 manifest、canonical head、payload bytes/hash与官方物理组描述器，拒绝不完整/错误组、unsafe/v5、越界路径和采样后head变更。逻辑段、物理组和实际decode投影分开。
- [请求校验](../../../../src/core/long-video/group-checkpoint.ts)：receipt必须匹配冻结的execution/step/attempt/project/Run、planned、expected parent及prefix；校验完整记录、帧事实和物理组。只有完整序列加full-prefix投影才是final；旧parser不接受此新kind。
- `final_output`只证明输出scope具备成片资格，不等于媒体已验收或History已发布；后续orchestrator仍须单独核对实际文件、帧和音轨，再发布作品。
- [图编译](../../../../src/core/long-video/group-workflow.ts)复用现有managed V38模板，预设完整段prompt/共同段长，保留最初上传的首图。独立new-run expected-prefix=0，不借用旧续写入口。采样/profile/LoRA/尺寸/seed是显式输入，不读取变化中的草稿；保留no-LoRA与SDPA路径。
- [执行服务](../../../../electron/services/long-video-continuum.ts)：检查实际object_info和Run-lock保护schema、拒绝占用中的运行时，然后使用现有Comfy传输/等待能力。没有新增IPC或新的用户enqueue路线。
- [检查点写盘](../../../../electron/services/long-video-checkpoint-store.ts)：先校验冻结请求，fsync临时文件、同卷link发布，重复相同事实幂等、不同事实拒绝，不能覆盖旧attempt。只是已接受收据的不可覆盖提交；不代表不确定采样重发、阶段恢复或电源故障恢复已解决。
- 应用H3节点包0.4.0新增能力；AV schema1及原producer版本、旧managed协议保留。目录将分组节点声明为独立feature；0.3.6旧基础路径仍可用，只提示推荐更新，更早版本仍受最低线保护。新adapter缺0.4.0组节点/guard则拒绝执行。

## 真实输出

使用合成首图和非私人prompt，256×256，24fps，固定seed42，5秒共同段长，8步Euler/simple、FL2VA INT8、FP16视频VAE、原生音频VAE、Acc8Step LoRA1.0及已有managed Sage raw委托。Comfy Compiler关闭；没有Spectrum/Second Pass，也没有末帧/终端合并采样。

| Run / 提交 | planned / accepted | reused / generated | 输出scope | ffprobe视频 / 音频 | 视频帧 | final |
| --- | --- | --- | --- | --- | --- | --- |
| A首组 | 2 / 1 | 0 / 1 | full accepted prefix | 5.000 / 5.000秒 | 120 | false |
| A第二组 | 2 / 2 | 1 / 1 | full accepted prefix | 10.000 / 10.000秒 | 240 | true |
| B首组 | 3 / 1 | 0 / 1 | full accepted prefix | 5.000 / 5.000秒 | 120 | false |
| B第二组 | 3 / 2 | 1 / 1 | current physical group | 5.000 / 5.000秒 | 120 | false |

四个MP4均ffmpeg完整解码通过；每个Run首组原始AV的owner与SHA-256在第二组复用后保持一致。B第二组真实只解码/输出当前组，不将2/3当全片；两组accepted checkpoint在执行期间实际落盘并可重读。A先于写盘helper接入完成，GPU报告只证明收据与输出，不伪称其当时已经经过后补helper。

实际assembly：首组total124/trim0/net124；第二组total141/trim22/net119。最终可见A=240帧、B当前组=120帧，保留官方定长校准；不再减一次22帧，也不用请求秒数自证输出帧数。未聆听/评价内容，音轨时长检查不等于主观音质或运动连贯性通过。

## 复用命令与层级

使用[探针](../../../../scripts/harness/probe-continuum-groups.mjs)，先准备独立data/custom_nodes及合法user/input/temp目录，模型junction指向已安装文件；用现有launch-create-smoke加载隔离settings。不得对用户库直接运行此探针。

```powershell
npm.cmd run harness:app -- start-comfy --port <CDP> --timeout 180000
node scripts/harness/probe-continuum-groups.mjs <fixture> --port <CDP>
# 同一有限计划剩余2次，用独立报告/新Run验证中间组；不要超过4次预算
node scripts/harness/probe-continuum-groups.mjs <fixture> --port <CDP> --partial-prefix
node scripts/harness/close-fixture-smoke.mjs <fixture> --port <CDP>
```

启动/停止走真实AppApi；采样走新应用服务的独立Node harness，**不是renderer按钮、AppApi.enqueue、父队列或History证据**。报告独占创建，不确定提交不得重跑；需要先读取真实prompt状态和manifest。保留的原始文件在忽略的`temp/long-video-2026-10-26/`和隔离create-smoke目录。

## 失败、回归与收尾

- 首次隔离启动因user-directory尚未建立而退出码2；创建夹具必需目录后，同一AppApi启动成功。没有改驱动、分页文件或正式Core。
- 首次图预检拒绝模板中的前端`control_after_generate`，采样提交0；编译器移除该非Python字段后通过。managed Sage沿用既有`allow_compile=true`的raw委托配置，不改变官方采样身份。
- 实际Python检查：8项分组收据（真实上游纯函数和safetensors）、13项prefix guard、2项attention通过。终端合并只覆盖协议/拒绝断半测试，未做该条件的GPU采样。
- 定向新协议/图/持久化16项通过，目录/scanner31项及双端typecheck通过。最终整合以`VITEST_MAX_WORKERS=2 npm.cmd run verify`运行：272文件2617单元、6文件91集成、干净typechecked build及440对比度全部通过；测试断言/超时未放宽。
- 两轮自有8199运行时均经AppApi停止，Electron测试窗口关闭；主PID与5527/6769/8199端口复核退出。cleanup不证明原生关闭生命周期。证据Run、MP4、报告与checkpoint保留，无正式用户数据删除。

下一步为P1结构化脚本/合法布局及P2真实UI/父任务/History接线；自动采样恢复、零新增采样重组装、完整Run资源峰值、资产登记与删除回收仍需后续阶段，不把P0成功算作这些能力完成。
