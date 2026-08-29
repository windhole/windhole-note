# scrapbox-local v1 仕様

## 目的

Scrapbox(Cosense)のローカル動作版。自分専用。自宅 MacBook Air と仕事 MacBook Pro の2台で動かす(データは別々、コードは共通)。

## 構成

- ランタイム: Bun
- DB: SQLite (`bun:sqlite`)。`data/pages.db` 1ファイル
- 画像: `data/images/<sha256>.<ext>` にディスク保存
- フロント: React + TypeScript。`Bun.serve` の HTML import で配信。Vite 不使用
- 開発: `bun --hot server.ts`(HMR)。Claude Code は devcontainer 内で実行
- 認証・複数ユーザー・リアルタイム同期・複数プロジェクト: なし

## ディレクトリ構成

```
scrapbox-local/
├── CLAUDE.md
├── SPEC.md
├── package.json / bun.lock / tsconfig.json
├── .gitignore                # data/, node_modules/
├── .devcontainer/            # 公式リファレンス設定 + Bun 追加
├── server.ts                 # Bun.serve エントリ。HTML import と routes
├── migrations/
│   └── 001_init.sql
├── src/
│   ├── server/
│   │   ├── db.ts             # Database 生成、起動時に migrate() 呼び出し
│   │   ├── migrate.ts        # migrations/ を番号順に適用
│   │   ├── pages.ts          # CRUD + revisions + 論理削除
│   │   ├── links.ts          # lines → links 再生成、バックリンク / 2ホップ
│   │   ├── search.ts         # FTS5 trigram / LIKE フォールバック
│   │   ├── upload.ts         # 画像保存(sha256 命名)
│   │   └── routes.ts         # /api/* ハンドラ
│   ├── shared/
│   │   ├── types.ts          # Page, Revision 型(front/back 共通)
│   │   └── syntax.ts         # 記法パーサ(行 → ノード配列)。純粋関数、front/back 共通
│   └── client/
│       ├── index.html
│       ├── main.tsx
│       ├── api.ts            # fetch ラッパ
│       ├── pages/            # ListPage, PageView, HistoryPage
│       ├── components/       # Editor, LineRenderer, RelatedPages, SearchBox
│       └── styles.css
├── data/                     # gitignore。マシンごとに独立
│   ├── pages.db
│   └── images/
├── tests/                    # bun test
└── scripts/
    └── update.sh             # git pull --ff-only && bun install --frozen-lockfile
```

`src/shared/syntax.ts` はサーバ(リンク抽出)とクライアント(描画)の両方から使う。ここに DOM や DB への依存を持ち込まない。

## データモデル

```sql
pages(id TEXT PK, title TEXT UNIQUE, lines TEXT(JSON), created INT, updated INT, deleted_at INT NULL)
page_revisions(id INT PK, page_id TEXT, title TEXT, lines TEXT(JSON), saved_at INT)
links(from_id TEXT, to_title TEXT)                -- 保存時に lines から再生成
pages_fts(page_id UNINDEXED, title, body)         -- FTS5, tokenize='trigram'
schema_version(v INT)
```

- 主キーは `id`(ULID)。`title` はユニークだが改名可能
- 改名時は他ページ本文の `[旧title]` を `[新title]` に置換する
- 削除は論理削除(`deleted_at`)。物理削除はしない
- `links` と `pages_fts` は `pages` から導出できる。保存時に DELETE → INSERT で作り直す

## 記法(v1)

| 記法 | 意味 |
|---|---|
| `[タイトル]` | ページリンク。未存在なら開いたときに自動作成 |
| `#タグ` | `[タグ]` と同じ扱い |
| `[* 強調]` | 太字。`*` の数で段階 |
| `[https://...]` | 外部リンク |
| `[/files/<hash>.png]` `[https://...png]` | 画像 |
| `code:lang` の次行以降、インデントされた行 | コードブロック |
| 行頭の空白/タブ | インデント(箇条書き相当) |

1行目がタイトル。行を超える記法はコードブロックのみ。

## 機能

- 一覧: 更新日時降順のカードグリッド(タイトル + 先頭数行)
- 編集: textarea。自動保存(デバウンス 500ms 程度)
- ページ下部: バックリンク一覧 + 2ホップ先(リンク先ページがさらにリンクしているページ)
- 検索: タイトル + 本文。3文字以上 → FTS5 `MATCH`(クエリは `"..."` で囲む)、2文字以下 → `LIKE '%q%'`
- 画像: エディタで Cmd+V → `POST /api/upload` → 返ってきた `/files/<hash>.<ext>` を `[...]` で挿入
- 履歴:
  - 前回リビジョンから 10 分以上経っていれば新規リビジョンを積む
  - ページ離脱時にも積む
  - 内容(title, lines)が直前リビジョンと同一なら積まない
  - 履歴一覧 → 選択で本文表示 + 現在との行 diff(`diff` パッケージの `diffLines`)
  - 「この版に戻す」: 現在の状態をリビジョンに積んでから上書き

## API

```
GET    /api/pages                    一覧(deleted_at IS NULL)
GET    /api/pages/:id                取得(backlinks, twoHop を含む)
GET    /api/pages/by-title/:title    タイトル解決。未存在なら作成して返す
PUT    /api/pages/:id                保存 { title, lines }
DELETE /api/pages/:id                論理削除
GET    /api/pages/:id/revisions      履歴一覧(id, saved_at, 行数)
GET    /api/revisions/:rid           1リビジョン
POST   /api/pages/:id/restore/:rid   復元
GET    /api/search?q=                検索
POST   /api/upload                   画像 → { url }
GET    /files/:name                  画像配信(data/images/)
GET    /                             フロント
```

## マイグレーション

- `migrations/NNN_name.sql` を番号順に適用。適用済み番号は `schema_version` に記録
- サーバ起動時に未適用分を自動で流す。1ファイル = 1トランザクション
- 既存ファイルは書き換えない。変更は必ず新しい番号で
- **削除系操作を含めない**(DROP TABLE / DROP COLUMN 禁止)。不要になった列は放置する
- `001_init.sql` に上のテーブル群を置く

## 配布 / 環境

- コードは GitHub 経由。各マシンで `scripts/update.sh`
- `data/` は `.gitignore`。マシン間で同期しない
- 画像 URL は相対パス(`/files/...`)で本文に保存する。ホスト名やポートを本文に書かない

## v1 で作らないもの

本家に近い行カーソル挙動 / 画像 GC / 古いリビジョンの間引き / Scrapbox JSON エクスポートの取り込み / 複数プロジェクト / 形態素解析による検索 / 実行用 Docker イメージ
