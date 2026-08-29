import type { Database } from "bun:sqlite";
import { groupLines } from "../shared/syntax";
import type { PageRef } from "../shared/types";

// コードブロック内の行をリンク抽出の対象にしない、という行跨ぎの扱いは
// groupLines に集約されている。ここでは line ブロックのノードを見るだけ
export function extractLinkTitles(lines: string[]): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();

  for (const block of groupLines(lines)) {
    if (block.type !== "line") continue;
    for (const node of block.nodes) {
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
