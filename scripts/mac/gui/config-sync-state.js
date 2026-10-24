// Compare the original Duckov config folder with the co-op config folder.
//
// Fingerprint (see config-fingerprint.sh):
// - Ignore .DS_Store, .localized, and AppleDouble names (._*).
// - Regular files: sha256 of the bytes, plus the permission mode and relative path.
// - Directories: mode and relative path, so an empty folder still counts.
// - Symlinks: the link text, not the target's bytes. Symlinks are not followed.
// - Paths are compared as bytes. mtime, owner, xattrs, and the ignored Apple files
//   are not part of the fingerprint.
// Two trees are fully identical when both exist, both are readable, nothing was
// skipped, and those records match. mtime is not part of identity.
//
// Which side is newer (identical and different share the same leaf/dir rule):
// - If both sides have unequal leaf mtimes (files/symlinks), use leaf only
//   (file edits bump parent dir mtime on APFS, which would otherwise tie).
// - If leaf mtimes are equal or missing, use max(leaf, NEWEST_DIR_MTIME) so a
//   newly created empty folder makes that side newer — including when both sides
//   add the SAME-named empty folder (fingerprint still identical; Finder default
//   names like 新建文件夹 / 未命名文件夹). Leaf-only on identical used to hide that.
// A missing folder is older than one that exists. Equal maximums, with different
// contents, do not pick a direction.
//
// Button colors are painted in main.js syncOutboundPaintColor (GUI):
// - identical: newer green, older blue; equal mtime → both green
// - different: newer cyan, older yellow; equal mtime → both cyan
// - unreadable / no mtime → orange (GUI); detecting → grey
// compareConfigSides still reports toCoop/toOriginal for describeCompare text.
//
// Timestamps are formatted for a caller-supplied offset (the Mac's local zone in
// the GUI; tests pass minutes east of UTC). Chinese month and day are zero-padded
// so 10月23日 matches the shorter form, and 3月5日 stays aligned.

function pad2(n) {
  var v = Math.floor(Math.abs(Number(n)));
  if (!isFinite(v)) v = 0;
  return (v < 10 ? '0' : '') + v;
}

function formatSyncStamp(epochSeconds, offsetMinutes) {
  // offsetMinutes = local zone minutes east of UTC (e.g. Asia/Shanghai = 480).
  // Callers must pass the system/local offset — not 0 (UTC) — so 「最后更新于」 matches Finder.
  // offsetMinutes 为本地时区相对 UTC 的分钟（如 Asia/Shanghai = 480）；不要传 0，否则会显示成 UTC。
  var epoch = Number(epochSeconds);
  var offset = Number(offsetMinutes);
  if (!isFinite(epoch) || !isFinite(offset)) return null;
  var ms = Math.floor(epoch) * 1000 + Math.round(offset) * 60 * 1000;
  var d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  var zh = d.getUTCFullYear() + '年' + pad2(d.getUTCMonth() + 1) + '月' + pad2(d.getUTCDate()) + '日 '
    + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  var en = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' '
    + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  return { zh: zh, en: en };
}

function syncButtonLines(which, epochSeconds, offsetMinutes) {
  // Line 1 ZH action, line 2 EN action, line 3 Simplified Chinese only:
  // stamp when mtime known, or a permission hint when the caller asks.
  // 第 1 行中文、第 2 行英文、第 3 行仅简体：有 mtime 显示「最后更新于：」，否则可由调用方改成授权提示。
  var lines = which === 'to-coop'
    ? ['（同步文件）原版配置 → 联机副本', '(sync files) original → co-op']
    : ['（同步文件）联机副本 → 原版配置', '(sync files) co-op → original'];
  if (epochSeconds == null || epochSeconds === '') return lines;
  var stamp = formatSyncStamp(epochSeconds, offsetMinutes);
  if (!stamp) return lines;
  return lines.concat(['最后更新于：' + stamp.zh]);
}

function syncPermissionHintLine() {
  // CONFIG detect/sync buttons only. Not for Mods / Finder open (those need no bash FDA).
  // 仅配置检测/同步按钮。Mods / 访达打开不需要 bash FDA。
  return '需要授权：「系统设置 → 隐私与安全性 → 完全磁盘访问权限」添加 /bin/bash';
}

function emptySide() {
  return {
    exists: false,
    readable: true,
    newestMtime: null,
    newestDirMtime: null,
    records: [],
    skipped: false,
    error: ''
  };
}

