import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { UiLocale } from "../types.js";

export interface PortableFile { path: string; size: number }
export interface PortableVersion {
  id: string; createdAt: string; width: number; height: number; duration: number;
  media: PortableFile; cover?: PortableFile; prompt: string; promptRef?: string;
}
export interface PortableAsset {
  id: string; title: string; createdAt: string; updatedAt: string; modelId: string;
  tags: string[]; duration: number; defaultVersionId?: string; versions: PortableVersion[];
}
export interface PortableCatalog {
  schemaVersion: 1; locale: UiLocale; models: Array<{ id: string; name: string }>; assets: PortableAsset[];
}
export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

/** Portable paths have one meaning on both Windows and Linux; never accept drive letters or traversal. */
export function portablePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\:\u0000-\u001f]/.test(value) ||
      value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid relative library path");
  return value;
}

export async function confinedFile(root: string, relative: string): Promise<string> {
  const target = await fs.realpath(path.join(root, portablePath(relative)));
  const suffix = path.relative(root, target);
  if (!suffix || suffix === ".." || suffix.startsWith(`..${path.sep}`) || path.isAbsolute(suffix)) throw new Error("File outside library root");
  return target;
}

export async function atomicWrite(filename: string, bytes: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.partial`;
  try {
    const handle = await fs.open(temporary, "wx");
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    if (!Buffer.from(await fs.readFile(temporary)).equals(Buffer.from(bytes))) throw new Error("Published file read-back mismatch");
    await fs.rename(temporary, filename);
  }
  finally { await fs.rm(temporary, { force: true }); }
}

const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string" && v.length <= 1_000_000;
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const file = (v: unknown): boolean => object(v) && Number.isSafeInteger(v.size) && Number(v.size) > 0 && Boolean(portablePath(v.path));

/** Reject incompatible/partially synced catalogs as a unit; callers retain the last good snapshot. */
export function parseCatalog(raw: string): PortableCatalog {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.schemaVersion !== 1 || !["zh-CN", "zh-TW", "en-US"].includes(String(value.locale)) ||
      !Array.isArray(value.models) || !Array.isArray(value.assets) || value.assets.length > 100_000 ||
      !value.models.every((m) => object(m) && string(m.id) && string(m.name))) throw new Error("Invalid library catalog header");
  const ids = new Set<string>();
  for (const a of value.assets) {
    if (!object(a) || !string(a.id) || !a.id || ids.has(a.id) || !string(a.title) || !string(a.createdAt) || !string(a.updatedAt) ||
        !string(a.modelId) || !number(a.duration) || !Array.isArray(a.tags) || !a.tags.every(string) ||
        (a.defaultVersionId !== undefined && !string(a.defaultVersionId)) || !Array.isArray(a.versions) || !a.versions.length) throw new Error("Invalid catalog asset");
    ids.add(a.id);
    const versions = new Set<string>();
    for (const v of a.versions) {
      if (!object(v) || !string(v.id) || !v.id || versions.has(v.id) || !string(v.createdAt) ||
          !number(v.width) || !number(v.height) || !number(v.duration) || !string(v.prompt) || !file(v.media) ||
          (v.cover !== undefined && !file(v.cover))) throw new Error("Invalid catalog version");
      if (v.promptRef !== undefined && (typeof v.promptRef !== "string" || !/^[a-f0-9]{64}$/.test(v.promptRef))) throw new Error("Invalid prompt reference");
      versions.add(v.id);
    }
  }
  return value as unknown as PortableCatalog;
}
