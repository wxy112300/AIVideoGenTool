# MiniMax H3 外部节点图片编辑（FL2VA I2I / REF2VA Edit）

- Status: validating（P0–P3 静态实现与自动验证完成；目标实例 schema、FL2VA/R2V 真实 graph 与单帧 API 预检已观察；正式入口已按用户授权开放，运行时 schema、资产与 app smoke 仍分层校验）
- Updated / Owner: 2026-09-16 / Codex
- Scope / Authority: 用户已明确接入 FL2VA 与 REF2VA 两条 H3 静态图片路线。H3 Image Studio 是外部 ComfyUI 节点依赖；应用只管理固定 revision、依赖状态、应用自有 API workflow、队列与图片项目，不复制节点源码或权重。
- Baseline: repository HEAD `d015cfe`、应用 `0.61.9`；计划审查时工作区已有 `CHANGELOG.md`、`docs/CHANGE_VERIFICATION.md`、`docs/tasks/README.md`、`package.json` 修改及本任务目录，均须视为用户/其他任务工作，不覆盖。
- Execution: Codex 已在当前工作区完成 P0–P3；本任务不拆子 agent。实现前重读本 TASK 与当前 diff，不继承这里记录的旧行号。
- Authority order: 用户要求 → [Workflow Contract](../../WORKFLOW_CONTRACT.md) → [Dependencies and Setup](../../DEPENDENCIES_AND_SETUP.md) → [UX Contract](../../UX_CONTRACT.md) → 当前代码与运行证据。
- User override: 外部依赖模式下，许可证不作为本次接入的否决条件；仍记录源码/权重来源、revision、文件名与 hash，以便复现和排错。

## Resume

### 已确认 / 决定

1. 首选外部包固定为 `ComfyUI-MiniMax-H3-Image-Studio` **v23.0.0**，tag 对应 commit `f7384aacb7bf35492dc73a3e6054ab6b427f93f6`。其 `pyproject.toml` 要求 Python >=3.10、ComfyUI >=0.30.0，`requirements.txt` 无额外依赖；本产品的推荐/真实 smoke 基线仍以实际选中实例为准，不因上游最低版本自动降级。
2. 第二候选 `ComfyUI-MiniMax-H3-Studio` 仍是 alpha，且接口面更大。首选包出现无法修复的 schema、输出或质量 Gate 失败前，不再同时接入或混用第二候选。
3. 产品使用两个不混淆的 model/adapter id：
   - `minimax-h3-image-i2i`：FL2VA，多帧源图锚定 I2I，仅一张 Picture；适合保留 frame-0 构图的轻度变化，不宣称是通用语义编辑。
   - `minimax-h3-reference-edit`：REF2VA，一至九张有序 Picture；Picture 1 是基准图，其余图片承担人物、服装、姿态、风格、背景等窄职责。这也是单图大改动的推荐路线。
4. 上游 `H3_IMAGE_EDIT_API.json` 虽名为 image edit，实际使用 REF2VA checkpoint、`H3ReferenceEditPrepare` 和 REF2VA Turbo adapter；不能据文件名把它实现成 FL2VA。FL2VA 基线来自 `H3_I2I_API.json` / `H3_I2I_TURBO_API.json`，REF2VA 基线来自 `H3_IMAGE_EDIT_API.json` / `H3_REFERENCE_EDIT_API.json`。
5. 首个产品 Gate 当前仍只开放标准 video VAE 的 **5-frame** 路线并由 `H3ImageFrameSelector` 选择单张输出；但已安装的 v23 节点文档与 live schema 证明 T=1/image VAE 是真实的社区实验路线，因此重新纳入 P4 性能/显存候选验证，不等同于已经开放。9/13/20 帧、semantic-only reference transport、Face Refine、Qwen refiner/VLM、DARE/PDD 继续在 Gate 外。上游 v23 仍把 5 帧列为可靠性优先的起点，且明确更多帧不一定更好。
6. 首版质量档只登记上游 v23 中存在、能与具体 adapter/shift 一一配对的 recipe；不允许用户自由组合 steps、sampler、shift 和 LoRA：
   - 两条路线：`base-quality-20`，RES multistep/simple，20 steps，video/audio shift 12/3，无 Turbo adapter。
   - FL2VA：`fl2va-turbo-8`，Euler/simple，8 steps，shift 12/3，preset `Turbo v1.0 | 8 steps`，匹配 `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`。
   - REF2VA：`ref2va-turbo-8-768p`，Euler/simple，8 steps，shift 12/3，匹配 `minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`。
   - 4-step 只可在确认所选 v23 preset 字符串、精确 adapter 文件、分辨率适用面及真实 smoke 后加入同一版本；若不能完成该证据，首版不显示 4-step，不能拿任意 4-step adapter 代替。
7. route 由稳定 model id 决定，不在 draft 里再保存一份可冲突的 route。模型 id、Picture 顺序、质量档和 H3 专用选项必须进入不可变队列快照与 History version。
8. 沿用现有图片项目、Picture、crop/markup/mask、queue run 和 History lineage。首版 H3 不支持 mask/markup；切换到 H3 时隐藏或禁用这些控件，但不能清除用户已保存的标注、Mask 或其他模型草稿。

### 下一步与停止条件

- 下一步从 P0 开始。P0/P1 可在没有权重时完成；P2 的静态 graph 和测试依赖已固定的 schema fixture；P3/P4 的真实执行必须使用目标 ComfyUI、实际权重与可用 GPU。
- 若固定 v23 在目标实例未注册节点、enum/schema 与固定 fixture 不同，停止产品开放，记录实际 `/object_info` 和导入错误；不要猜字段、改成第二候选或只做 node-name 存在检查后继续。
- 若缺少权重/GPU，只完成静态与产品代码，将状态留在 `blocked` 或 `validating` 并列出精确解锁条件；不能写 `runtime validated`、`smoke passed` 或 `product integrated`。
- 不重复调查 H3 视频、Extend、Continuum、Native AV/高分辨率任务；图片 adapter 不复用视频 queue task 或 output semantics。

### 本次执行结果（2026-09-15）

