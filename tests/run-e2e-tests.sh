#!/usr/bin/env bash
#
# Daily Canvas 端到端回归
#
# 覆盖五组契约：
#   1. 内容安全：状态机、私密隔离、举报阈值（5 人待审）、拉黑双向隔离、最小管理端
#   2. 登录防护：账号锁定、IP 兜底、注册刷号
#   3. 创作生命周期：24 小时编辑、软删除、30 天回收站、管理端删除边界
#   4. 双 Token：15 分钟 access + 30 天 refresh、轮换、撤销、401 契约
#
# 用法：
#   bash tests/run-e2e-tests.sh
#
# 可通过环境变量覆盖：
#   DC_API_BASE      默认 http://localhost:8080/api
#   DC_COMPOSE_CMD   默认 "docker compose"
#
# 脚本会创建临时账号，结束时用 tests/e2e/cleanup.sql 清理；
# 因为限流计数在 backend 进程内存里，每组用例前会重启 backend。
set -euo pipefail

cd "$(dirname "$0")/.."

DC_API_BASE="${DC_API_BASE:-http://localhost:8080/api}"
DC_COMPOSE_CMD="${DC_COMPOSE_CMD:-docker compose}"
export DC_API_BASE
export DC_COMPOSE_CMD

echo "▶ 检查服务可用性：${DC_API_BASE}/health"
curl -fsS "${DC_API_BASE}/health" >/dev/null

cleanup() {
  echo "▶ 清理测试数据"
  ${DC_COMPOSE_CMD} exec -T db psql -U postgres -d daily_canvas -q < tests/e2e/cleanup.sql >/dev/null
  ${DC_COMPOSE_CMD} exec -T db psql -U postgres -d daily_canvas -c \
    "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM daily_posts) AS posts, (SELECT count(*) FROM reports) AS reports, (SELECT count(*) FROM blocks) AS blocks;"
  echo "✔ 测试数据已清理"
}

run_suite() {
  local name="$1"
  local script="$2"

  echo "▶ 重启 backend（重置进程内限流计数）"
  ${DC_COMPOSE_CMD} restart backend >/dev/null

  # 等待后端重新就绪，最多 30 秒
  local waited=0
  until curl -fsS "${DC_API_BASE}/health" >/dev/null 2>&1; do
    sleep 1
    waited=$((waited + 1))
    if [ "${waited}" -ge 30 ]; then
      echo "✘ backend 在 30 秒内没有就绪" >&2
      exit 1
    fi
  done

  echo "▶ 运行：${name}"
  python3 "${script}"
}

trap cleanup EXIT

run_suite "健康检查契约回归" tests/e2e/test_health.py
run_suite "内容安全回归" tests/e2e/test_content_safety.py
run_suite "登录防刷与限流回归" tests/e2e/test_rate_limit.py
run_suite "创作生命周期回归" tests/e2e/test_post_lifecycle.py
run_suite "双 Token 无感登录回归" tests/e2e/test_auth_tokens.py

echo "✔ 全部回归通过"
