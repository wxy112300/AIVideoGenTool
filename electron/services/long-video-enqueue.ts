import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Draft } from "../../src/types.js";
import type { QueueEnqueueServiceDependencies } from "../queue-enqueue.js";
import { extensionTaskFromDraft } from "../../src/core/queue-task-factory.js";
import { activateCreationDraft } from "../../src/core/creation-drafts.js";
import { longVideoBlockReason, longVideoDependencyBlockReason } from "../../src/core/long-video/capability.js";
import { longVideoProfileIdentity, longVideoRunSourceForVersion } from "../../src/core/long-video/run-source.js";
import { verifyLongVideoRunSource } from "./long-video-run-source.js";
import { getCachedEnvironmentScan } from "./environment.js";

/** Group Extend stays separate from legacy AV/managed bootstrap and tail extraction. */
export async function enqueueLongVideoExtension(deps: QueueEnqueueServiceDependencies, draft: Draft) {
  const current = deps.store.get(), requested = draft.longVideoRunSource;
  const reason = longVideoBlockReason(draft, current.settings);
  if (reason || !requested) throw new Error(reason ?? "Missing group Run source");
  const asset = current.history.find(asset => asset.id === requested.sourceAssetId);
  const version = asset?.versions.find(version => version.id === requested.sourceVersionId);
  if (!asset || !version) throw new Error("Group Run source History version no longer exists");
  const source = longVideoRunSourceForVersion(asset.id, version);
  if (requested.receipt.revision_id !== source.receipt.revision_id || requested.receipt.contract_sha256 !== source.receipt.contract_sha256 ||
      longVideoProfileIdentity(requested.profile) !== longVideoProfileIdentity(source.profile) || JSON.stringify(requested.profile.prompts) !== JSON.stringify(source.profile.prompts)) {
    throw new Error("Group Run source changed since selection; reopen the source version");
  }
  const filename = version.files.find(file => /\.(mp4|mov|mkv|webm)$/iu.test(file.filename))?.absolutePath;
  if (!filename || !(await fs.stat(filename).catch(() => null))?.isFile() || path.resolve(filename).toLowerCase() !== path.resolve(draft.sourceVideoPath).toLowerCase()) {
    throw new Error("Group Run source preview is missing or belongs to another version");
  }
  const dependencies = longVideoDependencyBlockReason((deps.getCachedEnvironmentScanForQueue ?? getCachedEnvironmentScan)(current.settings), current.settings);
  if (dependencies) throw new Error(dependencies);
  const outputRoot = await deps.resolveTaskOutputDirectory();
  await verifyLongVideoRunSource(outputRoot, source, new AbortController().signal);
  const prepared = { ...draft, longVideoRunSource: source };
  const task = extensionTaskFromDraft(prepared, current);
  task.workflowPath = fileURLToPath(new URL("../../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url));
  task.longVideoRoot = path.join(outputRoot, ".lvs-long-video");
  const next = await deps.store.update(state => {
    if (!state.history.find(asset => asset.id === source.sourceAssetId)?.versions.some(version => version.id === source.sourceVersionId)) throw new Error("Group Run source was removed during enqueue");
    state.queue.push(task); activateCreationDraft(state, prepared);
  });
  deps.logger.info("queue", "task-enqueued", "Group Run extension added to queue", { taskId: task.id, taskType: task.taskType, modelId: task.modelId });
  deps.sendState(next);
  return next;
}
