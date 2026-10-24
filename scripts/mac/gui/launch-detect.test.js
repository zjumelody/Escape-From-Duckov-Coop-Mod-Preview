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
var prepCheck = build.lastIndexOf('queuePrepareCheck');
assert.ok(prepCheck > front, 'prepare entitlements check is queued after the window is ordered front');
assertNoSyncScan(build, 'buildInterface');

var startPrep = sliceFunction('startPrepareCheck');
assert.ok(startPrep.indexOf('runSync') === -1);
assert.ok(startPrep.indexOf('waitUntilExit') === -1);
assert.ok(startPrep.indexOf('attachTaskEnvironment') !== -1);
assert.ok(startPrep.indexOf('check-coop-copy.sh') !== -1);

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

assert.ok(src.indexOf('function step2TitleText') !== -1 || src.indexOf('Step 2: Sync config files (including saves)') !== -1, 'Step2 title i18n missing');
assert.ok(src.indexOf('function L(') !== -1 && src.indexOf('loadUiLang') !== -1, 'UI language helpers missing');
assert.ok(src.indexOf('toggleLanguage:') !== -1 && src.indexOf('langToggleTitle') !== -1, 'language toggle missing');
assert.ok(src.indexOf("uiLang = 'zh'") !== -1 || src.indexOf('loadUiLang') !== -1, 'default ZH path missing');
var ratioMatch = src.match(/var BIG_BUTTON_WIDTH_RATIO = ([0-9.]+);/);
assert.ok(ratioMatch, 'prepare width ratio is named');
var ratio = Number(ratioMatch[1]);
assert.ok(ratio >= 0.60 && ratio <= 0.75, 'prepare width stays in the requested band');
assert.ok(build.indexOf('contentW * BIG_BUTTON_WIDTH_RATIO') !== -1);
var bigButtonUses = build.split('prepareW, prepareH').length - 1;
assert.ok(bigButtonUses >= 2, 'download button uses the prepare button size');
assert.ok(src.indexOf('var CONFIG_OPEN_BUTTON_HEIGHT = 40;') !== -1);
assert.ok(src.indexOf('Math.max(prepareH, 58)') !== -1, 'sync buttons keep stamp height near prepare height');
assert.ok(src.indexOf('var SYNC_BUTTON_HEIGHT = 84;') === -1, 'PR #12 sync height bump stays reverted');
assert.ok(src.indexOf('check-coop-copy.sh') !== -1, 'prepare readiness uses check-coop-copy.sh');
assert.ok(src.indexOf('paintStep2Title') !== -1);
assert.ok(src.indexOf('paintStep3Title') !== -1, 'Step3 title painter missing');
assert.ok(src.indexOf('paintOpenModsButtons') !== -1, 'Step3 open-Mods painter missing');
assert.ok(src.indexOf('openOriginalMods:') !== -1 && src.indexOf('openCoopMods:') !== -1, 'Step3 open-Mods selectors missing');
assert.ok(src.indexOf('openOriginalModsTitle') !== -1 && src.indexOf('openCoopModsTitle') !== -1, 'Step3 open-Mods i18n missing');
assert.ok(src.indexOf('appContentsModsDir') !== -1, 'Contents/Mods path helper missing');
assert.ok(src.indexOf("configOpenH + configBtnGapY + downloadH") !== -1, 'window height must reserve Step3 open-Mods row');
assert.ok(sliceFunction('onOpenOriginalMods').indexOf('openWithWorkspace') !== -1, 'original Mods open should use Finder workspace open');
assert.ok(sliceFunction('onOpenCoopMods').indexOf('openWithWorkspace') !== -1, 'coop Mods open should use Finder workspace open');
assert.ok(sliceFunction('onOpenOriginalMods').indexOf('fullDiskAccessText') === -1, 'original Mods open must not nag FDA when Finder can open');
assert.ok(src.indexOf('configFolderAccessHelpText') !== -1, 'config folder help missing');
assert.ok(src.indexOf('读取原版配置需要访问 ~/Library/Containers 里 Duckov 的沙盒容器') === -1, 'old Containers/sandbox config hint must be gone');
assert.ok(src.indexOf('sandbox container under ~/Library/Containers') === -1, 'old EN sandbox-container config hint must be gone');
assert.ok(src.indexOf('Contents/Mods') !== -1, 'Contents/Mods references missing');
assert.ok(src.indexOf('Never use for Mods') !== -1 || src.indexOf('Mods / Contents/Mods 打开失败不要走这里') !== -1, 'config access dialog must stay Mods-separated');
assert.ok(sliceFunction('onOpenOriginalMods').indexOf('offerContainerAccessHelp(') === -1, 'Mods open must not offer config access dialog');
assert.ok(sliceFunction('onOpenCoopMods').indexOf('offerContainerAccessHelp(') === -1, 'coop Mods open must not offer config access dialog');
assert.ok(sliceFunction('onOpenCoopMods').indexOf('configFolderAccessHelpText(') === -1 && sliceFunction('onOpenCoopMods').indexOf('fullDiskAccessText(') === -1, 'coop Mods open must not use config help text');
assert.ok(src.indexOf('[sync-paint] domain=config') !== -1, 'sync-paint must mark config domain');
assert.ok(src.indexOf('[config-perm]') !== -1, 'config-perm probe log missing');
assert.ok(sliceFunction('onOpenOriginalConfig').indexOf('fullDiskAccessText(') === -1, 'config Finder open must not attach bash FDA help');
assert.ok(sliceFunction('onOpenOriginalConfig').indexOf('configFolderAccessHelpText(') === -1, 'config Finder open must not attach configFolderAccessHelpText');
assert.ok(src.indexOf('bash 没有磁盘访问权限，还不能读取配置文件，无法完成第二步检测。') !== -1, 'FDA dialog ZH lead missing');
assert.ok(src.indexOf('How to grant disk access to bash:') !== -1, 'FDA dialog EN how-to missing');
assert.ok(src.indexOf('CONFIG-folder access dialog only') !== -1 || src.indexOf('只用于配置文件夹授权') !== -1, 'config vs Mods dialog scope comment missing');
assert.ok(sliceFunction('onOpenOriginalMods').indexOf('fullDiskAccessText(') === -1);
assert.ok(sliceFunction('onOpenCoopMods').indexOf('fullDiskAccessText(') === -1);



