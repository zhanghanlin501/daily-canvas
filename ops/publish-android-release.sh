#!/usr/bin/env bash
# 发布 Android 新版本：把安装包放进下载目录，并生成版本清单
#
# App 的「关于」页会读取版本清单，发现 versionCode 比本机大就提示更新，
# 用户点一下即可在应用内下载并覆盖安装，不再需要手动传安装包到手机。
#
# 用法：
#   ops/publish-android-release.sh app-release.apk \
#     --version 1.1 --code 2 --notes release-notes.md
#
# 常用可选参数：
#   --apk-url URL            安装包绝对地址（例如放到 GitHub Release 时使用）
#   --force                  标记为强制更新
#   --min-supported-code N   低于该版本号必须更新
#   --push-manifest          同时把清单推送到 Gitee 的 runtime-config 分支

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOADS_DIR="$ROOT_DIR/deploy/downloads"
KEEP_APK_COUNT=3

APK_PATH=""
VERSION_NAME=""
VERSION_CODE=""
NOTES_FILE=""
APK_URL=""
FORCE_UPDATE="false"
MIN_SUPPORTED_CODE=""
PUSH_MANIFEST="false"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION_NAME="$2"; shift 2 ;;
    --code) VERSION_CODE="$2"; shift 2 ;;
    --notes) NOTES_FILE="$2"; shift 2 ;;
    --apk-url) APK_URL="$2"; shift 2 ;;
    --force) FORCE_UPDATE="true"; shift ;;
    --min-supported-code) MIN_SUPPORTED_CODE="$2"; shift 2 ;;
    --push-manifest) PUSH_MANIFEST="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数: $1" >&2; usage; exit 1 ;;
    *) APK_PATH="$1"; shift ;;
  esac
done

if [[ -z "$APK_PATH" || -z "$VERSION_NAME" || -z "$VERSION_CODE" ]]; then
  echo "参数不完整：至少需要 <apk 路径>、--version 和 --code" >&2
  usage
  exit 1
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "找不到安装包：$APK_PATH" >&2
  exit 1
fi

if ! [[ "$VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "--code 必须是正整数，例如 --code 2" >&2
  exit 1
fi

if [[ -n "$NOTES_FILE" && ! -f "$NOTES_FILE" ]]; then
  echo "找不到更新说明文件：$NOTES_FILE" >&2
  exit 1
fi

mkdir -p "$DOWNLOADS_DIR"

FILE_NAME="daily-canvas-${VERSION_NAME}.apk"
TARGET_APK="$DOWNLOADS_DIR/$FILE_NAME"

cp "$APK_PATH" "$TARGET_APK"

# shasum 依赖 perl，显式指定 C locale 避免部分环境下报 locale 错误
if command -v shasum >/dev/null 2>&1; then
  SHA256="$(LC_ALL=C shasum -a 256 "$TARGET_APK" | awk '{print $1}')"
else
  SHA256="$(sha256sum "$TARGET_APK" | awk '{print $1}')"
fi

FILE_SIZE="$(wc -c < "$TARGET_APK" | tr -d ' ')"
PUBLISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MANIFEST_PATH="$DOWNLOADS_DIR/app-release.json"

python3 - "$MANIFEST_PATH" "$VERSION_NAME" "$VERSION_CODE" "$FILE_NAME" \
  "$SHA256" "$FILE_SIZE" "$NOTES_FILE" "$APK_URL" "$FORCE_UPDATE" \
  "$MIN_SUPPORTED_CODE" "$PUBLISHED_AT" <<'PY'
import json
import sys

(manifest_path, version_name, version_code, file_name, sha256, size,
 notes_file, apk_url, force_update, min_supported_code, published_at) = sys.argv[1:]

notes = []
if notes_file:
    with open(notes_file, "r", encoding="utf-8") as handle:
        for line in handle:
            cleaned = line.strip().lstrip("-*").strip()
            if cleaned:
                notes.append(cleaned)

manifest = {
    "versionName": version_name,
    "versionCode": int(version_code),
    "releaseNotes": notes,
    "apkPath": f"/downloads/{file_name}",
    "sha256": sha256,
    "size": int(size),
    "forceUpdate": force_update == "true",
    "publishedAt": published_at,
}

if apk_url:
    manifest["apkUrl"] = apk_url

if min_supported_code:
    manifest["minSupportedVersionCode"] = int(min_supported_code)

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

# 只保留最近的几个安装包，避免下载目录无限增长
if ls -1t "$DOWNLOADS_DIR"/*.apk >/dev/null 2>&1; then
  OLD_APKS="$(ls -1t "$DOWNLOADS_DIR"/*.apk | tail -n +$((KEEP_APK_COUNT + 1)))"
  if [[ -n "$OLD_APKS" ]]; then
    while IFS= read -r old_apk; do
      if [[ -n "$old_apk" ]]; then
        rm -f "$old_apk"
      fi
    done <<< "$OLD_APKS"
  fi
fi

if [[ "$PUSH_MANIFEST" == "true" ]]; then
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "正在把版本清单推送到 Gitee runtime-config 分支…"
  git clone --depth 1 --branch runtime-config "$(git -C "$ROOT_DIR" remote get-url origin)" "$TMP_DIR" >/dev/null
  mkdir -p "$TMP_DIR/deploy"
  cp "$MANIFEST_PATH" "$TMP_DIR/deploy/app-release.json"
  git -C "$TMP_DIR" add deploy/app-release.json
  if git -C "$TMP_DIR" diff --cached --quiet; then
    echo "版本清单没有变化，跳过推送"
  else
    git -C "$TMP_DIR" commit -m "chore: 发布 Daily Canvas ${VERSION_NAME} (${VERSION_CODE})" >/dev/null
    git -C "$TMP_DIR" push origin runtime-config
    echo "版本清单已推送"
  fi
fi

cat <<EOF

新版本已准备好：
  版本号：   ${VERSION_NAME} (${VERSION_CODE})
  安装包：   ${TARGET_APK}
  文件大小： ${FILE_SIZE} 字节
  SHA-256：  ${SHA256}
  版本清单： ${MANIFEST_PATH}

生效方式：
  1. 如果 Docker 栈正在运行，安装包目录是挂载进容器的，通常无需重启；
     保险起见可以执行：docker compose up -d frontend
  2. 手机打开 App → 个人中心 → 关于 Daily Canvas → 检查更新
  3. 也可以在浏览器访问 <公网地址>/downloads/app-release.json 确认清单可访问

提示：安装包的下载地址由运行时公网地址自动拼接（<publicBaseUrl>/downloads/...），
所以隧道地址变化后无需重新发布版本清单。
EOF
