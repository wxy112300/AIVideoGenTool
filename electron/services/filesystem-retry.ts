import { promises as fs } from "node:fs";

const RETRYABLE_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);

interface RenameRetryOptions {
  attempts?: number;
  retryDelayMs?: number;
  rename?: (source: string, destination: string) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
}

export function retryableRenameError(error: unknown): boolean {
  return error instanceof Error &&
    RETRYABLE_RENAME_ERRORS.has((error as NodeJS.ErrnoException).code ?? "");
}

/** Bounded retry for Windows directory handles; recovery must finish even after cancellation. */
export async function renameWithRetry(
  source: string,
  destination: string,
  options: RenameRetryOptions = {}
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 150);
  const rename = options.rename ?? fs.rename;
  const wait = options.wait ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!retryableRenameError(error) || attempt === attempts) throw error;
      await wait(retryDelayMs * attempt);
    }
  }
}
