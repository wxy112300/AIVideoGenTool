// P0 service-layer probe: app-owned runtime, isolated Run/output, at most two samples.
// This does not prove renderer submission or History publication.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { connectApp, parseAppHarnessArgs } from "../app-harness.mjs";
import { submitContinuumGroup, waitForContinuumGroup } from "../../dist/electron/electron/services/long-video-continuum.js";
import { commitContinuumGroupCheckpoint } from "../../dist/electron/electron/services/long-video-checkpoint-store.js";
import { uploadInput } from "../../dist/electron/electron/services/comfy-ui.js";
import { miniMaxH3ModelAssetNames } from "../../dist/electron/src/core/workflow.js";
import { h3Fl2vaVideoVae } from "../../dist/electron/src/core/catalog/models/minimax_h3_shared.js";

if (process.argv.includes("--help")) {
  console.log("probe-continuum-groups.mjs <create-smoke-fixture> --port <CDP-port> [--partial-prefix]\nRequires an app-owned ready runtime, isolated data/custom_nodes and empty queue/History. Each invocation permits two samples only. Default completes a 2x5s Run; --partial-prefix commits 2/3 and verifies current-group projection. Exclusive report files refuse an uncertain rerun. This is service-layer evidence, not UI/History acceptance. Clean up with close-fixture-smoke.mjs.");
  process.exit(0);
}
const directory = path.resolve(process.argv[2] || ".");
const partialPrefix = process.argv.includes("--partial-prefix");
const options = parseAppHarnessArgs(["inspect", ...process.argv.slice(3).filter(arg => arg !== "--partial-prefix")]);
const reportPath = path.join(directory, partialPrefix ? "continuum-groups-partial.json" : "continuum-groups.json");
const report = { ok: false, layer: "application-service", uiSubmissionVerified: false, historyVerified: false, samplesSubmitted: 0, groups: [] };
let client;
let reserved = false;
try {
  assert.match(path.relative(path.resolve("temp"), directory), /^create-smoke-[^\\/]+$/);
  // Never resubmit on timeout or rerun a fixture with an uncertain previous attempt.
  await fs.writeFile(reportPath, JSON.stringify(report), { flag: "wx" });
  reserved = true;
  client = await connectApp(options);
  const snapshot = await client.evaluate("Promise.all([window.studio.getState(),window.studio.getComfyRuntimeState()]).then(([state,runtime])=>({state,runtime}))");
  const { state, runtime } = snapshot;
  assert.equal(state.queueRunning, false); assert.equal(state.queue.length, 0); assert.equal(state.history.length, 0);
  assert.equal(runtime.phase, "ready"); assert.equal(runtime.ownership, "app");
  assert.equal(path.resolve(state.settings.outputDirectory), path.join(directory, "video"));
  const dataRoot = path.dirname(path.resolve(state.settings.modelDirectory));
  const relativeData = path.relative(path.resolve("temp"), dataRoot);
  assert.ok(relativeData && !relativeData.startsWith("..") && !path.isAbsolute(relativeData));
  assert.equal((await fs.realpath(dataRoot)).toLowerCase(), dataRoot.toLowerCase());
  const run = promisify(execFile);
  const image = path.join(directory, "first.png");
  await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=lightblue:s=256x256", "-vf", "drawbox=x=80:y=75:w=80:h=100:color=red:t=fill", "-frames:v", "1", image], { windowsHide: true });
  const signal = AbortSignal.timeout(20 * 60 * 1000);
  const firstImage = await uploadInput(state.settings.comfyUrl, image, signal, "P0 first image");
  const assets = miniMaxH3ModelAssetNames("minimax_h3_fl2va");
  assert.ok(assets);
  const profile = { ...assets, videoVae: path.basename(h3Fl2vaVideoVae.expected), width: 256, height: 256,
    seed: 42, steps: 8, sampler: "euler", scheduler: "simple", chunkSeconds: 5, attention: "sage",
    firstImage, lora: { filename: "MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors", strength: 1 },
    prompts: ["A red toy block stands on a flat blue table. The block slowly slides to the right. Static camera. Gentle room tone, no speech or music.",
      "The same red toy block continues sliding to the right, then stops. The same blue table and static camera. Gentle room tone, no speech or music."] };
  const executionId = `p0-${crypto.randomUUID()}`;
  if (partialPrefix) profile.prompts.push("The same red toy block stays still on the blue table. Static camera and gentle room tone. No speech or music.");
  const request = { execution_id: executionId, step_id: "group-1", attempt_id: "attempt-1", project_id: executionId,
    run_name: executionId, planned_chunks: partialPrefix ? 3 : 2, expected_prefix_chunks: 0, expected_parent_revision_id: "" };
  const persist = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  for (let index = 0; index < 2; index++) {
    const submission = await submitContinuumGroup(state.settings, path.resolve("workflows/minimax_h3_continuum_v38_managed_extend_api.json"), request, profile, signal);
    report.samplesSubmitted++;
    report.activePromptId = submission.promptId;
    await persist();
    console.log(JSON.stringify({ event: "submitted", group: index + 1, promptId: submission.promptId }));
    let lastStage = "";
    const result = await waitForContinuumGroup(submission, state.settings, signal, (value, stage) => {
      if (stage !== lastStage) { lastStage = stage; console.log(JSON.stringify({ event: "progress", group: index + 1, value, stage })); }
    });
    const receipt = result.receipt;
    const committed = await commitContinuumGroupCheckpoint(path.join(directory, "group-checkpoints"), request, receipt);
    assert.equal(receipt.accepted_chunks, index + 1);
    assert.equal(receipt.reused_count, index);
    assert.equal(receipt.generated_count, 1);
    assert.equal(receipt.final_output, !partialPrefix && index === 1);
    if (partialPrefix && index === 1) assert.equal(receipt.output_scope, "current_physical_group");
    const videos = result.outputs?.["17"]?.videos || result.outputs?.["17"]?.images;
    assert.ok(Array.isArray(videos) && videos.length === 1);
    const video = path.resolve(directory, videos[0].subfolder || "", videos[0].filename);
    const relativeVideo = path.relative(directory, video);
    assert.ok(relativeVideo && !relativeVideo.startsWith("..") && !path.isAbsolute(relativeVideo));
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", video], { windowsHide: true })).stdout);
    await run("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { windowsHide: true });
    const streams = probe.streams.map(({ codec_type, duration, nb_frames, width, height }) => ({ codec_type, duration, nb_frames, width, height }));
    report.groups.push({ promptId: submission.promptId, receipt, checkpoint: committed.filename, video, streams });
    await persist();
    const picture = streams.find(stream => stream.codec_type === "video");
    const sound = streams.find(stream => stream.codec_type === "audio");
    assert.equal(picture?.width, 256); assert.equal(picture?.height, 256);
    const projected = receipt.output_scope === "current_physical_group";
    const expectedFrames = projected ? receipt.output_groups.reduce((sum, group) => sum + group.net_frames, 0) : (index + 1) * 120;
    assert.ok(Math.abs(Number(picture?.nb_frames) - expectedFrames) <= (projected ? 1 : 0));
    assert.ok(Math.abs(Number(picture?.duration) - expectedFrames / 24) < 0.05);
    assert.ok(Math.abs(Number(sound?.duration) - Number(picture?.duration)) < 0.1);
    delete report.activePromptId;
    await persist();
    request.step_id = "group-2";
    request.expected_prefix_chunks = receipt.accepted_chunks;
    request.expected_parent_revision_id = receipt.revision_id;
  }
  const [first, second] = report.groups;
  assert.equal(first.receipt.chunk_records[0].payload_sha256, second.receipt.chunk_records[0].payload_sha256);
  assert.equal(first.receipt.chunk_records[0].storage_revision_id, second.receipt.chunk_records[0].storage_revision_id);
  report.ok = true;
  await persist();
} catch (error) {
  report.error = error.stack || error.message;
  if (reserved) await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally { client?.close(); }
console.log(JSON.stringify(report, null, 2));
