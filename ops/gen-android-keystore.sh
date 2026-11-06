#!/usr/bin/env bash
# 生成 Android 签名密钥库
#
# 应用内覆盖安装要求「新版本和已安装版本签名一致」，
# 所以必须先固定一份签名密钥，后续每次发布都用它打包。
#
# 用法：
#   ops/gen-android-keystore.sh                     # 使用默认路径和默认密码
#   ops/gen-android-keystore.sh --store-pass 自定义密码

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/frontend/android"

KEYSTORE_PATH="$ANDROID_DIR/daily-canvas-release.jks"
KEYSTORE_ALIAS="daily-canvas"
# 默认不写死密码：未显式传 --store-pass 时随机生成一个，
# 避免出现「仓库里能查到默认密码」的情况。
STORE_PASSWORD=""
KEY_PASSWORD=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keystore) KEYSTORE_PATH="$2"; shift 2 ;;
    --alias) KEYSTORE_ALIAS="$2"; shift 2 ;;
    --store-pass) STORE_PASSWORD="$2"; shift 2 ;;
    --key-pass) KEY_PASSWORD="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$STORE_PASSWORD" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    STORE_PASSWORD="$(openssl rand -hex 16)"
  else
    STORE_PASSWORD="$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 32)"
  fi
fi

# PKCS12 要求密钥口令与库口令一致；JKS 也统一用同一个口令，减少记混
if [[ -z "$KEY_PASSWORD" ]]; then
  KEY_PASSWORD="$STORE_PASSWORD"
fi

if [[ -f "$KEYSTORE_PATH" ]]; then
  echo "密钥库已存在：$KEYSTORE_PATH"
  echo "如需重新生成，请先手动删除该文件。" >&2
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"

STORE_TYPE="JKS"

HAVE_KEYTOOL="false"
# macOS 上 /usr/bin/keytool 只是占位程序，这里要真正执行一次才算可用
if command -v keytool >/dev/null 2>&1 && keytool -help >/dev/null 2>&1; then
  HAVE_KEYTOOL="true"
fi

if [[ "$HAVE_KEYTOOL" == "true" ]]; then
  keytool -genkeypair \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEYSTORE_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=Daily Canvas, OU=Daily Canvas, O=Daily Canvas, L=Shanghai, ST=Shanghai, C=CN"
elif command -v openssl >/dev/null 2>&1; then
  # 没有 JDK 时用 openssl 生成 PKCS12 密钥库，Android Gradle 同样可以直接使用
  echo "未找到 keytool，改用 openssl 生成 PKCS12 密钥库。"
  KEYSTORE_PATH="${KEYSTORE_PATH%.jks}.p12"
  STORE_TYPE="PKCS12"

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$TMP_DIR/key.pem" \
    -out "$TMP_DIR/cert.pem" \
    -days 10000 \
    -subj "/CN=Daily Canvas/OU=Daily Canvas/O=Daily Canvas/L=Shanghai/ST=Shanghai/C=CN" >/dev/null 2>&1

  openssl pkcs12 -export \
    -in "$TMP_DIR/cert.pem" \
    -inkey "$TMP_DIR/key.pem" \
    -name "$KEYSTORE_ALIAS" \
    -out "$KEYSTORE_PATH" \
    -passout "pass:$STORE_PASSWORD"
else
  echo "需要 keytool（JDK）或 openssl 其中之一，请先安装。" >&2
  exit 1
fi

KEYSTORE_FILE_NAME="$(basename "$KEYSTORE_PATH")"

cat > "$ANDROID_DIR/keystore.properties" <<EOF
storeFile=../$KEYSTORE_FILE_NAME
storeType=$STORE_TYPE
storePassword=$STORE_PASSWORD
keyAlias=$KEYSTORE_ALIAS
keyPassword=$KEY_PASSWORD
EOF

BASE64_PATH="$KEYSTORE_PATH.base64"
base64 < "$KEYSTORE_PATH" | tr -d '\n' > "$BASE64_PATH"

cat <<EOF

签名密钥已生成：
  - 密钥库文件：$KEYSTORE_PATH
  - 本地配置：  $ANDROID_DIR/keystore.properties
  - CI 用 Base64：$BASE64_PATH

密钥库口令（请立即存进密码管理器，丢失后无法再打包更新）：
  storePassword = $STORE_PASSWORD
  keyPassword   = $KEY_PASSWORD

下一步（只需做一次）：
  1. 打开 GitHub 仓库 Settings → Secrets and variables → Actions
  2. 新增大写名称的 Secrets：
       ANDROID_KEYSTORE_BASE64   ← $BASE64_PATH 文件内容
       ANDROID_KEYSTORE_PASSWORD ← $STORE_PASSWORD
       ANDROID_KEY_ALIAS         ← $KEYSTORE_ALIAS
       ANDROID_KEY_PASSWORD      ← $KEY_PASSWORD
       ANDROID_KEYSTORE_TYPE     ← $STORE_TYPE
  3. 把密钥库文件和 Base64 文件妥善备份（例如放一份到仓库之外的加密盘），
     并单独保存上面的口令；丢失后无法覆盖更新已安装的 App

注意：这两个文件和 keystore.properties 都已在 .gitignore 中，不要提交到仓库。
EOF
