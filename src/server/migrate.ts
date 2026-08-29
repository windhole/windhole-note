import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "migrations");

interface Migration {
  version: number;
  file: string;
}

function hasTable(db: Database, name: string): boolean {
  const row = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== null;
}

function appliedVersions(db: Database): Set<number> {
  if (!hasTable(db, "schema_version")) return new Set();
  const rows = db.query("SELECT v FROM schema_version").all() as { v: number }[];
  return new Set(rows.map((row) => row.v));
}

function pendingMigrations(dir: string, applied: Set<number>): Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ version: Number.parseInt(file.slice(0, 3), 10), file }))
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);
}

// 001_init.sql が schema_version テーブル自体を作るため、適用済み判定は
// テーブルの有無から始める(空 DB では常に「schema_version 無し」)。
export function migrate(db: Database, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): void {
  const applied = appliedVersions(db);
  for (const { version, file } of pendingMigrations(migrationsDir, applied)) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.transaction(() => {
      db.exec(sql);
      db.query("INSERT INTO schema_version (v) VALUES (?)").run(version);
    })();
  }
}
