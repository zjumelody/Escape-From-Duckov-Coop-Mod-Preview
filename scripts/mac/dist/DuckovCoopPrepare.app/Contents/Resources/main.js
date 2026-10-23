// Duckov Co-op Prepare
// JavaScript for Automation window. Edit this file, then run scripts/mac/build-gui-app.sh.
//
// JXA exposes some Objective-C methods as functions and some zero-argument calls as
// values that are already invoked. objc() calls a function and otherwise returns the value.
// 有的零参数调用在 JXA 里已经是取好的值。objc() 能调用就调用，否则返回原值。
// On some macOS releases a resolved accessor still has typeof "function".
// Calling it throws TypeError: Object is not a function (-2700); objc() returns that value.
// 部分 macOS 上，已经取到的访问器 typeof 仍是 function。再调用会抛出
// TypeError: Object is not a function (-2700)。objc() 会返回这个原值。

ObjC.import('Cocoa');
ObjC.import('Foundation');

var RELEASES_PAGE = 'https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases';
var RELEASES_API = 'https://api.github.com/repos/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases?per_page=100';

var controller = null;
var mainWindow = null;
var sourceField = null;
var destField = null;
var modsField = null;
var logView = null;
var statusField = null;
var step1TitleLabel = null;
var step2TitleLabel = null;
var step3TitleLabel = null;
var stepDone = [false, false, false, false];
var prepareButton = null;
var prepareFill = null;
var downloadButton = null;
var releasesButton = null;
var chooseSourceButton = null;
var chooseDestButton = null;
var chooseModsButton = null;
var clearModsButton = null;
var openSourceButton = null;
var openDestButton = null;
var openModsButton = null;
var openOriginalConfigButton = null;
var openCoopConfigButton = null;
var syncToCoopButton = null;
var syncToOriginalButton = null;
var DUCKOV_BUNDLE_ID = 'com.bilibili.duckov';
var runningTask = null;
var pollTimer = null;
var busy = false;
var quitting = false;
var closing = false;
var taskSettled = false;
var taskKind = '';
var logPath = '';
var resultPath = '';
var resources = '';
var shared = null;
var matcherError = '';

function objc(value) {
  // 较新的 macOS（例如 27 / arm64）上，$.NSProcessInfo.processInfo 和 .environment
  // 可能 typeof 为 function，但对象已经解析好。再调用会抛出
  // TypeError: Object is not a function (-2700)。只接住这一类并返回原值。
  // On newer macOS (for example 27 / arm64), $.NSProcessInfo.processInfo and
  // .environment can report typeof "function" after they are already resolved.
  // Calling them throws TypeError: Object is not a function (-2700).
  // Only that failure returns the value. Other errors still propagate.
  if (typeof value !== 'function') return value;
  try {
    return value();
  } catch (error) {
    if (isResolvedAccessorError(error)) return value;
    throw error;
  }
}

function isResolvedAccessorError(error) {
  var text = '';
  var code = null;
  try {
    text = String(error && error.message != null ? error.message : error);
  } catch (ignored) {
    text = '';
  }
  if (text.indexOf('not a function') !== -1 || text.indexOf('-2700') !== -1) return true;
  try {
    text = String(error);
  } catch (ignoredAgain) {
    text = '';
  }
  if (text.indexOf('not a function') !== -1 || text.indexOf('-2700') !== -1) return true;
  try {
    if (error && error.errorNumber != null) code = error.errorNumber;
    else if (error && error.number != null) code = error.number;
  } catch (ignoredCode) {
    code = null;
  }
  return code === -2700 || code === '-2700';
}

function unwrap(value) {
  var current = objc(value);
  if (current === null || current === undefined) return current;
  try {
    return ObjC.unwrap(current);
  } catch (e) {
    return current;
  }
}

function asBool(value) {
  return !!unwrap(value);
}

function asNumber(value) {
  var n = Number(unwrap(value));
  if (isNaN(n)) return 0;
  return n;
}

function trim(text) {
  return String(text || '').replace(/^\s+|\s+$/g, '');
}

function joinPath(dir, name) {
  var left = String(dir || '');
  var right = String(name || '');
  if (!left) return right;
  if (!right) return left;
  if (left.charAt(left.length - 1) === '/') return left + right;
  return left + '/' + right;
}

function endsWithApp(path) {
  var lower = String(path || '').toLowerCase();
  return lower.length >= 4 && lower.substring(lower.length - 4) === '.app';
}

function originalConfigDir() {
  return joinPath(
    homeDir(),
    'Library/Containers/' + DUCKOV_BUNDLE_ID + '/Data/Library/Application Support/' + DUCKOV_BUNDLE_ID
  );
}

function coopConfigDir() {
  return joinPath(homeDir(), 'Library/Application Support/' + DUCKOV_BUNDLE_ID);
}

function parentDir(path) {
  var text = String(path || '');
  var slash = text.lastIndexOf('/');
  if (slash <= 0) return '';
  return text.substring(0, slash);
}

function configExplanation() {
  var originalConfig = '~/Library/Containers/' + DUCKOV_BUNDLE_ID + '/Data/Library/Application Support/' + DUCKOV_BUNDLE_ID;
  var coopConfig = '~/Library/Application Support/' + DUCKOV_BUNDLE_ID;
  return [
    '同一 Bundle ID（' + DUCKOV_BUNDLE_ID + '）。原版开着 App Sandbox，配置在原版配置位置；联机副本关掉沙盒，配置在联机副本配置位置。差别是沙盒开关，不是 .app 放在哪。里面通常有 Saves/、Mods 配置。同步前请退出两边的游戏。',
    'Same bundle id (' + DUCKOV_BUNDLE_ID + '). Sandbox on: original config folder. Sandbox off: co-op config folder. Not where the .app lives. Usually holds Saves/ and Mods configs. Quit both games before syncing.',
    '原版配置位置 / original config folder: ' + originalConfig,
    '联机副本配置位置 / co-op config folder: ' + coopConfig
  ].join('\n');
}

function fullDiskAccessText() {
  return '请打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」，加入 DuckovCoopPrepare.app，然后重试。读取原版配置位置（~/Library/Containers 里的沙盒容器）时，系统经常会拒绝未授权的应用。\n'
    + 'Open System Settings → Privacy & Security → Full Disk Access, add DuckovCoopPrepare.app, then try again. macOS often blocks unapproved apps from reading the original config folder (the sandbox container under ~/Library/Containers).';
}

function runtimeEnv() {
  var info = objc($.NSProcessInfo.processInfo);
  return ObjC.deepUnwrap(objc(info.environment)) || {};
}

function homeDir() {
  var env = runtimeEnv();
  if (env.HOME) return String(env.HOME);
  var home = unwrap($.NSHomeDirectory);
  return home ? String(home) : '';
}

function tempDir() {
  var dir = unwrap($.NSTemporaryDirectory);
  if (!dir) return '/tmp';
  return String(dir);
}

function normalize(path) {
  var text = trim(path);
  var home = homeDir();
  if (text === '~') text = home;
  else if (text.indexOf('~/') === 0) text = home + text.substring(1);
  while (text.length > 1 && text.charAt(text.length - 1) === '/') {
    text = text.substring(0, text.length - 1);
  }
  return text;
}

function fileExists(path) {
  if (!path) return false;
  var fm = objc($.NSFileManager.defaultManager);
  return asBool(fm.fileExistsAtPath($(String(path))));
}

function isWritable(path) {
  if (!path) return false;
  var fm = objc($.NSFileManager.defaultManager);
  return asBool(fm.isWritableFileAtPath($(String(path))));
}

function ensureDir(path) {
  var fm = objc($.NSFileManager.defaultManager);
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(path), true, null, null);
}

function removeFile(path) {
  if (!path || !fileExists(path)) return;
  var fm = objc($.NSFileManager.defaultManager);
  fm.removeItemAtPathError($(path), null);
}

function writeTextFile(path, text) {
  var ns = objc($.NSString.alloc).initWithString($(String(text)));
  if (!ns) return false;
  return asBool(ns.writeToFileAtomicallyEncodingError($(path), true, $.NSUTF8StringEncoding, null));
}

function readTextFile(path) {
  var data = $.NSData.dataWithContentsOfFile($(path));
  if (!data) return '';
  var ns = objc($.NSString.alloc).initWithDataEncoding(data, $.NSUTF8StringEncoding);
  if (!ns) return '';
  return String(unwrap(ns) || '');
}

function rgb(r, g, b) {
  return $.NSColor.colorWithCalibratedRedGreenBlueAlpha(r, g, b, 1);
}

function setStatus(text, ok) {
  if (!statusField) return;
  statusField.setStringValue($(text));
  try {
    if (ok === true) statusField.setTextColor(rgb(0.0, 0.42, 0.18));
    else if (ok === false) statusField.setTextColor(rgb(0.65, 0.1, 0.1));
    else statusField.setTextColor(rgb(0.1, 0.1, 0.1));
  } catch (e) {}
}

function refreshLogView() {
  if (!logView || !logPath) return;
  var text = readTextFile(logPath);
  logView.setString($(text));
  logView.scrollRangeToVisible($.NSMakeRange(text.length, 0));
}

function appendLogFile(text) {
  if (!logPath) return;
  var existing = fileExists(logPath) ? readTextFile(logPath) : '';
  if (existing && existing.charAt(existing.length - 1) !== '\n') existing += '\n';
  if (!writeTextFile(logPath, existing + String(text))) return;
  refreshLogView();
}

function replaceLog(text) {
  if (!logPath) return;
  writeTextFile(logPath, String(text));
  refreshLogView();
}

function fieldText(field) {
  return trim(String(unwrap(field.stringValue) || ''));
}

function setField(field, text) {
  field.setStringValue($(String(text)));
}

function setBusy(flag) {
  busy = !!flag;
  var enabled = !busy;
  var buttons = [
    prepareButton, downloadButton, chooseSourceButton, chooseDestButton, chooseModsButton, clearModsButton,
    openSourceButton, openDestButton, openModsButton,
    openOriginalConfigButton, openCoopConfigButton, syncToCoopButton, syncToOriginalButton
  ];
  var i;
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i]) buttons[i].setEnabled(enabled);
  }
  if (sourceField) sourceField.setEditable(enabled);
  if (destField) destField.setEditable(enabled);
  if (modsField) modsField.setEditable(enabled);
  paintPrepareButton(enabled);
}

function showAlert(title, info) {
  var alert = objc(objc($.NSAlert.alloc).init);
  alert.setMessageText($(title));
  alert.setInformativeText($(info));
  alert.addButtonWithTitle($('好 / OK'));
  objc(alert.runModal);
}

function firstButtonCode() {
  try {
    var value = $.NSAlertFirstButtonReturn;
    var n = Number(unwrap(value));
    if (!isNaN(n) && n !== 0) return n;
  } catch (e) {}
  return 1000;
}

function showConfirm(title, info, okTitle, cancelTitle) {
  return showChoices(title, info, [okTitle, cancelTitle]) === 0;
}

function showChoices(title, info, titles) {
  var alert = objc(objc($.NSAlert.alloc).init);
  alert.setMessageText($(title));
  alert.setInformativeText($(info));
  var i;
  for (i = 0; i < titles.length; i++) alert.addButtonWithTitle($(titles[i]));
  var code = asNumber(objc(alert.runModal));
  var index = code - firstButtonCode();
  if (index < 0 || index >= titles.length) return -1;
  return index;
}

function showPrepareDoneAlert() {
  var dest = fieldText(destField);
  var title = '第一步已经完成，游戏副本已经创建好，是否进行第二步：同步原版配置（包括存档）到副本游戏位置？\n'
    + 'Step 1 done — co-op copy is ready. Continue with Step 2: sync original config (including saves) to the copy?';
  var info = [
    '请先完全退出原版 Duckov 和联机副本。同步会用来源镜像覆盖目标，并删除目标里多出来的文件。',
    'Quit the original Duckov app and the co-op copy first. Sync mirrors the source onto the destination and deletes files that exist only there.',
    '',
    '若读取原版配置被拒绝，请打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」，加入 DuckovCoopPrepare.app 后再试。',
    'If macOS blocks the original config folder, open System Settings → Privacy & Security → Full Disk Access, add DuckovCoopPrepare.app, then try again.',
    '',
    '副本 / Copy: ' + dest,
    '请只启动这份副本进行联机。各方的 ModVersion 必须完全一致。',
    'Launch only this copy for co-op. Every peer must use the exact same ModVersion string.'
  ].join('\n');
  var choice = showChoices(title, info, [
    '立即同步 / Sync now',
    '不同步 / Don\'t sync'
  ]);
  if (choice === 0) onSync('1to2', true);
}

