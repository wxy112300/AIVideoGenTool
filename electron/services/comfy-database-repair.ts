import { promises as fs } from "node:fs";
import path from "node:path";

export type ComfyDatabaseFailureKind =
  | "locked"
  | "missing-dependencies"
  | "unavailable-path"
  | "migration"
  | "corrupt"
  | "unknown";

export interface ComfyDatabaseDiagnosis {
  kind: ComfyDatabaseFailureKind;
  databasePath: string;
  explicitDatabasePath: boolean;
  summary: string;
}

export interface ComfyDatabaseBackupEntry {
  sourcePath: string;
  backupPath: string;
}

export function buildComfyDatabaseMigrationScript(
  sourceDirectory: string,
  databasePath: string
): string {
  const databaseUrl = `sqlite:///${databasePath.replaceAll("\\", "/")}`;
  return [
    "import json, sqlite3, sys",
    "from alembic import command",
    "from alembic.config import Config",
    `source_directory = ${JSON.stringify(sourceDirectory)}`,
    `database_path = ${JSON.stringify(databasePath)}`,
    `database_url = ${JSON.stringify(databaseUrl)}`,
    "sys.path.insert(0, source_directory)",
    "config = Config(source_directory + '/alembic.ini')",
    "config.set_main_option('script_location', source_directory.replace('\\\\', '/') + '/alembic_db')",
    "config.set_main_option('sqlalchemy.url', database_url)",
    "command.upgrade(config, 'head')",
    "connection = sqlite3.connect(database_path)",
    "quick_check = connection.execute('PRAGMA quick_check').fetchone()[0]",
    "revision = connection.execute('SELECT version_num FROM alembic_version').fetchone()[0]",
    "connection.close()",
    "assert quick_check == 'ok', quick_check",
    "print(json.dumps({'quickCheck': quick_check, 'revision': revision, 'databasePath': database_path}))"
  ].join("\n");
}

const databaseFailurePattern = /Failed to initialize database|Could not acquire lock on database|unable to open database file|Can't locate revision identified by|No such index:|database disk image is malformed|database is locked|attempt to write a readonly database|disk I\/O error/iu;

function windowsPathFromSqliteUrl(value: string): string {
  const normalized = value.trim().replace(/^\/+([A-Za-z]:\/)/u, "$1");
  return normalized.replaceAll("/", path.sep);
}

