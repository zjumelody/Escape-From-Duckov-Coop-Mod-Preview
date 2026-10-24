#!/usr/bin/env bash
# prepare-duckov-coop-app.sh
# 为 Mac 联机准备一份可写的《逃离鸭科夫》副本：复制 App、关闭 App Sandbox、
# 加入 network.client / network.server，并用本机 codesign 身份 "-" 重新签名。
# 不修改原版 App。Mods 只进入副本。
# 安装联机 Mod 时，副本里同一联机 Mod 的旧目录会被换成一份新的，其他 Mod 保留。
#
# Prepare a writable macOS copy of Duckov for co-op: copy the app, turn off
# App Sandbox, add network.client / network.server, and re-sign the copy with
# the local codesign identity "-". The original app is not modified. Mods go
# into the copy only.
# Installing the co-op Mod replaces older folders of that same mod in the copy.
# Other mods stay.
#
# 推荐路径是图形工具 DuckovCoopPrepare.app。本脚本是高级备用。
# The recommended path is the graphical helper DuckovCoopPrepare.app.
# This script is the advanced fallback.
#
# 路径 / Path: scripts/mac/prepare-duckov-coop-app.sh
# Entitlements: scripts/mac/duckov-coop.entitlements（同目录缺失时脚本会临时生成同样内容）
#               (if that file is not beside the script, the same plist is written to a temp file)

set -euo pipefail
shopt -s nullglob

TMP_WORK=""
trap '[[ -n "${TMP_WORK:-}" ]] && rm -rf "$TMP_WORK"' EXIT

SOURCE="${SOURCE:-${DUCKOV_SOURCE:-/Applications/Duckov.app}}"
DEST="${DEST:-${DUCKOV_DEST:-${HOME:-}/Applications/Duckov-COOP.app}}"
MODS_DIR="${MODS_DIR:-${DUCKOV_MODS_DIR:-}}"
FORCE="${FORCE:-0}"
UPDATE_MODS="${UPDATE_MODS:-0}"
LIST_COOP_MODS=0
DEDUPE_COOP_MODS=0
KEEP_VERSION=""
ALLOW_SKIP_SAME=0
SKIPPED_SAME_VERSION=0
REMOVED_COOP_COUNT=0
INSTALLED_COUNT=0
RESTORED_MODS=0
USED_MODS_LABEL=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
用法 / Usage:
  prepare-duckov-coop-app.sh [--source APP] [--dest APP] [--mods-dir DIR] [--force]
  prepare-duckov-coop-app.sh --update-mods [--source APP] --dest APP --mods-dir DIR

把官方 Duckov.app 复制到可写位置，只改副本的 entitlements，并用本机 codesign 身份 "-" 重新签名。
Copy an official Duckov.app to a writable location, adjust entitlements on the copy only,
and re-sign that copy with the local codesign identity "-".

推荐 / Recommended:
  图形工具 DuckovCoopPrepare.app（Release 附件 DuckovCoopPrepare-mac-1.5.0.zip）。
  The graphical app DuckovCoopPrepare.app (Release asset DuckovCoopPrepare-mac-1.5.0.zip).
  本脚本是高级备用方式。 / This script is the advanced fallback.

默认 / Defaults:
  --source   /Applications/Duckov.app
  --dest     ~/Applications/Duckov-COOP.app

可选 / Optional:
  --mods-dir 已解压的 Mods 目录（其下每个含 .dll 的文件夹会装入副本 Contents/Mods/）
             Unzipped Mods directory (each folder that contains a .dll is copied into the copy's Contents/Mods/)
  --force    目标已存在时直接替换，不再询问
             Replace an existing destination without asking
  --update-mods
             不复制整份 App。把 --mods-dir 里的 Mac 联机 Mod 装进已经存在的副本 Contents/Mods/，
             再用本机 codesign 身份 "-" 重新签名。原版不会被修改。
             副本里同一联机 Mod 的旧目录会先去掉，只留一份新的。其他 Mod（例如背包扩展）保留。
             若副本里已经是同一个版本，则跳过覆盖和重新签名。
             Do not copy the whole app. Install the Mac co-op Mod from --mods-dir into an existing
             copy's Contents/Mods/, then re-sign that copy with the local codesign identity "-".
             The original app is not modified.
             Older folders of this same co-op Mod are removed first so only one new copy remains.
             Other mods (for example a backpack expansion) stay.
             If the copy already has that same version, overwrite and re-sign are skipped.
  --list-coop-mods
             只列出 --dest 副本 Contents/Mods/ 或 --mods-dir 里的联机 Mod。不修改任何文件。
             每行：COOP_MOD、版本（没有则是 -）、路径，以制表符分开。
             Only list co-op Mod folders in the --dest copy's Contents/Mods/ or in --mods-dir.
             Nothing is modified. Each line is COOP_MOD, a version (or -), and the path, tab-separated.
  --dedupe-coop-mods
             不安装新文件。去掉副本里重复的联机 Mod 目录，只留一份（可用 --keep-version 指定版本）。
             其他 Mod 保留。原版不会被修改。有目录被去掉时才会重新签名。
             Do not install new files. Remove duplicate co-op Mod folders in the copy so one remains
             (--keep-version picks which version). Other mods stay. The original app is not modified.
             The copy is re-signed only when a folder was removed.
  --keep-version VER
             配合 --dedupe-coop-mods。保留这个版本，去掉同属联机 Mod 的其他目录。
             With --dedupe-coop-mods. Keep this version and remove other folders of the same co-op Mod.
  -h, --help 显示本说明 / Show this help

环境变量（命令行优先）/ Environment (flags win):
  SOURCE 或 DUCKOV_SOURCE
  DEST 或 DUCKOV_DEST
  MODS_DIR 或 DUCKOV_MODS_DIR
  FORCE=1
  DUCKOV_GUI_LOG  若设置，进度会同时追加写入该文件（供图形工具显示）
                  When set, progress is also appended to this file for the graphical helper

未指定 --mods-dir 时，若脚本旁边（或当前目录）有较新的
EscapeFromDuckovCoopMod*.zip / *Duckov*Coop*.zip，会自动装入副本。
When --mods-dir is omitted, a newer EscapeFromDuckovCoopMod*.zip or *Duckov*Coop*.zip
next to the script (or in the current directory) is installed into the copy.

示例 / Examples:
  ./prepare-duckov-coop-app.sh
  ./prepare-duckov-coop-app.sh --source "$HOME/Games/Duckov.app"
  ./prepare-duckov-coop-app.sh --mods-dir "$HOME/Downloads/Mods" --force
  ./prepare-duckov-coop-app.sh --update-mods --dest "$HOME/Applications/Duckov-COOP.app" --mods-dir "$HOME/Downloads/Mods"

只启动副本进行联机。不要把 Mods 放进原版 App。各方 ModVersion 必须完全一致。
Launch only the copy for co-op. Do not put Mods in the original app.
Every peer must use the exact same ModVersion string.
EOF
}

gui_log() {
  [[ -n "${DUCKOV_GUI_LOG:-}" ]] || return 0
  printf '%s\n' "$@" >>"$DUCKOV_GUI_LOG" || true
}

die() {
  printf '%s\n' "$@" >&2
  gui_log "$@"
  exit 1
}

note() {
  printf '%s\n' "$@"
  gui_log "$@"
}

expand_tilde() {
  local input="$1"
  case "$input" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s\n' "$HOME/${input#"~/"}"
      ;;
    *)
      printf '%s\n' "$input"
      ;;
  esac
}

