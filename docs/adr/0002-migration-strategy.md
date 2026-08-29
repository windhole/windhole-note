# 0002. 番号付き SQL ファイル + schema_version によるマイグレーション

Date: 2026-08-29
Status: Accepted

## Context

スキーマ変更を安全に積み重ねる方法が要る。ORM は入れない方針(依存最小限)なので、生 SQL ファイルを順番に適用する素朴な仕組みにする。開発は Claude Code on the web のような使い捨てコンテナ上でも行うため、マイグレーションの取りこぼしや二重適用が起きない実装にする必要がある。SPEC.md にはすでに「`migrations/NNN_name.sql` を番号順に適用。適用済み番号は `schema_version` に記録」「既存ファイルは書き換えない」「DROP 系を含めない」という方針が書かれている。

## Decision

- `migrations/NNN_name.sql`(3桁ゼロ埋め連番)を作成順 = 適用順とする
- 適用済み番号は `schema_version(v INT)` テーブルに1マイグレーション1行で記録する。この表自体は `001_init.sql` が作る対象テーブルの一つであり、マイグレーション専用の別テーブルは用意しない
- `migrate(db)` は起動時に呼ばれ、`sqlite_master` に `schema_version` が無ければ「未適用 0 件」とみなし、あれば `SELECT v FROM schema_version` で適用済み集合を得る
- 未適用のファイルを番号昇順にトランザクション単位(1ファイル1トランザクション)で実行し、成功したら `schema_version` にその番号を INSERT する
- 既存ファイルの書き換え・`DROP TABLE`/`DROP COLUMN`・データを消す `UPDATE`/`DELETE` はマイグレーションに書かない。不要になった列や表は放置する

## Consequences

- 空の DB でも、`001` が適用済みの DB でも、`migrate(db)` を呼ぶだけで安全に最新化できる(冪等)
- ロールバック機構は持たない。前方向にしか進めないため、間違えたら打ち消す新しいマイグレーションを足す運用になる
- `schema_version` の作成自体を `001_init.sql` に委ねているため、`migrate.ts` は「テーブルが存在するか」を都度 `sqlite_master` で確認する必要があり、専用のブートストラップ処理が要る
