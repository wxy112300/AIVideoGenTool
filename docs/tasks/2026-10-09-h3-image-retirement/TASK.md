# 图片功能精简：H3 与 Qwen 局部融合修复

- Status: completed
- Updated / Owner: 2026-10-09 / Codex
- Authority: 用户明确要求从选项、节点、功能移除 H3 图片；后续明确要求一并移除 Qwen 局部融合修复；其他图片模型按“先评估”处理，不自动移除。不删除权重、媒体或历史；H3 视频继续保留。
- Execution / impact: direct，无子 agent；minor 功能收缩；后续按用户指令纳入 [0.65.0 版本对齐](../2026-10-08-upstream-upgrade-assessment/evidence/release-065-and-next.md)，不发布安装包。

## Resume

- 后续Qwen融合退休已完成：Crop/Stitch adapter、prompt合同、图构建/校验、capability与nodeTypes已删除；模型与节点仅留退休读取/显式卸载身份。旧默认/草稿迁移复用catalog退休状态，旧queue/history保持身份。229 focused、最终verify、实际Lighting Blend添加/入队/480×480输出、History与重启通过；数据保护及自有资源清理完成。普通2511与Lighting Blend/Fix保留。

- H3 FL2VA I2I / REF2VA 图片 adapter、图构建/校验模块、bundled JSON、Create 专属参数和选项已删除。模型名称与节点卸载身份仅作为 retired tombstone 保留；节点不参加 scan/readiness/bulk/install/update。
- 可编辑的旧 H3 图片草稿和旧默认项转到 Qwen Image 2.1 / preview-25；保留 prompt、seed、Picture 顺序、project/parent IDs。新 API 请求在归档输入前拒绝旧 H3 ID；旧 queue/history 不换模型，执行在网络请求前报告功能移除。保留旧 options/recipe 和结果尺寸/步数的只读兼容。
- H3阶段重点回归 12 files / 263 tests 通过；最终 `npm.cmd run verify` 通过：191 unit files / 1683 tests、6 integration files / 84 tests，clean typechecked build 与20组 contrast 通过。真实 Settings/Create/History、缺输入恢复、按钮入队、Qwen GPU 编辑与重启验收通过。
- 实际 H3 Image Studio 已可恢复地移出 `custom_nodes` 到数据目录 `node-backups`；前后 SHA 均为 `f7384aacb7bf35492dc73a3e6054ab6b427f93f6`。重启后六个 H3 Image 节点类均不在 `/object_info`，活动 scan 的模型/节点无 H3 Image。
- 真实 Electron 检查发现图片 LoRA 无可选项分支缺少 `value="">`，浏览器把后续提交按钮解析进 option；修复 TS/JS 并增加 DOM 归属回归。并行聊天的其他 LoRA 交互和 H3 视频 reference role 字段保留。
- 并行聊天“评估接入 Qwen Image 2.1”修改同 checkout 的 LoRA UI；用户明确授权协调消息，已告知共享 renderer 和构建/GPU边界。其已完成并 idle，121 focused/typecheck/build/contrast 通过；它的 verify 受本轮当时尚未修正的 H3 history 测试阻断。其 LoRA 改动全部保留，最终统一复验，不能把其 UI/GPU 未验说成通过。
- raw patch、测试日志与后续运行材料在 gitignored temp/h3-image-retirement；原升级任务和历史盘点不改写。

## 图片功能评估（2026-10-09）

这是一份应用功能重叠/维护成本评估，不是画质排行榜。未下载权重、未做各模型同输入画质/速度 A/B。当前本地 9 个图片项目的版本包含 Qwen2.1、H3、Z Turbo、FLUX Klein、Qwen2511、BiRefNet、LaMa；没有 OmniGen2、HiDream、Z Base 输出记录。记录可能包含测试素材，缺少记录不证明模型弱。