assert.ok(src.indexOf('[step3-title-paint]') !== -1, 'Step3 title paint log missing');
assert.ok(src.indexOf("stepDone[3] = !!(found && found.length > 0)") === -1, 'Step3 done must not follow mere mod presence');
var completeRelease = sliceFunction('completeReleaseCheck');
assert.ok(completeRelease.indexOf('paintDownloadButton') !== -1, 'completeReleaseCheck must paint download button');
assert.ok(
  completeRelease.indexOf('refreshGuide') !== -1 || completeRelease.indexOf('paintStepHeaders') !== -1,
  'completeReleaseCheck must refresh Step3 title after Release compare'
);
assert.ok(src.indexOf('| false     | ready    |') !== -1 || src.indexOf('false     | ready') !== -1, 'Step3 title decision table missing');


var front = build.indexOf('makeKeyAndOrderFront');
assert.ok(build.indexOf('clearInitialFocus') > front);
assert.ok(build.lastIndexOf('scheduleReleaseCheck') > front);
assert.ok(build.lastIndexOf('scheduleConfigCompare') > front);
assert.ok(build.indexOf('startReleaseCheck') === -1);
assert.ok(build.indexOf('startConfigCompare') === -1);

var clearFocus = sliceFunction('clearInitialFocus');
assert.ok(clearFocus.indexOf('makeFirstResponder') !== -1);
assertNoSyncScan(clearFocus, 'clearInitialFocus');
assert.ok(sliceFunction('styleChromeButton').indexOf('setFocusRingType') !== -1);

