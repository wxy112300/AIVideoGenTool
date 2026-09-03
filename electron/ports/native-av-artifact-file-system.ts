export interface NativeAvArtifactFileStat {
  readonly size: number;
  isFile(): boolean;
}

/**
 * Narrow filesystem port for the H3 joint AV artifact service. It is kept
 * separate from HistoryFileSystemPort because artifact validation reads raw
 * binary payloads while ordinary History services only need text and stats.
 */
export interface NativeAvArtifactFileSystemPort {
  stat(filename: string): Promise<NativeAvArtifactFileStat | null>;
  readFile(filename: string): Promise<Uint8Array>;
  readFilePrefix(filename: string, maxBytes: number): Promise<Uint8Array>;
  readFileStream(filename: string): AsyncIterable<Uint8Array>;
  readText(filename: string): Promise<string>;
  writeFile(filename: string, data: string | Uint8Array): Promise<void>;
  makeDirectory(directory: string): Promise<void>;
  copyFile(source: string, target: string): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  remove(filename: string): Promise<void>;
}