| 当前路线 | 建议 | 应用中的实际差异 |
| --- | --- | --- |
| Qwen Image 2.1 | 主路线保留 | 生成+编辑，最多10图，Paint额外视觉引导，25/40步，原生/自定义尺寸 |
| Qwen2.1 GGUF Q8 / Q6 | 保留兼容；后续合并为精度设置候选 | 同一功能的权重/显存路线，不宜占三个并列“模式”；权重缺失时不能承诺实跑 |
| H3 I2I / REF2VA 图片 | 本轮移除 | 5帧视频VAE静态包，无 Mask/Paint，与现有主路线重叠；H3 视频资产仍需保留 |
| OmniGen2 | 优先精简候选，尚未删除 | 应用20/50步、最多2图、双guidance；新Qwen统一编辑覆盖主要用途，需额外扩散/编码器资产 |
| HiDream-O1 Full | 优先精简候选，尚未删除 | 应用50步、单图编辑；上游有其自己的设计优势，不能称其画质一定更弱；当前应用没接多参考增强路线 |
| Z-Image Base | 优先精简候选，尚未删除 | 应用30/40步、单图img2img/原生VAE inpaint；没有当前已登记的专属图片LoRA；一般生成与Qwen重叠 |
| Z-Image Turbo | 保留一个快速选项候选 | 应用8步、可选Fun ControlNet；快预览是独立用途，未测与Qwen的真实速度倍率 |
| FLUX.2 Klein Base 4B | 暂保留，下一轮对照后决定 | 当前是 Base 4B 的20/50步，不是上游蒸馏4步版本；不能借蒸馏版速度宣传现用路线 |
| Qwen Edit 2511 普通 | 次级精简候选 | 旧编辑路径有4步Lightning和既有任务；用户之前要求保留fallback，不本轮整体删除 |
| Qwen2511 Crop & Stitch | 按后续明确要求移除 | 独立局部融合模式退出；保留旧记录的Mask和模型身份，重新编辑使用Qwen2.1现有LoRA入口 |
| BiRefNet | 保留抠图工具 | 无prompt、源尺寸、真实alpha透明PNG；2.1官方RGBA/抠图能力尚未在本应用接通验收 |
| LaMa | 保留局部移除工具 | 无prompt、Mask局部补背景；简单去物不需要调用主生成模型 |

产品方向建议：主入口以Qwen2.1为中心；精度放模型设置，抠图/局部移除/Mask拼回放工具，旧模型放高级/历史兼容。此次实施H3图片和后续授权的Qwen局部融合修复退休，其余是建议。

