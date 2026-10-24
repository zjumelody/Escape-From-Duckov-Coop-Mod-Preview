#!/bin/bash
# check-coop-copy.sh
# 异步检测联机副本是否满足 prepare-duckov-coop-app.sh 写入的 entitlements。
# Async readiness check for a co-op copy against the entitlements prepare writes.
#
# Criteria (same keys as scripts/mac/duckov-coop.entitlements):
#   com.apple.security.app-sandbox = false (or key absent)
#   com.apple.security.network.client = true
#   com.apple.security.network.server = true
# Dest must be an .app bundle with Contents/Info.plist.
# Always exit 0; GUI parses STATUS.

set -u

DEST="${1:-}"

emit() {
  printf '%s\n' "$@"
}

if [[ -z "$DEST" ]]; then
  emit "STATUS missing"
  exit 0
fi

# Reject non-bundles early.
case "$DEST" in
  *.app|*.APP) ;;
  *)
    emit "STATUS missing"
    exit 0
    ;;
esac

if [[ ! -d "$DEST" || ! -f "$DEST/Contents/Info.plist" ]]; then
  emit "STATUS missing"
  exit 0
fi

if ! command -v codesign >/dev/null 2>&1; then
  emit "STATUS error"
  emit "ERROR codesign-missing"
  exit 0
fi

TMP="$(mktemp "${TMPDIR:-/tmp}/duckov-coop-ent.XXXXXX.plist")"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

# codesign prints XML/binary entitlements; normalize to xml1 for PlistBuddy.
if ! codesign -d --entitlements :- "$DEST" >"$TMP.raw" 2>/dev/null; then
  emit "STATUS needs_fix"
  emit "ERROR codesign-entitlements-unreadable"
  exit 0
fi

if [[ ! -s "$TMP.raw" ]]; then
  # Empty entitlements: sandbox off by absence, but network keys missing → needs_fix.
  emit "STATUS needs_fix"
  emit "SANDBOX absent"
  emit "NETWORK_CLIENT absent"
  emit "NETWORK_SERVER absent"
  exit 0
fi

if ! plutil -convert xml1 -o "$TMP" "$TMP.raw" 2>/dev/null; then
  # Some codesign builds already write xml; try as-is.
  if ! cp "$TMP.raw" "$TMP" 2>/dev/null; then
    emit "STATUS needs_fix"
    emit "ERROR entitlements-parse"
    exit 0
  fi
fi

plist_bool() {
  local key="$1"
  local val
  val="$(/usr/libexec/PlistBuddy -c "Print :${key}" "$TMP" 2>/dev/null || true)"
  if [[ -z "$val" ]]; then
    printf '%s' "absent"
    return
  fi
  case "$val" in
    true|TRUE|1|yes|YES) printf '%s' "true" ;;
    false|FALSE|0|no|NO) printf '%s' "false" ;;
    *) printf '%s' "$val" ;;
  esac
}

SANDBOX="$(plist_bool "com.apple.security.app-sandbox")"
CLIENT="$(plist_bool "com.apple.security.network.client")"
SERVER="$(plist_bool "com.apple.security.network.server")"

emit "SANDBOX ${SANDBOX}"
emit "NETWORK_CLIENT ${CLIENT}"
emit "NETWORK_SERVER ${SERVER}"

# Match prepare entitlements: sandbox off (false or absent), both network keys true.
ready=1
if [[ "$SANDBOX" == "true" ]]; then
  ready=0
fi
if [[ "$CLIENT" != "true" ]]; then
  ready=0
fi
if [[ "$SERVER" != "true" ]]; then
  ready=0
fi

if [[ "$ready" -eq 1 ]]; then
  emit "STATUS ready"
else
  emit "STATUS needs_fix"
fi
exit 0
