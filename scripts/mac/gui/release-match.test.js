var assert = require('assert');
var matcher = require('./release-match.js');

function asset(name, url) {
  return {
    name: name,
    browser_download_url: url || (matcher.RELEASE_DOWNLOAD_PREFIX + 'v/' + name)
  };
}

var picked = matcher.selectCoopModAsset([
  {
    draft: true,
    tag_name: 'draft',
    assets: [asset('EscapeFromDuckovCoopMod.draft.zip')]
  },
  {
    draft: false,
    prerelease: false,
    tag_name: 'no-zip',
    assets: [{ name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' }]
  },
  {
    draft: false,
    prerelease: true,
    tag_name: 'v1.4.2-test',
    assets: [asset('EscapeFromDuckovCoopMod.V1.4.2-test.zip')]
  },
  {
    draft: false,
    prerelease: false,
    tag_name: 'v1.4.1',
    assets: [asset('EscapeFromDuckovCoopMod.V1.4.1.zip')]
  }
]);

assert.strictEqual(picked.tag, 'v1.4.2-test');
assert.strictEqual(picked.name, 'EscapeFromDuckovCoopMod.V1.4.2-test.zip');
assert.strictEqual(picked.prerelease, true);
assert.strictEqual(
  picked.url,
  matcher.RELEASE_DOWNLOAD_PREFIX + 'v/EscapeFromDuckovCoopMod.V1.4.2-test.zip'
);

assert.strictEqual(matcher.selectCoopModAsset([]), null);
assert.strictEqual(matcher.selectCoopModAsset(null), null);
assert.strictEqual(matcher.selectCoopModAsset({}), null);
assert.strictEqual(
  matcher.selectCoopModAsset([
    { draft: false, assets: [asset('MyEscapeFromDuckovCoopMod.zip')] }
  ]),
  null
);
assert.strictEqual(
  matcher.selectCoopModAsset([
    { draft: false, assets: [asset('EscapeFromDuckovCoopMod.txt')] }
  ]),
  null
);
assert.strictEqual(
  matcher.selectCoopModAsset([
    { draft: false, assets: [asset('EscapeFromDuckovCoopMod.evil.zip', 'http://example.com/x.zip')] }
  ]).url,
  'http://example.com/x.zip'
);

var lower = matcher.selectCoopModAsset([
  {
    draft: false,
    tag_name: 'v',
    prerelease: false,
    assets: [asset('escapefromduckovcoopmod.zip')]
  }
]);
assert.strictEqual(lower.name, 'escapefromduckovcoopmod.zip');
assert.strictEqual(lower.prerelease, false);

assert.strictEqual(matcher.safeModZipName('EscapeFromDuckovCoopMod.V1.4.2-test.zip'), true);
assert.strictEqual(matcher.safeModZipName('../EscapeFromDuckovCoopMod.zip'), false);
assert.strictEqual(matcher.safeModZipName('EscapeFromDuckovCoopMod/evil.zip'), false);
assert.strictEqual(
  matcher.safeReleaseDownloadUrl(matcher.RELEASE_DOWNLOAD_PREFIX + 'v1.4.2-test/EscapeFromDuckovCoopMod.V1.4.2-test.zip'),
  true
);
assert.strictEqual(matcher.safeReleaseDownloadUrl('https://example.com/EscapeFromDuckovCoopMod.zip'), false);
assert.strictEqual(
  matcher.safeReleaseDownloadUrl(matcher.RELEASE_DOWNLOAD_PREFIX + 'v/bad name.zip'),
  false
);

console.log('release-match tests passed');