上游核对：[Qwen2.1官方](https://huggingface.co/Qwen/Qwen-Image-2.1)、[OmniGen2官方](https://huggingface.co/OmniGen2/OmniGen2)、[HiDream-O1官方](https://huggingface.co/HiDream-ai/HiDream-O1-Image)、[Z Turbo官方](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)、[Klein Base官方](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B)。以本地 capabilities/catalog/图为当前接入边界；官方支持不等于本应用已实现。

## H3阶段验证 / resources

- 自有隔离 fixture 复制一份真实旧 H3 历史 PNG（1344×768），没有执行用户真实队列。另加一个 **synthetic failed** H3 queue snapshot 验证持久化身份；不是旧 H3 任务实际推理证据。
- UI：Settings 图片/节点与 Create 选项无 H3 Image；1280×800、1440×900、760×800 无横向溢出，提交栏可见。旧历史“重新编辑”按钮生成 Qwen2.1 草稿，原 project/parent/reference SHA 保留；空 prompt 禁止提交，键盘补文本保持 focus，实际“加入队列”按钮获得 task ID。
- GPU：Qwen2.1 / preview-25 / seed42 / 单图480×480 / 无LoRA，以旧H3输出作输入，真实完成 task `bd185050-fc7d-4806-aea9-7b9bc525f008`；新 version `51303b06-e8ed-41ff-bd60-faf22b0fd2ff` 写回原项目并关联旧父版本。History实际解码与返回按钮通过；重启后旧1344×768 H3与新480×480 Qwen图片均可切换解码，旧模型身份/媒体hash保留。采样由现有Qwen adapter管理，不扩展策略；本轮未采集性能峰值或做画质A/B，不验新增LoRA组合。
- 环境保护：真实 state SHA不变（4队列/129视频History/9图片项目）；1764份其他节点Python/TOML源码hash与pip freeze不变；核心SHA仍为d91ed5f5；原H3图片媒体hash不变。只移动H3图片节点，没有删除权重。
- 清理：自有Electron各次PID已退出，8188及四个CDP端口均关闭；运行时由app启动/任务隔离停止，关闭前通过清理helper确认归属。这里是Harness/AppApi资源清理，未把CDP window.close冒充原生退出验收。
- 材料：gitignored `temp/h3-image-retirement/` 中的 `verify-final.log`、`ui.json`、`qwen-output.json`、`qwen-history.json`、`restart.json`、`schema.json`、`protection.json`、`resources.json`；隔离目录保留供复验。原升级任务/Skill历史盘点不改写。
- 收口：diff whitespace检查通过；只删除H3图片TS/JS模块与两个bundled JSON；minor进入Unreleased，未release/bump。该阶段仅实施H3图片退休；Qwen局部融合的后续授权/验收见下节。

## 后续：Qwen 局部融合修复退休（2026-10-09）

- 授权：用户明确要求移除Qwen专用局部融合修复，作为同一图片精简任务的后续；其他待评估模型未删除。不自动选中或下载LoRA，保持用户选择。
- 实施：删除2511 Crop/Stitch专属编译、图、验证和capability；Create/Settings/catalog/新请求均排除。旧草稿和默认转Qwen2.1 / preview-25，保留prompt、seed、Picture、Mask与lineage；旧queue/history仍显示原模型。普通2511、2.1 GGUF、LaMa Mask与现有LoRA继续可用。
- 节点：唯一应用消费者已退出，Crop & Stitch目录移到数据目录node-backups可恢复备份，前后SHA均为8584b08d851762965df898b421a39075fc5357ae。重启后的/object_info不含InpaintCropImproved、InpaintStitchImproved，应用scan无退休模型/节点；Qwen和原生LoRA loader仍就绪。
- 静态：229 focused通过；最终verify：192 unit files /1685 tests与6 integration files /85 tests，clean typechecked build和20组contrast通过。随后仅更新guide映射/文档，app-harness的9项测试通过；TS/JS活动目录及迁移直接import通过。minor进入Unreleased，没有release/bump。
- 兼容fixture：真实图片物理副本加**合成**旧融合历史/failed队列身份，另有真实二值Mask文件；不能把这份历史称为旧Crop/Stitch实际产图。应用启动后默认/草稿迁到2.1，原Mask路径保留；旧历史重编辑保留父版本。Settings/Create无旧模式与节点；1280×800、1440×900、760×800无横向溢出，提交可达。
- 真实UI/GPU：缺prompt阻塞、键盘补齐保持focus；通过设置页实际扫描、LoRA添加和入队按钮，冻结Lighting Blend /strength1快照。Qwen2.1 /preview-25 /25步 /CFG1 /seed42 /480×480 /单图，实际完成task 72e690ef-0b2f-4c36-895d-c31a54cea783，version 5d593428-8119-41fc-a170-0f94f2595e7a。History图片实际解码、父版本与LoRA元数据、返回入口通过；重启后新旧图片、旧Mask哈希、旧queue身份和已选LoRA保留。本轮没有画质A/B或mask外像素保持证明，不新增Fix LoRA实跑覆盖。
- 遥测：应用performanceStats采样窗口15.557秒、VRAM采样峰值23860346880 bytes（约22.2GiB）、共享GPU采样峰值0；不是完整冷启动耗时，也不作横向速度/显存优势推断。
- 保护与收尾：真实state SHA不变（4队列/129视频History/9图片项目）；1752份其他节点Python/TOML hash与pip freeze不变，核心仍d91ed5f5，共享权重未删。三次自有Electron PID退出，8188和三个CDP端口关闭；采用Harness/AppApi资源清理，不声称原生窗口退出验收。
- 材料：gitignored temp/qwen-fusion-retirement中的focused.log、verify.log、guide-test.log、ui.json、qwen-output.json、qwen-history.json、restart.json、schema.json、node-backup.json、protection.json、resources.json；隔离目录保留。
