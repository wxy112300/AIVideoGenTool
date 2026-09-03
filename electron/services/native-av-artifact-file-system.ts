import { promises as fs } from "node:fs";
import type { NativeAvArtifactFileSystemPort } from "../ports/native-av-artifact-file-system.js";

/** Native implementation with a flush before the atomic rename boundary. */
export const nativeAvArtifactFileSystem: NativeAvArtifactFileSystemPort = {
  async stat(filename) {
    return fs.stat(filename).catch(() => null);
  },

  readFile(filename) {
    return fs.readFile(filename);
  },

  async readFilePrefix(filename, maxBytes) {
    const handle = await fs.open(filename, "r");
    try {
      const buffer = Buffer.alloc(Math.max(0, maxBytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },

  async *readFileStream(filename) {
    const stream = (await import("node:fs")).createReadStream(filename);
    for await (const chunk of stream) {
      yield chunk as Uint8Array;
    }
  },

  readText(filename) {
    return fs.readFile(filename, "utf8");
  },

  async writeFile(filename, data) {
    const handle = await fs.open(filename, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },

  async makeDirectory(directory) {
    await fs.mkdir(directory, { recursive: true });
  },

  copyFile(source, target) {
    return fs.copyFile(source, target);
  },

  rename(source, target) {
    return fs.rename(source, target);
  },

  async remove(filename) {
    await fs.rm(filename, { force: true });
  }
};
