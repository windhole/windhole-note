# CLAUDE.md

Scrapbox(Cosense)のローカル動作版。自分専用。仕様の正本は `SPEC.md`。迷ったらそちらを読み、SPEC.md にない機能は作らない。

## コマンド

```sh
bun run dev        # bun --hot server.ts  (http://localhost:3000)
bun test           # tests/
bun run typecheck  # tsc --noEmit
```

`bun run dev` の起動時にマイグレーションが自動で走る。DB を作り直したいときは `rm data/pages.db` して再起動。

## 構成の要点

- `server.ts` が唯一のエントリ。`Bun.serve` の `routes` に API と HTML import を並べる
- `src/shared/` はサーバ・クライアント両方から import される。**DOM・`bun:sqlite`・Node API に依存させない**
- `src/shared/syntax.ts` の記法パーサは純粋関数。1行を受け取ってノード配列を返す。サーバはリンク抽出に、クライアントは描画に使う
- `links` テーブルと `pages_fts` は導出データ。ページ保存時に `pages.ts` が DELETE → INSERT で作り直す。手で整合性を取ろうとしない
- 画像 URL は本文に `/files/<hash>.<ext>` の相対パスで保存する。`localhost:3000` を本文に書き込まない

## 守ること

### データ
- `data/` 配下を git に入れない。テストで DB が必要なら `:memory:` を使う
- 物理削除をしない。ページ削除は `deleted_at` を立てる
- 一覧・検索・リンク解決はすべて `deleted_at IS NULL` で絞る

### マイグレーション
- スキーマ変更は必ず `migrations/NNN_name.sql` を新規追加する。コード内で `ALTER TABLE` を直接実行しない
- 既存の migration ファイルを編集しない
- `DROP TABLE` / `DROP COLUMN` / データを消す `UPDATE` / `DELETE` を migration に書かない。列が不要になったら放置する
- 番号は3桁ゼロ埋め、連番。飛ばさない

### 検索
- FTS5 の `MATCH` に渡すクエリは必ず `"..."` で囲み、内部の `"` は `""` にエスケープする
- 3文字未満のクエリは FTS5 に投げず `LIKE` にフォールバックする(`search.ts` の分岐を壊さない)
- 文字数はコードポイント(`[...q].length`)で数える

### 履歴
- リビジョンを積む判定(10分ルール / 同一内容スキップ / 離脱時)は `pages.ts` の `save()` に集約する。ルートハンドラ側に判定を書かない
- 復元は「現在の状態を積む → 上書き」の順。逆にしない

## コーディング規約

- TypeScript strict。`any` を使わない
- サーバ側の SQL は `db.query(...).get/all/run` を使う。文字列連結で SQL を組み立てない
- 例外は API 境界(`routes.ts`)で捕まえて `{ error: string }` と適切なステータスに変換する。それより内側では投げてよい
- React: 関数コンポーネント + hooks。状態管理ライブラリは入れない
- 依存追加は最小限。現時点で入れてよい外部パッケージ: `react`, `react-dom`, `diff`, `ulid`。それ以外を足したいときは理由を添えて提案する
- コメントは「なぜ」を書く。「何をしているか」はコードで分かるようにする

## テスト

- `src/shared/syntax.ts`: 記法ごとにパース結果のテストを書く。新しい記法を足すときは先にテストを足す
- `src/server/links.ts`: バックリンク・2ホップの抽出
- `src/server/search.ts`: 3文字境界、`"` を含むクエリ、日本語
- `src/server/migrate.ts`: 空 DB からの全適用、途中から再開、二重適用しないこと
- テスト用 DB は `new Database(":memory:")` に `migrate()` を流して作る

## やらないこと

- SPEC.md の「v1 で作らないもの」に挙げた機能を、頼まれていないのに実装しない
- 本家 Scrapbox のエディタ挙動(行カーソル、Enter での行分割 UI)を再現しようとしない。v1 は textarea
- 認証・CORS・HTTPS・本番デプロイ設定を足さない。`localhost` で自分が使うだけ

## 作業の進め方

- 1つの変更につき1コミット。migration を伴う変更は migration ファイルとコードを同じコミットに入れる
- 実装前に `bun test` と `bun run typecheck` が通ることを確認し、実装後にも通す
- 仕様の解釈に迷ったら、実装を進めずに選択肢を挙げて確認する
