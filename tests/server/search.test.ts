import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { createDb } from "../../src/server/db";
import { deletePage, getByTitle, save } from "../../src/server/pages";
import { search } from "../../src/server/search";

const T0 = 1_000_000;

function makePage(db: Database, title: string, body: string[], now = T0): string {
  const page = getByTitle(db, title, now);
  save(db, page.id, { title, lines: [title, ...body] }, { now });
  return page.id;
}

describe("search", () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  test("空クエリ・空白のみは何も返さない", () => {
    makePage(db, "Page", ["something"]);
    expect(search(db, "")).toEqual([]);
    expect(search(db, "   ")).toEqual([]);
  });

  describe("3文字境界", () => {
    test("3文字以上は FTS5 で本文にヒットする", () => {
      const id = makePage(db, "Notes", ["bun test の話"]);
      expect(search(db, "test")).toEqual([{ id, title: "Notes" }]);
    });

    test("2文字は LIKE フォールバックで部分一致する", () => {
      const id = makePage(db, "Notes", ["bun のメモ"]);
      // trigram では2文字は索引に無いが LIKE なら当たる
      expect(search(db, "bu")).toEqual([{ id, title: "Notes" }]);
    });

    test("サロゲートペアはコードポイントで数える", () => {
      // "𩸽𩸽" は .length だと 4 だがコードポイントでは 2 文字 → LIKE 側に入る
      const id = makePage(db, "魚", ["𩸽𩸽 を食べた"]);
      expect(search(db, "𩸽𩸽")).toEqual([{ id, title: "魚" }]);
    });
  });

  describe("日本語", () => {
    test("3文字以上の日本語は FTS5 でヒットする", () => {
      const id = makePage(db, "料理メモ", ["カレーの作り方"]);
      expect(search(db, "カレー")).toEqual([{ id, title: "料理メモ" }]);
    });

    test("2文字の日本語は LIKE でタイトル・本文にヒットする", () => {
      const a = makePage(db, "料理", ["下ごしらえ"], T0 + 1000);
      const b = makePage(db, "買い物", ["料理の材料"], T0);
      // 更新日時降順
      expect(search(db, "料理")).toEqual([
        { id: a, title: "料理" },
        { id: b, title: "買い物" },
      ]);
    });
  });

  describe("特殊文字", () => {
    test('" を含むクエリでも FTS5 構文エラーにならず内容にヒットする', () => {
      const id = makePage(db, "Quote", ['say "hello" loudly']);
      expect(search(db, '"hello"')).toEqual([{ id, title: "Quote" }]);
      expect(() => search(db, 'a"b"c')).not.toThrow();
    });

    test("% や _ を含む短いクエリはワイルドカードにならない", () => {
      makePage(db, "A", ["100xyz200"]);
      const withPercent = makePage(db, "B", ["100%達成"]);
      expect(search(db, "0%")).toEqual([{ id: withPercent, title: "B" }]);
      expect(search(db, "0_")).toEqual([]);
    });
  });

  test("削除済みページは FTS5 / LIKE のどちらの経路でも出ない", () => {
    const id = makePage(db, "Secret", ["hidden content ひみつ"]);
    deletePage(db, id, T0 + 1000);
    expect(search(db, "hidden")).toEqual([]); // FTS5 経路
    expect(search(db, "ひ")).toEqual([]); // LIKE 経路
  });

  test("タイトルにも本文にもヒットする(FTS5)", () => {
    const byTitle = makePage(db, "TypeScript", ["メモ"]);
    const byBody = makePage(db, "雑記", ["TypeScript を書いた"]);
    const ids = search(db, "TypeScript").map((r) => r.id);
    expect(ids).toContain(byTitle);
    expect(ids).toContain(byBody);
  });
});
