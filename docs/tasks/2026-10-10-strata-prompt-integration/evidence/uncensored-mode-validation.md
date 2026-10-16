# Strata uncensored 单开关接入验收

- 类型：Evidence；状态：implemented / GPU-quality-unverified；日期：2026-10-17。
- 授权：用户同意提示词页单开关、兼容模型自动应用并提供排障日志；minor，不bump／提交／推送／打包。保留此前自动输出预算改动，直接执行、子agent 0。

## 已交付行为

- `Settings.strataUncensored`默认false，旧数据缺省／非布尔值归一化为false；保存接口拒绝新的非布尔输入。开关只在提示词页Strata选择下出现一次，不支持项禁用，其他页／后端保留偏好而不应用。
- 当前兼容名单限原版Flash-Next IQ3_XXS／IQ2_XS。使用固定Strata安装已带的`data/experimental-speed-projection/Qwen3.8-Flash-Next-experimental-speed-projection.gguf`：483520bytes，SHA-256 `ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b`，project／per-layer／4..44层。完整读验仅这个小文件，不下载、不修改主权重，不增加文件路径或高级参数控件。
- 第一次启用对启动配置加临时overlay，需要时重载模型，但不改已验证base pack／receipt。已有向量的模型后续切换不重载；每个请求明确发送`experimental_speed_projection: true|false`，时间点纠正继承相同模式。运行中保存不改变已有请求。原队列／取消／GPU互斥／资源准入保持。
- 加载成功后必须读取本次engine.log增量，确认project／per-layer／41个作用层；缺失／错误模式／旧日志不算就绪，停止自有进程并可修复重试。启动前被取消或端口冲突也清理未采用的会话overlay。
- 日志：准备阶段Detail有requested／supported、vector id／sha256／layers、engineConfirmed；逐次推理`Prompt.StrataInferenceMetrics`中的`uncensored`有requested／supported／vectorId／vectorSha256／vectorLoaded／applied。vectorLoaded是该请求开始时事实，失败清理不抹掉它；applied仅完成请求后为true／false，未完成为null。它不表示无拒答或语义质量通过。服务快照随进程停止清空激活事实；按钮tooltip显示向量就绪或最近成功请求的模式。没有原始正文、思考或认证信息进入新增诊断。

## 验证结果

- 聚焦9文件175项先通过，随后增加首次启用／保留复用与失败日志断言；最终由全量单元覆盖，217文件／2014项通过。
- 早一轮完整`npm.cmd run verify`通过。最后诊断快照修正后的verify中，单元全部通过，既有DLSS5事务集成项`uses HECer's py7zr path before falling back to native 7-Zip`出现`result.ok=false`；未改无关安装代码。相同最终文件状态以`npm.cmd run test:integration -- --maxWorkers=1`复验全部6文件／88项通过，再独立`npm.cmd run build`（双端类型＋干净构建）与20项对比度通过。因此不把最后那次verify进程记成clean通过。首轮共享临时日志目录权限问题通过独立TEMP隔离，未删用户旧日志。
- 本机真实小向量大小／完整hash与上述固定值一致；实际安装引擎`--help`确认control-vector、project／per-layer及逐请求cvec开关。官方`serve.server --engine mock`＋生产StrataService真实HTTP请求通过，输出预算32434、56tokens正常stop，诊断明确requested=false／vectorLoaded=false／applied=false；这是无神经推理的协议证据。
- 真实生产Electron隔离窗口：鼠标勾选／保存、跨页偏好、节点页无重复控件、键盘焦点保留、1280×800／1440×900／960×800均无横向溢出；截图已查看。缺输入提示且无操作，补齐后真实增强按钮产生operation ID，进度日志包含`uncensored: requested=true`，再点取消并等待stopped，原草稿／版本／空队列和History保持。没有视频生成任务。
- 重启审计确认开关与上述内容保持，原用户state文件hash保持。首次审计仅因脚本JSON省略undefined字段比较失败，修正为持久化JSON语义后复验通过，未改产品数据来迁就测试。

临时脚本、截图与日志在忽略的`temp/`，不入Git：`uncensored-verify.log`、`uncensored-verify-final.log`、`uncensored-integration-serial.log`、`uncensored-build-final.log`及本次create-smoke报告。隔离Electron与官方mock均已通过既有应用API清理／进程退出复核；Harness窗口关闭不当作原生关闭生命周期验收。

## 未验证与下一步

本机探针约26GiB可用RAM、14GiB提交余量和16GiB空闲显存，不足现有准入；没有降低保护、关闭别的程序、修改分页文件或加载GPU模型。当前只接自带ESP向量，新268KB局部层向量没有下载／采用，两者尚未在IQ3_XXS做真实中文图文及15s复杂动作／多镜头质量对照，不能说已证明去拒答效果或无能力／速度损失。后续资源充足时需做同素材／采样／预算A/B，并记录首token、生成及总耗时、MTP、完整性、忠实性和资源峰值。
