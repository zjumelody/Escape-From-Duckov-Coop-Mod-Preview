#!/bin/bash
# DuckovCoopPrepare.app executable. macOS LaunchServices runs this on double-click.
# It starts the JavaScript for Automation window, which calls prepare-duckov-coop-app.sh.

set -u

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in
    /*) ;;
    *) SOURCE="$DIR/$SOURCE" ;;
  esac
done

MACOS_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
RESOURCES="$(cd -P "$MACOS_DIR/../Resources" && pwd)"
APP_BUNDLE="$(cd -P "$MACOS_DIR/../.." && pwd)"
PARENT="$(dirname "$APP_BUNDLE")"

export DUCKOV_COOP_PREPARE_RESOURCES="$RESOURCES"
export DUCKOV_COOP_PREPARE_APP="$APP_BUNDLE"
export DUCKOV_COOP_PREPARE_PARENT="$PARENT"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export LANG="${LANG:-en_US.UTF-8}"
export LC_CTYPE="${LC_CTYPE:-UTF-8}"

chmod +x "$RESOURCES/prepare-duckov-coop-app.sh" "$RESOURCES/fetch-mod-zip.sh" "$RESOURCES/sync-duckov-config.sh" "$RESOURCES/config-fingerprint.sh" "$RESOURCES/check-coop-copy.sh" 2>/dev/null || true
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true
fi

cd "$PARENT" 2>/dev/null || cd "${HOME:-/}" 2>/dev/null || true

LOG_DIR="${HOME:-/tmp}/Library/Logs"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="${TMPDIR:-/tmp}"
LOG="$LOG_DIR/DuckovCoopPrepare-launch.log"
: >"$LOG" 2>/dev/null || true

set +e
/usr/bin/osascript -l JavaScript "$RESOURCES/main.js" >>"$LOG" 2>&1
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  /usr/bin/osascript - "$LOG" <<'EOF' || true
on run argv
  display dialog "准备工具未能打开。请重新下载 DuckovCoopPrepare-mac.zip，解压后再试。" & return & "若系统拦截，请按住 Control 点按本应用并选择「打开」。" & return & return & "The prepare helper failed to open. Download DuckovCoopPrepare-mac.zip again, unzip it, and try once more." & return & "If macOS blocked it, Control-click this app and choose Open." & return & return & "Log: " & item 1 of argv buttons {"好 / OK"} default button 1
end run
EOF
fi

exit "$status"