abs_path() {
  local input
  input="$(expand_tilde "$1")"
  if [[ "$input" != /* ]]; then
    input="$PWD/$input"
  fi
  if [[ "$input" != "/" ]]; then
    input="${input%/}"
  fi
  printf '%s\n' "$input"
}

require_macos() {
  local kernel
  kernel="$(uname -s)"
  if [[ "$kernel" != "Darwin" ]]; then
    die \
      "此脚本只能在 macOS 上运行（当前系统：${kernel}）。" \
      "This script only runs on macOS (current system: ${kernel})."
  fi
}

write_default_entitlements() {
  local dest_file="$1"
  cat >"$dest_file" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<!--
	  Entitlements for the local Duckov-COOP.app copy only.
	  只用于本机 Duckov-COOP.app 副本。
	  App Sandbox off; network client and server on.
	  关闭 App Sandbox；开启 network.client 与 network.server。
	-->
	<key>com.apple.security.app-sandbox</key>
	<false/>
	<key>com.apple.security.network.client</key>
	<true/>
	<key>com.apple.security.network.server</key>
	<true/>
</dict>
</plist>
EOF
}

resolve_entitlements() {
  local bundled generated
  bundled="$SCRIPT_DIR/duckov-coop.entitlements"
  if [[ -f "$bundled" ]]; then
    note \
      "使用同目录 entitlements：${bundled}" \
      "Using the entitlements file beside the script: ${bundled}" >&2
    printf '%s\n' "$bundled"
    return 0
  fi
  generated="$TMP_WORK/duckov-coop.entitlements"
  write_default_entitlements "$generated"
  note \
    "未找到同目录 plist，已写入临时 entitlements（内容与仓库中的 duckov-coop.entitlements 相同）。" \
    "No plist beside the script; wrote a temporary entitlements file (same keys as duckov-coop.entitlements)." >&2
  printf '%s\n' "$generated"
}

confirm_replace() {
  local answer
  if [[ ! -e "$DEST" ]]; then
    return 0
  fi
  if [[ "$FORCE" -eq 1 ]]; then
    note \
      "目标已存在，因 --force 将替换副本（已装入的 Mods 会保留并在签名前放回）。" \
      "Destination exists; --force will replace the copy (Mods already inside are kept and put back before signing)."
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die \
      "目标已存在：${DEST}" \
      "非交互模式下请加上 --force 后再运行。" \
      "Destination exists: ${DEST}" \
      "Pass --force when input is not a terminal."
  fi
  printf '%s\n' "目标已存在：${DEST}"
  printf '%s\n' "Destination exists: ${DEST}"
  printf '%s' "是否替换？已安装的 Mods 会保留。输入 y 或 是 继续 / Replace it? Installed Mods are kept. Type y or 是 to continue [y/N] "
  read -r answer || true
  case "$answer" in
    y|Y|yes|YES|是)
      return 0
      ;;
    *)
      die "已取消。 / Cancelled."
      ;;
  esac
}

copy_tree() {
  local src="$1"
  local dest="$2"
  if command -v ditto >/dev/null 2>&1; then
    rm -rf "$dest"
    ditto "$src" "$dest"
    return 0
  fi
  if command -v rsync >/dev/null 2>&1; then
    rm -rf "$dest"
    mkdir -p "$dest"
    rsync -a "$src/" "$dest/"
    return 0
  fi
  if command -v cp >/dev/null 2>&1; then
    rm -rf "$dest"
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
    return 0
  fi
  die \
    "需要 macOS 自带的 ditto（或 rsync）才能复制 App。" \
    "Need ditto (shipped with macOS) or rsync to copy the app."
}

extract_zip() {
  local zip="$1"
  local dest="$2"
  mkdir -p "$dest"
  if command -v ditto >/dev/null 2>&1; then
    ditto -x -k "$zip" "$dest"
    return 0
  fi
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$zip" -d "$dest"
    return 0
  fi
  die \
    "需要 ditto 或 unzip 才能解压 Mod 压缩包。" \
    "Need ditto or unzip to extract the mod archive."
}

collect_package_dirs() {
  local root="$1"
  local out="$2"
  local dll_list dir
  dll_list="$TMP_WORK/dll-list"
  : >"$dll_list"
  : >"$out"
  find "$root" -type f -name '*.dll' ! -path '*/__MACOSX/*' >"$dll_list"
  while IFS= read -r dll; do
    [[ -n "$dll" ]] || continue
    dir="$(dirname "$dll")"
    printf '%s\n' "$dir"
  done <"$dll_list" | sort -u >"$out"
}

sort_by_depth() {
  local input="$1"
  local output="$2"
  local pkg slashes
  : >"$output"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    slashes="${pkg//[^\/]/}"
    printf '%s %s\n' "${#slashes}" "$pkg"
  done <"$input" | sort -n -k1,1 | cut -d' ' -f2- >"$output"
}

select_outer_packages() {
  local input="$1"
  local output="$2"
  local pkg prior skip
  : >"$output"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    skip=0
    while IFS= read -r prior; do
      [[ -n "$prior" ]] || continue
      case "$pkg/" in
        "$prior"/*)
          skip=1
          break
          ;;
      esac
    done <"$output"
    if [[ "$skip" -eq 0 ]]; then
      printf '%s\n' "$pkg" >>"$output"
    fi
  done <"$input"
}

# 同一联机 Mod 家族：创意工坊目录、本 Fork 的 Mac 包、上游目录名，以及 info.ini / 主 DLL。
# 背包扩展等其他 Mod 不在此列。只用来识别，不会按这个规则删除原版 App 里的文件。
# One co-op mod family: the workshop folder, this fork's Mac package, upstream folder
# names, plus info.ini / the main DLL. Other mods (a backpack expansion, for example)
# are not included. This only identifies folders. It never deletes files in the original app.
name_is_coop_family() {
  local raw="$1"
  local norm
  norm="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d ' _.-')"
  case "$norm" in
    *3591341282*|*escapefromduckovcoop*|*duckovcoopmod*)
      return 0
      ;;
  esac
  case "$raw" in
    *逃离鸭科夫联机*)
      return 0
      ;;
  esac
  return 1
}

normalize_version_label() {
  local v
  v="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d ' \t')"
  v="${v#v}"
  case "$v" in
    ""|"-"|"?"|"unknown")
      v=""
      ;;
  esac
  printf '%s\n' "$v"
}

versions_same() {
  local a b
  a="$(normalize_version_label "$1")"
  b="$(normalize_version_label "$2")"
  [[ -n "$a" && "$a" == "$b" ]]
}

versions_tie() {
  local a b
  a="$(normalize_version_label "$1")"
  b="$(normalize_version_label "$2")"
  [[ "$a" == "$b" ]]
}

version_parts() {
  local v num rest rest2 major minor patch
  v="$(normalize_version_label "$1")"
  num="${v%%[-_+]*}"
  major="${num%%.*}"
  if [[ "$num" == *.* ]]; then
    rest="${num#*.}"
    minor="${rest%%.*}"
    if [[ "$rest" == *.* ]]; then
      rest2="${rest#*.}"
      patch="${rest2%%.*}"
    else
      patch=0
    fi
  else
    minor=0
    patch=0
  fi
  major="${major//[^0-9]/}"
  minor="${minor//[^0-9]/}"
  patch="${patch//[^0-9]/}"
  [[ -n "$major" ]] || major=0
  [[ -n "$minor" ]] || minor=0
  [[ -n "$patch" ]] || patch=0
  printf '%s %s %s\n' "$major" "$minor" "$patch"
}

version_is_newer() {
  local a1 b1 c1 a2 b2 c2
  read -r a1 b1 c1 <<<"$(version_parts "$1")"
  read -r a2 b2 c2 <<<"$(version_parts "$2")"
  if (( a1 != a2 )); then
    if (( a1 > a2 )); then
      return 0
    fi
    return 1
  fi
  if (( b1 != b2 )); then
    if (( b1 > b2 )); then
      return 0
    fi
    return 1
  fi
  if (( c1 != c2 )); then
    if (( c1 > c2 )); then
      return 0
    fi
    return 1
  fi
  return 1
}

ini_marks_coop_family() {
  local ini="$1"
  local line key val val_norm
  [[ -f "$ini" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      \#*|\;*|"")
        continue
        ;;
    esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d ' \t' | tr '[:upper:]' '[:lower:]')"
    val="$(printf '%s' "$val" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')"
    val_norm="$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]' | tr -d ' \t')"
    case "$key" in
      publishedfileid|workshopid)
        [[ "$val_norm" == "3591341282" ]] && return 0
        ;;
      name|modname|id)
        [[ "$val_norm" == "escapefromduckovcoopmod" ]] && return 0
        ;;
    esac
  done <"$ini"
  return 1
}

ini_version_label() {
  local ini="$1"
  local line key val
  [[ -f "$ini" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d ' \t' | tr '[:upper:]' '[:lower:]')"
    val="$(printf '%s' "$val" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')"
    if [[ "$key" == "version" ]]; then
      case "$(normalize_version_label "$val")" in
        "")
          return 0
          ;;
        *)
          if [[ "$val" == *[0-9]* && "$val" == *.* ]]; then
            printf '%s\n' "$val"
          fi
          return 0
          ;;
      esac
    fi
  done <"$ini"
  return 0
}

# channel=melody-fork ⇒ Melody's Mac fork. Missing/other ⇒ 原版 (upstream/workshop).
# channel=melody-fork means Melody's Mac fork. Anything else (or missing) is 原版.
ini_channel_label() {
  local ini="$1"
  local line key val
  [[ -f "$ini" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(printf '%s' "$key" | tr -d ' \t' | tr '[:upper:]' '[:lower:]')"
    val="$(printf '%s' "$val" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')"
    if [[ "$key" == "channel" ]]; then
      val="$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]' | tr -d ' \t')"
      if [[ "$val" == "melody-fork" ]]; then
        printf '%s\n' "melody-fork"
      fi
      return 0
    fi
  done <"$ini"
  return 0
}

package_channel_label() {
  local dir="$1"
  local ch file
  [[ -d "$dir" ]] || return 0
  ch="$(ini_channel_label "$dir/info.ini")"
  if [[ -n "$ch" ]]; then
    printf '%s\n' "$ch"
    return 0
  fi
  for file in "$dir"/*/info.ini; do
    [[ -f "$file" ]] || continue
    ch="$(ini_channel_label "$file")"
    if [[ -n "$ch" ]]; then
      printf '%s\n' "$ch"
      return 0
    fi
  done
  return 0
}

is_melody_fork_package() {
  local dir="$1"
  local ch
  ch="$(package_channel_label "$dir")"
  [[ "$ch" == "melody-fork" ]]
}

# Install folder for Melody's Mac fork: 3591341282_EscapeFromDuckovCoopMod_{version}
# Example: 3591341282_EscapeFromDuckovCoopMod_1.4.2_melody (no literal "v" prefix).
ensure_melody_fork_channel() {
  local dir="$1"
  local ini="$dir/info.ini"
  local tmp line key found=0
  [[ -d "$dir" ]] || return 0
  if [[ ! -f "$ini" ]]; then
    printf '%s\n' \
      'name = EscapeFromDuckovCoopMod' \
      'publishedFileId = 3591341282' \
      'channel = melody-fork' \
      'version = ?' >"$ini"
    return 0
  fi
  tmp="$ini.melody-channel.tmp"
  : >"$tmp"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      key="$(printf '%s' "$key" | tr -d ' \t' | tr '[:upper:]' '[:lower:]')"
      if [[ "$key" == "channel" ]]; then
        printf '%s\n' 'channel = melody-fork' >>"$tmp"
        found=1
        continue
      fi
    fi
    printf '%s\n' "$line" >>"$tmp"
  done <"$ini"
  if [[ "$found" -eq 0 ]]; then
    printf '%s\n' 'channel = melody-fork' >>"$tmp"
  fi
  mv "$tmp" "$ini"
}

coop_install_dir_name() {
  local ver="$1"
  local safe
  safe="$(printf '%s' "$ver" | tr -d '/\\:\0' | tr ' ' '_')"
  safe="$(normalize_version_label "$safe")"
  [[ -n "$safe" ]] || safe="unknown"
  printf '%s\n' "3591341282_EscapeFromDuckovCoopMod_${safe}"
}


dir_has_coop_dll() {
  local dir="$1"
  local file base
  [[ -d "$dir" ]] || return 1
  for file in "$dir"/*.dll "$dir"/*.DLL; do
    [[ -f "$file" ]] || continue
    base="$(basename "$file")"
    base="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
    [[ "$base" == "escapefromduckovcoopmod.dll" ]] && return 0
  done
  return 1
}

find_coop_dll() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  find "$dir" -maxdepth 3 -type f -iname 'EscapeFromDuckovCoopMod.dll' ! -path '*/__MACOSX/*' -print -quit 2>/dev/null || true
}

# 目录本身是一份联机 Mod，而不是「里面碰巧有一份联机 Mod」的 Mods 总目录。
# The directory is one co-op Mod package, not a Mods root that merely contains one.
is_coop_package() {
  local dir="$1"
  local base ini
  [[ -d "$dir" ]] || return 1
  base="$(basename "$dir")"
  [[ "$base" == "__MACOSX" ]] && return 1
  if [[ -f "$dir/info.ini" ]] && ini_marks_coop_family "$dir/info.ini"; then
    return 0
  fi
  if dir_has_coop_dll "$dir"; then
    return 0
  fi
  if name_is_coop_family "$base"; then
    for ini in "$dir"/*/info.ini; do
      [[ -f "$ini" ]] || continue
      if ini_marks_coop_family "$ini"; then
        return 0
      fi
    done
    if [[ -n "$(find_coop_dll "$dir")" ]]; then
      return 0
    fi
    # 创意工坊编号这类目录名本身就够了，即使 dll 还没放进去。
    # A workshop-id style folder name is enough even before the dll is present.
    return 0
  fi
  return 1
}

dll_version_label() {
  local dll="$1"
  local bin out
  [[ -f "$dll" ]] || return 0
  bin=""
  if [[ -x /usr/bin/strings ]]; then
    bin=/usr/bin/strings
  elif command -v strings >/dev/null 2>&1; then
    bin="$(command -v strings)"
  else
    return 0
  fi
  out="$("$bin" -a -n 3 "$dll" 2>/dev/null | awk '
function is3(s) { return s ~ /^[0-9]+\.[0-9]+\.[0-9]+$/ }
function is4(s) { return s ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ }
{
  n++
  line[n] = $0
}
END {
  chosen = ""
  tn = 0
  for (i = 1; i <= n; i++) {
    if (is3(line[i])) order[++tn] = line[i]
    if (is4(line[i])) four[line[i]] = 1
  }
  for (i = 1; i <= tn; i++) {
    if (four[order[i] ".0"]) chosen = order[i]
  }
  if (chosen == "" && tn >= 1) chosen = order[tn]
  if (chosen == "") {
    for (i = 1; i <= n; i++) {
      if (is4(line[i]) && line[i] ~ /\.0$/) {
        chosen = line[i]
        sub(/\.0$/, "", chosen)
      }
    }
  }
  if (chosen != "") print chosen
}
' || true)"
  printf '%s\n' "$out"
}

package_version_label() {
  local dir="$1"
  local file base best ini_ver dll
  best=""
  [[ -d "$dir" ]] || return 0
  for file in "$dir"/INSTALL_*.txt "$dir"/*/INSTALL_*.txt "$dir"/*/*/INSTALL_*.txt; do
    [[ -f "$file" ]] || continue
    base="$(basename "$file")"
    base="${base#INSTALL_}"
    base="${base%.txt}"
    base="${base%.TXT}"
    [[ -n "$base" ]] || continue
    if [[ -z "$best" ]] || version_is_newer "$base" "$best"; then
      best="$base"
    fi
  done
  if [[ -n "$best" ]]; then
    printf '%s\n' "$best"
    return 0
  fi
  ini_ver="$(ini_version_label "$dir/info.ini")"
  if [[ -z "$ini_ver" ]]; then
    for file in "$dir"/*/info.ini; do
      [[ -f "$file" ]] || continue
      ini_ver="$(ini_version_label "$file")"
      [[ -n "$ini_ver" ]] && break
    done
  fi
  if [[ -n "$ini_ver" ]]; then
    printf '%s\n' "$ini_ver"
    return 0
  fi
  dll="$(find_coop_dll "$dir")"
  if [[ -n "$dll" ]]; then
    dll_version_label "$dll"
  fi
  return 0
}

coop_package_score() {
  local dir="$1"
  local ver="$2"
  local score=0
  local base norm file
  base="$(basename "$dir")"
  norm="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | tr -d ' _.-')"
  case "$norm" in
    *escapefromduckovcoop*)
      score=$((score + 50))
      ;;
  esac
  case "$norm" in
    *3591341282*)
      score=$((score + 10))
      ;;
  esac
  if [[ -n "$(normalize_version_label "$ver")" ]]; then
    score=$((score + 20))
  fi
  for file in "$dir"/INSTALL_*.txt "$dir"/*/INSTALL_*.txt; do
    [[ -f "$file" ]] || continue
    score=$((score + 5))
    break
  done
  printf '%s\n' "$score"
}

list_contains_coop_package() {
  local list="$1"
  local pkg
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if is_coop_package "$pkg"; then
      return 0
    fi
  done <"$list"
  return 1
}

filter_to_one_coop_family() {
  local input="$1"
  local output="$2"
  local families="$TMP_WORK/coop-family-in"
  local pkg best best_ver best_score ver score
  : >"$output"
  : >"$families"
  best=""
  best_ver=""
  best_score=-1
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if is_coop_package "$pkg"; then
      printf '%s\n' "$pkg" >>"$families"
    else
      printf '%s\n' "$pkg" >>"$output"
    fi
  done <"$input"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    ver="$(package_version_label "$pkg")"
    score="$(coop_package_score "$pkg" "$ver")"
    if [[ -z "$best" ]]; then
      best="$pkg"
      best_ver="$ver"
      best_score="$score"
    elif version_is_newer "$ver" "$best_ver"; then
      best="$pkg"
      best_ver="$ver"
      best_score="$score"
    elif versions_tie "$ver" "$best_ver" && [[ "$score" -gt "$best_score" ]]; then
      best="$pkg"
      best_ver="$ver"
      best_score="$score"
    fi
  done <"$families"
  if [[ -z "$best" ]]; then
    return 0
  fi
  while IFS= read -r pkg; do
    [[ -n "$pkg" && "$pkg" != "$best" ]] || continue
    note \
      "来源里有多份联机 Mod，只安装较新的一份：$(basename "$best")${best_ver:+（${best_ver}）}。已跳过：$(basename "$pkg")" \
      "More than one co-op Mod was provided. Only the newer one is installed: $(basename "$best")${best_ver:+ (${best_ver})}. Skipped: $(basename "$pkg")"
  done <"$families"
  printf '%s\n' "$best" >>"$output"
}

incoming_coop_version() {
  local list="$1"
  local pkg
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if is_coop_package "$pkg"; then
      package_version_label "$pkg"
      return 0
    fi
  done <"$list"
  return 0
}

scan_dest_coop_packages() {
  local child
  EXISTING_COOP_COUNT=0
  EXISTING_COOP_VERSION=""
  [[ -d "$DEST/Contents/Mods" ]] || return 0
  for child in "$DEST/Contents/Mods"/*; do
    [[ -d "$child" ]] || continue
    if is_coop_package "$child"; then
      EXISTING_COOP_COUNT=$((EXISTING_COOP_COUNT + 1))
      EXISTING_COOP_VERSION="$(package_version_label "$child")"
    fi
  done
}

remove_tree_in_dest_mods() {
  local target="$1"
  local mods_root
  [[ -n "$target" && "$target" != "/" ]] || die \
    "拒绝删除意外路径。 / Refusing to delete an unexpected path."
  mods_root="$DEST/Contents/Mods"
  case "$target/" in
    "$mods_root/"*)
      ;;
    *)
      die \
        "拒绝删除 Mods 以外的路径：${target}" \
        "Refusing to delete a path outside Mods: ${target}"
      ;;
  esac
  case "$target" in
    "/"|"/Applications"|"${HOME:-}"|"/System"|"/usr"|"$DEST"|"$mods_root")
      die \
        "拒绝删除意外路径：${target}" \
        "Refusing to delete an unexpected path: ${target}"
      ;;
  esac
  rm -rf "$target" || return 1
  if [[ -e "$target" ]]; then
    return 1
  fi
  return 0
}

note_original_coop_mods() {
  local child found=0
  [[ -d "${SOURCE:-}/Contents/Mods" ]] || return 0
  # 原版和副本是同一个目录时不要把「即将删除的副本目录」说成原版。
  # Do not describe the copy as the original when they are the same path.
  if [[ "${SOURCE}" == "${DEST}" ]]; then
    return 0
  fi
  for child in "$SOURCE/Contents/Mods"/*; do
    [[ -d "$child" ]] || continue
    if is_coop_package "$child"; then
      found=1
      note \
        "原版 Mods 里有联机 Mod（不会修改原版）：$(basename "$child")" \
        "The original app's Mods folder has the co-op Mod (the original app is not modified): $(basename "$child")"
    fi
  done
  if [[ "$found" -eq 1 ]]; then
    note \
      "副本里只会留下一份即将安装的联机 Mod，不会和原版或其他旧联机 Mod 并排各留一份。" \
      "The copy will keep a single co-op Mod package, not the original or other older packages beside the one being installed."
  fi
}

# After a successful new install, remove EVERY other coop-family folder:
# 原版/workshop AND older melody-fork. They must not coexist.
# keep_path is the newly installed folder to retain.
purge_other_coop_family_in_dest() {
  local keep_path="$1"
  local child
  local failed=0
  local failed_names=""
  REMOVED_COOP_COUNT=0
  [[ -d "$DEST/Contents/Mods" ]] || return 0
  for child in "$DEST/Contents/Mods"/*; do
    [[ -d "$child" ]] || continue
    if [[ -n "$keep_path" && "$child" == "$keep_path" ]]; then
      continue
    fi
    if ! is_coop_package "$child"; then
      continue
    fi
    note \
      "已从副本移除同属联机 Mod 的旧目录，避免多份并存：$(basename "$child")" \
      "Removed an older co-op Mod folder from the copy so only one remains: $(basename "$child")"
    if ! remove_tree_in_dest_mods "$child"; then
      failed=1
      if [[ -n "$failed_names" ]]; then
        failed_names="${failed_names}, $(basename "$child")"
      else
        failed_names="$(basename "$child")"
      fi
    else
      REMOVED_COOP_COUNT=$((REMOVED_COOP_COUNT + 1))
    fi
  done
  if [[ "$failed" -eq 1 ]]; then
    die \
      "删除旧联机 Mod 失败。副本 Mods 里现在有多份同样的联机 Mod，请手动删除多余的一份后再试：${failed_names}" \
      "Failed to remove an older co-op Mod. Multiple copies of the same co-op Mod are now in the copy's Mods folder. Delete the extra one manually, then try again: ${failed_names}"
  fi
}

# Alias used by install_selected_packages (name kept stable across Melody's reversals).
purge_old_melody_fork_in_dest() {
  purge_other_coop_family_in_dest "$@"
}

purge_coop_family_in_dest() {
  # No keep_path — remove all coop-family folders (pre-install legacy path).
  purge_other_coop_family_in_dest ""
}

stage_list_outside_dest() {
  local input="$1"
  local output="$2"
  local root="$3"
  local fallback="$4"
  local pkg name dest_stage
  mkdir -p "$TMP_WORK/stage"
  : >"$output"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    case "$pkg/" in
      "$DEST/"*)
        if [[ "$pkg" == "$root" ]]; then
          name="$fallback"
        else
          name="$(basename "$pkg")"
        fi
        if [[ -z "$name" || "$name" == "." || "$name" == "/" ]]; then
          name="mod"
        fi
        dest_stage="$TMP_WORK/stage/$name"
        copy_tree "$pkg" "$dest_stage"
        printf '%s\n' "$dest_stage" >>"$output"
        ;;
      *)
        printf '%s\n' "$pkg" >>"$output"
        ;;
    esac
  done <"$input"
}

drop_coop_packages() {
  local input="$1"
  local output="$2"
  local pkg
  : >"$output"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if is_coop_package "$pkg"; then
      continue
    fi
    printf '%s\n' "$pkg" >>"$output"
  done <"$input"
}

install_selected_packages() {
  local list="$1"
  local root="$2"
  local fallback="$3"
  local filtered="$TMP_WORK/filtered-list"
  local ready="$TMP_WORK/ready-list"
  local others="$TMP_WORK/others-list"
  local incoming_ver
  local skip_coop=0
  SKIPPED_SAME_VERSION=0
  REMOVED_COOP_COUNT=0
  LAST_INSTALLED_COOP_PATH=""
  filter_to_one_coop_family "$list" "$filtered"
  stage_list_outside_dest "$filtered" "$ready" "$root" "$fallback"
  if list_contains_coop_package "$ready"; then
    incoming_ver="$(incoming_coop_version "$ready")"
    scan_dest_coop_packages
    # Skip only when exactly one melody-fork with the same version is already installed.
    # 仅当已有恰好一份同版本的 melody-fork 时跳过；原版可与 fork 并存。
    if [[ "${ALLOW_SKIP_SAME:-0}" -eq 1 && -n "$incoming_ver" ]]; then
      local melody_same=0
      local child
      if [[ -d "$DEST/Contents/Mods" ]]; then
        for child in "$DEST/Contents/Mods"/*; do
          [[ -d "$child" ]] || continue
          is_coop_package "$child" || continue
          is_melody_fork_package "$child" || continue
          if versions_same "$(package_version_label "$child")" "$incoming_ver"; then
            melody_same=$((melody_same + 1))
          fi
        done
      fi
      if [[ "$melody_same" -eq 1 ]]; then
        drop_coop_packages "$ready" "$others"
        if [[ ! -s "$others" ]]; then
          SKIPPED_SAME_VERSION=1
          note \
            "副本里已经是这个联机 Mod 版本，无需重新安装：${incoming_ver}" \
            "The copy already has this co-op Mod version. Reinstall was skipped: ${incoming_ver}"
          note "COOP_MOD_RESULT skipped-same-version"
          return 0
        fi
        ready="$others"
      else
        note_original_coop_mods
      fi
    else
      note_original_coop_mods
    fi
  fi
  # Install the new package first, then remove older melody-fork folders only.
  # 先装新版本，再只删旧的 melody-fork；原版联机 Mod 一律保留。
  install_packages "$ready" "$root" "$fallback"
  if list_contains_coop_package "$ready"; then
    if [[ -n "${LAST_INSTALLED_COOP_PATH:-}" ]]; then
      purge_old_melody_fork_in_dest "$LAST_INSTALLED_COOP_PATH"
    fi
    note "COOP_MOD_RESULT updated"
  fi
}

emit_coop_package_line() {
  local dir="$1"
  local ver ch
  ver="$(package_version_label "$dir")"
  [[ -n "$ver" ]] || ver="-"
  ch="$(package_channel_label "$dir")"
  [[ -n "$ch" ]] || ch="-"
  # COOP_MOD \t version \t channel \t path
  # channel=melody-fork for Melody's Mac fork; "-" means 原版 (missing/other).
  printf 'COOP_MOD\t%s\t%s\t%s\n' "$ver" "$ch" "$dir"
}

emit_coop_packages() {
  local root="$1"
  local child base
  [[ -d "$root" ]] || return 0
  if is_coop_package "$root"; then
    emit_coop_package_line "$root"
    return 0
  fi
  for child in "$root"/*; do
    [[ -d "$child" ]] || continue
    base="$(basename "$child")"
    [[ "$base" == "__MACOSX" ]] && continue
    if is_coop_package "$child"; then
      emit_coop_package_line "$child"
    fi
  done
}

# Dedupe among ALL coop-family folders (原版/workshop and melody-fork). Keep one.
dedupe_dest_coop_packages() {
  local keep_version="$1"
  local child ver score best best_ver best_score
  REMOVED_COOP_COUNT=0
  best=""
  best_ver=""
  best_score=-1
  [[ -d "$DEST/Contents/Mods" ]] || return 0
  for child in "$DEST/Contents/Mods"/*; do
    [[ -d "$child" ]] || continue
    if ! is_coop_package "$child"; then
      continue
    fi
    ver="$(package_version_label "$child")"
    if [[ -n "$keep_version" ]] && ! versions_same "$ver" "$keep_version"; then
      continue
    fi
    score="$(coop_package_score "$child" "$ver")"
    if [[ -z "$best" ]]; then
      best="$child"
      best_ver="$ver"
      best_score="$score"
    elif version_is_newer "$ver" "$best_ver"; then
      best="$child"
      best_ver="$ver"
      best_score="$score"
    elif versions_tie "$ver" "$best_ver" && [[ "$score" -gt "$best_score" ]]; then
      best="$child"
      best_ver="$ver"
      best_score="$score"
    fi
  done
  if [[ -n "$keep_version" && -z "$best" ]]; then
    die \
      "副本里没有版本为 ${keep_version} 的联机 Mod，所以没有删除任何目录。" \
      "No co-op Mod with version ${keep_version} is in the copy, so nothing was deleted."
  fi
  for child in "$DEST/Contents/Mods"/*; do
    [[ -d "$child" ]] || continue
    if ! is_coop_package "$child"; then
      continue
    fi
    if [[ -n "$best" && "$child" == "$best" ]]; then
      continue
    fi
    note \
      "已从副本移除同属联机 Mod 的旧目录，避免多份并存：$(basename "$child")" \
      "Removed an older co-op Mod folder from the copy so only one remains: $(basename "$child")"
    if ! remove_tree_in_dest_mods "$child"; then
      die \
        "删除旧联机 Mod 失败。副本 Mods 里现在有多份同样的联机 Mod，请手动删除多余的一份后再试：$(basename "$child")" \
        "Failed to remove an older co-op Mod. Multiple copies of the same co-op Mod are now in the copy's Mods folder. Delete the extra one manually, then try again: $(basename "$child")"
    fi
    REMOVED_COOP_COUNT=$((REMOVED_COOP_COUNT + 1))
  done
}

install_packages() {
  local list="$1"
  local root="$2"
  local fallback_name="$3"
  local pkg name dest_mods ver
  dest_mods="$DEST/Contents/Mods"
  mkdir -p "$dest_mods"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if is_coop_package "$pkg"; then
      ver="$(package_version_label "$pkg")"
      name="$(coop_install_dir_name "$ver")"
    elif [[ "$pkg" == "$root" ]]; then
      name="$fallback_name"
    else
      name="$(basename "$pkg")"
    fi
    if [[ -z "$name" || "$name" == "." || "$name" == "/" ]]; then
      die \
        "无法确定 Mod 目录名：${pkg}" \
        "Could not name a mod package: ${pkg}"
    fi
    rm -rf "${dest_mods}/${name}"
    copy_tree "$pkg" "${dest_mods}/${name}"
    if is_coop_package "$pkg"; then
      ensure_melody_fork_channel "${dest_mods}/${name}"
      LAST_INSTALLED_COOP_PATH="${dest_mods}/${name}"
    fi
    note "已安装 Mod / Installed mod: ${name}"
    INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
  done <"$list"
}

prepare_package_list() {
  local root="$1"
  local chosen="$2"
  local all_dirs sorted
  all_dirs="$TMP_WORK/pkg-dirs"
  sorted="$TMP_WORK/pkg-dirs-sorted"
  collect_package_dirs "$root" "$all_dirs"
  sort_by_depth "$all_dirs" "$sorted"
  select_outer_packages "$sorted" "$chosen"
}

find_newest_zip() {
  local dir file base lower best best_mtime modified
  best=""
  best_mtime=-1
  for dir in "$SCRIPT_DIR" "$PWD"; do
    [[ -d "$dir" ]] || continue
    for file in "$dir"/*.zip "$dir"/*.ZIP; do
      [[ -f "$file" ]] || continue
      base="$(basename "$file")"
      lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
      case "$lower" in
        escapefromduckovcoopmod*.zip|*duckov*coop*.zip|*coopmod*.zip)
          ;;
        *)
          continue
          ;;
      esac
      modified="$(stat -f '%m' "$file")"
      if [[ "$modified" -gt "$best_mtime" ]]; then
        best_mtime="$modified"
        best="$file"
      fi
    done
  done
  printf '%s\n' "$best"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        usage
        exit 0
        ;;
      --force|-f)
        FORCE=1
        shift
        ;;
      --source)
        [[ $# -ge 2 ]] || die "缺少路径。 / Missing path after --source."
        SOURCE="$2"
        shift 2
        ;;
      --source=*)
        SOURCE="${1#*=}"
        shift
        ;;
      --dest)
        [[ $# -ge 2 ]] || die "缺少路径。 / Missing path after --dest."
        DEST="$2"
        shift 2
        ;;
      --dest=*)
        DEST="${1#*=}"
        shift
        ;;
      --mods-dir)
        [[ $# -ge 2 ]] || die "缺少路径。 / Missing path after --mods-dir."
        MODS_DIR="$2"
        shift 2
        ;;
      --mods-dir=*)
        MODS_DIR="${1#*=}"
        shift
        ;;
      --update-mods)
        UPDATE_MODS=1
        shift
        ;;
      --list-coop-mods)
        LIST_COOP_MODS=1
        shift
        ;;
      --dedupe-coop-mods)
        DEDUPE_COOP_MODS=1
        shift
        ;;
      --keep-version)
        [[ $# -ge 2 ]] || die "缺少版本。 / Missing version after --keep-version."
        KEEP_VERSION="$2"
        shift 2
        ;;
      --keep-version=*)
        KEEP_VERSION="${1#*=}"
        shift
        ;;
      *)
        die \
          "未知参数：${1}" \
          "Unknown argument: ${1}" \
          "运行 --help 查看用法。 / Run --help for usage."
        ;;
    esac
  done
}

validate_paths() {
  local source_phys dest_phys
  [[ -n "${HOME:-}" ]] || die "HOME 未设置。 / HOME is not set."
  SOURCE="$(abs_path "$SOURCE")"
  DEST="$(abs_path "$DEST")"
  if [[ -n "$MODS_DIR" ]]; then
    MODS_DIR="$(abs_path "$MODS_DIR")"
  fi

  if [[ ! -d "$SOURCE" ]]; then
    die \
      "找不到原版 App：${SOURCE}" \
      "Original app not found: ${SOURCE}" \
      "可用 --source 指定安装路径。 / Pass --source to point at your install."
  fi
  if [[ ! -f "$SOURCE/Contents/Info.plist" ]]; then
    die \
      "原版路径不是 App 包（缺少 Contents/Info.plist）：${SOURCE}" \
      "Source is not an app bundle (missing Contents/Info.plist): ${SOURCE}"
  fi
  case "$DEST" in
    *.app)
      ;;
    *)
      die \
        "目标必须以 .app 结尾：${DEST}" \
        "Destination must end with .app: ${DEST}"
      ;;
  esac

  source_phys="$(cd "$SOURCE" && pwd -P)" || die "无法解析原版路径。 / Could not resolve the original app path."
  if [[ -d "$DEST" ]]; then
    dest_phys="$(cd "$DEST" && pwd -P)" || die "无法解析目标路径。 / Could not resolve the destination path."
  else
    dest_phys="$DEST"
  fi

  if [[ "$source_phys" == "$dest_phys" || "$SOURCE" == "$DEST" ]]; then
    die \
      "不会改写原版 App：${SOURCE}" \
      "请把 --dest 设成另一份副本，例如 ${HOME}/Applications/Duckov-COOP.app" \
      "Refusing to modify the original app: ${SOURCE}" \
      "Set --dest to a separate copy, for example ${HOME}/Applications/Duckov-COOP.app"
  fi
  case "$dest_phys/" in
    "$source_phys"/*)
      die \
        "目标不能位于原版 App 内部。" \
        "Destination cannot be inside the original app."
      ;;
  esac
  case "$source_phys/" in
    "$dest_phys"/*)
      die \
        "原版 App 不能位于目标路径内部。" \
        "The original app cannot be inside the destination."
      ;;
  esac
  case "$dest_phys" in
    "/"|"/Applications"|"$HOME"|"/System"|"/usr")
      die \
        "拒绝危险的目标路径：${DEST}" \
        "Refusing an unsafe destination: ${DEST}"
      ;;
  esac
}

sign_dest() {
  local entitlements signed verified
  if [[ "${DUCKOV_PREPARE_SKIP_SIGN:-}" == "1" ]]; then
    note "已跳过签名（测试）。 / Skipped signing (test)."
    return 0
  fi
  entitlements="$(resolve_entitlements)"
  note \
    "正在用本机 codesign 身份 \"-\" 为副本签名（不使用 Apple 开发者证书）…" \
    "Signing the copy with the local codesign identity \"-\" (no Apple Developer certificate)…"
  signed=0
  if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
    if codesign --force --deep --sign - --entitlements "$entitlements" "$DEST" >>"$DUCKOV_GUI_LOG" 2>&1; then
      signed=1
    fi
  else
    if codesign --force --deep --sign - --entitlements "$entitlements" "$DEST"; then
      signed=1
    fi
  fi
  if [[ "$signed" -ne 1 ]]; then
    die \
      "签名失败。原版未改动。可重新运行本脚本或准备工具。" \
      "Signing failed. The original app was not modified. Run this script or the prepare helper again."
  fi
  verified=0
  if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
    if codesign --verify "$DEST" >>"$DUCKOV_GUI_LOG" 2>&1; then
      verified=1
    fi
  else
    if codesign --verify "$DEST"; then
      verified=1
    fi
  fi
  if [[ "$verified" -ne 1 ]]; then
    die \
      "签名校验未通过。原版未改动。可重新运行本脚本。" \
      "Signature check failed. The original app was not modified. You can run this script again."
  fi
}

refuse_same_bundle() {
  local source_phys dest_phys
  SOURCE="$(abs_path "$SOURCE")"
  DEST="$(abs_path "$DEST")"
  if [[ "$SOURCE" == "$DEST" ]]; then
    die \
      "不会改写原版 App：${SOURCE}" \
      "Refusing to modify the original app: ${SOURCE}"
  fi
  if [[ -d "$SOURCE" && -d "$DEST" ]]; then
    source_phys="$(cd "$SOURCE" && pwd -P)" || source_phys="$SOURCE"
    dest_phys="$(cd "$DEST" && pwd -P)" || dest_phys="$DEST"
    if [[ "$source_phys" == "$dest_phys" ]]; then
      die \
        "不会改写原版 App：${SOURCE}" \
        "Refusing to modify the original app: ${SOURCE}"
    fi
  fi
  case "$DEST" in
    "/"|"/Applications"|"${HOME:-}"|"/System"|"/usr")
      die \
        "拒绝危险的目标路径：${DEST}" \
        "Refusing an unsafe destination: ${DEST}"
      ;;
  esac
}

update_mods_only() {
  local chosen mods_root
  if [[ "${DUCKOV_PREPARE_SKIP_PLATFORM:-}" != "1" ]]; then
    require_macos
  fi
  command -v find >/dev/null 2>&1 || die "找不到 find。 / find was not found."

  TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/duckov-coop-mods.XXXXXX")"
  DEST="$(abs_path "$DEST")"
  if [[ -n "$MODS_DIR" ]]; then
    MODS_DIR="$(abs_path "$MODS_DIR")"
  fi
  case "$DEST" in
    *.app) ;;
    *)
      die \
        "目标必须以 .app 结尾：${DEST}" \
        "Destination must end with .app: ${DEST}"
      ;;
  esac
  if [[ ! -d "$DEST" || ! -f "$DEST/Contents/Info.plist" ]]; then
    die \
      "副本还不存在，或不是 App：${DEST}" \
      "请先准备联机副本，再更新 Mod。" \
      "The co-op copy does not exist yet, or is not an app: ${DEST}" \
      "Prepare the co-op copy before updating the Mod."
  fi
  refuse_same_bundle
  if [[ -z "$MODS_DIR" || ! -d "$MODS_DIR" ]]; then
    die \
      "找不到 Mac 联机 Mod 目录：${MODS_DIR:-}" \
      "Mac co-op Mod folder was not found: ${MODS_DIR:-}"
  fi
  mods_root="$(cd "$MODS_DIR" && pwd)"
  chosen="$TMP_WORK/chosen-packages"
  : >"$chosen"
  prepare_package_list "$mods_root" "$chosen"
  if [[ ! -s "$chosen" ]]; then
    die \
      "该目录里没有 .dll。请选择已解压的 Mac 联机 Mod：${MODS_DIR}" \
      "No .dll files in that directory. Pick the unzipped Mac co-op Mod: ${MODS_DIR}"
  fi
  USED_MODS_LABEL="$MODS_DIR"
  note \
    "正在把 Mac 联机 Mod 装入副本的 Contents/Mods/（不改动原版，也不重拷整份游戏）。" \
    "Installing the Mac co-op Mod into the copy's Contents/Mods/ (the original app is not modified, and the game is not copied again)." \
    "副本 / Copy: ${DEST}" \
    "Mod: ${MODS_DIR}"
  ALLOW_SKIP_SAME=1
  install_selected_packages "$chosen" "$mods_root" "$(basename "$mods_root")"
  if [[ "${SKIPPED_SAME_VERSION:-0}" -eq 1 ]]; then
    note \
      "未覆盖文件。Mods 目录可写，安装后不再对副本或 Mod 重新签名。" \
      "Files were not overwritten. Mods is user-writable; the copy and Mod are not re-signed after install."
    return 0
  fi
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "$DEST/Contents/Mods" || true
  fi
  # Mods is user-writable — do not re-sign the copy or the installed Mod after update.
  # Mods 目录本就可写，更新联机 Mod 后不再对副本或 Mod 重新签名。
  note \
    "Mac 联机 Mod 已更新到副本（未重新签名）。 / The Mac co-op Mod was updated into the copy (not re-signed)." \
    "副本 / Copy: ${DEST}" \
    "本次已装入 ${INSTALLED_COUNT} 个 Mod 目录，来源：${USED_MODS_LABEL}" \
    "Installed ${INSTALLED_COUNT} mod folder(s) from: ${USED_MODS_LABEL}"
}

main() {
  local stash zip_path zip_root mods_root chosen fallback
  if [[ "$UPDATE_MODS" -eq 1 ]]; then
    update_mods_only
    return 0
  fi
  require_macos
  command -v find >/dev/null 2>&1 || die "找不到 find。 / find was not found."
  command -v codesign >/dev/null 2>&1 || die \
    "找不到 codesign。这是 macOS 自带工具，不需要 Apple 开发者账号。" \
    "codesign was not found. It ships with macOS; an Apple Developer account is not required."

  TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/duckov-coop.XXXXXX")"
  validate_paths

  chosen="$TMP_WORK/chosen-packages"
  : >"$chosen"
  fallback="Mods"

  if [[ -n "$MODS_DIR" ]]; then
    if [[ ! -d "$MODS_DIR" ]]; then
      die \
        "找不到 Mods 目录：${MODS_DIR}" \
        "Mods directory not found: ${MODS_DIR}"
    fi
    mods_root="$(cd "$MODS_DIR" && pwd)"
    prepare_package_list "$mods_root" "$chosen"
    if [[ ! -s "$chosen" ]]; then
      die \
        "该目录里没有 .dll。请传入已解压的 Mods 目录：${MODS_DIR}" \
        "No .dll files in that directory. Pass an unzipped Mods folder: ${MODS_DIR}"
    fi
    fallback="$(basename "$mods_root")"
    USED_MODS_LABEL="$MODS_DIR"
  else
    zip_path="$(find_newest_zip)"
    if [[ -n "$zip_path" ]]; then
      note \
        "发现同目录 Release 压缩包，将在签名前装入副本：${zip_path}" \
        "Found a Release zip beside the script; it will be installed into the copy before signing: ${zip_path}"
      zip_root="$TMP_WORK/zip-root"
      extract_zip "$zip_path" "$zip_root"
      prepare_package_list "$zip_root" "$chosen"
      if [[ ! -s "$chosen" ]]; then
        note \
          "压缩包里没有 .dll，已跳过 Mod 安装。App 副本仍会准备好。" \
          "No .dll inside the zip; skipped mod install. The app copy will still be prepared."
      else
        fallback="$(basename "$zip_path")"
        fallback="${fallback%.zip}"
        fallback="${fallback%.ZIP}"
        USED_MODS_LABEL="$zip_path"
        mods_root="$zip_root"
      fi
    fi
  fi

  note \
    "原版不会被修改 / Original will not be modified: ${SOURCE}" \
    "副本 / Copy: ${DEST}"

  confirm_replace

  note \
    "正在复制游戏 App，体积较大时可能需要几分钟…" \
    "Copying the game app. This can take several minutes for a full install…"

  stash=""
  if [[ -d "$DEST/Contents/Mods" ]]; then
    stash="$TMP_WORK/mods-stash"
    mkdir -p "$stash"
    copy_tree "$DEST/Contents/Mods" "$stash/Mods"
    note \
      "已暂存副本里现有的 Mods，复制完成后会放回。" \
      "Stashed Mods already in the copy; they will be restored after the refresh."
    RESTORED_MODS=1
  fi

  mkdir -p "$(dirname "$DEST")"
  copy_tree "$SOURCE" "$DEST"

  if [[ ! -f "$DEST/Contents/Info.plist" ]]; then
    die \
      "复制后的 App 不完整（缺少 Contents/Info.plist）。原版未改动。" \
      "Copied app is incomplete (missing Contents/Info.plist). The original was not modified."
  fi

  if [[ -n "$stash" && -d "$stash/Mods" ]]; then
    mkdir -p "$DEST/Contents"
    copy_tree "$stash/Mods" "$DEST/Contents/Mods"
  fi

  if [[ -s "$chosen" ]]; then
    ALLOW_SKIP_SAME=0
    install_selected_packages "$chosen" "$mods_root" "$fallback"
  fi

  if command -v xattr >/dev/null 2>&1; then
    # 去掉副本上的下载隔离标记，避免系统把这份本地副本当成未确认的下载。
    # Clear the quarantine flag on the copy so macOS does not treat this local copy as an unconfirmed download.
    xattr -dr com.apple.quarantine "$DEST" || true
  fi

  sign_dest

  note "" \
    "完成。 / Done." \
    "副本 / Copy: ${DEST}" \
    "原版未改动 / Original left unchanged: ${SOURCE}" \
    "" \
    "接下来 / Next:" \
    "1. 只启动副本进行联机。想玩单人时可以继续用原版。" \
    "   Launch only the copy for co-op. Use the original app for single-player if you want." \
    "2. 不要把 Mods 安装进原版 App。" \
    "   Do not install Mods into the original app." \
    "3. 从本 Fork 的 Releases 下载联机 Mod（以及需要的依赖 Mod），放入副本的 Contents/Mods/。" \
    "   Download the co-op mod (and any dependency mods) from this fork's Releases into the copy's Contents/Mods/." \
    "   https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases" \
    "4. 所有玩家的 ModVersion 字符串必须完全一致（Windows 与 Mac 共用，例如 Release 中的 1.4.2_melody）。" \
    "   Every peer must use the exact same ModVersion string (shared by Windows and Mac, for example 1.4.2_melody from Releases)." \
    "5. Steam「验证游戏完整性」之后，如果副本异常，请重新运行本脚本。" \
    "   After Steam \"Verify integrity\", run this script again if the copy misbehaves." \
    "6. 若之后又手动放入 Mods，请再运行一次本脚本，以便重新签名。" \
    "   If you add Mods by hand later, run this script again so the copy is signed with those files included."

  if [[ "$INSTALLED_COUNT" -gt 0 ]]; then
    note \
      "本次已装入 ${INSTALLED_COUNT} 个 Mod 目录，来源：${USED_MODS_LABEL}" \
      "Installed ${INSTALLED_COUNT} mod folder(s) from: ${USED_MODS_LABEL}"
  elif [[ "$RESTORED_MODS" -eq 1 ]]; then
    note \
      "没有装入新的 Mod。先前副本里的 Mods 已放回。" \
      "No new mods were installed. Mods already in the copy were put back."
  else
    note \
      "这次没有装入新的 Mod。可解压 Release 后执行： ./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods" \
      "No new mods were installed. Unzip a Release and run: ./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods"
  fi
}

cmd_list_coop_mods() {
  local root
  if [[ -n "$MODS_DIR" ]]; then
    MODS_DIR="$(abs_path "$MODS_DIR")"
    root="$MODS_DIR"
  else
    [[ -n "${HOME:-}" ]] || die "HOME 未设置。 / HOME is not set."
    DEST="$(abs_path "$DEST")"
    root="$DEST/Contents/Mods"
  fi
  emit_coop_packages "$root"
}

cmd_dedupe_coop_mods() {
  if [[ "${DUCKOV_PREPARE_SKIP_PLATFORM:-}" != "1" ]]; then
    require_macos
  fi
  command -v find >/dev/null 2>&1 || die "找不到 find。 / find was not found."
  [[ -n "${HOME:-}" ]] || die "HOME 未设置。 / HOME is not set."
  TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/duckov-coop-dedupe.XXXXXX")"
  DEST="$(abs_path "$DEST")"
  if [[ -n "${SOURCE:-}" ]]; then
    SOURCE="$(abs_path "$SOURCE")"
  fi
  case "$DEST" in
    *.app) ;;
    *)
      die \
        "目标必须以 .app 结尾：${DEST}" \
        "Destination must end with .app: ${DEST}"
      ;;
  esac
  if [[ ! -d "$DEST" || ! -f "$DEST/Contents/Info.plist" ]]; then
    die \
      "副本还不存在，或不是 App：${DEST}" \
      "The co-op copy does not exist yet, or is not an app: ${DEST}"
  fi
  refuse_same_bundle
  dedupe_dest_coop_packages "$KEEP_VERSION"
  if [[ "${REMOVED_COOP_COUNT:-0}" -eq 0 ]]; then
    note \
      "副本里的联机 Mod 已经只有一份，无需改动。" \
      "The copy already has a single co-op Mod folder. Nothing was changed."
    note "COOP_MOD_RESULT skipped-same-version"
    return 0
  fi
  note \
    "已去掉重复的联机 Mod 目录，只保留一份。其他 Mod 未删除。" \
    "Removed duplicate co-op Mod folders so only one remains. Other Mods were not deleted."
  note "COOP_MOD_RESULT deduped"
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "$DEST/Contents/Mods" || true
  fi
  # No re-sign after Mods cleanup.
}

run_self_test() {
  local root mods incoming orig chosen list_out expected count child dllfix
  local bash_bin
  TMP_WORK="$(mktemp -d "${TMPDIR:-/tmp}/duckov-coop-self.XXXXXX")"
  root="$TMP_WORK"
  bash_bin="${BASH:-bash}"
  SOURCE="$root/Duckov.app"
  DEST="$root/Duckov-COOP.app"
  mods="$DEST/Contents/Mods"
  mkdir -p "$DEST/Contents" "$mods/3591341282" "$mods/EscapeFromDuckovCoopMod" \
    "$mods/BackpackExpansion" "$mods/NiceBackpack" "$mods/WeirdName" "$mods/ApiOnly"
  printf '%s\n' 'plist' >"$DEST/Contents/Info.plist"
  printf '%s\n' 'publishedFileId = 3591341282' 'name = EscapeFromDuckovCoopMod' 'version = ?' >"$mods/3591341282/info.ini"
  printf '%s\n' 'old-workshop' >"$mods/3591341282/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'version = ?' >"$mods/EscapeFromDuckovCoopMod/info.ini"
  printf '%s\n' 'x' >"$mods/EscapeFromDuckovCoopMod/INSTALL_1.4.1.txt"
  printf '%s\n' 'old-melody' >"$mods/EscapeFromDuckovCoopMod/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'name = BackpackExpansion' 'description = mentions 3591341282 and EscapeFromDuckovCoopMod' 'publishedFileId = 111' >"$mods/BackpackExpansion/info.ini"
  printf '%s\n' 'backpack' >"$mods/BackpackExpansion/BackpackExpansion.dll"
  printf '%s\n' 'nice' >"$mods/NiceBackpack/NiceBackpack.dll"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'publishedFileId = 3591341282' >"$mods/WeirdName/info.ini"
  printf '%s\n' 'weird' >"$mods/WeirdName/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'api' >"$mods/ApiOnly/EscapeFromDuckovModApi.dll"

  orig="$SOURCE/Contents/Mods/3591341282"
  mkdir -p "$orig" "$SOURCE/Contents/Mods/BackpackExpansion"
  printf '%s\n' 'publishedFileId = 3591341282' >"$orig/info.ini"
  printf '%s\n' 'workshop-original' >"$orig/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'keep-backpack' >"$SOURCE/Contents/Mods/BackpackExpansion/BackpackExpansion.dll"

  name_is_coop_family "3591341282" || die "self-test: workshop id was not recognized"
  name_is_coop_family "EscapeFromDuckovCoopMod" || die "self-test: EscapeFromDuckovCoopMod was not recognized"
  name_is_coop_family "Escape-From-Duckov-Coop" || die "self-test: hyphenated name was not recognized"
  name_is_coop_family "escape_from_duckov_coop_mod" || die "self-test: underscored name was not recognized"
  name_is_coop_family "逃离鸭科夫联机mod" || die "self-test: Chinese display name was not recognized"
  if name_is_coop_family "BackpackExpansion"; then
    die "self-test: backpack name was treated as the co-op mod"
  fi
  if name_is_coop_family "NiceBackpack"; then
    die "self-test: unrelated mod name was treated as the co-op mod"
  fi
  is_coop_package "$mods/3591341282" || die "self-test: workshop folder was not a co-op package"
  is_coop_package "$mods/WeirdName" || die "self-test: info.ini package was not recognized"
  if is_coop_package "$mods/BackpackExpansion"; then
    die "self-test: backpack info.ini was treated as the co-op mod"
  fi
  if is_coop_package "$mods/ApiOnly"; then
    die "self-test: ModApi dll alone was treated as the co-op mod"
  fi
  if is_coop_package "$mods"; then
    die "self-test: Mods root was treated as one co-op package"
  fi
  mkdir -p "$root/cn/逃离鸭科夫联机mod" "$root/hyphen/Escape-From-Duckov-Coop" "$root/rand/CustomBuild"
  is_coop_package "$root/cn/逃离鸭科夫联机mod" || die "self-test: Chinese folder was not a co-op package"
  is_coop_package "$root/hyphen/Escape-From-Duckov-Coop" || die "self-test: Escape-From-Duckov-Coop was not a co-op package"
  printf '%s\n' 'x' >"$root/rand/CustomBuild/EscapeFromDuckovCoopMod.dll"
  is_coop_package "$root/rand/CustomBuild" || die "self-test: main dll was not enough to identify the mod"

  version_is_newer "1.4.2" "1.4.1" || die "self-test: 1.4.2 should be newer than 1.4.1"
  if version_is_newer "1.4.1" "1.4.2"; then
    die "self-test: 1.4.1 should not be newer than 1.4.2"
  fi
  version_is_newer "1.10.0" "1.9.9" || die "self-test: 1.10.0 should be newer than 1.9.9"
  version_is_newer "1.4.2-test" "1.4.1" || die "self-test: 1.4.2-test should be newer than 1.4.1"
  versions_same "V1.4.2-test" "1.4.2-test" || die "self-test: version labels should match"
  if versions_same "1.4.2" "1.4.2-test"; then
    die "self-test: 1.4.2 and 1.4.2-test should not match"
  fi
  version_is_newer "1.4.2_melody" "1.4.1" || die "self-test: 1.4.2_melody should be newer than 1.4.1"
  versions_same "V1.4.2_melody" "1.4.2_melody" || die "self-test: _melody version labels should match"
  if versions_same "1.4.2" "1.4.2_melody"; then
    die "self-test: 1.4.2 and 1.4.2_melody should not match"
  fi
  if versions_same "1.4.2-test" "1.4.2_melody"; then
    die "self-test: 1.4.2-test and 1.4.2_melody should not match"
  fi
  if version_is_newer "1.4.2_melody" "1.4.2-test"; then
    die "self-test: same numeric base _melody should not be newer than -test"
  fi
  [[ "$(coop_install_dir_name "1.4.2_melody")" == "3591341282_EscapeFromDuckovCoopMod_1.4.2_melody" ]] || die "self-test: _melody install dir name wrong"
  if versions_same "" ""; then
    die "self-test: empty versions should not count as the same"
  fi

  if command -v strings >/dev/null 2>&1 || [[ -x /usr/bin/strings ]]; then
    dllfix="$root/dllpkg"
    mkdir -p "$dllfix"
    printf '%s\n' 'noise' '1.2.3' '1.2.3.0' 'ModVersion' '9.9.9' '1.4.2.0' '1.4.2' >"$dllfix/EscapeFromDuckovCoopMod.dll"
    [[ "$(dll_version_label "$dllfix/EscapeFromDuckovCoopMod.dll")" == "1.4.2" ]] || die "self-test: dll version label was '$(dll_version_label "$dllfix/EscapeFromDuckovCoopMod.dll")'"
    [[ "$(package_version_label "$dllfix")" == "1.4.2" ]] || die "self-test: package version did not fall back to the dll"
  fi

  incoming="$root/incoming"
  mkdir -p "$incoming/EscapeFromDuckovCoopMod" "$incoming/BackpackExpansion" "$incoming/3591341282"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'publishedFileId = 3591341282' 'version = ?' 'channel = melody-fork' >"$incoming/EscapeFromDuckovCoopMod/info.ini"
  printf '%s\n' 'new-melody' >"$incoming/EscapeFromDuckovCoopMod/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'x' >"$incoming/EscapeFromDuckovCoopMod/INSTALL_1.4.2-test.txt"
  printf '%s\n' 'backpack-new' >"$incoming/BackpackExpansion/BackpackExpansion.dll"
  printf '%s\n' 'publishedFileId = 3591341282' >"$incoming/3591341282/info.ini"
  printf '%s\n' 'older-incoming' >"$incoming/3591341282/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'x' >"$incoming/3591341282/INSTALL_1.4.1.txt"
  [[ "$(package_version_label "$incoming/EscapeFromDuckovCoopMod")" == "1.4.2-test" ]] || die "self-test: INSTALL file version was not preferred"
  [[ "$(coop_install_dir_name "1.4.2-test")" == "3591341282_EscapeFromDuckovCoopMod_1.4.2-test" ]] || die "self-test: install dir name wrong"
  [[ "$(coop_install_dir_name "V1.4.2")" == "3591341282_EscapeFromDuckovCoopMod_1.4.2" ]] || die "self-test: install dir name should strip v"
  [[ "$(ini_channel_label "$incoming/EscapeFromDuckovCoopMod/info.ini")" == "melody-fork" ]] || die "self-test: channel parse failed"
  [[ -z "$(ini_channel_label "$mods/3591341282/info.ini")" ]] || die "self-test: workshop should have empty channel"

  chosen="$root/chosen-packages"
  printf '%s\n' "$incoming/EscapeFromDuckovCoopMod" "$incoming/BackpackExpansion" "$incoming/3591341282" >"$chosen"
  ALLOW_SKIP_SAME=0
  install_selected_packages "$chosen" "$incoming" "incoming"

  installed_name="3591341282_EscapeFromDuckovCoopMod_1.4.2-test"
  # After install: 原版/workshop AND older coop-family folders must be gone; only the new fork remains.
  [[ ! -d "$mods/3591341282" ]] || die "self-test: workshop 原版 remained after install"
  [[ ! -d "$mods/WeirdName" ]] || die "self-test: WeirdName coop folder remained after install"
  [[ ! -d "$mods/EscapeFromDuckovCoopMod" ]] || die "self-test: bare EscapeFromDuckovCoopMod remained after install"
  [[ -d "$mods/$installed_name" ]] || die "self-test: new versioned co-op package was not installed"
  [[ "$(cat "$mods/$installed_name/EscapeFromDuckovCoopMod.dll")" == "new-melody" ]] || die "self-test: new dll was not installed"
  grep -F -q 'channel = melody-fork' "$mods/$installed_name/info.ini" || die "self-test: installed mod missing channel stamp"
  [[ "$(cat "$mods/BackpackExpansion/BackpackExpansion.dll")" == "backpack-new" ]] || die "self-test: backpack was not updated"
  [[ "$(cat "$mods/NiceBackpack/NiceBackpack.dll")" == "nice" ]] || die "self-test: unrelated mod was changed"
  [[ -f "$mods/ApiOnly/EscapeFromDuckovModApi.dll" ]] || die "self-test: ModApi-only folder was deleted"
  [[ "$(cat "$orig/EscapeFromDuckovCoopMod.dll")" == "workshop-original" ]] || die "self-test: original app mod was modified"
  [[ "$(cat "$SOURCE/Contents/Mods/BackpackExpansion/BackpackExpansion.dll")" == "keep-backpack" ]] || die "self-test: original backpack was modified"
  count=0
  for child in "$mods"/*; do
    [[ -d "$child" ]] || continue
    if is_coop_package "$child"; then
      count=$((count + 1))
    fi
  done
  [[ "$count" -eq 1 ]] || die "self-test: expected one co-op package after install, found ${count}"

  printf '%s\n' 'marker' >"$mods/$installed_name/marker.txt"
  printf '%s\n' "$incoming/EscapeFromDuckovCoopMod" >"$chosen"
  ALLOW_SKIP_SAME=1
  SKIPPED_SAME_VERSION=0
  install_selected_packages "$chosen" "$incoming" "incoming"
  [[ "${SKIPPED_SAME_VERSION}" -eq 1 ]] || die "self-test: same version was installed again"
  [[ "$(cat "$mods/$installed_name/marker.txt")" == "marker" ]] || die "self-test: same-version skip replaced the installed mod"

  # Seed an older melody-fork + a workshop 原版; dedupe keep-version removes both extras.
  mkdir -p "$mods/3591341282_EscapeFromDuckovCoopMod_1.4.1" "$mods/3591341282"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'publishedFileId = 3591341282' 'channel = melody-fork' >"$mods/3591341282_EscapeFromDuckovCoopMod_1.4.1/info.ini"
  printf '%s\n' 'stale-fork' >"$mods/3591341282_EscapeFromDuckovCoopMod_1.4.1/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'x' >"$mods/3591341282_EscapeFromDuckovCoopMod_1.4.1/INSTALL_1.4.1.txt"
  printf '%s\n' 'publishedFileId = 3591341282' >"$mods/3591341282/info.ini"
  printf '%s\n' 'stale-workshop' >"$mods/3591341282/EscapeFromDuckovCoopMod.dll"
  dedupe_dest_coop_packages "1.4.2-test"
  [[ ! -d "$mods/3591341282_EscapeFromDuckovCoopMod_1.4.1" ]] || die "self-test: dedupe left the older melody-fork"
  [[ ! -d "$mods/3591341282" ]] || die "self-test: dedupe left workshop 原版"
  [[ -d "$mods/$installed_name" ]] || die "self-test: dedupe removed the version to keep"
  [[ "$(cat "$mods/NiceBackpack/NiceBackpack.dll")" == "nice" ]] || die "self-test: dedupe removed an unrelated mod"
  [[ "${REMOVED_COOP_COUNT}" -ge 1 ]] || die "self-test: dedupe removed nothing"

  list_out="$("$bash_bin" "$0" --list-coop-mods --mods-dir "$mods")"
  expected="COOP_MOD"$'\t'"1.4.2-test"$'\t'"melody-fork"$'\t'"$mods/$installed_name"
  printf '%s\n' "$list_out" | grep -F -q "$expected" || die "self-test: list output missing the installed mod: ${list_out}"
  if printf '%s\n' "$list_out" | grep -F -q "NiceBackpack"; then
    die "self-test: list included an unrelated mod: ${list_out}"
  fi
  if printf '%s\n' "$list_out" | grep -F -q "BackpackExpansion"; then
    die "self-test: list included the backpack: ${list_out}"
  fi
  if printf '%s\n' "$list_out" | grep -F -q "$mods/3591341282"$'	'; then
    die "self-test: list still shows workshop after dedupe: ${list_out}"
  fi
  if printf '%s\n' "$list_out" | grep -E -q $'COOP_MOD\t[^\t]+\t-\t'; then
    die "self-test: list still shows a 原版 (channel -) after dedupe: ${list_out}"
  fi
  if [[ -d "$mods/3591341282" ]]; then
    die "self-test: workshop folder still on disk after dedupe"
  fi

  DUCKOV_PREPARE_SKIP_PLATFORM=1 DUCKOV_PREPARE_SKIP_SIGN=1 \
    "$bash_bin" "$0" --dedupe-coop-mods --dest "$DEST" --keep-version "1.4.2-test" >"$root/dedupe-out.txt"
  grep -F -q "COOP_MOD_RESULT skipped-same-version" "$root/dedupe-out.txt" || die "self-test: single package dedupe did not no-op"
  [[ "$(cat "$mods/NiceBackpack/NiceBackpack.dll")" == "nice" ]] || die "self-test: CLI dedupe removed an unrelated mod"

  if DUCKOV_PREPARE_SKIP_PLATFORM=1 DUCKOV_PREPARE_SKIP_SIGN=1 \
    "$bash_bin" "$0" --dedupe-coop-mods --dest "$DEST" --keep-version "9.9.9"; then
    die "self-test: missing keep-version was accepted"
  fi
  [[ -d "$mods/$installed_name" ]] || die "self-test: failed keep-version deleted the co-op mod"
  [[ "$(cat "$orig/EscapeFromDuckovCoopMod.dll")" == "workshop-original" ]] || die "self-test: failed keep-version changed the original app"

  printf '%s\n' 'marker' >"$mods/$installed_name/marker.txt"
  DUCKOV_PREPARE_SKIP_PLATFORM=1 DUCKOV_PREPARE_SKIP_SIGN=1 \
    "$bash_bin" "$0" --update-mods --dest "$DEST" --source "$SOURCE" --mods-dir "$incoming/EscapeFromDuckovCoopMod" >"$root/update-out.txt"
  grep -F -q "COOP_MOD_RESULT skipped-same-version" "$root/update-out.txt" || die "self-test: update did not skip the same version: $(cat "$root/update-out.txt")"
  [[ "$(cat "$mods/$installed_name/marker.txt")" == "marker" ]] || die "self-test: update skip replaced the installed mod"
  [[ "$(cat "$orig/EscapeFromDuckovCoopMod.dll")" == "workshop-original" ]] || die "self-test: update changed the original app"
  if grep -E -q 'codesign|--sign' "$root/update-out.txt"; then
    die "self-test: update-mods should not codesign the copy or mod"
  fi

  # Installing a newer melody-fork must not delete 原版; must remove older melody-fork only.
  mkdir -p "$incoming/newer"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'publishedFileId = 3591341282' 'channel = melody-fork' >"$incoming/newer/info.ini"
  printf '%s\n' 'newer-dll' >"$incoming/newer/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'x' >"$incoming/newer/INSTALL_1.4.3.txt"
  printf '%s\n' "$incoming/newer" >"$chosen"
  ALLOW_SKIP_SAME=0
  install_selected_packages "$chosen" "$incoming" "incoming"
  [[ -d "$mods/3591341282_EscapeFromDuckovCoopMod_1.4.3" ]] || die "self-test: newer fork not installed"
  [[ ! -d "$mods/$installed_name" ]] || die "self-test: older melody-fork remained after newer install"
  # Re-seed a 原版 and confirm a subsequent install removes it.
  mkdir -p "$mods/3591341282"
  printf '%s\n' 'publishedFileId = 3591341282' >"$mods/3591341282/info.ini"
  printf '%s\n' 'workshop-again' >"$mods/3591341282/EscapeFromDuckovCoopMod.dll"
  mkdir -p "$incoming/newer2"
  printf '%s\n' 'name = EscapeFromDuckovCoopMod' 'publishedFileId = 3591341282' 'channel = melody-fork' >"$incoming/newer2/info.ini"
  printf '%s\n' 'newer2-dll' >"$incoming/newer2/EscapeFromDuckovCoopMod.dll"
  printf '%s\n' 'x' >"$incoming/newer2/INSTALL_1.4.4.txt"
  printf '%s\n' "$incoming/newer2" >"$chosen"
  ALLOW_SKIP_SAME=0
  install_selected_packages "$chosen" "$incoming" "incoming"
  [[ -d "$mods/3591341282_EscapeFromDuckovCoopMod_1.4.4" ]] || die "self-test: 1.4.4 not installed"
  [[ ! -d "$mods/3591341282" ]] || die "self-test: workshop 原版 remained beside melody-fork"
  [[ ! -d "$mods/3591341282_EscapeFromDuckovCoopMod_1.4.3" ]] || die "self-test: older fork remained after 1.4.4"

  note "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
  exit 0
fi

parse_args "$@"

if [[ "$LIST_COOP_MODS" -eq 1 ]]; then
  cmd_list_coop_mods
  exit 0
fi

if [[ "$DEDUPE_COOP_MODS" -eq 1 ]]; then
  cmd_dedupe_coop_mods
  exit 0
fi

main
