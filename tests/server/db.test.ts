import { describe, expect, test, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/server/db";

describe("createDb", () => {
  test(":memory: では起動時に migrate() が実行され最新スキーマになる", () => {
    const db = createDb(":memory:");

    const row = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'")
      .get();
    expect(row).not.toBeNull();

    const versions = db.query("SELECT v FROM schema_version").all() as { v: number }[];
    expect(versions.map((r) => r.v)).toEqual([1]);
  });

  describe("ファイルパス指定", () => {
    let dir: string;

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test("親ディレクトリが無ければ作成してから DB ファイルを作る", () => {
      dir = mkdtempSync(join(tmpdir(), "db-test-"));
      const dbPath = join(dir, "nested", "pages.db");

      const db = createDb(dbPath);

      expect(existsSync(dbPath)).toBe(true);
      const row = db
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pages'")
        .get();
      expect(row).not.toBeNull();
    });
  });
});