function guard(fn) {
  try {
    fn();
  } catch (error) {
    try { setBusy(false); } catch (e1) {}
    try {
      appendLogFile('错误 / Error: ' + error + (error && error.stack ? '\n' + error.stack : ''));
    } catch (e2) {}
    try { showAlert('出错了 / Something went wrong', String(error)); } catch (e3) {}
  }
}

function quoteArg(text) {
  var value = String(text);
  if (value.indexOf(' ') === -1 && value.indexOf('"') === -1) return value;
  return '"' + value.replace(/"/g, '\\"') + '"';
}

function previewArgs(argv) {
  var parts = [];
  var i;
  for (i = 0; i < argv.length; i++) parts.push(quoteArg(argv[i]));
  return parts.join(' ');
}

function taskIsRunning(task) {
  if (!task) return false;
  try { if (asBool(task.isRunning)) return true; } catch (e1) {}
  try { if (asBool(task.running)) return true; } catch (e2) {}
  return false;
}

function taskExitCode(task) {
  try {
    var n = Number(unwrap(task.terminationStatus));
    if (!isNaN(n)) return n;
  } catch (e) {}
  return 1;
}

function pump() {
  try {
    var loop = objc($.NSRunLoop.currentRunLoop);
    loop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.05));
  } catch (e) {}
}

function loadShared(resourcesDir) {
  var path = joinPath(resourcesDir, 'release-match.js');
  var text = readTextFile(path);
  if (!text) throw new Error('missing ' + path);
  var sandbox = {};
  var runner = new Function(
    'exports',
    text + '\nexports.selectCoopModAsset = selectCoopModAsset;\nexports.safeReleaseDownloadUrl = safeReleaseDownloadUrl;\nexports.safeModZipName = safeModZipName;\nexports.releaseAssetVersionLabel = releaseAssetVersionLabel;\n'
  );
  runner(sandbox);
  return sandbox;
}

function introText() {
  var lines = [
    WINDOW_TITLE,
    '',
    '窗口最上方的「当前状态」会告诉你下一步该做什么。做完的步骤标题会变成绿色，并加上 ✅。',
    'Current status at the top of the window says what to do next. A finished step\'s title turns green and gains a ✅.',
    '第一步：准备联机副本。确认原版 Duckov.app 和副本位置（默认 ~/Applications/Duckov-COOP.app），再点这一步里的蓝色「准备联机副本」。原版不会被修改。',
    'Step 1: Prepare the co-op copy. Confirm the original Duckov.app and the copy (default ~/Applications/Duckov-COOP.app), then click the blue Prepare co-op copy button in that step. The original app is not modified.',
    '第二步：配置文件同步。原版配置和联机副本配置可以互相镜像。同步前请退出两边的游戏。',
    'Step 2: Sync config files. The original config folder and the co-op config folder can be mirrored either way. Quit both games before syncing.',
    '第三步：配置（支持 Mac 的）联机 Mod。已经下载的话选择位置，会更新到副本；没有的话点下载按钮，自动下载并拷贝到副本的 Mods。',
    'Step 3: Configure the Mac-compatible co-op Mod. If you already downloaded it, pick its location and it updates into the copy; otherwise use the download button to download and copy it into the copy\'s Mods folder.',
    '',
    '若系统提示无法验证开发者：按住 Control 点按本应用，选择「打开」。只需一次。',
    '若菜单里没有「打开」，到「系统设置 → 隐私与安全性」里点「仍要打开」。',
    'If macOS says the developer cannot be verified: Control-click this app and choose Open. Once is enough.',
    'If Open is not offered, use System Settings → Privacy & Security → Open Anyway.',
    '',
    '日志 / Log: ' + logPath
  ];
  if (matcherError) {
    lines.push('');
    lines.push('版本匹配脚本没有载入，仍可准备副本，但不能从这里下载 Mod。');
    lines.push('The release matcher did not load. Preparing a copy still works; download does not.');
    lines.push(matcherError);
  }
  return lines.join('\n');
}

function chooseLogPath() {
  var path = joinPath(homeDir(), 'Library/Logs/DuckovCoopPrepare.log');
  if (writeTextFile(path, '')) return path;
  path = joinPath(tempDir(), 'DuckovCoopPrepare.log');
  writeTextFile(path, '');
  return path;
}

function runSync(argv) {
  var outPath = joinPath(tempDir(), 'duckov-cmd-out.txt');
  var errPath = joinPath(tempDir(), 'duckov-cmd-err.txt');
  writeTextFile(outPath, '');
  writeTextFile(errPath, '');
  var task = objc(objc($.NSTask.alloc).init);
  task.setLaunchPath($(argv[0]));
  var args = objc(objc($.NSMutableArray.alloc).init);
  var i;
  for (i = 1; i < argv.length; i++) args.addObject($(String(argv[i])));
  task.setArguments(args);
  var outHandle = $.NSFileHandle.fileHandleForWritingAtPath($(outPath));
  var errHandle = $.NSFileHandle.fileHandleForWritingAtPath($(errPath));
  if (outHandle) task.setStandardOutput(outHandle);
  if (errHandle) task.setStandardError(errHandle);
  objc(task.launch);
  objc(task.waitUntilExit);
  try { if (outHandle) objc(outHandle.closeFile); } catch (e1) {}
  try { if (errHandle) objc(errHandle.closeFile); } catch (e2) {}
  return {
    code: taskExitCode(task),
    stdout: readTextFile(outPath),
    stderr: readTextFile(errPath)
  };
}

function lookupAsset() {
  if (!shared || !shared.selectCoopModAsset) {
    throw new Error('找不到版本匹配脚本。请重新下载 DuckovCoopPrepare-mac.zip。\nThe release matcher is missing. Download DuckovCoopPrepare-mac.zip again.');
  }
  var jsonPath = joinPath(tempDir(), 'duckov-releases.json');
  var result = runSync([
    '/usr/bin/curl', '-fL', '--retry', '3', '--retry-delay', '2',
    '--max-time', '60', '-sS',
    '-A', 'DuckovCoopPrepare',
    '-H', 'Accept: application/vnd.github+json',
    '-o', jsonPath,
    RELEASES_API
  ]);
  if (!result || result.code !== 0) {
    throw new Error('无法访问 GitHub Releases。请检查网络，或点「打开 GitHub 页面」手动下载。\nCould not reach GitHub Releases. Check the network, or click Open GitHub and download the zip yourself.\n\n' + (result ? result.stderr : ''));
  }
  var text = readTextFile(jsonPath);
  if (!text) throw new Error('Releases 响应是空的。 / The Releases response was empty.');
  var data = $(text).dataUsingEncoding($.NSUTF8StringEncoding);
  var obj = $.NSJSONSerialization.JSONObjectWithDataOptionsError(data, 0, null);
  if (!obj) throw new Error('Releases 响应无法解析。 / Could not parse the Releases response.');
  return shared.selectCoopModAsset(ObjC.deepUnwrap(obj));
}

function chooseDownloadFolder() {
  var parent = runtimeEnv().DUCKOV_COOP_PREPARE_PARENT || '';
  if (parent && isWritable(parent)) return parent;
  var downloads = joinPath(homeDir(), 'Downloads');
  if (fileExists(downloads) && isWritable(downloads)) return downloads;
  var support = joinPath(homeDir(), 'Library/Application Support/DuckovCoopPrepare');
  ensureDir(support);
  return support;
}

function finishTask() {
  if (taskSettled) return;
  taskSettled = true;
  var code = 1;
  var kind = taskKind;
  try { code = taskExitCode(runningTask); } catch (e) { code = 1; }
  runningTask = null;
  if (kind === 'download' && code === 0) {
    var mods = trim(readTextFile(resultPath));
    if (mods && fileExists(mods)) {
      setField(modsField, mods);
      setBusy(false);
      if (copyIsReady()) {
        appendLogFile('\n已下载并解压。正在更新到副本的 Contents/Mods/。\nDownloaded and unzipped. Updating the copy\'s Contents/Mods/.\n退出码 / Exit code: 0\n');
        startInstallMod(mods);
        return;
      }
      appendLogFile('\n已下载并解压。副本还不存在，请先完成第一步。\nDownloaded and unzipped. The co-op copy is not ready yet. Finish Step 1.\n退出码 / Exit code: 0\n');
      setStatus('已下载。请先完成第一步，准备时会装进副本。 / Downloaded. Finish Step 1; Prepare installs it into the copy.', true);
      showAlert(
        '已下载并解压 / Downloaded and unzipped',
        '副本还不存在，所以还没有写入游戏。请先完成第一步「准备联机副本」。这个 Mod 会在准备时装进副本的 Contents/Mods/。\n\nThe co-op copy is not there yet, so the game was not changed. Finish Step 1, Prepare co-op copy. This Mod is installed into the copy\'s Contents/Mods/ when you prepare it.\n\n' + mods
      );
      return;
    }
    code = 1;
    appendLogFile('\n解压结果路径无效。 / The unzipped folder path was missing.\n');
  }
  if (kind === 'download') {
    appendLogFile('\n退出码 / Exit code: ' + code + '\n未完成 / Did not finish\n');
    setStatus('下载失败。 / Download failed.', false);
    setBusy(false);
    showAlert(
      '下载失败 / Download failed',
      '没有完成下载或解压。请查看日志，或打开 GitHub 页面手动下载。\n\nDownload or unzip did not finish. Read the log, or open the GitHub page and download the zip manually.'
    );
    return;
  }
  if (kind === 'sync') {
    var needAccess = code === 77;
    try {
      var syncLog = readTextFile(logPath);
      if (syncLog.indexOf('NEED_FULL_DISK_ACCESS') !== -1) needAccess = true;
      if (syncLog.indexOf('Operation not permitted') !== -1) needAccess = true;
      if (syncLog.indexOf('Operation not allowed') !== -1) needAccess = true;
    } catch (eSync) {}
    if (code === 0) {
      appendLogFile('\n退出码 / Exit code: 0\n同步完成 / Sync finished\n');
      setBusy(false);
      markStep(2);
      showAlert(
        '同步完成 / Sync finished',
        '配置文件夹里的内容已按来源镜像到目标。这不会修改 .app 本身。\nThe config folder contents were mirrored onto the destination. The .app bundles themselves are not modified.'
      );
      return;
    }
    appendLogFile('\n退出码 / Exit code: ' + code + '\n同步未完成 / Sync did not finish\n');
    setStatus('同步未完成。请查看日志。 / Sync did not finish. Read the log.', false);
    setBusy(false);
    if (needAccess) {
      showAlert('需要完全磁盘访问权限 / Full Disk Access is required', fullDiskAccessText());
    } else {
      showAlert(
        '同步未完成 / Sync did not finish',
        '请查看窗口里的日志。\nRead the log in the window.\n\n若日志里出现 Operation not permitted，请授予 DuckovCoopPrepare.app 完全磁盘访问权限后再试。\nIf the log says Operation not permitted, grant DuckovCoopPrepare.app Full Disk Access, then try again.'
      );
    }
    return;
  }
  if (kind === 'install-mod') {
    if (code === 0) {
      var installLog = '';
      try { installLog = readTextFile(logPath); } catch (eInstallLog) { installLog = ''; }
      var skippedSame = installLog.indexOf('COOP_MOD_RESULT skipped-same-version') !== -1;
      var dedupedOnly = installLog.indexOf('COOP_MOD_RESULT deduped') !== -1 && installLog.indexOf('COOP_MOD_RESULT updated') === -1;
      var removedOld = installLog.indexOf('已从副本移除同属联机 Mod') !== -1;
      appendLogFile('\n退出码 / Exit code: 0\n已更新到副本 Mods / Updated into the copy\'s Mods\n');
      setBusy(false);
      markStep(3);
      if (skippedSame) {
        showAlert(
          '已是最新版本 / Already the latest version',
          '副本里已经是这个版本的联机 Mod，没有重新下载或覆盖。其他 Mod 没有被删除。\n\nThe copy already has this co-op Mod version. It was not downloaded or overwritten again. Other Mods were not deleted.\n\n' + fieldText(destField)
        );
        return;
      }
      if (dedupedOnly) {
        showAlert(
          '已去掉重复的联机 Mod / Removed the duplicate co-op Mod',
          '副本里已经有这个版本，所以没有重新下载。多出来的旧联机 Mod 目录已去掉，只留一份。其他 Mod 没有删除。\n\nThis version was already in the copy, so it was not downloaded again. Extra older co-op Mod folders were removed so only one remains. Other Mods were not deleted.\n\n' + fieldText(destField)
        );
        return;
      }
      var updatedInfo = '支持 Mac 的联机 Mod 已放入副本的 Contents/Mods/，并已用本机 codesign 身份 "-" 重新签名。请只启动这份副本。不要把 Mod 放进原版 App。\n\nThe Mac-compatible co-op Mod is in the copy\'s Contents/Mods/, and the copy was re-signed with the local codesign identity "-". Launch only this copy. Do not put the Mod in the original app.';
      if (removedOld) {
        updatedInfo += '\n\n已去掉副本里同属这个联机 Mod 的旧目录，只保留一份。其他 Mod 没有删除。\nOlder folders of this same co-op Mod were removed from the copy. Only one remains. Other Mods were not deleted.';
      }
      showAlert(
        '已更新到副本 / Updated into the copy',
        updatedInfo + '\n\n' + fieldText(destField)
      );
      return;
    }
    appendLogFile('\n退出码 / Exit code: ' + code + '\n没有更新到副本 / The copy was not updated\n原版 App 没有被修改。 / The original app was not modified.\n');
    setStatus('没有更新到副本。请查看日志。 / The copy was not updated. Read the log.', false);
    setBusy(false);
    showAlert(
      '没有更新到副本 / The copy was not updated',
      '请查看窗口里的日志。原版 App 没有被修改。若副本正在运行，请先退出再试。\n\nRead the log in the window. The original app was not modified. If the co-op copy is running, quit it and try again.'
    );
    return;
  }
  if (code === 0) {
    appendLogFile('\n退出码 / Exit code: 0\n完成 / Done\n');
    stepDone[1] = true;
    try {
      var preparedMods = listCoopMods('dest', normalize(fieldText(destField)));
      if (preparedMods.length > 0) stepDone[3] = true;
    } catch (ePrepared) {}
    setBusy(false);
    refreshGuide();
    showPrepareDoneAlert();
    return;
  }
  appendLogFile('\n退出码 / Exit code: ' + code + '\n未完成 / Did not finish\n原版 App 没有被修改。 / The original app was not modified.\n');
  setStatus('未完成。请查看日志。原版未被修改。 / Did not finish. Read the log. The original app was not modified.', false);
  setBusy(false);
  showAlert(
    '未完成 / Did not finish',
    '准备副本时出错。请查看窗口里的日志。原版 App 没有被修改。\n\nPreparing the copy failed. Read the log in the window. The original app was not modified.'
  );
}

