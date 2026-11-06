#!/usr/bin/env bash
# Daily Canvas 公网通道看门狗（独立版，不依赖项目目录）
#
# 为什么要有独立版：
#   macOS 会保护「桌面 / 文稿 / 下载」等目录。后台守护进程（launchd）没有获得授权时
#   读不到 ~/Desktop 下的项目文件，会直接报 Operation not permitted。
#   所以这个脚本放在不受保护的目录里运行，只依赖 docker / git / python3，
#   完全不读取项目目录。
#
# 职责：
#   1. 确保 Daily Canvas 的容器都在运行；
#   2. 校验当前 Cloudflare 临时通道地址是否真的可访问；
#   3. 不可用时重启 tunnel 容器拿到新地址，并把新地址同步到 Gitee 的 runtime-config 分支
#      （App 每次启动都会去那里读最新地址，所以换了地址手机也能自动跟上）。
#
# 用法：
#   tunnel-watchdog.sh                                          # 前台常驻，默认 10 分钟自检一次
#   TUNNEL_WATCH_INTERVAL_SECONDS=60 tunnel-watchdog.sh          # 自定义自检间隔

set -uo pipefail

PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-daily-canvas-tunnel-1}"
APP_CONTAINERS="${APP_CONTAINERS:-daily-canvas-db-1 daily-canvas-backend-1 daily-canvas-frontend-1}"
GITEE_REPO="${GITEE_REPO:-git@gitee.com:zh_anghanlin/daily-canvas.git}"
CONFIG_BRANCH="${CONFIG_BRANCH:-runtime-config}"
CONFIG_PATH="${CONFIG_PATH:-deploy/runtime-config.json}"
INTERVAL="${TUNNEL_WATCH_INTERVAL_SECONDS:-600}"
RETRY_INTERVAL="${TUNNEL_WATCH_RETRY_SECONDS:-60}"
URL_PATTERN='https://[a-z0-9-]+\.trycloudflare\.com'
LOCK_DIR="${TMPDIR:-/tmp}/daily-canvas-tunnel-watchdog.lock"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

# 日志做一次轻量轮转，避免无限增长。
# launchd 以追加方式写日志（O_APPEND），所以原地覆盖文件是安全的。
trim_log_if_needed() {
  local log_file="${TUNNEL_WATCH_LOG:-}"
  [[ -n "$log_file" && -f "$log_file" ]] || return 0

  local size
  size="$(wc -c < "$log_file" 2>/dev/null | tr -d ' ')"
  [[ -n "$size" ]] || return 0
  (( size > 5242880 )) || return 0

  local tmp="${log_file}.trim"
  if tail -n 2000 "$log_file" > "$tmp" 2>/dev/null; then
    cat "$tmp" > "$log_file" 2>/dev/null
  fi
  rm -f "$tmp"
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" == "true" ]]
}

ensure_containers() {
  local name
  for name in $APP_CONTAINERS; do
    if ! container_running "$name"; then
      log "容器 $name 未运行，尝试启动"
      docker start "$name" >/dev/null 2>&1 || log "启动 $name 失败"
    fi
  done
}

tunnel_url() {
  docker logs "$TUNNEL_CONTAINER" 2>&1 | grep -Eo "$URL_PATTERN" | tail -n 1
}

is_healthy() {
  python3 -c '
import json, sys, urllib.request
base = sys.argv[1]
try:
    req = urllib.request.Request(base + "/api/health", headers={"User-Agent": "daily-canvas-tunnel-watchdog"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        ok = json.loads(resp.read().decode("utf-8")).get("status") == "healthy"
    print("ok" if ok else "bad")
except Exception:
    print("bad")
' "$1"
}

wait_for_healthy_url() {
  local base="$1"
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    [[ "$(is_healthy "$base")" == "ok" ]] && return 0
    sleep 5
  done
  return 1
}

publish_to_gitee() {
  local base="$1"
  local tmp repo
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/daily-canvas-runtime-config.XXXXXX")"
  repo="$tmp/repo"

  if ! git clone --depth 1 --branch "$CONFIG_BRANCH" "$GITEE_REPO" "$repo" >/dev/null 2>&1; then
    rm -rf "$tmp"
    if ! git clone --depth 1 "$GITEE_REPO" "$repo" >/dev/null 2>&1; then
      log "克隆 Gitee 运行时配置失败"
      rm -rf "$tmp"
      return 1
    fi
    git -C "$repo" checkout -B "$CONFIG_BRANCH" >/dev/null 2>&1 || true
  fi

  git -C "$repo" config --local user.name "Daily Canvas Bot"
  git -C "$repo" config --local user.email "daily-canvas-bot@example.com"

  python3 -c '
import datetime, json, os, sys
path, base = sys.argv[1], sys.argv[2]
payload = {
    "publicBaseUrl": base,
    "apiBaseUrl": base + "/api",
    "healthUrl": base + "/api/health",
    "source": "cloudflare-quick-tunnel",
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
' "$repo/$CONFIG_PATH" "$base" || { rm -rf "$tmp"; log "写入运行时配置失败"; return 1; }

  git -C "$repo" add "$CONFIG_PATH"

  if git -C "$repo" diff --cached --quiet; then
    log "Gitee 上的地址已是最新，无需提交"
    rm -rf "$tmp"
    return 0
  fi

  if ! git -C "$repo" commit -m "chore: update public runtime config" >/dev/null 2>&1; then
    log "提交运行时配置失败"
    rm -rf "$tmp"
    return 1
  fi

  if git -C "$repo" push origin "HEAD:$CONFIG_BRANCH" >/dev/null 2>&1; then
    log "已把新地址同步到 Gitee（$CONFIG_BRANCH）"
    rm -rf "$tmp"
    return 0
  fi

  log "推送 Gitee 失败"
  rm -rf "$tmp"
  return 1
}

# 避免同时跑起多个实例
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [[ -f "$LOCK_DIR/pid" ]] && kill -0 "$(cat "$LOCK_DIR/pid" 2>/dev/null)" 2>/dev/null; then
    log "已有看门狗实例在运行（pid $(cat "$LOCK_DIR/pid")），本次退出"
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || exit 1
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM

log "看门狗启动：自检间隔 ${INTERVAL}s，失败重试间隔 ${RETRY_INTERVAL}s"

while true; do
  trim_log_if_needed
  ensure_containers

  current_url="$(tunnel_url)"
  if [[ -n "$current_url" && "$(is_healthy "$current_url")" == "ok" ]]; then
    log "通道正常：$current_url"
    sleep "$INTERVAL"
    continue
  fi

  log "通道不可用（记录地址：${current_url:-无}），正在重建"
  docker restart "$TUNNEL_CONTAINER" >/dev/null 2>&1 || log "重启 $TUNNEL_CONTAINER 失败"

  new_url=""
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    candidate="$(tunnel_url)"
    if [[ -n "$candidate" && "$candidate" != "$current_url" ]]; then
      new_url="$candidate"
      break
    fi
    sleep 3
  done
  [[ -z "$new_url" ]] && new_url="$(tunnel_url)"

  if [[ -n "$new_url" ]] && wait_for_healthy_url "$new_url"; then
    log "新通道已就绪：$new_url"
    publish_to_gitee "$new_url" || log "发布新地址失败，下一轮继续重试"
    sleep "$INTERVAL"
  else
    log "重建后仍未就绪，${RETRY_INTERVAL}s 后重试"
    sleep "$RETRY_INTERVAL"
  fi
done
