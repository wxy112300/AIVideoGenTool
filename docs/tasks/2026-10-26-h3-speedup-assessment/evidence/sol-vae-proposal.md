# Sol-H3-VAE 新增方案及回退顺序

状态：研究完成，方案待实施；复核日期：2026-10-29。只读源码/上游资料，未改 catalog、设置、队列或运行环境，未下载权重或运行 GPU。

## 已确认来源

- [ComfyUI PR 17411](https://github.com/Comfy-Org/ComfyUI/pull/17411)：2026-10-28 合入，支持原始 decoder-only 与保留 encoder 的合并文件。
- [官方文件目录](https://huggingface.co/Comfy-Org/MiniMax-H3/tree/main/vae)：`minimax_h3_sol_vae_int8_convrot.safetensors` 约 1.99 GB；文件提交短 SHA `a50317c`，SHA-256 `a742069ba173bc3aba64cf8d8289d073e0818f2753f2fc2768f0342645089682`。`minimax_h3_sol_vae_fp16.safetensors` 约 3.6 GB；文件提交短 SHA `77aac51`，SHA-256 `61eaab3d7ca1659f20bce4d02bbc5bd5e5af608c73328d30cda96c8dc4d033e0`。这里记录网页证据，不将短提交或四舍五入大小直接作为生产 catalog pin。
- [当前核心实现](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/sd.py) 识别 `decoder.blocks.0.scale1`，选择 noncausal decoder；只有出现 `encoder.conv_in.weight` 才构建 encoder。Sol 输出帧数公式与原版分支不同，不能靠文件名推断所有 latent 长度都等价。
- [v0.42.3 源码](https://github.com/Comfy-Org/ComfyUI/blob/v0.42.3/comfy/sd.py) 尚无 noncausal 支持；仓库当前推荐核心仍为 0.42.3。实施须选择包含该 PR 的发行版或明确固定提交，不凭 `VAELoader` 节点存在即宣称支持。
- [原作者模型说明](https://huggingface.co/Efficient-Large-Model/Sol-H3-VAE)：同 H3 归一化 latent，蒸馏解码有细节差异，音频解码不变。其独立引擎/CUDA graph 的依赖和显存数据不能直接当作 ComfyUI 原生实现的要求与测量。

官方 API 查询遇 GitHub 限流及 HF 传输 EOF，未取得可靠完整 commit/bytes。网页提供的文件 hash 可用于后续校验；本阶段没有读取权重 tensor header，因此 Comfy-Org 两份文件的 encoder 是否完整仍未确认。

## 当前应用与建议新增方式

现有 `src/core/h3-video-vae.ts` 只有 FP16、INT8 ConvRot，Auto 依次选择原版 INT8 / FP16；显式模式缺文件也会在二者间回退。默认是 FP16。claim 阶段通过 `queue-runtime-service.ts` 重新扫描和解析，之后写实际 backend；这不是解码报错后的重试机制。

建议首版新增两个可选最终解码器，保留已有默认及 Auto 的选择范围；另设用户明确选择的快速自动策略，验收后再讨论默认。设置沿用一个选择器，不新增整页设置或说明卡。

普通 Create 路径优先：编码仍使用原版 H3 VAE，最终视频解码可用 Sol，音频 VAE 保持。即使上游提供合并 encoder 文件，也先验证其 encode、帧数和原版 encoder 等价性，避免直接将当前共用 VAELoader 全局换名。若拆分 loader，新增明确的编码/解码身份快照，兼容旧 `h3VideoVaeMode` 字段；缺失新字段的旧任务沿原语义。

首版排除 Continuum、Motion Context 和 H3 Refiner 的自动选用：前两者涉及上下文/时间对齐和 VAE hash，后者当前配方冻结原版 INT8 且包含视频重编码和高分辨率解码。它们应分别验证、版本化接入；全局设置不能改写既有 Run、accepted prefix、Refiner recipe 或旧 History。

## 建议回退规则

以下为新快速自动策略的候选规则，不是现有产品行为：

| 情况 | 候选顺序 / 行为 |
| --- | --- |
| 兼容核心、普通短视频、文件可用、显存预算满足 | Sol INT8 → Sol FP16 → 原版 INT8 → 原版 FP16；逐项过滤不满足能力/预算的候选 |
| 核心缺 Sol 支持、工作流未验收、长片/大尺寸预算未证明 | 跳过两个 Sol，原版 INT8 → 原版 FP16 |
| Sol INT8 缺文件 | 只有 Sol FP16 完整且预算足够才选它，否则原版 INT8 → 原版 FP16 |
| 明确选原版 FP16 / INT8 | 保留现有两者间的缺件回退，不自动换成蒸馏 Sol |
| 明确选 Sol FP16 / INT8 | 首版不静默跨解码器改变输出；缺件/核心不支持时给出具体阻塞和可选回退 |
| 所有合法候选均不可用 | 阻塞并定位缺件/能力问题，不下载、不改写全局设置 |

运行中与预检分开：

- Sol INT8 解码 OOM 不能退到 Sol FP16（上游样例峰值更高）。目标为原版 INT8，再按预算考虑原版 FP16；FP16 不是低显存保证。
- 仅在确认为解码阶段失败、同一份采样 latent 仍可复用且身份/帧布局已验证时，才考虑一次解码回退。首版建议只提供显式恢复操作，不引入自动重跑整张图。
- 当前没有证明产品具备可靠的仅解码恢复链路。ComfyUI 缓存不能当成 latent 持久化保证；拿不到同一 latent 时正常报错，不重新采样冒充回退。
- CUDA illegal access、设备断言等损坏上下文的错误先走应用已有恢复流程，不原进程连续尝试；取消、源文件损坏、schema/权重错误不得统归 OOM 或吞掉。
- 一次执行/恢复尝试记录 requested/resolved decoder、实际文件/hash、原因和恢复关联。运行中不改原采样/编码身份；新恢复执行保留父任务和冻结输入。waiting 按现有 claim 规则解析，claimed/running 固定，managed Run 另走原身份约束。

## 验收门槛

1. 固定核心完整 SHA、权重完整 revision/bytes/hash，检查两份 tensor header 与实际 load；已注册 `VAELoader` 不足以识别 Sol 能力。旧核心无损回到原版。
2. 组合测试：缺件、仅一份文件、明确选择/Auto、新旧持久化值、claim 前后、旧 History/队列与 Continuum/Refiner 隔离。
3. 图检查：编码/解码边一致、音频保持、预览 TAE 保持；验证 Sol 所需实际 latent 帧布局，原版与 Sol 输出必须解码核对实际帧数和音画长度。
4. 真实 Electron 选择/扫描/入队验证，再做最小纯文生、首图/尾图、R2V 的实跑。按实际采样帧数评估预算，不按最终裁切的 5 秒/15 秒替代；未经实跑不设置固定的安全显存阈值。
5. 固定同一 latent，对四份解码器测冷/暖耗时、峰值显存和纹理/人脸/文字/运动边界；5 秒、15 秒、长片与高分辨率分别验收。新增 OOM 恢复需单独证明不重采样、不重复输出、不改 Run。

结论：建议采用为可选解码器；先补核心能力与普通短片验证，暂不全局替换、不增加运行中透明重试。预期性能依据仅来自上游；本机收益和质量尚未验证。
