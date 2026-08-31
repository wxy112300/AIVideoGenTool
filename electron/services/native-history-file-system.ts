import { promises as fs } from "node:fs";
import type { HistoryFileSystemPort } from "../ports/history-file-system.js";

export const nativeHistoryFileSystem: HistoryFileSystemPort = {
  async stat(filename) {
    return fs.stat(filename).catch(() => null);
  },

  readText(filename) {
    return fs.readFile(filename, "utf8");
  },

  async writeFile(filename, data) {
    await fs.writeFile(filename, data);
  },

  async makeDirectory(directory) {
    await fs.mkdir(directory, { recursive: true });
  },

  async rename(source, target) {
    await fs.rename(source, target);
  },

  async unlink(filename) {
    await fs.unlink(filename);
  },

  async remove(filename) {
    await fs.rm(filename, { force: true });
  }
};
