import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { createDb } from "../../src/server/db";
import {
  deletePage,
  getByTitle,
  getPage,
  getRevision,
  listPages,
  listRevisions,
  restore,
  save,
} from "../../src/server/pages";

const T0 = 1_000_000;
const MIN = 60 * 1000;

function linkTitles(db: Database, fromId: string): string[] {
  return (
    db.query("SELECT to_title FROM links WHERE from_id = ? ORDER BY to_title").all(fromId) as {
      to_title: string;
    }[]
  ).map((r) => r.to_title);
}

function ftsBody(db: Database, pageId: string): string | null {
  const row = db.query("SELECT body FROM pages_fts WHERE page_id = ?").get(pageId) as {
    body: string;
  } | null;
  return row ? row.body : null;
}

describe("getByTitle", () => {
  let db: Database;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  test("未存在ならタイトルだけの空ページを作って返す", () => {
    const page = getByTitle(db, "新しいページ", T0);
    expect(page.title).toBe("新しいページ");
    expect(page.lines).toEqual(["新しいページ"]);
    expect(page.created).toBe(T0);
    expect(listPages(db)).toHaveLength(1);
  });

  test("既存ページはそのまま返す(重複作成しない)", () => {
    const first = getByTitle(db, "A", T0);
    save(db, first.id, { title: "A", lines: ["A", "本文"] }, { now: T0 });
    const again = getByTitle(db, "A", T0 + MIN);
    expect(again.id).toBe(first.id);
    expect(again.lines).toEqual(["A", "本文"]);
    expect(listPages(db)).toHaveLength(1);
  });

  test("削除済みの同名ページは、内容をリビジョンに退避して空ページとして蘇生する", () => {
    const page = getByTitle(db, "A", T0);
    save(db, page.id, { title: "A", lines: ["A", "消される本文"] }, { now: T0 });
    deletePage(db, page.id, T0 + MIN);

    const revived = getByTitle(db, "A", T0 + 2 * MIN);
    expect(revived.id).toBe(page.id); // 物理削除しないので同じ行を使う
    expect(revived.lines).toEqual(["A"]);
    // 削除前の内容が履歴から辿れる
    const revs = listRevisions(db, page.id);
    expect(getRevision(db, revs[0]!.id)!.lines).toEqual(["A", "消される本文"]);
  });
});

describe("save", () => {
  let db: Database;
  let pageId: string;
  beforeEach(() => {
    db = createDb(":memory:");
    pageId = getByTitle(db, "A", T0).id;
  });

  test("本文・updated・links・fts をまとめて更新する", () => {
    save(db, pageId, { title: "A", lines: ["A", "[B] を見る"] }, { now: T0 + MIN });
    const page = getPage(db, pageId)!;
    expect(page.lines).toEqual(["A", "[B] を見る"]);
    expect(page.updated).toBe(T0 + MIN);
    expect(linkTitles(db, pageId)).toEqual(["B"]);
    expect(ftsBody(db, pageId)).toBe("A\n[B] を見る");
  });

  test("削除済み・未存在ページへの保存は投げる", () => {
    deletePage(db, pageId, T0);
    expect(() => save(db, pageId, { title: "A", lines: ["A"] }, { now: T0 })).toThrow();
    expect(() => save(db, "nope", { title: "X", lines: ["X"] }, { now: T0 })).toThrow();
  });

  test("既存の他ページと同じタイトルへの改名は UNIQUE 制約で投げる", () => {
    getByTitle(db, "B", T0);
    expect(() => save(db, pageId, { title: "B", lines: ["B"] }, { now: T0 })).toThrow();
  });

  describe("リビジョン判定(ADR-0003)", () => {
    test("最初の保存はリビジョンを積む", () => {
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
      expect(listRevisions(db, pageId)).toHaveLength(1);
    });

    test("10分未満の連続保存は積まない", () => {
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
      save(db, pageId, { title: "A", lines: ["A", "v2"] }, { now: T0 + 9 * MIN });
      expect(listRevisions(db, pageId)).toHaveLength(1);
    });

    test("10分経過後の保存は積む", () => {
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
      save(db, pageId, { title: "A", lines: ["A", "v2"] }, { now: T0 + 10 * MIN });
      const revs = listRevisions(db, pageId);
      expect(revs).toHaveLength(2);
      expect(getRevision(db, revs[0]!.id)!.lines).toEqual(["A", "v2"]);
    });

    test("離脱時は10分未満でも積む", () => {
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
      save(db, pageId, { title: "A", lines: ["A", "v2"] }, { now: T0 + MIN, leaving: true });
      expect(listRevisions(db, pageId)).toHaveLength(2);
    });

    test("直前リビジョンと同一内容なら離脱時でも積まない", () => {
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 + MIN, leaving: true });
      save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 + 20 * MIN });
      expect(listRevisions(db, pageId)).toHaveLength(1);
    });
  });

  describe("改名の伝播", () => {
    test("旧タイトルへリンクする他ページの本文が置換され、links も追随する", () => {
      const b = getByTitle(db, "B", T0);
      save(db, b.id, { title: "B", lines: ["B", "[A] 参照", "  [A] と #A"] }, { now: T0 });

      save(db, pageId, { title: "A2", lines: ["A2"] }, { now: T0 + MIN });

      const after = getPage(db, b.id)!;
      // [A] は置換、#A は SPEC の対象外なのでそのまま
      expect(after.lines).toEqual(["B", "[A2] 参照", "  [A2] と #A"]);
      expect(linkTitles(db, b.id)).toEqual(["A", "A2"]);
      // 改名の巻き添えで他ページの updated は動かさない
      expect(after.updated).toBe(T0);
    });

    test("リンクしていないページには触らない", () => {
      const c = getByTitle(db, "C", T0);
      save(db, c.id, { title: "C", lines: ["C", "無関係 [X]"] }, { now: T0 });
      save(db, pageId, { title: "A2", lines: ["A2"] }, { now: T0 + MIN });
      expect(getPage(db, c.id)!.lines).toEqual(["C", "無関係 [X]"]);
    });
  });
});