- P0：已保存 v23.0.0/commit、四个上游 API graph 来源、最小 schema fixture、节点/enum 边界和 FL2VA/REF2VA 资产及 Turbo LoRA hash 证据；fixture 是静态契约，不冒充目标实例 `/object_info`。
- P1：已登记固定 revision 的 `minimax-h3-image-studio` 外部依赖、路线专属节点需求、精确 diffusion/encoder/VAE/LoRA catalog 与条件 readiness；未复制节点源码、未自动下载权重。
- P2：已实现两个独立图片 adapter、应用自有纯 `/prompt` graph、路线/recipe 静态校验和提交前 object-info socket/enum fail-closed 校验。
- P3：已接通 Create → immutable queue snapshot → submit 前校验 → 单张最终输出 → History/恢复的 H3 options、Picture 顺序、role/note 和 recipe provenance；旧图片路线保持回归通过。
- 自动验证：`npm.cmd run typecheck` 通过；H3/队列/历史/目录 focused tests 通过；最终 `npm.cmd run verify` 通过（unit 172 files/1428 tests，integration 6 files/81 tests，build 与 contrast 通过）。并发运行 ComfyUI/environment 测试曾争用 Windows 临时日志，之后分别串行重跑均通过。
- 当前停止点：本机本轮没有目标 ComfyUI 实例、实际 v23 节点加载状态、目标 `/object_info`、完整权重和 GPU，因此未运行 P4 的真实 Base/Turbo smoke、取消/重启恢复和应用端到端 smoke；不标记 Runtime validated、Smoke passed 或 Product integrated。

## Product contract for this task

### UI behavior

- Create → 图片处理的模型选择中显示两项：`H3 · 源图 I2I（FL2VA）` 与 `H3 · 参考编辑（REF2VA）`。说明文字必须暴露差异：前者强锚定原图且只收一图，后者用于单图大改或多参考迁移。
- FL2VA 必须恰好 1 张 Picture；REF2VA 必须 1–9 张。现有 `pictures[0]` 是 Picture 1，不能另建隐式 source slot，也不能重排、合批或压缩空洞后改变已展示的 Picture 编号。
- REF2VA 每张图保留现有 `ImageReferenceRole`，并为 `ImageReference` 增加可选 `note?: string` 作为用户的窄职责说明；Prompt 编译生成稳定的 `<Picture N>` 映射。多图时角色/说明缺失应在入队前给出可操作提示；不得静默将多图退化为 FL2VA。
- H3 专用高级项首版只有：source fit、source fidelity，以及仅 REF2VA 显示的 reference detail。FL2VA/REF2VA 默认 source fidelity 分别按固定上游模板的 0.75/0.60；它是提示词保真强度，不是 denoise。frame profile 固定 5、frame selector 固定 `decode_recommended`，不制造暂时不可验证的 UI。
- 切换模型、后台依赖刷新、队列/历史更新不能破坏当前输入焦点、选区、Picture 顺序、crop/markup/mask 数据或别的图片模型草稿。两个支持视口按 UX Contract 验收。

### Persisted contract

在 `src/types.ts` 定义一个可选、模型专用且可向后兼容的快照对象；名称可按当前代码风格调整，但语义必须等价：

```ts
interface H3ImageOptions {
  frameProfile: "recommended-5";
  frameSelection: "decode-recommended";
  sourceFit: "crop-center" | "contain-pad" | "stretch";
  referenceDetail: "match-generation-area" | "max-identity-2048";
  sourceFidelity: number; // 0..1；提示词保真强度，不是 denoise
}
```

- `ImageReference.note?`：保存用户为 Picture 指定的窄职责说明；旧 Picture 无该字段仍合法，复制、裁剪、入队、恢复和 History 必须保留它。
- `ImageEditDraft.h3ImageOptions?`：保存 UI 选择；legacy draft 缺失时由 normalizer 按 FL2VA/REF2VA 分别补 0.75/0.60 等默认值，但非 H3 模型不被强制写入。
- `ImageGenerationQueueTask.h3ImageOptions?`：入队时深拷贝并冻结执行值；等待期间的 Settings 或草稿变化不得修改它。
- `ImageAssetVersion.h3ImageOptions?`：History 记录实际执行值。若 claim-time 因兼容策略产生 resolved 值，History 存 resolved 值而非 UI 原始值。
- route 不重复持久化；`modelId` 是权威。steps、sampler、shift、adapter 由 `qualityProfile` 映射；History 继续写可读的 resolved `steps`，并增加必要的 recipe/adapter provenance，不能只留一个未来会漂移的 label。
- `electron/store.ts` 的 normalizer 必须夹取 source fidelity、拒绝未知 enum，并保持旧草稿/旧 queue/history 可读；不做破坏性迁移或重写既有记录。

### Runtime contract

- 使用上游 API JSON 作为来源，但提交的 `workflows/*.json` 必须是应用拥有的纯 `/prompt` graph；删除示例文件名/本机路径，只保留 placeholder，不加入 metadata 顶层键。
- 在 `src/core/workflow-metadata.ts` 记录每个 graph 的本地路径、上游 v23.0.0/commit、源 API 文件、最后复核日期、ComfyUI/schema 基线和 custom-node id。
- 运行时不能只检查 class type 和 input name。为 H3 image adapter 增加 model-specific object-info 校验（可扩展 `ImageModelAdapter` 的可选方法），验证至少：必要节点、required/optional socket、输入 enum 中实际使用的 mode/quality/sampling/frame/source-fit/reference-detail 值。`submitImageTask` 在上传大图与 `/prompt` 前调用它并 fail closed。
- Settings 离线状态、节点目录、运行时加载、模型文件和可执行 workflow 是不同层级。目录存在但节点导入失败应显示“已安装但未加载/不兼容”，不能显示 Ready。
- 进度使用实际 graph node class 映射；取消、失败、重启和应用退出沿用当前 image-generation 清理路径。H3 图片任务仍参加“单一重 GPU stage”仲裁，不可与 H3 视频或其他图片采样并行。

## Implementation work packages

### P0 — 固定依赖与证据（完成后才写 catalog）

1. 在 `evidence/upstream-v23.md` 记录：v23.0.0 → commit `f7384aac...`、`pyproject.toml`/requirements、四个采用的 API workflow、节点注册表、上游 validation 的环境与结论边界。
2. 从 tag 文件和目标 `/object_info` 生成/保存最小 schema fixture，只保留本任务节点的 `input.required/optional` 和 enum；不得提交整份可能含本机插件信息的 object_info。
3. 建立资产表，逐项列出目录、精确文件名、路线、required/optional、来源 URL、可得 hash：
   - FL2VA 与 REF2VA diffusion model 分开；不可互换。
   - H3 Qwen3-VL 32B text/vision encoder。
   - 官方 H3 FP16 video VAE；首版 decode 需要，REF2VA native reference transport 还需要它编码 reference。
   - 每个启用质量档的匹配 Turbo LoRA。未启用的 T=1 image VAE、hybrid model、detail adapter 不进 required 列表。
   - 图片 graph 未使用 audio decode/save，因此 audio VAE 不列为首版 required；若实际 schema/graph 证明需要，再以证据修订。
