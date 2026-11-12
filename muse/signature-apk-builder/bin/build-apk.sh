#!/usr/bin/env bash
# 签名工坊 · 一键构建 debug APK（供 Muse 云端执行）
# 用法：bash bin/build-apk.sh [仓库地址]
#   不带参数：假定当前目录已是仓库根
#   带参数  ：先 git clone 到 $WORK 再构建
set -euo pipefail

REPO_URL="${1:-}"
WORK="${WORK:-$HOME/workspace/signature-studio}"
SUDO="sudo"
command -v sudo >/dev/null 2>&1 || SUDO=""

log() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# ---------- 0. 取代码 ----------
if [ -n "$REPO_URL" ]; then
  log "clone 仓库"
  rm -rf "$WORK"
  git clone "$REPO_URL" "$WORK"
  cd "$WORK"
fi
[ -f "CLOUD_BUILD.md" ] || { echo "当前目录不像仓库根（缺 CLOUD_BUILD.md）"; exit 2; }

# ---------- 1. 依赖 ----------
log "检查依赖"
command -v git  >/dev/null || { echo "缺 git"; exit 3; }
if ! command -v node >/dev/null; then
  echo "缺 node，请先安装 Node 20+："
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs"
  exit 3
fi
if ! command -v java >/dev/null; then
  echo "缺 JDK17，正在安装…"
  $SUDO apt-get update -y >/dev/null
  $SUDO apt-get install -y openjdk-17-jdk unzip curl >/dev/null
fi
java -version 2>&1 | head -1
node -v

# ---------- 2. Android SDK ----------
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
if [ ! -d "$ANDROID_HOME/platforms/android-34" ]; then
  log "安装 Android SDK 到 $ANDROID_HOME"
  $SUDO mkdir -p "$ANDROID_HOME/cmdline-tools"
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/cmdline.zip" \
    https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  $SUDO unzip -q "$TMP/cmdline.zip" -d "$ANDROID_HOME/cmdline-tools"
  [ -d "$ANDROID_HOME/cmdline-tools/cmdline-tools" ] && \
    $SUDO mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

# ---------- 3. 素材 + assets ----------
log "拉字体与笔顺数据"
node scripts/fetch-assets.mjs
log "打包进 assets"
bash android/copy-assets.sh

# ---------- 4. 构建 ----------
log "构建 APK"
cd android
if [ ! -f gradlew ]; then
  if ! command -v gradle >/dev/null; then
    TMP2=$(mktemp -d)
    curl -fsSL -o "$TMP2/gradle.zip" https://services.gradle.org/distributions/gradle-8.7-bin.zip
    $SUDO unzip -q "$TMP2/gradle.zip" -d /opt
    command -v gradle >/dev/null || $SUDO ln -sf /opt/gradle-8.7/bin/gradle /usr/local/bin/gradle
  fi
  gradle wrapper --gradle-version 8.7
fi
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || { echo "构建失败：找不到 $APK"; exit 4; }

log "完成"
ls -lh "$APK"
echo "APK_ABS_PATH=$(pwd)/$APK"
