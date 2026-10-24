#!/usr/bin/env bash
# sync-duckov-config.sh
# 在两份鸭科夫配置根目录之间镜像内容（Saves/、Mods 配置等）。
# Mirror the contents of one Duckov config root onto the other
# (Saves/, Mods configs, and the rest of that folder).
#
# 原版配置位置 / original config folder — 原版沙盒配置（App Sandbox 开着）:
#   ~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov
# 联机副本配置位置 / co-op config folder — 联机副本配置（App Sandbox 关掉）:
#   ~/Library/Application Support/com.bilibili.duckov
#
# 两边 Bundle ID 相同。分成两个文件夹是因为沙盒开或关，不是因为 .app 放在哪。
# Both apps share one bundle id. The folders differ because App Sandbox is on or
# off, not because the .app files live in different places.
#
# 图形工具 DuckovCoopPrepare.app 会调用本脚本。也可以在终端里直接运行。
# DuckovCoopPrepare.app calls this script. It can also be run from Terminal.

set -euo pipefail

BUNDLE_ID="com.bilibili.duckov"
RSYNC="/usr/bin/rsync"
WORK_OUT=""
WORK_ERR=""
SELF_TEST_DIR=""

cleanup() {
  rm -f "${WORK_OUT:-}" "${WORK_ERR:-}"
  if [[ -n "${SELF_TEST_DIR:-}" ]]; then
    rm -rf "$SELF_TEST_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
用法 / Usage:
  sync-duckov-config.sh --direction original-to-coop
  sync-duckov-config.sh --direction coop-to-original
  sync-duckov-config.sh --from SRC --to DEST

把一份配置根目录里的内容镜像到另一份（rsync -a --delete）。
Mirror one config root's contents onto the other (rsync -a --delete).

方向 / Directions:
  original-to-coop, 1to2     原版配置位置 → 联机副本配置位置 / original config folder → co-op config folder
  coop-to-original, 2to1     联机副本配置位置 → 原版配置位置 / co-op config folder → original config folder

--from 和 --to 只能是下面这两个文件夹（可带 ~ 或末尾斜杠）。
--from and --to must be these two folders (~ and a trailing slash are fine).

  原版配置位置 / original config folder — 原版沙盒配置
  ~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov

  联机副本配置位置 / co-op config folder — 联机副本配置
  ~/Library/Application Support/com.bilibili.duckov

同步前请完全退出原版和联机副本。目标里多出来的文件会被删除。
Quit the original game and the co-op copy first. Files that exist only in the
destination are deleted.

若读取原版配置位置时出现 Operation not permitted，请在
「系统设置 → 隐私与安全性 → 完全磁盘访问权限」中加入 /bin/bash（点 + → ⌘⇧G → 输入 /bin/bash）后重试。
图形界面 DuckovCoopPrepare 已尽量在本进程同步；本脚本经 bash 运行，仍需要给 /bin/bash 授权。
If reading the original config folder prints Operation not permitted, add /bin/bash
under System Settings → Privacy & Security → Full Disk Access (+ → ⌘⇧G → /bin/bash), then try again.
The DuckovCoopPrepare GUI prefers in-process sync; this script still runs under bash and needs bash FDA.

环境变量 / Environment:
  DUCKOV_GUI_LOG  若设置，进度会同时追加写入该文件（供图形工具显示）
                  When set, progress is also appended there for the graphical helper
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

require_macos() {
  local kernel
  kernel="$(uname -s)"
  if [[ "$kernel" != "Darwin" ]]; then
    die \
      "此脚本只能在 macOS 上运行（当前系统：${kernel}）。" \
      "This script only runs on macOS (current system: ${kernel})."
  fi
}

original_config_path() {
  printf '%s\n' "$HOME/Library/Containers/${BUNDLE_ID}/Data/Library/Application Support/${BUNDLE_ID}"
}

coop_config_path() {
  printf '%s\n' "$HOME/Library/Application Support/${BUNDLE_ID}"
}

# 去掉末尾斜杠，展开 ~，拒绝 . / .. 和空路径段。不跟随符号链接。
# Strip a trailing slash, expand ~, and reject "." / ".." / empty segments.
# Do not follow symlinks.
normalize_path() {
  local input="$1"
  local rest part
  case "$input" in
    "~")
      input="$HOME"
      ;;
    "~/"*)
      input="$HOME/${input#"~/"}"
      ;;
  esac
  case "$input" in
    /*) ;;
    *)
      die "路径必须是绝对路径。 / Path must be absolute." "$input"
      ;;
  esac
  while [[ "$input" != "/" && "$input" == */ ]]; do
    input="${input%/}"
  done
  rest="${input#/}"
  while [[ -n "$rest" ]]; do
    part="${rest%%/*}"
    if [[ -z "$part" || "$part" == "." || "$part" == ".." ]]; then
      die "拒绝不安全的路径。 / Refusing an unsafe path." "$1"
    fi
    case "$rest" in
      */*) rest="${rest#*/}" ;;
      *) rest="" ;;
    esac
  done
  printf '%s\n' "$input"
}

