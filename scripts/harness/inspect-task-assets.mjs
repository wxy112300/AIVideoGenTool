import fs from "node:fs/promises";
import path from "node:path";
import { connectApp, parseAppHarnessArgs } from "../app-harness.mjs";

// Read-only, exact task/version inventory. Does not infer ownership from a suffix.
const options = parseAppHarnessArgs(["wait-task", ...process.argv.slice(2)]);
if (options.help) {
  console.log("inspect-task-assets.mjs --port <port> --task <id> [--output report.json]\nChecks explicit History media/AV/latent paths and reports missing files. No migration, cleanup or deletion.");
  process.exit(0);
}
let client;
const report = { ok: false, taskId: options.task, evidence: "real-app-task-assets", versions: [] };
try {
  client = await connectApp(options);
  const versions = await client.evaluate(`window.studio.getState().then(s => s.history.flatMap(a =>
    a.versions.filter(v => v.taskId === ${JSON.stringify(options.task)} ||
      (!v.taskId && v.kind === 'original' && a.taskId === ${JSON.stringify(options.task)})).map(v => ({
      assetId: a.id, versionId: v.id, sourceAssetId: a.sourceAssetId, sourceVersionId: a.sourceVersionId,
      files: v.files, continuation: v.h3ContinuationData, av: v.h3AvAsset ?? v.h3ContinuationData?.asset, context: v.h3ContextLatentPath
    }))))`);
  if (!versions.length) throw new Error("No matching video task/version in History");
  for (const v of versions) {
    const files = new Map();
    const add = (file, role) => {
      if (!file) return;
      const key = file.absolutePath ? path.resolve(file.absolutePath).toLowerCase() : [file.type, file.subfolder, file.filename].join("/");
      const entry = files.get(key) || { absolutePath: file.absolutePath, filename: file.filename, roles: [] };
      if (!entry.roles.includes(role)) entry.roles.push(role);
      files.set(key, entry);
    };
    v.files.forEach(f => add(f, "media-or-recorded-file"));
    add(v.continuation?.artifact?.payload, "joint-av-payload");
    add(v.continuation?.artifact?.manifest, "joint-av-manifest");
    add(v.av?.ownerPath, "av-owner");
    v.av?.aliasPaths?.forEach(f => add(f, "av-alias"));
    if (v.context) add({ absolutePath: v.context, filename: path.basename(v.context) }, "motion-context");
    if (!files.size) throw new Error("Matching History version has no registered files");
    for (const entry of files.values()) {
      const stat = entry.absolutePath ? await fs.stat(entry.absolutePath).catch(() => null) : null;
      entry.present = Boolean(stat?.isFile() && stat.size > 0);
      entry.sizeBytes = stat?.size ?? 0;
    }
    report.versions.push({ assetId: v.assetId, versionId: v.versionId,
      sourceAssetId: v.sourceAssetId, sourceVersionId: v.sourceVersionId,
      storageKind: v.av?.storageKind, continuationStatus: v.continuation?.status,
      files: [...files.values()] });
  }
  if (report.versions.some(v => v.files.some(f => !f.present))) throw new Error("History references missing, empty or unresolved files");
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { client?.close(); }
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
