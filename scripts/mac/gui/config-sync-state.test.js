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
  '最后更新于：2026年10月23日 13:18:52'
]);
assert.strictEqual(lines.length, 3);
assert.strictEqual(state.syncButtonLines('to-original', null, 480).length, 2);
assert.ok(state.syncPermissionHintLine().indexOf('需要授权') !== -1);
assert.ok(state.syncPermissionHintLine().indexOf('完全磁盘访问权限') !== -1);
assert.ok(state.syncPermissionHintLine().indexOf('/bin/bash') !== -1);
assert.ok(state.syncPermissionHintLine().indexOf('非打开 Mods') === -1, 'old garbled sync hint must be gone');

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
assert.strictEqual(same.originalReadable, true);
assert.strictEqual(same.coopReadable, true);

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


var folderNewer = side();
folderNewer.records = ['D\t755\tEmptyNew', 'F\tabc\t644\tSaves/slot.json'];
folderNewer.newestMtime = 100;
folderNewer.newestDirMtime = 500;
var folderOlder = side();
folderOlder.records = ['F\tabc\t644\tSaves/slot.json'];
folderOlder.newestMtime = 100;
folderOlder.newestDirMtime = 100;
var folderCmp = state.compareConfigSides(folderNewer, folderOlder);
assert.strictEqual(folderCmp.identical, false);
assert.strictEqual(folderCmp.originalMtime, 500);
assert.strictEqual(folderCmp.coopMtime, 100);
assert.strictEqual(folderCmp.toCoop, 'blue');
assert.strictEqual(folderCmp.toOriginal, 'yellow');

// Leaf times equal; only nested dir mtime differs (roots excluded from DIR signal).
// 文件时间相同，仅子目录时间不同（根目录不计入 DIR）。
var nestedOnly = side();
nestedOnly.records = ['D\t755\tSaves/EmptyNew', 'F\tabc\t644\tSaves/slot.json'];
nestedOnly.newestMtime = 100;
nestedOnly.newestDirMtime = 200; // EmptyNew only — not a probe-bumped root
var nestedPeer = side();
nestedPeer.records = ['F\tabc\t644\tSaves/slot.json'];
nestedPeer.newestMtime = 100;
nestedPeer.newestDirMtime = 100;
var nestedCmp = state.compareConfigSides(nestedOnly, nestedPeer);
assert.strictEqual(nestedCmp.identical, false);
assert.strictEqual(nestedCmp.originalMtime, 200);
assert.strictEqual(nestedCmp.coopMtime, 100);
assert.ok(nestedCmp.originalMtime !== nestedCmp.coopMtime);

// Same-named empty folder on BOTH sides (fingerprint identical): leaf times equal,
// dir times differ → must still expose unequal originalMtime/coopMtime for the
 // GUI button second line + 较新/较旧. This is Melody's 100% repro (Finder default
// names like 新建文件夹), which EmptyLeft vs EmptyRight alone does not cover.
// 两边同名空文件夹（指纹相同）：文件时间相同、目录时间不同 → 按钮时间必须不等。
var sameNameLeft = side();
sameNameLeft.records = ['D\t755\t新建文件夹', 'F\tabc\t644\tSaves/slot.json'];
sameNameLeft.newestMtime = 100;
sameNameLeft.newestDirMtime = 1200; // left empty folder @ earlier wall time
var sameNameRight = side();
sameNameRight.records = ['D\t755\t新建文件夹', 'F\tabc\t644\tSaves/slot.json'];
sameNameRight.newestMtime = 100;
sameNameRight.newestDirMtime = 1400; // right empty folder @ later wall time
var sameNameCmp = state.compareConfigSides(sameNameLeft, sameNameRight);
assert.strictEqual(sameNameCmp.identical, true, 'same-named empty folders keep fingerprint identical');
assert.strictEqual(sameNameCmp.originalMtime, 1200);
assert.strictEqual(sameNameCmp.coopMtime, 1400);
assert.ok(sameNameCmp.coopMtime > sameNameCmp.originalMtime);
// When leaves already differ, identical path still prefers leaf (no dir fold-in).
var idLeafWins = side();
idLeafWins.newestMtime = 200;
idLeafWins.newestDirMtime = 999;
var idLeafOlder = side();
idLeafOlder.newestMtime = 50;
idLeafOlder.newestDirMtime = 50;
var idLeafCmp = state.compareConfigSides(idLeafWins, idLeafOlder);
assert.strictEqual(idLeafCmp.identical, true);
assert.strictEqual(idLeafCmp.originalMtime, 200);
assert.strictEqual(idLeafCmp.coopMtime, 50);

