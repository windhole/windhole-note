// front/back 共通。DOM・bun:sqlite・Node API に依存させない(CLAUDE.md)。
// フィールド名は SPEC.md のデータモデル(SQL カラム名)にそのまま合わせる。
// lines は DB 上は TEXT(JSON) だが、ここでは JSON.parse 済みの行配列として扱う。

export interface Page {
  id: string;
  title: string;
  lines: string[];
  created: number;
  updated: number;
  deleted_at: number | null;
}

export interface Revision {
  id: number;
  page_id: string;
  title: string;
  lines: string[];
  saved_at: number;
}