describe("deletePage / listPages", () => {
  test("論理削除され、一覧と取得から消える", () => {
    const db = createDb(":memory:");
    const page = getByTitle(db, "A", T0);
    deletePage(db, page.id, T0 + MIN);
    expect(listPages(db)).toEqual([]);
    expect(getPage(db, page.id)).toBeNull();
    const raw = db.query("SELECT deleted_at FROM pages WHERE id = ?").get(page.id) as {
      deleted_at: number;
    };
    expect(raw.deleted_at).toBe(T0 + MIN);
  });

  test("一覧は更新日時の降順", () => {
    const db = createDb(":memory:");
    const a = getByTitle(db, "A", T0);
    const b = getByTitle(db, "B", T0 + MIN);
    save(db, a.id, { title: "A", lines: ["A", "後で更新"] }, { now: T0 + 2 * MIN });
    expect(listPages(db).map((p) => p.title)).toEqual(["A", "B"]);
  });
});

describe("listRevisions / restore", () => {
  let db: Database;
  let pageId: string;
  beforeEach(() => {
    db = createDb(":memory:");
    pageId = getByTitle(db, "A", T0).id;
    save(db, pageId, { title: "A", lines: ["A", "v1"] }, { now: T0 });
    save(db, pageId, { title: "A", lines: ["A", "v2", "追記"] }, { now: T0 + 10 * MIN });
  });

  test("listRevisions は新しい順に id・saved_at・行数を返す", () => {
    expect(listRevisions(db, pageId)).toEqual([
      { id: 2, saved_at: T0 + 10 * MIN, line_count: 3 },
      { id: 1, saved_at: T0, line_count: 2 },
    ]);
  });

  test("restore は現在の状態を積んでから上書きする", () => {
    // v2 保存から10分経過 + 内容を進めておく(この状態はまだリビジョンに無い)
    save(db, pageId, { title: "A", lines: ["A", "v3"] }, { now: T0 + 12 * MIN });

    const restored = restore(db, pageId, 1, T0 + 20 * MIN);
    expect(restored.lines).toEqual(["A", "v1"]);
    expect(restored.updated).toBe(T0 + 20 * MIN);

    // 直前の現在状態 (v3) が復元前にリビジョンとして退避されている
    const revs = listRevisions(db, pageId);
    expect(revs).toHaveLength(3);
    expect(getRevision(db, revs[0]!.id)!.lines).toEqual(["A", "v3"]);
  });

  test("他ページのリビジョン id を指定すると投げる", () => {
    const b = getByTitle(db, "B", T0);
    expect(() => restore(db, b.id, 1, T0)).toThrow();
  });
});
