import type { Database } from "bun:sqlite";

export interface SearchResult {
  id: string;
  title: string;
}

// trigram tokenizer は3文字未満の語を索引できないため、コードポイント数で
// 3文字未満のクエリは FTS5 に投げず LIKE にフォールバックする(CLAUDE.md)。
const FTS_MIN_CODEPOINTS = 3;

// FTS5 の MATCH は独自のクエリ構文を持つ。ユーザ入力を構文として解釈させないよう
// 必ず "..." で囲み、内部の " は "" にエスケープする(CLAUDE.md)
function toFtsQuery(q: string): string {
  return `"${q.replaceAll('"', '""')}"`;
}

// LIKE の % _ とエスケープ文字自身をリテラルとして扱えるようにする
function toLikePattern(q: string): string {
  return `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export function search(db: Database, q: string): SearchResult[] {
  const query = q.trim();
  if (query === "") return [];

  if ([...query].length >= FTS_MIN_CODEPOINTS) {
    return db
      .query(
        `SELECT p.id, p.title
         FROM pages_fts JOIN pages p ON p.id = pages_fts.page_id
         WHERE pages_fts MATCH ? AND p.deleted_at IS NULL
         ORDER BY rank`,
      )
      .all(toFtsQuery(query)) as SearchResult[];
  }

  // 短いクエリはヒットが多くなりがちなので、一覧と同じ更新日時降順で返す。
  // 本文は JSON 化された pages.lines ではなく pages_fts.body(素のテキスト)に
  // 当てる。JSON のエスケープ(\" など)がマッチに混ざるのを避けるため
  const pattern = toLikePattern(query);
  return db
    .query(
      `SELECT p.id, p.title
       FROM pages p JOIN pages_fts ON pages_fts.page_id = p.id
       WHERE p.deleted_at IS NULL
         AND (p.title LIKE ? ESCAPE '\\' OR pages_fts.body LIKE ? ESCAPE '\\')
       ORDER BY p.updated DESC`,
    )
    .all(pattern, pattern) as SearchResult[];
}