function startTask(argv, kind, header, resetLog) {
  taskKind = kind;
  taskSettled = false;
  if (resetLog) replaceLog(header);
  else appendLogFile(header);
  if (!argv || argv.length < 1 || !fileExists(argv[0])) {
    taskSettled = true;
    setBusy(false);
    appendLogFile('无法启动 / Could not start: ' + (argv && argv[0]));
    setStatus('未能开始。 / Could not start.', false);
    showAlert('未能开始 / Could not start', '缺少程序： / Missing program:\n' + (argv && argv[0]));
    return;
  }
  if (argv.length >= 2 && argv[0] === '/bin/bash' && !fileExists(argv[1])) {
    taskSettled = true;
    setBusy(false);
    appendLogFile('无法启动 / Could not start: ' + argv[1]);
    setStatus('未能开始。 / Could not start.', false);
    showAlert('未能开始 / Could not start', '缺少脚本： / Missing script:\n' + argv[1]);
    return;
  }
  try {
    runningTask = objc(objc($.NSTask.alloc).init);
    runningTask.setLaunchPath($(argv[0]));
    var nsArgs = objc(objc($.NSMutableArray.alloc).init);
    var i;
    for (i = 1; i < argv.length; i++) nsArgs.addObject($(String(argv[i])));
    runningTask.setArguments(nsArgs);
    var info = objc($.NSProcessInfo.processInfo);
    var env = objc(objc(info.environment).mutableCopy);
    env.setObjectForKey($(logPath), $('DUCKOV_GUI_LOG'));
    if (kind === 'download') env.setObjectForKey($(resultPath), $('DUCKOV_MODS_RESULT'));
    runningTask.setEnvironment(env);
    if (resources) runningTask.setCurrentDirectoryPath($(resources));
    var devNull = $.NSFileHandle.fileHandleForWritingAtPath($('/dev/null'));
    if (devNull) {
      runningTask.setStandardOutput(devNull);
      runningTask.setStandardError(devNull);
    }
    objc(runningTask.launch);
  } catch (error) {
    runningTask = null;
    taskSettled = true;
    setBusy(false);
    appendLogFile('无法启动 / Could not start: ' + error);
    setStatus('未能开始。 / Could not start.', false);
    showAlert('未能开始 / Could not start', String(error));
    return;
  }
  if (!taskIsRunning(runningTask)) {
    finishTask();
    return;
  }
  pollTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.4,
    controller,
    'poll:',
    null,
    true
  );
}

function workspaceShared() {
  return objc($.NSWorkspace.sharedWorkspace);
}

function openWithWorkspace(path) {
  var ws = workspaceShared();
  try {
    if (asBool(ws.openFile($(String(path))))) return true;
  } catch (e1) {}
  try {
    var url = $.NSURL.fileURLWithPath($(String(path)));
    if (asBool(ws.openURL(url))) return true;
  } catch (e2) {}
  return false;
}

function revealInFinder(path) {
  var ws = workspaceShared();
  try {
    if (asBool(ws.selectFileInFileViewerRootedAtPath($(String(path)), null))) return true;
  } catch (e1) {}
  try {
    var url = $.NSURL.fileURLWithPath($(String(path)));
    var urls = objc(objc($.NSMutableArray.alloc).init);
    urls.addObject(url);
    ws.activateFileViewerSelectingURLs(urls);
    return true;
  } catch (e2) {}
  // openFile on a .app would launch the game. Leave the bundle unopened.
  if (endsWithApp(path)) return false;
  return openWithWorkspace(path);
}

function onRevealField(field, emptyKind) {
  if (busy || quitting) return;
  var path = normalize(fieldText(field));
  if (!path) {
    if (emptyKind === 'mods') {
      showAlert(
        'Mods 路径是空的 / Mods path is empty',
        '还没有填写 Mac 联机 Mod 的位置。可以点「选择… / Choose…」，或点下面的下载按钮。\nNo Mac co-op Mod location yet. Click Choose, or use the download button below.'
      );
    } else {
      showAlert('路径是空的 / Path is empty', '请先填写路径。\nEnter a path first.');
    }
    return;
  }
  if (fileExists(path)) {
    if (!revealInFinder(path)) showAlert('无法在访达中显示 / Could not show it in Finder', path);
    return;
  }
  var parent = parentDir(path);
  if (parent && fileExists(parent)) {
    if (!revealInFinder(parent)) {
      showAlert('无法在访达中显示 / Could not show it in Finder', parent);
      return;
    }
    setStatus('该路径还不存在，已在访达中显示上一级。 / That path does not exist yet. Showed its parent in Finder.', null);
    return;
  }
  showAlert('找不到这个位置 / That location was not found', path);
}

function onOpenOriginalConfig() {
  if (busy || quitting) return;
  var path = originalConfigDir();
  if (!fileExists(path)) {
    showAlert(
      '找不到原版配置位置 / Original config folder was not found',
      '原版配置位置还不存在。请先至少启动一次原版 Duckov.app，让系统生成沙盒容器后再试。不会自动创建这个文件夹。\n'
      + 'The original config folder does not exist yet. Launch the original Duckov.app once so macOS can create the sandbox container, then try again. This folder is not created automatically.\n\n'
      + path
    );
    return;
  }
  if (!openWithWorkspace(path)) {
    showAlert('无法打开 / Could not open', path);
    return;
  }
  setStatus('已打开原版配置位置。 / Opened the original config folder.', true);
}

function onOpenCoopConfig() {
  if (busy || quitting) return;
  var path = coopConfigDir();
  if (!fileExists(path)) ensureDir(path);
  if (!fileExists(path)) {
    showAlert(
      '无法创建联机副本配置位置 / Could not create the co-op config folder',
      path + '\n\n' + fullDiskAccessText()
    );
    return;
  }
  if (!openWithWorkspace(path)) {
    showAlert('无法打开 / Could not open', path);
    return;
  }
  setStatus('已打开联机副本配置位置。 / Opened the co-op config folder.', true);
}

function onSync(direction, skipConfirm) {
  if (busy || quitting) return;
  var toCoop = direction === '1to2';
  var src = toCoop ? originalConfigDir() : coopConfigDir();
  var dest = toCoop ? coopConfigDir() : originalConfigDir();
  var title = toCoop ? SYNC_TO_COOP_TITLE : SYNC_TO_ORIGINAL_TITLE;
  var flag = toCoop ? 'original-to-coop' : 'coop-to-original';
  if (!fileExists(src)) {
    var missing = '找不到来源文件夹。 / Source folder was not found.\n\n' + src + '\n\n';
    if (toCoop) {
      missing += '原版配置位置还不存在。请先至少启动一次原版 Duckov.app。\nThe original config folder does not exist yet. Launch the original Duckov.app at least once.';
    } else {
      missing += '联机副本配置位置还不存在。可以先点「打开联机副本配置位置」创建空文件夹，或先启动一次联机副本。\nThe co-op config folder does not exist yet. Click Open co-op config folder to create it, or launch the co-op copy once.';
    }
    showAlert('找不到来源文件夹 / Source folder was not found', missing);
    return;
  }
  var script = joinPath(resources, 'sync-duckov-config.sh');
  if (!fileExists(script)) {
    showAlert(
      '找不到同步脚本 / Sync script is missing',
      '请重新下载 DuckovCoopPrepare-mac.zip。\nDownload DuckovCoopPrepare-mac.zip again.\n\n' + script
    );
    return;
  }
  var info = '请先完全退出原版 Duckov 和联机副本。两边都不要开着。\n'
    + 'Quit the original Duckov app and the co-op copy completely. Leave both closed.\n\n'
    + '这会用来源的内容镜像覆盖目标，并删除目标里多出来的文件（包括 Saves/、Mods 配置等）。\n'
    + 'This mirrors the source onto the destination and deletes files that exist only in the destination (including Saves/ and Mods configs).\n\n';
  if (toCoop) {
    info += '目标是联机副本配置位置。副本的存档会被换成原版里的内容。\n'
      + 'The destination is the co-op config folder. Saves in the co-op copy will be replaced by the original game.\n\n';
  } else {
    info += '目标是原版配置位置。原版游戏的存档会被换成副本里的内容。\n'
      + 'The destination is the original config folder. Saves in the original game will be replaced by the co-op copy.\n\n';
  }
  info += '从 / From:\n' + src + '\n\n到 / To:\n' + dest;
  if (!skipConfirm && !showConfirm(title, info, '开始同步 / Start sync', '取消 / Cancel')) {
    refreshGuide();
    return;
  }
  setBusy(true);
  setStatus('正在同步配置… 请保持两边游戏都已退出。 / Syncing config… Keep both games quit.', null);
  var argv = ['/bin/bash', script, '--direction', flag];
  var header = [
    '',
    '正在同步配置… / Syncing config…',
    '从 / From: ' + src,
    '到 / To: ' + dest,
    '命令 / Command: ' + previewArgs(argv),
    '',
    '请保持窗口打开。两边的游戏都应已退出。',
    'Leave this window open. Both games should already be quit.',
    ''
  ].join('\n');
  startTask(argv, 'sync', header, false);
}

