import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { connectApp, parseAppHarnessArgs, pollUntil, runAppAction } from "../app-harness.mjs";

const checkContinue = process.argv.includes("--continue-source");
const options = parseAppHarnessArgs(["wait-task", ...process.argv.slice(2).filter(arg => arg !== "--continue-source")]);
if (options.help) {
  console.log("node scripts/harness/verify-video-smoke.mjs --port <port> --task <id> [--continue-source] [--output report.json]\nChecks durable output, real History playback/return and metadata accuracy. --continue-source also clicks Continue and verifies the new draft's source duration/trim; use an isolated draft. Uses CDP focus emulation for background windows. Does not generate or close the app.");
  process.exit(0);
}
let client;
const report = { ok: false, evidence: "real-history-playback", taskId: options.task, focusEmulation: true };
try {
  client = await connectApp(options);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const completion = await runAppAction(client, options);
  assert.equal(completion.outputs.length, 1, "Expected one video version for this smoke");
  const { assetId, versionId } = completion.outputs[0];
  const metadata = await client.evaluate(`window.studio.getState().then(s => {
    const v = s.history.find(a => a.id === ${JSON.stringify(assetId)})?.versions.find(v => v.id === ${JSON.stringify(versionId)});
    if (!v) throw new Error('Expected video History version');
    return { duration: v.duration, fps: v.fps, width: v.width, height: v.height };
  })`);
  await client.evaluate("document.querySelector('button[data-page=history]').click()");
  const card = `[data-open-history="${assetId}"]`;
  await pollUntil(() => client.evaluate(`!!document.querySelector(${JSON.stringify(card)})`),
    Boolean, options.timeout, "History card");
  await client.evaluate(`document.querySelector(${JSON.stringify(card)}).click()`);
  await pollUntil(() => client.evaluate(`(() => {
    const v = document.querySelector('.history-player video');
    return v?.dataset.historyVersion === ${JSON.stringify(versionId)} && v.readyState >= 2 &&
      !!document.querySelector('media-play-button[role=button]');
  })()`), Boolean, options.timeout, "History player mount/decode");
  if (!await client.evaluate("document.querySelector('.history-player video').paused")) {
    await client.evaluate("document.querySelector('media-play-button').click()");
  }
  await pollUntil(() => client.evaluate("document.querySelector('.history-player video').paused"),
    Boolean, options.timeout, "Pause before playback check");
  const before = await client.evaluate("document.querySelector('.history-player video').getVideoPlaybackQuality().totalVideoFrames");
  await client.evaluate("document.querySelector('media-play-button').click()");
  report.playback = await pollUntil(() => client.evaluate(`(() => {
    const v = document.querySelector('.history-player video');
    return { assetId: v.dataset.historyAsset, versionId: v.dataset.historyVersion,
      time: v.currentTime, duration: v.duration, paused: v.paused, width: v.videoWidth, height: v.videoHeight,
      frames: v.getVideoPlaybackQuality().totalVideoFrames, error: v.error?.message };
  })()`), v => !v.error && !v.paused && v.frames > before, options.timeout, "Decoded frames advance");
  await client.evaluate("document.querySelector('media-play-button').click()");
  report.playbackVerified = true;
  report.metadata = metadata;
  await client.evaluate("document.querySelector('.history-detail-back-button').click()");
  await pollUntil(() => client.evaluate(`!!document.querySelector(${JSON.stringify(card)})`),
    Boolean, options.timeout, "Return to matching History card");
  report.returnReachable = true;
  assert.equal(metadata.width, report.playback.width, "History width differs from media");
  assert.equal(metadata.height, report.playback.height, "History height differs from media");
  assert.ok(Math.abs(metadata.duration - report.playback.duration) <= 1 / metadata.fps,
    `History duration ${metadata.duration}s differs from decoded media ${report.playback.duration}s (more than one frame)`);
  if (checkContinue) {
    await client.evaluate(`document.querySelector(${JSON.stringify(card)}).click()`);
    await pollUntil(() => client.evaluate("document.querySelector('.history-player video')?.readyState >= 2 && !!document.querySelector('media-play-button[role=button]') && !!document.querySelector('[data-continue-history]')"),
      Boolean, options.timeout, "History Continue binding");
    await client.evaluate("document.querySelector('[data-continue-history]').click()");
    report.continueSource = await pollUntil(() => client.evaluate(`window.studio.getState().then(s => {
      const d = s.draft, v = document.querySelector('#source-video');
      return { assetId: d.sourceAssetId, versionId: d.sourceVersionId, duration: d.sourceVideoDuration,
        trimStart: d.trimStartSeconds, trimEnd: d.trimEndSeconds, mediaDuration: v?.duration,
        ready: v?.readyState >= 1 };
    })`), value => value.ready && value.assetId === assetId && value.versionId === versionId &&
      Math.abs(value.duration - value.mediaDuration) <= 1 / metadata.fps &&
      Math.abs(value.trimEnd - value.mediaDuration) <= 1 / metadata.fps,
    options.timeout, "Continue draft receives decoded source duration and full trim");
    assert.equal(report.continueSource.trimStart, 0);
    assert.ok(Math.abs(report.continueSource.duration - report.playback.duration) <= 1 / metadata.fps);
    report.continueVerified = true;
  }
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  client?.close();
}
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
