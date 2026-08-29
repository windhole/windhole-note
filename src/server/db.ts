import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate";

const DEFAULT_DB_PATH = "data/pages.db";

// server.ts が起動時に一度だけ呼ぶ想定。テストは createDb(":memory:") を使う。
export function createDb(path: string = DEFAULT_DB_PATH): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  migrate(db);
  return db;
}