function onPrepare() {
  if (busy || quitting) return;
  var source = normalize(fieldText(sourceField));
  var dest = normalize(fieldText(destField));
  var mods = normalize(fieldText(modsField));
  if (!source || !dest) {
    showAlert('还不能开始 / Not ready', '请填写原版 App 和副本路径。\nEnter the original app and the copy path.');
    return;
  }
  if (!endsWithApp(source) || !endsWithApp(dest)) {
    showAlert('路径需要以 .app 结尾 / Paths should end with .app', '原版和副本都应该是 .app。\nBoth the original and the copy should be .app bundles.');
    return;
  }
  if (source.toLowerCase() === dest.toLowerCase()) {
    showAlert('不会改写原版 / The original stays unchanged', '副本必须是另一份 App，不能和原版是同一个文件。\nThe copy has to be a different app from the original.');
    return;
  }
  if (!fileExists(source)) {
    showAlert('找不到原版 App / Original app was not found', source + '\n\n点「选择… / Choose…」指定 Duckov.app。\nClick Choose and select Duckov.app.');
    return;
  }
  if (mods && !fileExists(mods)) {
    showAlert('找不到 Mac 联机 Mod 文件夹 / Mac co-op Mod folder was not found', mods);
    return;
  }
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!fileExists(script)) {
    showAlert('找不到准备脚本 / Prepare script is missing', '请重新下载 DuckovCoopPrepare-mac.zip。\nDownload DuckovCoopPrepare-mac.zip again.\n\n' + script);
    return;
  }
  var replacing = fileExists(dest);
  var modsLine = mods ? mods : '（这次不装入新的 Mac 联机 Mod / No new Mac co-op Mod this time）';
  var info = '将复制原版并只修改副本。原版不会被改动。\nThe original app is copied. Only the copy is modified.\n\n'
    + '原版 / Original:\n' + source + '\n\n副本 / Copy:\n' + dest + '\n\nMac 联机 Mod / Mac co-op Mod:\n' + modsLine + '\n\n';
  if (replacing) {
    info += '副本已存在，将替换它，并保留其中已经装好的 Mods。\nThe copy already exists. It will be replaced. Mods already inside are kept.\n\n';
  }
  info += '复制可能需要几分钟。\nCopying can take several minutes.';
  if (!showConfirm('准备联机副本 / Prepare co-op copy', info, '开始 / Start', '取消 / Cancel')) {
    refreshGuide();
    return;
  }
  setBusy(true);
  setStatus('正在准备… 复制游戏时可能需要几分钟。 / Preparing… Copying the game can take several minutes.', null);
  var argv = ['/bin/bash', script];
  if (replacing) argv.push('--force');
  argv.push('--source', source, '--dest', dest);
  if (mods) argv.push('--mods-dir', mods);
  var header = [
    '正在准备联机副本… / Preparing the co-op copy…',
    '原版 / Original: ' + source,
    '副本 / Copy: ' + dest,
    'Mac 联机 Mod / Mac co-op Mod: ' + modsLine,
    '命令 / Command: ' + previewArgs(argv),
    '',
    '复制游戏时可能需要几分钟，请不要退出。',
    'Copying the game can take several minutes. Please leave this window open.',
    ''
  ].join('\n');
  startTask(argv, 'prepare', header, true);
}

function onDownload() {
  if (busy || quitting) return;
  setBusy(true);
  setStatus('正在查询最新支持 Mac 的联机 Mod… / Looking up the latest Mac-compatible co-op Mod…', null);
  appendLogFile('正在查询最新支持 Mac 的联机 Mod… / Looking up the latest Mac-compatible co-op Mod…');
  pump();
  var asset = null;
  try {
    asset = lookupAsset();
  } catch (error) {
    setBusy(false);
    setStatus('下载失败。 / Download failed.', false);
    appendLogFile(String(error));
    showAlert('下载失败 / Download failed', String(error));
    return;
  }
  if (!asset) {
    setBusy(false);
    var missing = '没有找到 EscapeFromDuckovCoopMod*.zip。\n请打开 GitHub 页面手动下载。\n\nNo EscapeFromDuckovCoopMod*.zip asset was found.\nOpen the GitHub page and download it manually.';
    setStatus('没有找到 Mac 联机 Mod。 / No Mac co-op Mod was found.', false);
    appendLogFile(missing);
    showAlert('没有找到 Mac 联机 Mod / No Mac co-op Mod was found', missing);
    return;
  }
  if (!shared.safeReleaseDownloadUrl(asset.url) || !shared.safeModZipName(asset.name)) {
    setBusy(false);
    setStatus('已取消下载。 / Download cancelled.', null);
    showAlert('已取消 / Cancelled', 'Release 附件地址不符合预期，已取消下载。\nThe Release asset URL was not recognized. Download cancelled.');
    return;
  }
  var assetVersion = '';
  try {
    if (shared.releaseAssetVersionLabel) assetVersion = String(shared.releaseAssetVersionLabel(asset.name, asset.tag) || '');
  } catch (eVersion) {
    assetVersion = '';
  }
  var folder = chooseDownloadFolder();
  var zipPath = joinPath(folder, asset.name);
  var unzipName = String(asset.name).replace(/\.zip$/i, '');
  var unzipPath = joinPath(folder, unzipName);
  var chosenMods = normalize(fieldText(modsField));
  if (assetVersion) {
    setStatus('正在确认是否已经有这个版本… / Checking whether this version is already installed…', null);
    pump();
    if (copyIsReady()) {
      var installed = listCoopMods('dest', normalize(fieldText(destField)));
      var matching = 0;
      var mi;
      for (mi = 0; mi < installed.length; mi++) {
        if (versionsEqual(installed[mi].version, assetVersion)) matching += 1;
      }
      if (installed.length > 1 && matching > 0) {
        appendLogFile('副本里已有版本 ' + assetVersion + '，但还有重复的旧联机 Mod。将去掉重复项，不重新下载。\nVersion ' + assetVersion + ' is already in the copy, along with a duplicate. Duplicates will be removed. The download was skipped.\n');
        startDedupe(assetVersion);
        return;
      }
      if (installed.length === 1 && matching === 1) {
        setBusy(false);
        markStep(3);
        appendLogFile('副本里已经是版本 ' + assetVersion + '，跳过下载。\nThe copy already has version ' + assetVersion + '. Skipped the download.\n');
        showAlert(
          '已是最新版本 / Already the latest version',
          '副本里已经是这个版本的联机 Mod（' + assetVersion + '），无需重新下载。\n\nThe copy already has this co-op Mod version (' + assetVersion + '). The download was skipped.\n\n' + fieldText(destField)
        );
        return;
      }
    }
    var reuse = '';
    if (chosenMods && folderHasVersion(chosenMods, assetVersion)) reuse = chosenMods;
    else if (folderHasVersion(unzipPath, assetVersion)) reuse = unzipPath;
    if (reuse) {
      setField(modsField, reuse);
      appendLogFile('本地已有相同版本（' + assetVersion + '），跳过下载。\nThis version is already on disk (' + assetVersion + '). Skipped the download.\n' + reuse + '\n');
      if (copyIsReady()) {
        startInstallMod(reuse);
        return;
      }
      setBusy(false);
      setStatus('已有相同版本，已记下位置。请先完成第一步。 / This version is already on disk. Finish Step 1 first.', null);
      showAlert(
        '已有相同版本 / This version is already on disk',
        '没有重新下载。副本还不存在，请先完成第一步「准备联机副本」。准备时会把这个 Mod 装进副本。\n\nThe download was skipped. The co-op copy is not ready yet. Finish Step 1, Prepare co-op copy. Prepare installs this Mod into the copy.\n\n' + reuse
      );
      return;
    }
  }
  var kindLabel = asset.prerelease ? '预发布 / pre-release' : '正式版 / release';
  var header = [
    '',
    '将下载 / Will download: ' + asset.name,
    '版本 / Release: ' + asset.tag + ' (' + kindLabel + ')',
    '目录 / Folder: ' + folder,
    ''
  ].join('\n');
  removeFile(resultPath);
  startTask([
    '/bin/bash',
    joinPath(resources, 'fetch-mod-zip.sh'),
    '--url', asset.url,
    '--zip', zipPath,
    '--dest', unzipPath
  ], 'download', header, false);
}

function onOpenReleases() {
  objc($.NSWorkspace.sharedWorkspace).openURL($.NSURL.URLWithString($(RELEASES_PAGE)));
}

function chooseApp(title, startDir) {
  var panel = objc($.NSOpenPanel.openPanel);
  panel.setCanChooseFiles(true);
  panel.setCanChooseDirectories(true);
  panel.setAllowsMultipleSelection(false);
  panel.setTreatsFilePackagesAsDirectories(false);
  panel.setCanCreateDirectories(false);
  panel.setPrompt($('选择 / Choose'));
  panel.setMessage($(title));
  if (startDir && fileExists(startDir)) panel.setDirectoryURL($.NSURL.fileURLWithPath($(startDir)));
  if (asNumber(panel.runModal) !== 1) return '';
  var url = objc(panel.URL);
  if (!url) return '';
  return String(unwrap(url.path) || '');
}

function chooseFolder(title, startDir) {
  var panel = objc($.NSOpenPanel.openPanel);
  panel.setCanChooseFiles(false);
  panel.setCanChooseDirectories(true);
  panel.setAllowsMultipleSelection(false);
  panel.setCanCreateDirectories(true);
  panel.setPrompt($('选择 / Choose'));
  panel.setMessage($(title));
  if (startDir && fileExists(startDir)) panel.setDirectoryURL($.NSURL.fileURLWithPath($(startDir)));
  if (asNumber(panel.runModal) !== 1) return '';
  var url = objc(panel.URL);
  if (!url) return '';
  return String(unwrap(url.path) || '');
}

function chooseDestPath() {
  var panel = objc($.NSSavePanel.savePanel);
  panel.setCanCreateDirectories(true);
  panel.setNameFieldStringValue($('Duckov-COOP.app'));
  panel.setPrompt($('选择 / Choose'));
  panel.setMessage($('指定要保存游戏副本的位置。今后要联机则打开这个副本。文件名应以 .app 结尾。\nChoose where to save the co-op copy. Launch this copy for co-op. The name should end with .app.'));
  var apps = joinPath(homeDir(), 'Applications');
  if (fileExists(apps)) panel.setDirectoryURL($.NSURL.fileURLWithPath($(apps)));
  if (asNumber(panel.runModal) !== 1) return '';
  var url = objc(panel.URL);
  if (!url) return '';
  var path = String(unwrap(url.path) || '');
  if (!path) return '';
  if (!endsWithApp(path)) path += '.app';
  return path;
}

function onChooseSource() {
  if (busy) return;
  var current = normalize(fieldText(sourceField));
  var start = '/Applications';
  if (current && fileExists(current)) start = current;
  var picked = chooseApp('选择原版 Duckov.app。\nChoose the original Duckov.app.', start);
  if (picked) setField(sourceField, picked);
}

function onChooseDest() {
  if (busy) return;
  var picked = chooseDestPath();
  if (picked) setField(destField, picked);
}

function copyIsReady() {
  var dest = normalize(fieldText(destField));
  return !!(dest && endsWithApp(dest) && fileExists(dest));
}