assert_allowed_config_path() {
  local path="$1"
  local loc1 loc2
  loc1="$(original_config_path)"
  loc2="$(coop_config_path)"
  if [[ "$path" != "$loc1" && "$path" != "$loc2" ]]; then
    die \
      "只允许同步这两个配置文件夹。 / Only these two config folders can be synced." \
      "原版配置位置 / original config folder: $loc1" \
      "联机副本配置位置 / co-op config folder: $loc2" \
      "收到 / Received: $path"
  fi
}

looks_like_tcc() {
  local file text
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    text="$(cat "$file" 2>/dev/null || true)"
    case "$text" in
      *"Operation not permitted"*|*"Operation not allowed"*)
        return 0
        ;;
    esac
    case "$text" in
      *"Permission denied"*)
        case "$text" in
          *"/Containers/"*)
            return 0
            ;;
        esac
        ;;
    esac
  done
  return 1
}

permission_denied() {
  note "需要完全磁盘访问权限。请打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」，加入 DuckovCoopPrepare.app，然后重试。"
  note "Full Disk Access is required. Open System Settings → Privacy & Security → Full Disk Access, add DuckovCoopPrepare.app, then try again."
  note "读取原版配置位置（~/Library/Containers 里的沙盒容器）时，系统经常会拒绝未授权的应用。"
  note "macOS often blocks unapproved apps from reading the original config folder (the sandbox container under ~/Library/Containers)."
  note "NEED_FULL_DISK_ACCESS"
  exit 77
}

append_work_output() {
  if [[ -n "${WORK_OUT:-}" && -f "$WORK_OUT" && -s "$WORK_OUT" ]]; then
    cat "$WORK_OUT"
    if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
      cat "$WORK_OUT" >>"$DUCKOV_GUI_LOG" || true
    fi
  fi
  if [[ -n "${WORK_ERR:-}" && -f "$WORK_ERR" && -s "$WORK_ERR" ]]; then
    cat "$WORK_ERR" >&2
    if [[ -n "${DUCKOV_GUI_LOG:-}" ]]; then
      cat "$WORK_ERR" >>"$DUCKOV_GUI_LOG" || true
    fi
  fi
}

prepare_work_files() {
  rm -f "${WORK_OUT:-}" "${WORK_ERR:-}"
  WORK_OUT="$(mktemp "${TMPDIR:-/tmp}/duckov-sync-out.XXXXXX")"
  WORK_ERR="$(mktemp "${TMPDIR:-/tmp}/duckov-sync-err.XXXXXX")"
  : >"$WORK_OUT"
  : >"$WORK_ERR"
}

source_has_entries() {
  local entry
  for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    if [[ -e "$entry" || -L "$entry" ]]; then
      return 0
    fi
  done
  return 1
}

reject_symlink() {
  local path="$1" label="$2"
  if [[ -L "$path" ]]; then
    die "拒绝符号链接（${label}）。 / Refusing a symlink (${label})." "$path"
  fi
}

paths_are_nested() {
  local left="$1" right="$2"
  case "$left/" in
    "$right/"*) return 0 ;;
  esac
  case "$right/" in
    "$left/"*) return 0 ;;
  esac
  return 1
}

