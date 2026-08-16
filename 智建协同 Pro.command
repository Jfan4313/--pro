#!/bin/zsh
set -u

PROJECT_DIR="/Users/su/Documents/GitHub/--pro"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "找不到项目目录：$PROJECT_DIR"
  read "?按回车键关闭窗口…"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
exec node scripts/desktop-launcher.mjs