function startInstallMod(modsPath) {
  if (quitting) return;
  var source = normalize(fieldText(sourceField));
  var dest = normalize(fieldText(destField));
  var mods = normalize(modsPath);
  if (!mods || !fileExists(mods)) {
    showAlert('找不到 Mac 联机 Mod 文件夹 / Mac co-op Mod folder was not found', mods || '');
    return;
  }
  if (!dest || !endsWithApp(dest) || !fileExists(dest)) {
    setStatus('已记下 Mac 联机 Mod 的位置。请先完成第一步。 / Saved the Mac co-op Mod location. Finish Step 1 first.', null);
    showAlert(
      '副本还不存在 / The co-op copy is not ready',
      '已记下这个位置。请先完成第一步「准备联机副本」。准备时会把这个 Mod 装进副本的 Contents/Mods/。\n\nLocation saved. Finish Step 1, Prepare co-op copy. Prepare installs this Mod into the copy\'s Contents/Mods/.\n\n' + mods
    );
    return;
  }
  if (source && dest && source.toLowerCase() === dest.toLowerCase()) {
    showAlert('不会改写原版 / The original stays unchanged', '副本必须是另一份 App，不能和原版是同一个文件。\nThe copy has to be a different app from the original.');
    return;
  }
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!fileExists(script)) {
    showAlert('找不到准备脚本 / Prepare script is missing', '请重新下载 DuckovCoopPrepare-mac.zip。\nDownload DuckovCoopPrepare-mac.zip again.\n\n' + script);
    return;
  }
  setBusy(true);
  setStatus('正在把 Mac 联机 Mod 更新到副本… / Updating the Mac co-op Mod into the copy…', null);
  var argv = ['/bin/bash', script, '--update-mods', '--dest', dest, '--mods-dir', mods];
  if (source) argv.push('--source', source);
  var header = [
    '',
    '正在更新副本里的 Mac 联机 Mod… / Updating the Mac co-op Mod in the copy…',
    '副本 / Copy: ' + dest,
    'Mod: ' + mods,
    '命令 / Command: ' + previewArgs(argv),
    '',
    '不会重拷整份游戏，也不会修改原版。若副本正在运行，请先退出。',
    'The whole game is not copied again, and the original app is not modified. Quit the co-op copy if it is running.',
    ''
  ].join('\n');
  startTask(argv, 'install-mod', header, false);
}

function onChooseMods() {
  if (busy) return;
  var current = normalize(fieldText(modsField));
  var start = joinPath(homeDir(), 'Downloads');
  if (current && fileExists(current)) start = current;
  var picked = chooseFolder('选择已经下载的、支持 Mac 的联机 Mod 文件夹（里面含有 .dll，或含有带 .dll 的子文件夹）。副本已经存在时会更新进去。\nChoose the Mac-compatible co-op Mod folder you already downloaded (it should contain a .dll, or folders that do). If the co-op copy already exists, it is updated into that copy.', start);
  if (!picked) return;
  setField(modsField, picked);
  if (copyIsReady()) startInstallMod(picked);
  else {
    setStatus('已记下 Mac 联机 Mod 的位置。请先完成第一步。 / Saved the Mac co-op Mod location. Finish Step 1 first.', null);
    showAlert(
      '已记下位置 / Location saved',
      '副本还不存在。请先完成第一步「准备联机副本」。准备时会把这个 Mod 装进副本的 Contents/Mods/。\n\nThe co-op copy is not ready yet. Finish Step 1, Prepare co-op copy. Prepare installs this Mod into the copy\'s Contents/Mods/.\n\n' + picked
    );
  }
}

function onClearMods() {
  if (busy) return;
  setField(modsField, '');
  setStatus('已清除路径。副本里已经装好的 Mod 不会被删掉。 / Path cleared. Mods already in the copy stay there.', null);
}

function onPoll(timer) {
  try { refreshLogView(); } catch (e) {}
  try {
    if (!runningTask || taskSettled) return;
    if (taskIsRunning(runningTask)) return;
    if (pollTimer) {
      objc(pollTimer.invalidate);
      pollTimer = null;
    } else if (timer) {
      objc(timer.invalidate);
    }
    finishTask();
  } catch (error) {}
}

function onWindowShouldClose() {
  if (closing || quitting) return true;
  if (!busy) return true;
  var ok = showConfirm(
    '正在进行 / Still working',
    '关闭窗口会中断当前操作。\nClosing the window stops the current operation.',
    '仍然关闭 / Close anyway',
    '继续等待 / Keep waiting'
  );
  if (ok) closing = true;
  return ok;
}

function onWindowWillClose() {
  try {
    if (runningTask && taskIsRunning(runningTask)) objc(runningTask.terminate);
  } catch (e) {}
  if (quitting) return;
  quitting = true;
  try { objc($.NSApplication.sharedApplication).terminate(null); } catch (e2) {}
}

function installMenu(app) {
  var menu = objc(objc($.NSMenu.alloc).init);
  var appItem = objc(objc($.NSMenuItem.alloc).init);
  menu.addItem(appItem);
  app.setMainMenu(menu);
  var appMenu = objc(objc($.NSMenu.alloc).init);
  var quit = objc($.NSMenuItem.alloc).initWithTitleActionKeyEquivalent(
    $('退出 / Quit'),
    'terminate:',
    $('q')
  );
  quit.setTarget(app);
  appMenu.addItem(quit);
  menu.setSubmenuForItem(appMenu, appItem);
}

function secondaryTextColor() {
  try {
    var color = objc($.NSColor.secondaryLabelColor);
    if (color) return color;
  } catch (e) {}
  return rgb(0.35, 0.35, 0.35);
}

function readSize(value) {
  var w = 0;
  var h = 0;
  try {
    w = Number(value.width);
    h = Number(value.height);
  } catch (e) {}
  if (w > 0 && h > 0) return { width: w, height: h };
  var raw = '';
  try { raw = String(value); } catch (e2) { raw = ''; }
  var match = raw.match(/([\d.]+)\s*,\s*([\d.]+)/);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };
  return { width: w > 0 ? w : 0, height: h > 0 ? h : 0 };
}

function viewSize(view, fallbackW, fallbackH) {
  try {
    var frame = objc(view.frame);
    var size = frame && frame.size ? frame.size : frame;
    var got = readSize(size);
    if (got.width > 0 && got.height > 0) return got;
  } catch (e) {}
  return { width: fallbackW, height: fallbackH };
}

function measureText(text, font) {
  try {
    var ns = objc($.NSString.alloc).initWithString($(String(text)));
    var attrs = objc($.NSMutableDictionary.alloc).init;
    if (font) attrs.setObjectForKey(font, $.NSFontAttributeName);
    return readSize(objc(ns.sizeWithAttributes(attrs)));
  } catch (e) {
    return { width: 0, height: 0 };
  }
}

function measureWrappedHeight(text, width, font, lineH) {
  var raw = String(text || '');
  var fallbackLine = lineH > 0 ? lineH : 16;
  if (!raw) return fallbackLine;
  try {
    var str = objc($.NSMutableAttributedString.alloc).initWithString($(raw));
    if (font) str.addAttributeValueRange($.NSFontAttributeName, font, $.NSMakeRange(0, raw.length));
    var bounds = objc(str.boundingRectWithSizeOptionsContext($.NSMakeSize(width, 100000), 1, null));
    var size = readSize(bounds && bounds.size ? bounds.size : bounds);
    if (size.height > 0) return Math.ceil(size.height) + 4;
  } catch (e) {}
  var parts = raw.split('\n');
  var total = 0;
  var i;
  for (i = 0; i < parts.length; i++) {
    var measured = measureText(parts[i], font);
    var lines = 1;
    if (measured.width > width && width > 0) lines = Math.ceil(measured.width / width);
    var one = measured.height > 0 ? measured.height : fallbackLine;
    total += one * lines;
  }
  if (!(total > 0)) total = fallbackLine * Math.max(1, parts.length);
  return Math.ceil(total) + 4;
}

// NSImageOnly is 1 on every ABI. NSTextAlignment is not: arm64 AppKit uses
// center=1 and right=2, while the JXA named constant NSTextAlignmentCenter
// still comes back as the legacy 2. That 2 right-aligns the title and clips it.
function imagePositionOnly() {
  try {
    var raw = $.NSImageOnly;
    var n = typeof raw === 'number' ? raw : Number(unwrap(raw));
    if (!isNaN(n)) return n;
  } catch (e) {}
  return 1;
}

function imageScaleFit() {
  try {
    var raw = $.NSImageScaleProportionallyUpOrDown;
    var n = typeof raw === 'number' ? raw : Number(unwrap(raw));
    if (!isNaN(n)) return n;
  } catch (e) {}
  return 3;
}

function paintLayer(view, r, g, b, radius) {
  try {
    view.setWantsLayer(true);
    var layer = objc(view.layer);
    if (!layer) return false;
    layer.setBackgroundColor($.CGColorCreateGenericRGB(r, g, b, 1));
    if (radius != null) layer.setCornerRadius(radius);
    try { layer.setMasksToBounds(true); } catch (e) {}
    return true;
  } catch (e2) {
    return false;
  }
}

var WINDOW_TITLE = '《逃离鸭科夫》Mac 联机 Mod 支持工具';
// English equivalent: Escape from Duckov — Mac co-op Mod support tool.
var PREPARE_BUTTON_TITLE = '准备联机副本 / Prepare co-op copy';
var PREPARE_TITLE_SIZE = 14;
var SYNC_TO_COOP_TITLE = '（同步文件）原版配置 → 联机副本 / (sync files) original → co-op';
var SYNC_TO_ORIGINAL_TITLE = '（同步文件）联机副本 → 原版配置 / (sync files) co-op → original';
var STEP1_TITLE = '第一步：准备联机副本 / Step 1: Prepare co-op copy';
var STEP2_TITLE = '第二步：配置文件同步 / Step 2: Sync config files';
var STEP3_TITLE = '第三步：配置（支持Mac的）联机 Mod / Step 3: Configure (Mac-compatible) co-op Mod';
var STEP1_HELP = '复制官方 Duckov.app，只改副本：关闭 App Sandbox，加入联网权限，并用本机 codesign 身份 "-" 重新签名。原版不会被修改。\nCopy the official Duckov.app and change only the copy: turn off App Sandbox, add network access, and re-sign with the local codesign identity "-". The original app is not modified.';
var STEP3_HELP = '已经下载了最新版支持 Mac 联机的 Mod 的话可以指定文件位置，会自动更新到副本 App 里；如果没有下载则可以点击下载按钮自动下载并拷贝到副本 Mods 里。\nIf you already downloaded the latest Mac-compatible co-op Mod, pick its location and it will update into the copy App; if not, use the download button to download and copy it into the copy\'s Mods folder.';
var DOWNLOAD_MOD_TITLE_ZH = '自动下载并更新最新支持 Mac 的联机 Mod 到副本 Mods 位置';
var DOWNLOAD_MOD_TITLE_EN = 'Auto-download and update the latest Mac-compatible co-op Mod into the copy\'s Mods folder';
var DOWNLOAD_MOD_TITLE = DOWNLOAD_MOD_TITLE_ZH + ' / ' + DOWNLOAD_MOD_TITLE_EN;
// 70 is about 1.5× the previous 46-point download button, so the two-line title stays readable.
var DOWNLOAD_BUTTON_HEIGHT = 70;
var STATUS_TITLE = '当前状态： / Current status:';
var OPEN_GITHUB_TITLE = '打开 GitHub 页面 / Open GitHub';
var MODS_PLACEHOLDER = '已下载的 Mac 联机 Mod 文件夹 / Downloaded Mac co-op Mod folder';

// 不用 attributedTitle 的段落对齐。arm64 上按名字取出的
// NSTextAlignmentCenter 仍是旧值 2，而当前 AppKit 把 2 当成右对齐，
// 标题会从按钮中部往右画，末尾被裁掉，左边一大块是空的。
// 这里把文字按测得的宽高画进一张和按钮一样大的透明图，几何居中，
// 再作为 NSImageOnly 交给按钮。不写 NSTextAlignment。
// Do not center with an attributed paragraph style. On arm64 the named
// NSTextAlignmentCenter constant is still the legacy value 2, and AppKit
// treats 2 as right alignment, so the title starts mid-button and the tail
// is clipped. Draw the title into a transparent image the size of the button,
// centered by measured width and height, and show that image with NSImageOnly.
function makeCenteredTitleImage(title, font, color, width, height) {
  var image = objc($.NSImage.alloc).initWithSize($.NSMakeSize(width, height));
  try { image.setTemplate(false); } catch (e0) {}
  var locked = false;
  try {
    objc(image.lockFocus);
    locked = true;
    var ns = objc($.NSString.alloc).initWithString($(String(title)));
    var attrs = objc($.NSMutableDictionary.alloc).init;
    if (font) attrs.setObjectForKey(font, $.NSFontAttributeName);
    if (color) attrs.setObjectForKey(color, $.NSForegroundColorAttributeName);
    var measured = measureText(title, font);
    var tw = measured.width > 0 ? measured.width : width;
    var th = measured.height > 0 ? measured.height : PREPARE_TITLE_SIZE + 4;
    var x = Math.round((width - tw) / 2);
    var y = Math.round((height - th) / 2);
    ns.drawAtPointWithAttributes($.NSMakePoint(x, y), attrs);
  } catch (e1) {
    if (locked && image) {
      try { objc(image.unlockFocus); } catch (eUnlock) {}
      locked = false;
    }
    image = null;
  }
  if (locked && image) {
    try { objc(image.unlockFocus); } catch (e2) {}
  }
  return image;
}

