import type { Database } from "bun:sqlite";
import { ulid } from "ulid";
import type { Page, Revision } from "../shared/types";
import { rebuildLinks } from "./links";

const REVISION_INTERVAL_MS = 10 * 60 * 1000;

export interface SaveInput {
  title: string;
  lines: string[];
}

export interface SaveOptions {
  // ページ離脱時の保存。10分経っていなくてもリビジョンを積む(ADR-0003)
  leaving?: boolean;
  // テストで時計を注入するため。省略時は実時刻
  now?: number;
}

export interface RevisionMeta {
  id: number;
  saved_at: number;
  line_count: number;
}

interface PageRow {
  id: string;
  title: string;
  lines: string;
  created: number;
  updated: number;
  deleted_at: number | null;
}

interface RevisionRow {
  id: number;
  page_id: string;
  title: string;
  lines: string;
  saved_at: number;
}

function toPage(row: PageRow): Page {
  return { ...row, lines: JSON.parse(row.lines) as string[] };
}

// pages_fts は導出データ。links と同様に保存のたび DELETE → INSERT で作り直す(CLAUDE.md)
function rebuildFts(db: Database, pageId: string, title: string, lines: string[]): void {
  db.query("DELETE FROM pages_fts WHERE page_id = ?").run(pageId);
  db.query("INSERT INTO pages_fts (page_id, title, body) VALUES (?, ?, ?)").run(
    pageId,
    title,
    lines.join("\n"),
  );
}

function latestRevision(db: Database, pageId: string): RevisionRow | null {
  return db
    .query("SELECT * FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 1")
    .get(pageId) as RevisionRow | null;
}

// 同一内容スキップ(ADR-0003)。lines は常に自前で JSON.stringify するので文字列一致で比較できる
function pushRevisionIfChanged(
  db: Database,
  pageId: string,
  title: string,
  linesJson: string,
  savedAt: number,
): void {
  const latest = latestRevision(db, pageId);
  if (latest && latest.title === title && latest.lines === linesJson) return;
  db.query(
    "INSERT INTO page_revisions (page_id, title, lines, saved_at) VALUES (?, ?, ?, ?)",
  ).run(pageId, title, linesJson, savedAt);
}

// 改名時、旧タイトルへリンクしている他ページの本文中 [旧title] を [新title] に置換する(SPEC.md)。
// 対象ページの探索には導出済みの links を使う。updated は変えない(改名の巻き添えで
// 一覧の並びが動かないようにするため)。
function propagateRename(db: Database, oldTitle: string, newTitle: string, excludeId: string): void {
  const target = `[${oldTitle}]`;
  const replacement = `[${newTitle}]`;
  const rows = db
    .query(
      `SELECT DISTINCT p.id, p.title, p.lines
       FROM pages p JOIN links l ON l.from_id = p.id
       WHERE l.to_title = ? AND p.deleted_at IS NULL AND p.id != ?`,
    )
    .all(oldTitle, excludeId) as Pick<PageRow, "id" | "title" | "lines">[];

  for (const row of rows) {
    const lines = (JSON.parse(row.lines) as string[]).map((line) =>
      line.replaceAll(target, replacement),
    );
    db.query("UPDATE pages SET lines = ? WHERE id = ?").run(JSON.stringify(lines), row.id);
    rebuildLinks(db, row.id, lines);
    rebuildFts(db, row.id, row.title, lines);
  }
}

// ページ本体・links・pages_fts をまとめて更新する。save/restore/getByTitle(蘇生)の共通処理
function applyContent(db: Database, pageId: string, title: string, lines: string[], now: number): void {
  db.query("UPDATE pages SET title = ?, lines = ?, updated = ? WHERE id = ?").run(
    title,
    JSON.stringify(lines),
    now,
    pageId,
  );
  rebuildLinks(db, pageId, lines);
  rebuildFts(db, pageId, title, lines);
}

export function listPages(db: Database): Page[] {
  const rows = db
    .query("SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY updated DESC")
    .all() as PageRow[];
  return rows.map(toPage);
}

