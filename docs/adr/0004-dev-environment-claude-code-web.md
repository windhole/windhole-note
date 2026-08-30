# 0004. 開発環境を devcontainer から Claude Code on the web に変える

Date: 2026-08-30
Status: Accepted

## Context

SPEC.md は開発環境として `.devcontainer/`(公式リファレンス設定 + Bun 追加)を置き、「Claude Code は devcontainer 内で実行」する前提で書かれていた。しかし実際の v1 の実装は、すべて Claude Code on the web(リモートの使い捨てコンテナ)上で行った。

このコンテナはセッションごとに作り直されるため、bun がプリインストールされている保証がない。そこで `.claude/hooks/session-start.sh` を SessionStart フックとして登録し、セッション開始時に bun を自動インストールする方式を採った(このフックは `CLAUDE_CODE_REMOTE=true` のときだけ動く)。

結果として `.devcontainer/` は作られないまま v1 の機能が揃い、SPEC.md の記述と実態がずれている。どちらを正とするかを決める必要がある。

## Decision

- 開発環境は Claude Code on the web を正とし、`.devcontainer/` は作らない
- リモートセッションの環境構築は `.claude/hooks/session-start.sh` に集約する。追加のセットアップが必要になったらこのスクリプトに足す
- ローカルの MacBook 2台では bun を各自で管理する(フックは `CLAUDE_CODE_REMOTE` でリモート時のみ動くので、ローカルの手順には干渉しない)
- SPEC.md の「ディレクトリ構成」と「構成」節から `.devcontainer/` の記述を落とし、この ADR を参照する

## Consequences

- セットアップが1ファイルで完結し、リモートセッションを開くたびに同じ環境が再現される。devcontainer.json と Dockerfile を保守しなくてよい
- 一方で、ローカル開発環境の再現性はドキュメント任せになる。2台のマシンで bun のバージョンがずれる可能性がある(個人利用なので許容し、ずれて困ったときに `.tool-versions` などを検討する)
- VS Code の Dev Containers でこのリポジトリを開く運用は取れなくなる。必要になったらこの ADR を Superseded にして devcontainer を足す