function assertAsyncLaunch(name) {
  var body = sliceFunction(name);
  assert.ok(body.indexOf('runSync') === -1, name + ' calls runSync');
  assert.ok(body.indexOf('waitUntilExit') === -1, name + ' waits on NSTask');
  assert.ok(body.indexOf('attachTaskEnvironment') !== -1, name + ' does not pin cwd');
}
assertAsyncLaunch('startReleaseCheck');
// Config compare is in-process (no bash NSTask) so it must not wait on NSTask / runSync.
var startConfigCompareBody = sliceFunction('startConfigCompare');
assert.ok(startConfigCompareBody.indexOf('runSync') === -1, 'startConfigCompare calls runSync');
assert.ok(startConfigCompareBody.indexOf('waitUntilExit') === -1, 'startConfigCompare waits on NSTask');
assert.ok(startConfigCompareBody.indexOf("'/bin/bash'") === -1 && startConfigCompareBody.indexOf('config-fingerprint.sh') === -1, 'startConfigCompare still launches bash fingerprint');
assert.ok(startConfigCompareBody.indexOf('configCompareInProcess') !== -1, 'startConfigCompare schedules in-process compare');
assertAsyncLaunch('startPrepareCheck');
assert.ok(sliceFunction('onReleasePoll').indexOf('terminate') !== -1);
assert.ok(sliceFunction('onPrepareCheckPoll').indexOf('terminate') !== -1);
assert.ok(src.indexOf('onConfigCompareInProcess') !== -1, 'in-process fingerprint handler missing');
assert.ok(src.indexOf('mirrorConfigTreeInProcess') !== -1, 'in-process sync mirror missing');
assert.ok(src.indexOf('function applySourceModificationDate') !== -1, 'mirror must apply source dir mtimes');
(function () {
  var body = sliceFunction('mirrorConfigTreeInProcess');
  assert.ok(body.indexOf('applySourceModificationDate') !== -1, 'mirror must call applySourceModificationDate for dirs');
  assert.ok(body.indexOf('ensureDir(to)') !== -1, 'mirror still creates dirs');
  // Must not early-return solely because content fingerprint matched (mtime-only sync).
  // 不能因为内容指纹相同就跳过同步（否则只改空文件夹时间时不会更新）。
  assert.ok(body.indexOf('identical') === -1 || body.indexOf('applySourceModificationDate') !== -1, 'mtime apply required even when content identical');
})();
assert.ok(src.indexOf('setAttributesOfItemAtPathError') !== -1, 'dir mtime apply uses setAttributes');
assert.ok(src.indexOf('NSFileModificationDate') !== -1, 'dir mtime apply uses NSFileModificationDate');

assert.ok(src.indexOf('⏳ ') !== -1, 'detecting title prefix missing');
assert.ok(src.indexOf("'✅ ' +") !== -1 || src.indexOf('"✅ " +') !== -1 || src.indexOf("✅ ' +") !== -1 || src.indexOf('✅ ') !== -1, 'leftmost done marker missing');
assert.ok(src.indexOf('/bin/bash') !== -1 && src.indexOf('⌘⇧G') !== -1, 'bash FDA help with Go-to-Folder missing');
assert.ok(src.indexOf("'orange'") !== -1 || src.indexOf('orange') !== -1, 'no-permission orange palette missing');
assert.ok(sliceFunction('syncPresentation').indexOf("'orange'") !== -1, 'syncPresentation lacks orange');


var parseCoopModLines = new Function(
  sliceFunction('parseCoopModLines') + '\nreturn parseCoopModLines;'
)();