export function getPage(db: Database, id: string): Page | null {
  const row = db
    .query("SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL")
    .get(id) as PageRow | null;
  return row ? toPage(row) : null;
}

// タイトル解決。未存在なら作成して返す(SPEC.md)。
// 削除済みページが同名でタイトルを占有している場合は、その内容をリビジョンに退避してから
// 空ページとして蘇生する(title は UNIQUE で物理削除もしないため、新規 INSERT はできない)。
export function getByTitle(db: Database, title: string, now: number = Date.now()): Page {
  const active = db
    .query("SELECT * FROM pages WHERE title = ? AND deleted_at IS NULL")
    .get(title) as PageRow | null;
  if (active) return toPage(active);

  const emptyLines = [title];
  const deleted = db
    .query("SELECT * FROM pages WHERE title = ? AND deleted_at IS NOT NULL")
    .get(title) as PageRow | null;

  if (deleted) {
    db.transaction(() => {
      pushRevisionIfChanged(db, deleted.id, deleted.title, deleted.lines, now);
      db.query("UPDATE pages SET deleted_at = NULL WHERE id = ?").run(deleted.id);
      applyContent(db, deleted.id, title, emptyLines, now);
    })();
    return getPage(db, deleted.id)!;
  }

  const id = ulid();
  db.transaction(() => {
    db.query(
      "INSERT INTO pages (id, title, lines, created, updated, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)",
    ).run(id, title, JSON.stringify(emptyLines), now, now);
    rebuildFts(db, id, title, emptyLines);
  })();
  return getPage(db, id)!;
}

export function save(db: Database, id: string, input: SaveInput, opts: SaveOptions = {}): Page {
  const now = opts.now ?? Date.now();
  const current = db
    .query("SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL")
    .get(id) as PageRow | null;
  if (!current) throw new Error(`page not found: ${id}`);

  const linesJson = JSON.stringify(input.lines);
  db.transaction(() => {
    if (input.title !== current.title) {
      propagateRename(db, current.title, input.title, id);
    }
    applyContent(db, id, input.title, input.lines, now);

    const latest = latestRevision(db, id);
    const due =
      !latest || opts.leaving === true || now - latest.saved_at >= REVISION_INTERVAL_MS;
    if (due) {
      pushRevisionIfChanged(db, id, input.title, linesJson, now);
    }
  })();

  return getPage(db, id)!;
}

export function deletePage(db: Database, id: string, now: number = Date.now()): void {
  db.query("UPDATE pages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(now, id);
}

export function listRevisions(db: Database, pageId: string): RevisionMeta[] {
  return db
    .query(
      `SELECT id, saved_at, json_array_length(lines) AS line_count
       FROM page_revisions WHERE page_id = ? ORDER BY id DESC`,
    )
    .all(pageId) as RevisionMeta[];
}

export function getRevision(db: Database, rid: number): Revision | null {
  const row = db
    .query("SELECT * FROM page_revisions WHERE id = ?")
    .get(rid) as RevisionRow | null;
  return row ? { ...row, lines: JSON.parse(row.lines) as string[] } : null;
}

// 復元は「現在の状態を積む → 上書き」の順(SPEC.md / ADR-0003)。逆にしない
export function restore(db: Database, pageId: string, rid: number, now: number = Date.now()): Page {
  const rev = getRevision(db, rid);
  if (!rev || rev.page_id !== pageId) throw new Error(`revision not found: ${rid}`);
  const current = db
    .query("SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL")
    .get(pageId) as PageRow | null;
  if (!current) throw new Error(`page not found: ${pageId}`);

  db.transaction(() => {
    pushRevisionIfChanged(db, pageId, current.title, current.lines, now);
    if (rev.title !== current.title) {
      propagateRename(db, current.title, rev.title, pageId);
    }
    applyContent(db, pageId, rev.title, rev.lines, now);
  })();

  return getPage(db, pageId)!;
}
