"""Consistent online SQLite backup, source opened read-only. Never executes provider SQL."""
import pathlib
import sqlite3
import sys

source, target = (pathlib.Path(value).resolve() for value in sys.argv[1:3])
if target.exists():
    raise RuntimeError("Backup already exists")
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=5) as original:
    with sqlite3.connect(target) as backup:
        original.backup(backup)
        if backup.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise RuntimeError("Backup consistency check failed")