assert.deepStrictEqual(parseCoopModLines(''), []);
assert.deepStrictEqual(parseCoopModLines('noise\n'), []);
assert.deepStrictEqual(
  parseCoopModLines(
    'COOP_MOD\t1.4.2_melody\tmelody-fork\t/tmp/Mods/3591341282_EscapeFromDuckovCoopMod_1.4.2_melody\n' +
    'not a mod\n' +
    'COOP_MOD\t1.4.0\t-\t/tmp/Mods/3591341282\n' +
    'COOP_MOD\t-\t/tmp/Mods/name\twith tab\n'
  ),
  [
    { version: '1.4.2_melody', channel: 'melody-fork', path: '/tmp/Mods/3591341282_EscapeFromDuckovCoopMod_1.4.2_melody' },
    { version: '1.4.0', channel: '-', path: '/tmp/Mods/3591341282' },
    { version: '-', channel: '-', path: '/tmp/Mods/name\twith tab' }
  ]
);



assert.ok(src.indexOf('当前没有联机 Mod') !== -1, 'Step3 idle ZH line1 missing');
assert.ok(src.indexOf('点此自动下载最新版本的支持 Mac 的联机 Mod 到副本 Mods 位置') !== -1, 'Step3 download ZH line2 missing');
assert.ok(src.indexOf('当前是原版联机 Mod（版本号：') !== -1, 'Step3 upstream ZH line1 missing');
assert.ok(src.indexOf('当前已经存在支持 Mac 的联机 Mod（版本号：') !== -1, 'Step3 outdated ZH line1 missing');
assert.ok(src.indexOf('当前已经是最新的支持 Mac 的联机 Mod（版本号：') !== -1, 'Step3 ready ZH line1 missing');
assert.ok(src.indexOf("visual === 'upstream'") !== -1 || src.indexOf('visual === "upstream"') !== -1, 'upstream visual missing');
assert.ok(src.indexOf("return 'cyan'") !== -1 || src.indexOf('outdated') !== -1 && src.indexOf("downloadPaletteState") !== -1, 'cyan palette for outdated missing');
assert.ok(src.indexOf('cleanupPendingDownloadTemps') !== -1, 'temp cleanup helper missing');
assert.ok(src.indexOf('pendingDownloadZip') !== -1 && src.indexOf('pendingDownloadUnzip') !== -1, 'pending download paths missing');
assert.ok(src.indexOf('未重新签名') !== -1 || src.indexOf('not re-signed') !== -1, 'no-resign install message missing');
assert.ok(src.indexOf('并已用本机 codesign 身份') === -1, 'install success must not claim mod re-sign');

assert.ok(src.indexOf('已经满足Mac联机条件，请打开副本游戏 App 进行游戏') !== -1, 'all-green status text missing');
assert.ok(src.indexOf('打开系统权限页面') !== -1, 'permission dialog open-settings label missing');
assert.ok(src.indexOf('重试检测') !== -1, 'permission dialog retry label missing');
assert.ok(sliceFunction('scheduleConfigCompare').indexOf('syncVisual = null') !== -1, 'scheduleConfigCompare must clear syncVisual for detecting');
assert.ok(sliceFunction('applyConfigCompare').indexOf('maybeOfferConfigPermissionHelp') !== -1, 'apply must offer permission help');


assert.ok(src.indexOf('function nsFileTypeString') !== -1, 'nsFileTypeString missing');
assert.ok(src.indexOf("typ === 'NSFileTypeDirectory'") !== -1, 'directory literal compare missing');
assert.ok(src.indexOf('function permissionHelpButtonTitles') !== -1, 'permissionHelpButtonTitles missing');
assert.ok(sliceFunction('permissionHelpButtonTitles').indexOf('打开系统权限页面') !== -1);
assert.ok(sliceFunction('permissionHelpButtonTitles').indexOf('重试检测') !== -1);
assert.ok(sliceFunction('offerContainerAccessHelp').indexOf('permissionHelpButtonTitles()') !== -1);
assert.ok(src.indexOf('runBashConfigFingerprint') !== -1, 'bash fingerprint fallback missing');


