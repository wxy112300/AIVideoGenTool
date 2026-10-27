# Continuum 3.10.2 与 AV 插件兼容评估

2026-10-26；patch 推荐更新；应用0.67.0；单agent，无委派。范围为推荐版本、插件兼容及计划现状，不实施多段编排，不替换正式节点、不下载权重、不写用户Run。

## 来源与采用

- [官方稳定发布3.10.2](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.10.2)，发布于2026-10-23 18:22:50 UTC（新加坡10月24日02:22）；10月26日通过latest Release API、tag ref API和隔离clone核对。固定tag提交`308653cff108061a94381cef446fef985384b214`，pyproject版本吻合，不是main HEAD。
- catalog从3.9.1 / `94eaf70d674a58244e1cb139f021290d63fb2e6c`更新为3.10.2及上述SHA，最低线仍3.8.0。3.10.2是GitHub-only hotfix；Registry仍待3.10.0人工审核，不假定Registry已有该版本。
- 当前settings确认所选core/Python；正式Continuum仍为官方origin、干净3.9.1。未执行正式安装pull/checkout；候选仅在忽略的`temp/continuum-2026-10-26/`。推荐更新不等于实际安装更新。
- 新版重点修复：续接使用独立working revision，避免失败/中断隐藏已完成Take及保存点；采样前拒绝不可达Review重做目标；保留外接Run Storage请求；HTTP LAN Manager安全UUID；Second Pass接受的视频张量移CPU。Storage v3 / Sampling v6 / Graph v4、节点ID与工作流保留。Manager可选、默认关闭，不接管本应用编排。
- 以上为上游实现，不据此声称本机更快、峰值更低或120秒质量通过。旧v5/unsafe v6仍只读，不改manifest或提升复用资格。

## 可重复CPU检查

[兼容探针](../../../../scripts/harness/check-h3-av-compatibility.py)使用所选ComfyUI Python、真实Core NestedTensor/safetensors与官方state/facade/storage类：

```powershell
<selected-python> -B scripts/harness/check-h3-av-compatibility.py --core <selected-core> --continuum <candidate-checkout>
<selected-python> -B tests/python/test_h3_managed_prefix_guard.py
<selected-python> -B tests/python/test_h3_managed_attention.py
```

候选子模块通过显式隔离命名空间绑定，不导入其包入口；Core在导入设备管理前设为CPU模式。这不是在线object_info或完整节点注册证据。合成schema-1 manifest和控制器事实明确是协议夹具，不代表History提交或采样产物。

| 检查 | 结果与范围 |
| --- | --- |
| AV保存→加载 | 实写safetensors；video BF16/audio F32逐值、shape、dtype一致；旧producer版本字段可读；同名payload拒绝覆盖 |
| 完整性 | 缺manifest、SHA-256不符、未经验证AV桥接均拒绝 |
| 官方state | 56帧合法网格AV，经官方capture/validate/fingerprint生成5/22/39及Auto尾状态 |
| V38 facade | 真实父类MRO可构造、INPUT_TYPES保留initial_state；未执行sampler |
| Run守卫 | 挂到实际Sampler命名空间的官方Controller；过期canonical head在prefix读取前拒绝，project字节不变、未创建revision |
| managed收据 | 合成控制器事实经官方summary再经应用_storage_facts；2段完整前缀及混合revision owner通过；计划3段只完成2段仍拒绝 |

14项探针对隔离3.10.2与正式3.9.1分别执行；CUDA未初始化。现有Run锁守卫11项、attention委托2项通过。探针初轮修正自身绝对路径用法及Windows mmap引用释放，没有修改生产插件来绕过错误。最终使用相对artifact引用并释放tensor后清理临时目录。官方完整pytest未运行，其发布的2248项不计入本机结果。

原始输出为忽略目录中的`av-latest.json`、`av-installed.json`。正式节点、state、Run与媒体未改；未启动Electron/ComfyUI/GPU。候选和日志保留，无服务/监听需要停止。

## UI与下一步

[UI迁移TASK](../../2026-10-21-ui-migration/TASK.md)与[M4j证据](../../2026-10-21-ui-migration/evidence/m4j-continuum-preview.md)明确当前长视频是本地演示。[generation-mode.ts](../../../../src/renderer/pages/create/generation-mode.ts)已有段数/标尺/确认布局、整片/分页/锁定，尚无持久化编排、新Run提交、逐组执行或Strata分段增强。不能直接解除提交禁用。

编辑方向可沿用，执行需共同段长、单Run累计16逻辑段、合法网格/净时长校准，终端合并物理组不能承诺每页独立重做。Review输出范围与全片发布分开；Finalize消费已解码数据，不是Run目录读取器。持续Reference、新人物身份锚点与跨Run移交仍待真实验证。

下一步先做独立分组receipt/checkpoint，分开planned/accepted、逻辑/物理组、局部预览/全片，冻结profile与parent head。保留旧完整前缀收据、AV schema 1、queue/History身份和accepted>0门槛。再接正式new-run的2×5秒闭环，后续扩展脚本与Strata；不提前宣称120秒或任意崩溃恢复完成。

## 回归与限制

更新提示跟进（2026-10-26）：用户截图中Registry 3.10.0被标为最新，而推荐为3.10.2；固定安装SHA差异又被当作硬错误，与版本更新重复。实时Registry API确认为3.10.0，GitHub API为3.10.2。修复为GitHub API优先、官方重定向回退，未核实GitHub发布的Registry/HEAD结果下次重试；Registry数字直接标明来源。Continuum采用推荐提交策略，低于推荐时只留版本提示，硬最低线和运行保护保留。实际查询模块隔离编译后以生产curl参数在线返回`3.10.2 / GitHub Release`；版本来源、缓存、scanner、catalog、设置标签5文件63项与双端typecheck通过。本轮未操作正在运行的用户窗口或实际节点。

定向Vitest的dependency-catalog、h3-continuum-managed、h3-continuum-diagnostics、native-av-artifact、h3-workflow-contract共5文件44项通过。完整verify首轮2582项通过、11项超时，涉及cache、dependency scanner、managed cache和prompt extension media，另有超时后清理ENOTEMPTY。原断言/超时不变，`npm.cmd run test:unit -- --maxWorkers=4`复跑2589通过、4超时，均在managed-software-cache；该文件单独1 worker运行29通过、2超时，不宣称全量门禁通过。其余阶段独立完成：`npm.cmd run test:integration -- --maxWorkers=2`为6文件91项通过，`npm.cmd run build`（含双端typecheck）通过，`npm.cmd run verify:ux-ui-contrast`为440项通过。

尚缺正式安装3.10.2后的在线object_info/图校验及GPU生成→History续接/重启。当前结论是AV文件和CPU接口兼容，不是全部运行组合已验证。
