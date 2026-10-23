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
  if (index < 0 || index >= titles.length) return 0;
  return index;
}

function showPrepareDoneAlert() {
  var dest = fieldText(destField);
  var info = [
    '副本已准备好。请只启动这份副本进行联机。不要把 Mods 放进原版 App。',
    '各方的 ModVersion 必须完全一致。',
    '',
    'The co-op copy is ready. Launch only this copy for co-op. Do not put Mods in the original app.',
    'Every peer must use the exact same ModVersion string.',
    '',
    dest,
    '',
    '要现在把原版配置位置同步到联机副本配置位置吗？这和窗口里的「（同步文件）原版配置 → 联机副本」是同一次操作：用来源镜像覆盖目标，并删除目标里多出来的文件。',
    '请先完全退出原版 Duckov 和联机副本。',
    'Sync the original config folder onto the co-op config folder now? This is the same action as "(sync files) original → co-op": it mirrors the source onto the destination and deletes files that exist only there.',
    'Quit the original Duckov app and the co-op copy first.'
  ].join('\n');
  var choice = showChoices('完成 / Done', info, [
    '好 / OK',
    '立即同步 / Sync now',
    '不同步 / Don\'t sync'
  ]);
  if (choice === 1) onSync('1to2', true);
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
    text + '\nexports.selectCoopModAsset = selectCoopModAsset;\nexports.safeReleaseDownloadUrl = safeReleaseDownloadUrl;\nexports.safeModZipName = safeModZipName;\n'
  );
  runner(sandbox);
  return sandbox;
}

