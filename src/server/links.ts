import type { Database } from "bun:sqlite";
import { indentOf, parseLine } from "../shared/syntax";

// バックリンク・2ホップの表示に必要なのはタイトルと遷移先だけなので、
// lines を含む Page 全体ではなく軽量な参照を返す。
export interface PageRef {
  id: string;
  title: string;
}

// code:lang 行より深くインデントされた行はコードブロックの中身なので、
// リンク抽出の対象にしない(syntax.ts は1行単位の純粋関数のため、
// この行跨ぎの状態管理は呼び出し側である本モジュールの責務)。
export function extractLinkTitles(lines: string[]): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  let codeIndent: number | null = null;

  for (const line of lines) {
    const indent = indentOf(line);
    if (codeIndent !== null) {
      if (indent > codeIndent) continue;
      codeIndent = null;
    }

    const nodes = parseLine(line);
    if (nodes[0]?.type === "codeBlockStart") {
      codeIndent = indent;
      continue;
    }

    for (const node of nodes) {
      if (node.type === "link" && node.title !== "" && !seen.has(node.title)) {
        seen.add(node.title);
        titles.push(node.title);
      }
    }
  }

  return titles;
}

// links は pages から導出できるデータ。整合性を保つため必ず全消し → 再挿入(CLAUDE.md)。
export function rebuildLinks(db: Database, pageId: string, lines: string[]): void {
  db.transaction(() => {
    db.query("DELETE FROM links WHERE from_id = ?").run(pageId);
    const insert = db.query("INSERT INTO links (from_id, to_title) VALUES (?, ?)");
    for (const title of extractLinkTitles(lines)) {
      insert.run(pageId, title);
    }
  })();
}

export function backlinks(db: Database, pageId: string): PageRef[] {
  return db
    .query(
      `SELECT p.id, p.title
       FROM links l
       JOIN pages p ON p.id = l.from_id AND p.deleted_at IS NULL
       WHERE l.to_title = (SELECT title FROM pages WHERE id = ?)
         AND l.from_id != ?
       ORDER BY p.updated DESC`,
    )
    .all(pageId, pageId) as PageRef[];
}

// 2ホップ先 = このページのリンク先ページが、さらにリンクしているページ(SPEC.md)。
// 中間ページ・行き先とも削除済みは除外し、自分自身は含めない。
export function twoHop(db: Database, pageId: string): PageRef[] {
  return db
    .query(
      `SELECT DISTINCT p2.id, p2.title
       FROM links l1
       JOIN pages mid ON mid.title = l1.to_title AND mid.deleted_at IS NULL
       JOIN links l2 ON l2.from_id = mid.id
       JOIN pages p2 ON p2.title = l2.to_title AND p2.deleted_at IS NULL
       WHERE l1.from_id = ?
         AND p2.id != ?
       ORDER BY p2.updated DESC`,
    )
    .all(pageId, pageId) as PageRef[];
}