var missing = state.compareConfigSides(
  { exists: false, readable: true, newestMtime: null, records: [], skipped: false, error: '' },
  { exists: false, readable: true, newestMtime: null, records: [], skipped: false, error: '' }
);
assert.strictEqual(missing.status, 'missing');
assert.strictEqual(missing.toCoop, 'neutral');

var denied = state.compareConfigSides(
  { exists: true, readable: false, newestMtime: null, records: [], skipped: false, error: 'permission' },
  { exists: true, readable: true, newestMtime: 1710000000, records: ['F\tabc\t644\tSaves/slot.json'], skipped: false, error: '' }
);
assert.strictEqual(denied.status, 'unreadable');
assert.strictEqual(denied.toCoop, 'neutral');
assert.strictEqual(denied.coopMtime, 1710000000);
assert.strictEqual(denied.originalMtime, null);
assert.strictEqual(denied.originalReadable, false);
assert.strictEqual(denied.coopReadable, true);
assert.ok(state.describeCompare(denied).zh.indexOf('⚠️') !== -1);

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
assert.strictEqual(blocked.status, 'unreadable');
assert.strictEqual(blocked.toCoop, 'neutral');
assert.strictEqual(blocked.coopMtime, 100);

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
// macOS touch uses -t [[CC]YY]MMDDhhmm[.SS]; GNU -d is not portable here.
// Fingerprint newest-mtime is the max across tracked files+symlinks, so age every
 // tracked path on the older side (and the shared files on the newer side).