assert.ok(src.indexOf('function syncButtonAccessOk') !== -1, 'syncButtonAccessOk missing');
assert.ok(src.indexOf('function formatStampLocalZh') !== -1, 'formatStampLocalZh missing');
assert.ok(sliceFunction('syncPresentation').indexOf('syncButtonAccessOk') !== -1);
assert.ok(sliceFunction('syncButtonAccessOk').indexOf('originalReadable') !== -1);
assert.ok(sliceFunction('formatStampLocalZh').indexOf('localTimeZone') !== -1);


assert.ok(src.indexOf('function probeConfigFolderAccess') !== -1, 'write probe missing');
assert.ok(src.indexOf('function configWriteProbePath') !== -1, 'sibling probe path helper missing');
assert.ok(src.indexOf('.write-probe-') !== -1, 'sibling write-probe name missing');
assert.ok(src.indexOf('function enforceWriteProbesOnFingerprint') !== -1, 'enforce write probes missing');
assert.ok(sliceFunction('probeConfigFolderAccess').indexOf('removeItemAtPathError') !== -1, 'probe must clean up');
assert.ok(sliceFunction('probeConfigFolderAccess').indexOf('configWriteProbePath') !== -1, 'probe must use sibling path helper');
assert.ok(sliceFunction('probeConfigFolderAccess').indexOf('parentDir(dir)') !== -1, 'probe must target parent of config root');
assert.ok(sliceFunction('configWriteProbePath').indexOf("base + '.write-probe-'") !== -1, 'probe name must be basename.write-probe-TOKEN');
// Must NOT mkdir the probe inside the config root (joinPath(dir, …)).
assert.ok(sliceFunction('probeConfigFolderAccess').indexOf('joinPath(dir,') === -1, 'probe must not join under config root');
assert.ok(sliceFunction('emitFingerprintSideLines').indexOf('probeConfigFolderAccess') !== -1);
assert.ok(sliceFunction('onConfigCompareInProcess').indexOf('enforceWriteProbesOnFingerprint') !== -1);


assert.ok(src.indexOf('function voidConfigCompare') !== -1, 'voidConfigCompare must be defined');
assert.ok(src.indexOf('queueConfigCompare') === -1, 'queueConfigCompare typo must be gone');
assert.ok(sliceFunction('offerContainerAccessHelp').indexOf('voidConfigCompare()') !== -1, 'retry must call voidConfigCompare');
assert.ok(sliceFunction('voidConfigCompare').indexOf('scheduleConfigCompare()') !== -1, 'void must reschedule fingerprint');
assert.ok(sliceFunction('voidConfigCompare').indexOf('syncVisual = null') !== -1, 'void must clear syncVisual for detecting');


assert.ok(sliceFunction('paintSyncButtons').indexOf('syncConfigNeedsPermission') !== -1, 'paint must use single no-perm button path');
assert.ok(src.indexOf('function syncNoPermTitle') !== -1, 'no-perm sync title missing');
assert.ok(src.indexOf('openSyncPermissionSettings:') !== -1, 'FDA open action missing');
assert.ok(src.indexOf('NEWEST_DIR_MTIME') !== -1, 'in-process fingerprint must emit NEWEST_DIR_MTIME');
(function () {
  var i = src.indexOf('return originalBlock +');
  assert.ok(i !== -1, 'enforce return join missing');
  // After "+ '" expect backslash (92) then n (110) then quote — one backslash only.
  var q = src.indexOf("+ '", i);
  assert.ok(q !== -1 && q < i + 40, 'join quote missing');
  assert.strictEqual(src.charCodeAt(q + 3), 92, 'expected one backslash');
  assert.strictEqual(src.charCodeAt(q + 4), 110, 'expected n');
  assert.strictEqual(src.charCodeAt(q + 5), 39, 'expected closing quote');
  assert.notStrictEqual(src.charCodeAt(q + 3 + 1) === 92 && src.charCodeAt(q + 3) === 92, true);
  // Ensure not double backslash: char after first backslash must be n, not another backslash
  assert.strictEqual(src.charCodeAt(q + 4), 110);
})();
assert.ok(sliceFunction('syncButtonAccessOk').indexOf('originalReadable !== true') !== -1);
(function () {
  var i = src.indexOf('return originalBlock +');
  assert.ok(i !== -1, 'enforce return join missing');
  var snip = src.slice(i, i + 70);
  // Expect JS source: + '\n' +  → characters: + space ' \ n ' space +
})();


