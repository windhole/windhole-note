import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { createDb } from "../../src/server/db";
import { backlinks, extractLinkTitles, rebuildLinks, twoHop } from "../../src/server/links";

function insertPage(db: Database, id: string, title: string, deletedAt: number | null = null) {
  db.query(
    "INSERT INTO pages (id, title, lines, created, updated, deleted_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, title, JSON.stringify([title]), 0, 0, deletedAt);
}

function linkTitles(db: Database, fromId: string): string[] {
  return (
    db.query("SELECT to_title FROM links WHERE from_id = ? ORDER BY to_title").all(fromId) as {
      to_title: string;
    }[]
  ).map((r) => r.to_title);
}

describe("extractLinkTitles", () => {
  test("[リンク] と #タグ を抽出する", () => {
    expect(extractLinkTitles(["タイトル", "[A] と #B を見る"])).toEqual(["A", "B"]);
  });

  test("同じタイトルは重複させず、初出順を保つ", () => {
    expect(extractLinkTitles(["[B] [A] [B]", "#A"])).toEqual(["B", "A"]);
  });

  test("外部リンク・画像・強調はリンクとして数えない", () => {
    expect(
      extractLinkTitles(["[https://example.com] [/files/a.png] [* 強調] [A]"]),
    ).toEqual(["A"]);
  });

  test("コードブロック内の行からは抽出しない", () => {
    const lines = [
      "タイトル",
      "code:ts",
      "  const a = arr[i];",
      "  // [not-a-link] #not-a-tag",
      "ブロックの外 [A]",
    ];
    expect(extractLinkTitles(lines)).toEqual(["A"]);
  });

  test("インデントされたコードブロックは同じ深さの行で終わる", () => {
    const lines = [
      "  code:js",
      "    x[0] = 1;",
      "  同じ深さに戻ったので [A] は抽出される",
    ];
    expect(extractLinkTitles(lines)).toEqual(["A"]);
  });
});

describe("rebuildLinks", () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(":memory:");
    insertPage(db, "p1", "P1");
  });

  test("lines から links 行を作る", () => {
    rebuildLinks(db, "p1", ["P1", "[A] #B"]);
    expect(linkTitles(db, "p1")).toEqual(["A", "B"]);
  });

  test("再実行すると全消し → 再挿入で置き換わる", () => {
    rebuildLinks(db, "p1", ["P1", "[A] [B]"]);
    rebuildLinks(db, "p1", ["P1", "[C]"]);
    expect(linkTitles(db, "p1")).toEqual(["C"]);
  });

  test("他ページの links には触らない", () => {
    insertPage(db, "p2", "P2");
    rebuildLinks(db, "p2", ["P2", "[X]"]);
    rebuildLinks(db, "p1", ["P1", "[A]"]);
    expect(linkTitles(db, "p2")).toEqual(["X"]);
  });
});

describe("backlinks / twoHop", () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(":memory:");
    // A → B → C というリンク構造を作る
    insertPage(db, "a", "A");
    insertPage(db, "b", "B");
    insertPage(db, "c", "C");
    rebuildLinks(db, "a", ["A", "[B]"]);
    rebuildLinks(db, "b", ["B", "[C]"]);
  });

  test("backlinks: B には A からのバックリンクがある", () => {
    expect(backlinks(db, "b")).toEqual([{ id: "a", title: "A" }]);
    expect(backlinks(db, "a")).toEqual([]);
  });

  test("backlinks: 削除済みページからのリンクは出さない", () => {
    db.query("UPDATE pages SET deleted_at = 1 WHERE id = 'a'").run();
    expect(backlinks(db, "b")).toEqual([]);
  });

  test("backlinks: 自分自身へのリンクは出さない", () => {
    rebuildLinks(db, "b", ["B", "[B] [C]"]);
    expect(backlinks(db, "b")).toEqual([{ id: "a", title: "A" }]);
  });

  test("twoHop: A の2ホップ先は C(B 経由)", () => {
    expect(twoHop(db, "a")).toEqual([{ id: "c", title: "C" }]);
  });

  test("twoHop: 自分自身は含めない", () => {
    // A → B → A の往復を作っても A 自身は出ない
    rebuildLinks(db, "b", ["B", "[A]"]);
    expect(twoHop(db, "a")).toEqual([]);
  });

  test("twoHop: 中間ページが削除済みなら辿らない", () => {
    db.query("UPDATE pages SET deleted_at = 1 WHERE id = 'b'").run();
    expect(twoHop(db, "a")).toEqual([]);
  });

  test("twoHop: リンク先タイトルのページが未作成なら出さない", () => {
    // B → C のリンクはあるが C ページ自体を消す(未作成タイトル相当)
    db.query("UPDATE pages SET deleted_at = 1 WHERE id = 'c'").run();
    expect(twoHop(db, "a")).toEqual([]);
  });
});
