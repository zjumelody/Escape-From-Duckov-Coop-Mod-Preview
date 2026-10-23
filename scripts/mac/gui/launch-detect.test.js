// Regression: opening DuckovCoopPrepare must not wait on NSTask while the
// window is still being built. When the co-op copy already exists, init used
// to call listCoopMods → runSync before makeKeyAndOrderFront. NSTask launch
// then called getcwd() from currentTaskDictionary (no working directory was
// set) on the main thread before the run loop existed, and the window stayed
// 0×0. Detection of an on-disk copy is a file check only; --list-coop-mods
// runs later, without waitUntilExit.
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

function sliceFunction(name) {
  var marker = '\nfunction ' + name + '(';
  var start = src.indexOf(marker);
  if (start < 0) throw new Error('missing function ' + name);
  start += 1;
  var next = src.indexOf('\nfunction ', start);
  return next < 0 ? src.slice(start) : src.slice(start, next);
}

function assertNoSyncScan(body, label) {
  assert.ok(body.indexOf('listCoopMods') === -1, label + ' calls listCoopMods');
  assert.ok(body.indexOf('runSync') === -1, label + ' calls runSync');
  assert.ok(body.indexOf('waitUntilExit') === -1, label + ' waits on NSTask');
  assert.ok(body.indexOf('NSTask') === -1, label + ' constructs NSTask');
}

var detect = sliceFunction('detectExistingProgress');
assertNoSyncScan(detect, 'detectExistingProgress');
assert.ok(detect.indexOf('copyLooksPrepared') !== -1);

var build = sliceFunction('buildInterface');
var front = build.indexOf('makeKeyAndOrderFront');
var schedule = build.lastIndexOf('scheduleDestModScan');
assert.ok(front > 0, 'window is ordered front');
assert.ok(schedule > front, 'mod scan is queued after the window is ordered front');
assertNoSyncScan(build, 'buildInterface');

var syncSteps = sliceFunction('syncStepsToDest');
assertNoSyncScan(syncSteps, 'syncStepsToDest');
assert.ok(syncSteps.indexOf('scheduleDestModScan') !== -1);

var startScan = sliceFunction('startDestModScan');
assert.ok(startScan.indexOf('runSync') === -1);
assert.ok(startScan.indexOf('waitUntilExit') === -1);
assert.ok(startScan.indexOf('attachTaskEnvironment') !== -1);
assert.ok(startScan.indexOf('scanTask.launch') !== -1);
assert.ok(startScan.indexOf('MOD_SCAN_LIMIT_MS') !== -1);

var poll = sliceFunction('onScanPoll');
assert.ok(poll.indexOf('runSync') === -1);
assert.ok(poll.indexOf('waitUntilExit') === -1);
assert.ok(poll.indexOf('terminate') !== -1);

var runSync = sliceFunction('runSync');
var pin = runSync.indexOf('attachTaskEnvironment');
var launch = runSync.indexOf('task.launch');
var wait = runSync.indexOf('waitUntilExit');
assert.ok(pin > 0 && launch > pin && wait > launch, 'runSync pins the directory before launch');

var attach = sliceFunction('attachTaskEnvironment');
var pwd = attach.indexOf("env.setObjectForKey($(dir), $('PWD'))");
var cwd = attach.indexOf('setCurrentDirectoryPath');
var envSet = attach.indexOf('task.setEnvironment');
assert.ok(pwd > 0 && cwd > pwd && envSet > cwd, 'PWD comes from the pinned directory, and that directory is set before the environment');
assert.ok(attach.indexOf('getcwd') === -1);

assert.ok(sliceFunction('imagePositionOnly').indexOf('NSImageOnly') !== -1);
assert.ok(src.indexOf('makeCenteredTitleImage') !== -1);
assert.ok(src.indexOf('makeStackedTitleImage') !== -1);

var parseCoopModLines = new Function(
  sliceFunction('parseCoopModLines') + '\nreturn parseCoopModLines;'
)();

assert.deepStrictEqual(parseCoopModLines(''), []);
assert.deepStrictEqual(parseCoopModLines('noise\n'), []);
assert.deepStrictEqual(
  parseCoopModLines(
    'COOP_MOD\t1.4.2-test\t/tmp/Mods/EscapeFromDuckovCoopMod\n' +
    'not a mod\n' +
    'COOP_MOD\t-\t/tmp/Mods/name\twith tab\n'
  ),
  [
    { version: '1.4.2-test', path: '/tmp/Mods/EscapeFromDuckovCoopMod' },
    { version: '-', path: '/tmp/Mods/name\twith tab' }
  ]
);

console.log('launch-detect.test.js ok');
