import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWrite, confinedFile, digest, type PortableCatalog } from "./nas-catalog.js";

export interface NasCommit {
  schemaVersion: 2; libraryId: string; generation: number; parent: string | null;
  locale: PortableCatalog["locale"]; models: PortableCatalog["models"];
  records: Array<{ id: string; hash: string }>; deleted: string[];
}
export interface NasPointer { schemaVersion: 2; libraryId: string; commit: string }
const hash = /^[a-f0-9]{64}$/;
export function parseNasPointer(raw: string): NasPointer {
  const value = JSON.parse(raw) as NasPointer;
  if (value.schemaVersion !== 2 || !/^[a-f0-9-]{36}$/.test(value.libraryId) || !hash.test(value.commit)) throw new Error("Invalid NAS commit pointer");
  return value;
}
export function parseNasCommit(raw: string, pointer: NasPointer): NasCommit {
  if (digest(raw) !== pointer.commit) throw new Error("NAS commit checksum mismatch");
  const value = JSON.parse(raw) as NasCommit;
  if (value.schemaVersion !== 2 || value.libraryId !== pointer.libraryId || !Number.isSafeInteger(value.generation) || value.generation < 1 ||
      !["zh-CN", "zh-TW", "en-US"].includes(value.locale) || !Array.isArray(value.models) || !Array.isArray(value.records) || value.records.length > 100_000 || !Array.isArray(value.deleted) ||
      (value.parent !== null && !hash.test(value.parent))) throw new Error("Invalid NAS commit manifest");
  const ids = new Set<string>();
  for (const ref of value.records) {
    if (!ref || typeof ref.id !== "string" || !ref.id || ids.has(ref.id) || !hash.test(ref.hash)) throw new Error("Invalid NAS record reference");
    ids.add(ref.id);
  }
  if (!value.deleted.every(id => typeof id === "string" && !ids.has(id))) throw new Error("Invalid NAS deletion marker");
  return value;
}
export async function readNasObject(root: string, kind: "commits" | "records" | "texts", address: string): Promise<string> {
  if (!hash.test(address)) throw new Error("Invalid NAS content address");
  const filename = await confinedFile(root, `${kind}/${address}.json`);
  const size = (await fs.stat(filename)).size;
  if (size > 64 * 1024 * 1024) throw new Error("NAS object exceeds 64 MiB");
  const raw = await fs.readFile(filename, "utf8");
  if (digest(raw) !== address) throw new Error("NAS object checksum mismatch");
  return raw;
}
async function put(root: string, kind: string, raw: string): Promise<string> {
  const address = digest(raw), directory = path.join(root, kind);
  await fs.mkdir(directory, { recursive: true });
  if (await fs.realpath(directory) !== directory) throw new Error("NAS object directory must not be redirected");
  const filename = path.join(directory, `${address}.json`);
  let existing: string | undefined;
  try { existing = await fs.readFile(filename, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (existing !== undefined && existing !== raw) throw new Error("Existing published object is damaged; publication stopped");
  if (existing === undefined) await atomicWrite(filename, raw);
  return address;
}

/** Complete immutable objects arrive before a small atomic pointer; Drive may upload in any order. */
export async function publishNasCommit(target: string, catalog: PortableCatalog, libraryId: string, sourceVersions?: Map<string, Set<string>>): Promise<boolean> {
  target = await fs.realpath(target);
  let previousPointer: NasPointer | undefined, previous: NasCommit | undefined;
  try {
    previousPointer = parseNasPointer(await fs.readFile(path.join(target, "current.json"), "utf8"));
    if (previousPointer.libraryId !== libraryId) throw new Error("Publishing destination belongs to another library");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previousPointer) previous = parseNasCommit(await readNasObject(target, "commits", previousPointer.commit), previousPointer);
  const records: NasCommit["records"] = [];
  for (const asset of catalog.assets) {
    const versions = [];
    for (const version of asset.versions) {
      const promptRef = await put(target, "texts", JSON.stringify(version.prompt));
      versions.push({ ...version, prompt: "", promptRef });
    }
    const old = previous?.records.find(ref => ref.id === asset.id);
    if (old && sourceVersions?.has(asset.id)) {
      const oldAsset = JSON.parse(await readNasObject(target, "records", old.hash));
      for (const version of oldAsset.versions) if (!versions.some(item => item.id === version.id) && sourceVersions.get(asset.id)!.has(version.id)) versions.push(version);
    }
    records.push({ id: asset.id, hash: await put(target, "records", JSON.stringify({ ...asset, versions })) });
  }
  // A temporary missing/locked media file is not a user deletion.
  for (const ref of previous?.records ?? []) if (!records.some(item => item.id === ref.id) && sourceVersions?.has(ref.id)) records.push(ref);
  records.sort((a, b) => a.id.localeCompare(b.id));
  const retainedModels = previous?.models.filter(model => !catalog.models.some(item => item.id === model.id)) ?? [];
  const models = [...catalog.models, ...retainedModels].sort((a, b) => a.id.localeCompare(b.id));
  if (previous && JSON.stringify(previous.records) === JSON.stringify(records) && previous.locale === catalog.locale && JSON.stringify(previous.models) === JSON.stringify(models)) return false;
  const ids = new Set(records.map(record => record.id));
  const commit: NasCommit = { schemaVersion: 2, libraryId, generation: (previous?.generation ?? 0) + 1, parent: previousPointer?.commit ?? null,
    locale: catalog.locale, models, records, deleted: previous?.records.filter(ref => !ids.has(ref.id)).map(ref => ref.id) ?? [] };
  const address = await put(target, "commits", JSON.stringify(commit));
  await atomicWrite(path.join(target, "current.json"), JSON.stringify({ schemaVersion: 2, libraryId, commit: address } satisfies NasPointer));
  return true;
}
