#!/bin/bash
# config-fingerprint.sh ORIGINAL_DIR COOP_DIR
# Print a content fingerprint of both Duckov config folders.
# The GUI compares the text with config-sync-state.js. It does not decide colors.
#
# Identity ignores mtime. NEWEST_MTIME is the newest whole-second mtime among
# tracked regular files and symlinks. Directory mtime is used only when the
# tree has no files or symlinks (an empty folder still has a time). Finder
# updates the folder mtime when it writes .DS_Store, and those files are
# ignored, so folder mtime is not the "which side is newer" signal.
# .DS_Store, .localized, and AppleDouble (._*) are omitted.
# A path that contains a tab or newline is skipped, and that side is marked
# SKIPPED 1 so the GUI will not call the trees identical.
# Symlinks are recorded as links and are not followed.
# Permission errors print READABLE 0 and ERROR permission, then continue.

set -u

# GNU stat uses -c. BSD/macOS stat uses -f. Keep only an all-digit token so a
# filesystem listing can never become a record field.
mtime_of() {
  local p="$1"
  local m=""
  m=$(stat -c '%Y' "$p" 2>/dev/null) || true
  if [[ ! "$m" =~ ^[0-9]+$ ]]; then
    m=$(stat -f '%m' "$p" 2>/dev/null) || true
  fi
  if [[ ! "$m" =~ ^[0-9]+$ ]]; then
    m=""
  fi
  printf '%s' "$m"
}

mode_of() {
  local p="$1"
  local m=""
  m=$(stat -c '%a' "$p" 2>/dev/null) || true
  if [[ ! "$m" =~ ^[0-9]+$ ]]; then
    m=$(stat -f '%Lp' "$p" 2>/dev/null) || true
  fi
  if [[ ! "$m" =~ ^[0-9]+$ ]]; then
    m="0"
  fi
  printf '%s' "$m"
}

hash_of() {
  local p="$1"
  local line=""
  if command -v shasum >/dev/null 2>&1; then
    line=$(shasum -a 256 -- "$p" 2>/dev/null) || line=""
  fi
  if [[ -z "$line" ]] && command -v sha256sum >/dev/null 2>&1; then
    line=$(sha256sum -- "$p" 2>/dev/null) || line=""
  fi
  printf '%s' "${line%% *}"
}

note_mtime() {
  local m="$1"
  local bucket="$2"
  [[ "$m" =~ ^[0-9]+$ ]] || return 0
  if [[ "$bucket" == "leaf" ]]; then
    if [[ "$leaf_have" -eq 0 || "$m" -gt "$leaf_newest" ]]; then
      leaf_newest="$m"
      leaf_have=1
    fi
  else
    if [[ "$dir_have" -eq 0 || "$m" -gt "$dir_newest" ]]; then
      dir_newest="$m"
      dir_have=1
    fi
  fi
}

emit_side() {
  local label="$1"
  local dir="$2"
  local start rel base mode hash target
  local leaf_newest=0 leaf_have=0 dir_newest=0 dir_have=0
  local skipped=0
  local rec

  printf 'SIDE %s\n' "$label"
  if [[ -z "$dir" || ! -e "$dir" || -L "$dir" || ! -d "$dir" ]]; then
    printf 'EXISTS 0\n'
    printf 'READABLE 1\n'
    printf 'NEWEST_MTIME -\n'
    return 0
  fi
  printf 'EXISTS 1\n'
  if ! ls "$dir" >/dev/null 2>&1; then
    printf 'READABLE 0\n'
    printf 'ERROR permission\n'
    printf 'NEWEST_MTIME -\n'
    return 0
  fi
  printf 'READABLE 1\n'

  rec=$(mktemp "${TMPDIR:-/tmp}/duckov-fp.XXXXXX") || {
    printf 'READABLE 0\n'
    printf 'ERROR mktemp\n'
    printf 'NEWEST_MTIME -\n'
    return 0
  }

  start=$(pwd)
  if ! cd "$dir"; then
    rm -f "$rec"
    printf 'READABLE 0\n'
    printf 'ERROR permission\n'
    printf 'NEWEST_MTIME -\n'
    return 0
  fi

  note_mtime "$(mtime_of ".")" dir

  while IFS= read -r -d '' path; do
    rel="${path#./}"
    base=$(basename "$path")
    case "$base" in
      .DS_Store|.localized|._*)
        continue
        ;;
    esac
    case "$rel" in
      *$'\n'*|*$'\t'*)
        skipped=1
        continue
        ;;
    esac
    if [[ -L "$path" ]]; then
      target=$(readlink "$path" 2>/dev/null) || target=""
      case "$target" in
        *$'\n'*|*$'\t'*)
          skipped=1
          continue
          ;;
      esac
      mode=$(mode_of "$path")
      printf 'L\t%s\t%s\t%s\n' "$mode" "$target" "$rel" >>"$rec"
      note_mtime "$(mtime_of "$path")" leaf
    elif [[ -d "$path" ]]; then
      mode=$(mode_of "$path")
      printf 'D\t%s\t%s\n' "$mode" "$rel" >>"$rec"
      note_mtime "$(mtime_of "$path")" dir
    elif [[ -f "$path" ]]; then
      hash=$(hash_of "$path")
      if [[ -z "$hash" ]]; then
        skipped=1
        continue
      fi
      mode=$(mode_of "$path")
      printf 'F\t%s\t%s\t%s\n' "$hash" "$mode" "$rel" >>"$rec"
      note_mtime "$(mtime_of "$path")" leaf
    fi
  done < <(find . -mindepth 1 \( -name .DS_Store -o -name .localized -o -name '._*' \) -prune -o -print0)

  if [[ "$leaf_have" -eq 1 ]]; then
    printf 'NEWEST_MTIME %s\n' "$leaf_newest"
  elif [[ "$dir_have" -eq 1 ]]; then
    printf 'NEWEST_MTIME %s\n' "$dir_newest"
  else
    printf 'NEWEST_MTIME -\n'
  fi
  if [[ "$skipped" -eq 1 ]]; then
    printf 'SKIPPED 1\n'
  fi
  LC_ALL=C sort "$rec"

  cd "$start" 2>/dev/null || true
  rm -f "$rec"
}

emit_side original "${1:-}"
emit_side coop "${2:-}"
exit 0
