import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../src/server/migrate";

// sqlite_sequence (AUTOINCREMENT) や pages_fts の shadow table は
// マイグレーションが直接作った表ではないので比較対象から除く。
function tableNames(db: Database): string[] {
  return (db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
    .map((row) => row.name)
    .filter((name) => !name.startsWith("sqlite_") && !name.startsWith("pages_fts_"))
    .sort();
}

function appliedVersions(db: Database): number[] {
  return (db.query("SELECT v FROM schema_version ORDER BY v").all() as { v: number }[]).map(
    (row) => row.v,
  );
}

describe("migrate", () => {
  test("空 DB に 001_init.sql を適用するとデータモデルの全テーブルができる", () => {
    const db = new Database(":memory:");
    migrate(db);

    expect(tableNames(db)).toEqual(
      ["links", "page_revisions", "pages", "pages_fts", "schema_version"].sort(),
    );
    expect(appliedVersions(db)).toEqual([1]);
  });

  describe("複数マイグレーションでの適用順序", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "migrate-test-"));
      writeFileSync(
        join(dir, "001_init.sql"),
        "CREATE TABLE a (id INTEGER); CREATE TABLE schema_version (v INTEGER NOT NULL);",
      );
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test("空 DB からの全適用", () => {
      writeFileSync(join(dir, "002_add_b.sql"), "CREATE TABLE b (id INTEGER);");

      const db = new Database(":memory:");
      migrate(db, dir);

      expect(tableNames(db)).toEqual(["a", "b", "schema_version"]);
      expect(appliedVersions(db)).toEqual([1, 2]);
    });

    test("途中から再開できる", () => {
      const db = new Database(":memory:");
      migrate(db, dir); // この時点では 001 のみ存在
      expect(appliedVersions(db)).toEqual([1]);

      writeFileSync(join(dir, "002_add_b.sql"), "CREATE TABLE b (id INTEGER);");
      migrate(db, dir); // 002 を追加してから再度呼ぶ

      expect(tableNames(db)).toEqual(["a", "b", "schema_version"]);
      expect(appliedVersions(db)).toEqual([1, 2]);
    });

    test("二重適用しても既存テーブルを壊さずエラーにもならない", () => {
      const db = new Database(":memory:");
      migrate(db, dir);
      migrate(db, dir);
      migrate(db, dir);

      expect(tableNames(db)).toEqual(["a", "schema_version"]);
      expect(appliedVersions(db)).toEqual([1]);
    });
  });
});
