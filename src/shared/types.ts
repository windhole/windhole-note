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

// バックリンク・2ホップ・検索結果など、一覧表示に使う軽量なページ参照
export interface PageRef {
  id: string;
  title: string;
}

// 履歴一覧の1行分。本文は持たず行数だけ返す(SPEC.md の API)
export interface RevisionMeta {
  id: number;
  saved_at: number;
  line_count: number;
}

export interface Revision {
  id: number;
  page_id: string;
  title: string;
  lines: string[];
  saved_at: number;
}
