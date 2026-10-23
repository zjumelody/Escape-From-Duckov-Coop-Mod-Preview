#!/usr/bin/env bash
# fetch-mod-zip.sh
# 下载本 Fork Release 里的 EscapeFromDuckovCoopMod*.zip 并解压。
# Download one EscapeFromDuckovCoopMod*.zip from this fork's Releases and unzip it.
#
# 用法 / Usage:
#   fetch-mod-zip.sh --url URL --zip FILE --dest DIR
#   fetch-mod-zip.sh --skip-download --zip FILE --dest DIR
#
# URL 必须属于本仓库的 Releases 下载地址。
# URL must be a Releases download URL from this repository.

set -euo pipefail

URL=""
ZIP=""
DEST=""
SKIP=0
PREFIX="https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases/download/"

log() {
  printf '%s\n' "$@"
  if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
    printf '%s\n' "$@" >>"$DUCKOV_GUI_LOG" || true
  fi
}

die() {
  log "$@"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      [[ $# -ge 2 ]] || die "缺少下载地址。 / Missing download URL."
      URL="$2"
      shift 2
      ;;
    --zip)
      [[ $# -ge 2 ]] || die "缺少 zip 路径。 / Missing zip path."
      ZIP="$2"
      shift 2
      ;;
    --dest)
      [[ $# -ge 2 ]] || die "缺少解压目录。 / Missing unzip folder."
      DEST="$2"
      shift 2
      ;;
    --skip-download)
      SKIP=1
      shift
      ;;
    *)
      die "未知参数：${1} / Unknown argument: ${1}"
      ;;
  esac
done

[[ -n "$ZIP" && -n "$DEST" ]] || die "需要 --zip 和 --dest。 / --zip and --dest are required."

case "$DEST" in
  /*) ;;
  *)
    die "解压目录必须是绝对路径。 / Unzip folder must be an absolute path."
    ;;
esac
case "$DEST" in
  *..*)
    die "拒绝不安全的解压目录。 / Refusing an unsafe unzip folder."
    ;;
esac
case "$DEST" in
  "/"|"/Applications"|"/System"|"/usr"|"/bin"|"/Users"|"${HOME:-}"|"${HOME:-}/")
    die "拒绝不安全的解压目录。 / Refusing an unsafe unzip folder."
    ;;
esac

base="$(basename "$DEST")"
lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
case "$lower" in
  escapefromduckovcoopmod*)
    ;;
  *)
    die "拒绝意外的解压目录名。 / Refusing an unexpected unzip folder name."
    ;;
esac

if [[ "$SKIP" -eq 0 ]]; then
  [[ -n "$URL" ]] || die "缺少下载地址。 / Missing download URL."
  case "$URL" in
    "$PREFIX"*)
      ;;
    *)
      die "拒绝非本仓库的下载地址。 / Refusing a download URL outside this repository."
      ;;
  esac
  case "$URL" in
    *" "*|*$'\n'*|*$'\r'*)
      die "拒绝异常的下载地址。 / Refusing an unexpected download URL."
      ;;
  esac
  mkdir -p "$(dirname "$ZIP")"
  log "正在下载，请稍候… / Downloading, please wait…"
  log "$URL"
  log "保存到 / Saving to: $ZIP"
  downloaded=0
  if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
    if curl -fL --retry 3 --retry-delay 2 --max-time 300 -sS -A 'DuckovCoopPrepare' -o "$ZIP" "$URL" >>"$DUCKOV_GUI_LOG" 2>&1; then
      downloaded=1
    fi
  else
    if curl -fL --retry 3 --retry-delay 2 --max-time 300 -sS -A 'DuckovCoopPrepare' -o "$ZIP" "$URL"; then
      downloaded=1
    fi
  fi
  if [[ "$downloaded" -ne 1 ]]; then
    die "下载失败。 / Download failed."
  fi
else
  [[ -f "$ZIP" ]] || die "找不到 zip：${ZIP} / Zip not found: ${ZIP}"
fi

log "正在解压 / Unzipping: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
unzipped=0
if command -v ditto >/dev/null 2>&1; then
  if ditto -x -k "$ZIP" "$DEST"; then
    unzipped=1
  fi
elif command -v unzip >/dev/null 2>&1; then
  if unzip -q -o "$ZIP" -d "$DEST"; then
    unzipped=1
  fi
else
  die "需要 ditto 或 unzip 才能解压。 / Need ditto or unzip to extract the archive."
fi
if [[ "$unzipped" -ne 1 ]]; then
  die "解压失败。 / Unzip failed."
fi

if [[ -n "${DUCKOV_MODS_RESULT:-}" ]]; then
  printf '%s\n' "$DEST" >"$DUCKOV_MODS_RESULT"
fi
log "下载并解压完成。 / Download and unzip finished."
log "$DEST"