function parseFingerprint(text) {
  var out = { original: emptySide(), coop: emptySide() };
  var current = null;
  var lines = String(text || '').split('\n');
  var i;
  var line;
  var raw;
  var n;
  for (i = 0; i < lines.length; i++) {
    line = lines[i];
    if (!line) continue;
    if (line.indexOf('SIDE ') === 0) {
      var name = line.substring(5);
      if (name === 'original' || name === 'coop') current = out[name];
      else current = null;
      continue;
    }
    if (!current) continue;
    if (line.indexOf('EXISTS ') === 0) {
      current.exists = line.substring(7) === '1';
      continue;
    }
    if (line.indexOf('READABLE ') === 0) {
      current.readable = line.substring(9) === '1';
      continue;
    }
    if (line.indexOf('ERROR ') === 0) {
      current.error = line.substring(6).replace(/^\s+|\s+$/g, '');
      if (current.error.indexOf('permission') !== -1) current.readable = false;
      continue;
    }
    if (line.indexOf('SKIPPED ') === 0) {
      current.skipped = line.substring(8) === '1';
      continue;
    }
    if (line.indexOf('NEWEST_MTIME ') === 0) {
      raw = line.substring(13);
      if (!raw || raw === '-') current.newestMtime = null;
      else {
        n = Number(raw);
        current.newestMtime = isFinite(n) ? n : null;
      }
      continue;
    }
    if (line.indexOf('NEWEST_DIR_MTIME ') === 0) {
      raw = line.substring(17);
      if (!raw || raw === '-') current.newestDirMtime = null;
      else {
        n = Number(raw);
        current.newestDirMtime = isFinite(n) ? n : null;
      }
      continue;
    }
    if (line.charAt(0) === 'F' || line.charAt(0) === 'D' || line.charAt(0) === 'L') {
      current.records.push(line);
    }
  }
  return out;
}

