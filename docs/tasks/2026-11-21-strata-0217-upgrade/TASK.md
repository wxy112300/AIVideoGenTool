# Strata 0.2.17 推荐与目录适配

- Status: complete (recommendation/update integration; neural validation deferred)
- Updated: 2026-11-21
- Authority: 用户要求跟进新版；延续手动更新本机环境的安排，只修改推荐和共用更新代码，不安装/启动本机模型、不下载权重。
- Execution: direct；子agent 0。patch影响，不递增应用版本、不提交/推送/发布Release。
- Baseline: 推荐和本机0.2.15/c77572806996349b49995e4f98d41b5294d36a21，Qwen引擎0.1.60。工作区有H3/长视频、History/NAS、退出、下载等未提交改动，按当前磁盘增量修改，不覆盖。

## Resume

- 2026-11-22 后续修复：Windows 0.2.17 Qwen IQ 磁盘回读将物理 RAM 启动检查调为 4 GiB，提交量检查和引擎驻留预留各保持 6 GiB。真实 60 秒六段分配已完成，原生回读模式下输出 416 tokens，官方 Monitor 测得约 2.3 token/s。最终修复将安装根目录与 `terminal` 工作目录分别传入校验，在真实扩写中观察到第二次请求沿用第一段 PID 和控制向量。旧正文 JSON 在第二段出现引号语法错误，后续改为由应用绑定段落 ID，模型直接返回音画正文并逐段校验写回。

- 2026-11-22 本机已装 0.2.17 / 引擎 0.1.63。真实 Electron 的 60 秒六段分配在加载时复现 HTTP 503。应用把整卡已有占用额外加到显存预留，现场传给引擎 27481 MiB，自动专家缓存为 0 槽。Windows 上此发行版改由官方 `STRATA_VRAM_FREE=device` 在分配时计入整卡占用。Qwen 显存紧张时启用引擎的小缓存自适应并让视觉编码走 CPU。准备缓存和原始模型文件保留。Prompt 终态保留加载失败原因。资源采样前回收分词预检进程，本机 ComfyUI 确认离线时跳过释放请求。
- 修复后 226 项定向、3373 项全量单测、132 项集成、双端生产构建和 440 项对比度通过。实际安装的 0.2.17 参数解析器确认小缓存配置保留 32K 和 MTP，未重新插入显存预留。隔离 Electron 的实际六段扩写点击复用模型缓存，返回 4.8 GiB 可用 RAM 低于原有 6 GiB 启动预留，未进入 GPU 加载。未出现离线 ComfyUI 的虚假网络报错，隔离窗口和端口已回收。新版 GPU 缓存和六段出稿仍待资源充足的实机验收。

最新稳定0.2.17/12d491da4a6904eb49aaa6f2f63ec4b1a17582e3，Control/引擎0.1.63，feed129。Windows CUDA13包487577860bytes，SHA-256 fc9864851a3f76855f25ba5f5ff1eb42d46c3c6ed45c22534dc9910f20d9dc0f；manifest 76ecfdaceeee1a7ce9d4d961f87f17da9c512107483e671fe987b39261a7cb61。归档URL固定v0.2.17，不拼接feed中的相对地址到错误目录。

0.2.16起源码服务/准备工具/数据移到terminal/，原生源码和vendored解析器移到engine/。安装指针、根venv、engine二进制、共享模型和派生pack根保持；catalog按受信revision解析源码目录，主应用与独立Agent共用。覆盖requirements、安装验证、扫描、服务/监视页、IQ/Q4 pack/PLE/MTP工具、专家profile、自带向量、DeepSeek组件验证路径。社区向量仍在根data/lvs-control-vectors；DeepSeek固定0.2.13兼容源码/0.1.59引擎不变。

旧0.2.15身份和源目录规则明确保留，三个Qwen模型完整pack迁移只改精确派生配置及来源receipt，不重复哈希或pack；原始pack来源保留。现有MTP、32K H3、uncensored三选一、逐请求思考、取消保留模型、显式释放/队列交接不变。不因新版setup的17GiB规则引入新的应用准入门槛；不启用实验提速、不下载DFlash2、不增加Coder或新模型。

## Evidence

- [0.2.16](https://github.com/Niko1221/Strata/releases/tag/v0.2.16)：源码目录重构、原生视觉读取器、Windows系统查询导致启动退出修复。
- [0.2.17](https://github.com/Niko1221/Strata/releases/tag/v0.2.17)：route tail skip默认关闭以改善质量；思考/正文分流和工具调用解析、Windows/引擎错误修复。50系列与其他硬件提速不是4090收益证明。
- [固定feed](https://github.com/Niko1221/Strata/releases/download/v0.2.17/strata-feed.json)。在temp下载并核对实际软件包，不安装或执行原生程序；官方签名及全部文件hash通过，新包仍不含strata_kq.dll。视觉程序1257472bytes（原0.1.60为109111296bytes）。1295bytes公共manifest保存为tests/fixtures/strata-engine-0.1.63-windows-cuda13.json，保留旧0.1.60回归夹具。
- 新terminal源码以原安装Python导入serve.server、验证组件及vendored GGUF解析器通过；MTP draft_vocab和自带ESP hash与现catalog完全一致。

## Validation / remaining

- 完整verify首次退出1：unit 346文件3371项，3360通过；3个本地化控制向量夹具仍在旧root/data，8项文件/NAS/下载等并发超时（含退出清理错误）。修正本地化夹具目录，6文件171项低并发重验全过，未修改超时值。其余单元通过证据复用；补齐7文件132项integration、含typecheck的干净build、440项contrast及独立Agent prepare，全部通过。不将组合结果写成首次verify退出0。日志temp/strata-0217-{verify,recheck,integration,build}.log。
- 初轮9文件232项中231通过，1项旧测试仍写死root/data/expert-profile路径；已改为版本化源码路径，并加强三个Qwen无旧tools目录的回归。
- 新源码实际HTTP协议通过：`node scripts/harness/strata-protocol-smoke.mjs --tokenizer-only --source-directory temp/strata-0217-audit`。固定12d491d源码/原安装Python/真实Qwen tokenizer，脚本mock引擎，off/low/medium/high/medium/medium六请求，思考/正文、约28.8K自动输出预算、认证、monitor、超窗恢复、取消同PID保留与主动停止/重启均通过。报告temp/strata-protocol-smoke-6za84N/report.json；自有1023076/1027164及8429监听已退出。
- 独立工具`verify-http.mjs`和`verify-monitor.mjs`新增source-directory测试入口并使用共用源码目录解析；实际新源码Guard认证/管理接口拒绝/原生网页、monitor读取与停止退出通过。monitor一次采样未观察到busy，不宣称验证真实生成进度。均为CPU mock，不启动Claude、GPU或用户会话。
- 审计源码/487MB归档及解压软件均只在忽略temp，收尾清理；只保留小型本地报告与公共manifest夹具。本机安装身份仍为0.2.15，未执行安装或设置迁移。
- 本机真实软件升级、GPU/图文推理、吞吐/质量A/B由用户手动更新后验证；本次不将协议mock当成神经推理证明。