4. 固定产品推荐 ComfyUI 基线。上游最低版本只说明可导入范围；真实产品基线必须由目标实例 `/object_info` + smoke 决定。

**P0 Gate**：来源/revision、采用 graph、节点/enum fixture、资产矩阵完整；任何未知项明确标 `unknown`，不以推测补齐。

### P1 — Catalog、扫描与安装闭环

1. 在 `src/core/catalog/dependencies/nodes.ts` 添加唯一 custom node definition，例如 id `minimax-h3-image-studio`：固定 repository、directory、v23.0.0/commit、node types、最低/推荐 ComfyUI、无额外 Python requirement、安装后重启和 schema recheck 说明。
2. 在 `src/core/image-workflow/node-requirements.ts` 分为：
   - 共享 core nodes；
   - Image Studio shared nodes；
   - FL2VA-only prepare path；
   - REF2VA-only prepare path；
   - Turbo-only `LoraLoaderModelOnly`。
   required list 必须来自最终 graph，而不是把包里所有 node 都设成必需。
3. 在 `src/core/catalog/models/image.ts` 添加两个 model entries，分别扫描精确 diffusion model；共享 encoder/VAE 可以重复引用同一事实来源，但不能让 FL2VA 权重满足 REF2VA profile。Turbo LoRA 按 quality profile 作为条件依赖；未选 Turbo 时缺 LoRA 不得阻塞 Base。
4. 复用现有节点管理器的用户主动安装/更新/重启/日志/复扫。不要新增第二套 git clone、Python 安装或网络下载实现；权重仅给下载指导，不自动下载。
5. Settings 状态测试覆盖：目录缺失、目录存在但节点未加载、旧/错 schema、Base ready、Turbo adapter 缺失、FL2VA/REF2VA 权重错配、选中 ComfyUI 与另一安装目录隔离。

**P1 Gate**：Catalogued + Detected 可以独立成立；Settings 能准确说明缺什么，不能提前标 Runtime validated。

### P2 — Adapter、workflow 与 schema fail-closed

1. 在 `src/core/image-workflow/` 新建一个聚合文件或 FL2VA/REF2VA 两个小文件；共享 loader/sampler/decode/output helper，路线专属的 compile/build/validate 保持独立。不要把节点 id/enum 散落进 renderer。
2. 在 `capabilities.ts` 与 `registry.ts` 注册两个 adapter：
   - FL2VA：`maxPictures=1`、prompt required、mask/markup/text-only false、PNG、5-frame fixed。
   - REF2VA：`maxPictures=9`、prompt required、mask/markup/text-only false、PNG、5-frame fixed。
3. Prompt 编译：
   - FL2VA 只接受 Picture 1，保留用户指令，不虚构参考角色。
   - REF2VA 保持 Picture 编号与数组顺序，使用 `<Picture N>`；显式用户指令优先于 source-fidelity 保留措辞。`sourceFidelity` 不是 denoise，不能映射到 sampler denoise。
   - 缺图、超出槽位、重复/非法 picture number、缺文件、REF 多图未映射角色均有确定错误或警告测试。
4. 基于 v23 API graph 创建应用模板。动态写入只允许已定义参数：上传文件名、prompt、width/height、seed、固定 frame/profile、H3 options、匹配 sampling preset/adapter、SaveImage prefix。所有 model/LoRA enum 必须使用扫描得到的精确文件名。
5. 静态 validator 检查 graph 结构、路线专属 checkpoint/prepare node、quality→adapter/preset 配对、5-frame selector、输出节点和 placeholder 数量；object-info validator 检查运行时 socket 与 enum。两者都通过后才提交。
6. `workflow-metadata.ts` 和 metadata tests 登记两个 graph。旧图片 adapter/workflow 的输出不得变化。

**P2 Gate**：两个固定 fixture 可构造纯 API graph；错误 route/adapter/shift、额外 Picture、缺 enum 或旧 schema 都会在上传/提交前失败；现有全部图片 adapter regression 通过。

### P3 — Draft、UI、queue、execution、History

1. 更新 `src/types.ts`、`src/core/defaults.ts`、image draft normalizer、`electron/store.ts`，以可选 H3 snapshot 保持向后兼容。
2. 更新 Create image view-model/controller/renderer：模型文案、Picture 上限、条件控件、错误/缺依赖态。优先复用现有 Picture role/note 和质量档 UI；不新建 H3 专用页面。
3. `src/core/queue-task-factory.ts` 入队时深拷贝 Picture 与 H3 options。测试证明：提交后再改 draft、Picture 角色/顺序、质量档、Settings，已排队任务不变。
4. `electron/services/comfy-ui.ts` 在上传前完成 model-specific object-info 校验；执行阶段解析实际 H3 输出，只把 selector/SaveImage 的单张最终图进入 run。多帧候选不得全部误收进 History。
5. `electron/queue-history.ts`、恢复/重试与 image project normalizer 保存实际 recipe、seed、H3 options、reference 顺序和 parent lineage。失败恢复草稿时还原 H3 选项；旧 History/queue 缺字段仍可读。
6. 进度节点、取消、重启恢复、失败日志、删除和重复生成走现有图片语义。不得引入 H3 视频 artifact/JointAV 到 image History。

**P3 Gate**：UI → enqueue → immutable snapshot → submit → one output → History → retry/restore 闭环的自动测试通过；旧模型、旧草稿、旧 queue/history 无回归。

### P4 — 验证与产品开放

按 [Change Verification](../../CHANGE_VERIFICATION.md) 执行，避免在未变化的文件状态重复 full gate：

1. 开发中跑 focused tests：`tests/image-workflow.test.ts`、`tests/model-catalog.test.ts`、`tests/dependency-catalog.test.ts`、`tests/environment.test.ts`、`tests/queue.test.ts`、`tests/image-project.test.ts`、`tests/store.test.ts`、相关 Create/queue/history service tests；再跑 `npm.cmd run typecheck`。
2. 集成完成跑一次 `npm.cmd run verify`。若当前工作区另有 writer 正在改 package/test 配置，先协调，不能覆盖或把并发修改误算作本功能证据。
3. 手动 UX：两种视口；模型切换；1/9 图边界；Picture 顺序/角色；quality 与条件高级项；依赖 missing/incompatible/ready；连续输入、焦点、clear、撤销/重做（存在处）；入队后继续编辑草稿；Queue/History/Detail 返回路径。
4. Runtime schema：固定目标 ComfyUI 与选中 data dir，记录 core version/commit、Python/Torch/CUDA、custom node commit、`/object_info` schema 摘要和全部模型 SHA-256。
5. 最小真实矩阵（先 Base，再逐个 Turbo；每次只扩一个维度）：
   - FL2VA：Picture 1 轻度光照/色彩编辑；验证 frame-0 锚定与 selector，不把近似原图误判为指令成功。
   - REF2VA 单图：明显但可观察的服装/颜色或构图变化。
   - REF2VA 双图：Picture 1 基准 + Picture 2 服装；Picture 1 基准 + Picture 2 姿态/构图。核对 `<Picture N>` 和角色。
   - 同一素材/seed 比较 Base 20 与启用的 8-step；4-step 仅在其 Gate 满足后补测。
   - 保留至少一个失败样本（文字、手部、边条、身份/参考过度吸收），写成产品质量边界，不为过 Gate 挑最好 seed。
