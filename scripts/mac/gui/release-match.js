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

// Prefer the version written into the asset file name (EscapeFromDuckovCoopMod.V1.4.2-test.zip).
// Fall back to the release tag. Used to skip a download when that same package is already installed.
function releaseAssetVersionLabel(name, tag) {
  var fromName = versionFromAssetName(name);
  if (fromName) return fromName;
  return versionFromTag(tag);
}

// Same rules as prepare-duckov-coop-app.sh normalize_version_label / version_parts /
// versions_same / version_is_newer. The numeric triple decides "newer". The suffix
// stays part of the label, so 1.4.2 and 1.4.2-test are not the same package.
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

function versionIsNewer(left, right) {
  var a = versionParts(left);
  var b = versionParts(right);
  var i;
  for (i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// idle: nothing installed (blue). ready: installed label matches the release, or every
// installed label is numerically newer (green, do not download an older zip).
// outdated: a local mod exists and it is not that release (yellow).
// remoteKnown false keeps idle so the button is not painted green or yellow before the check.
function downloadButtonState(localVersions, remoteVersion, remoteKnown) {
  if (!localVersions || typeof localVersions.length !== 'number' || localVersions.length === 0) return 'idle';
  if (!remoteKnown) return 'idle';
  var remote = normalizeVersionLabel(remoteVersion);
  if (!remote) return 'idle';
  var i;
  var allNewer = true;
  for (i = 0; i < localVersions.length; i++) {
    if (versionsSame(localVersions[i], remoteVersion)) return 'ready';
    if (!versionIsNewer(localVersions[i], remoteVersion)) allNewer = false;
  }
  if (allNewer) return 'ready';
  return 'outdated';
}

function selectCoopModAsset(releases) {
  var i;
  var j;
  var rel;
  var assets;
  var asset;
  var name;
  var url;
  if (!releases || typeof releases.length !== 'number') return null;
  for (i = 0; i < releases.length; i++) {
    rel = releases[i];
    if (!rel || rel.draft) continue;
    assets = rel.assets || [];
    for (j = 0; j < assets.length; j++) {
      asset = assets[j];
      if (!asset) continue;
      name = asset.name ? String(asset.name) : '';
      url = asset.browser_download_url ? String(asset.browser_download_url) : '';
      if (!safeModZipName(name) || !url) continue;
      return {
        tag: rel.tag_name ? String(rel.tag_name) : '',
        name: name,
        url: url,
        prerelease: rel.prerelease ? true : false
      };
    }
  }
  return null;
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
  module.exports.versionIsNewer = versionIsNewer;
  module.exports.downloadButtonState = downloadButtonState;
}
