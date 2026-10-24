// Pick the newest GitHub Release asset named EscapeFromDuckovCoopMod*.zip.
// The releases array must be newest-first, which is how the GitHub API returns it.
// Drafts are skipped. Prereleases are allowed.

var RELEASE_DOWNLOAD_PREFIX = 'https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases/download/';

function assetNameMatches(name) {
  var lower = String(name || '').toLowerCase();
  var prefix = 'escapefromduckovcoopmod';
  var suffix = '.zip';
  if (lower.length < prefix.length + suffix.length) return false;
  if (lower.substring(0, prefix.length) !== prefix) return false;
  if (lower.substring(lower.length - suffix.length) !== suffix) return false;
  return true;
}

function safeModZipName(name) {
  var text = String(name || '');
  if (!assetNameMatches(text)) return false;
  if (text.indexOf('/') !== -1) return false;
  if (text.indexOf('\\') !== -1) return false;
  if (text.charAt(0) === '.') return false;
  return true;
}

function safeReleaseDownloadUrl(url) {
  var text = String(url || '');
  if (text.indexOf(RELEASE_DOWNLOAD_PREFIX) !== 0) return false;
  if (text.indexOf(' ') !== -1) return false;
  if (text.indexOf('\n') !== -1) return false;
  if (text.indexOf('\r') !== -1) return false;
  return true;
}

function versionFromAssetName(name) {
  var text = String(name || '');
  var match = text.match(/\.v([0-9][^/\\]*?)\.zip$/i);
  if (!match) return '';
  return match[1];
}

function versionFromTag(tag) {
  var text = String(tag || '').replace(/^\s+|\s+$/g, '');
  if (!text) return '';
  if (text.charAt(0) === 'v' || text.charAt(0) === 'V') text = text.substring(1);
  if (!/^[0-9]/.test(text)) return '';
  return text;
}

// Prefer the version written into the asset file name (EscapeFromDuckovCoopMod.V1.4.2_melody.zip).
// Fall back to the release tag. Used to skip a download when that same package is already installed.
function releaseAssetVersionLabel(name, tag) {
  var fromName = versionFromAssetName(name);
  if (fromName) return fromName;
  return versionFromTag(tag);
}

// Same rules as prepare-duckov-coop-app.sh normalize_version_label / version_parts /
// versions_same / version_is_newer. The numeric triple decides "newer". The suffix
// stays part of the label, so 1.4.2, 1.4.2-test, and 1.4.2_melody are not the same package.
function normalizeVersionLabel(text) {
  var value = String(text == null ? '' : text).toLowerCase().replace(/[ \t]/g, '');
  if (value.charAt(0) === 'v') value = value.substring(1);
  if (!value || value === '-' || value === '?' || value === 'unknown') return '';
  return value;
}

function versionPartNumber(text) {
  var digits = String(text || '').replace(/[^0-9]/g, '');
  if (!digits) return 0;
  var n = parseInt(digits, 10);
  if (!isFinite(n)) return 0;
  return n;
}

function versionParts(text) {
  var v = normalizeVersionLabel(text);
  var num = v.split(/[-_+]/)[0];
  var bits = num.split('.');
  return [
    versionPartNumber(bits[0]),
    versionPartNumber(bits[1]),
    versionPartNumber(bits[2])
  ];
}

function versionsSame(a, b) {
  var left = normalizeVersionLabel(a);
  var right = normalizeVersionLabel(b);
  return !!left && left === right;
}

// Same numeric base: _melody > other suffixes (e.g. -test) > bare.
// So 1.4.2_melody is preferred over 1.4.2-test and over upstream 1.4.2.
function versionSuffixRank(text) {
  var v = normalizeVersionLabel(text);
  if (!v) return 0;
  var num = v.split(/[-_+]/)[0];
  var suffix = v.substring(num.length);
  if (!suffix) return 0;
  if (suffix === '_melody' || suffix.indexOf('_melody') === 0) return 2;
  return 1;
}