function recordsEqual(a, b) {
  var left = (a || []).slice().sort();
  var right = (b || []).slice().sort();
  if (left.length !== right.length) return false;
  var i;
  for (i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function mtimeRank(side, includeDirs) {
  if (!side || !side.exists) return -1;
  var leaf = side.newestMtime;
  var dir = side.newestDirMtime;
  var best = null;
  if (leaf != null && isFinite(leaf)) best = leaf;
  if (includeDirs && dir != null && isFinite(dir)) {
    if (best == null || dir > best) best = dir;
  }
  if (best == null) return 0;
  return best;
}

function effectiveSideMtime(side, includeDirs) {
  if (!side || !side.exists) return null;
  var leaf = side.newestMtime;
  var dir = side.newestDirMtime;
  var best = null;
  if (leaf != null && isFinite(leaf)) best = leaf;
  if (includeDirs && dir != null && isFinite(dir)) {
    if (best == null || dir > best) best = dir;
  }
  return best;
}

function sideReadableFlag(side) {
  return !!(side && side.exists && side.readable && !side.skipped);
}

function compareConfigSides(original, coop) {
  // Always report per-side readable from THIS fingerprint. GUI must not treat a
  // leftover mtime as permission — orange unless readable AND fresh mtime.
  // 每次指纹都带上两侧可读标记；GUI 不能单靠旧 mtime 当有权限，必须可读且有新 mtime 才绿/黄。
  var oRead = sideReadableFlag(original);
  var cRead = sideReadableFlag(coop);
  var unknown = {
    status: 'unknown',
    identical: false,
    toCoop: 'neutral',
    toOriginal: 'neutral',
    originalMtime: null,
    coopMtime: null,
    originalReadable: false,
    coopReadable: false
  };
  if (!original || !coop) {
    return unknown;
  }
  if (!original.readable || !coop.readable || original.skipped || coop.skipped) {
    return {
      status: 'unreadable',
      identical: false,
      toCoop: 'neutral',
      toOriginal: 'neutral',
      // Mtime only when that side was freshly readable in this probe.
      // 仅本轮探测可读时才带 mtime。
      originalMtime: oRead ? original.newestMtime : null,
      coopMtime: cRead ? coop.newestMtime : null,
      originalReadable: oRead,
      coopReadable: cRead
    };
  }
  if (!original.exists && !coop.exists) {
    return {
      status: 'missing',
      identical: false,
      toCoop: 'neutral',
      toOriginal: 'neutral',
      originalMtime: null,
      coopMtime: null,
      originalReadable: false,
      coopReadable: false
    };
  }
  // Shared rule for identical and different: prefer unequal leaf mtimes; when
  // leaves tie/missing, fold in directory mtimes so empty-folder create times
  // still show 较新/较旧 (including same-named folders that keep fingerprints equal).
  // 相同与不同共用：优先不相同的文件时间；文件时间相同或没有时并入目录时间，
  // 使两边同名空文件夹（指纹仍相同）也能按创建时间显示较新/较旧。
  var oLeaf = effectiveSideMtime(original, false);
  var cLeaf = effectiveSideMtime(coop, false);
  var useDirs = !(oLeaf != null && cLeaf != null && oLeaf !== cLeaf);
  if (original.exists && coop.exists && recordsEqual(original.records, coop.records)) {
    return {
      status: 'identical',
      identical: true,
      toCoop: 'green',
      toOriginal: 'green',
      originalMtime: effectiveSideMtime(original, useDirs),
      coopMtime: effectiveSideMtime(coop, useDirs),
      originalReadable: oRead,
      coopReadable: cRead
    };
  }
  var oEff = original.exists ? effectiveSideMtime(original, useDirs) : null;
  var cEff = coop.exists ? effectiveSideMtime(coop, useDirs) : null;
  var oRank = mtimeRank(original, useDirs);
  var cRank = mtimeRank(coop, useDirs);
  var toCoop;
  var toOriginal;
  if (oRank > cRank) {
    toCoop = 'blue';
    toOriginal = 'yellow';
  } else if (cRank > oRank) {
    toCoop = 'yellow';
    toOriginal = 'blue';
  } else {
    toCoop = 'yellow';
    toOriginal = 'yellow';
  }
  return {
    status: 'different',
    identical: false,
    toCoop: toCoop,
    toOriginal: toOriginal,
    originalMtime: oEff,
    coopMtime: cEff,
    originalReadable: oRead,
    coopReadable: cRead
  };
}

function describeCompare(result) {
  if (!result || result.status === 'unknown') {
    return {
      zh: '暂时无法比较两边的配置文件夹，同步按钮保持灰色。',
      en: 'The two config folders could not be compared yet. The sync buttons stay grey.'
    };
  }
  if (result.status === 'unreadable') {
    return {
      zh: '有一侧「配置文件夹」无法读取（与 Mods/Contents/Mods 无关；请给 /bin/bash 完全磁盘访问：+ → ⌘⇧G → /bin/bash），无法判断是否一致；步骤标题显示 ⚠️。',
      en: 'One config folder could not be read (unrelated to Mods/Contents/Mods; grant Full Disk Access to /bin/bash via + → ⌘⇧G). Identity cannot be decided; Step 2 shows ⚠️.'
    };
  }
  if (result.status === 'missing') {
    return {
      zh: '两边的配置文件夹都还不存在，同步按钮保持灰色。',
      en: 'Neither config folder exists yet. The sync buttons stay grey.'
    };
  }
  if (result.identical) {
    var oM = result.originalMtime;
    var cM = result.coopMtime;
    var oN = (oM == null || oM === '') ? NaN : Number(oM);
    var cN = (cM == null || cM === '') ? NaN : Number(cM);
    // Content match but mtimes differ → still green/yellow by time (buttons).
    // 内容相同但 mtime 不同 → 按钮仍按时间绿/黄。
    if (isFinite(oN) && isFinite(cN) && oN !== cN) {
      if (oN > cN) {
        return {
          zh: '两边配置内容一致，但原版更新时间较新：原版 → 副本为绿色，副本 → 原版为蓝色。',
          en: 'Config contents match, but original is newer by mtime: original → co-op green, co-op → original blue.'
        };
      }
      return {
        zh: '两边配置内容一致，但联机副本更新时间较新：副本 → 原版为绿色，原版 → 副本为蓝色。',
        en: 'Config contents match, but co-op is newer by mtime: co-op → original green, original → co-op blue.'
      };
    }
    return {
      zh: '两边配置（包括存档）一致，两个同步按钮为绿色。',
      en: 'The config folders, including saves, match. Both sync buttons are green.'
    };
  }
  if (result.toCoop === 'blue') {
    return {
      zh: '原版配置更新（内容不同）：原版 → 副本为青色，副本 → 原版为黄色。',
      en: 'The original config is newer (contents differ): original → co-op cyan, co-op → original yellow.'
    };
  }
  if (result.toOriginal === 'blue') {
    return {
      zh: '联机副本配置更新（内容不同）：副本 → 原版为青色，原版 → 副本为黄色。',
      en: 'The co-op config is newer (contents differ): co-op → original cyan, original → co-op yellow.'
    };
  }
  return {
    zh: '两边配置不一致，但修改时间分不出先后，两个同步按钮为黄色。',
    en: 'The config folders differ, and neither side is newer. Both sync buttons are yellow.'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports.formatSyncStamp = formatSyncStamp;
  module.exports.syncButtonLines = syncButtonLines;
  module.exports.syncPermissionHintLine = syncPermissionHintLine;
  module.exports.parseFingerprint = parseFingerprint;
  module.exports.compareConfigSides = compareConfigSides;
  module.exports.describeCompare = describeCompare;
}
