// Opt-in GPU fixture. Empty state by default; Motion copies one prior smoke video.
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultStudioStatePath } from "../local-runtime-harness.mjs";
import { copyAssetFixture } from "./copy-asset-fixture.mjs";
import { copyVersionFixture } from "./copy-version-fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function freePort(host, port = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port, exclusive: true }, resolve);
  });
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Version deletion fixtures: --version-source-state <prior-smoke-state.json> adds two physical videos and a stopped waiting reference; --shared-version-source-state uses one shared video and an empty queue. Versions are synthetic; no Upscale generation is performed.");
    console.log("Build first. node scripts/harness/launch-create-smoke.mjs [settings-state.json]\nOr --motion-source-state <prior-smoke-dir>/user-data/studio-state.json to copy one test MP4 for Motion Context.\nOr --asset-source-state <prior-smoke-dir>/user-data/studio-state.json to copy one video, canonical AV and draft references for migration.\nOr --resume <prior-smoke-dir> to reopen its saved queue/drafts/history without rewriting state.\nLaunches isolated Electron; may start configured local ComfyUI. Does not enqueue. Use close-fixture-smoke.mjs to stop the owned runtime via AppApi before CDP close; verify PIDs/ports and retain the directory. JS close is not native exit evidence.");
    return;
  }
  const motion = process.argv[2] === "--motion-source-state";
  const versions = ["--version-source-state", "--shared-version-source-state"].includes(process.argv[2]);
  const sharedVersions = process.argv[2] === "--shared-version-source-state";
  const assets = process.argv[2] === "--asset-source-state" || versions;
  const resume = process.argv[2] === "--resume";
  if (process.argv.length > (motion || assets || resume ? 4 : 3) || ((motion || assets || resume) && !process.argv[3])) {
    throw new Error("Use [settings-state.json], --motion-source-state, --asset-source-state, --version-source-state or --shared-version-source-state <smoke-state.json>, or --resume <prior-smoke-dir>");
  }
  let prior;
  const resumeDirectory = resume ? path.resolve(process.argv[3]) : undefined;
  if (resume) {
    const relative = path.relative(path.join(root, "temp"), resumeDirectory);
    if (!/^create-smoke-[^\\/]+$/.test(relative)) throw new Error("Resume only accepts this repository's temp/create-smoke-* fixtures");
    prior = JSON.parse(await fs.readFile(path.join(resumeDirectory, "launch.json"), "utf8"));
    if (prior.evidence !== "fixture-launched-only" || path.resolve(prior.directory).toLowerCase() !== resumeDirectory.toLowerCase()) {
      throw new Error("Resume requires a matching isolated smoke launch manifest");
    }
    try {
      process.kill(prior.pid, 0);
      throw new Error("Prior Electron PID is still alive; close the owned fixture before resuming");
    } catch (error) { if (error.code !== "ESRCH") throw error; }
    await freePort("127.0.0.1", prior.port);
  }
  const sourcePath = resume ? path.join(resumeDirectory, "user-data", "studio-state.json")
    : (motion || assets ? process.argv[3] : process.argv[2]) || defaultStudioStatePath();
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  if (resume && source.queueRunning) throw new Error("Resume requires a stopped saved queue; inspect the fixture before running GPU work");
  if (motion && (source.history?.length !== 1 || source.history[0].versions?.length !== 1)) {
    throw new Error("Motion fixture requires exactly one prior smoke video/version; never pass a real asset library");
  }
  if (motion || assets) {
    const sourcePath = path.resolve(process.argv[3]);
    const sourceRun = path.dirname(path.dirname(sourcePath));
    const manifest = JSON.parse(await fs.readFile(path.join(sourceRun, "launch.json"), "utf8"));
    if (path.basename(sourcePath) !== "studio-state.json" || path.basename(path.dirname(sourcePath)) !== "user-data" ||
      manifest.evidence !== "fixture-launched-only" || path.resolve(manifest.directory).toLowerCase() !== sourceRun.toLowerCase()) {
      throw new Error("Source must belong to a prior isolated smoke launch");
    }
  }
  if (!source.settings) throw new Error("Settings source has no settings");
  const endpoint = new URL(source.settings.comfyUrl);
  if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("This fixture requires an owned local HTTP ComfyUI endpoint");
  }
  // Startup can take over the configured listener. Refuse a busy endpoint first.
  const host = endpoint.hostname === "[::1]" ? "::1" : "127.0.0.1";
  await freePort(host, Number(endpoint.port || 80));
  if (endpoint.hostname === "localhost") await freePort("::1", Number(endpoint.port || 80));
  const { createDefaultState } = await import("../../dist/electron/src/core/defaults.js");
  await fs.mkdir(path.join(root, "temp"), { recursive: true });
  const directory = resumeDirectory || await fs.mkdtemp(path.join(root, "temp", "create-smoke-"));
  const userData = path.join(directory, "user-data");
  const environment = { ...process.env };
  for (const [key, name] of [["APPDATA", "appdata"], ["LOCALAPPDATA", "localappdata"], ["TEMP", "tmp"]]) {
    environment[key] = path.join(directory, name);
    await fs.mkdir(environment[key], { recursive: true });
  }
  environment.TMP = environment.TEMP;
  delete environment.VITE_DEV_SERVER_URL;
  delete environment.ELECTRON_RUN_AS_NODE;
  await fs.mkdir(userData, { recursive: true });
  if (!resume) {
    const state = createDefaultState();
    state.settings = { ...state.settings, ...source.settings,
      outputDirectory: path.join(directory, "video"), imageOutputDirectory: path.join(directory, "image"),
      imageInputLibraryDirectory: path.join(directory, "inputs"), autoRetryFailedTasks: false };
    state.draft.duration = 1;
    state.draft.ratio = "16:9";
    state.draft.seed = 42;
    state.draft.promptVersions[0].text = "";
    state.imageToVideoDraft = structuredClone(state.draft);
    if (motion) {
      // Copy only the test MP4. Deliberately omit AV/latent to test the pixel fallback.
      const original = source.history[0];
      const version = original.versions[0];
      const media = version.files.find(file => /\.mp4$/i.test(file.filename));
      if (!media?.absolutePath) throw new Error("Source smoke has no resolved MP4");
      const destination = path.join(directory, "source.mp4");
      await fs.copyFile(media.absolutePath, destination);
      const probe = JSON.parse((await promisify(execFile)("ffprobe", ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration", "-of", "json", destination])).stdout).streams[0];
      if (!(Number(probe.duration) > 0)) throw new Error("Source duration is invalid");
      const file = { filename: "source.mp4", subfolder: "", type: "output", absolutePath: destination };
      const copy = structuredClone(original);
      const copiedVersion = structuredClone(version);
      for (const target of [copy, copiedVersion]) {
        target.files = [file];
        target.comfyOutputs = {};
        target.outputFilename = "source.mp4";
        target.duration = Number(probe.duration);
        for (const key of ["h3AvAsset", "h3ContinuationData", "h3JointAvArtifact", "h3ContextLatentPath", "h3AvAssetId", "h3ContinuumSequence"]) delete target[key];
      }
      copiedVersion.width = probe.width;
      copiedVersion.height = probe.height;
      copy.versions = [copiedVersion];
      state.history = [copy];
      state.settings.defaultExtensionModel = "minimax_h3_ref2va";
    }
    if (assets) {
      const sourceDirectory = path.dirname(path.dirname(path.resolve(sourcePath)));
      if (versions) {
        const { createClearedDraft } = await import("../../dist/electron/src/core/draft-defaults.js");
        const { upscaleTaskFromRequest } = await import("../../dist/electron/src/core/queue-task-factory.js");
        await copyVersionFixture(state, source, sourceDirectory, directory, root, sharedVersions,
          { createClearedDraft, upscaleTaskFromRequest });
      } else await copyAssetFixture(state, source, sourceDirectory, directory, root);
      // Exercise migration's supported root layout; media may live in subfolders.
      state.settings.outputDirectory = directory;
      state.settings.imageOutputDirectory = path.join(directory, "images");
      await fs.mkdir(state.settings.imageOutputDirectory, { recursive: true });
    }
    await fs.writeFile(path.join(userData, "studio-state.json"), JSON.stringify(state, null, 2));
  }
  const port = await freePort("127.0.0.1");
  const log = openSync(path.join(directory, "electron.log"), "a");
  const electron = createRequire(import.meta.url)("electron");
  const child = spawn(electron, ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, root], {
    cwd: root, env: environment, detached: true, windowsHide: true, stdio: ["ignore", log, log]
  });
  closeSync(log);
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  const manifest = { directory, port, pid: child.pid, comfyPort: Number(endpoint.port || 80),
    evidence: "fixture-launched-only", scenario: prior?.scenario || (versions ? (sharedVersions ? "history-version-shared" : "history-version-queue") : assets ? "asset-migration-canonical" : motion ? "motion-context-pixel-source" : "create-t2va"),
    ...(resume ? { resumedFrom: { pid: prior.pid, port: prior.port, startedAt: prior.startedAt } } : {}),
    startedAt: new Date().toISOString() };
  await fs.writeFile(path.join(directory, "launch.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