function versionIsNewer(left, right) {
  var a = versionParts(left);
  var b = versionParts(right);
  var i;
  for (i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return versionSuffixRank(left) > versionSuffixRank(right);
}

// Normalize list entries to { version, channel }. Accepts legacy string[] of versions
// (treated as channel "-"/原版) or objects with version/channel.
function normalizeLocalModEntries(localMods) {
  var out = [];
  var i;
  var item;
  var version;
  var channel;
  if (!localMods || typeof localMods.length !== 'number') return out;
  for (i = 0; i < localMods.length; i++) {
    item = localMods[i];
    if (item == null) continue;
    if (typeof item === 'string' || typeof item === 'number') {
      version = String(item);
      channel = '-';
    } else {
      version = item.version != null ? String(item.version) : '';
      channel = item.channel != null ? String(item.channel) : '-';
    }
    channel = String(channel || '').toLowerCase().replace(/[ \t]/g, '');
    if (channel !== 'melody-fork') channel = '-';
    out.push({ version: version, channel: channel });
  }
  return out;
}

function isMelodyForkChannel(channel) {
  return String(channel || '').toLowerCase().replace(/[ \t]/g, '') === 'melody-fork';
}

// idle: no coop mod (blue).
// upstream: has coop family but NOT melody-fork (原版) → yellow.
// outdated: has melody-fork but version ≠ latest Release → cyan.
// ready: has melody-fork and matches/newer than latest → green.
// remoteKnown false: keep idle unless only upstream is present (still yellow).
function downloadButtonState(localMods, remoteVersion, remoteKnown) {
  var mods = normalizeLocalModEntries(localMods);
  if (!mods.length) return 'idle';
  var i;
  var forkMods = [];
  var hasUpstream = false;
  for (i = 0; i < mods.length; i++) {
    if (isMelodyForkChannel(mods[i].channel)) forkMods.push(mods[i]);
    else hasUpstream = true;
  }
  if (forkMods.length === 0) {
    // 原版 only (or unknown channel) → yellow even before Release check finishes.
    return hasUpstream ? 'upstream' : 'idle';
  }
  if (!remoteKnown) return 'idle';
  var remote = normalizeVersionLabel(remoteVersion);
  if (!remote) return 'idle';
  var allNewer = true;
  for (i = 0; i < forkMods.length; i++) {
    if (versionsSame(forkMods[i].version, remoteVersion)) return 'ready';
    if (!versionIsNewer(forkMods[i].version, remoteVersion)) allNewer = false;
  }
  if (allNewer) return 'ready';
  return 'outdated';
}

function pickInstalledVersionLabel(localMods, preferMelody) {
  var mods = normalizeLocalModEntries(localMods);
  var i;
  var firstUpstream = '';
  for (i = 0; i < mods.length; i++) {
    if (preferMelody && isMelodyForkChannel(mods[i].channel)) {
      return mods[i].version || '-';
    }
    if (!firstUpstream && !isMelodyForkChannel(mods[i].channel)) {
      firstUpstream = mods[i].version || '-';
    }
  }
  if (preferMelody) {
    for (i = 0; i < mods.length; i++) {
      if (isMelodyForkChannel(mods[i].channel)) return mods[i].version || '-';
    }
  }
  return firstUpstream || (mods.length ? (mods[0].version || '-') : '-');
}

function candidateIsMelody(name, tag) {
  var label = normalizeVersionLabel(releaseAssetVersionLabel(name, tag));
  if (label.indexOf('_melody') !== -1) return true;
  var n = String(name || '').toLowerCase();
  var t = String(tag || '').toLowerCase();
  if (n.indexOf('_melody') !== -1) return true;
  if (t.indexOf('_melody') !== -1) return true;
  return false;
}

function selectCoopModAsset(releases) {
  var i;
  var j;
  var rel;
  var assets;
  var asset;
  var name;
  var url;
  var tag;
  var candidates;
  var best;
  var bestMelody;
  var version;
  var bestVersion;
  if (!releases || typeof releases.length !== 'number') return null;
  candidates = [];
  for (i = 0; i < releases.length; i++) {
    rel = releases[i];
    if (!rel || rel.draft) continue;
    assets = rel.assets || [];
    tag = rel.tag_name ? String(rel.tag_name) : '';
    for (j = 0; j < assets.length; j++) {
      asset = assets[j];
      if (!asset) continue;
      name = asset.name ? String(asset.name) : '';
      url = asset.browser_download_url ? String(asset.browser_download_url) : '';
      if (!safeModZipName(name) || !url) continue;
      candidates.push({
        tag: tag,
        name: name,
        url: url,
        prerelease: rel.prerelease ? true : false,
        melody: candidateIsMelody(name, tag),
        version: releaseAssetVersionLabel(name, tag)
      });
    }
  }
  if (!candidates.length) return null;
  best = null;
  bestMelody = null;
  for (i = 0; i < candidates.length; i++) {
    asset = candidates[i];
    if (asset.melody) {
      if (!bestMelody) {
        bestMelody = asset;
      } else {
        version = asset.version;
        bestVersion = bestMelody.version;
        if (versionIsNewer(version, bestVersion)) bestMelody = asset;
      }
    }
    if (!best) {
      best = asset;
    } else {
      version = asset.version;
      bestVersion = best.version;
      if (versionIsNewer(version, bestVersion)) best = asset;
    }
  }
  asset = bestMelody || best;
  return {
    tag: asset.tag,
    name: asset.name,
    url: asset.url,
    prerelease: asset.prerelease
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports.selectCoopModAsset = selectCoopModAsset;
  module.exports.safeModZipName = safeModZipName;
  module.exports.safeReleaseDownloadUrl = safeReleaseDownloadUrl;
  module.exports.assetNameMatches = assetNameMatches;
  module.exports.RELEASE_DOWNLOAD_PREFIX = RELEASE_DOWNLOAD_PREFIX;
  module.exports.releaseAssetVersionLabel = releaseAssetVersionLabel;
  module.exports.versionFromAssetName = versionFromAssetName;
  module.exports.versionFromTag = versionFromTag;
  module.exports.normalizeVersionLabel = normalizeVersionLabel;
  module.exports.versionParts = versionParts;
  module.exports.versionsSame = versionsSame;
  module.exports.versionSuffixRank = versionSuffixRank;
  module.exports.versionIsNewer = versionIsNewer;
  module.exports.downloadButtonState = downloadButtonState;
  module.exports.normalizeLocalModEntries = normalizeLocalModEntries;
  module.exports.isMelodyForkChannel = isMelodyForkChannel;
  module.exports.pickInstalledVersionLabel = pickInstalledVersionLabel;
}
