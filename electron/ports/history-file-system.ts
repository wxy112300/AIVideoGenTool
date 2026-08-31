export interface HistoryFileStat {
  readonly size: number;
  readonly mtimeMs: number;
  isFile(): boolean;
}

/**
 * File operations needed by History application services.  Keeping this
 * surface injectable makes deletion and cover-cache behavior testable without
 * importing Electron or coupling the service to node:fs.
 */
export interface HistoryFileSystemPort {
  stat(filename: string): Promise<HistoryFileStat | null>;
  readText(filename: string): Promise<string>;
  writeFile(filename: string, data: string | Uint8Array): Promise<void>;
  makeDirectory(directory: string): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  unlink(filename: string): Promise<void>;
  remove(filename: string): Promise<void>;
}