function stylePrimaryTitle(button) {
  if (!button) return;
  var font = $.NSFont.boldSystemFontOfSize(PREPARE_TITLE_SIZE);
  var bounds = viewSize(button, 460, 34);
  var image = null;
  try {
    image = makeCenteredTitleImage(
      PREPARE_BUTTON_TITLE,
      font,
      $.NSColor.whiteColor,
      bounds.width,
      bounds.height
    );
  } catch (e0) {
    image = null;
  }
  try { button.setAttributedTitle(objc($.NSAttributedString.alloc).initWithString($(''))); } catch (e1) {}
  if (!image) {
    try { button.setTitle($(PREPARE_BUTTON_TITLE)); } catch (e2) {}
    return;
  }
  try { button.setTitle($('')); } catch (e3) {}
  try { image.setTemplate(false); } catch (e4) {}
  try { button.setImage(image); } catch (e5) {}
  var only = imagePositionOnly();
  var fit = imageScaleFit();
  try { button.setImagePosition(only); } catch (e6) {}
  try { button.setImageScaling(fit); } catch (e7) {}
  try {
    var cell = objc(button.cell);
    cell.setImagePosition(only);
    cell.setImageScaling(fit);
    cell.setBordered(false);
  } catch (e8) {}
  try { button.setAccessibilityLabel($(PREPARE_BUTTON_TITLE)); } catch (e9) {}
}

function paintPrepareButton(enabled) {
  var r = enabled ? 0.10 : 0.45;
  var g = enabled ? 0.38 : 0.49;
  var b = enabled ? 0.78 : 0.54;
  if (prepareFill) {
    try { prepareFill.setFillColor(rgb(r, g, b)); } catch (e) {}
  }
  if (!prepareButton) return;
  paintLayer(prepareButton, r, g, b, 6);
  stylePrimaryTitle(prepareButton);
}

function makeStackedTitleImage(lines, font, color, width, height) {
  var image = objc($.NSImage.alloc).initWithSize($.NSMakeSize(width, height));
  try { image.setTemplate(false); } catch (e0) {}
  var locked = false;
  try {
    objc(image.lockFocus);
    locked = true;
    var attrs = objc($.NSMutableDictionary.alloc).init;
    if (font) attrs.setObjectForKey(font, $.NSFontAttributeName);
    if (color) attrs.setObjectForKey(color, $.NSForegroundColorAttributeName);
    var measures = [];
    var block = 0;
    var gap = 2;
    var i;
    for (i = 0; i < lines.length; i++) {
      var measured = measureText(lines[i], font);
      var h = measured.height > 0 ? measured.height : 16;
      measures.push({ text: lines[i], width: measured.width, height: h });
      block += h;
      if (i > 0) block += gap;
    }
    var y = Math.round((height - block) / 2);
    if (y < 0) y = 0;
    for (i = lines.length - 1; i >= 0; i--) {
      var item = measures[i];
      var ns = objc($.NSString.alloc).initWithString($(String(item.text)));
      var x = Math.round((width - (item.width > 0 ? item.width : 0)) / 2);
      if (x < 6) x = 6;
      ns.drawAtPointWithAttributes($.NSMakePoint(x, y), attrs);
      y += item.height + gap;
    }
  } catch (e1) {
    if (locked && image) {
      try { objc(image.unlockFocus); } catch (eUnlock) {}
      locked = false;
    }
    image = null;
  }
  if (locked && image) {
    try { objc(image.unlockFocus); } catch (e2) {}
  }
  return image;
}

function applyImageOnly(button, image, label) {
  try { image.setTemplate(false); } catch (e0) {}
  try { button.setTitle($('')); } catch (e1) {}
  try { button.setImage(image); } catch (e2) {}
  var only = imagePositionOnly();
  var fit = imageScaleFit();
  try { button.setImagePosition(only); } catch (e3) {}
  try { button.setImageScaling(fit); } catch (e4) {}
  try {
    var cell = objc(button.cell);
    cell.setImagePosition(only);
    cell.setImageScaling(fit);
  } catch (e5) {}
  try { button.setAccessibilityLabel($(label)); } catch (e6) {}
  try { button.setToolTip($(label)); } catch (e7) {}
}

function styleDownloadButton(button) {
  if (!button) return;
  var bounds = viewSize(button, 900, DOWNLOAD_BUTTON_HEIGHT);
  var fontSize = 14;
  var font = $.NSFont.systemFontOfSize(fontSize);
  var maxW = bounds.width > 40 ? bounds.width - 24 : 800;
  var enW = measureText(DOWNLOAD_MOD_TITLE_EN, font).width;
  var zhW = measureText(DOWNLOAD_MOD_TITLE_ZH, font).width;
  if (enW > maxW || zhW > maxW) {
    fontSize = 13;
    font = $.NSFont.systemFontOfSize(fontSize);
  }
  var color = $.NSColor.blackColor;
  var image = null;
  try {
    image = makeStackedTitleImage(
      [DOWNLOAD_MOD_TITLE_ZH, DOWNLOAD_MOD_TITLE_EN],
      font,
      color,
      bounds.width,
      bounds.height
    );
  } catch (e2) {
    image = null;
  }
  try { button.setToolTip($(DOWNLOAD_MOD_TITLE)); } catch (e3) {}
  if (!image) {
    try { button.setTitle($(DOWNLOAD_MOD_TITLE)); } catch (e4) {}
    return;
  }
  applyImageOnly(button, image, DOWNLOAD_MOD_TITLE);
}

function styleChromeButton(button) {
  if (!button) return;
  var r = 0.69;
  var g = 0.86;
  var b = 0.76;
  var fill = rgb(r, g, b);
  try { button.setBordered(false); } catch (e0) {}
  try {
    var cell = objc(button.cell);
    cell.setBordered(false);
    cell.setBackgroundColor(fill);
  } catch (e1) {}
  paintLayer(button, r, g, b, 6);
  try { button.setBezelColor(fill); } catch (e2) {}
}

function styleLogPanel(scroll, textView) {
  var bg = rgb(0.93, 0.95, 0.98);
  try { scroll.setDrawsBackground(true); } catch (e0) {}
  try { scroll.setBackgroundColor(bg); } catch (e1) {}
  try { textView.setDrawsBackground(true); } catch (e2) {}
  try { textView.setBackgroundColor(bg); } catch (e3) {}
  try { textView.setInsertionPointColor($.NSColor.textColor); } catch (e4) {}
  paintLayer(scroll, 0.93, 0.95, 0.98, 6);
}

function makeLabel(text, x, y, w, h, size, bold) {
  var label = objc($.NSTextField.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  label.setStringValue($(text));
  label.setBezeled(false);
  label.setDrawsBackground(false);
  label.setEditable(false);
  label.setSelectable(false);
  if (bold) label.setFont($.NSFont.boldSystemFontOfSize(size));
  else label.setFont($.NSFont.systemFontOfSize(size));
  return label;
}

function makeWrappingLabel(text, x, y, w, h, size) {
  var label = makeLabel(text, x, y, w, h, size, false);
  label.setUsesSingleLineMode(false);
  try {
    var cell = objc(label.cell);
    cell.setWraps(true);
    cell.setScrollable(false);
  } catch (e) {}
  return label;
}

function makeField(value, x, y, w, h) {
  var field = objc($.NSTextField.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  field.setStringValue($(value));
  field.setBezeled(true);
  field.setEditable(true);
  field.setSelectable(true);
  field.setFont($.NSFont.systemFontOfSize(12));
  return field;
}

function makeButton(title, x, y, w, h, action, fontSize) {
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setTitle($(title));
  button.setBezelStyle(1);
  button.setFont($.NSFont.systemFontOfSize(fontSize || 13));
  button.setTarget(controller);
  button.setAction(action);
  try { button.setToolTip($(title)); } catch (eTip) {}
  return button;
}

function makePrimaryButton(title, x, y, w, h, action) {
  var fill = null;
  try {
    fill = objc($.NSBox.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
    fill.setTitle($(''));
    fill.setTitlePosition(0);
    fill.setBoxType(4);
    fill.setBorderType(0);
    fill.setBorderWidth(0);
    fill.setCornerRadius(6);
    fill.setFillColor(rgb(0.10, 0.38, 0.78));
    fill.setTransparent(false);
  } catch (e) {
    fill = null;
  }
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setTitle($(title));
  button.setFont($.NSFont.boldSystemFontOfSize(PREPARE_TITLE_SIZE));
  button.setBordered(false);
  button.setTarget(controller);
  button.setAction(action);
  try { button.setKeyEquivalent($('\r')); } catch (e2) {}
  try { button.setFocusRingType(1); } catch (e3) {}
  try {
    var cell = objc(button.cell);
    cell.setBordered(false);
    cell.setBackgroundColor(objc($.NSColor.clearColor));
  } catch (e4) {}
  stylePrimaryTitle(button);
  try { button.setBezelColor(rgb(0.10, 0.38, 0.78)); } catch (e6) {}
  return { fill: fill, button: button };
}

function registerController() {
  ObjC.registerSubclass({
    name: 'DuckovCoopPrepareController',
    superclass: 'NSObject',
    methods: {
      'prepare:': {
        types: ['void', ['id']],
        implementation: function () { guard(onPrepare); }
      },
      'downloadMod:': {
        types: ['void', ['id']],
        implementation: function () { guard(onDownload); }
      },
      'openReleases:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenReleases); }
      },
      'chooseSource:': {
        types: ['void', ['id']],
        implementation: function () { guard(onChooseSource); }
      },
      'chooseDest:': {
        types: ['void', ['id']],
        implementation: function () { guard(onChooseDest); }
      },
      'chooseMods:': {
        types: ['void', ['id']],
        implementation: function () { guard(onChooseMods); }
      },
      'clearMods:': {
        types: ['void', ['id']],
        implementation: function () { guard(onClearMods); }
      },
      'openSource:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onRevealField(sourceField, 'source'); }); }
      },
      'openDest:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onRevealField(destField, 'dest'); }); }
      },
      'openMods:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onRevealField(modsField, 'mods'); }); }
      },
      'openOriginalConfig:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenOriginalConfig); }
      },
      'openCoopConfig:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenCoopConfig); }
      },
      'syncOriginalToCoop:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onSync('1to2'); }); }
      },
      'syncCoopToOriginal:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onSync('2to1'); }); }
      },
      'poll:': {
        types: ['void', ['id']],
        implementation: function (timer) { onPoll(timer); }
      },
      'windowShouldClose:': {
        types: ['bool', ['id']],
        implementation: function () { return onWindowShouldClose(); }
      },
      'windowWillClose:': {
        types: ['void', ['id']],
        implementation: function () { onWindowWillClose(); }
      },
      'applicationShouldTerminateAfterLastWindowClosed:': {
        types: ['bool', ['id']],
        implementation: function () { return true; }
      }
    }
  });
}