6. 每个真实 run 记录 prompt id、冷/热启动、elapsed/阶段时间、输出尺寸、selected frame/index、VRAM/RAM、artifact 路径与清理；成功只证明 execution，主观质量单独判定。
7. 最后用真实应用完成一次端到端 smoke（不是仅向 ComfyUI 发原始 `/prompt`）：enqueue、progress、cancel 一次、retry/restart 恢复、History 产物/metadata、删除/返回操作。运行前协调端口、ComfyUI、GPU、Electron userData；结束后清理本任务临时媒体/日志并关闭本任务启动的进程。

**开放条件**：Catalogued、Detected、Runtime validated、Workflow constructed、Smoke passed、Product integrated 六级逐项有证据；任一级缺失就保持不可选/明确 unavailable，不把“节点存在”写成“可用”。

## File ownership and expected diff

Luna 开工时重新用 `rg --files` 确认路径。预期独占写入范围：

- `docs/tasks/2026-09-15-h3-image-editing/**`
- `workflows/` 中新增的两个 H3 image API graph
- `src/core/image-workflow/**` 中新增 H3 adapter 及现有 registry/capability/requirements
- `src/core/catalog/models/image.ts`、`src/core/catalog/dependencies/nodes.ts`、`src/core/workflow-metadata.ts`
- `src/types.ts`、`src/core/defaults.ts`、image draft/project/queue helpers、`electron/store.ts`
- Create image renderer/view-model、`electron/services/comfy-ui.ts`、必要的 queue/history 文件
- 对应 `tests/**`、本地化 key/text

共享文件写前重读并确认没有其他 writer。`CHANGELOG.md`、`package.json`、lockfile 当前已有修改，只有取得 release ownership 后才合并版本事项；不 reset/stash/restore/stage/commit 他人改动。`dist`、端口、Electron userData、ComfyUI 与 GPU 是共享资源，使用前协调，结束后只清理由本任务创建的资源。

## Acceptance checklist

- [x] 两个稳定 model id 与 UI 文案区分 FL2VA anchored I2I / REF2VA edit；没有把 `R2V` 视频 id 复用于图片。
- [x] v23.0.0/commit、采用 API graph、最小节点 schema fixture、资产文件与 hash 有证据；目标实例 schema 仍待 P4。
- [x] Base/Turbo recipe 与路线、adapter、steps、shift 严格配对；不支持自由混搭。
- [x] FL2VA 恰好 1 图；REF2VA 1–9 图且顺序、编号、role/note 从 draft 到 History 不变。
- [x] 5-frame 和 recommended selector 固定；History 只收到一张最终图的静态输出语义。
- [x] H3 options 正常化、队列冻结、失败恢复、legacy 兼容均有测试。
- [x] 节点目录、runtime load、schema、模型文件、workflow/smoke 六层状态在代码与 UI 中分层；目标烟测实例的 runtime load/schema 已核验，但产品门禁仍需完整 smoke/结果落盘闭环。
- [x] object-info 校验覆盖 input names 与实际使用 enum，并在上传/提交前 fail closed。
- [x] 旧图片模型 graph/创建页/队列/历史回归通过；H3 mask/markup 不可用但用户数据未丢失。
- [ ] focused tests、typecheck、一次最终 `npm.cmd run verify` 与真实 app smoke 有对应文件状态和结果（自动验证已通过；FL2VA graph 已真实执行并生成 PNG，但本轮烟测 wrapper 的 Comfy 输出目录与应用快照不一致，未通过应用结果接收闭环）。
- [x] 未验证的 T=1、9/13/20 帧、semantic transport、Face/Qwen refine、PDD/DARE 不出现在首版可选 UI。

## Evidence / handoff

### 关键来源