run_rsync_mirror() {
  local src="$1" dest="$2" code
  : >"$WORK_OUT"
  : >"$WORK_ERR"
  set +e
  "$RSYNC" -a --delete --stats -- "${src}/" "${dest}/" >"$WORK_OUT" 2>"$WORK_ERR"
  code=$?
  set -e
  if [[ "$code" -ne 0 ]] && grep -E -q 'unknown option|unrecognized option' "$WORK_ERR"; then
    : >"$WORK_OUT"
    : >"$WORK_ERR"
    set +e
    "$RSYNC" -a --delete -- "${src}/" "${dest}/" >"$WORK_OUT" 2>"$WORK_ERR"
    code=$?
    set -e
  fi
  printf '%s\n' "$code"
}

perform_sync() {
  local src="$1" dest="$2" code
  [[ -n "${HOME:-}" ]] || die "没有 HOME。 / HOME is not set."
  src="$(normalize_path "$src")"
  dest="$(normalize_path "$dest")"
  assert_allowed_config_path "$src"
  assert_allowed_config_path "$dest"
  if [[ "$src" == "$dest" ]]; then
    die "来源和目标相同，已拒绝。 / Source and destination are the same. Refusing."
  fi
  if paths_are_nested "$src" "$dest"; then
    die "来源和目标嵌套，已拒绝。 / Source and destination are nested. Refusing."
  fi
  reject_symlink "$src" "source"
  if [[ -e "$dest" ]]; then
    reject_symlink "$dest" "destination"
  fi
  if [[ ! -d "$src" ]]; then
    die \
      "找不到来源文件夹。 / Source folder was not found." \
      "$src" \
      "若这是原版配置位置，请先启动一次原版 Duckov.app，让系统生成沙盒容器。" \
      "If this is the original config folder, launch the original Duckov.app once so macOS can create the container."
  fi

  prepare_work_files
  if ! /bin/ls -A "$src" >/dev/null 2>"$WORK_ERR"; then
    append_work_output
    if looks_like_tcc "$WORK_ERR"; then
      permission_denied
    fi
    die "无法读取来源文件夹。 / Could not read the source folder." "$src"
  fi
  : >"$WORK_ERR"

  note "开始镜像配置内容… / Mirroring config contents…"
  note "从 / From: $src"
  note "到 / To: $dest"
  note "命令 / Command: $RSYNC -a --delete -- ${src}/ ${dest}/"
  if ! source_has_entries "$src"; then
    note "来源文件夹是空的。继续会清空目标里的内容。 / The source folder is empty. Continuing clears the destination."
  fi

  if [[ -e "$dest" && ! -d "$dest" ]]; then
    die "目标不是文件夹。 / Destination is not a folder." "$dest"
  fi
  if ! mkdir -p -- "$dest" 2>"$WORK_ERR"; then
    append_work_output
    if looks_like_tcc "$WORK_ERR"; then
      permission_denied
    fi
    die "无法创建目标文件夹。 / Could not create the destination folder." "$dest"
  fi
  : >"$WORK_ERR"
  reject_symlink "$dest" "destination"
  if [[ ! -d "$dest" ]]; then
    die "目标文件夹不存在。 / Destination folder is missing." "$dest"
  fi

  note "rsync 正在复制… / rsync is copying…"
  code="$(run_rsync_mirror "$src" "$dest")"
  append_work_output
  if [[ "$code" -ne 0 ]]; then
    if looks_like_tcc "$WORK_OUT" "$WORK_ERR"; then
      permission_denied
    fi
    die "同步失败（rsync 退出码 ${code}）。 / Sync failed (rsync exit ${code})."
  fi
  note "同步完成。 / Sync finished."
}

