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
// Which side is newer: the maximum mtime, in whole seconds, among tracked regular
// files and symlinks. Directory mtime is the fallback only when that side has no
// files or symlinks, so a Finder .DS_Store does not make a folder look newer.
// A missing folder is older than one that exists. Equal maximums, with different
// contents, do not pick a direction.
//
// Button colors, for the outbound sync buttons:
// - both green when the fingerprints match
// - newer side's outbound button blue, older side's outbound button yellow
// - both yellow when the trees differ and neither maximum is newer
// - both neutral when a side cannot be read, a path was skipped, or neither folder exists
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
  var lines = which === 'to-coop'
    ? ['（同步文件）原版配置 → 联机副本', '(sync files) original → co-op']
    : ['（同步文件）联机副本 → 原版配置', '(sync files) co-op → original'];
  if (epochSeconds == null || epochSeconds === '') return lines;
  var stamp = formatSyncStamp(epochSeconds, offsetMinutes);
  if (!stamp) return lines;
  return lines.concat([
    '最后更新于：' + stamp.zh,
    'Last updated: ' + stamp.en
  ]);
}

function emptySide() {
  return {
    exists: false,
    readable: true,
    newestMtime: null,
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

function mtimeRank(side) {
  if (!side || !side.exists) return -1;
  if (side.newestMtime == null || !isFinite(side.newestMtime)) return 0;
  return side.newestMtime;
}

function compareConfigSides(original, coop) {
  var unknown = {
    status: 'unknown',
    identical: false,
    toCoop: 'neutral',
    toOriginal: 'neutral',
    originalMtime: null,
    coopMtime: null
  };
  if (!original || !coop || !original.readable || !coop.readable || original.skipped || coop.skipped) {
    return unknown;
  }
  if (!original.exists && !coop.exists) {
    return {
      status: 'missing',
      identical: false,
      toCoop: 'neutral',
      toOriginal: 'neutral',
      originalMtime: null,
      coopMtime: null
    };
  }
  if (original.exists && coop.exists && recordsEqual(original.records, coop.records)) {
    return {
      status: 'identical',
      identical: true,
      toCoop: 'green',
      toOriginal: 'green',
      originalMtime: original.newestMtime,
      coopMtime: coop.newestMtime
    };
  }
  var oRank = mtimeRank(original);
  var cRank = mtimeRank(coop);
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
    originalMtime: original.exists ? original.newestMtime : null,
    coopMtime: coop.exists ? coop.newestMtime : null
  };
}

function describeCompare(result) {
  if (!result || result.status === 'unknown') {
    return {
      zh: '暂时无法比较两边的配置文件夹，同步按钮保持灰色。',
      en: 'The two config folders could not be compared yet. The sync buttons stay grey.'
    };
  }
  if (result.status === 'missing') {
    return {
      zh: '两边的配置文件夹都还不存在，同步按钮保持灰色。',
      en: 'Neither config folder exists yet. The sync buttons stay grey.'
    };
  }
  if (result.identical) {
    return {
      zh: '两边配置（包括存档）一致，两个同步按钮为绿色。',
      en: 'The config folders, including saves, match. Both sync buttons are green.'
    };
  }
  if (result.toCoop === 'blue') {
    return {
      zh: '原版配置更新。原版 → 副本为蓝色，副本 → 原版为黄色。',
      en: 'The original config is newer. Original → co-op is blue. Co-op → original is yellow.'
    };
  }
  if (result.toOriginal === 'blue') {
    return {
      zh: '联机副本配置更新。副本 → 原版为蓝色，原版 → 副本为黄色。',
      en: 'The co-op config is newer. Co-op → original is blue. Original → co-op is yellow.'
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
  module.exports.parseFingerprint = parseFingerprint;
  module.exports.compareConfigSides = compareConfigSides;
  module.exports.describeCompare = describeCompare;
}
