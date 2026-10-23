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
  var buttons = [prepareButton, downloadButton, chooseSourceButton, chooseDestButton, chooseModsButton, clearModsButton];
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
  var alert = objc(objc($.NSAlert.alloc).init);
  alert.setMessageText($(title));
  alert.setInformativeText($(info));
  alert.addButtonWithTitle($(okTitle));
  alert.addButtonWithTitle($(cancelTitle));
  return asNumber(alert.runModal) === firstButtonCode();
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
    '3. 可选：在 Mods 区域选择已解压的 Mods 文件夹，或下载最新测试 Mod。留空也可以。',
    '   Optional: in the Mods section, choose an unzipped Mods folder, or download the latest test mod. Empty is fine.',
    '4. 点击窗口最下方的「准备联机副本 / Prepare co-op copy」。复制游戏时可能需要几分钟。',
    '   Click Prepare co-op copy at the bottom of the window. Copying the game can take several minutes.',
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
    throw new Error('无法访问 GitHub Releases。请检查网络，或点「打开 Releases 页面」手动下载。\nCould not reach GitHub Releases. Check the network, or click Open Releases and download the zip yourself.\n\n' + (result ? result.stderr : ''));
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
      '没有完成下载或解压。请查看日志，或打开 Releases 页面手动下载。\n\nDownload or unzip did not finish. Read the log, or open the Releases page and download the zip manually.'
    );
    return;
  }
  if (code === 0) {
    appendLogFile('\n退出码 / Exit code: 0\n完成 / Done\n');
    setStatus('完成。副本已准备好。 / Done. The co-op copy is ready.', true);
    setBusy(false);
    showAlert(
      '完成 / Done',
      '副本已准备好。请只启动这份副本进行联机。不要把 Mods 放进原版 App。\n各方的 ModVersion 必须完全一致。\n\nThe co-op copy is ready. Launch only this copy for co-op. Do not put Mods in the original app.\nEvery peer must use the exact same ModVersion string.\n\n' + fieldText(destField)
    );
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
    var missing = '没有找到 EscapeFromDuckovCoopMod*.zip。\n请打开 Releases 页面手动下载。\n\nNo EscapeFromDuckovCoopMod*.zip asset was found.\nOpen the Releases page and download it manually.';
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
    '正在准备 / Still working',
    '关闭窗口会中断这次准备。\nClosing the window stops this run.',
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

function attributedTitle(title, font, color, underline, align) {
  var text = String(title);
  var str = objc($.NSMutableAttributedString.alloc).initWithString($(text));
  if (!str) throw new Error('attributed string');
  var range = $.NSMakeRange(0, text.length);
  if (font) str.addAttributeValueRange($.NSFontAttributeName, font, range);
  if (color) str.addAttributeValueRange($.NSForegroundColorAttributeName, color, range);
  if (underline) str.addAttributeValueRange($.NSUnderlineStyleAttributeName, $(1), range);
  if (align != null) {
    var style = objc(objc($.NSMutableParagraphStyle.alloc).init);
    style.setAlignment(align);
    str.addAttributeValueRange($.NSParagraphStyleAttributeName, style, range);
  }
  return str;
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

function paintPrepareButton(enabled) {
  var title = '准备联机副本 / Prepare co-op copy';
  var r = enabled ? 0.10 : 0.45;
  var g = enabled ? 0.38 : 0.49;
  var b = enabled ? 0.78 : 0.54;
  if (prepareFill) {
    try { prepareFill.setFillColor(rgb(r, g, b)); } catch (e) {}
  }
  if (!prepareButton) return;
  paintLayer(prepareButton, r, g, b, 8);
  try {
    prepareButton.setAttributedTitle(attributedTitle(title, $.NSFont.boldSystemFontOfSize(16), $.NSColor.whiteColor, false, 2));
  } catch (e2) {}
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

function makeButton(title, x, y, w, h, action) {
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setTitle($(title));
  button.setBezelStyle(1);
  button.setFont($.NSFont.systemFontOfSize(13));
  button.setTarget(controller);
  button.setAction(action);
  return button;
}

function makeLinkButton(title, x, y, w, h, action) {
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setBezelStyle(15);
  button.setBordered(false);
  button.setFont($.NSFont.systemFontOfSize(12));
  button.setAlignment(0);
  button.setTarget(controller);
  button.setAction(action);
  try { button.setFocusRingType(1); } catch (e) {}
  var color = rgb(0.05, 0.38, 0.82);
  try {
    var link = objc($.NSColor.linkColor);
    if (link) color = link;
  } catch (e2) {}
  try {
    button.setAttributedTitle(attributedTitle(title, $.NSFont.systemFontOfSize(12), color, true, 0));
  } catch (e3) {
    button.setTitle($(title));
    try { button.setContentTintColor(color); } catch (e4) {}
  }
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
    fill.setCornerRadius(8);
    fill.setFillColor(rgb(0.10, 0.38, 0.78));
    fill.setTransparent(false);
  } catch (e) {
    fill = null;
  }
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setTitle($(title));
  button.setFont($.NSFont.boldSystemFontOfSize(16));
  button.setBordered(false);
  button.setAlignment(2);
  button.setTarget(controller);
  button.setAction(action);
  try { button.setKeyEquivalent($('\r')); } catch (e2) {}
  try { button.setFocusRingType(1); } catch (e3) {}
  try {
    var cell = objc(button.cell);
    cell.setBordered(false);
    cell.setBackgroundColor(objc($.NSColor.clearColor));
  } catch (e4) {}
  try {
    button.setAttributedTitle(attributedTitle(title, $.NSFont.boldSystemFontOfSize(16), $.NSColor.whiteColor, false, 2));
  } catch (e5) {}
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
  var windowWidth = 780;
  var windowHeight = 768;
  var margin = 20;
  var inner = windowWidth - margin * 2;
  var cursor = 12;
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

  content.addSubview(makeLabel('准备联机副本 / Prepare co-op copy', margin, row(26, 4), inner, 26, 18, true));
  content.addSubview(makeWrappingLabel(
    '复制官方 Duckov.app，只改副本：关闭 App Sandbox，加入联网权限，并用本机 codesign 身份 "-" 重新签名。\nCopy the official Duckov.app and change only the copy: turn off App Sandbox, add network access, and re-sign with the local codesign identity "-".',
    margin, row(50, 8), inner, 50, 12
  ));

  content.addSubview(makeLabel('原版 App / Original app', margin, row(18, 4), inner, 18, 13, false));
  var sourceY = row(30, 10);
  sourceField = makeField('/Applications/Duckov.app', margin, sourceY + 2, inner - 168, 26);
  chooseSourceButton = makeButton('选择… / Choose…', margin + inner - 156, sourceY, 156, 30, 'chooseSource:');
  content.addSubview(sourceField);
  content.addSubview(chooseSourceButton);

  content.addSubview(makeLabel(
    '指定要保存游戏副本的位置（今后要联机则打开这个副本游戏）',
    margin, row(22, 4), inner, 22, 13, true
  ));
  var destEnglish = makeLabel(
    'Where the co-op copy is saved. Launch this copy for co-op.',
    margin, row(18, 4), inner, 18, 12, false
  );
  try { destEnglish.setTextColor(secondaryTextColor()); } catch (e) {}
  content.addSubview(destEnglish);
  var destY = row(30, 10);
  destField = makeField(joinPath(homeDir(), 'Applications/Duckov-COOP.app'), margin, destY + 2, inner - 168, 26);
  chooseDestButton = makeButton('选择… / Choose…', margin + inner - 156, destY, 156, 30, 'chooseDest:');
  content.addSubview(destField);
  content.addSubview(chooseDestButton);

  var titleChrome = 26;
  var afterTitle = 8;
  var modsLabelH = 18;
  var modsGap1 = 6;
  var modsRowH = 30;
  var modsGap2 = 10;
  var downloadH = 32;
  var boxPadBottom = 10;
  var boxH = titleChrome + afterTitle + modsLabelH + modsGap1 + modsRowH + modsGap2 + downloadH + boxPadBottom;
  var boxY = windowHeight - cursor - boxH;
  var modsBox = makeSectionBox('可选：Mods 区域 / Optional Mods', margin, boxY, inner, boxH);
  content.addSubview(modsBox);
  function yInBox(topOffset, h) {
    return boxY + boxH - topOffset - h;
  }
  var modsLabelTop = titleChrome + afterTitle;
  var modsLabelY = yInBox(modsLabelTop, modsLabelH);
  var modsRowY = yInBox(modsLabelTop + modsLabelH + modsGap1, modsRowH);
  var downloadY = yInBox(modsLabelTop + modsLabelH + modsGap1 + modsRowH + modsGap2, downloadH);
  var boxPadX = 16;
  var boxInnerLeft = margin + boxPadX;
  var boxInnerW = inner - boxPadX * 2;
  content.addSubview(makeLabel(
    'Mods 文件夹（可选）/ Mods folder (optional)',
    boxInnerLeft, modsLabelY, boxInnerW, modsLabelH, 13, false
  ));
  var chooseW = 148;
  var clearW = 120;
  var modsFieldW = boxInnerW - chooseW - clearW - 16;
  modsField = makeField('', boxInnerLeft, modsRowY + 2, modsFieldW, 26);
  try {
    modsField.setPlaceholderString($('留空则不装入新的 Mod / Leave empty to skip new mods'));
  } catch (eMods) {}
  chooseModsButton = makeButton('选择… / Choose…', boxInnerLeft + modsFieldW + 8, modsRowY, chooseW, 30, 'chooseMods:');
  clearModsButton = makeButton('清除 / Clear', boxInnerLeft + modsFieldW + 8 + chooseW + 8, modsRowY, clearW, 30, 'clearMods:');
  downloadButton = makeButton(
    '下载最新测试 Mod / Download latest test mod',
    boxInnerLeft, downloadY, boxInnerW, downloadH, 'downloadMod:'
  );
  content.addSubview(modsField);
  content.addSubview(chooseModsButton);
  content.addSubview(clearModsButton);
  content.addSubview(downloadButton);
  cursor += boxH + 4;

  var linkW = 340;
  var linkY = row(24, 6);
  releasesButton = makeLinkButton(
    '打开 Releases 页面 / Open Releases',
    margin + 2, linkY, linkW, 24, 'openReleases:'
  );
  content.addSubview(releasesButton);

  statusField = makeWrappingLabel('', margin, row(36, 4), inner, 36, 12);
  content.addSubview(statusField);
  content.addSubview(makeLabel('进度 / Progress', margin, row(18, 4), inner, 18, 13, false));

  var prepareH = 50;
  var prepareGap = 12;
  var prepareBottom = 16;
  var logH = windowHeight - cursor - prepareBottom - prepareH - prepareGap;
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

  var primary = makePrimaryButton(
    '准备联机副本 / Prepare co-op copy',
    margin, prepareBottom, inner, prepareH, 'prepare:'
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
