#!/bin/bash
set -euo pipefail

# 各マシン(自宅 MacBook Air / 仕事 MacBook Pro)でコードを最新にする。
# data/ は同期しないので、このスクリプトは触らない。

cd "$(dirname "$0")/.."

# --ff-only: ローカルにコミットが残っていたらマージせず失敗させる。
# 2台で別々に書き換えていたことにここで気づける
git pull --ff-only

bun install --frozen-lockfile

# 依存が変わっていても起動前に壊れていないか確かめる
bun run typecheck
bun test

echo "更新完了。bun run dev で起動できます"