function makeSectionBox(x, y, w, h, fillR, fillG, fillB, borderR, borderG, borderB) {
  var box = objc($.NSBox.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  try { box.setTitle($('')); } catch (e0) {}
  try { box.setTitlePosition(0); } catch (e1) {}
  try { box.setBoxType(4); } catch (e2) {}
  try { box.setBorderType(1); } catch (e3) {}
  try { box.setBorderWidth(1.5); } catch (e4) {}
  try { box.setCornerRadius(8); } catch (e5) {}
  try { box.setFillColor(rgb(fillR, fillG, fillB)); } catch (e6) {}
  try { box.setBorderColor(rgb(borderR, borderG, borderB)); } catch (e7) {}
  try { box.setTransparent(false); } catch (e8) {}
  return box;
}

// -1 is NSWindowBelow on every ABI. Do not use a named AppKit alignment constant here.
function addBoxBehind(parent, box) {
  try {
    parent.addSubviewPositionedRelativeTo(box, -1, null);
    return;
  } catch (e1) {}
  try {
    var subs = objc(parent.subviews);
    var first = subs && subs.objectAtIndex ? subs.objectAtIndex(0) : null;
    if (first) {
      parent.addSubviewPositionedRelativeTo(box, -1, first);
      return;
    }
  } catch (e2) {}
  parent.addSubview(box);
}

function guideTextFor(s1, s2, s3, sourceMissing) {
  if (!s1 && !s2 && !s3) {
    if (sourceMissing) {
      return '下一步：先做第一步。点「选择…」指定已经安装的原版 Duckov.app，确认副本保存位置，再点蓝色「准备联机副本」。\n'
        + 'Next: start with Step 1. Click Choose and select the installed Duckov.app, confirm where to save the copy, then click the blue Prepare co-op copy button.';
    }
    return '下一步：从第一步开始。确认原版游戏和副本保存位置，然后点蓝色「准备联机副本」。原版游戏不会被修改。\n'
      + 'Next: start with Step 1. Confirm the original game and where to save the copy, then click the blue Prepare co-op copy button. The original game is not modified.';
  }
  if (!s1 && s2 && !s3) {
    return '配置文件夹看起来已经对齐。下一步仍请先做第一步：准备联机副本。\n'
      + 'The config folders already look aligned. Next, still start with Step 1: prepare the co-op copy.';
  }
  if (!s1) {
    return '下一步：先做第一步，准备联机副本。原版游戏不会被修改。\n'
      + 'Next: start with Step 1 and prepare the co-op copy. The original game is not modified.';
  }
  if (!s2 && !s3) {
    return '第一步已完成，副本已经准备好。下一步：做第二步，把原版配置（包括存档）同步到副本；再做第三步，安装支持 Mac 的联机 Mod。\n'
      + 'Step 1 is done and the co-op copy is ready. Next: do Step 2 to sync the original config (including saves) into the copy, then Step 3 to install the Mac-compatible co-op Mod.';
  }
  if (s2 && !s3) {
    return '第一步和第二步已完成。下一步：做第三步。点下载按钮，或选择已经下载的支持 Mac 的联机 Mod，它会放进副本。\n'
      + 'Steps 1 and 2 are done. Next: do Step 3. Click the download button, or choose the Mac-compatible co-op Mod you already downloaded. It goes into the copy.';
  }
  if (!s2 && s3) {
    return '副本和联机 Mod 已就绪。若要把原版存档带到副本，请做第二步：同步原版配置（包括存档）。同步前请退出两边的游戏。\n'
      + 'The copy and the co-op Mod are ready. To bring original saves into the copy, do Step 2: sync the original config (including saves). Quit both games before syncing.';
  }
  return '三步都已完成。请只启动副本进行联机。一起玩的人需要使用同一个 Mod 版本。\n'
    + 'All three steps are done. Launch only the co-op copy for co-op. Everyone you play with needs the same Mod version.';
}

function guideStatusText() {
  var source = '';
  try { source = normalize(fieldText(sourceField)); } catch (e) { source = ''; }
  var sourceMissing = !source || !fileExists(source);
  return guideTextFor(!!stepDone[1], !!stepDone[2], !!stepDone[3], sourceMissing);
}

function paintStepTitle(label, base, done) {
  if (!label) return;
  var text = done ? (base + ' ✅') : base;
  try { label.setStringValue($(text)); } catch (e0) {}
  try { label.setTextColor(done ? rgb(0.0, 0.45, 0.18) : rgb(0.08, 0.27, 0.48)); } catch (e1) {}
}

function paintStepHeaders() {
  paintStepTitle(step1TitleLabel, STEP1_TITLE, stepDone[1]);
  paintStepTitle(step2TitleLabel, STEP2_TITLE, stepDone[2]);
  paintStepTitle(step3TitleLabel, STEP3_TITLE, stepDone[3]);
}

function refreshGuide() {
  paintStepHeaders();
  var all = !!(stepDone[1] && stepDone[2] && stepDone[3]);
  setStatus(guideStatusText(), all ? true : null);
}

function markStep(n) {
  if (n >= 1 && n <= 3) stepDone[n] = true;
  refreshGuide();
}

function normalizeVersionLabel(text) {
  var value = trim(String(text || '')).toLowerCase();
  if (value === '-' || value === '?' || value === 'unknown') return '';
  if (value.charAt(0) === 'v') value = value.substring(1);
  return value;
}

function versionsEqual(a, b) {
  var left = normalizeVersionLabel(a);
  var right = normalizeVersionLabel(b);
  return !!left && left === right;
}

function listCoopMods(which, path) {
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!script || !fileExists(script) || !path) return [];
  var args = ['/bin/bash', script, '--list-coop-mods'];
  if (which === 'dest') args.push('--dest', path);
  else args.push('--mods-dir', path);
  var result = null;
  try { result = runSync(args); } catch (e) { return []; }
  if (!result || result.code !== 0) return [];
  var lines = String(result.stdout || '').split('\n');
  var out = [];
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('COOP_MOD\t') !== 0) continue;
    var parts = lines[i].split('\t');
    if (parts.length < 3) continue;
    out.push({ version: parts[1], path: parts.slice(2).join('\t') });
  }
  return out;
}

function folderHasVersion(path, version) {
  if (!path || !version || !fileExists(path)) return false;
  var found = listCoopMods('mods', path);
  var i;
  for (i = 0; i < found.length; i++) {
    if (versionsEqual(found[i].version, version)) return true;
  }
  return false;
}

function startDedupe(version) {
  if (quitting) return;
  var source = normalize(fieldText(sourceField));
  var dest = normalize(fieldText(destField));
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!fileExists(script)) {
    setBusy(false);
    showAlert(
      '找不到准备脚本 / Prepare script is missing',
      '请重新下载 DuckovCoopPrepare-mac.zip。\nDownload DuckovCoopPrepare-mac.zip again.\n\n' + script
    );
    return;
  }
  setBusy(true);
  setStatus('副本里已有这个版本。正在去掉重复的旧联机 Mod… / This version is already in the copy. Removing duplicate older co-op Mod folders…', null);
  var argv = ['/bin/bash', script, '--dedupe-coop-mods', '--dest', dest, '--keep-version', version];
  if (source) argv.push('--source', source);
  var header = [
    '',
    '副本里已有这个版本，跳过下载，只去掉重复的旧联机 Mod。',
    'This version is already in the copy. Skipping the download and removing duplicate older co-op Mod folders.',
    '版本 / Version: ' + version,
    '副本 / Copy: ' + dest,
    '命令 / Command: ' + previewArgs(argv),
    ''
  ].join('\n');
  startTask(argv, 'install-mod', header, false);
}

function directoryNames(path) {
  if (!path || !fileExists(path)) return null;
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var names = fm.contentsOfDirectoryAtPathError($(String(path)), null);
    if (!names) return null;
    var raw = ObjC.deepUnwrap(names);
    if (!raw || typeof raw.length !== 'number') return null;
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var name = String(raw[i]);
      if (!name || name === '.DS_Store') continue;
      out.push(name);
    }
    out.sort();
    return out;
  } catch (e) {
    return null;
  }
}

function configsLookSynced() {
  var left = directoryNames(originalConfigDir());
  var right = directoryNames(coopConfigDir());
  if (!left || !right) return false;
  if (left.length === 0 || left.length !== right.length) return false;
  var sawSaves = false;
  var i;
  for (i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
    if (left[i] === 'Saves') sawSaves = true;
  }
  return sawSaves;
}

function copyLooksPrepared() {
  var dest = normalize(fieldText(destField));
  var source = normalize(fieldText(sourceField));
  if (!dest || !endsWithApp(dest)) return false;
  if (!fileExists(joinPath(dest, 'Contents/Info.plist'))) return false;
  if (source && dest.toLowerCase() === source.toLowerCase()) return false;
  return true;
}

function detectExistingProgress() {
  try {
    if (copyLooksPrepared()) stepDone[1] = true;
    if (configsLookSynced()) stepDone[2] = true;
    if (stepDone[1]) {
      var found = listCoopMods('dest', normalize(fieldText(destField)));
      if (found.length > 0) stepDone[3] = true;
    }
  } catch (e) {}
}

