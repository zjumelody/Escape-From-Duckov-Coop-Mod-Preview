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
}