- [MiniMax H3 Image Studio v23.0.0](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/tree/v23.0.0)；固定 commit `f7384aacb7bf35492dc73a3e6054ab6b427f93f6`。
- [v23 validation](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/blob/v23.0.0/docs/validation-v23.md)：上游 RTX 4090 / ComfyUI 0.34.0 的 bounded regression；是候选 recipe/风险证据，不替代本应用 smoke。
- [v23 API examples](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/tree/v23.0.0/examples/api)：本任务只采用上文列出的 FL2VA/REF2VA graph 来源。
- [MiniMax H3 Turbo](https://github.com/ModelTC/Minimax-H3-Turbo)：adapter-specific step/shift 与 core-node ComfyUI workflow 交叉核对来源。
- 仓库：[Workflow Contract](../../WORKFLOW_CONTRACT.md)、[Dependencies and Setup](../../DEPENDENCIES_AND_SETUP.md)、[Change Verification](../../CHANGE_VERIFICATION.md)、当前 image workflow/catalog/queue/history 实现。

### 本次 plan review 的证据

- `git status --short`：4 个已修改文件加本任务未跟踪目录；未覆盖它们。
- `git rev-parse --short HEAD` → `d015cfe`；`npm.cmd pkg get version` → `0.61.9`。
- 上游 tag API：v23.0.0 annotated tag 最终指向 commit `f7384aac...`。
- 上游 `pyproject.toml`：Python >=3.10、ComfyUI >=0.30.0；`requirements.txt` 无额外依赖。
- 已读取 v23 `H3_IMAGE_EDIT_API.json` 与 `H3_REFERENCE_EDIT_API.json`，确认推荐 image edit 是 REF2VA 而非 FL2VA，并确认主要 class type/preset/adapter 配对。
- 本次只修改 TASK 计划；未安装节点、下载权重、启动/重启 ComfyUI、运行 build/test/verify/GPU。

### 版本与关闭

- 预期影响：minor feature。功能真正 Product integrated 后由唯一 release owner 更新 `CHANGELOG.md` 并将 package/lockfile 对齐到下一 minor；当前已有共享文件改动，不能在 P0–P3 提前抢占或覆盖。
- 完成时把稳定产品约束并入相应 contract，TASK 标 `done` 并保留 evidence；没有真实 smoke 时不得关闭为 done。
- 实际模型/effort、全树 usage、耗时：plan review 阶段不可得，记 `unknown`；执行者在可见时补录，不为计量重复运行。

## Out of scope for first product Gate

- T=1/hybrid checkpoint/独立 image VAE、9/13/20-frame profile、semantic-only reference transport。
- 原生 Mask inpaint、Face Refine、Qwen 2511 detail refiner、自动 VLM prompt、Director/Benchmark UI。
- PDD、DARE、Sage/SLA/Spectrum 等额外加速/采样组合与第二候选 H3 Studio。
- 不替换 Qwen/Flux/OmniGen/Z-Image，不宣称像素级局部修补、任意身份保持、可靠文字/手部或高分辨率必然提升。

## 2026-09-15 implementation acceptance review — changes required

### Review result

- 结论：**未通过验收，保持 `validating`，不得标记 `done` 或 Product integrated。**
- 已通过的自动证据：H3/queue/history/catalog focused tests 共 7 files / 140 tests；`npm.cmd run verify` 共 172 files / 1428 unit tests、6 files / 81 integration tests，typecheck、build、contrast 均通过；`git diff --check` 无 whitespace error，仅有工作区既有的 LF/CRLF 提示。
- 自动测试通过不覆盖下列运行语义问题。修复后先补回归测试，再按“重新验收门槛”执行；缺少目标 ComfyUI、权重或 GPU 时仍不得声称 P4 完成。

### A1 — P1：REF2VA 空洞 Picture 编号会绑定错误参考图

**当前问题**

- `compileH3Prompt` 接受并保留 `Picture 1 / 3 / 8` 等空洞编号；`buildH3ImageWorkflow` 又把它们连接到 `reference_image_3`、`reference_image_8`。
- v23 节点的 `_collect_reference_images` 按 socket 顺序遍历并跳过 `None`，随后把收集结果连续暴露为 `<Picture 1>` 至 `<Picture N>`。因此上述输入在节点内部实际成为 Picture 1/2/3，而提示词仍引用 Picture 1/3/8，角色和图片会错位。
- `tests/image-workflow.test.ts` 当前以 1/3/8 为成功用例，错误地固化了该行为。

**必须修复**

1. UI、draft、queue、History 中已展示的稳定 `pictureNumber` 继续保持不变；不能因为删除图片而悄悄重编号持久化数据。
2. 在 H3 REF2VA **执行层**建立可见编号到节点连续编号的显式映射，例如 1/3/8 → runtime 1/2/3；同步改写编译后的 `<Picture N>`、role/note contract 和 prepare socket，使同一张图在 prompt、上传顺序和节点输入中始终一致。
3. 不要仅把空洞输入接到同号 socket，也不要通过改变通用 Picture 删除/复用语义规避问题。
4. 静态 validator 应验证 runtime sockets 从 `reference_image_2` 起连续、没有空洞，并验证 prompt/runtime 映射覆盖所有输入。

**回归测试**

- 保留 1/3/8 用例，但期望 runtime socket 为 source + `reference_image_2` + `reference_image_3`，prompt/role contract 中运行编号与对应图片一致。
- 增加用户 prompt 同时引用 3 和 8、删除中间 Picture 后入队、恢复/重试、History 保留可见 1/3/8 的测试。
- 增加连续 1/2/3 与九图边界测试，证明没有双重改写或顺序回归。

### A2 — P1：执行阶段忽略已冻结的 H3 recipe

**当前问题**

- `imageTaskFromDraft` 已保存 `task.h3ImageRecipe`，但 `buildH3ImageWorkflow` 仍通过 `h3ImageRecipeFor(modelId, quality.id, task.diffusionModelFilename)` 按当前代码重新计算 recipe。
- 应用升级、quality 映射或默认文件名改变后，等待中/恢复后的旧任务会执行新 recipe，而 History 仍记录旧快照，违反“Draft edits never mutate queued execution snapshots”及可复现 lineage。

**必须修复**

1. 新任务执行必须验证并消费 `task.h3ImageRecipe` 中冻结的 checkpoint、adapter、LoRA、steps/shift/sampling profile 等实际构图字段。
2. 仅对旧 queue 中确实缺少 `h3ImageRecipe` 的任务提供明确、可测试的 legacy fallback；不得静默覆盖已有快照。
3. 若快照与 model id、quality 或可用组件矛盾，上传前 fail closed，并给出可操作错误，不自动换 recipe。
4. 静态 workflow validator 接收/校验任务快照对应的 recipe，不能再次只按当前 catalog 推导期望值。

**回归测试**

- 创建任务后模拟修改当前 recipe 映射，证明已排队任务构出的 checkpoint、LoRA、sampling profile 与冻结快照不变。
- 覆盖 Base、FL2VA Turbo、REF2VA Turbo、缺失旧字段 fallback、损坏/跨路线快照拒绝。

### A3 — P1：P4 未完成时模型已被标记并开放为 integrated

**当前问题**

- 两个 H3 image catalog entry 当前均为 `scan.integrated: true`。
- `isImageModelSelectable` 与 `cachedImageProfileAllowsEnqueue` 只依赖 catalog integrated、文件 available 和缺节点状态，不要求 `runtimeVerified && runtimeReady`。当文件与节点目录被检测到但目标 `/object_info` 尚未验证时，用户仍可能选择并加入队列。
- 这与本 TASK 的六级开放条件以及当前“没有目标实例/权重/GPU、未执行真实 smoke”的事实冲突。

**必须修复**

1. 在 P4 真实验收完成前，H3 两个入口必须保持不可开放，并明确显示 runtime/smoke 尚未验证；不要影响已经完成验证的其他图片模型。
2. 为 H3 增加专属门禁或等价的可持久化发布状态：至少要求 custom node loaded、目标 schema validator 通过、模型文件齐全；Product integrated/正式开放还必须由真实 smoke 证据解锁。
3. 不要把节点目录存在、catalog `integrated` 或静态 fixture 通过等同于 runtime ready。
4. 若本轮环境无法完成 P4，代码和 TASK 必须保留关闭状态，并列出解除门禁所需的确切人工步骤；不能为了让测试通过而默认开放。

**回归测试**

- 覆盖 available 但 runtime 未验证、runtime schema 失败、缺节点、runtime ready、产品 Gate 未解锁/已解锁状态。
- 证明 H3 未验证时不可入队，且其他已集成图片模型的现有选择/入队行为不变。

### A4 — P2：实际 H3 输出尺寸与 Queue/History 元数据不一致

**当前问题**

- H3 graph 固定使用 `H3ImageResolutionPreset` 的 `source image` + `native detail | 0.98 MP`，Create UI 同时隐藏通用 aspect ratio 和 target resolution。
- `imageTaskFromDraft` 仍按草稿中可能由上一模型遗留的 `aspectRatio/targetResolution` 计算 `outputWidth/outputHeight`；`electron/queue-history.ts` 又直接把这两个预测值写入 History。
- 因此实际约 0.98 MP、源比例输出可能被记录为 2160/1536 等无关尺寸；catalog 宣告的通用 resolution 列表也与实际不可选的固定策略不一致。

**必须修复**

1. 选择一个单一事实来源：若首版固定 0.98 MP，则 H3 queue snapshot 必须冻结 H3 resolution recipe，并用与 v23 相同的 32 对齐算法计算预期尺寸；不要读取隐藏的通用 draft 值。
2. History 完成态优先记录实际产物宽高；若当前输出解析层没有尺寸，补充可靠读取或明确的 H3 计算值，不能写入已知不一致的通用预测值。
3. Catalog/capability/UI 只展示真实可执行的尺寸能力。若没有尺寸选择器，移除会让用户误以为可选的通用 resolution 声明，或实现与 graph 一致的 H3 专用选项。
4. 模型切换不能让上一模型的隐藏 aspect/target 值污染 H3，也不能反向破坏用户切回旧模型后的草稿设置。

**回归测试**

- 使用横图、竖图、方图以及从其他模型切换后遗留 2160/1536 设置的草稿，验证 graph、queue 和 History 尺寸一致并按 32 对齐。
- 验证完成产物尺寸优先于预测值；旧 History 缺少新字段仍可读。

### Luna 修复范围与重新验收门槛

1. 只修复 A1–A4 及其必要测试/文档；不要顺带扩入 T=1、4-step、Mask、semantic transport 或其他首版 out-of-scope 能力。
2. 修改前重读涉及文件并保留共享工作区其他改动；TS/JS 配对文件遵循仓库现有生成/维护方式，不手工造成漂移。
3. 先运行新增和受影响的 focused tests，再运行一次 `npm.cmd run verify`；检查 `git diff --check`、scoped diff 与 unexpected deletion。
4. 在 TASK 本节逐项记录实际修改、测试命令与结果。A1–A4 全部关闭前，原 Acceptance checklist 中涉及 Picture 映射、immutable recipe、分层开放和尺寸 metadata 的项目视为重新打开，不得仅因旧测试为绿色而勾选完成。
5. 若具备目标 ComfyUI、权重和 GPU，再继续 P4 runtime/schema/真实 Base+Turbo/app smoke；若不具备，修复可提交复验，但状态仍为 `validating`，产品入口保持关闭。

### 2026-09-15 reacceptance repair record

- A1：REF2VA 将可见的 `Picture 1/3/8` 与运行时连续槽位 `1/2/3` 分离；prompt、role/note contract、上传顺序和 `reference_image_2...N` socket 共用该映射。静态 validator 现在拒绝 socket 空洞，并覆盖删除/恢复、连续 9 图和 History 可见编号保留。
- A2：新任务执行优先消费 `task.h3ImageRecipe`，recipe 的 route/quality、adapter、sampling、sampler/shift、5-frame selector、0.98 MP profile 和 checkpoint 均在执行前校验；仅缺少整个字段的旧任务使用显式 legacy fallback。损坏或跨路线快照会被保留到执行阶段并 fail closed，不会被 store normalizer 静默换成当前 recipe；历史 LoRA/checkpoint 只由冻结快照驱动，运行时 schema 再验证实际可用性。
- A3：两个 H3 image catalog entry 保持 `productGate: locked`。Create 下拉、renderer enqueue reason、共享 readiness helper 和 Electron queue guard 都拒绝未完成目标 `/object_info`、节点加载与真实 smoke 的 H3 入队；旧缓存缺少 gate 字段时仍回退到 catalog gate，其他图片模型不受影响。
- A4：H3 不再读取通用隐藏 aspect/target；queue snapshot 固定 `native-detail-0.98mp`，按 v23 `0.98 × 1024²` 与独立 32 像素对齐算法记录预测尺寸。History 完成态优先读取实际 PNG 尺寸，读取失败才使用可靠 H3 计算值；旧 History/recipe 缺字段仍可读取。
- 修复后的验证：focused H3/queue/history/catalog/settings/store tests 9 files / 247 tests 通过；`npm.cmd run typecheck` 通过；`npm.cmd run verify` 通过（unit 172 files / 1437 tests，integration 6 files / 81 tests，build、contrast 通过）；`git diff --check` 无 whitespace error。
- 当前边界：本机仍没有目标 ComfyUI、v23 节点实际加载状态、目标 `/object_info`、完整权重和 GPU，因此没有执行或宣称 P4 real Base/Turbo smoke、取消/重启恢复或 app E2E。解除门禁前必须在选定 ComfyUI 实例安装并加载 `minimax-h3-image-studio` v23.0.0、重启后保存完整 `/object_info` schema/enum、确认 FL2VA/REF2VA 对应权重与 Turbo LoRA 文件及 SHA-256，再逐项完成 Base → Turbo 的真实 app smoke 和 History/失败恢复验收；在此之前状态继续为 `validating`，入口继续关闭。

## 2026-09-16 P4 runtime smoke decision — stop current image route

### 真实运行证据

- 目标实例实际返回 ComfyUI `0.35.0` / revision `6338e4bd`、Python `3.12.11`、PyTorch `2.10.0+cu130`、CUDA `13.0`、RTX 4090；`ComfyUI-MiniMax-H3-Image-Studio v23.0.0` 与 KJNodes 已加载，`VRAM_Debug` 可执行。应用的 runtime scan 将 FL2VA 与 REF2VA 的核心运行条件识别为 ready，但 REF2VA Turbo 的精确 8-step LoRA 仍缺失。
- 通过应用现有 `enqueueImageEdit → startQueue` 提交 FL2VA Turbo，未直接绕过应用向 ComfyUI 发原始请求。最新 smoke task `a330617d-ae0f-49b7-a65d-d53487e67500` / prompt `dc2016ed-c78d-42f4-9051-6580d1b5e792` 实际提交了 15 节点 graph，且 `VRAM_Debug` 位于采样与 `H3ImageDecode` 之间。
- 8 步采样在约 6 秒内完成；准备/模型阶段约 11 秒，解码约 5 秒，`SaveImage` 随后成功完成。KJNodes 日志显示清理节点在解码前释放约 20 GB；该节点不是空跑，确实降低了 diffusion stack 到 VAE decode 的显存压力。
- ComfyUI 任务以成功状态结束并写出有效 PNG；应用随后报“输出不存在”。复核发现烟测 wrapper 的 Comfy `--output-directory` 与应用冻结在 task 中的 `imageOutputRoot` 不是同一目录，文件实际在 wrapper 目录中。故本次不是 H3 graph 或 SaveImage 失败，而是烟测启动配置造成的应用侧路径不匹配；临时加入的输出重试/诊断日志已移除，避免把真实配置错误掩盖成等待问题。
- 这条 FL2VA 应用任务的端到端耗时约 40 秒，其中 Comfy graph 约 35 秒，剩余时间主要是错误路径上的输出校验。应用采样监控未取得 GPU VRAM 采样，但 Comfy `VRAM_Debug` 的释放值和节点时序已取得；不能把系统 RAM 峰值当作显存证据。
- 收尾验证：`npm.cmd run verify` 通过，unit 172 files / 1441 tests、integration 6 files / 81 tests、typecheck/build/contrast 均通过；`git diff --check` 无 whitespace error。所有本轮启动的 Electron/ComfyUI 进程与 smoke 端口均已关闭，生成目录重新由 build 产出且两个 H3 entry 仍为 locked。

### 结论与门禁

1. 当前图片 graph 并不是轻量的单帧图片模型：它固定走 5-frame video latent、H3 video VAE 和 `H3ImageFrameSelector`，因此“只输出一张图”不会自动带来视频级别以下的计算/显存成本。视频路径更快并不与这个 graph 的结构矛盾。
2. `VRAM_Debug` 已解决“采样模型直接压着解码”的一段峰值，但没有把 5-frame VAE 路线变成轻量图片编辑器；继续重复 FL2VA smoke 不能证明产品质量，也不能解决结构性成本。
3. REF2VA Base 曾在 decode 阶段长时间不出结果并接近显存上限后取消；REF2VA Turbo 当前又缺少精确 LoRA。因此本轮不再继续提交 REF2VA 任务，也不把它标为 smoke passed。
4. 两个 H3 图片入口继续保持 `productGate: locked`。本轮真实运行只能证明 v23 节点、schema、FL2VA graph 和清理节点在目标实例上能执行，不能证明当前图片路线达到产品集成门槛。

### 后续解锁条件

- 若继续做外部 app smoke，必须让 ComfyUI 的实际输出目录与应用 task 的 `imageOutputRoot` 完全一致，再只复跑一次验证 Queue/History 接收闭环；不再用不同输出目录的 wrapper 解释结果。
- 在重新开放前必须先做路线决策：要么接入经 schema/显存验证的 T=1/独立 image-VAE H3 图片 graph，要么接受 5-frame video-latent 路线的成本并重新定义产品性能门槛。不能继续把当前实现描述为“图片应比视频更快”。
- REF2VA 还需要补齐精确 Turbo LoRA，或明确只开放已验证的 Base；Base 需先解决 decode 阶段的显存/释放策略，再做最小单图 smoke。

## 2026-09-16 P4 single-image route revalidation — live schema and community evidence

### Documentation/community cross-check

- 已安装的 `ComfyUI-MiniMax-H3-Image-Studio` 本地 `README.md`、`CHANGELOG.md` 与 `docs/validation-v23.md` 互相一致：v17/v18 已加入真正的 `T=1` 单帧 latent、实验性单帧 REF2VA，以及使用 experimental image VAE 的单帧 T2I/I2I；v23 validation 记录 1/2 MP 单帧编辑出现了可见的服装/姿态变化，但仍有白边等实验性缺陷。
- 官方随节点提供独立的 `H3_I2I_SINGLE_API.json` 与 `H3_REFERENCE_SINGLE_API.json`。两条 graph 都要求 hybrid diffusion checkpoint、`minimax_h3_t1_image_vae_step1597.safetensors`、FL2V Turbo 8-step adapter（0.75）和 `MaxiMin-HHH-R2V-ThisIsFine_LoRA_V0_1.safetensors`（0.5）；这不是把现有 5-frame graph 的帧数改成 1。
- 社区实现也分成两类：小型图片编辑节点包把可靠默认值留在 5-frame context，同时把真正 T=1 标作 experimental；上游 Image Studio 则提供完整的 T=1 API graph。结论是“社区已做出可运行路线”成立，但“任何现有 H3 权重都能直接切成轻量单帧”不成立。

### Live target evidence

- 隔离实例已启动在 `127.0.0.1:8189`：ComfyUI `0.35.0`、Python `3.12.11`、PyTorch `2.10.0+cu130`、RTX 4090；`ComfyUI-MiniMax-H3-Image-Studio`、KJNodes 与 `VRAM_Debug` 均已加载。实例使用独立 user/input/output/temp/database 目录，没有复用视频任务目录。
- 真实 `GET /object_info` 返回了 `single image | 1 frame (image VAE)`、`hybrid single image | ER-SDE 8 steps`、`H3ImageDecode.decode_mode = temporal|single_latent_slice`、`H3ReferenceEditPrepare.reference_image_2...9` 和 `optimize_for_still`；因此节点 schema 与上游单帧 API 对齐，不是静态 fixture 假阳性。
- 将已安装节点附带的 `H3_I2I_SINGLE_API.json` 通过真实 `POST /prompt` 提交后，ComfyUI 在执行前按 `value_not_in_list` 拒绝了 3 类精确缺件：hybrid checkpoint、T=1 image VAE、ThisIsFine detail LoRA；`H3_REFERENCE_SINGLE_API.json` 的真实预检得到同样 3 类缺件。没有进入 GPU 采样，也没有用错误的 5-frame/video VAE 路线冒充单帧测试。

### Local asset matrix at this run

- 已存在并被 live schema 列出的可用资产：FL2VA/REF2VA pruned INT8 ConvRot checkpoint、Qwen3-VL NVFP4 encoder、H3 FP16/INT8 video VAE、FL2V Turbo v1.0 8-step LoRA。
- 尚未存在且单帧两条路线共同需要：`minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors`、`minimax_h3_t1_image_vae_step1597.safetensors`、`MaxiMin-HHH-R2V-ThisIsFine_LoRA_V0_1.safetensors`。`/object_info` 的实际枚举也逐一证明了这 3 个文件没有被 ComfyUI 发现。

### Decision and next gate

1. T=1/独立 image-VAE 重新进入 P4 的候选路线，目标是分别验证 FL2VA I2I 与 REF2VA reference edit 的显存、耗时、输出边界和应用闭环；它们仍不解锁产品入口。
2. 在用户把上述 3 个外部权重放入当前 ComfyUI `models` 目录并重启实例前，不再提交会必然被预检拒绝的单帧 GPU 任务；不下载、复制或内置权重，保持外部节点/用户资产边界。
3. 资产齐全后按官方 API 原样先跑单帧 I2I，再跑单帧 REF2VA；记录 prompt id、准备/采样/解码分段耗时、峰值显存、PNG 尺寸和白边/编辑遵循情况，再决定是否把现有产品 graph 从 5-frame 改为单帧或同时保留两种 profile。
4. 本节记录时两个 H3 image catalog entry 仍为 `productGate: locked`。后续用户明确授权开放正式入口后，由最新的 formal-entry 记录覆盖当前门禁状态；本节历史证据不等同于 `Smoke passed` / `Product integrated`。

### 2026-09-16 minimal FL2VA/R2V runtime comparison

- 为避免把输出质量与输入素材混淆，使用节点自带的人像/服装示例复制到本次隔离 input 目录：`community-woman-before.png` 作为 Picture 1，`community-clown-after.png` 作为 Picture 2；只写入临时测试目录，不进入产品资源。
- FL2VA I2I：官方 `H3_I2I_TURBO_API.json`，现有 `minimax_h3_fl2va_pruned_int8_convrot.safetensors` + H3 video VAE + FL2V Turbo v1.0 8-step，`fast preview | 0.40 MP`，5-frame，加入同一 `VRAM_Debug` 清理。prompt `5902c1e4-a6bb-46dd-bdaa-bc73111aa351`，Comfy execution `32.18 s`，清理前/后 free memory `2.918/23.986 GB`，输出 `544x800`。可见地把红外套改成深绿色，人物、构图和背景大体保留；输出为有效 PNG。
- REF2VA reference edit：官方 `H3_REFERENCE_EDIT_API.json`，现有 REF2VA checkpoint + H3 video VAE、Base 20 steps，`fast preview | 0.40 MP`，5-frame，加入同一清理节点。prompt `6f6b9ff0-b47a-4a7c-bb7f-fb62e20535db`，Comfy execution `122.77 s`，清理前/后 free memory `10.927/23.986 GB`，输出 `544x800`。服装/姿态参考被执行，但完整小丑参考被主体吸收，人物身份保留不足；这是质量失败样本，不把 `status=success` 当作编辑通过。
- 另一个同图城市输入的 R2V 0.40 MP smoke 在 `41.08 s` 完成并输出 `864x480`；它只证明最小 graph 可执行，不作为质量样本。三次运行均未 OOM，且输出都落在隔离 Comfy output 根目录。
- 这组数据验证了用户观察的一部分：当前 5-frame 图片 graph 仍是视频 latent/VAE 路线，FL2VA Turbo 可以比 REF2VA Base 快很多，但不能因此声称“图片天然比视频更快”；真正降低结构性成本仍需要补齐并实测 T=1/image-VAE graph。

## 2026-09-16 user-authorized formal entry

- 用户明确要求开放正式入口进行一次实际测试，因此 `minimax-h3-image-i2i`（FL2VA）与 `minimax-h3-reference-edit`（REF2VA）两个 catalog entry 已改为 `productGate: open`。
- “open”只解除产品总门禁，不绕过运行时安全检查：任务真正提交到 ComfyUI 前仍要求 `/object_info`、`minimax-h3-image-studio` 节点和核心模型文件满足路线 schema，并在选择质量档时再次检查对应的可选 Turbo LoRA。
- 模型选择、入队与提交已分层：模型文件完整时，H3 即使处于 `runtime pending` 也允许在下拉框中选择和加入队列；只有任务启动并提交给 ComfyUI 时才 fail closed 校验 runtime schema。这避免把“可配置/可排队模型”误做成“已执行成功任务”。
- 当前本机已有 FL2VA Turbo 的真实 5-frame smoke；REF2VA Base 也有真实 graph 执行证据，因此可先实际测试 FL2VA Turbo 或 REF2VA Base。REF2VA Turbo 的精确 8-step LoRA 尚缺，选择该质量档时应继续被质量档资产校验拦截，而不是静默退回 Base。
- T=1/image-VAE 单帧路线仍未纳入正式入口：live schema 已确认其存在，但 hybrid checkpoint、T=1 image VAE 与 ThisIsFine detail LoRA 缺失，官方 API 的真实预检会 fail closed。
- 使用入口前需重启应用或执行一次完整环境复扫，让当前进程丢弃旧的 locked profile 缓存；在图片处理页选择 H3 路线、添加 Picture 1，FL2VA 选择 Base/Turbo，REF2VA 先选择 Base，再加入队列。没有任何环境扫描结果时仍需先扫描以确认文件；已有完整文件 profile 但缺 runtime evidence 时可以选择并入队，任务启动时再做运行时校验。
- 本次变更开放的是“可实际运行的正式入口”，不是最终质量验收；TASK 状态保持 `validating`，直到 app 端 Queue/History/output 闭环和用户主观质量验收完成。

### 2026-09-16 H3 image queue-entry repair

- 根因：renderer 的 `imageEditEnqueueBlockReason` 和 Electron H3 queue guard 把 `runtimeVerified/runtimeReady` 的 pending 状态，或尚未建立缓存扫描的状态，误当成“图片工作流尚未接入”，与“运行时 `/object_info` 在任务启动/提交前校验”的既有契约冲突。
- 修复：`cachedImageProfileAllowsEnqueue` 现在只负责缓存的文件、集成和 custom-node 缺失检查；H3 为 `open` 且已有完整文件 profile 时，FL2VA 与 REF2VA 均可选择并入队。缺少扫描缓存时保留延后预检；真正向 ComfyUI 提交前仍由 live `/object_info`、节点 schema、核心权重和所选 Turbo 资产 fail closed。
- 保留门禁：`productGate: locked`、缺核心模型文件、缺必需 custom node、未登记质量档，以及 REF2VA Turbo 精确 LoRA 缺失仍会阻止对应操作；REF2VA Base 不受 Turbo LoRA 缺失影响。
- 回归覆盖：新增两条路线在 runtime evidence 缺失/待验证时的 renderer 入队前置测试，以及无缓存扫描时 H3 FL2VA 延后校验的 Electron queue 测试；focused 5 files / 96 tests、`npm.cmd run typecheck`、`npm.cmd run verify` 均通过，`git diff --check` 无 whitespace error。
- 当前未重新启动 Electron/GPU 实例做人工点击验收；需重启正式应用加载最新构建后，在目标 ComfyUI 已运行时分别用 FL2VA Base/Turbo 与 REF2VA Base 实测。任务若在运行时 schema 或输出阶段失败，应显示具体运行时/资产错误，而不再显示“图片工作流尚未接入”。
