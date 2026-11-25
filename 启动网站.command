#!/bin/bash
set -e
cd "$(dirname "$0")"
M31_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ ! -x "$M31_NODE" ]; then M31_NODE="$(command -v node || true)"; fi
if [ -z "$M31_NODE" ]; then
  echo "请先安装 Node.js 22.13 或更新版本。"
  read -r -p "按回车退出"
  exit 1
fi
exec "$M31_NODE" scripts/start-local.mjs