// macOS 的 touch 用 -t。指纹取所有跟踪文件/符号链接的最大 mtime，因此旧侧与新侧共用文件都要拨时间。
function touchAt(stamp, filePath, isLink) {
  // -h: change the symlink itself on macOS (otherwise the target is touched).
  // -h：改符号链接自身的时间（否则会改到目标文件）。
  var args = isLink ? ['-h', '-t', stamp, filePath] : ['-t', stamp, filePath];
  var res = child.spawnSync('touch', args);
  assert.strictEqual(res.status, 0, String(res.stderr || res.stdout || '') + ' :: ' + filePath);
}
var oldT = '202001010000.00';
var newT = '202610231318.52';
touchAt(oldT, path.join(left, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(left, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(left, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(right, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(right, 'Saves', 'link.json'), true);
touchAt(newT, path.join(right, 'Saves', 'slot.json'), false);
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


// Empty folder on one side: contents differ; that side's dir mtime must win
// even when every tracked file mtime is identical.
// 一侧新建空文件夹：内容不同；即使文件 mtime 相同，有空文件夹那侧应较新。
fs.mkdirSync(path.join(left, 'Saves', 'EmptyNew'), { recursive: true });
touchAt(oldT, path.join(left, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(left, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(left, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(right, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(right, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(right, 'Saves', 'link.json'), true);
touchAt(newT, path.join(left, 'Saves', 'EmptyNew'), false);
touchAt(oldT, path.join(left, 'Saves'), false);
touchAt(oldT, path.join(right, 'Saves'), false);
touchAt(oldT, left, false);
touchAt(oldT, right, false);
// Re-stamp EmptyNew after touching parents so it stays newest dir.
touchAt(newT, path.join(left, 'Saves', 'EmptyNew'), false);
var emptyFolder = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(emptyFolder.status, 0, emptyFolder.stderr);
var emptyParsed = state.parseFingerprint(emptyFolder.stdout);
assert.ok(emptyParsed.original.newestDirMtime != null, emptyFolder.stdout);
assert.ok(emptyFolder.stdout.indexOf('NEWEST_DIR_MTIME') !== -1, emptyFolder.stdout);
var emptyCmp = state.compareConfigSides(emptyParsed.original, emptyParsed.coop);
assert.strictEqual(emptyCmp.identical, false, emptyFolder.stdout);
assert.ok(emptyCmp.originalMtime > emptyCmp.coopMtime, 'empty folder side should be newer: ' + JSON.stringify(emptyCmp) + '\n' + emptyFolder.stdout);
assert.strictEqual(emptyCmp.toCoop, 'blue', emptyFolder.stdout);
assert.strictEqual(emptyCmp.toOriginal, 'yellow', emptyFolder.stdout);

// Both sides each get a new empty folder at different wall-clock times → unequal
// effective times / 较新 vs 较旧 (not 完全相同 / same stamp).
// 两边各新建空文件夹且时间不同 → 有效时间应不等。
fs.mkdirSync(path.join(left, 'Saves', 'EmptyLeft'), { recursive: true });
fs.mkdirSync(path.join(right, 'Saves', 'EmptyRight'), { recursive: true });
touchAt(oldT, path.join(left, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(left, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(left, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(right, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(right, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(right, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(left, 'Saves'), false);
touchAt(oldT, path.join(right, 'Saves'), false);
touchAt(oldT, left, false);
touchAt(oldT, right, false);
var leftEmptyT = '202610231200.00';
var rightEmptyT = '202610231400.00';
touchAt(leftEmptyT, path.join(left, 'Saves', 'EmptyLeft'), false);
touchAt(rightEmptyT, path.join(right, 'Saves', 'EmptyRight'), false);
var bothEmpty = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(bothEmpty.status, 0, bothEmpty.stderr);
var bothParsed = state.parseFingerprint(bothEmpty.stdout);
var bothCmp = state.compareConfigSides(bothParsed.original, bothParsed.coop);
assert.strictEqual(bothCmp.identical, false, bothEmpty.stdout);
assert.ok(bothCmp.coopMtime > bothCmp.originalMtime, 'right empty folder newer: ' + JSON.stringify(bothCmp) + '\n' + bothEmpty.stdout);
assert.strictEqual(bothCmp.toOriginal, 'blue', bothEmpty.stdout);
assert.strictEqual(bothCmp.toCoop, 'yellow', bothEmpty.stdout);

// Melody 100% repro path: SAME empty-folder name on each config ROOT at different
// times (content fingerprint identical). GUI paints syncVisual.originalMtime /
// coopMtime from compareConfigSides — must be unequal + match dir create times.
// 真复现：两边根目录同名空文件夹、创建时间不同；按钮时间必须跟目录时间走。
fs.rmSync(path.join(left, 'Saves', 'EmptyNew'), { recursive: true, force: true });
fs.rmSync(path.join(left, 'Saves', 'EmptyLeft'), { recursive: true, force: true });
fs.rmSync(path.join(right, 'Saves', 'EmptyRight'), { recursive: true, force: true });
// Re-sync file bytes: earlier cases left divergent slot.json hashes.
fs.writeFileSync(path.join(left, 'Saves', 'slot.json'), '{"slot":1}\n');
fs.writeFileSync(path.join(right, 'Saves', 'slot.json'), '{"slot":1}\n');
fs.writeFileSync(path.join(left, 'Saves', '存档.txt'), 'save\n');
fs.writeFileSync(path.join(right, 'Saves', '存档.txt'), 'save\n');
try { fs.unlinkSync(path.join(left, 'Saves', 'link.json')); } catch (e) {}
try { fs.unlinkSync(path.join(right, 'Saves', 'link.json')); } catch (e) {}
fs.symlinkSync('slot.json', path.join(left, 'Saves', 'link.json'));
fs.symlinkSync('slot.json', path.join(right, 'Saves', 'link.json'));
fs.mkdirSync(path.join(left, '新建文件夹'));
fs.mkdirSync(path.join(right, '新建文件夹'));
touchAt(oldT, path.join(left, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(left, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(left, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(right, 'Saves', 'slot.json'), false);
touchAt(oldT, path.join(right, 'Saves', '存档.txt'), false);
touchAt(oldT, path.join(right, 'Saves', 'link.json'), true);
touchAt(oldT, path.join(left, 'Saves'), false);
touchAt(oldT, path.join(right, 'Saves'), false);
touchAt(oldT, left, false);
touchAt(oldT, right, false);
touchAt(leftEmptyT, path.join(left, '新建文件夹'), false);
touchAt(rightEmptyT, path.join(right, '新建文件夹'), false);
var sameNameEmpty = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(sameNameEmpty.status, 0, sameNameEmpty.stderr);
var sameNameParsed = state.parseFingerprint(sameNameEmpty.stdout);
var sameNameLive = state.compareConfigSides(sameNameParsed.original, sameNameParsed.coop);
assert.strictEqual(sameNameLive.identical, true, sameNameEmpty.stdout);
assert.ok(sameNameParsed.original.newestDirMtime != null, sameNameEmpty.stdout);
assert.ok(sameNameParsed.coop.newestDirMtime != null, sameNameEmpty.stdout);
assert.ok(sameNameLive.coopMtime > sameNameLive.originalMtime,
  'same-name empty folders must show unequal button times: ' + JSON.stringify(sameNameLive) + '\n' + sameNameEmpty.stdout);
assert.strictEqual(sameNameLive.originalMtime, sameNameParsed.original.newestDirMtime);
assert.strictEqual(sameNameLive.coopMtime, sameNameParsed.coop.newestDirMtime);
// GUI second-line age tags use these exact fields (syncSideEpoch / syncSourceAgeTag).
assert.notStrictEqual(sameNameLive.originalMtime, sameNameLive.coopMtime);

// Sibling write-probe simulation: mkdir+rm next to config root must NOT change
// config root or child mtimes (the FDA gate lives on the parent/AS area).
// 同级写入探测：在配置根旁建删，不得改配置根或子项 mtime。
function mtimeSec(p) {
  return Math.floor(fs.statSync(p).mtimeMs / 1000);
}
function simulateSiblingWriteProbe(configRoot) {
  var parent = path.dirname(configRoot);
  var probe = path.join(parent, path.basename(configRoot) + '.write-probe-test');
  fs.mkdirSync(probe);
  fs.writeFileSync(path.join(probe, 'probe.txt'), 'ok\n');
  fs.rmSync(probe, { recursive: true, force: true });
}
var stampTargets = [
  left,
  right,
  path.join(left, 'Saves'),
  path.join(right, 'Saves'),
  path.join(left, '新建文件夹'),
  path.join(right, '新建文件夹'),
  path.join(left, 'Saves', 'slot.json'),
  path.join(right, 'Saves', 'slot.json')
];
var before = {};
stampTargets.forEach(function (p) { before[p] = mtimeSec(p); });
simulateSiblingWriteProbe(left);
simulateSiblingWriteProbe(right);
stampTargets.forEach(function (p) {
  assert.strictEqual(mtimeSec(p), before[p], 'sibling probe must not bump ' + p);
});
// Contrast: old in-tree probe bumps the config root mtime (why probe moved out).
// 对比：旧版树内探测会改配置根 mtime（故改到同级）。
touchAt(oldT, left, false);
var rootBeforeInTree = mtimeSec(left);
var inTree = path.join(left, '.DuckovCoopPrepare-perm-probe-legacy');
fs.mkdirSync(inTree);
fs.writeFileSync(path.join(inTree, 'probe.txt'), 'ok\n');
fs.rmSync(inTree, { recursive: true, force: true });
assert.ok(mtimeSec(left) > rootBeforeInTree, 'in-tree probe should bump config root mtime');
// Restore root stamp; same-name empty-folder times must still drive compare.
touchAt(oldT, left, false);
touchAt(leftEmptyT, path.join(left, '新建文件夹'), false);
touchAt(rightEmptyT, path.join(right, '新建文件夹'), false);
// Re-run fingerprint after sibling probes: same-name unequal times still hold.
var afterProbe = child.spawnSync(script, [left, right], { encoding: 'utf8' });
assert.strictEqual(afterProbe.status, 0, afterProbe.stderr);
var afterCmp = state.compareConfigSides(
  state.parseFingerprint(afterProbe.stdout).original,
  state.parseFingerprint(afterProbe.stdout).coop
);
assert.strictEqual(afterCmp.identical, true, afterProbe.stdout);
assert.ok(afterCmp.coopMtime > afterCmp.originalMtime, 'after sibling probe still unequal: ' + JSON.stringify(afterCmp));
assert.strictEqual(afterCmp.originalMtime, sameNameLive.originalMtime, 'original effective mtime unchanged by sibling probe');
assert.strictEqual(afterCmp.coopMtime, sameNameLive.coopMtime, 'coop effective mtime unchanged by sibling probe');

var absent = child.spawnSync(script, [path.join(root, 'missing-a'), path.join(root, 'missing-b')], { encoding: 'utf8' });
assert.strictEqual(absent.status, 0, absent.stderr);
var absentCompare = state.compareConfigSides(
  state.parseFingerprint(absent.stdout).original,
  state.parseFingerprint(absent.stdout).coop
);
assert.strictEqual(absentCompare.status, 'missing');

fs.rmSync(root, { recursive: true, force: true });
console.log('config-sync-state tests passed');

// Identical content with unequal mtimes: describe mentions green/blue by time.
var sameContentUnequalTime = side();
var coopOlderSame = side();
coopOlderSame.newestMtime = 50;
var idUnequal = state.compareConfigSides(sameContentUnequalTime, coopOlderSame);
assert.strictEqual(idUnequal.identical, true);
assert.strictEqual(idUnequal.originalMtime, 100);
assert.strictEqual(idUnequal.coopMtime, 50);
var idDesc = state.describeCompare(idUnequal);
assert.ok(idDesc.zh.indexOf('绿色') !== -1 && idDesc.zh.indexOf('蓝色') !== -1, idDesc.zh);
assert.ok(idDesc.en.indexOf('green') !== -1 && idDesc.en.indexOf('blue') !== -1, idDesc.en);