dispatch() {
  local direction="" from="" to="" src="" dest=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --direction)
        [[ $# -ge 2 ]] || die "缺少方向。 / Missing direction."
        direction="$2"
        shift 2
        ;;
      --from)
        [[ $# -ge 2 ]] || die "缺少来源。 / Missing source."
        from="$2"
        shift 2
        ;;
      --to)
        [[ $# -ge 2 ]] || die "缺少目标。 / Missing destination."
        to="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "未知参数：${1} / Unknown argument: ${1}"
        ;;
    esac
  done

  if [[ -n "$direction" && ( -n "$from" || -n "$to" ) ]]; then
    die "请只使用 --direction，或只使用 --from 与 --to。 / Use either --direction, or --from with --to."
  fi

  if [[ -n "$direction" ]]; then
    case "$direction" in
      original-to-coop|1to2)
        src="$(original_config_path)"
        dest="$(coop_config_path)"
        ;;
      coop-to-original|2to1)
        src="$(coop_config_path)"
        dest="$(original_config_path)"
        ;;
      *)
        die "未知方向：${direction} / Unknown direction: ${direction}"
        ;;
    esac
  elif [[ -n "$from" || -n "$to" ]]; then
    [[ -n "$from" && -n "$to" ]] || die "需要同时提供 --from 和 --to。 / Both --from and --to are required."
    src="$from"
    dest="$to"
  else
    usage >&2
    die "需要 --direction，或 --from 与 --to。 / Pass --direction, or --from and --to."
  fi

  perform_sync "$src" "$dest"
}