export function extractComfyDatabasePath(logContent: string): string {
  const quoted = logContent.match(/(?:database|database file)\s+['"]([^'"\r\n]+?\.db)['"]/iu)?.[1];
  if (quoted) return windowsPathFromSqliteUrl(quoted);
  const url = logContent.match(/sqlite:\/\/\/([^\s'"\r\n]+?\.db)(?:\s|['"]|$)/iu)?.[1];
  return url ? windowsPathFromSqliteUrl(url) : "";
}

export function diagnoseComfyDatabaseFailure(
  logContent: string,
  fallbackDatabasePath = ""
): ComfyDatabaseDiagnosis | null {
  if (!databaseFailurePattern.test(logContent)) return null;
  const failureIndex = Math.max(
    logContent.toLowerCase().lastIndexOf("failed to initialize database"),
    logContent.toLowerCase().lastIndexOf("could not acquire lock on database")
  );
  const evidence = failureIndex >= 0
    ? logContent.slice(Math.max(0, failureIndex - 12_000))
    : logContent;
  const explicitDatabasePath = extractComfyDatabasePath(evidence);
  const databasePath = explicitDatabasePath || fallbackDatabasePath;
  if (/Could not acquire lock on database|database is locked/iu.test(evidence)) {
    return {
      kind: "locked",
      databasePath,
      explicitDatabasePath: Boolean(explicitDatabasePath),
      summary: "数据库正被另一个 ComfyUI 进程占用。"
    };
  }
  if (
    /Error importing dependencies|ModuleNotFoundError/iu.test(evidence) ||
    /No module named\s+['"]?(?:alembic|sqlalchemy|filelock)/iu.test(evidence)
  ) {
    return {
      kind: "missing-dependencies",
      databasePath,
      explicitDatabasePath: Boolean(explicitDatabasePath),
      summary: "当前 ComfyUI Python 缺少数据库初始化依赖。"
    };
  }
  if (/unable to open database file|attempt to write a readonly database|disk I\/O error/iu.test(evidence)) {
    return {
      kind: "unavailable-path",
      databasePath,
      explicitDatabasePath: Boolean(explicitDatabasePath),
      summary: "数据库目录不存在、不可写或存储设备不可用。"
    };
  }
  if (/Can't locate revision identified by|No such index:|Error upgrading database|alembic/iu.test(evidence)) {
    return {
      kind: "migration",
      databasePath,
      explicitDatabasePath: Boolean(explicitDatabasePath),
      summary: "数据库迁移版本与当前 ComfyUI 核心不一致。"
    };
  }
  if (/database disk image is malformed|file is not a database|database corruption/iu.test(evidence)) {
    return {
      kind: "corrupt",
      databasePath,
      explicitDatabasePath: Boolean(explicitDatabasePath),
      summary: "SQLite 数据库文件已损坏。"
    };
  }
  return {
    kind: "unknown",
    databasePath,
    explicitDatabasePath: Boolean(explicitDatabasePath),
    summary: "ComfyUI 数据库初始化失败，需要先进行无损检查。"
  };
}

export function isPathInsideDirectory(filename: string, directory: string): boolean {
  if (!filename || !directory) return false;
  const relative = path.relative(path.resolve(directory), path.resolve(filename));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sqliteDatabaseFamily(databasePath: string): string[] {
  return [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
    `${databasePath}.lock`
  ];
}

export async function probeWritableDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const probe = path.join(directory, `.local-video-studio-db-repair-${process.pid}.tmp`);
  await fs.writeFile(probe, "database repair write probe", { flag: "wx" });
  await fs.unlink(probe);
}

export async function backupSqliteDatabaseFamily(
  databasePath: string,
  timestamp: string
): Promise<ComfyDatabaseBackupEntry[]> {
  const entries: ComfyDatabaseBackupEntry[] = [];
  for (const sourcePath of sqliteDatabaseFamily(databasePath)) {
    const sourceStat = await fs.stat(sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) continue;
    const backupPath = `${sourcePath}.backup-${timestamp}`;
    await fs.copyFile(sourcePath, backupPath);
    const backupStat = await fs.stat(backupPath);
    if (backupStat.size !== sourceStat.size) {
      throw new Error(`数据库备份校验失败：${sourcePath}`);
    }
    entries.push({ sourcePath, backupPath });
  }
  return entries;
}

export async function quarantineSqliteDatabaseFamily(
  databasePath: string,
  timestamp: string
): Promise<string[]> {
  const moved: Array<{ sourcePath: string; targetPath: string }> = [];
  try {
    for (const sourcePath of sqliteDatabaseFamily(databasePath)) {
      const sourceStat = await fs.stat(sourcePath).catch(() => null);
      if (!sourceStat?.isFile()) continue;
      const targetPath = `${sourcePath}.failed-${timestamp}`;
      await fs.rename(sourcePath, targetPath);
      moved.push({ sourcePath, targetPath });
    }
  } catch (error) {
    for (const entry of moved.reverse()) {
      await fs.rename(entry.targetPath, entry.sourcePath).catch(() => undefined);
    }
    throw error;
  }
  return moved.map((entry) => entry.targetPath);
}

export async function restoreSqliteDatabaseBackups(
  entries: readonly ComfyDatabaseBackupEntry[]
): Promise<void> {
  for (const entry of entries) {
    await fs.copyFile(entry.backupPath, entry.sourcePath);
  }
}
