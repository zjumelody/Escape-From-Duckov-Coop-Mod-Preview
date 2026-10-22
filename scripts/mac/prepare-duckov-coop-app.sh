#!/usr/bin/env bash
# prepare-duckov-coop-app.sh
# 为 Mac 联机准备一份可写的《逃离鸭科夫》副本：复制 App、关闭 App Sandbox、
# 加入 network.client / network.server，并用本机 codesign 身份 "-" 重新签名。
# 不修改原版 App。Mods 只进入副本。
#
# Prepare a writable macOS copy of Duckov for co-op: copy the app, turn off
# App Sandbox, add network.client / network.server, and re-sign the copy with
# the local codesign identity "-". The original app is not modified. Mods go
# into the copy only.
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
INSTALLED_COUNT=0
RESTORED_MODS=0
USED_MODS_LABEL=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
用法 / Usage:
  prepare-duckov-coop-app.sh [--source APP] [--dest APP] [--mods-dir DIR] [--force]

把正版 Duckov.app 复制到可写位置，只改副本的 entitlements，并用本机 codesign 身份 "-" 重新签名。
Copy an official Duckov.app to a writable location, adjust entitlements on the copy only,
and re-sign that copy with the local codesign identity "-".

默认 / Defaults:
  --source   /Applications/Duckov.app
  --dest     ~/Applications/Duckov-COOP.app

可选 / Optional:
  --mods-dir 已解压的 Mods 目录（其下每个含 .dll 的文件夹会装入副本 Contents/Mods/）
             Unzipped Mods directory (each folder that contains a .dll is copied into the copy's Contents/Mods/)
  --force    目标已存在时直接替换，不再询问
             Replace an existing destination without asking
  -h, --help 显示本说明 / Show this help

环境变量（命令行优先）/ Environment (flags win):
  SOURCE 或 DUCKOV_SOURCE
  DEST 或 DUCKOV_DEST
  MODS_DIR 或 DUCKOV_MODS_DIR
  FORCE=1

未指定 --mods-dir 时，若脚本旁边（或当前目录）有较新的
EscapeFromDuckovCoopMod*.zip / *Duckov*Coop*.zip，会自动装入副本。
When --mods-dir is omitted, a newer EscapeFromDuckovCoopMod*.zip or *Duckov*Coop*.zip
next to the script (or in the current directory) is installed into the copy.

示例 / Examples:
  ./prepare-duckov-coop-app.sh
  ./prepare-duckov-coop-app.sh --source "$HOME/Games/Duckov.app"
  ./prepare-duckov-coop-app.sh --mods-dir "$HOME/Downloads/Mods" --force

只启动副本进行联机。不要把 Mods 放进原版 App。各方 ModVersion 必须完全一致。
Launch only the copy for co-op. Do not put Mods in the original app.
Every peer must use the exact same ModVersion string.
EOF
}

die() {
  printf '%s\n' "$@" >&2
  exit 1
}

note() {
  printf '%s\n' "$@"
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

install_packages() {
  local list="$1"
  local root="$2"
  local fallback_name="$3"
  local pkg name dest_mods
  dest_mods="$DEST/Contents/Mods"
  mkdir -p "$dest_mods"
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] || continue
    if [[ "$pkg" == "$root" ]]; then
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

main() {
  local entitlements stash zip_path zip_root mods_root chosen fallback
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
    install_packages "$chosen" "$mods_root" "$fallback"
  fi

  if command -v xattr >/dev/null 2>&1; then
    # 去掉副本上的下载隔离标记，避免系统把这份本地副本当成未确认的下载。
    # Clear the quarantine flag on the copy so macOS does not treat this local copy as an unconfirmed download.
    xattr -dr com.apple.quarantine "$DEST" || true
  fi

  entitlements="$(resolve_entitlements)"
  note \
    "正在用本机 codesign 身份 \"-\" 为副本签名（不使用 Apple 开发者证书）…" \
    "Signing the copy with the local codesign identity \"-\" (no Apple Developer certificate)…"
  codesign --force --deep --sign - --entitlements "$entitlements" "$DEST"
  if ! codesign --verify "$DEST"; then
    die \
      "签名校验未通过。原版未改动。可重新运行本脚本。" \
      "Signature check failed. The original app was not modified. You can run this script again."
  fi

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
    "4. 所有玩家的 ModVersion 字符串必须完全一致（Windows 与 Mac 共用，例如 Release 中的 1.4.2）。" \
    "   Every peer must use the exact same ModVersion string (shared by Windows and Mac, for example 1.4.2 from Releases)." \
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

parse_args "$@"
main