assert.ok(src.indexOf('function syncOutboundPaintColor') !== -1, 'mtime paint helper missing');

(function () {
  var body = sliceFunction('syncOutboundPaintColor');
  assert.ok(body.indexOf('identical') !== -1, 'sync color must consider fingerprint identical');
  assert.ok(body.indexOf("'cyan'") !== -1 || body.indexOf('"cyan"') !== -1, 'different+newer must use cyan');
  assert.ok(body.indexOf("'blue'") !== -1 || body.indexOf('"blue"') !== -1, 'identical+older must use blue');
  assert.ok(body.indexOf('if (identical) {\n    return \'green\'') === -1 && body.indexOf('status === \'identical\') return \'green\'') === -1, 'must not force both green solely because identical');
  assert.ok(src.indexOf("state === 'cyan'") !== -1 || src.indexOf('state === "cyan"') !== -1, 'cyan palette missing');
})();

assert.ok(src.indexOf("(other === 'yellow') ? 'green'") === -1, 'both-yellow→both-green special case must be gone');

console.log('launch-detect.test.js ok');

assert.ok(src.indexOf('detectingPrepareTitle') !== -1, 'single-lang prepare detecting title missing');
assert.ok(src.indexOf('BIG_BUTTON_WIDTH_RATIO = 0.66') !== -1, 'tighter primary width missing');
assert.ok(src.indexOf('var windowWidth = 840;') !== -1, 'narrower window missing');


assert.ok(src.indexOf('refreshStep1Detect') !== -1 && src.indexOf('refreshStep2Detect') !== -1 && src.indexOf('refreshStep3Detect') !== -1, 'per-step refresh handlers missing');
assert.ok(src.indexOf('refreshStep1:') !== -1 && src.indexOf('addStepTitleWithRefresh') !== -1, 'per-step refresh UI missing');
assert.ok(src.indexOf('voidReleaseCheck') !== -1, 'Step3 refresh must reset Release check');
assert.ok(src.indexOf('stepRefreshPending') !== -1 && src.indexOf('beginStepRefresh') !== -1, 'per-step refresh disable missing');
assert.ok(src.indexOf('paintRefreshStepButtons') !== -1 && src.indexOf('maybeEndStep3Refresh') !== -1, 'refresh re-enable hooks missing');
assert.ok(src.indexOf('function LdialogBody') !== -1, 'LdialogBody missing');
assert.ok(src.indexOf("stepRefreshPending[2]") !== -1, 'Step2 pending early-return missing');
assert.ok(src.indexOf('setAction(en ? refreshStepActionName') !== -1 || src.indexOf('refreshStepActionName') !== -1, 'refresh action gate missing');
assert.ok(src.indexOf('bash 没有磁盘访问权限，还不能读取配置文件') !== -1, 'FDA dialog ZH body missing');
assert.ok(src.indexOf('clearLog:') !== -1 && src.indexOf("L('清空', 'Clear')") !== -1, 'Clear log button missing');
assert.ok(src.indexOf('function onClearLog') !== -1 || src.indexOf('clearDisplayedLog') !== -1, 'clear log handler missing');

assert.ok(src.indexOf("L('好', 'OK')") !== -1 || src.indexOf('L("好", "OK")') !== -1, 'alert OK must be single-lang L()');
assert.ok(src.indexOf("addButtonWithTitle($('好 / OK'))") === -1, 'bilingual alert OK must be gone');

