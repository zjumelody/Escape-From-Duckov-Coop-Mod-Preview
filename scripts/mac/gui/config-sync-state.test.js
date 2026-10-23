var assert = require('assert');
var child = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var state = require('./config-sync-state.js');

var shanghai = Date.UTC(2026, 9, 23, 5, 18, 52) / 1000;
var stamp = state.formatSyncStamp(shanghai, 480);
assert.strictEqual(stamp.zh, '2026年10月23日 13:18:52');
assert.strictEqual(stamp.en, '2026-10-23 13:18:52');

var march = Date.UTC(2026, 2, 5, 1, 2, 3) / 1000;
var marchStamp = state.formatSyncStamp(march, 480);
assert.strictEqual(marchStamp.zh, '2026年03月05日 09:02:03');
assert.strictEqual(marchStamp.en, '2026-03-05 09:02:03');
assert.strictEqual(state.formatSyncStamp('nope', 480), null);

var lines = state.syncButtonLines('to-coop', shanghai, 480);
assert.deepStrictEqual(lines, [
  '（同步文件）原版配置 → 联机副本',
  '(sync files) original → co-op',
  '最后更新于：2026年10月23日 13:18:52',
  'Last updated: 2026-10-23 13:18:52'
]);
assert.strictEqual(state.syncButtonLines('to-original', null, 480).length, 2);

function side(extra) {
  return {
    exists: true,
    readable: true,
    newestMtime: 100,
    records: ['F\tabc\t644\tSaves/slot.json'],
    skipped: false,
    error: ''
  };
}

var same = state.compareConfigSides(side(), side());
assert.strictEqual(same.identical, true);
assert.strictEqual(same.toCoop, 'green');
assert.strictEqual(same.toOriginal, 'green');

var olderCoop = side();
olderCoop.records = ['F\tabc\t644\tSaves/other.json'];
olderCoop.newestMtime = 50;
var originalNewer = state.compareConfigSides(side(), olderCoop);
assert.strictEqual(originalNewer.identical, false);
assert.strictEqual(originalNewer.toCoop, 'blue');
assert.strictEqual(originalNewer.toOriginal, 'yellow');
assert.strictEqual(state.describeCompare(originalNewer).zh.indexOf('原版配置更新') !== -1, true);

var coopNewerSide = side();
coopNewerSide.records = ['F\tdiff\t644\tSaves/other.json'];
coopNewerSide.newestMtime = 400;
var coopNewer = state.compareConfigSides(side(), coopNewerSide);
assert.strictEqual(coopNewer.toCoop, 'yellow');
assert.strictEqual(coopNewer.toOriginal, 'blue');

var tie = side();
tie.records = ['F\tdiff\t644\tSaves/other.json'];
var tied = state.compareConfigSides(side(), tie);
assert.strictEqual(tied.toCoop, 'yellow');
assert.strictEqual(tied.toOriginal, 'yellow');

var missing = state.compareConfigSides(
  { exists: false, readable: true, newestMtime: null, records: [], skipped: false, error: '' },
  { exists: false, readable: true, newestMtime: null, records: [], skipped: false, error: '' }
);
assert.strictEqual(missing.status, 'missing');
assert.strictEqual(missing.toCoop, 'neutral');

var onlyCoop = state.compareConfigSides(
  { exists: false, readable: true, newestMtime: null, records: [], skipped: false, error: '' },
  side()
);
assert.strictEqual(onlyCoop.toOriginal, 'blue');
assert.strictEqual(onlyCoop.toCoop, 'yellow');

var blocked = state.compareConfigSides(
  { exists: true, readable: false, newestMtime: null, records: [], skipped: false, error: 'permission' },
  side()
);
assert.strictEqual(blocked.status, 'unknown');
assert.strictEqual(blocked.toCoop, 'neutral');

var parsed = state.parseFingerprint([
  'SIDE original',
  'EXISTS 1',
  'READABLE 0',
  'ERROR permission',
  'NEWEST_MTIME -',
  'SIDE coop',
  'EXISTS 1',
  'READABLE 1',
  'NEWEST_MTIME 1710000000',
  'F\tabc\t644\tSaves/slot.json',
  'D\t755\tSaves'
].join('\n'));
assert.strictEqual(parsed.original.readable, false);
assert.strictEqual(parsed.original.error, 'permission');
assert.strictEqual(parsed.coop.newestMtime, 1710000000);
assert.deepStrictEqual(parsed.coop.records, ['F\tabc\t644\tSaves/slot.json', 'D\t755\tSaves']);

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'duckov-fp-'));
var left = path.join(root, 'original');
var right = path.join(root, 'coop');
fs.mkdirSync(path.join(left, 'Saves'), { recursive: true });
fs.mkdirSync(path.join(right, 'Saves'), { recursive: true });
fs.writeFileSync(path.join(left, 'Saves', 'slot.json'), '{"n":1}\n');
fs.writeFileSync(path.join(right, 'Saves', 'slot.json'), '{"n":1}\n');
fs.writeFileSync(path.join(left, '.DS_Store'), 'noise');
fs.writeFileSync(path.join(right, '._slot.json'), 'appledouble');
fs.writeFileSync(path.join(left, 'Saves', '存档.txt'), '甲');
fs.writeFileSync(path.join(right, 'Saves', '存档.txt'), '甲');
fs.symlinkSync('slot.json', path.join(left, 'Saves', 'link.json'));
fs.symlinkSync('slot.json', path.join(right, 'Saves', 'link.json'));

var script = path.join(__dirname, 'config-fingerprint.sh');
var first = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(first.status, 0, first.stderr);
var live = state.parseFingerprint(first.stdout);
var liveCompare = state.compareConfigSides(live.original, live.coop);
assert.strictEqual(liveCompare.identical, true, first.stdout);
assert.strictEqual(liveCompare.toCoop, 'green');
assert.ok(live.original.records.some(function (row) { return row.indexOf('存档.txt') !== -1; }), first.stdout);
assert.ok(first.stdout.indexOf('.DS_Store') === -1, first.stdout);
assert.ok(first.stdout.indexOf('._slot.json') === -1, first.stdout);

fs.writeFileSync(path.join(right, 'Saves', 'slot.json'), '{"n":2}\n');
var touched = child.spawnSync('touch', ['-d', '2020-01-01 00:00:00', path.join(left, 'Saves', 'slot.json')]);
assert.strictEqual(touched.status, 0);
var newer = child.spawnSync('touch', ['-d', '2026-10-23 13:18:52', path.join(right, 'Saves', 'slot.json')]);
assert.strictEqual(newer.status, 0);
var second = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(second.status, 0, second.stderr);
var changed = state.compareConfigSides(
  state.parseFingerprint(second.stdout).original,
  state.parseFingerprint(second.stdout).coop
);
assert.strictEqual(changed.identical, false, second.stdout);
assert.strictEqual(changed.toOriginal, 'blue', second.stdout);
assert.strictEqual(changed.toCoop, 'yellow');
assert.ok(changed.coopMtime > changed.originalMtime);

var absent = child.spawnSync(script, [path.join(root, 'missing-a'), path.join(root, 'missing-b')], { encoding: 'utf8' });
assert.strictEqual(absent.status, 0, absent.stderr);
var absentCompare = state.compareConfigSides(
  state.parseFingerprint(absent.stdout).original,
  state.parseFingerprint(absent.stdout).coop
);
assert.strictEqual(absentCompare.status, 'missing');

fs.rmSync(root, { recursive: true, force: true });
console.log('config-sync-state tests passed');
