#!/usr/bin/env bash
# Impromptu 服务器一键更新部署脚本
#
# 用法：
#   ./update.sh           拉取 GitHub 最新代码并重新构建、重启容器
#   ./update.sh --force   丢弃服务器上未提交的修改与未跟踪文件，强制与远程一致
#
# 说明：
#   - .env 不会被脚本触碰（Git 已忽略），配置变更请手动维护
#   - 数据库由容器启动时的 alembic 自动迁移，无需手动处理
#   - 若本次更新涉及 docker-compose.yml / .env.example，脚本会提醒核对 .env
set -euo pipefail

cd "$(dirname "$0")"

log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "错误：$*"; exit 1; }

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
elif [ -n "${1:-}" ]; then
  echo "用法：./update.sh [--force]" >&2
  exit 2
fi

UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo origin/master)

log "=== 1/5 拉取最新代码（$UPSTREAM）==="
if [ "$FORCE" = "1" ]; then
  log "强制模式：丢弃本地未提交的修改与未跟踪文件（.env 等已忽略文件不受影响）"
  git fetch origin "$(git rev-parse --abbrev-ref HEAD)"
  git reset --hard "$UPSTREAM"
  git clean -fd
else
  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "工作区有未提交的修改。请先在开发机提交并推送到 GitHub，或使用 ./update.sh --force 丢弃本地修改"
  fi
  if ! git pull --ff-only; then
    fail "git pull 失败（常见原因：本地未跟踪文件与远程冲突）。如确认服务器没有需要保留的本地文件，可执行 ./update.sh --force"
  fi
fi

CHANGED=$(git diff --name-only '@{1}' HEAD 2>/dev/null || true)
if [ -n "$CHANGED" ] && echo "$CHANGED" | grep -qE 'docker-compose\.yml|\.env\.example'; then
  log "提醒：本次更新涉及 docker-compose.yml / .env.example，请核对 .env 是否需要补充新变量"
fi

log "=== 2/5 重新构建镜像 ==="
docker compose build

log "=== 3/5 重启容器 ==="
docker compose up -d --remove-orphans

FRONTEND_PORT=$(sed -n 's/^FRONTEND_PORT=//p' .env 2>/dev/null | tail -1)
FRONTEND_PORT=${FRONTEND_PORT:-5173}

log "=== 4/5 等待服务健康 ==="
ok=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${FRONTEND_PORT}/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 5
done
[ "$ok" = "1" ] || fail "等待健康检查超时，请运行 docker compose logs 排查"

log "=== 5/5 收尾 ==="
docker image prune -f >/dev/null

# 系统 nginx 配置若有更新则提醒手动应用
if [ -f deploy/nginx/impromptu.conf ] && [ -f /etc/nginx/conf.d/impromptu.conf ] \
   && ! cmp -s deploy/nginx/impromptu.conf /etc/nginx/conf.d/impromptu.conf; then
  log "提醒：deploy/nginx/impromptu.conf 有更新，请手动应用："
  log "  sudo cp deploy/nginx/impromptu.conf /etc/nginx/conf.d/impromptu.conf && sudo nginx -t && sudo systemctl reload nginx"
fi

log "对外链路自检："
curl -fsSL --max-time 10 http://127.0.0.1/health >/dev/null 2>&1 \
  && log "  HTTPS 全链路 OK" \
  || log "  （本机自检未通过，可能为 NAT 回环限制，请用浏览器访问 https://impromptu.com.cn/ 确认）"

log "部署完成：$(git log -1 --format='%h %s')"
docker compose ps