function buildInterface(app) {
  var windowWidth = 960;
  var outer = 12;
  var boxPadX = 8;
  var boxPadTop = 8;
  var boxPadBottom = 8;
  var boxGap = 8;
  var contentX = outer + boxPadX;
  var contentW = windowWidth - (outer * 2) - (boxPadX * 2);
  var boxX = outer;
  var boxW = windowWidth - outer * 2;

  var topInset = 8;
  var bottomInset = 10;
  var githubH = 28;
  var githubGap = 8;
  var headerGap = 4;
  var helpGap = 6;
  var captionZhH = 20;
  var captionZhGap = 1;
  var captionEnH = 16;
  var captionEnGap = 2;
  var pathRowH = 30;
  var pathRowGap = 4;
  var prepareH = 34;
  var prepareW = 460;
  var prepareTopGap = 6;
  var explainGap = 6;
  var configBtnH = 30;
  var configBtnGapY = 6;
  var fieldGap = 6;
  var downloadH = DOWNLOAD_BUTTON_HEIGHT;
  var progressH = 16;
  var progressGap = 4;
  var logH = 96;

  var fontStep = $.NSFont.boldSystemFontOfSize(16);
  var fontHelp = $.NSFont.systemFontOfSize(12);
  var fontExplain = $.NSFont.systemFontOfSize(11);
  var fontStatus = $.NSFont.systemFontOfSize(12);
  var explainText = configExplanation();
  var step1TitleMeasure = STEP1_TITLE + ' ✅';
  var step2TitleMeasure = STEP2_TITLE + ' ✅';
  var step3TitleMeasure = STEP3_TITLE + ' ✅';
  var step1HeaderH = measureWrappedHeight(step1TitleMeasure, contentW, fontStep, 20);
  var step1HelpH = measureWrappedHeight(STEP1_HELP, contentW, fontHelp, 16);
  var step2HeaderH = measureWrappedHeight(step2TitleMeasure, contentW, fontStep, 20);
  var explainH = measureWrappedHeight(explainText, contentW, fontExplain, 14);
  var step3HeaderH = measureWrappedHeight(step3TitleMeasure, contentW, fontStep, 20);
  var step3HelpH = measureWrappedHeight(STEP3_HELP, contentW, fontHelp, 16);
  if (step1HeaderH > 64) step1HeaderH = 64;
  if (step1HelpH > 72) step1HelpH = 72;
  if (step2HeaderH > 64) step2HeaderH = 64;
  if (explainH > 120) explainH = 120;
  if (step3HeaderH > 80) step3HeaderH = 80;
  if (step3HelpH > 88) step3HelpH = 88;

  var statusSamples = [
    guideTextFor(false, false, false, true),
    guideTextFor(false, false, false, false),
    guideTextFor(false, true, false, false),
    guideTextFor(false, false, true, false),
    guideTextFor(false, true, true, false),
    guideTextFor(true, false, false, false),
    guideTextFor(true, true, false, false),
    guideTextFor(true, false, true, false),
    guideTextFor(true, true, true, false)
  ];
  var statusTitleH = 22;
  var statusBodyH = 44;
  var sampleIndex;
  for (sampleIndex = 0; sampleIndex < statusSamples.length; sampleIndex++) {
    var sampleH = measureWrappedHeight(statusSamples[sampleIndex], contentW, fontStatus, 16);
    if (sampleH > statusBodyH) statusBodyH = sampleH;
  }
  if (statusBodyH > 80) statusBodyH = 80;

  var pathGroup = captionZhH + captionZhGap + captionEnH + captionEnGap + pathRowH;
  var windowHeight = topInset
    + githubH + githubGap
    + boxPadTop + statusTitleH + 4 + statusBodyH + boxPadBottom + boxGap
    + boxPadTop + step1HeaderH + headerGap + step1HelpH + helpGap + pathGroup + pathRowGap + pathGroup + prepareTopGap + prepareH + boxPadBottom + boxGap
    + boxPadTop + step2HeaderH + headerGap + explainH + explainGap + configBtnH + configBtnGapY + configBtnH + boxPadBottom + boxGap
    + boxPadTop + step3HeaderH + headerGap + step3HelpH + helpGap + pathRowH + fieldGap + downloadH + boxPadBottom + boxGap
    + progressH + progressGap
    + logH
    + bottomInset;

  var cursor = topInset;
  function row(h, gap) {
    var y = windowHeight - cursor - h;
    cursor += h + gap;
    return y;
  }

  var sectionStart = 0;
  function beginSection() {
    sectionStart = cursor;
    cursor += boxPadTop;
  }
  function endSection(fillR, fillG, fillB, borderR, borderG, borderB) {
    cursor += boxPadBottom;
    var height = cursor - sectionStart;
    var y = windowHeight - cursor;
    var box = makeSectionBox(boxX, y, boxW, height, fillR, fillG, fillB, borderR, borderG, borderB);
    addBoxBehind(content, box);
    cursor += boxGap;
    return box;
  }

  mainWindow = objc($.NSWindow.alloc).initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, windowWidth, windowHeight),
    7,
    2,
    false
  );
  mainWindow.setTitle($(WINDOW_TITLE));
  mainWindow.setDelegate(controller);
  mainWindow.setReleasedWhenClosed(false);
  var content = objc(mainWindow.contentView);
  var stepColor = rgb(0.08, 0.27, 0.48);
  var statusColor = rgb(0.07, 0.34, 0.72);

  function addText(text, h, gap, size, bold, color, selectable) {
    var y = row(h, gap);
    var label = makeWrappingLabel(text, contentX, y, contentW, h, size);
    if (bold) label.setFont($.NSFont.boldSystemFontOfSize(size));
    if (color) {
      try { label.setTextColor(color); } catch (eColor) {}
    }
    if (selectable) {
      try { label.setSelectable(true); } catch (eSelect) {}
    }
    content.addSubview(label);
    return label;
  }

  var githubW = 268;
  var githubY = row(githubH, githubGap);
  releasesButton = makeButton(
    OPEN_GITHUB_TITLE,
    boxX + boxW - githubW,
    githubY,
    githubW,
    githubH,
    'openReleases:',
    13
  );
  content.addSubview(releasesButton);
  styleChromeButton(releasesButton);

  beginSection();
  addText(STATUS_TITLE, statusTitleH, 4, 15, true, statusColor, false);
  statusField = addText('', statusBodyH, 0, 12, false, null, false);
  endSection(0.90, 0.95, 0.99, 0.32, 0.50, 0.70);

  beginSection();
  step1TitleLabel = addText(STEP1_TITLE, step1HeaderH, headerGap, 16, true, stepColor, false);
  var step1HelpLabel = addText(STEP1_HELP, step1HelpH, helpGap, 12, false, null, false);
  try { step1HelpLabel.setTextColor(secondaryTextColor()); } catch (eHelp1) {}

  var pathOpenW = 108;
  var pathChooseW = 148;
  var pathGap = 8;
  function placePathRow(fieldValue, y, openAction, chooseAction) {
    var fieldW = contentW - pathOpenW - pathChooseW - pathGap * 2;
    var field = makeField(fieldValue, contentX, y + 2, fieldW, 26);
    var openButton = makeButton('打开 / Open', contentX + fieldW + pathGap, y, pathOpenW, 30, openAction);
    var chooseButton = makeButton('选择… / Choose…', contentX + fieldW + pathGap + pathOpenW + pathGap, y, pathChooseW, 30, chooseAction);
    content.addSubview(field);
    content.addSubview(openButton);
    content.addSubview(chooseButton);
    return { field: field, openButton: openButton, chooseButton: chooseButton };
  }

  addText(
    '指定原版游戏 App 的位置（现有已经安装的游戏位置可在 steam 里查看）',
    captionZhH, captionZhGap, 13, true, null, false
  );
  var sourceEnglish = addText(
    'Pick the installed Duckov.app. Steam can show the install path.',
    captionEnH, captionEnGap, 12, false, null, false
  );
  try { sourceEnglish.setTextColor(secondaryTextColor()); } catch (eSource) {}
  var sourceRow = placePathRow('/Applications/Duckov.app', row(pathRowH, pathRowGap), 'openSource:', 'chooseSource:');
  sourceField = sourceRow.field;
  openSourceButton = sourceRow.openButton;
  chooseSourceButton = sourceRow.chooseButton;

  addText(
    '指定要保存游戏副本的位置（今后要联机则打开这个副本游戏）',
    captionZhH, captionZhGap, 13, true, null, false
  );
  var destEnglish = addText(
    'Where the co-op copy is saved. Launch this copy for co-op.',
    captionEnH, captionEnGap, 12, false, null, false
  );
  try { destEnglish.setTextColor(secondaryTextColor()); } catch (eDest) {}
  var destRow = placePathRow(
    joinPath(homeDir(), 'Applications/Duckov-COOP.app'),
    row(pathRowH, prepareTopGap),
    'openDest:',
    'chooseDest:'
  );
  destField = destRow.field;
  openDestButton = destRow.openButton;
  chooseDestButton = destRow.chooseButton;

  var prepareX = contentX + Math.round((contentW - prepareW) / 2);
  var prepareY = row(prepareH, 0);
  var primary = makePrimaryButton(
    PREPARE_BUTTON_TITLE,
    prepareX, prepareY, prepareW, prepareH, 'prepare:'
  );
  prepareFill = primary.fill;
  prepareButton = primary.button;
  if (prepareFill) content.addSubview(prepareFill);
  content.addSubview(prepareButton);
  paintPrepareButton(true);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  beginSection();
  step2TitleLabel = addText(STEP2_TITLE, step2HeaderH, headerGap, 16, true, stepColor, false);
  var explain = addText(explainText, explainH, explainGap, 11, false, null, true);
  try { explain.setFont($.NSFont.systemFontOfSize(11)); } catch (eExplainFont) {}
  var configBtnGap = 8;
  var configBtnW = Math.floor((contentW - configBtnGap) / 2);
  var openConfigY = row(configBtnH, configBtnGapY);
  openOriginalConfigButton = makeButton(
    '打开原版配置位置 / Open original config folder',
    contentX, openConfigY, configBtnW, configBtnH, 'openOriginalConfig:', 12
  );
  openCoopConfigButton = makeButton(
    '打开联机副本配置位置 / Open co-op config folder',
    contentX + configBtnW + configBtnGap, openConfigY, configBtnW, configBtnH, 'openCoopConfig:', 12
  );
  var syncConfigY = row(configBtnH, 0);
  syncToCoopButton = makeButton(
    SYNC_TO_COOP_TITLE,
    contentX, syncConfigY, configBtnW, configBtnH, 'syncOriginalToCoop:', 11
  );
  syncToOriginalButton = makeButton(
    SYNC_TO_ORIGINAL_TITLE,
    contentX + configBtnW + configBtnGap, syncConfigY, configBtnW, configBtnH, 'syncCoopToOriginal:', 11
  );
  content.addSubview(openOriginalConfigButton);
  content.addSubview(openCoopConfigButton);
  content.addSubview(syncToCoopButton);
  content.addSubview(syncToOriginalButton);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  beginSection();
  step3TitleLabel = addText(STEP3_TITLE, step3HeaderH, headerGap, 16, true, stepColor, false);
  var step3HelpLabel = addText(STEP3_HELP, step3HelpH, helpGap, 12, false, null, false);
  try { step3HelpLabel.setTextColor(secondaryTextColor()); } catch (eHelp3) {}

  var modsOpenW = 100;
  var modsChooseW = 148;
  var modsClearW = 108;
  var modsGap = 8;
  var modsRowY = row(pathRowH, fieldGap);
  var modsFieldW = contentW - modsOpenW - modsChooseW - modsClearW - modsGap * 3;
  modsField = makeField('', contentX, modsRowY + 2, modsFieldW, 26);
  try { modsField.setPlaceholderString($(MODS_PLACEHOLDER)); } catch (eMods) {}
  openModsButton = makeButton('打开 / Open', contentX + modsFieldW + modsGap, modsRowY, modsOpenW, 30, 'openMods:');
  chooseModsButton = makeButton('选择… / Choose…', contentX + modsFieldW + modsGap + modsOpenW + modsGap, modsRowY, modsChooseW, 30, 'chooseMods:');
  clearModsButton = makeButton('清除 / Clear', contentX + modsFieldW + modsGap + modsOpenW + modsGap + modsChooseW + modsGap, modsRowY, modsClearW, 30, 'clearMods:');
  content.addSubview(modsField);
  content.addSubview(openModsButton);
  content.addSubview(chooseModsButton);
  content.addSubview(clearModsButton);

  var downloadY = row(downloadH, 0);
  downloadButton = makeButton(DOWNLOAD_MOD_TITLE, contentX, downloadY, contentW, downloadH, 'downloadMod:', 13);
  content.addSubview(downloadButton);
  styleDownloadButton(downloadButton);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  var progressY = row(progressH, progressGap);
  var progress = makeWrappingLabel('进度 / Progress', boxX, progressY, boxW, progressH, 13);
  content.addSubview(progress);

  var logY = row(logH, 0);
  var scroll = objc($.NSScrollView.alloc).initWithFrame($.NSMakeRect(boxX, logY, boxW, logH));
  scroll.setHasVerticalScroller(true);
  scroll.setAutohidesScrollers(true);
  scroll.setBorderType(1);
  logView = objc($.NSTextView.alloc).initWithFrame($.NSMakeRect(0, 0, boxW - 20, logH));
  logView.setEditable(false);
  logView.setSelectable(true);
  logView.setRichText(false);
  logView.setFont($.NSFont.userFixedPitchFontOfSize(11));
  logView.setHorizontallyResizable(false);
  logView.setVerticallyResizable(true);
  try {
    var container = objc(logView.textContainer);
    container.setWidthTracksTextView(true);
    container.setContainerSize($.NSMakeSize(boxW - 16, 1000000));
  } catch (e2) {}
  scroll.setDocumentView(logView);
  styleLogPanel(scroll, logView);
  content.addSubview(scroll);

  detectExistingProgress();
  refreshGuide();
  replaceLog(introText());
  objc(mainWindow.center);
  mainWindow.makeKeyAndOrderFront(app);
  app.activateIgnoringOtherApps(true);
  paintPrepareButton(true);
}
function startApp() {
  var env = runtimeEnv();
  resources = env.DUCKOV_COOP_PREPARE_RESOURCES || '';
  if (!resources) {
    throw new Error('缺少资源目录。请双击 DuckovCoopPrepare.app 打开。\nThe resource folder is missing. Open DuckovCoopPrepare.app by double-clicking it.');
  }
  logPath = chooseLogPath();
  resultPath = joinPath(tempDir(), 'duckov-coop-mods-dir.txt');
  try {
    shared = loadShared(resources);
  } catch (error) {
    shared = null;
    matcherError = String(error);
  }
  registerController();
  var app = objc($.NSApplication.sharedApplication);
  app.setActivationPolicy(0);
  try { objc($.NSProcessInfo.processInfo).setProcessName($(WINDOW_TITLE)); } catch (e) {}
  installMenu(app);
  controller = objc(objc($.DuckovCoopPrepareController.alloc).init);
  app.setDelegate(controller);
  buildInterface(app);
  objc(app.run);
}

function main() {
  try {
    startApp();
  } catch (error) {
    try {
      var alert = objc(objc($.NSAlert.alloc).init);
      alert.setMessageText($('无法打开 / Could not open'));
      alert.setInformativeText($(String(error) + (error && error.stack ? '\n' + error.stack : '')));
      alert.addButtonWithTitle($('好 / OK'));
      objc(alert.runModal);
    } catch (e2) {
      throw error;
    }
  }
}

main();