function introText() {
  var lines = [
    '准备联机副本 / Prepare co-op copy',
    '',
    '1. 确认原版 Duckov.app。默认 /Applications/Duckov.app。',
    '   Confirm the original Duckov.app. Default: /Applications/Duckov.app.',
    '2. 指定要保存游戏副本的位置。默认是 ~/Applications/Duckov-COOP.app。今后要联机则打开这个副本。原版不会被修改。',
    '   Choose where the co-op copy is saved. Default: ~/Applications/Duckov-COOP.app. Launch this copy for co-op. The original app is not modified.',
    '3. 可选：在「要新增加的 Mods 文件夹」选择已解压的 Mods，或点「下载最新测试 Mac 联机 Mod」。留空也可以。',
    '   Optional: choose an unzipped Mods folder, or click Download latest test Mac co-op mod. Empty is fine.',
    '4. 点击窗口最下方的「准备联机副本 / Prepare co-op copy」。复制游戏时可能需要几分钟。',
    '   Click Prepare co-op copy at the bottom of the window. Copying the game can take several minutes.',
    '5. 原版和联机副本的存档不在同一个文件夹。见窗口里的「配置与存档」。同步前请退出两边的游戏。',
    '   The original app and the co-op copy keep saves in different folders. See Config and saves in the window. Quit both games before syncing.',
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
      appendLogFile('\n已填入 Mods 路径。请再点击「准备联机副本 / Prepare co-op copy」。\nMods path filled in. Click Prepare co-op copy next.\n退出码 / Exit code: 0\n');
      setStatus('已下载最新测试 Mod。请点击「准备联机副本」。 / Latest test mod downloaded. Click Prepare co-op copy.', true);
      setBusy(false);
      showAlert(
        '已下载并解压 / Downloaded and unzipped',
        'Mods 路径已填入。下载本身还没有修改游戏。\n请再点击「准备联机副本 / Prepare co-op copy」，Mods 会在签名前装入副本。\n\nThe Mods path is filled in. The download has not modified the game.\nClick Prepare co-op copy next. Mods are copied into the co-op app before it is signed.\n\n' + mods
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
      setStatus('同步完成。 / Sync finished.', true);
      setBusy(false);
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
  if (code === 0) {
    appendLogFile('\n退出码 / Exit code: 0\n完成 / Done\n');
    setStatus('完成。副本已准备好。 / Done. The co-op copy is ready.', true);
    setBusy(false);
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
        '还没有填写 Mods 文件夹。可以点「选择… / Choose…」，或保持留空，这次准备就不装入新的 Mod。\nNo Mods folder is filled in. Click Choose, or leave it empty so this run does not install new mods.'
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
    setStatus('已取消。 / Cancelled.', null);
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
    showAlert('找不到 Mods 文件夹 / Mods folder was not found', mods);
    return;
  }
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!fileExists(script)) {
    showAlert('找不到准备脚本 / Prepare script is missing', '请重新下载 DuckovCoopPrepare-mac.zip。\nDownload DuckovCoopPrepare-mac.zip again.\n\n' + script);
    return;
  }
  var replacing = fileExists(dest);
  var modsLine = mods ? mods : '（不装入新的 Mod / No new mods）';
  var info = '将复制原版并只修改副本。原版不会被改动。\nThe original app is copied. Only the copy is modified.\n\n'
    + '原版 / Original:\n' + source + '\n\n副本 / Copy:\n' + dest + '\n\nMods:\n' + modsLine + '\n\n';
  if (replacing) {
    info += '副本已存在，将替换它，并保留其中已经装好的 Mods。\nThe copy already exists. It will be replaced. Mods already inside are kept.\n\n';
  }
  info += '复制可能需要几分钟。\nCopying can take several minutes.';
  if (!showConfirm('准备联机副本 / Prepare co-op copy', info, '开始 / Start', '取消 / Cancel')) {
    setStatus('已取消。 / Cancelled.', null);
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
    'Mods: ' + modsLine,
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
  setStatus('正在查询 Releases… / Checking Releases…', null);
  appendLogFile('正在查询最新测试 Mod… / Looking up the latest test mod…');
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
    setStatus('没有找到测试 Mod。 / No test mod was found.', false);
    appendLogFile(missing);
    showAlert('没有找到测试 Mod / No test mod was found', missing);
    return;
  }
  if (!shared.safeReleaseDownloadUrl(asset.url) || !shared.safeModZipName(asset.name)) {
    setBusy(false);
    setStatus('已取消下载。 / Download cancelled.', null);
    showAlert('已取消 / Cancelled', 'Release 附件地址不符合预期，已取消下载。\nThe Release asset URL was not recognized. Download cancelled.');
    return;
  }
  var folder = chooseDownloadFolder();
  var zipPath = joinPath(folder, asset.name);
  var unzipName = String(asset.name).replace(/\.zip$/i, '');
  var unzipPath = joinPath(folder, unzipName);
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

function onChooseMods() {
  if (busy) return;
  var current = normalize(fieldText(modsField));
  var start = joinPath(homeDir(), 'Downloads');
  if (current && fileExists(current)) start = current;
  var picked = chooseFolder('选择已解压的 Mods 文件夹（里面含有 .dll，或含有带 .dll 的子文件夹）。\nChoose an unzipped Mods folder (it should contain a .dll, or folders that do).', start);
  if (picked) setField(modsField, picked);
}

function onClearMods() {
  if (busy) return;
  setField(modsField, '');
  setStatus('已清除 Mods 路径。这次准备不会装入新的 Mod。 / Mods path cleared. This run will not install new mods.', null);
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

var PREPARE_BUTTON_TITLE = '准备联机副本 / Prepare co-op copy';
var PREPARE_TITLE_SIZE = 14;
var SYNC_TO_COOP_TITLE = '（同步文件）原版配置 → 联机副本 / (sync files) original → co-op';
var SYNC_TO_ORIGINAL_TITLE = '（同步文件）联机副本 → 原版配置 / (sync files) co-op → original';
var DOWNLOAD_MOD_TITLE = '下载最新测试 Mac 联机 Mod / Download latest test Mac co-op mod';
var OPEN_GITHUB_TITLE = '打开 GitHub 页面 / Open GitHub';
var MODS_FIELD_LABEL = '要新增加的 Mods 文件夹（可选）';
var MODS_FIELD_ENGLISH = 'Extra Mods folder to add (optional)';
var MODS_FIELD_HELP = '含 .dll 的最外层文件夹会整包拷入副本 Contents/Mods/包名/；没有 .dll 的和根目录散文件不拷。留空则不装新 Mod，已有的会放回。\nCopies each outermost .dll folder whole into Contents/Mods/<name>/; skips the rest. Empty: no new mods; existing Mods are restored.';

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

function makeSectionBox(title, x, y, w, h) {
  var box = objc($.NSBox.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  box.setTitle($(title));
  box.setTitlePosition(2);
  try { box.setTitleFont($.NSFont.boldSystemFontOfSize(13)); } catch (e) {}
  try {
    box.setBoxType(4);
    box.setBorderType(1);
    box.setBorderWidth(1);
    box.setCornerRadius(8);
    var fill = objc($.NSColor.controlBackgroundColor);
    if (fill) box.setFillColor(fill);
    var border = objc($.NSColor.separatorColor);
    if (border) box.setBorderColor(border);
    box.setTransparent(false);
  } catch (e2) {
    box.setBoxType(0);
    box.setBorderType(2);
  }
  return box;
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

function buildInterface(app) {
  var windowWidth = 960;
  var margin = 20;
  var inner = windowWidth - margin * 2;
  var topInset = 10;
  var headerH = 30;
  var headerGap = 2;
  var introH = 40;
  var introGap = 4;
  var captionZhH = 20;
  var captionZhGap = 1;
  var captionEnH = 16;
  var captionEnGap = 2;
  var pathRowH = 30;
  var pathRowGap = 2;
  var modsTitleChrome = 20;
  var modsAfterTitle = 2;
  var modsLabelH = 18;
  var modsLabelGap = 1;
  var modsEnH = 16;
  var modsEnGap = 2;
  var modsHelpH = 36;
  var modsHelpGap = 4;
  var modsRowH = 30;
  var modsGap2 = 4;
  var downloadH = 30;
  var modsPadBottom = 6;
  var modsBoxH = modsTitleChrome + modsAfterTitle + modsLabelH + modsLabelGap + modsEnH + modsEnGap + modsHelpH + modsHelpGap + modsRowH + modsGap2 + downloadH + modsPadBottom;
  var modsBoxGap = 2;
  var configTitleChrome = 20;
  var configAfterTitle = 2;
  var configExplainH = 118;
  var configGapA = 4;
  var configBtnH = 32;
  var configGapB = 4;
  var configPadBottom = 4;
  var configBoxH = configTitleChrome + configAfterTitle + configExplainH + configGapA + configBtnH + configGapB + configBtnH + configPadBottom;
  var configSectionGap = 2;
  var statusH = 32;
  var statusGap = 2;
  var progressH = 16;
  var progressGap = 2;
  var prepareH = 34;
  var prepareW = 460;
  var prepareGap = 8;
  var prepareBottom = 12;
  var logH = 188;
  var pathBlock = captionZhH + captionZhGap + captionEnH + captionEnGap + pathRowH + pathRowGap;
  // 高度跟着内容走。路径行、说明区和分段空隙收紧后，窗口变矮，不再留一块空的中部。
  // Height follows the sections. Tighter path rows, explanation, and section gaps shorten the window so the middle is not an empty band.
  var aboveLog = topInset
    + headerH + headerGap
    + introH + introGap
    + pathBlock * 2
    + modsBoxH + modsBoxGap
    + configBoxH + configSectionGap
    + statusH + statusGap
    + progressH + progressGap;
  var windowHeight = aboveLog + logH + prepareGap + prepareH + prepareBottom;
  var cursor = topInset;
  function row(h, gap) {
    var y = windowHeight - cursor - h;
    cursor += h + gap;
    return y;
  }

  mainWindow = objc($.NSWindow.alloc).initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, windowWidth, windowHeight),
    7,
    2,
    false
  );
  mainWindow.setTitle($('准备联机副本 / Prepare co-op copy'));
  mainWindow.setDelegate(controller);
  mainWindow.setReleasedWhenClosed(false);
  var content = objc(mainWindow.contentView);

  var headerY = row(headerH, headerGap);
  var releasesW = 248;
  var releasesH = 28;
  var titleW = inner - releasesW - 16;
  content.addSubview(makeLabel(
    '准备联机副本 / Prepare co-op copy',
    margin, headerY + 3, titleW, 26, 18, true
  ));
  releasesButton = makeButton(
    OPEN_GITHUB_TITLE,
    margin + inner - releasesW,
    headerY + Math.round((headerH - releasesH) / 2),
    releasesW,
    releasesH,
    'openReleases:',
    13
  );
  content.addSubview(releasesButton);
  content.addSubview(makeWrappingLabel(
    '复制官方 Duckov.app，只改副本：关闭 App Sandbox，加入联网权限，并用本机 codesign 身份 "-" 重新签名。\nCopy the official Duckov.app and change only the copy: turn off App Sandbox, add network access, and re-sign with the local codesign identity "-".',
    margin, row(introH, introGap), inner, introH, 12
  ));

  var pathOpenW = 108;
  var pathChooseW = 148;
  var pathGap = 8;
  function placePathRow(fieldValue, y, openAction, chooseAction) {
    var fieldW = inner - pathOpenW - pathChooseW - pathGap * 2;
    var field = makeField(fieldValue, margin, y + 2, fieldW, 26);
    var openButton = makeButton('打开 / Open', margin + fieldW + pathGap, y, pathOpenW, 30, openAction);
    var chooseButton = makeButton('选择… / Choose…', margin + fieldW + pathGap + pathOpenW + pathGap, y, pathChooseW, 30, chooseAction);
    content.addSubview(field);
    content.addSubview(openButton);
    content.addSubview(chooseButton);
    return { field: field, openButton: openButton, chooseButton: chooseButton };
  }

  content.addSubview(makeLabel(
    '指定原版游戏 App 的位置（现有已经安装的游戏位置可在 steam 里查看）',
    margin, row(captionZhH, captionZhGap), inner, captionZhH, 13, true
  ));
  var sourceEnglish = makeLabel(
    'Pick the installed Duckov.app. Steam can show the install path.',
    margin, row(captionEnH, captionEnGap), inner, captionEnH, 12, false
  );
  try { sourceEnglish.setTextColor(secondaryTextColor()); } catch (eSource) {}
  content.addSubview(sourceEnglish);
  var sourceY = row(pathRowH, pathRowGap);
  var sourceRow = placePathRow('/Applications/Duckov.app', sourceY, 'openSource:', 'chooseSource:');
  sourceField = sourceRow.field;
  openSourceButton = sourceRow.openButton;
  chooseSourceButton = sourceRow.chooseButton;

  content.addSubview(makeLabel(
    '指定要保存游戏副本的位置（今后要联机则打开这个副本游戏）',
    margin, row(captionZhH, captionZhGap), inner, captionZhH, 13, true
  ));
  var destEnglish = makeLabel(
    'Where the co-op copy is saved. Launch this copy for co-op.',
    margin, row(captionEnH, captionEnGap), inner, captionEnH, 12, false
  );
  try { destEnglish.setTextColor(secondaryTextColor()); } catch (e) {}
  content.addSubview(destEnglish);
  var destY = row(pathRowH, pathRowGap);
  var destRow = placePathRow(joinPath(homeDir(), 'Applications/Duckov-COOP.app'), destY, 'openDest:', 'chooseDest:');
  destField = destRow.field;
  openDestButton = destRow.openButton;
  chooseDestButton = destRow.chooseButton;

  var boxH = modsBoxH;
  var boxY = windowHeight - cursor - boxH;
  var modsBox = makeSectionBox('可选：Mods 区域 / Optional Mods', margin, boxY, inner, boxH);
  content.addSubview(modsBox);
  function yInBox(topOffset, h) {
    return boxY + boxH - topOffset - h;
  }
  var modsLabelTop = modsTitleChrome + modsAfterTitle;
  var modsLabelY = yInBox(modsLabelTop, modsLabelH);
  var modsEnY = yInBox(modsLabelTop + modsLabelH + modsLabelGap, modsEnH);
  var modsHelpY = yInBox(modsLabelTop + modsLabelH + modsLabelGap + modsEnH + modsEnGap, modsHelpH);
  var modsRowY = yInBox(modsLabelTop + modsLabelH + modsLabelGap + modsEnH + modsEnGap + modsHelpH + modsHelpGap, modsRowH);
  var downloadY = yInBox(modsLabelTop + modsLabelH + modsLabelGap + modsEnH + modsEnGap + modsHelpH + modsHelpGap + modsRowH + modsGap2, downloadH);
  var boxPadX = 16;
  var boxInnerLeft = margin + boxPadX;
  var boxInnerW = inner - boxPadX * 2;
  content.addSubview(makeLabel(
    MODS_FIELD_LABEL,
    boxInnerLeft, modsLabelY, boxInnerW, modsLabelH, 13, true
  ));
  var modsEnglish = makeLabel(MODS_FIELD_ENGLISH, boxInnerLeft, modsEnY, boxInnerW, modsEnH, 12, false);
  try { modsEnglish.setTextColor(secondaryTextColor()); } catch (eModsEn) {}
  content.addSubview(modsEnglish);
  var modsHelp = makeWrappingLabel(MODS_FIELD_HELP, boxInnerLeft, modsHelpY, boxInnerW, modsHelpH, 11);
  try { modsHelp.setTextColor(secondaryTextColor()); } catch (eModsHelp) {}
  content.addSubview(modsHelp);
  var modsOpenW = 100;
  var modsChooseW = 148;
  var modsClearW = 108;
  var modsGap = 8;
  var modsFieldW = boxInnerW - modsOpenW - modsChooseW - modsClearW - modsGap * 3;
  modsField = makeField('', boxInnerLeft, modsRowY + 2, modsFieldW, 26);
  try {
    modsField.setPlaceholderString($('留空则不装入新的 Mod / Leave empty to skip new mods'));
  } catch (eMods) {}
  openModsButton = makeButton('打开 / Open', boxInnerLeft + modsFieldW + modsGap, modsRowY, modsOpenW, 30, 'openMods:');
  chooseModsButton = makeButton('选择… / Choose…', boxInnerLeft + modsFieldW + modsGap + modsOpenW + modsGap, modsRowY, modsChooseW, 30, 'chooseMods:');
  clearModsButton = makeButton('清除 / Clear', boxInnerLeft + modsFieldW + modsGap + modsOpenW + modsGap + modsChooseW + modsGap, modsRowY, modsClearW, 30, 'clearMods:');
  downloadButton = makeButton(
    DOWNLOAD_MOD_TITLE,
    boxInnerLeft, downloadY, boxInnerW, downloadH, 'downloadMod:'
  );
  content.addSubview(modsField);
  content.addSubview(openModsButton);
  content.addSubview(chooseModsButton);
  content.addSubview(clearModsButton);
  content.addSubview(downloadButton);
  cursor += boxH + modsBoxGap;

  var configBoxY = windowHeight - cursor - configBoxH;
  var configBox = makeSectionBox('可选：配置与存档 / Optional: config and saves', margin, configBoxY, inner, configBoxH);
  content.addSubview(configBox);
  function yInConfig(topOffset, h) {
    return configBoxY + configBoxH - topOffset - h;
  }
  var explainTop = configTitleChrome + configAfterTitle;
  var explainY = yInConfig(explainTop, configExplainH);
  var openConfigY = yInConfig(explainTop + configExplainH + configGapA, configBtnH);
  var syncConfigY = yInConfig(explainTop + configExplainH + configGapA + configBtnH + configGapB, configBtnH);
  var configPadX = 16;
  var configLeft = margin + configPadX;
  var configInnerW = inner - configPadX * 2;
  var explain = makeWrappingLabel(configExplanation(), configLeft, explainY, configInnerW, configExplainH, 11);
  try { explain.setSelectable(true); } catch (eExplain) {}
  content.addSubview(explain);
  var configBtnGap = 8;
  var configBtnW = Math.floor((configInnerW - configBtnGap) / 2);
  openOriginalConfigButton = makeButton(
    '打开原版配置位置 / Open original config folder',
    configLeft, openConfigY, configBtnW, configBtnH, 'openOriginalConfig:', 12
  );
  openCoopConfigButton = makeButton(
    '打开联机副本配置位置 / Open co-op config folder',
    configLeft + configBtnW + configBtnGap, openConfigY, configBtnW, configBtnH, 'openCoopConfig:', 12
  );
  syncToCoopButton = makeButton(
    SYNC_TO_COOP_TITLE,
    configLeft, syncConfigY, configBtnW, configBtnH, 'syncOriginalToCoop:', 11
  );
  syncToOriginalButton = makeButton(
    SYNC_TO_ORIGINAL_TITLE,
    configLeft + configBtnW + configBtnGap, syncConfigY, configBtnW, configBtnH, 'syncCoopToOriginal:', 11
  );
  content.addSubview(openOriginalConfigButton);
  content.addSubview(openCoopConfigButton);
  content.addSubview(syncToCoopButton);
  content.addSubview(syncToOriginalButton);
  cursor += configBoxH + configSectionGap;

  statusField = makeWrappingLabel('', margin, row(statusH, statusGap), inner, statusH, 12);
  content.addSubview(statusField);
  content.addSubview(makeLabel('进度 / Progress', margin, row(progressH, progressGap), inner, progressH, 13, false));

  logH = windowHeight - cursor - prepareBottom - prepareH - prepareGap;
  var logY = prepareBottom + prepareH + prepareGap;
  var scroll = objc($.NSScrollView.alloc).initWithFrame($.NSMakeRect(margin, logY, inner, logH));
  scroll.setHasVerticalScroller(true);
  scroll.setAutohidesScrollers(true);
  scroll.setBorderType(2);
  logView = objc($.NSTextView.alloc).initWithFrame($.NSMakeRect(0, 0, inner - 20, logH));
  logView.setEditable(false);
  logView.setSelectable(true);
  logView.setRichText(false);
  logView.setFont($.NSFont.userFixedPitchFontOfSize(11));
  logView.setHorizontallyResizable(false);
  logView.setVerticallyResizable(true);
  try {
    var container = objc(logView.textContainer);
    container.setWidthTracksTextView(true);
    container.setContainerSize($.NSMakeSize(inner - 16, 1000000));
  } catch (e2) {}
  scroll.setDocumentView(logView);
  content.addSubview(scroll);

  var prepareX = margin + Math.round((inner - prepareW) / 2);
  var primary = makePrimaryButton(
    PREPARE_BUTTON_TITLE,
    prepareX, prepareBottom, prepareW, prepareH, 'prepare:'
  );
  prepareFill = primary.fill;
  prepareButton = primary.button;
  if (prepareFill) content.addSubview(prepareFill);
  content.addSubview(prepareButton);
  paintPrepareButton(true);

  if (fileExists('/Applications/Duckov.app')) {
    setStatus('已找到默认原版 App。确认路径后点击「准备联机副本」。 / Default original app found. Confirm the paths, then click Prepare co-op copy.', null);
  } else {
    setStatus('未找到默认原版 App。请点「选择…」指定 Duckov.app。 / Default original app was not found. Click Choose and select Duckov.app.', null);
  }
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
  try { objc($.NSProcessInfo.processInfo).setProcessName($('准备联机副本')); } catch (e) {}
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
