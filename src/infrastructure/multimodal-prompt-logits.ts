/** Only the Qwen35 MTMD family can use the native last-logit sampling path.
 * Older/non-MTMD handlers retain their all-logits contract. No MTP is enabled.
 */
const leanLogitsHelper = [
  "def _lvs_vision_logits_all(chat_handler):",
  "    mtmd_cls = _get_mtmd_chat_handler_class()",
  "    return not (",
  "        QWEN35_AVAILABLE",
  "        and mtmd_cls is not None",
  "        and isinstance(chat_handler, Qwen35ChatHandler)",
  "        and isinstance(chat_handler, mtmd_cls)",
  "    )"
].join("\n");

export function multimodalPromptSupportsLeanLogits(source: string): boolean {
  const normalized = source.replace(/\r\n/gu, "\n");
  return normalized.includes(leanLogitsHelper) &&
    (normalized.match(/logits_all=_lvs_vision_logits_all\(self\.chat_handler\)/gu)?.length ?? 0) === 1;
}

export function patchMultimodalPromptLeanLogits(source: string): string {
  if (multimodalPromptSupportsLeanLogits(source)) return source;
  if (source.includes("_lvs_vision_logits_all")) {
    throw new Error("MultiModal Prompt Nodes 的 Qwen logits 适配不完整，已停止修改。");
  }
  const manager = /^class GGUFModelManager:/mu.exec(source);
  const visionLoader = /self\.model = Llama\(\s*model_path=model_path,\s*chat_handler=self\.chat_handler,[\s\S]{0,400}?logits_all=True/gu;
  const loaders = [...source.matchAll(visionLoader)];
  if (!manager || loaders.length !== 1 || loaders[0]!.index! < manager.index) {
    throw new Error("MultiModal Prompt Nodes 源码结构与 Qwen logits 适配不匹配，已停止修改。");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const patched = source.replace(visionLoader, (match) => match.replace(
    "logits_all=True", "logits_all=_lvs_vision_logits_all(self.chat_handler)"
  ));
  const result = patched.slice(0, manager.index) + leanLogitsHelper.replace(/\n/gu, newline) +
    newline + newline + patched.slice(manager.index);
  if (!multimodalPromptSupportsLeanLogits(result)) throw new Error("Qwen logits 适配校验失败，已停止修改。");
  return result;
}