run_self_test() {
  local root home loc1 loc2 sibling
  # Strip trailing slash on TMPDIR so normalize_path does not see an empty // segment.
  # 去掉 TMPDIR 末尾斜杠，避免路径里出现空段被 normalize_path 拒绝。
  local tmpbase="${TMPDIR:-/tmp}"
  tmpbase="${tmpbase%/}"
  root="$(mktemp -d "${tmpbase}/duckov-sync-test.XXXXXX")"
  SELF_TEST_DIR="$root"
  # 路径里留一个空格，确认 Application Support 这种文件夹名不会被拆开。
  # Keep a space in the path so names like "Application Support" stay intact.
  home="$root/home dir"
  mkdir -p "$home"
  HOME="$home"
  export HOME
  export DUCKOV_SYNC_SKIP_PLATFORM=1

  loc1="$(original_config_path)"
  loc2="$(coop_config_path)"
  mkdir -p "$loc1/Saves" "$loc1/Mods"
  printf '%s\n' 'original-save' >"$loc1/Saves/slot.txt"
  printf '%s\n' 'original-mod' >"$loc1/Mods/config.cfg"
  mkdir -p "$loc2/Saves" "$loc2/Extra"
  printf '%s\n' 'stale' >"$loc2/Saves/slot.txt"
  printf '%s\n' 'gone' >"$loc2/Extra/old.txt"
  sibling="$home/Library/Application Support/do-not-touch.txt"
  mkdir -p "$(dirname "$sibling")"
  printf '%s\n' 'keep' >"$sibling"

  "$BASH" "$0" --direction original-to-coop
  [[ "$(cat "$loc2/Saves/slot.txt")" == "original-save" ]] || die "self-test: slot was not copied to the co-op config folder"
  [[ "$(cat "$loc2/Mods/config.cfg")" == "original-mod" ]] || die "self-test: mod config was not copied to the co-op config folder"
  [[ ! -e "$loc2/Extra/old.txt" ]] || die "self-test: extra destination file was not deleted"
  [[ "$(cat "$sibling")" == "keep" ]] || die "self-test: a file outside the config root was modified"

  printf '%s\n' 'coop-save' >"$loc2/Saves/slot.txt"
  rm -rf "$loc2/Mods"
  mkdir -p "$loc1/OnlyOnOriginal"
  printf '%s\n' 'extra' >"$loc1/OnlyOnOriginal/extra.txt"
  "$BASH" "$0" --direction coop-to-original
  [[ "$(cat "$loc1/Saves/slot.txt")" == "coop-save" ]] || die "self-test: slot was not copied back to the original config folder"
  [[ ! -e "$loc1/Mods" ]] || die "self-test: Mods was not removed from the original config folder"
  [[ ! -e "$loc1/OnlyOnOriginal" ]] || die "self-test: extra destination directory was not deleted"

  mkdir -p "$loc2/Saves"
  printf '%s\n' 'via-from' >"$loc2/Saves/slot.txt"
  "$BASH" "$0" --from "$loc2/" --to "$loc1"
  [[ "$(cat "$loc1/Saves/slot.txt")" == "via-from" ]] || die "self-test: --from/--to did not mirror"

  if "$BASH" "$0" --from "$home" --to "$loc2"; then
    die "self-test: allowlist accepted HOME"
  fi
  if "$BASH" "$0" --direction sideways; then
    die "self-test: unknown direction was accepted"
  fi

  rm -rf "$loc1"
  if "$BASH" "$0" --direction original-to-coop; then
    die "self-test: missing source was accepted"
  fi
  # 来源缺失时不应把空镜像写进目标。目标里原有文件应还在。
  # A missing source must not wipe the destination.
  [[ "$(cat "$loc2/Saves/slot.txt")" == "via-from" ]] || die "self-test: missing source changed the co-op config folder"
  if "$BASH" "$0" --from "$loc2/../${BUNDLE_ID}" --to "$loc1"; then
    die "self-test: dotdot path was accepted"
  fi

  ln -s "$loc2" "$loc1"
  if "$BASH" "$0" --direction original-to-coop; then
    die "self-test: symlink source was accepted"
  fi
  rm -f "$loc1"

  local tcc
  tcc="$(mktemp)"
  printf '%s\n' 'ls: /Users/me/Library/Containers/com.bilibili.duckov: Operation not permitted' >"$tcc"
  looks_like_tcc "$tcc" || die "self-test: TCC detector missed Operation not permitted"
  printf '%s\n' 'mkdir: Permission denied' >"$tcc"
  if looks_like_tcc "$tcc"; then
    die "self-test: generic Permission denied was treated as Full Disk Access"
  fi
  rm -f "$tcc"

  # Empty folder on both sides with unequal mtimes: rsync -a must align dest mtime.
  # 两边同名空文件夹时间不同：rsync -a 同步后目标 mtime 应与来源一致。
  mkdir -p "$loc1/Saves" "$loc2/Saves"
  printf '%s\n' 'mtime-slot' >"$loc1/Saves/slot.txt"
  printf '%s\n' 'mtime-slot' >"$loc2/Saves/slot.txt"
  mkdir -p "$loc1/新建文件夹" "$loc2/新建文件夹"
  touch -t 202001011200.00 "$loc1/新建文件夹"
  touch -t 202001021400.00 "$loc2/新建文件夹"
  "$BASH" "$0" --direction original-to-coop
  local t1 t2
  t1="$(stat -f %m "$loc1/新建文件夹" 2>/dev/null || stat -c %Y "$loc1/新建文件夹")"
  t2="$(stat -f %m "$loc2/新建文件夹" 2>/dev/null || stat -c %Y "$loc2/新建文件夹")"
  [[ "$t1" == "$t2" ]] || die "self-test: empty folder mtime not synced ($t1 vs $t2)"
  # Empty folder only on source must appear on dest.
  # 仅来源有空文件夹时，目标必须出现该文件夹。
  rm -rf "$loc2/仅来源空目录"
  mkdir -p "$loc1/仅来源空目录"
  touch -t 202001031600.00 "$loc1/仅来源空目录"
  "$BASH" "$0" --direction original-to-coop
  [[ -d "$loc2/仅来源空目录" ]] || die "self-test: empty folder only on source was not created on dest"
  t1="$(stat -f %m "$loc1/仅来源空目录" 2>/dev/null || stat -c %Y "$loc1/仅来源空目录")"
  t2="$(stat -f %m "$loc2/仅来源空目录" 2>/dev/null || stat -c %Y "$loc2/仅来源空目录")"
  [[ "$t1" == "$t2" ]] || die "self-test: source-only empty folder mtime mismatch ($t1 vs $t2)"

  note "self-test ok"
}

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
  exit 0
fi

if [[ "${DUCKOV_SYNC_SKIP_PLATFORM:-}" != "1" ]]; then
  require_macos
fi

dispatch "$@"
