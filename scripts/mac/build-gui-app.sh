#!/usr/bin/env bash
# build-gui-app.sh
# 组装 DuckovCoopPrepare.app，并打成 Release 用的 zip。
# Assemble DuckovCoopPrepare.app and zip it for a GitHub Release.
#
# 在 Mac 上运行时，会用本机 codesign 身份 "-" 给这个准备工具签名。
# On a Mac, this also signs the helper with the local codesign identity "-".
# Linux 只能打包，不能签名。上传 Release 前请在 Mac 上运行一次。
# Linux can pack the zip only. Run this once on a Mac before uploading the Release asset.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$ROOT/dist"
APP="$DIST/DuckovCoopPrepare.app"
ZIP="$DIST/DuckovCoopPrepare-mac.zip"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/duckov-coop-gui.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$DIST"
printf '%s\n' '*.zip' >"$DIST/.gitignore"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$ROOT/gui/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' >"$APP/Contents/PkgInfo"
cp "$ROOT/gui/launcher.sh" "$APP/Contents/MacOS/DuckovCoopPrepare"
cp "$ROOT/gui/main.js" "$APP/Contents/Resources/main.js"
cp "$ROOT/gui/release-match.js" "$APP/Contents/Resources/release-match.js"
cp "$ROOT/gui/fetch-mod-zip.sh" "$APP/Contents/Resources/fetch-mod-zip.sh"
cp "$ROOT/prepare-duckov-coop-app.sh" "$APP/Contents/Resources/prepare-duckov-coop-app.sh"
cp "$ROOT/sync-duckov-config.sh" "$APP/Contents/Resources/sync-duckov-config.sh"
cp "$ROOT/duckov-coop.entitlements" "$APP/Contents/Resources/duckov-coop.entitlements"

chmod 755 "$APP/Contents/MacOS/DuckovCoopPrepare" \
  "$APP/Contents/Resources/prepare-duckov-coop-app.sh" \
  "$APP/Contents/Resources/fetch-mod-zip.sh" \
  "$APP/Contents/Resources/sync-duckov-config.sh"
chmod 644 "$APP/Contents/Info.plist" \
  "$APP/Contents/PkgInfo" \
  "$APP/Contents/Resources/main.js" \
  "$APP/Contents/Resources/release-match.js" \
  "$APP/Contents/Resources/duckov-coop.entitlements"

# zip copies from a directory whose files are already executable.
# Recreate the bundle in a staging dir so the archive root is DuckovCoopPrepare.app.
cp -R "$APP" "$STAGE/DuckovCoopPrepare.app"
chmod 755 "$STAGE/DuckovCoopPrepare.app/Contents/MacOS/DuckovCoopPrepare" \
  "$STAGE/DuckovCoopPrepare.app/Contents/Resources/prepare-duckov-coop-app.sh" \
  "$STAGE/DuckovCoopPrepare.app/Contents/Resources/fetch-mod-zip.sh" \
  "$STAGE/DuckovCoopPrepare.app/Contents/Resources/sync-duckov-config.sh"

if [[ "$(uname -s)" == "Darwin" ]] && command -v codesign >/dev/null 2>&1; then
  if codesign --force --deep --sign - "$APP" && codesign --force --deep --sign - "$STAGE/DuckovCoopPrepare.app"; then
    printf '%s\n' 'Signed with the local codesign identity "-".'
  else
    printf '%s\n' 'codesign failed. The zip is still packed; the first open needs Control-click → Open.'
  fi
else
  printf '%s\n' 'This machine cannot sign Mac apps. The zip is still usable; the first open needs Control-click → Open.'
  printf '%s\n' 'Run this script once on a Mac before uploading the Release asset.'
fi

rm -f "$ZIP"
(
  cd "$STAGE"
  zip -r -y -X "$ZIP" "DuckovCoopPrepare.app"
)

python3 - "$ZIP" <<'PY'
import sys
import zipfile

zip_path = sys.argv[1]
required = {
    "DuckovCoopPrepare.app/Contents/Info.plist": None,
    "DuckovCoopPrepare.app/Contents/PkgInfo": None,
    "DuckovCoopPrepare.app/Contents/MacOS/DuckovCoopPrepare": 0o755,
    "DuckovCoopPrepare.app/Contents/Resources/main.js": None,
    "DuckovCoopPrepare.app/Contents/Resources/release-match.js": None,
    "DuckovCoopPrepare.app/Contents/Resources/fetch-mod-zip.sh": 0o755,
    "DuckovCoopPrepare.app/Contents/Resources/prepare-duckov-coop-app.sh": 0o755,
    "DuckovCoopPrepare.app/Contents/Resources/sync-duckov-config.sh": 0o755,
    "DuckovCoopPrepare.app/Contents/Resources/duckov-coop.entitlements": None,
}
with zipfile.ZipFile(zip_path) as archive:
    infos = {info.filename: info for info in archive.infolist()}
    missing = [name for name in required if name not in infos]
    if missing:
        raise SystemExit("zip is missing: " + ", ".join(missing))
    pkg = archive.read("DuckovCoopPrepare.app/Contents/PkgInfo")
    if pkg != b"APPL????":
        raise SystemExit("PkgInfo is not 8 bytes APPL????: %r" % pkg)
    for name, mode in required.items():
        if mode is None:
            continue
        stored = (infos[name].external_attr >> 16) & 0o777
        if stored != mode:
            raise SystemExit("%s mode is %s, expected %s" % (name, oct(stored), oct(mode)))
print("zip layout ok")
PY

printf '%s\n' "App: $APP"
printf '%s\n' "Release asset: $ZIP"
