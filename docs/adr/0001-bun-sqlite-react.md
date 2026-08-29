# 0001. Bun + bun:sqlite + React を採用する

Date: 2026-08-29
Status: Accepted

## Context

自分専用のローカルノートアプリ(Scrapbox のローカル動作版)を作る。認証・複数ユーザー・本番デプロイは不要で、自宅と仕事の2台のマシンでコードだけ共有しデータは別々に持てばよい。SPEC.md にはすでにこの前提での技術選定(ランタイム: Bun、DB: SQLite、フロント: React)が書かれており、今回それに沿って実装に着手する。

## Decision

- ランタイム/サーバは Bun。`Bun.serve` の `routes` に API と HTML import を並べて配信し、Vite など別ビルドツールは使わない
- DB は `bun:sqlite` による SQLite。`data/pages.db` の単一ファイル
- フロントは React + TypeScript。状態管理ライブラリは追加しない
- 開発は `bun --hot server.ts` によるホットリロード

## Consequences

- ビルドステップなしでフロント/バックエンドを一体で開発できる。個人用途の小規模アプリには十分
- SQLite は単一プロセス・単一ライターが前提。複数人での同時編集や本番相当のスケールは想定しない(そもそも要件にない)
- Bun 固有 API(`bun:sqlite`, `Bun.serve` の HTML import)に依存するため、他ランタイムへの移植性は低い。個人利用が目的なので許容する
