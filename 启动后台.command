#!/bin/zsh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "正在启动智建协同后台帐号服务..."
echo "启动成功后请保持此窗口开启。"
echo

npm run dev:server

echo
echo "后台已停止。按回车键关闭窗口。"
read
