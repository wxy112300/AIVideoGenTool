import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupSqliteDatabaseFamily,
  buildComfyDatabaseMigrationScript,
  diagnoseComfyDatabaseFailure,
  extractComfyDatabasePath,
  isPathInsideDirectory,
  quarantineSqliteDatabaseFamily,
  restoreSqliteDatabaseBackups
} from "../electron/services/comfy-database-repair";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("ComfyUI database diagnosis", () => {
  it("extracts the exact locked database path and classifies process ownership conflicts", () => {
    const log = [
      "Failed to initialize database.",
      "Could not acquire lock on database 'C:\\Comfy Data\\user\\comfyui.db'.",
      "Another ComfyUI process may already be using it."
    ].join("\n");

    expect(extractComfyDatabasePath(log)).toBe("C:\\Comfy Data\\user\\comfyui.db");
    expect(diagnoseComfyDatabaseFailure(log)).toMatchObject({
      kind: "locked",
      databasePath: "C:\\Comfy Data\\user\\comfyui.db",
      explicitDatabasePath: true
    });
  });

  it("keeps dependency, path, migration, and corruption failures distinct", () => {
    expect(diagnoseComfyDatabaseFailure(
      "Failed to initialize database: ModuleNotFoundError: No module named 'alembic'",
      "C:\\Comfy\\user\\comfyui.db"
    )?.kind).toBe("missing-dependencies");
    expect(diagnoseComfyDatabaseFailure(
      "Failed to initialize database: (sqlite3.OperationalError) unable to open database file",
      "C:\\Comfy\\user\\comfyui.db"
    )?.kind).toBe("unavailable-path");
    expect(diagnoseComfyDatabaseFailure(
      "Error upgrading database: ValueError: No such index: 'ix_tags_tag_type'\nFailed to initialize database",
      "C:\\Comfy\\user\\comfyui.db"
    )?.kind).toBe("migration");
    expect(diagnoseComfyDatabaseFailure(
      "Failed to initialize database: database disk image is malformed",
      "C:\\Comfy\\user\\comfyui.db"
    )?.kind).toBe("corrupt");
  });

  it("rejects paths outside the selected data directory", () => {
    expect(isPathInsideDirectory(
      "C:\\Selected\\user\\comfyui.db",
      "C:\\Selected\\user"
    )).toBe(true);
    expect(isPathInsideDirectory(
      "D:\\Other\\comfyui.db",
      "C:\\Selected\\user"
    )).toBe(false);
  });

  it("builds a migration check that imports ComfyUI from the selected source", () => {
    const script = buildComfyDatabaseMigrationScript(
      "C:\\Selected ComfyUI\\ComfyUI",
      "C:\\Selected Data\\user\\comfyui.db"
    );

    expect(script).toContain("sys.path.insert(0, source_directory)");
    expect(script).toContain("command.upgrade(config, 'head')");
    expect(script).toContain("PRAGMA quick_check");
    expect(script).toContain("C:\\\\Selected Data\\\\user\\\\comfyui.db");
  });
});

describe("ComfyUI database backup transaction", () => {
  it("copies every SQLite sidecar before quarantine and can restore the originals", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-db-repair-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "comfyui.db");
    await fs.writeFile(databasePath, "database");
    await fs.writeFile(`${databasePath}-wal`, "wal");
    await fs.writeFile(`${databasePath}.lock`, "lock");

    const backups = await backupSqliteDatabaseFamily(databasePath, "2026-08-21");
    expect(backups).toHaveLength(3);
    expect(await fs.readFile(backups[0].backupPath, "utf8")).toBe("database");
    expect(await fs.readFile(databasePath, "utf8")).toBe("database");

    const quarantined = await quarantineSqliteDatabaseFamily(databasePath, "2026-08-21");
    expect(quarantined).toHaveLength(3);
    await expect(fs.stat(databasePath)).rejects.toThrow();

    await restoreSqliteDatabaseBackups(backups);
    expect(await fs.readFile(databasePath, "utf8")).toBe("database");
    expect(await fs.readFile(`${databasePath}-wal`, "utf8")).toBe("wal");
    expect(await fs.readFile(`${databasePath}.lock`, "utf8")).toBe("lock");
  });
});
