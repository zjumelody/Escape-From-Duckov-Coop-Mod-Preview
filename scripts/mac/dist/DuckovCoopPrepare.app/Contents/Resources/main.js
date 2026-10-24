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
var refreshStep1Button = null;
var refreshStep2Button = null;
var refreshStep3Button = null;
// Per-step refresh in flight: disable that step's ↻ until its detect finishes.
// 某步刷新进行中：禁用该步 ↻，检测结束后再打开。
var stepRefreshPending = [false, false, false, false];
var step2TitleLabel = null;
var step3TitleLabel = null;
var stepDone = [false, false, false, false];
// Lowercased dest path prepared successfully in this session. Empty until then.
// Green overrides the yellow "already on disk" state only for this path.
var prepareReadyPath = '';
// Last dest path whose Mods folder was scanned, so typing does not rescan.
var lastModScanDest = '';
var prepareButton = null;
var prepareFill = null;
var downloadButton = null;
var releasesButton = null;
var langButton = null;
var statusTitleLabel = null;
var step1HelpLabel = null;
var step3HelpLabel = null;
var explainLabel = null;
var step2StatusLabel = null;
var lastStep2StatusLogKey = '';
var sourceCaptionLabel = null;
var destCaptionLabel = null;
var progressLabel = null;
var clearLogButton = null;
var uiLang = 'zh'; // 'zh' | 'en' — launch default 中文
var chooseSourceButton = null;
var chooseDestButton = null;
var chooseModsButton = null;
var clearModsButton = null;
var openSourceButton = null;
var openDestButton = null;
var openModsButton = null;
var openOriginalConfigButton = null;
var openCoopConfigButton = null;
var openOriginalModsButton = null;
var openCoopModsButton = null;
var syncToCoopButton = null;
var syncToOriginalButton = null;
var DUCKOV_BUNDLE_ID = 'com.bilibili.duckov';
var runningTask = null;
var pollTimer = null;
// Mod listing is a separate NSTask from Prepare/download. It must not run
// synchronously during init: launch's currentTaskDictionary calls getcwd
// when no working directory is set, and that blocks the main thread before
// the run loop exists, so the window stays 0×0.
var scanTask = null;
var scanTimer = null;
var scanToken = 0;
var scanArmedToken = 0;
var scanDestKey = '';
var scanOutPath = '';
var scanErrPath = '';
var scanOutHandle = null;
var scanErrHandle = null;
var scanDeadlineMs = 0;
var MOD_SCAN_LIMIT_MS = 15000;
var downloadFill = null;
var openOriginalFill = null;
var openCoopFill = null;
var openOriginalModsFill = null;
var openCoopModsFill = null;
var syncToCoopFill = null;
var syncToOriginalFill = null;
var syncLayoutGeom = null; // { x,y,w,h,halfW,gap,rowW } for dual vs no-perm single button
var syncButtonsNoPermMode = false;
// Spinners for async detect (config fingerprint / Release check).
// 检测中旋转图标：配置指纹比较、Release 版本核对。
var downloadSpinner = null;
var syncToCoopSpinner = null;
var syncToOriginalSpinner = null;
var prepareSpinner = null;
// Async COOP-copy readiness (entitlements). null = still detecting / not run.
// 异步联机副本就绪检测（entitlements）。null = 仍在检测或尚未跑完。
var prepareCheckResult = null; // 'ready' | 'needs_fix' | 'missing' | 'error'
var prepareCheckTask = null;
var prepareCheckTimer = null;
var prepareCheckToken = 0;
var prepareCheckArmedToken = 0;
var prepareCheckOutPath = '';
var prepareCheckErrPath = '';
var prepareCheckOutHandle = null;
var prepareCheckErrHandle = null;
var prepareCheckDeadlineMs = 0;
var PREPARE_CHECK_LIMIT_MS = 20000;
var prepareCheckLoggedKey = '';
var localModVersions = [];
var localModEntries = [];
var localModScanDone = false;
var releaseVersion = '';
var releaseKnown = false;
var releaseCheckFinished = false;
var releaseTask = null;
var releaseTimer = null;
var releaseToken = 0;
var releaseArmedToken = 0;
var releaseJsonPath = '';
var releaseErrPath = '';
var releaseOutHandle = null;
var releaseErrHandle = null;
var releaseDeadlineMs = 0;
var RELEASE_CHECK_LIMIT_MS = 50000;
var lastDownloadLogKey = '';
var pendingDownloadZip = '';
var pendingDownloadUnzip = '';
var configHelpSampleLogged = false;
var configTask = null;
var configTimer = null;
var configToken = 0;
var configArmedToken = 0;
var configOutPath = '';
var configErrPath = '';
var configOutHandle = null;
var configErrHandle = null;
var configDeadlineMs = 0;
var CONFIG_COMPARE_LIMIT_MS = 60000;
var syncVisual = null;
var syncStateApi = null;
var syncStateError = '';
var configLoggedKey = '';
// One interactive container-access prompt per launch (avoid alert spam).
// 每次启动最多弹一次容器访问说明，避免刷屏。
var containerAccessPrompted = false;
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
  var originalConfig = originalConfigDirDisplay();
  var coopConfig = coopConfigDirDisplay();
  return [
    L(
      '第二步只同步「配置文件夹」（含存档 Saves 等）。这与第三步的 Mods（.app/Contents/Mods）不是同一回事，权限也分开判断。',
      'Step 2 only syncs the config folders (including Saves). That is not Step 3 Mods (.app/Contents/Mods); permissions are judged separately.'
    ),
    L('原版配置位置 / original config folder: ', 'Original config folder: ') + originalConfig,
    L('联机副本配置位置 / co-op config folder: ', 'Co-op config folder: ') + coopConfig,
    L('同步前请退出两边的游戏。', 'Quit both games before syncing.')
  ].join('\n');
}

function originalConfigDirDisplay() {
  return '~/Library/Containers/' + DUCKOV_BUNDLE_ID + '/Data/Library/Application Support/' + DUCKOV_BUNDLE_ID;
}

function coopConfigDirDisplay() {
  return '~/Library/Application Support/' + DUCKOV_BUNDLE_ID;
}

function configFolderAccessHelpText() {
  // CONFIG detect/sync domain only — never Mods / Finder-open copy.
  // 仅配置检测/同步文案，不含 Mods / 访达打开说明。
  var originalConfig = originalConfigDirDisplay();
  var coopConfig = coopConfigDirDisplay();
  return L(
    [
      'bash 没有磁盘访问权限，还不能读取配置文件，无法完成第二步检测。',
      '',
      '开启 bash 磁盘访问权限的方式：',
      '1、打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」。',
      '2、点左下角「+」→ 按 ⌘⇧G → 输入 /bin/bash →「打开」→ 打开右侧开关。',
      '3、改完后点击第二步右上角刷新按钮即可。',
      '',
      '仅当本工具无法读取/探测原版配置文件夹（指纹、更新时间、写入探测或同步失败）时，再这样授权，若弹出类似「要访问其他 App 的数据」的对话框，点「允许」。',
      '',
      '原版配置位置',
      originalConfig,
      '联机副本配置位置',
      coopConfig
    ].join('\n'),
    [
      'bash does not have disk access, so config files cannot be read and Step 2 detection cannot finish.',
      '',
      'How to grant disk access to bash:',
      '1. Open System Settings → Privacy & Security → Full Disk Access.',
      '2. Click + at the bottom left → press ⌘⇧G → type /bin/bash → Open → turn on the switch.',
      '3. After that, click the refresh button at the top right of Step 2.',
      '',
      'Grant this only when THIS TOOL cannot read/probe the original config folder (fingerprint, mtime, write-probe, or sync). If a dialog like “wants to access data from other apps” appears, click Allow.',
      '',
      'Original config folder',
      originalConfig,
      'Co-op config folder',
      coopConfig
    ].join('\n')
  );
}

// Back-compat alias — CONFIG help only, never Mods.
function fullDiskAccessText() {
  return configFolderAccessHelpText();
}

function openPrivacyPane(url) {
  try {
    objc($.NSWorkspace.sharedWorkspace).openURL($.NSURL.URLWithString($(url)));
    return true;
  } catch (e) {
    return false;
  }
}

function openContainerAccessSettings() {
  // Try App Management first, then Full Disk Access.
  // 先试 App 管理，再打开完全磁盘访问。
  // Open Full Disk Access first — that is where the user adds /bin/bash via ⌘⇧G.
  // 先打开完全磁盘访问：用户用 ⌘⇧G 加入 /bin/bash 的地方。
  var urls = [
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AppManagement',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles'
  ];
  var i;
  for (i = 0; i < urls.length; i++) {
    if (openPrivacyPane(urls[i])) return true;
  }
  return false;
}

function probePathReadable(path) {
  // List the directory from THIS process so macOS 14+ can show the
  // “access data from other apps” prompt (NSTask alone often will not).
  // 在本进程里列目录，便于 macOS 14+ 弹出「访问其他 App 数据」；只靠 NSTask 常常弹不出来。
  if (!path || !fileExists(path)) return false;
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var names = fm.contentsOfDirectoryAtPathError($(String(path)), null);
    if (!names) return false;
    try {
      return asNumber(objc(names.count)) >= 0;
    } catch (eCount) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

function baseName(path) {
  var text = String(path || '');
  var slash = text.lastIndexOf('/');
  if (slash < 0) return text;
  if (slash === text.length - 1) {
    text = text.substring(0, slash);
    slash = text.lastIndexOf('/');
  }
  return slash < 0 ? text : text.substring(slash + 1);
}

function configWriteProbePath(dir, token) {
  // Sibling of the config root under the same parent (Application Support), e.g.
  // …/Application Support/com.bilibili.duckov.write-probe-TOKEN next to
  // …/Application Support/com.bilibili.duckov — proves write access to that
  // container/AS area without creating/deleting anything inside the config tree.
  // 探测放在配置根的同级（同一父目录/Application Support），不碰配置树内文件/目录时间。
  var parent = parentDir(dir);
  var base = baseName(dir);
  if (!parent || !base) return '';
  return joinPath(parent, base + '.write-probe-' + String(token || 'x'));
}

function probeConfigFolderAccess(dir) {
  // Real permission check: create+delete a uniquely named temp folder as a SIBLING
  // of the config root (same parent). List/mtime alone can still succeed after FDA
  // revoke and cause false greens. Never create/delete inside the config tree —
  // that would bump root (and previously masked child) mtimes used for newer/older.
  // Always clean up; never leave the probe behind.
  // 真权限探测：在配置根同级建删唯一临时文件夹。仅列举/mtime 在撤销 FDA 后仍可能假绿。
  // 绝不在配置树内建删，以免改根目录/子目录 mtime 干扰较新/较旧。必须清理。
  if (!dir || !fileExists(dir) || !pathIsDirectory(dir)) return false;
  if (!probePathReadable(dir)) return false;
  var parent = parentDir(dir);
  if (!parent || !fileExists(parent) || !pathIsDirectory(parent)) return false;
  var fm = objc($.NSFileManager.defaultManager);
  var token = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1e9));
  var probePath = configWriteProbePath(dir, token);
  if (!probePath) return false;
  var created = false;
  try {
    var err = Ref();
    created = asBool(fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
      $(probePath),
      false,
      objc($.NSDictionary.dictionary),
      err
    ));
    if (!created || !fileExists(probePath)) return false;
    // Touch a tiny file inside so “create folder only” caches cannot fake success.
    // 再写一个小文件，避免只建空目录被缓存误判成功。
    var marker = joinPath(probePath, 'probe.txt');
    if (!writeTextFile(marker, 'ok\n')) return false;
    if (!fileExists(marker)) return false;
    return true;
  } catch (e) {
    return false;
  } finally {
    try {
      if (fileExists(probePath)) {
        fm.removeItemAtPathError($(probePath), null);
      }
    } catch (eRm) {
      try { appendLogFile('权限探测残留未能删除 / perm probe cleanup failed: ' + probePath + '\n'); } catch (eLog) {}
    }
  }
}

function originalConfigAccessible() {
  var ok = probeConfigFolderAccess(originalConfigDir());
  try {
    appendLogFile('[config-perm] domain=config side=original path=' + originalConfigDir() + ' writeProbe=' + ok + '\n');
  } catch (ePermLog) {}
  return ok;
}

function reenableSyncButtons() {
  // After any permission dialog dismissal, sync buttons must stay clickable.
  // 授权对话框无论点哪一项关闭后，同步按钮都要能继续点。
  try {
    if (syncToCoopButton) syncToCoopButton.setEnabled(!busy);
    if (syncToOriginalButton) syncToOriginalButton.setEnabled(!busy);
  } catch (eEn) {}
  try { paintSyncButtons(!busy); } catch (ePaint) {}
}

function permissionHelpButtonTitles() {
  // Exactly three NSAlert buttons (Melody): open settings, retry detect, dismiss.
  // 必须三个按钮：打开系统权限页面、重试检测、稍后。
  return [
    L('打开系统权限页面', 'Open system permission settings'),
    L('重试检测', 'Retry check'),
    L('稍后', 'Later')
  ];
}

function offerContainerAccessHelp(reason) {
  // CONFIG-folder access dialog only. Never use for Mods / Contents/Mods open failures.
  // 只用于配置文件夹授权。Mods / Contents/Mods 打开失败不要走这里。
  // Title unchanged; body is configFolderAccessHelpText only (no stacked reason).
  // 标题保持原样；正文只用 configFolderAccessHelpText，不再叠 reason。
  if (quitting) return false;
  containerAccessPrompted = true;
  if (reason) {
    try { appendLogFile('[config-perm-help] reason=' + String(reason).split('\n')[0] + '\n'); } catch (eReason) {}
  }
  var info = configFolderAccessHelpText();
  try { appendLogFile('[config-perm-help] offering config-folder access dialog (not Mods)\n'); } catch (eHelpLog) {}
  var titles = permissionHelpButtonTitles();
  if (!titles || titles.length !== 3) {
    try { appendLogFile('权限对话框按钮异常 / permission dialog buttons missing\n'); } catch (eBtn) {}
  }
  var choice = -1;
  var retried = false;
  try {
    choice = showChoices(
      L('需要授权才能读原版配置文件夹', 'Permission needed for the original config folder'),
      info,
      titles
    );
  } catch (eChoices) {
    choice = -1;
    try { appendLogFile('权限对话框失败 / permission dialog failed: ' + eChoices + '\n'); } catch (eLog) {}
  }
  try {
    if (choice === 0) {
      openContainerAccessSettings();
    } else if (choice === 1) {
      containerAccessPrompted = false;
      // Keep Step2 refresh gated across retry detect (do not end pending early).
      // 重试检测期间继续禁用第二步刷新，避免弹窗返回后立刻再点。
      stepRefreshPending[2] = true;
      paintRefreshStepButtons();
      voidConfigCompare();
      retried = true;
    }
  } finally {
    reenableSyncButtons();
  }
  return retried;
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
  // Do not pass JS null as attributes — on newer macOS it becomes NSNull and
  // createDirectory… raises -[NSNull count]. Use an empty dictionary instead.
  // 不要把 JS null 当 attributes：新系统会变成 NSNull 并抛 -[NSNull count]。
  var fm = objc($.NSFileManager.defaultManager);
  if (path && fileExists(path)) {
    try {
      var attrs = fm.attributesOfItemAtPathError($(String(path)), null);
      if (attrs) {
        var typ = nsFileTypeString(attrs.objectForKey($.NSFileType));
        if (typ === 'NSFileTypeDirectory') return;
      }
    } catch (eExists) {}
  }
  var err = Ref();
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
    $(String(path)),
    true,
    objc($.NSDictionary.dictionary),
    err
  );
}

function removeTree(path) {
  if (!path) return;
  try {
    var fm = objc($.NSFileManager.defaultManager);
    fm.removeItemAtPathError($(String(path)), null);
  } catch (e) {}
}

function cleanupPendingDownloadTemps() {
  var zip = pendingDownloadZip;
  var unzip = pendingDownloadUnzip;
  pendingDownloadZip = '';
  pendingDownloadUnzip = '';
  try {
    if (zip) {
      removeFile(zip);
      appendLogFile('已删除临时 zip：' + zip + '\nRemoved temporary zip: ' + zip + '\n');
    }
  } catch (eZip) {}
  try {
    if (unzip) {
      removeTree(unzip);
      appendLogFile('已删除临时解压目录：' + unzip + '\nRemoved temporary unzip folder: ' + unzip + '\n');
    }
  } catch (eUnzip) {}
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
  try { text = Lpair(String(text || '')); } catch (eLang) {}

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

function clearDisplayedLog() {
  // Clear the on-screen progress log (and its backing file content).
  // 清空窗口里当前显示的进度日志（含对应日志文件内容）。
  try { replaceLog(''); } catch (e0) {
    try { if (logView) logView.setString($('')); } catch (e1) {}
  }
}

function onClearLog() {
  if (quitting) return;
  clearDisplayedLog();
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
    openOriginalConfigButton, openCoopConfigButton, syncToCoopButton, syncToOriginalButton,
    openOriginalModsButton, openCoopModsButton, releasesButton, langButton
  ];
  var i;
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i]) buttons[i].setEnabled(enabled);
  }
  if (sourceField) sourceField.setEditable(enabled);
  if (destField) destField.setEditable(enabled);
  if (modsField) modsField.setEditable(enabled);
  paintPrepareButton(enabled);
  paintDownloadButton(enabled);
  paintSyncButtons(enabled);
  paintRefreshStepButtons();
}

function dialogHasCJK(s) {
  return /[\u3400-\u9FFF]/.test(String(s || ''));
}

function isEnglishDialogLine(s) {
  var t = String(s || '');
  if (!t || dialogHasCJK(t)) return false;
  if (/^\/|^~|^\.\.\//.test(t)) return false;
  if (/^[A-Za-z]:\\/.test(t)) return false;
  return /[A-Za-z]{2,}/.test(t);
}

// Single-lang body for alerts/panels: keep one of each ZH/EN stacked pair; drop the other.
// 弹窗正文单语：中英叠行只留当前语言，缩短对话框。
function LdialogBody(text) {
  var lines = String(text || '').split('\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (line === '') {
      out.push('');
      i += 1;
      continue;
    }
    if (line.indexOf(' / ') !== -1) {
      out.push(Lpair(line));
      i += 1;
      continue;
    }
    if (dialogHasCJK(line)) {
      var j = i + 1;
      while (j < lines.length && lines[j] === '') j += 1;
      if (j < lines.length && isEnglishDialogLine(lines[j])) {
        out.push(L(line, lines[j]));
        i = j + 1;
        continue;
      }
      out.push(line);
      i += 1;
      continue;
    }
    out.push(line);
    i += 1;
  }
  var tight = [];
  for (i = 0; i < out.length; i++) {
    if (out[i] === '' && (tight.length === 0 || tight[tight.length - 1] === '')) continue;
    tight.push(out[i]);
  }
  while (tight.length && tight[tight.length - 1] === '') tight.pop();
  return tight.join('\n');
}

function showAlert(title, info) {
  var alert = objc(objc($.NSAlert.alloc).init);
  alert.setMessageText($(Lpair(String(title || ''))));
  alert.setInformativeText($(LdialogBody(String(info || ''))));
  alert.addButtonWithTitle($(L('好', 'OK')));
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
  alert.setMessageText($(Lpair(String(title || ''))));
  alert.setInformativeText($(LdialogBody(String(info || ''))));
  var list = titles || [];
  var i;
  for (i = 0; i < list.length; i++) {
    alert.addButtonWithTitle($(Lpair(String(list[i]))));
  }
  // NSAlert returns NSAlertFirstButtonReturn (1000) + index.
  // 返回值是 NSAlertFirstButtonReturn（1000）起算的按钮序号。
  var code = asNumber(objc(alert.runModal));
  var index = code - firstButtonCode();
  if (index < 0 || index >= list.length) return -1;
  return index;
}

function showPrepareDoneAlert() {
  var dest = fieldText(destField);
  var title = L(
    '第一步已经完成，游戏副本已经创建好，是否进行第二步：同步原版配置（包括存档）到副本游戏位置？',
    'Step 1 done — co-op copy is ready. Continue with Step 2: sync original config (including saves) to the copy?'
  );
  var info = [
    '请先完全退出原版 Duckov 和联机副本。同步会用来源镜像覆盖目标，并删除目标里多出来的文件。',
    'Quit the original Duckov app and the co-op copy first. Sync mirrors the source onto the destination and deletes files that exist only there.',
    '',
    '若读取原版配置被拒绝：先在系统弹窗点「允许」，或到「隐私与安全性 → App 管理」允许本工具；仍不行再开「完全磁盘访问权限」。',
    'If the original config is blocked: click Allow on the system prompt, or enable this tool under Privacy & Security → App Management; use Full Disk Access only if still blocked.',
    '',
    '副本 / Copy: ' + dest,
    '请只启动这份副本进行联机。各方的 ModVersion 必须完全一致。',
    'Launch only this copy for co-op. Every peer must use the exact same ModVersion string.'
  ].join('\n');
  var choice = showChoices(title, info, [
    L('立即同步', 'Sync now'),
    L('不同步', "Don't sync")
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
    text + '\nexports.selectCoopModAsset = selectCoopModAsset;\nexports.safeReleaseDownloadUrl = safeReleaseDownloadUrl;\nexports.safeModZipName = safeModZipName;\nexports.releaseAssetVersionLabel = releaseAssetVersionLabel;\nexports.versionsSame = versionsSame;\nexports.versionIsNewer = versionIsNewer;\nexports.downloadButtonState = downloadButtonState;\nexports.pickInstalledVersionLabel = pickInstalledVersionLabel;\nexports.isMelodyForkChannel = isMelodyForkChannel;\n'
  );
  runner(sandbox);
  return sandbox;
}

function loadSyncState(resourcesDir) {
  var path = joinPath(resourcesDir, 'config-sync-state.js');
  var text = readTextFile(path);
  if (!text) throw new Error('missing ' + path);
  var sandbox = {};
  var runner = new Function(
    'exports',
    text + '\nexports.formatSyncStamp = formatSyncStamp;\nexports.syncButtonLines = syncButtonLines;\nexports.syncPermissionHintLine = syncPermissionHintLine;\nexports.parseFingerprint = parseFingerprint;\nexports.compareConfigSides = compareConfigSides;\nexports.describeCompare = describeCompare;\n'
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
    '第一步：准备联机副本。确认原版 Duckov.app 和副本位置（默认 ~/Applications/Duckov-COOP.app），再点这一步里的「准备联机副本」。副本还不存在时按钮是蓝色；打开时已经有副本则是黄色，点它会重新生成；这一次准备成功后变成绿色。原版不会被修改。',
    'Step 1: Prepare the co-op copy. Confirm the original Duckov.app and the copy (default ~/Applications/Duckov-COOP.app), then click Prepare co-op copy in that step. The button is blue when the copy is not there yet, yellow when a copy is already on disk (clicking regenerates it), and green after a successful prepare in this session. The original app is not modified.',
    '第二步：配置文件（包括存档）同步。内容相同：较新绿、较旧蓝（时间相同两边绿）。内容不同：较新青、较旧黄（时间相同两边青）。无权限橙。同步前请退出两边的游戏。',
    'Step 2: Sync config files (including saves). Identical: newer side green, older blue (equal → both green). Different: newer cyan, older yellow (equal → both cyan). No permission → orange. Quit both games before syncing.',
    '第三步：配置（支持 Mac 的）联机 Mod。下载按钮和第一步的准备按钮一样大。副本里还没有这个 Mod 时是蓝色；已经是最新 Release 时是绿色，点击不会重复下载；有更新时是黄色。',
    'Step 3: Configure the Mac-compatible co-op Mod. The download button is the same size as Prepare in Step 1. It is blue when the copy does not have this Mod yet, green when the copy already matches the latest Release (a click does not download it again), and yellow when an update is available.',
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
  if (syncStateError) {
    lines.push('');
    lines.push('配置比较脚本没有载入。同步按钮保持灰色。');
    lines.push('The config compare script did not load. Sync buttons stay grey.');
    lines.push(syncStateError);
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

// Absolute directory only. Do not call getcwd() here: that is the hang.
function taskDirectory() {
  if (resources && fileExists(resources)) return resources;
  var tmp = '';
  try { tmp = String(tempDir() || ''); } catch (e) { tmp = ''; }
  if (tmp && tmp.charAt(0) === '/' && fileExists(tmp)) return tmp;
  return '/tmp';
}

// -[NSConcreteTask launch] builds currentTaskDictionary. When
// currentDirectoryPath is nil, that calls getcwd() to fill PWD. getcwd()
// goes through getattrlist and can wait on an XPC reply that only the main
// run loop can accept. Calling it on the main thread before -[NSApplication run]
// never receives that reply, so init sticks before makeKeyAndOrderFront and
// the window stays 0×0. Pin an absolute directory and PWD first so launch
// does not call getcwd. Isolated NSTask tests from Terminal do not hit this,
// because they are not inside AppKit startup.
function attachTaskEnvironment(task, extra) {
  var dir = taskDirectory();
  var info = objc($.NSProcessInfo.processInfo);
  var env = objc(objc(info.environment).mutableCopy);
  try { env.setObjectForKey($(dir), $('PWD')); } catch (ePwd) {}
  if (extra) {
    var keys = Object.keys(extra);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (extra[keys[i]] == null) continue;
      env.setObjectForKey($(String(extra[keys[i]])), $(String(keys[i])));
    }
  }
  task.setCurrentDirectoryPath($(dir));
  task.setEnvironment(env);
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
  attachTaskEnvironment(task, null);
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
    cleanupPendingDownloadTemps();
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
      voidConfigCompare();
      showAlert(
        '同步完成 / Sync finished',
        '配置文件夹里的内容已按来源镜像到目标。这不会修改 .app 本身。\nThe config folder contents were mirrored onto the destination. The .app bundles themselves are not modified.'
      );
      return;
    }
    appendLogFile('\n退出码 / Exit code: ' + code + '\n同步未完成 / Sync did not finish\n');
    setStatus('同步未完成。请查看日志。 / Sync did not finish. Read the log.', false);
    setBusy(false);
    voidConfigCompare();
    if (needAccess) {
      showAlert('需要完全磁盘访问权限 / Full Disk Access is required', fullDiskAccessText());
    } else {
      showAlert(
        '同步未完成 / Sync did not finish',
        '请查看窗口里的日志。\nRead the log in the window.\n\n若日志里出现 Operation not permitted，请在「完全磁盘访问权限」中加入 /bin/bash（+ → ⌘⇧G）后重试。\nIf the log says Operation not permitted, add /bin/bash under Full Disk Access (+ → ⌘⇧G), then try again.'
      );
    }
    return;
  }
  if (kind === 'install-mod') {
    if (code === 0) {
      cleanupPendingDownloadTemps();
      var installLog = '';
      try { installLog = readTextFile(logPath); } catch (eInstallLog) { installLog = ''; }
      var skippedSame = installLog.indexOf('COOP_MOD_RESULT skipped-same-version') !== -1;
      var dedupedOnly = installLog.indexOf('COOP_MOD_RESULT deduped') !== -1 && installLog.indexOf('COOP_MOD_RESULT updated') === -1;
      var removedOld = installLog.indexOf('已从副本移除同属联机 Mod') !== -1 || installLog.indexOf('Removed an older co-op Mod folder') !== -1 || installLog.indexOf('已从副本移除旧的 melody-fork') !== -1;
      appendLogFile('\n退出码 / Exit code: 0\n已更新到副本 Mods / Updated into the copy\'s Mods\n');
      setBusy(false);
      markStep(3);
      voidDestModRescan();
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
      var updatedInfo = '支持 Mac 的联机 Mod 已放入副本的 Contents/Mods/（未重新签名；Mods 目录本就可写）。请只启动这份副本。不要把 Mod 放进原版 App。\n\nThe Mac-compatible co-op Mod is in the copy\'s Contents/Mods/ (not re-signed; Mods is user-writable). Launch only this copy. Do not put the Mod in the original app.';
      if (removedOld) {
        updatedInfo += '\n\n已去掉副本里同属这个联机 Mod 的旧目录（包括原版与旧的 melody-fork），只保留一份。其他无关 Mod 没有删除。\nOlder folders of this same co-op Mod (including the original and older melody-fork builds) were removed from the copy. Only one remains. Unrelated Mods were not deleted.';
      }
      showAlert(
        '已更新到副本 / Updated into the copy',
        updatedInfo + '\n\n' + fieldText(destField)
      );
      return;
    }
    cleanupPendingDownloadTemps();
    appendLogFile('\n退出码 / Exit code: ' + code + '\n没有更新到副本 / The copy was not updated\n原版 App 没有被修改。 / The original app was not modified.\n');
    setStatus('没有更新到副本。请查看日志。 / The copy was not updated. Read the log.', false);
    setBusy(false);
    showAlert(
      '没有更新到副本 / The copy was not updated',
      '请查看窗口里的日志。原版 App 没有被修改。若副本正在运行，请先退出再试。若提示存在多份你修改过的联机 Mod，请手动删除多余的一份。\n\nRead the log in the window. The original app was not modified. If the co-op copy is running, quit it and try again. If the log says multiple melody-fork co-op Mods remain, delete the extra one manually.'
    );
    return;
  }
  if (code === 0) {
    appendLogFile('\n退出码 / Exit code: 0\n完成 / Done\n');
    stepDone[1] = true;
    try { prepareReadyPath = normalize(fieldText(destField)).toLowerCase(); } catch (eReady) { prepareReadyPath = ''; }
    prepareCheckResult = 'ready';
    cancelModScan();
    lastModScanDest = prepareReadyPath;
    try {
      var preparedMods = listCoopMods('dest', normalize(fieldText(destField)));
      rememberLocalMods(preparedMods);
      // Title/done bit: paintStep3Title via refreshGuide (ready only), not mere presence.
      // 标题/完成位交给 refreshGuide→paintStep3Title（仅 ready），不因有 Mod 就 ✅。
    } catch (ePrepared) {}
    setBusy(false);
    refreshGuide();
    showPrepareDoneAlert();
    return;
  }
  appendLogFile('\n退出码 / Exit code: ' + code + '\n未完成 / Did not finish\n原版 App 没有被修改。 / The original app was not modified.\n');
  setStatus('未完成。请查看日志。原版未被修改。 / Did not finish. Read the log. The original app was not modified.', false);
  try {
    stepDone[1] = !!copyLooksPrepared();
    if (!stepDone[1]) stepDone[3] = false;
  } catch (eFailStep) {}
  setBusy(false);
  paintStepHeaders();
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
    var extraEnv = { DUCKOV_GUI_LOG: logPath };
    if (kind === 'download') extraEnv.DUCKOV_MODS_RESULT = resultPath;
    attachTaskEnvironment(runningTask, extraEnv);
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
      '原版配置文件夹还不存在。请先至少启动一次原版 Duckov.app，让游戏生成配置后再试。不会自动创建这个文件夹。这与 Mods（Contents/Mods）无关。\n'
      + 'The original config folder does not exist yet. Launch the original Duckov.app once so the game can create its config, then try again. This folder is not created automatically. This is unrelated to Mods (Contents/Mods).\n\n'
      + path
    );
    return;
  }
  // Open-in-Finder only. Finder can open config/Containers folders without bash FDA.
  // Do NOT attach configFolderAccessHelpText / bash FDA here — that help is only for
  // tool-side config detect/sync failures.
  // 只在访达打开；打开配置/Containers 不需要 bash FDA。bash FDA 文案仅留给本工具检测/同步失败。
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
      path + '\n\n这与 Mods 打开无关，也不要求给 /bin/bash 完全磁盘访问来「打开文件夹」。\nUnrelated to Mods open; opening folders does not require Full Disk Access for /bin/bash.'
    );
    return;
  }
  if (!openWithWorkspace(path)) {
    showAlert('无法打开 / Could not open', path);
    return;
  }
  setStatus('已打开联机副本配置位置。 / Opened the co-op config folder.', true);
}

function appContentsModsDir(appPath) {
  var app = normalize(appPath);
  if (!app) return '';
  return joinPath(app, 'Contents/Mods');
}

function onOpenOriginalMods() {
  // MODS domain only (Finder open). No bash FDA / config-folder access help.
  // Opening Mods under the app does not require Full Disk Access for /bin/bash.
  // Do not change syncVisual / Step2 orange paint.
  // 仅 Mods（访达打开）。不需要 /bin/bash 完全磁盘访问；不改 syncVisual / 第二步橙色。
  if (busy || quitting) return;
  var app = normalize(fieldText(sourceField));
  if (!app) {
    showAlert('路径是空的 / Path is empty', '请先填写原版 App 路径。\nEnter the original app path first.');
    return;
  }
  var path = appContentsModsDir(app);
  if (!fileExists(path)) {
    // Do not create Mods inside the original app; open Contents if present.
    // 不在原版 App 里自动创建 Mods；若有 Contents 则打开它。
    var contents = joinPath(app, 'Contents');
    if (fileExists(contents)) {
      try { appendLogFile('[open-mods] which=original path=' + path + ' fallback=Contents\n'); } catch (eLog1) {}
      if (!openWithWorkspace(contents)) {
        showAlert('无法打开 / Could not open', contents);
        return;
      }
      setStatus('原版 Mods 还不存在，已打开 Contents。 / Original Mods folder missing; opened Contents.', null);
      return;
    }
    try { appendLogFile('[open-mods] which=original path=' + path + ' missing\n'); } catch (eLog2) {}
    showAlert(
      '找不到原版 Mods / Original Mods folder was not found',
      '原版 App 的 Contents/Mods 还不存在。\nThe original app Contents/Mods folder does not exist yet.\n\n' + path
    );
    return;
  }
  try { appendLogFile('[open-mods] which=original path=' + path + '\n'); } catch (eLog3) {}
  if (!openWithWorkspace(path)) {
    showAlert('无法打开 / Could not open', path);
    return;
  }
  setStatus('已打开原版 Mods 位置。 / Opened the original Mods folder.', true);
}

function onOpenCoopMods() {
  // MODS domain only (Finder open). Never bash FDA / config-folder dialogs / sync orange.
  // 仅 Mods（访达打开）。不要 bash FDA / 配置对话框 / 同步橙色。
  if (busy || quitting) return;
  var app = normalize(fieldText(destField));
  if (!app) {
    showAlert('路径是空的 / Path is empty', '请先填写联机副本 App 路径。\nEnter the co-op copy app path first.');
    return;
  }
  var path = appContentsModsDir(app);
  var contents = joinPath(app, 'Contents');
  if (!fileExists(path)) {
    // Only mkdir Mods when Contents already exists — no probe files inside Mods.
    // 仅在已有 Contents 时创建 Mods 目录本身，不往 Mods 里写探测文件。
    if (fileExists(contents)) {
      try { ensureDir(path); } catch (eMk) {}
    }
  }
  if (!fileExists(path)) {
    try { appendLogFile('[open-mods] which=coop path=' + path + ' missing\n'); } catch (eLog4) {}
    showAlert(
      '找不到联机副本 Mods / Co-op Mods folder was not found',
      '联机副本的 Contents/Mods 还不存在。请先完成第一步准备副本。\nThe co-op copy Contents/Mods folder does not exist yet. Finish Step 1 first.\n\n' + path
    );
    return;
  }
  try { appendLogFile('[open-mods] which=coop path=' + path + '\n'); } catch (eLog5) {}
  if (!openWithWorkspace(path)) {
    showAlert('无法打开 / Could not open', path);
    return;
  }
  setStatus('已打开联机副本 Mods 位置。 / Opened the co-op Mods folder.', true);
}

function maybeSmokeOpenMods() {
  // Opt-in only (DUCKOV_SMOKE_OPEN_MODS=1). Invokes the real open handlers once for live proof.
  // 仅当环境变量开启时调用真实打开逻辑一次，便于本机验收日志。
  var env = runtimeEnv();
  if (!env || String(env.DUCKOV_SMOKE_OPEN_MODS || '') !== '1') return;
  try { appendLogFile('[open-mods-smoke] begin\n'); } catch (e0) {}
  try { onOpenOriginalMods(); } catch (e1) {
    try { appendLogFile('[open-mods-smoke] original error=' + e1 + '\n'); } catch (e1b) {}
  }
  try { onOpenCoopMods(); } catch (e2) {
    try { appendLogFile('[open-mods-smoke] coop error=' + e2 + '\n'); } catch (e2b) {}
  }
  try { appendLogFile('[open-mods-smoke] end\n'); } catch (e3) {}
}

function onSync(direction, skipConfirm) {
  if (busy || quitting) return;
  var toCoop = direction === '1to2';
  var src = toCoop ? originalConfigDir() : coopConfigDir();
  var dest = toCoop ? coopConfigDir() : originalConfigDir();
  var title = toCoop ? syncToCoopTitle() : syncToOriginalTitle();
  var flag = toCoop ? 'original-to-coop' : 'coop-to-original';
  // Sync touches original CONFIG folder (not Mods / Contents/Mods).
  // 同步碰的是原版配置文件夹，不是 Mods。
  try { originalConfigAccessible(); } catch (eSyncProbe) {}
  if (fileExists(originalConfigDir()) && !originalConfigAccessible()) {
    offerContainerAccessHelp('同步前还不能读取原版配置位置。\nThe original config folder is still unreadable before sync.');
    return;
  }
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
  // GUI sync is in-process; sync-duckov-config.sh remains for Terminal / advanced use.
  // 图形界面用本进程镜像；sync-duckov-config.sh 仍留给终端/高级用法。
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
  cancelConfigCompare();
  setBusy(true);
  setStatus('正在同步配置… 请保持两边游戏都已退出。 / Syncing config… Keep both games quit.', null);
  pendingSyncDirection = flag;
  pendingSyncSrc = src;
  pendingSyncDest = dest;
  appendLogFile(
    '\n正在同步配置（本进程镜像，不经 /bin/bash）… / Syncing config (in-process mirror, not via /bin/bash)…\n'
    + '从 / From: ' + src + '\n'
    + '到 / To: ' + dest + '\n'
  );
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.05,
    controller,
    'syncInProcess:',
    null,
    false
  );
}

function onSyncInProcess() {
  if (quitting) return;
  var src = pendingSyncSrc;
  var dest = pendingSyncDest;
  var ok = false;
  var err = null;
  try {
    ok = !!mirrorConfigTreeInProcess(src, dest);
  } catch (eSync) {
    err = eSync;
    ok = false;
  }
  pendingSyncSrc = '';
  pendingSyncDest = '';
  pendingSyncDirection = '';
  if (ok) {
    appendLogFile('\n退出码 / Exit code: 0\n同步完成 / Sync finished\n');
    setBusy(false);
    markStep(2);
    voidConfigCompare();
    showAlert(
      '同步完成 / Sync finished',
      '配置文件夹里的内容已按来源镜像到目标。这不会修改 .app 本身。\nThe config folder contents were mirrored onto the destination. The .app bundles themselves are not modified.'
    );
    return;
  }
  var msg = String(err && (err.message || err) || 'sync-failed');
  appendLogFile('\n同步未完成 / Sync did not finish: ' + msg + '\n');
  setStatus('同步未完成。请查看日志。 / Sync did not finish. Read the log.', false);
  setBusy(false);
  voidConfigCompare();
  if (msg.indexOf('permission') !== -1 || msg.indexOf('Operation not permitted') !== -1) {
    offerContainerAccessHelp('同步时无法读写原版配置位置。\nCould not read or write the original config folder during sync.');
  } else {
    showAlert(
      '同步未完成 / Sync did not finish',
      '请查看窗口里的日志。\nRead the log in the window.\n\n' + msg
    );
  }
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
  cancelModScan();
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
  if (downloadVisualState() === 'ready') {
    skipReadyDownload();
    return;
  }
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
  pendingDownloadZip = zipPath;
  pendingDownloadUnzip = unzipPath;
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
  panel.setPrompt($(L('选择', 'Choose')));
  panel.setMessage($(LdialogBody(String(title || ''))));
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
  panel.setPrompt($(L('选择', 'Choose')));
  panel.setMessage($(LdialogBody(String(title || ''))));
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
  panel.setPrompt($(L('选择', 'Choose')));
  panel.setMessage($(L(
    '指定要保存游戏副本的位置。今后要联机则打开这个副本。文件名应以 .app 结尾。',
    'Choose where to save the co-op copy. Launch this copy for co-op. The name should end with .app.'
  )));
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
  if (picked) {
    setField(sourceField, picked);
    syncStepsToDest();
  }
}

function onChooseDest() {
  if (busy) return;
  var picked = chooseDestPath();
  if (picked) {
    setField(destField, picked);
    syncStepsToDest();
  }
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
  cancelModScan();
  cancelReleaseCheck();
  cancelConfigCompare();
  cancelPrepareCheck();
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
    $(L('退出', 'Quit')),
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

// Step help captions: same family as secondary, but a bit deeper/darker for readability.
// 步骤说明灰：与 secondary 同系，略加深以便阅读。
function helpTextColor() {
  return rgb(0.28, 0.28, 0.30);
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


// --- UI language (single language at a time) ---
// Persist with NSUserDefaults. Default 中文. Toggle sits right of Open GitHub.
// 界面单语；NSUserDefaults 记住选择；默认中文；开关在「打开 GitHub」右侧。
var UI_LANG_DEFAULTS_KEY = 'DuckovCoopPrepare.uiLang';

function loadUiLang() {
  try {
    var defaults = objc($.NSUserDefaults.standardUserDefaults);
    var raw = unwrap(defaults.stringForKey($(UI_LANG_DEFAULTS_KEY)));
    var v = String(raw || '').toLowerCase();
    if (v === 'en' || v === 'english') return 'en';
    if (v === 'zh' || v === 'zh-hans' || v === 'zh_cn' || v === 'chinese' || v === '中文') return 'zh';
  } catch (e) {}
  return 'zh';
}

function saveUiLang(lang) {
  var v = lang === 'en' ? 'en' : 'zh';
  try {
    objc($.NSUserDefaults.standardUserDefaults).setObjectForKey($(v), $(UI_LANG_DEFAULTS_KEY));
  } catch (e) {}
  return v;
}

function L(zh, en) {
  if (uiLang === 'en') return en != null && en !== '' ? String(en) : String(zh || '');
  return zh != null && zh !== '' ? String(zh) : String(en || '');
}

// One-line titles that were historically "中文 / English".
function Lpair(text) {
  var s = String(text || '');
  var idx = s.indexOf(' / ');
  if (idx === -1) return s;
  return L(s.substring(0, idx), s.substring(idx + 3));
}

function langToggleTitle() {
  // Show the language you can switch TO.
  // 按钮显示「切换到」的语言。
  return uiLang === 'en' ? '中文' : 'English';
}

var TOOL_VERSION = '1.5.0';

function windowTitleText() {
  return L(
    '《逃离鸭科夫》Mac 联机 Mod 支持工具 ' + TOOL_VERSION,
    'Escape from Duckov — Mac co-op Mod support tool ' + TOOL_VERSION
  );
}
function statusTitleText() {
  return L('当前状态：', 'Current status:');
}
function openGithubTitle() {
  return L('打开 GitHub 页面', 'Open GitHub');
}
function refreshStepButtonTitle() {
  return L('↻ 刷新', '↻ Refresh');
}
function step1TitleText() {
  return L('第一步：准备联机副本', 'Step 1: Prepare co-op copy');
}
function step2TitleText() {
  return L('第二步：配置文件（包括存档）同步', 'Step 2: Sync config files (including saves)');
}
function step3TitleText() {
  return L('第三步：配置（支持Mac的）联机 Mod', 'Step 3: Configure (Mac-compatible) co-op Mod');
}
function step1HelpText() {
  return L(
    '复制官方 Duckov.app 来创建副本，目的：关闭 App Sandbox，加入联网权限，并用本机 codesign 身份“-”重新签名。',
    'Copy the official Duckov.app to create the co-op copy, in order to turn off App Sandbox, add network access, and re-sign with the local codesign identity "-".'
  );
}
function step2HelpText() {
  return L(
    '复制了游戏 App 后因为签名改变了，所以配置文件位置也变了。',
    'After copying the game App, the signature changed, so the config folder location changed too.'
  );
}
function step3HelpText() {
  return L(
    '已经下载了最新版支持 Mac 联机的 Mod 的话可以指定文件位置，会自动更新到副本 App 里。\n如果没有下载则可以点击下载按钮自动下载并拷贝到副本 Mods 里。',
    'If you already downloaded the latest Mac-compatible co-op Mod, pick its location and it will update into the copy App.\nIf not, use the download button to download and copy it into the copy\'s Mods folder.'
  );
}
function prepareButtonTitle() {
  return L('准备联机副本', 'Prepare co-op copy');
}
function prepareReadyTitle() {
  return L('已经准备好联机副本，可以开始用副本App游戏了', 'Co-op copy is ready — you can play with the copy App now');
}
function prepareExistsTitle() {
  return L('检测到联机副本App已经存在，可以下一步或者点此按钮重新生成', 'Co-op copy App already found — continue to next steps, or click to regenerate');
}
function downloadModTitle() {
  return L('自动下载并更新最新支持 Mac 的联机 Mod 到副本 Mods 位置', 'Auto-download and update the latest Mac-compatible co-op Mod into the copy\'s Mods folder');
}
function downloadReadyTitle() {
  return L('已经是最新版本', 'Already the latest version');
}
function detectingConfigTitle() {
  return L('正在检测配置…', 'Checking config…');
}
function detectingVersionTitle() {
  return L('正在检测版本…', 'Checking version…');
}
function detectingPrepareTitle() {
  return L('正在检测联机副本…', 'Checking co-op copy…');
}
function syncToCoopTitle() {
  return L('同步文件（原版 → 副本）', 'Sync files (original → co-op)');
}
function syncToOriginalTitle() {
  return L('同步文件（副本 → 原版）', 'Sync files (co-op → original)');
}
function openOriginalConfigTitle() {
  return L('打开原版配置位置', 'Open original config folder');
}
function openCoopConfigTitle() {
  return L('打开联机副本配置位置', 'Open co-op config folder');
}
function openOriginalModsTitle() {
  return L('打开原版 Mods 位置', 'Open original Mods folder');
}
function openCoopModsTitle() {
  return L('打开联机副本 Mods 位置', 'Open co-op Mods folder');
}
function openBtnTitle() { return L('打开', 'Open'); }
function chooseBtnTitle() { return L('选择…', 'Choose…'); }
function clearBtnTitle() { return L('清除', 'Clear'); }
function modsPlaceholderText() {
  return L('已下载的 Mac 联机 Mod 文件夹', 'Downloaded Mac co-op Mod folder');
}
function sourceCaptionText() {
  return L('指定原版游戏 App 的位置（现有已经安装的游戏位置可在 steam 里查看）', 'Pick the installed Duckov.app. Steam can show the install path.');
}
function destCaptionText() {
  return L('指定要保存游戏副本的位置（今后要联机则打开这个副本游戏）', 'Where the co-op copy is saved. Launch this copy for co-op.');
}
function progressTitleText() {
  return L('进度', 'Progress');
}
function clearLogButtonTitle() {
  return L('清空', 'Clear');
}
function lastUpdatedPrefix() {
  return L('最后更新于：', 'Last updated: ');
}

var WINDOW_TITLE = '《逃离鸭科夫》Mac 联机 Mod 支持工具 ' + TOOL_VERSION; // legacy; prefer windowTitleText()
var PREPARE_BUTTON_TITLE = '准备联机副本'; // legacy alias; prefer prepareButtonTitle()
var PREPARE_READY_TITLE_ZH = '已经准备好联机副本，可以开始用副本App游戏了';
var PREPARE_READY_TITLE_EN = 'Co-op copy is ready — you can play with the copy App now';
var PREPARE_EXISTS_TITLE_ZH = '检测到联机副本App已经存在，可以下一步或者点此按钮重新生成';
var PREPARE_EXISTS_TITLE_EN = 'Co-op copy App already found — continue to next steps, or click to regenerate';
var PREPARE_TITLE_SIZE = 13;
var SYNC_TO_COOP_TITLE = '同步文件（原版 → 副本）';
var SYNC_TO_ORIGINAL_TITLE = '同步文件（副本 → 原版）';
var STEP1_TITLE = '第一步：准备联机副本';
var STEP2_TITLE = '第二步：配置文件（包括存档）同步';
var STEP3_TITLE = '第三步：配置（支持Mac的）联机 Mod';
var STEP1_HELP = '复制官方 Duckov.app 来创建副本，目的：关闭 App Sandbox，加入联网权限，并用本机 codesign 身份“-”重新签名。';
var STEP2_HELP = '复制了游戏 App 后因为签名改变了，所以配置文件位置也变了。';
var STEP3_HELP = '已经下载了最新版支持 Mac 联机的 Mod 的话可以指定文件位置，会自动更新到副本 App 里。\n如果没有下载则可以点击下载按钮自动下载并拷贝到副本 Mods 里。';
var DOWNLOAD_MOD_TITLE_ZH = '自动下载并更新最新支持 Mac 的联机 Mod 到副本 Mods 位置';
var DOWNLOAD_MOD_TITLE_EN = 'Auto-download and update the latest Mac-compatible co-op Mod into the copy\'s Mods folder';
var DOWNLOAD_MOD_TITLE = DOWNLOAD_MOD_TITLE_ZH;
var DOWNLOAD_READY_TITLE_ZH = '已经是最新版本';
var DOWNLOAD_READY_TITLE_EN = 'Already the latest version';
// Slightly narrower primary buttons now that titles are single-language.
var BIG_BUTTON_WIDTH_RATIO = 0.66;
var CONFIG_OPEN_BUTTON_HEIGHT = 40;
var STEP2_BUTTON_ROW_RATIO = 0.86;
var DETECTING_CONFIG_TITLE_ZH = '正在检测配置…';
var DETECTING_CONFIG_TITLE_EN = 'Checking config…';
var DETECTING_VERSION_TITLE_ZH = '正在检测版本…';
var DETECTING_VERSION_TITLE_EN = 'Checking version…';
var DETECTING_PREPARE_TITLE_ZH = '正在检测联机副本…';
var DETECTING_PREPARE_TITLE_EN = 'Checking co-op copy…';
var STATUS_TITLE = '当前状态：';
var OPEN_GITHUB_TITLE = '打开 GitHub 页面';
var MODS_PLACEHOLDER = '已下载的 Mac 联机 Mod 文件夹';

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

// idle: no usable dest on disk (blue).
// exists / needs_fix: dest exists but entitlements are not COOP-ready (yellow).
// ready: this session prepared it, or async entitlements check matched duckov-coop.entitlements (green).
// idle：磁盘上没有可用副本（蓝）。exists/needs_fix：有副本但 entitlements 未就绪（黄）。
// ready：本会话刚准备好，或异步检测符合 duckov-coop.entitlements（绿）。
function prepareVisualState() {
  var dest = '';
  try { dest = normalize(fieldText(destField)); } catch (e) { dest = ''; }
  var key = dest ? dest.toLowerCase() : '';
  if (prepareReadyPath && key === prepareReadyPath && copyLooksPrepared()) return 'ready';
  if (prepareCheckResult === 'ready' && copyLooksPrepared()) return 'ready';
  if (prepareCheckResult === 'needs_fix' || prepareCheckResult === 'error') return 'exists';
  if (prepareCheckResult === 'missing') return 'idle';
  // Fallback before/without check result: existence only → yellow if present.
  // 检测结果尚未出来时的回退：仅看是否存在。
  if (copyLooksPrepared()) return 'exists';
  return 'idle';
}

function preparePalette(state, enabled) {
  if (state === 'ready') {
    if (enabled) return { r: 0.15, g: 0.58, b: 0.30, text: $.NSColor.whiteColor };
    return { r: 0.42, g: 0.56, b: 0.46, text: $.NSColor.whiteColor };
  }
  if (state === 'exists') {
    var ink = rgb(0.12, 0.10, 0.02);
    if (enabled) return { r: 0.98, g: 0.80, b: 0.18, text: ink };
    return { r: 0.72, g: 0.66, b: 0.40, text: ink };
  }
  if (enabled) return { r: 0.10, g: 0.38, b: 0.78, text: $.NSColor.whiteColor };
  return { r: 0.45, g: 0.49, b: 0.54, text: $.NSColor.whiteColor };
}

function prepareTitleLines(state) {
  if (state === 'ready') return [prepareReadyTitle()];
  if (state === 'exists') return [prepareExistsTitle()];
  return null;
}

function prepareTitleLabel(state) {
  var lines = prepareTitleLines(state);
  if (!lines) return prepareButtonTitle();
  return lines[0];
}

function stylePrimaryTitle(button, enabled) {
  if (!button) return;
  var state = prepareVisualState();
  if (enabled === undefined) enabled = true;
  var palette = preparePalette(state, !!enabled);
  var fontSize = PREPARE_TITLE_SIZE;
  var font = $.NSFont.boldSystemFontOfSize(fontSize);
  var bounds = viewSize(button, 780, 56);
  var lines = prepareTitleLines(state);
  var label = prepareTitleLabel(state);
  if (lines) {
    var maxW = bounds.width > 40 ? bounds.width - 24 : 800;
    var zhW = measureText(lines[0], font).width;
    var enW = measureText(lines[1], font).width;
    if (zhW > maxW || enW > maxW) {
      fontSize = 13;
      font = $.NSFont.boldSystemFontOfSize(fontSize);
    }
  }
  var image = null;
  try {
    if (lines) {
      image = makeStackedTitleImage(lines, font, palette.text, bounds.width, bounds.height);
    } else {
      image = makeCenteredTitleImage(label, font, palette.text, bounds.width, bounds.height);
    }
  } catch (e0) {
    image = null;
  }
  try { button.setAttributedTitle(objc($.NSAttributedString.alloc).initWithString($(''))); } catch (e1) {}
  if (!image) {
    try { button.setTitle($(label)); } catch (e2) {}
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
  try { button.setAccessibilityLabel($(label)); } catch (e9) {}
  try { button.setToolTip($(label)); } catch (e10) {}
}

function prepareDestWantsCheck() {
  var dest = '';
  var source = '';
  try { dest = normalize(fieldText(destField)); } catch (e0) { dest = ''; }
  try { source = normalize(fieldText(sourceField)); } catch (e1) { source = ''; }
  if (!dest || !endsWithApp(dest)) return false;
  if (!fileExists(dest)) return false;
  if (!fileExists(joinPath(dest, 'Contents/Info.plist'))) return false;
  if (source && dest.toLowerCase() === source.toLowerCase()) return false;
  return true;
}

function prepareIsDetecting() {
  // Gray + spinner while an on-disk copy awaits entitlements check.
  // 磁盘上已有副本、等待 entitlements 检测完成时：灰底 + 旋转图标。
  if (prepareCheckResult !== null) return false;
  return prepareDestWantsCheck();
}

function paintPrepareButton(enabled) {
  if (!prepareButton) return;
  if (prepareIsDetecting()) {
    setButtonSpinnerActive(prepareSpinner, prepareButton, true);
    var grey = actionPalette('neutral', !!enabled);
    if (prepareFill) {
      try { prepareFill.setFillColor(rgb(grey.r, grey.g, grey.b)); } catch (eFill) {}
    }
    paintLayer(prepareButton, grey.r, grey.g, grey.b, 6);
    paintFlatButton(
      prepareButton,
      null,
      grey,
      [detectingPrepareTitle()],
      13,
      false,
      detectingPrepareTitle(),
      28
    );
    try { prepareButton.setBezelColor(rgb(grey.r, grey.g, grey.b)); } catch (eBez) {}
    return;
  }
  setButtonSpinnerActive(prepareSpinner, prepareButton, false);
  var palette = preparePalette(prepareVisualState(), !!enabled);
  if (prepareFill) {
    try { prepareFill.setFillColor(rgb(palette.r, palette.g, palette.b)); } catch (e) {}
  }
  paintLayer(prepareButton, palette.r, palette.g, palette.b, 6);
  stylePrimaryTitle(prepareButton, !!enabled);
  try { prepareButton.setBezelColor(rgb(palette.r, palette.g, palette.b)); } catch (e2) {}
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

function imageScaleNone() {
  // NSImageScaleNone — keep 1:1 so multi-line title images are not shrunk/clipped.
  // NSImageScaleNone：按 1:1 显示，避免多行标题图被缩放裁切。
  try {
    var raw = $.NSImageScaleNone;
    var n = typeof raw === 'number' ? raw : Number(unwrap(raw));
    if (!isNaN(n)) return n;
  } catch (e) {}
  return 2;
}

function applyImageOnly(button, image, label) {
  try { image.setTemplate(false); } catch (e0) {}
  try { button.setTitle($('')); } catch (e1) {}
  try { button.setImage(image); } catch (e2) {}
  var only = imagePositionOnly();
  var fit = imageScaleNone();
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

function actionPalette(state, enabled) {
  if (state === 'neutral') {
    if (enabled) return { r: 0.90, g: 0.91, b: 0.93, text: rgb(0.15, 0.15, 0.16) };
    return { r: 0.86, g: 0.86, b: 0.88, text: rgb(0.35, 0.35, 0.36) };
  }
  // Orange: no-permission / cannot detect sync (distinct from yellow "older side").
  // 橙色：无权限/无法检测（与黄色「较旧一侧」区分）。
  if (state === 'orange') {
    var ink = rgb(0.18, 0.08, 0.02);
    if (enabled) return { r: 0.96, g: 0.48, b: 0.12, text: ink };
    return { r: 0.72, g: 0.46, b: 0.28, text: ink };
  }
  // Cyan 青色: fingerprint DIFFERENT and this button's source is newer (or equal-mtime differ).
  // Distinct from idle blue (identical+older) and from green (identical+newer).
  // 青色：内容不同且本钮源较新（或内容不同但 mtime 相同）。区别于蓝（相同+较旧）与绿（相同+较新）。
  if (state === 'cyan') {
    var cyanInk = $.NSColor.whiteColor;
    if (enabled) return { r: 0.00, g: 0.72, b: 0.78, text: cyanInk };
    return { r: 0.35, g: 0.58, b: 0.62, text: cyanInk };
  }
  return preparePalette(state, enabled);
}

function fitFont(lines, width, startSize, bold, minSize) {
  var size = startSize;
  var inset = width > 40 ? width - 20 : width;
  var font = null;
  if (!(minSize > 0)) minSize = 10;
  while (size >= minSize) {
    font = bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
    var fits = true;
    var i;
    for (i = 0; i < lines.length; i++) {
      if (measureText(lines[i], font).width > inset) fits = false;
    }
    if (fits) return font;
    size -= 1;
  }
  if (bold) return $.NSFont.boldSystemFontOfSize(minSize);
  return $.NSFont.systemFontOfSize(minSize);
}

// NSProgressIndicator spinning accessory for detect-in-progress buttons.
// 检测中按钮用的旋转进度指示器（NSProgressIndicator spinning）。
function makeButtonSpinner(button, size) {
  if (!button) return null;
  if (!(size > 0)) size = 16;
  var bounds = viewSize(button, 200, 48);
  var y = Math.round((bounds.height - size) / 2);
  if (y < 2) y = 2;
  var spinner = null;
  try {
    spinner = objc($.NSProgressIndicator.alloc).initWithFrame($.NSMakeRect(10, y, size, size));
  } catch (e0) {
    return null;
  }
  try { spinner.setStyle(1); } catch (e1) {} // NSProgressIndicatorStyleSpinning
  try { spinner.setIndeterminate(true); } catch (e2) {}
  try { spinner.setDisplayedWhenStopped(false); } catch (e3) {}
  try { spinner.setControlSize(1); } catch (e4) {} // NSControlSizeSmall
  try { spinner.setUsesThreadedAnimation(true); } catch (e5) {}
  try { button.addSubview(spinner); } catch (e6) {}
  try { spinner.setHidden(true); } catch (e7) {}
  return spinner;
}

function setButtonSpinnerActive(spinner, button, active) {
  if (!spinner) return;
  if (active && button) {
    try {
      var bounds = viewSize(button, 200, 48);
      var frame = spinner.frame;
      var size = 16;
      try { size = asNumber(frame.size.width) || 16; } catch (eSz) { size = 16; }
      var y = Math.round((bounds.height - size) / 2);
      if (y < 2) y = 2;
      spinner.setFrame($.NSMakeRect(10, y, size, size));
    } catch (eFrame) {}
  }
  try {
    if (active) {
      spinner.setHidden(false);
      objc(spinner.startAnimation);
    } else {
      objc(spinner.stopAnimation);
      spinner.setHidden(true);
    }
  } catch (eAnim) {
    try { spinner.setHidden(!active); } catch (eHide) {}
  }
}

function paintFlatButton(button, fill, palette, lines, startSize, bold, tooltip, leftInset) {
  if (!button || !lines || !lines.length) return;
  if (fill) {
    try { fill.setFillColor(rgb(palette.r, palette.g, palette.b)); } catch (eFill) {}
  }
  paintLayer(button, palette.r, palette.g, palette.b, 6);
  var bounds = viewSize(button, 480, 48);
  var inset = leftInset > 0 ? leftInset : 0;
  var drawW = bounds.width - inset;
  if (drawW < 40) drawW = bounds.width;
  var font = fitFont(lines, drawW, startSize, !!bold, 10);
  var image = null;
  try {
    if (lines.length === 1) image = makeCenteredTitleImage(lines[0], font, palette.text, drawW, bounds.height);
    else image = makeStackedTitleImage(lines, font, palette.text, drawW, bounds.height);
  } catch (eImage) {
    image = null;
  }
  // When a spinner sits on the left, pad the title image so text stays clear of it.
  // 左侧有旋转图标时，给标题图左侧留白，避免文字压住 spinner。
  if (image && inset > 0) {
    try {
      var padded = objc($.NSImage.alloc).initWithSize($.NSMakeSize(bounds.width, bounds.height));
      objc(padded.lockFocus);
      image.drawInRectFromRectOperationFraction($.NSMakeRect(inset, 0, drawW, bounds.height), $.NSMakeRect(0, 0, drawW, bounds.height), 2, 1.0);
      objc(padded.unlockFocus);
      try { padded.setTemplate(false); } catch (ePadTpl) {}
      image = padded;
    } catch (ePad) {}
  }
  var label = tooltip || lines.join('\n');
  try { button.setAttributedTitle(objc($.NSAttributedString.alloc).initWithString($(''))); } catch (eAttr) {}
  if (!image) {
    try { button.setTitle($(lines.join(' / '))); } catch (eTitle) {}
    try { button.setToolTip($(label)); } catch (eTip) {}
    return;
  }
  applyImageOnly(button, image, label);
  try { button.setBezelColor(rgb(palette.r, palette.g, palette.b)); } catch (eBezel) {}
}

function makeFlatButton(x, y, w, h, action, title) {
  var fill = null;
  try {
    fill = objc($.NSBox.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
    fill.setTitle($(''));
    fill.setTitlePosition(0);
    fill.setBoxType(4);
    fill.setBorderType(0);
    fill.setBorderWidth(0);
    fill.setCornerRadius(6);
    fill.setFillColor(rgb(0.90, 0.91, 0.93));
    fill.setTransparent(false);
  } catch (eBox) {
    fill = null;
  }
  var button = objc($.NSButton.alloc).initWithFrame($.NSMakeRect(x, y, w, h));
  button.setTitle($(title || ''));
  button.setBordered(false);
  button.setTarget(controller);
  if (action) button.setAction(action);
  try { button.setFocusRingType(1); } catch (eRing) {}
  try {
    var cell = objc(button.cell);
    cell.setBordered(false);
    cell.setBackgroundColor(objc($.NSColor.clearColor));
  } catch (eCell) {}
  return { fill: fill, button: button };
}

function downloadPaletteState(visual) {
  // ready=green, upstream/原版=yellow(exists), outdated melody-fork=cyan, idle=blue
  if (visual === 'ready') return 'ready';
  if (visual === 'outdated') return 'cyan';
  if (visual === 'upstream') return 'exists';
  return 'idle';
}

function downloadVisualState() {
  if (!localModScanDone) return 'idle';
  if (!shared || !shared.downloadButtonState) return 'idle';
  try {
    var mods = localModEntries && localModEntries.length ? localModEntries : localModVersions;
    return shared.downloadButtonState(mods, releaseVersion, releaseKnown);
  } catch (e) {
    return 'idle';
  }
}

function installedCoopVersionLabel(preferMelody) {
  if (shared && shared.pickInstalledVersionLabel) {
    try {
      return String(shared.pickInstalledVersionLabel(localModEntries && localModEntries.length ? localModEntries : localModVersions, !!preferMelody) || '-');
    } catch (e) {}
  }
  if (localModVersions && localModVersions.length) return String(localModVersions[0] || '-');
  return '-';
}

function downloadTitleLines(visual) {
  var installed = installedCoopVersionLabel(visual === 'outdated' || visual === 'ready');
  var latest = releaseVersion || '-';
  if (visual === 'ready') {
    return [
      L(
        '当前已经是最新的支持 Mac 的联机 Mod（版本号：' + installed + '）',
        'Already have the latest Mac-compatible co-op Mod (version: ' + installed + ')'
      ),
      L('无需重新下载', 'No need to download again')
    ];
  }
  if (visual === 'outdated') {
    return [
      L(
        '当前已经存在支持 Mac 的联机 Mod（版本号：' + installed + '），但不是最新版本',
        'Mac-compatible co-op Mod is installed (version: ' + installed + '), but it is not the latest'
      ),
      L(
        '点此自动下载最新版本（版本号：' + latest + '）的支持 Mac 的联机 Mod 到副本 Mods 位置',
        'Click to auto-download the latest Mac-compatible co-op Mod (version: ' + latest + ') into the copy\'s Mods folder'
      )
    ];
  }
  if (visual === 'upstream') {
    installed = installedCoopVersionLabel(false);
    return [
      L(
        '当前是原版联机 Mod（版本号：' + installed + '），暂不支持 Mac 联机',
        'Current co-op Mod is the original build (version: ' + installed + '); Mac co-op is not supported yet'
      ),
      L(
        '点此自动下载最新版本的支持 Mac 的联机 Mod 到副本 Mods 位置',
        'Click to auto-download the latest Mac-compatible co-op Mod into the copy\'s Mods folder'
      )
    ];
  }
  // idle — no coop mod
  return [
    L('当前没有联机 Mod', 'No co-op Mod is installed'),
    L(
      '点此自动下载最新版本的支持 Mac 的联机 Mod 到副本 Mods 位置',
      'Click to auto-download the latest Mac-compatible co-op Mod into the copy\'s Mods folder'
    )
  ];
}

function rememberLocalMods(found) {
  var versions = [];
  var entries = [];
  var i;
  if (found) {
    for (i = 0; i < found.length; i++) {
      versions.push(found[i].version);
      entries.push({
        version: found[i].version,
        channel: found[i].channel || '-',
        path: found[i].path || ''
      });
    }
  }
  localModVersions = versions;
  localModEntries = entries;
  localModScanDone = true;
}

function noteDownloadVisual(visual) {
  if (!localModScanDone) return;
  // upstream (原版) can be announced before Release check; fork states wait for it.
  if (localModEntries.length > 0 && !releaseCheckFinished && visual !== 'upstream') return;
  var zh = '';
  var en = '';
  var installedFork = installedCoopVersionLabel(true);
  var installedAny = installedCoopVersionLabel(false);
  if (visual === 'ready') {
    zh = '副本里已是最新的支持 Mac 的联机 Mod（版本号：' + installedFork + '），下载按钮为绿色。点击不会重复下载。';
    en = 'The copy already has the latest Mac-compatible co-op Mod (version: ' + installedFork + '). The download button is green. A click will not download it again.';
  } else if (visual === 'outdated') {
    zh = '副本里已有支持 Mac 的联机 Mod（版本号：' + installedFork + '），但不是最新（' + releaseVersion + '），下载按钮为青色。';
    en = 'Mac-compatible co-op Mod is installed (version: ' + installedFork + ') but is not the latest (' + releaseVersion + '). The download button is cyan.';
  } else if (visual === 'upstream') {
    zh = '副本里是原版联机 Mod（版本号：' + installedAny + '），暂不支持 Mac 联机，下载按钮为黄色。';
    en = 'The copy has the original co-op Mod (version: ' + installedAny + '); Mac co-op is not supported yet. The download button is yellow.';
  } else if (localModEntries.length === 0) {
    zh = '当前没有联机 Mod，下载按钮为蓝色。';
    en = 'No co-op Mod is installed. The download button is blue.';
  } else {
    zh = '无法确认 GitHub 上的最新 Release，下载按钮保持蓝色。';
    en = 'Could not confirm the latest GitHub Release. The download button stays blue.';
  }
  var key = zh + '\n' + en;
  if (!zh || key === lastDownloadLogKey) return;
  lastDownloadLogKey = key;
  appendLogFile(key + '\n');
}

function downloadIsDetecting() {
  // Gray + spinner until local Mods scan settles, and (when the Release API
  // helper is available) until the async Release compare finishes.
  // 本地 Mods 扫描完成前保持检测中；若有 Release 核对能力，也等到核对结束。
  // 没有 selectCoopModAsset 时不要一直转圈（无法发起核对）。
  if (!localModScanDone) return true;
  if (!releaseCheckFinished && shared && shared.selectCoopModAsset) return true;
  return false;
}

function paintDownloadButton(enabled) {
  if (!downloadButton) return;
  if (downloadIsDetecting()) {
    setButtonSpinnerActive(downloadSpinner, downloadButton, true);
    paintFlatButton(
      downloadButton,
      downloadFill,
      actionPalette('neutral', !!enabled),
      [detectingVersionTitle()],
      13,
      false,
      detectingVersionTitle(),
      28
    );
    return;
  }
  setButtonSpinnerActive(downloadSpinner, downloadButton, false);
  var visual = downloadVisualState();
  var lines = downloadTitleLines(visual);
  var tip = lines && lines.length ? lines.join(' / ') : downloadModTitle();
  paintFlatButton(
    downloadButton,
    downloadFill,
    actionPalette(downloadPaletteState(visual), !!enabled),
    lines,
    visual === 'ready' ? 13 : 11,
    visual === 'ready',
    tip
  );
  noteDownloadVisual(visual);
}

function localOffsetMinutes(epochSeconds) {
  var epoch = Number(epochSeconds);
  if (!isFinite(epoch)) epoch = 0;
  try {
    var tz = objc($.NSTimeZone.localTimeZone);
    var date = $.NSDate.dateWithTimeIntervalSince1970(epoch);
    var seconds = NaN;
    try { seconds = asNumber(tz.secondsFromGMTForDate(date)); } catch (e1) { seconds = NaN; }
    if (!isFinite(seconds)) {
      try { seconds = asNumber(objc(tz.secondsFromGMT)); } catch (e2) { seconds = NaN; }
    }
    if (isFinite(seconds)) return Math.round(seconds / 60);
  } catch (e) {}
  return 480;
}

function syncColorName(color) {
  if (color === 'green') return 'ready';
  if (color === 'yellow') return 'exists';
  if (color === 'orange') return 'orange';
  if (color === 'blue') return 'idle';
  if (color === 'cyan') return 'cyan';
  return 'neutral';
}

function syncSideEpoch(which) {
  if (!syncVisual) return null;
  var epoch = which === 'to-coop' ? syncVisual.originalMtime : syncVisual.coopMtime;
  if (epoch == null || epoch === '') return null;
  var n = Number(epoch);
  return isFinite(n) ? n : null;
}

function syncSideReadable(which) {
  // Fresh readable flag from this fingerprint only — never infer from mtime alone.
  // 只用本轮指纹的可读标记，绝不单靠 mtime 推断有权限。
  if (!syncVisual) return false;
  if (which === 'to-coop') return !!syncVisual.originalReadable;
  return !!syncVisual.coopReadable;
}

function syncButtonAccessOk(which) {
  // CONFIG write-probe only (originalConfigDir / coopConfigDir). Mods open must never feed this.
  // BOTH outbound sync buttons require original CONFIG write-probe success this round.
  // 只看配置目录写入探测；Mods 打开不得影响。两侧都要求原版配置写入探测成功。
  if (!syncVisual) return false;
  if (syncVisual.originalReadable !== true) return false;
  var epoch = syncSideEpoch(which);
  if (epoch == null) return false;
  if (which === 'to-coop') {
    // Left button: original → coop. Needs original readable + original mtime (epoch above).
    // 左侧：原版→副本。需要原版可读 + 原版 mtime。
    return syncVisual.originalReadable === true;
  }
  // Right button: coop → original. Needs coop readable + coop mtime, and original still OK.
  // 右侧：副本→原版。需要副本可读 + 副本 mtime，且原版仍可写。
  return syncVisual.coopReadable === true;
}

function syncPermissionHintText() {
  // CONFIG detect/sync button subtitle only — not Mods / Finder open.
  // 仅配置检测/同步按钮副行，不是 Mods / 访达打开。
  return L(
    '需要授权：「系统设置 → 隐私与安全性 → 完全磁盘访问权限」添加 /bin/bash',
    'Permission needed: add /bin/bash under System Settings → Privacy & Security → Full Disk Access'
  );
}

function syncNoPermTitle() {
  return L(
    '同步文件（但现在没有权限，点此打开系统权限页面）',
    'Sync files (no permission — tap to open system settings)'
  );
}

function syncNoPermSubtitle() {
  return L(
    '授权方式：「系统设置 → 隐私与安全性 → 完全磁盘访问权限」添加 /bin/bash 并打开开关',
    'How: System Settings → Privacy & Security → Full Disk Access → add /bin/bash and turn it on'
  );
}

function syncConfigNeedsPermission() {
  // Settled CONFIG no-perm: unreadable fingerprint or original write-probe failed.
  // 已结算且配置无权限：指纹不可读，或原版写入探测失败。
  if (syncIsDetecting() || !syncVisual) return false;
  if (syncVisual.status === 'unreadable') return true;
  if (syncVisual.originalReadable !== true) return true;
  return false;
}

function setSyncViewFrame(view, x, y, w, h) {
  if (!view) return;
  try { view.setFrame($.NSMakeRect(x, y, w, h)); } catch (e) {}
}

function applySyncButtonLayout(noPerm) {
  if (!syncLayoutGeom || !syncToCoopButton) return;
  var g = syncLayoutGeom;
  syncButtonsNoPermMode = !!noPerm;
  if (noPerm) {
    // Same width/centering as Step1 Prepare and Step3 download (BIG_BUTTON_WIDTH_RATIO).
    // 与第一步准备、第三步下载大按钮同宽居中。
    var w = g.bigW > 0 ? g.bigW : Math.round(g.rowW * BIG_BUTTON_WIDTH_RATIO);
    var x = g.bigX != null ? g.bigX : (g.x + Math.round((g.rowW - w) / 2));
    setSyncViewFrame(syncToCoopFill, x, g.y, w, g.h);
    setSyncViewFrame(syncToCoopButton, x, g.y, w, g.h);
    try { syncToCoopButton.setAction('openSyncPermissionSettings:'); } catch (eAct) {}
    try { if (syncToOriginalButton) syncToOriginalButton.setHidden(true); } catch (eH1) {}
    try { if (syncToOriginalFill) syncToOriginalFill.setHidden(true); } catch (eH2) {}
    try { if (syncToOriginalSpinner) syncToOriginalSpinner.setHidden(true); } catch (eH3) {}
  } else {
    setSyncViewFrame(syncToCoopFill, g.x, g.y, g.halfW, g.h);
    setSyncViewFrame(syncToCoopButton, g.x, g.y, g.halfW, g.h);
    setSyncViewFrame(syncToOriginalFill, g.x + g.halfW + g.gap, g.y, g.halfW, g.h);
    setSyncViewFrame(syncToOriginalButton, g.x + g.halfW + g.gap, g.y, g.halfW, g.h);
    try { syncToCoopButton.setAction('syncOriginalToCoop:'); } catch (eA1) {}
    try { if (syncToOriginalButton) syncToOriginalButton.setAction('syncCoopToOriginal:'); } catch (eA2) {}
    try { if (syncToOriginalButton) syncToOriginalButton.setHidden(false); } catch (eS1) {}
    try { if (syncToOriginalFill) syncToOriginalFill.setHidden(false); } catch (eS2) {}
  }
}

function onOpenSyncPermissionSettings() {
  appendLogFile(L(
    '正在打开「完全磁盘访问权限」设置页…\n',
    'Opening Full Disk Access settings…\n'
  ));
  if (!openContainerAccessSettings()) {
    showAlert(
      L('无法打开系统设置', 'Could not open System Settings'),
      fullDiskAccessText()
    );
  }
}

function formatStampLocalZh(epochSeconds) {
  // Format with macOS local timezone (Asia/Shanghai on Melody's Mac), not UTC.
  // 用系统本地时区格式化（她这边是 Asia/Shanghai），不要用 UTC。
  var epoch = Number(epochSeconds);
  if (!isFinite(epoch)) return '';
  try {
    var date = $.NSDate.dateWithTimeIntervalSince1970(epoch);
    var fmt = objc(objc($.NSDateFormatter.alloc).init);
    try { fmt.setLocale($.NSLocale.localeWithLocaleIdentifier('zh_CN')); } catch (eLoc) {}
    try { fmt.setTimeZone(objc($.NSTimeZone.localTimeZone)); } catch (eTz) {}
    fmt.setDateFormat('yyyy年MM月dd日 HH:mm:ss');
    var s = unwrap(fmt.stringFromDate(date));
    return s ? String(s) : '';
  } catch (e) {
    // Fallback: offset + shared formatter (must pass local offset, not 0).
    try {
      if (syncStateApi && syncStateApi.formatSyncStamp) {
        var stamp = syncStateApi.formatSyncStamp(epoch, localOffsetMinutes(epoch));
        return stamp && stamp.zh ? String(stamp.zh) : '';
      }
    } catch (e2) {}
    return '';
  }
}

function syncSourceAgeTag(which) {
  // Second-line suffix from this button's SOURCE mtime vs the other side.
  // Omit when detecting / either mtime missing (no false newer/older).
  // 第二行后缀：本钮「源」mtime 相对另一侧。检测中或缺 mtime 时不加。
  if (!syncVisual || syncIsDetecting()) return '';
  var o = syncVisual.originalMtime;
  var c = syncVisual.coopMtime;
  var oN = (o == null || o === '') ? NaN : Number(o);
  var cN = (c == null || c === '') ? NaN : Number(c);
  if (!(isFinite(oN) && isFinite(cN))) return '';
  var sourceN = which === 'to-coop' ? oN : cN;
  var otherN = which === 'to-coop' ? cN : oN;
  if (sourceN === otherN) return L('（完全相同）', '(identical)');
  if (sourceN > otherN) return L('（较新）', '(newer)');
  return L('（较旧）', '(older)');
}

function syncButtonLinesLocal(which, epochSeconds) {
  var lines = [which === 'to-coop' ? syncToCoopTitle() : syncToOriginalTitle()];
  if (epochSeconds == null || epochSeconds === '') return lines;
  var stamp = '';
  try {
    if (uiLang === 'en' && syncStateApi && syncStateApi.formatSyncStamp) {
      var enStamp = syncStateApi.formatSyncStamp(epochSeconds, localOffsetMinutes(epochSeconds));
      if (enStamp && enStamp.en) stamp = lastUpdatedPrefix() + enStamp.en;
    }
  } catch (eEn) { stamp = ''; }
  if (!stamp) {
    var zh = formatStampLocalZh(epochSeconds);
    if (zh) stamp = lastUpdatedPrefix() + zh;
  }
  if (!stamp) return lines;
  var age = syncSourceAgeTag(which);
  if (age) stamp = stamp + age;
  return lines.concat([stamp]);
}

function syncPresentation(which) {
  // Detecting → grey (paintSyncButtons). Access fail → orange.
  // Settled colors: syncOutboundPaintColor decision table (identical vs different × newer/older).
  // 检测中灰；无权限橙；已结算颜色见 syncOutboundPaintColor 决策表。
  var lines = [which === 'to-coop' ? syncToCoopTitle() : syncToOriginalTitle()];
  if (!syncButtonAccessOk(which)) {
    lines = lines.concat([syncPermissionHintText()]);
    return { lines: lines, color: 'orange' };
  }
  var epoch = syncSideEpoch(which);
  lines = syncButtonLinesLocal(which, epoch);
  var color = syncOutboundPaintColor(which);
  return { lines: lines, color: color };
}

function syncOutboundPaintColor(which) {
  // Decision table (both sides permission + finite mtime; else caller already orange/grey):
  // | identical | source vs other | color   |
  // | true      | newer           | green   |
  // | true      | older           | blue    |
  // | true      | equal mtime     | green   |  (default: both green)
  // | false     | newer           | cyan    |  青色
  // | false     | older           | yellow  |
  // | false     | equal mtime     | cyan    |  (prefer both cyan when content differs)
  // Source: left to-coop = original; right to-original = coop.
  // Deleted short-circuits: forcing both buttons green on fingerprint match; mtime-only green/yellow ignoring identical.
  // 已删除：指纹相同就两边硬绿；以及无视 identical 只按 mtime 绿/黄。
  if (!syncVisual) return 'yellow';
  var identical = !!(syncVisual.identical || syncVisual.status === 'identical');
  var o = syncVisual.originalMtime;
  var c = syncVisual.coopMtime;
  var oN = (o == null || o === '') ? NaN : Number(o);
  var cN = (c == null || c === '') ? NaN : Number(c);
  if (!(isFinite(oN) && isFinite(cN))) {
    // Missing mtime should already be orange via accessOk; keep a safe fallback.
    return identical ? 'green' : 'yellow';
  }
  var sourceIsOriginal = which === 'to-coop';
  var sourceN = sourceIsOriginal ? oN : cN;
  var otherN = sourceIsOriginal ? cN : oN;
  if (sourceN === otherN) {
    return identical ? 'green' : 'cyan';
  }
  var sourceNewer = sourceN > otherN;
  if (identical) {
    return sourceNewer ? 'green' : 'blue';
  }
  return sourceNewer ? 'cyan' : 'yellow';
}

function syncIsDetecting() {
  // Detecting while fingerprint compare has not settled (syncVisual still null).
  // 配置指纹尚未比较完成（syncVisual 仍为 null）时视为检测中。
  return !!syncStateApi && !syncVisual;
}

function paintSyncButtons(enabled) {
  if (syncIsDetecting()) {
    applySyncButtonLayout(false);
    var grey = actionPalette('neutral', !!enabled);
    var detectLines = [detectingConfigTitle()];
    var tip = detectingConfigTitle();
    setButtonSpinnerActive(syncToCoopSpinner, syncToCoopButton, true);
    setButtonSpinnerActive(syncToOriginalSpinner, syncToOriginalButton, true);
    paintFlatButton(syncToCoopButton, syncToCoopFill, grey, detectLines, 12, false, tip, 28);
    paintFlatButton(syncToOriginalButton, syncToOriginalFill, grey, detectLines, 12, false, tip, 28);
    return;
  }
  setButtonSpinnerActive(syncToCoopSpinner, syncToCoopButton, false);
  setButtonSpinnerActive(syncToOriginalSpinner, syncToOriginalButton, false);
  // No permission: one centered wider orange button that opens FDA settings.
  // 无权限：只显示一个居中稍长的橙色按钮，点击打开系统权限页。
  if (syncConfigNeedsPermission()) {
    applySyncButtonLayout(true);
    var denyLines = [syncNoPermTitle(), syncNoPermSubtitle()];
    paintFlatButton(
      syncToCoopButton,
      syncToCoopFill,
      actionPalette('orange', !!enabled),
      denyLines,
      12,
      false,
      denyLines.join('\n')
    );
    return;
  }
  applySyncButtonLayout(false);
  var toCoop = syncPresentation('to-coop');
  var toOriginal = syncPresentation('to-original');
  paintFlatButton(syncToCoopButton, syncToCoopFill, actionPalette(syncColorName(toCoop.color), !!enabled), toCoop.lines, 12, false, toCoop.lines.join('\n'));
  paintFlatButton(syncToOriginalButton, syncToOriginalFill, actionPalette(syncColorName(toOriginal.color), !!enabled), toOriginal.lines, 12, false, toOriginal.lines.join('\n'));
}

function paintOpenConfigButtons() {
  var grey = actionPalette('neutral', true);
  paintFlatButton(
    openOriginalConfigButton,
    openOriginalFill,
    grey,
    [openOriginalConfigTitle()],
    12,
    false,
    openOriginalConfigTitle()
  );
  paintFlatButton(
    openCoopConfigButton,
    openCoopFill,
    grey,
    [openCoopConfigTitle()],
    12,
    false,
    openCoopConfigTitle()
  );
}

function paintOpenModsButtons() {
  var grey = actionPalette('neutral', true);
  paintFlatButton(
    openOriginalModsButton,
    openOriginalModsFill,
    grey,
    [openOriginalModsTitle()],
    12,
    false,
    openOriginalModsTitle()
  );
  paintFlatButton(
    openCoopModsButton,
    openCoopModsFill,
    grey,
    [openCoopModsTitle()],
    12,
    false,
    openCoopModsTitle()
  );
}

function skipReadyDownload() {
  var exact = false;
  var i;
  if (shared && shared.versionsSame && releaseKnown) {
    for (i = 0; i < localModVersions.length; i++) {
      if (shared.versionsSame(localModVersions[i], releaseVersion)) exact = true;
    }
  }
  if (exact && localModVersions.length > 1) {
    appendLogFile('副本里已有版本 ' + releaseVersion + '，但还有重复的旧联机 Mod。将去掉重复项，不重新下载。\nVersion ' + releaseVersion + ' is already in the copy, along with a duplicate. Duplicates will be removed. The download was skipped.\n');
    startDedupe(releaseVersion);
    return;
  }
  var shown = localModVersions.join(', ');
  var zh = exact
    ? '副本里已经是版本 ' + releaseVersion + '，跳过下载。'
    : '副本里的联机 Mod（' + shown + '）已经不低于最新 Release（' + releaseVersion + '），跳过下载。';
  var en = exact
    ? 'The copy already has version ' + releaseVersion + '. Skipped the download.'
    : 'The co-op Mod in the copy (' + shown + ') is at least the latest Release (' + releaseVersion + '). Skipped the download.';
  appendLogFile(zh + '\n' + en + '\n');
  setStatus(zh + ' / ' + en, true);
  markStep(3);
  if (exact) {
    showAlert(
      '已是最新版本 / Already the latest version',
      '副本里已经是这个版本的联机 Mod（' + releaseVersion + '），无需重新下载。\n\nThe copy already has this co-op Mod version (' + releaseVersion + '). The download was skipped.\n\n' + fieldText(destField)
    );
  } else {
    showAlert(
      '已是最新版本 / Already the latest version',
      '副本里的联机 Mod 已经比最新 Release 更新，没有改成更旧的版本。\n\nThe co-op Mod in the copy is newer than the latest Release. It was not replaced with the older one.\n\n' + fieldText(destField)
    );
  }
}

function styleChromeButton(button) {
  if (!button) return;
  var r = 0.69;
  var g = 0.86;
  var b = 0.76;
  var fill = rgb(r, g, b);
  try { button.setBordered(false); } catch (e0) {}
  try { button.setFocusRingType(1); } catch (eRing) {}
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
      'toggleLanguage:': {
        types: ['void', ['id']],
        implementation: function () { guard(toggleUiLanguage); }
      },
      'refreshStep1:': {
        types: ['void', ['id']],
        implementation: function () { guard(refreshStep1Detect); }
      },
      'refreshStep2:': {
        types: ['void', ['id']],
        implementation: function () { guard(refreshStep2Detect); }
      },
      'refreshStep3:': {
        types: ['void', ['id']],
        implementation: function () { guard(refreshStep3Detect); }
      },
      'clearLog:': {
        types: ['void', ['id']],
        implementation: function () { guard(onClearLog); }
      },
      'chooseSource:': {
        types: ['void', ['id']],
        implementation: function () { guard(onChooseSource); }
      },
      'chooseDest:': {
        types: ['void', ['id']],
        implementation: function () { guard(onChooseDest); }
      },
      'controlTextDidChange:': {
        types: ['void', ['id']],
        implementation: function () { guard(onPathsEdited); }
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
      'openOriginalMods:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenOriginalMods); }
      },
      'openCoopMods:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenCoopMods); }
      },
      'syncOriginalToCoop:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onSync('1to2'); }); }
      },
      'syncCoopToOriginal:': {
        types: ['void', ['id']],
        implementation: function () { guard(function () { onSync('2to1'); }); }
      },
      'openSyncPermissionSettings:': {
        types: ['void', ['id']],
        implementation: function () { guard(onOpenSyncPermissionSettings); }
      },
      'poll:': {
        types: ['void', ['id']],
        implementation: function (timer) { onPoll(timer); }
      },
      'startDestModScan:': {
        types: ['void', ['id']],
        implementation: function () {
          try { startDestModScan(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'scanPoll:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onScanPoll(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'applicationDidFinishLaunching:': {
        types: ['void', ['id']],
        implementation: function () {
          try { clearInitialFocus(); } catch (eFocus) {}
          try { armFocusClear(); } catch (eArm) {}
          try { scheduleDestModScan(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
          try { scheduleReleaseCheck(); } catch (eRel) {
            try { appendLogFile('错误 / Error: ' + eRel); } catch (eLog2) {}
          }
          try { scheduleConfigCompare(); } catch (eCfg) {
            try { appendLogFile('错误 / Error: ' + eCfg); } catch (eLog3) {}
          }
          try { queuePrepareCheck(); } catch (ePrep) {
            try { appendLogFile('错误 / Error: ' + ePrep); } catch (eLog4) {}
          }
        }
      },
      'clearInitialFocus:': {
        types: ['void', ['id']],
        implementation: function () {
          try { clearInitialFocus(); } catch (eFocus) {}
        }
      },
      'startReleaseCheck:': {
        types: ['void', ['id']],
        implementation: function () {
          try { startReleaseCheck(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'releasePoll:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onReleasePoll(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'startConfigCompare:': {
        types: ['void', ['id']],
        implementation: function () {
          try { startConfigCompare(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'configCompareInProcess:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onConfigCompareInProcess(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'syncInProcess:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onSyncInProcess(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'configPoll:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onConfigPoll(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'startPrepareCheck:': {
        types: ['void', ['id']],
        implementation: function () {
          try { startPrepareCheck(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
      },
      'prepareCheckPoll:': {
        types: ['void', ['id']],
        implementation: function () {
          try { onPrepareCheckPoll(); } catch (error) {
            try { appendLogFile('错误 / Error: ' + error); } catch (eLog) {}
          }
        }
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
      return L(
        '下一步：先做第一步。点「选择…」指定已经安装的原版 Duckov.app，确认副本保存位置，再点蓝色「准备联机副本」。',
        'Next: start with Step 1. Click Choose and select the installed Duckov.app, confirm where to save the copy, then click the blue Prepare co-op copy button.'
      );
    }
    return L(
      '下一步：从第一步开始。确认原版游戏和副本保存位置，然后点蓝色「准备联机副本」。原版游戏不会被修改。',
      'Next: start with Step 1. Confirm the original game and where to save the copy, then click the blue Prepare co-op copy button. The original game is not modified.'
    );
  }
  if (!s1 && s2 && !s3) {
    return L(
      '配置文件夹看起来已经对齐。下一步仍请先做第一步：准备联机副本。',
      'The config folders already look aligned. Next, still start with Step 1: prepare the co-op copy.'
    );
  }
  if (!s1) {
    return L(
      '下一步：先做第一步，准备联机副本。原版游戏不会被修改。',
      'Next: start with Step 1 and prepare the co-op copy. The original game is not modified.'
    );
  }
  if (!s2 && !s3) {
    return L(
      '第一步已完成，副本已经准备好。下一步：做第二步，把原版配置（包括存档）同步到副本；再做第三步，安装支持 Mac 的联机 Mod。',
      'Step 1 is done and the co-op copy is ready. Next: do Step 2 to sync the original config (including saves) into the copy, then Step 3 to install the Mac-compatible co-op Mod.'
    );
  }
  if (s2 && !s3) {
    return L(
      '第一步和第二步已完成。下一步：做第三步。点下载按钮，或选择已经下载的支持 Mac 的联机 Mod，它会放进副本。',
      'Steps 1 and 2 are done. Next: do Step 3. Click the download button, or choose the Mac-compatible co-op Mod you already downloaded. It goes into the copy.'
    );
  }
  if (!s2 && s3) {
    return L(
      '副本和联机 Mod 已就绪。若要把原版存档带到副本，请做第二步：同步原版配置（包括存档）。同步前请退出两边的游戏。',
      'The copy and the co-op Mod are ready. To bring original saves into the copy, do Step 2: sync the original config (including saves). Quit both games before syncing.'
    );
  }
  return L(
    '已经满足Mac联机条件，请打开副本游戏 App 进行游戏',
    'Mac co-op requirements are met. Launch the co-op copy App to play.'
  );
}

function guideStatusText() {
  var source = '';
  try { source = normalize(fieldText(sourceField)); } catch (e) { source = ''; }
  var sourceMissing = !source || !fileExists(source);
  return guideTextFor(!!stepDone[1], !!stepDone[2], !!stepDone[3], sourceMissing);
}

function paintStepTitle(label, base, done, detecting) {
  // Markers sit leftmost: ⏳ while detecting, ✅ when done, otherwise plain.
  // 标记在最左侧：检测中 ⏳，完成 ✅，否则不加。
  if (!label) return;
  var text = base;
  var color = rgb(0.08, 0.27, 0.48);
  if (detecting) {
    text = '⏳ ' + base;
  } else if (done) {
    text = '✅ ' + base;
    color = rgb(0.0, 0.45, 0.18);
  }
  try { label.setStringValue($(text)); } catch (e0) {}
  try { label.setTextColor(color); } catch (e1) {}
}

function paintStep2Title() {
  // Leftmost: ⏳ detecting; ✅ identical; ⚠️ any other settled outcome.
  // 最左侧：检测中 ⏳；一致 ✅；其余已结算 ⚠️。
  if (!step2TitleLabel) return;
  var text = step2TitleText();
  var color = rgb(0.08, 0.27, 0.48);
  if (syncIsDetecting()) {
    text = '⏳ ' + step2TitleText();
  } else if (syncVisual && syncVisual.status === 'identical') {
    text = '✅ ' + step2TitleText();
    color = rgb(0.0, 0.45, 0.18);
  } else if (syncVisual) {
    text = '⚠️ ' + step2TitleText();
    color = rgb(0.78, 0.48, 0.05);
  }
  try { step2TitleLabel.setStringValue($(text)); } catch (e0) {}
  try { step2TitleLabel.setTextColor(color); } catch (e1) {}
}


function step2StatusLineDecision() {
  // Decision table (Step2 status line between open-location and sync buttons):
  // | state                         | color   | approx RGB        |
  // | detecting (no syncVisual)     | dark gray | #3A3A3C / 0.23^3 |
  // | content differ                | yellow  | #C9A010           |
  // | content same, mtimes differ   | blue    | #1A5FB4           |
  // | content same, mtimes same     | green   | #1B7A3A           |
  // | unreadable/unknown/missing    | dark gray (settled but inconclusive) |
  if (syncIsDetecting() || !syncVisual) {
    return { kind: 'detecting', color: rgb(0.23, 0.23, 0.24), text: L('正在比较两边配置…', 'Comparing the two config folders…') };
  }
  var identical = !!(syncVisual.identical || syncVisual.status === 'identical');
  var o = syncVisual.originalMtime;
  var c = syncVisual.coopMtime;
  var oN = (o == null || o === '') ? NaN : Number(o);
  var cN = (c == null || c === '') ? NaN : Number(c);
  var timesKnown = isFinite(oN) && isFinite(cN);
  var timesSame = timesKnown && oN === cN;
  if (syncVisual.status === 'unreadable') {
    // CONFIG no-perm only (bash FDA). Not Mods / Finder open.
    // 仅配置无权限（bash 磁盘访问）。与 Mods / 访达打开无关。
    return {
      kind: 'inconclusive-noperm',
      color: rgb(0.23, 0.23, 0.24),
      text: L(
        'bash没有磁盘访问权限，还不能判断两边配置是否一致。',
        'bash does not have disk access, so it cannot tell yet whether the two config folders match.'
      )
    };
  }
  if (syncVisual.status === 'unknown' || syncVisual.status === 'missing') {
    return {
      kind: 'inconclusive',
      color: rgb(0.23, 0.23, 0.24),
      text: L('还不能判断两边配置是否一致。', 'Cannot tell yet whether the two config folders match.')
    };
  }
  if (!identical) {
    return {
      kind: 'content-differ',
      color: rgb(0.79, 0.63, 0.06),
      text: L('两边配置内容不一致。', 'The two config folders differ in content.')
    };
  }
  if (timesKnown && !timesSame) {
    return {
      kind: 'content-same-time-differ',
      color: rgb(0.10, 0.37, 0.71),
      text: L('两边配置内容一致，但更新时间不同。', 'Config contents match, but the update times differ.')
    };
  }
  if (timesSame || !timesKnown) {
    // Equal times, or identical without usable mtimes → treat as fully aligned green when identical.
    return {
      kind: 'content-and-time-same',
      color: rgb(0.11, 0.48, 0.23),
      text: timesSame
        ? L('两边配置内容与更新时间都一致。', 'Config contents and update times both match.')
        : L('两边配置内容一致。', 'The two config folders match in content.')
    };
  }
  return {
    kind: 'inconclusive',
    color: rgb(0.23, 0.23, 0.24),
    text: L('还不能判断两边配置是否一致。', 'Cannot tell yet whether the two config folders match.')
  };
}

function paintStep2StatusLine() {
  if (!step2StatusLabel) return;
  var d = step2StatusLineDecision();
  try { step2StatusLabel.setStringValue($(d.text)); } catch (e0) {}
  try { step2StatusLabel.setTextColor(d.color); } catch (e1) {}
  // Always center. Use literal 1 (modern NSTextAlignmentCenter); named constant is legacy 2=right on arm64.
  // 始终居中。用字面量 1；具名 NSTextAlignmentCenter 在 arm64 仍是旧值 2（右对齐）。
  try { step2StatusLabel.setAlignment(1); } catch (eAlign) {}
  try {
    var cell = objc(step2StatusLabel.cell);
    cell.setAlignment(1);
  } catch (eAlign2) {}
  try {
    var key = d.kind + '|' + d.text;
    if (key !== lastStep2StatusLogKey) {
      lastStep2StatusLogKey = key;
      appendLogFile('[step2-status-line] kind=' + d.kind + ' text=' + d.text + '\\n');
    }
  } catch (eLog) {}
}

function paintStep3Title() {
  // Decision table (Step3 title leftmost symbol) — inputs → symbol:
  // | detecting | visual   | symbol |
  // | true      | *        | ⏳     |
  // | false     | ready    | ✅     |
  // | false     | outdated | ⚠️     |
  // | false     | upstream | ⚠️     |
  // | false     | idle     | ⚠️     |
  // detecting = downloadIsDetecting(); visual = downloadVisualState() when settled.
  // Do NOT leave ⏳ after Release/local compare finished (refresh from completeReleaseCheck).
  // 决策表见上。比较结束后不得仍显示 ⏳；completeReleaseCheck 必须刷新标题。
  if (!step3TitleLabel) return;
  var detecting = downloadIsDetecting();
  var visual = 'idle';
  if (!detecting) {
    try { visual = downloadVisualState(); } catch (eVis) { visual = 'idle'; }
  }
  // Sync done bit from settled ready visual — never from mere mod presence.
  // 完成位只看已结算的 ready，不因「副本里有联机 Mod」就 ✅。
  if (detecting) {
    stepDone[3] = false;
  } else if (!copyLooksPrepared()) {
    stepDone[3] = false;
  } else {
    stepDone[3] = visual === 'ready';
  }
  var symbol = '⚠️';
  var color = rgb(0.78, 0.48, 0.05);
  if (detecting) {
    symbol = '⏳';
    color = rgb(0.08, 0.27, 0.48);
  } else if (visual === 'ready') {
    symbol = '✅';
    color = rgb(0.0, 0.45, 0.18);
  }
  var text = symbol + ' ' + step3TitleText();
  try { step3TitleLabel.setStringValue($(text)); } catch (e0) {}
  try { step3TitleLabel.setTextColor(color); } catch (e1) {}
  try {
    appendLogFile(
      '[step3-title-paint] detecting=' + detecting +
      ' visual=' + visual +
      ' buttonReady=' + (visual === 'ready') +
      ' stepDone3=' + !!stepDone[3] +
      ' symbol=' + symbol +
      ' releaseCheckFinished=' + !!releaseCheckFinished +
      ' localModScanDone=' + !!localModScanDone +
      ' releaseKnown=' + !!releaseKnown +
      ' releaseVersion=' + releaseVersion +
      ' local=[' + localModVersions.join(',') + ']\n'
    );
  } catch (ePaintLog) {}
}

function paintStepHeaders() {
  paintStepTitle(step1TitleLabel, step1TitleText(), stepDone[1], prepareIsDetecting());
  paintStep2Title();
  paintStep2StatusLine();
  paintStep3Title();
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
  if (shared && shared.versionsSame) {
    try { return !!shared.versionsSame(a, b); } catch (e) {}
  }
  var left = normalizeVersionLabel(a);
  var right = normalizeVersionLabel(b);
  return !!left && left === right;
}

function parseCoopModLines(text) {
  var lines = String(text || '').split('\n');
  var out = [];
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('COOP_MOD\t') !== 0) continue;
    var parts = lines[i].split('\t');
    if (parts.length < 3) continue;
    // New: COOP_MOD \t version \t channel \t path
    // Legacy: COOP_MOD \t version \t path  (channel treated as 原版 "-")
    var version = parts[1];
    var channel = '-';
    var modPath = '';
    var maybeChannel = parts.length >= 3 ? (parts[2] || '') : '';
    // New format has channel as field 3. Legacy is version\tpath (path may contain tabs).
    // If field 3 looks like an absolute path, treat the rest as legacy path.
    if (parts.length >= 4 && maybeChannel.charAt(0) !== '/' && maybeChannel.charAt(0) !== '\\' && maybeChannel.indexOf(':\\') !== 1) {
      channel = maybeChannel || '-';
      modPath = parts.slice(3).join('\t');
    } else {
      modPath = parts.slice(2).join('\t');
      channel = '-';
    }
    if (String(channel).toLowerCase().replace(/[ \t]/g, '') !== 'melody-fork') channel = '-';
    out.push({ version: version, channel: channel, path: modPath });
  }
  return out;
}

function coopModListArgs(which, path) {
  var script = joinPath(resources, 'prepare-duckov-coop-app.sh');
  if (!script || !fileExists(script) || !path) return null;
  var args = ['/bin/bash', script, '--list-coop-mods'];
  if (which === 'dest') args.push('--dest', path);
  else args.push('--mods-dir', path);
  return args;
}

function listCoopMods(which, path) {
  var args = coopModListArgs(which, path);
  if (!args) return [];
  var result = null;
  try { result = runSync(args); } catch (e) { return []; }
  if (!result || result.code !== 0) return [];
  return parseCoopModLines(result.stdout);
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

// File checks only. Do not list mods here: that shells out and used to block
// init. buildInterface calls this before makeKeyAndOrderFront.
function detectExistingProgress() {
  // File checks only (do not shell out). Step1 ✅ waits for async entitlements check.
  // 只做文件检查（不要同步起进程）。第一步 ✅ 等异步 entitlements 检测。
  try {
    if (!copyLooksPrepared()) {
      stepDone[1] = false;
      stepDone[3] = false;
    }
    if (configsLookSynced()) stepDone[2] = true;
  } catch (e) {}
}

function invalidateScanTimer() {
  if (!scanTimer) return;
  try { objc(scanTimer.invalidate); } catch (e) {}
  scanTimer = null;
}

function closeScanHandles() {
  try { if (scanOutHandle) objc(scanOutHandle.closeFile); } catch (e1) {}
  try { if (scanErrHandle) objc(scanErrHandle.closeFile); } catch (e2) {}
  scanOutHandle = null;
  scanErrHandle = null;
}

function terminateScanTask() {
  if (scanTask && taskIsRunning(scanTask)) {
    try { objc(scanTask.terminate); } catch (e) {}
  }
  scanTask = null;
  closeScanHandles();
}

function cancelModScan() {
  scanToken += 1;
  scanDestKey = '';
  scanArmedToken = -1;
  invalidateScanTimer();
  terminateScanTask();
}

function finishDestModScan(key, found) {
  scanDestKey = '';
  var current = '';
  try { current = normalize(fieldText(destField)).toLowerCase(); } catch (e) { current = ''; }
  if (!key || current !== key) return;
  lastModScanDest = key;
  rememberLocalMods(found);
  // stepDone[3] / title symbol come from paintStep3Title (ready vs outdated/idle),
  // not from "any coop mod found". Presence alone used to leave ✅ while button was yellow.
  // 完成位与标题由 paintStep3Title 按 ready/outdated/idle 决定，不再「有 Mod 就 ✅」。
  if (busy) {
    paintStepHeaders();
    paintDownloadButton(false);
    maybeEndStep3Refresh();
    return;
  }
  refreshGuide();
  paintPrepareButton(true);
  paintDownloadButton(true);
  maybeEndStep3Refresh();
}

function armScanTimer(interval, selector, repeats) {
  scanTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    interval,
    controller,
    selector,
    null,
    !!repeats
  );
}

// Queue a --list-coop-mods read. The timer fires only after the run loop
// starts, so the window is already on screen. The callback launches NSTask
// and returns; it does not waitUntilExit.
function scheduleDestModScan() {
  if (quitting || !controller || !destField) return;
  var dest = '';
  var prepared = false;
  try {
    dest = normalize(fieldText(destField));
    prepared = copyLooksPrepared();
  } catch (e) {
    dest = '';
    prepared = false;
  }
  var key = dest ? dest.toLowerCase() : '';
  if (!key || !prepared) {
    localModVersions = [];
    localModEntries = [];
    localModScanDone = true;
    maybeEndStep3Refresh();
    return;
  }
  if (key === lastModScanDest) return;
  if (key === scanDestKey && scanTask) return;
  // A timer armed before -[NSApplication run] may never fire. Rearm it
  // once the run loop is up instead of treating that timer as progress.
  if (key === scanDestKey && scanTimer) invalidateScanTimer();
  else if (scanTimer || scanTask) cancelModScan();
  scanDestKey = key;
  scanArmedToken = scanToken;
  armScanTimer(0.05, 'startDestModScan:', false);
}

function startDestModScan() {
  invalidateScanTimer();
  if (quitting || scanToken !== scanArmedToken) return;
  var dest = '';
  var key = '';
  try {
    dest = normalize(fieldText(destField));
    key = dest.toLowerCase();
  } catch (e0) {
    return;
  }
  if (key !== scanDestKey || !copyLooksPrepared()) return;
  if (busy) {
    armScanTimer(0.4, 'startDestModScan:', false);
    return;
  }
  var args = coopModListArgs('dest', dest);
  if (!args) {
    finishDestModScan(key, []);
    return;
  }
  scanOutPath = joinPath(tempDir(), 'duckov-mod-scan-out.txt');
  scanErrPath = joinPath(tempDir(), 'duckov-mod-scan-err.txt');
  try {
    writeTextFile(scanOutPath, '');
    writeTextFile(scanErrPath, '');
  } catch (eWrite) {}
  var outHandle = null;
  var errHandle = null;
  try {
    scanTask = objc(objc($.NSTask.alloc).init);
    scanTask.setLaunchPath($(args[0]));
    var nsArgs = objc(objc($.NSMutableArray.alloc).init);
    var i;
    for (i = 1; i < args.length; i++) nsArgs.addObject($(String(args[i])));
    scanTask.setArguments(nsArgs);
    outHandle = $.NSFileHandle.fileHandleForWritingAtPath($(scanOutPath));
    errHandle = $.NSFileHandle.fileHandleForWritingAtPath($(scanErrPath));
    if (outHandle) scanTask.setStandardOutput(outHandle);
    if (errHandle) scanTask.setStandardError(errHandle);
    attachTaskEnvironment(scanTask, null);
    objc(scanTask.launch);
    scanOutHandle = outHandle;
    scanErrHandle = errHandle;
  } catch (error) {
    scanTask = null;
    try { if (outHandle) objc(outHandle.closeFile); } catch (eCloseOut) {}
    try { if (errHandle) objc(errHandle.closeFile); } catch (eCloseErr) {}
    finishDestModScan(key, []);
    return;
  }
  scanDeadlineMs = Date.now() + MOD_SCAN_LIMIT_MS;
  if (!taskIsRunning(scanTask)) {
    var quickCode = 1;
    try { quickCode = taskExitCode(scanTask); } catch (eQuick) { quickCode = 1; }
    scanTask = null;
    closeScanHandles();
    finishDestModScan(key, quickCode === 0 ? parseCoopModLines(readTextFile(scanOutPath)) : []);
    return;
  }
  armScanTimer(0.2, 'scanPoll:', true);
}

function onScanPoll() {
  var key = scanDestKey;
  var token = scanArmedToken;
  if (quitting || scanToken !== token) {
    invalidateScanTimer();
    terminateScanTask();
    return;
  }
  var running = false;
  try { running = taskIsRunning(scanTask); } catch (eRun) { running = false; }
  var timedOut = Date.now() > scanDeadlineMs;
  if (running && !timedOut) return;
  invalidateScanTimer();
  if (running) {
    try { objc(scanTask.terminate); } catch (eTerm) {}
    scanTask = null;
    closeScanHandles();
    appendLogFile('检查副本里的联机 Mod 超时。窗口保持打开，第一步状态仍然有效。\nChecking the copy for the co-op Mod timed out. The window stays open, and Step 1 status still applies.\n');
    finishDestModScan(key, []);
    return;
  }
  var code = 1;
  try { code = taskExitCode(scanTask); } catch (eCode) { code = 1; }
  scanTask = null;
  closeScanHandles();
  var found = [];
  if (code === 0) {
    try { found = parseCoopModLines(readTextFile(scanOutPath)); } catch (eRead) { found = []; }
  }
  finishDestModScan(key, found);
}

// Dest or source text changed. Step 1 follows whether that copy exists.
// A path prepared earlier this session stays green only while it still matches.
function syncStepsToDest() {
  var prepared = false;
  var destKey = '';
  try {
    prepared = copyLooksPrepared();
    destKey = normalize(fieldText(destField)).toLowerCase();
  } catch (e) {
    prepared = false;
  }
  // Step1 done bit comes from entitlements check, not mere presence.
  // 第一步完成位由 entitlements 检测决定，不只看文件是否存在。
  if (!prepared) {
    stepDone[1] = false;
    stepDone[3] = false;
    localModVersions = [];
    localModEntries = [];
    localModScanDone = true;
    lastModScanDest = destKey;
    cancelModScan();
  } else if (destKey !== lastModScanDest) {
    stepDone[3] = false;
    localModVersions = [];
    localModEntries = [];
    localModScanDone = false;
    scheduleDestModScan();
  }
  queuePrepareCheck();
  refreshGuide();
  paintDownloadButton(!busy);
}

function voidDestModRescan() {
  cancelModScan();
  lastModScanDest = '';
  localModScanDone = false;
  stepDone[3] = false;
  scheduleDestModScan();
}

function voidReleaseCheck() {
  // Allow scheduleReleaseCheck to run again after a prior finish.
  // 让已完成的 Release 核对可以再次 schedule。
  cancelReleaseCheck();
  releaseCheckFinished = false;
  releaseVersion = '';
  releaseKnown = false;
  lastDownloadLogKey = '';
  paintDownloadButton(!busy);
  paintStepHeaders();
  scheduleReleaseCheck();
}

function refreshStepButtonFor(step) {
  if (step === 1) return refreshStep1Button;
  if (step === 2) return refreshStep2Button;
  if (step === 3) return refreshStep3Button;
  return null;
}

function refreshStepActionName(step) {
  if (step === 1) return 'refreshStep1:';
  if (step === 2) return 'refreshStep2:';
  if (step === 3) return 'refreshStep3:';
  return null;
}

function paintRefreshStepButtons() {
  // enabled=false alone is not enough on borderless chrome buttons — also drop action.
  // 无边框 chrome 按钮仅 setEnabled(false) 仍可能点到；禁用时清掉 action。
  var i;
  for (i = 1; i <= 3; i++) {
    var btn = refreshStepButtonFor(i);
    if (!btn) continue;
    var en = !busy && !stepRefreshPending[i];
    try { btn.setEnabled(en); } catch (eEn) {}
    try { btn.setAction(en ? refreshStepActionName(i) : null); } catch (eAct) {}
    try { btn.setAlphaValue(en ? 1.0 : 0.45); } catch (eAlpha) {}
  }
}

function beginStepRefresh(step) {
  if (busy || quitting || stepRefreshPending[step]) return false;
  stepRefreshPending[step] = true;
  paintRefreshStepButtons();
  return true;
}

function endStepRefresh(step) {
  if (!stepRefreshPending[step]) return;
  stepRefreshPending[step] = false;
  paintRefreshStepButtons();
}

function maybeEndStep3Refresh() {
  if (!stepRefreshPending[3]) return;
  if (!localModScanDone) return;
  // Release check only blocks while the Release lookup path is active.
  // 仅在会跑 Release 查询时才等 releaseCheckFinished。
  if (shared && shared.selectCoopModAsset && !releaseCheckFinished) return;
  endStepRefresh(3);
}

function refreshStep1Detect() {
  if (busy || quitting || stepRefreshPending[1]) return;
  if (!beginStepRefresh(1)) return;
  try {
    try { appendLogFile('[step-refresh] step=1\n'); } catch (eLog) {}
    queuePrepareCheck();
  } catch (eRefresh) {
    endStepRefresh(1);
    throw eRefresh;
  }
}

function refreshStep2Detect() {
  if (busy || quitting || stepRefreshPending[2]) return;
  if (!beginStepRefresh(2)) return;
  try {
    try { appendLogFile('[step-refresh] step=2\n'); } catch (eLog) {}
    voidConfigCompare();
    if (!syncStateApi) endStepRefresh(2);
  } catch (eRefresh) {
    endStepRefresh(2);
    throw eRefresh;
  }
}

function refreshStep3Detect() {
  if (busy || quitting || stepRefreshPending[3]) return;
  if (!beginStepRefresh(3)) return;
  try {
    try { appendLogFile('[step-refresh] step=3\n'); } catch (eLog) {}
    voidDestModRescan();
    voidReleaseCheck();
    maybeEndStep3Refresh();
  } catch (eRefresh) {
    endStepRefresh(3);
    throw eRefresh;
  }
}

function onPathsEdited() {
  if (busy) return;
  syncStepsToDest();
}

function clearInitialFocus() {
  if (!mainWindow || quitting) return;
  try { if (releasesButton) releasesButton.setFocusRingType(1); } catch (eRing) {}
  try { mainWindow.makeFirstResponder(null); } catch (e1) {
    try { objc(mainWindow.makeFirstResponder(null)); } catch (e2) {}
  }
}

function armFocusClear() {
  if (!controller || quitting) return;
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0,
    controller,
    'clearInitialFocus:',
    null,
    false
  );
}

function invalidateReleaseTimer() {
  if (!releaseTimer) return;
  try { objc(releaseTimer.invalidate); } catch (e) {}
  releaseTimer = null;
}

function closeReleaseHandles() {
  try { if (releaseOutHandle) objc(releaseOutHandle.closeFile); } catch (e1) {}
  try { if (releaseErrHandle) objc(releaseErrHandle.closeFile); } catch (e2) {}
  releaseOutHandle = null;
  releaseErrHandle = null;
}

function cancelReleaseCheck() {
  releaseToken += 1;
  invalidateReleaseTimer();
  if (releaseTask && taskIsRunning(releaseTask)) {
    try { objc(releaseTask.terminate); } catch (e) {}
  }
  releaseTask = null;
  closeReleaseHandles();
}

function scheduleReleaseCheck() {
  if (quitting || !controller) return;
  if (!shared || !shared.selectCoopModAsset) return;
  if (releaseCheckFinished || releaseTask) return;
  invalidateReleaseTimer();
  releaseTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.05,
    controller,
    'startReleaseCheck:',
    null,
    false
  );
}

function completeReleaseCheck(token, code) {
  if (token !== releaseToken || releaseCheckFinished) return;
  releaseCheckFinished = true;
  var asset = null;
  if (code === 0 && shared && shared.selectCoopModAsset) {
    try {
      var text = readTextFile(releaseJsonPath);
      var data = $(text).dataUsingEncoding($.NSUTF8StringEncoding);
      var obj = $.NSJSONSerialization.JSONObjectWithDataOptionsError(data, 0, null);
      if (obj) asset = shared.selectCoopModAsset(ObjC.deepUnwrap(obj));
    } catch (eParse) {
      asset = null;
    }
  }
  releaseVersion = '';
  releaseKnown = false;
  if (asset && shared.releaseAssetVersionLabel) {
    try { releaseVersion = String(shared.releaseAssetVersionLabel(asset.name, asset.tag) || ''); } catch (eVer) { releaseVersion = ''; }
    releaseKnown = !!releaseVersion;
  }
  // Button AND Step3 title share this settle path — do not paint button alone
  // (that left the title stuck on ⏳ after "Already the latest version").
  // 按钮与第三步标题同一结算路径；只刷新按钮会让标题卡在 ⏳。
  paintDownloadButton(!busy);
  if (!busy) refreshGuide();
  else paintStepHeaders();
  maybeEndStep3Refresh();
}

function startReleaseCheck() {
  invalidateReleaseTimer();
  if (quitting || releaseTask || releaseCheckFinished) return;
  if (!shared || !shared.selectCoopModAsset) return;
  var token = releaseToken;
  releaseArmedToken = token;
  releaseJsonPath = joinPath(tempDir(), 'duckov-releases-launch.json');
  releaseErrPath = joinPath(tempDir(), 'duckov-releases-launch.err');
  var outPath = joinPath(tempDir(), 'duckov-releases-launch.out');
  var outHandle = null;
  var errHandle = null;
  try {
    writeTextFile(outPath, '');
    writeTextFile(releaseErrPath, '');
    writeTextFile(releaseJsonPath, '');
  } catch (eWrite) {}
  var args = [
    '/usr/bin/curl', '-fL', '--retry', '2', '--retry-delay', '1',
    '--max-time', '45', '-sS',
    '-A', 'DuckovCoopPrepare',
    '-H', 'Accept: application/vnd.github+json',
    '-o', releaseJsonPath,
    RELEASES_API
  ];
  try {
    releaseTask = objc(objc($.NSTask.alloc).init);
    releaseTask.setLaunchPath($(args[0]));
    var nsArgs = objc(objc($.NSMutableArray.alloc).init);
    var i;
    for (i = 1; i < args.length; i++) nsArgs.addObject($(String(args[i])));
    releaseTask.setArguments(nsArgs);
    outHandle = $.NSFileHandle.fileHandleForWritingAtPath($(outPath));
    errHandle = $.NSFileHandle.fileHandleForWritingAtPath($(releaseErrPath));
    if (outHandle) releaseTask.setStandardOutput(outHandle);
    if (errHandle) releaseTask.setStandardError(errHandle);
    attachTaskEnvironment(releaseTask, null);
    objc(releaseTask.launch);
    releaseOutHandle = outHandle;
    releaseErrHandle = errHandle;
  } catch (error) {
    releaseTask = null;
    try { if (outHandle) objc(outHandle.closeFile); } catch (eCloseOut) {}
    try { if (errHandle) objc(errHandle.closeFile); } catch (eCloseErr) {}
    completeReleaseCheck(token, 1);
    return;
  }
  releaseDeadlineMs = Date.now() + RELEASE_CHECK_LIMIT_MS;
  if (!taskIsRunning(releaseTask)) {
    var quickCode = 1;
    try { quickCode = taskExitCode(releaseTask); } catch (eQuick) { quickCode = 1; }
    releaseTask = null;
    closeReleaseHandles();
    completeReleaseCheck(token, quickCode);
    return;
  }
  releaseTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.2,
    controller,
    'releasePoll:',
    null,
    true
  );
}

function onReleasePoll() {
  var token = releaseArmedToken;
  if (quitting || token !== releaseToken) {
    invalidateReleaseTimer();
    if (releaseTask && taskIsRunning(releaseTask)) {
      try { objc(releaseTask.terminate); } catch (eTermEarly) {}
    }
    releaseTask = null;
    closeReleaseHandles();
    return;
  }
  var running = false;
  try { running = taskIsRunning(releaseTask); } catch (eRun) { running = false; }
  var timedOut = Date.now() > releaseDeadlineMs;
  if (running && !timedOut) return;
  invalidateReleaseTimer();
  if (running) {
    try { objc(releaseTask.terminate); } catch (eTerm) {}
    releaseTask = null;
    closeReleaseHandles();
    appendLogFile('核对最新 Release 超时。下载按钮保持蓝色。\nChecking the latest Release timed out. The download button stays blue.\n');
    completeReleaseCheck(token, 1);
    return;
  }
  var code = 1;
  try { code = taskExitCode(releaseTask); } catch (eCode) { code = 1; }
  releaseTask = null;
  closeReleaseHandles();
  completeReleaseCheck(token, code);
}

function invalidatePrepareCheckTimer() {
  if (!prepareCheckTimer) return;
  try { objc(prepareCheckTimer.invalidate); } catch (e) {}
  prepareCheckTimer = null;
}

function closePrepareCheckHandles() {
  try { if (prepareCheckOutHandle) objc(prepareCheckOutHandle.closeFile); } catch (e1) {}
  try { if (prepareCheckErrHandle) objc(prepareCheckErrHandle.closeFile); } catch (e2) {}
  prepareCheckOutHandle = null;
  prepareCheckErrHandle = null;
}

function cancelPrepareCheck() {
  prepareCheckToken += 1;
  invalidatePrepareCheckTimer();
  if (prepareCheckTask && taskIsRunning(prepareCheckTask)) {
    try { objc(prepareCheckTask.terminate); } catch (e) {}
  }
  prepareCheckTask = null;
  closePrepareCheckHandles();
}

function parsePrepareCheckOutput(text) {
  var status = 'error';
  var lines = String(text || '').split('\n');
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('STATUS ') === 0) {
      status = lines[i].substring(7).replace(/^\s+|\s+$/g, '');
    }
  }
  if (status !== 'ready' && status !== 'needs_fix' && status !== 'missing' && status !== 'error') {
    status = 'error';
  }
  return status;
}

function notePrepareCheck(status) {
  var zh = '';
  var en = '';
  if (status === 'ready') {
    zh = '联机副本 entitlements 已符合要求（无 App Sandbox，已开 network.client/server），准备按钮为绿色。';
    en = 'The co-op copy entitlements match (App Sandbox off, network.client/server on). The Prepare button is green.';
  } else if (status === 'needs_fix') {
    zh = '检测到副本 App，但 entitlements 还不是联机就绪状态，准备按钮为黄色。可点此按钮重新准备。';
    en = 'A copy App was found, but entitlements are not co-op ready yet. The Prepare button is yellow. Click to regenerate.';
  } else if (status === 'missing') {
    zh = '还没有联机副本 App，准备按钮为蓝色。';
    en = 'No co-op copy App yet. The Prepare button is blue.';
  } else {
    zh = '无法读取副本 entitlements，准备按钮按需修复（黄色）。';
    en = 'Could not read the copy entitlements. The Prepare button stays in the needs-fix (yellow) state.';
  }
  var key = status + '|' + zh;
  if (key === prepareCheckLoggedKey) return;
  prepareCheckLoggedKey = key;
  appendLogFile(zh + '\n' + en + '\n');
}

function applyPrepareCheck(status) {
  prepareCheckResult = status || 'error';
  if (prepareCheckResult === 'ready') stepDone[1] = true;
  else stepDone[1] = false;
  if (!stepDone[1]) stepDone[3] = false;
  paintPrepareButton(!busy);
  if (!busy) refreshGuide();
  else paintStepHeaders();
  notePrepareCheck(prepareCheckResult);
  endStepRefresh(1);
}

function queuePrepareCheck() {
  cancelPrepareCheck();
  prepareCheckLoggedKey = '';
  if (!prepareDestWantsCheck()) {
    prepareCheckResult = copyLooksPrepared() ? 'needs_fix' : 'missing';
    // Same-as-source path is not a valid co-op copy.
    // 与原版同一路径时不算有效联机副本。
    try {
      var dest = normalize(fieldText(destField));
      var source = normalize(fieldText(sourceField));
      if (dest && source && dest.toLowerCase() === source.toLowerCase()) prepareCheckResult = 'needs_fix';
    } catch (eSame) {}
    applyPrepareCheck(prepareCheckResult);
    return;
  }
  prepareCheckResult = null;
  stepDone[1] = false;
  paintPrepareButton(!busy);
  paintStepHeaders();
  schedulePrepareCheck();
}

function schedulePrepareCheck() {
  if (quitting || !controller) return;
  if (prepareCheckTask) return;
  invalidatePrepareCheckTimer();
  prepareCheckArmedToken = prepareCheckToken;
  prepareCheckTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.05,
    controller,
    'startPrepareCheck:',
    null,
    false
  );
}

function startPrepareCheck() {
  invalidatePrepareCheckTimer();
  if (quitting || prepareCheckTask) return;
  if (prepareCheckToken !== prepareCheckArmedToken) return;
  if (!prepareDestWantsCheck()) {
    applyPrepareCheck(copyLooksPrepared() ? 'needs_fix' : 'missing');
    return;
  }
  var script = joinPath(resources, 'check-coop-copy.sh');
  if (!script || !fileExists(script)) {
    appendLogFile('找不到联机副本检测脚本。准备按钮按文件是否存在着色。\nThe co-op copy check script is missing. Prepare button falls back to on-disk existence.\n');
    applyPrepareCheck(copyLooksPrepared() ? 'needs_fix' : 'missing');
    return;
  }
  var dest = normalize(fieldText(destField));
  var token = prepareCheckToken;
  prepareCheckOutPath = joinPath(tempDir(), 'duckov-prepare-check.txt');
  prepareCheckErrPath = joinPath(tempDir(), 'duckov-prepare-check.err');
  var outHandle = null;
  var errHandle = null;
  try {
    writeTextFile(prepareCheckOutPath, '');
    writeTextFile(prepareCheckErrPath, '');
  } catch (eWrite) {}
  var args = ['/bin/bash', script, dest];
  try {
    prepareCheckTask = objc(objc($.NSTask.alloc).init);
    prepareCheckTask.setLaunchPath($(args[0]));
    var nsArgs = objc(objc($.NSMutableArray.alloc).init);
    var i;
    for (i = 1; i < args.length; i++) nsArgs.addObject($(String(args[i])));
    prepareCheckTask.setArguments(nsArgs);
    outHandle = $.NSFileHandle.fileHandleForWritingAtPath($(prepareCheckOutPath));
    errHandle = $.NSFileHandle.fileHandleForWritingAtPath($(prepareCheckErrPath));
    if (outHandle) prepareCheckTask.setStandardOutput(outHandle);
    if (errHandle) prepareCheckTask.setStandardError(errHandle);
    attachTaskEnvironment(prepareCheckTask, null);
    objc(prepareCheckTask.launch);
    prepareCheckOutHandle = outHandle;
    prepareCheckErrHandle = errHandle;
  } catch (error) {
    prepareCheckTask = null;
    try { if (outHandle) objc(outHandle.closeFile); } catch (eCloseOut) {}
    try { if (errHandle) objc(errHandle.closeFile); } catch (eCloseErr) {}
    applyPrepareCheck('error');
    return;
  }
  prepareCheckDeadlineMs = Date.now() + PREPARE_CHECK_LIMIT_MS;
  if (!taskIsRunning(prepareCheckTask)) {
    var quickCode = 1;
    try { quickCode = taskExitCode(prepareCheckTask); } catch (eQuick) { quickCode = 1; }
    prepareCheckTask = null;
    closePrepareCheckHandles();
    applyPrepareCheck(parsePrepareCheckOutput(quickCode === 0 ? readTextFile(prepareCheckOutPath) : ''));
    return;
  }
  prepareCheckTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.2,
    controller,
    'prepareCheckPoll:',
    null,
    true
  );
}

function onPrepareCheckPoll() {
  var token = prepareCheckArmedToken;
  if (quitting || token !== prepareCheckToken) {
    invalidatePrepareCheckTimer();
    if (prepareCheckTask && taskIsRunning(prepareCheckTask)) {
      try { objc(prepareCheckTask.terminate); } catch (eTermEarly) {}
    }
    prepareCheckTask = null;
    closePrepareCheckHandles();
    return;
  }
  var running = false;
  try { running = taskIsRunning(prepareCheckTask); } catch (eRun) { running = false; }
  var timedOut = Date.now() > prepareCheckDeadlineMs;
  if (running && !timedOut) return;
  invalidatePrepareCheckTimer();
  if (running) {
    try { objc(prepareCheckTask.terminate); } catch (eTerm) {}
    prepareCheckTask = null;
    closePrepareCheckHandles();
    appendLogFile('检测联机副本 entitlements 超时。\nChecking co-op copy entitlements timed out.\n');
    applyPrepareCheck('error');
    return;
  }
  var code = 1;
  try { code = taskExitCode(prepareCheckTask); } catch (eCode) { code = 1; }
  prepareCheckTask = null;
  closePrepareCheckHandles();
  applyPrepareCheck(parsePrepareCheckOutput(code === 0 ? readTextFile(prepareCheckOutPath) : ''));
}

function invalidateConfigTimer() {
  if (!configTimer) return;
  try { objc(configTimer.invalidate); } catch (e) {}
  configTimer = null;
}

function closeConfigHandles() {
  try { if (configOutHandle) objc(configOutHandle.closeFile); } catch (e1) {}
  try { if (configErrHandle) objc(configErrHandle.closeFile); } catch (e2) {}
  configOutHandle = null;
  configErrHandle = null;
}

function cancelConfigCompare() {
  configToken += 1;
  invalidateConfigTimer();
  if (configTask && taskIsRunning(configTask)) {
    try { objc(configTask.terminate); } catch (e) {}
  }
  configTask = null;
  closeConfigHandles();
}

function scheduleConfigCompare() {
  // Always re-enter detecting (grey + ⏳) then async fingerprint — same as pre-in-process launch.
  // 每次重新进入检测中（灰底 + ⏳），再异步算指纹，与改本进程前的启动行为一致。
  if (quitting || !controller || !syncStateApi) return;
  invalidateConfigTimer();
  if (configTask && taskIsRunning(configTask)) {
    try { objc(configTask.terminate); } catch (eTerm) {}
  }
  configTask = null;
  closeConfigHandles();
  configArmedToken = configToken;
  syncVisual = null;
  stepDone[2] = false;
  try {
    paintSyncButtons(!busy);
    paintStep2Title();
    if (!busy) refreshGuide();
    else paintStepHeaders();
  } catch (ePaint) {}
  configTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.05,
    controller,
    'startConfigCompare:',
    null,
    false
  );
}

function voidConfigCompare() {
  cancelConfigCompare();
  if (!syncStateApi) return;
  syncVisual = null;
  configLoggedKey = '';
  stepDone[2] = false;
  paintSyncButtons(!busy);
  paintStep2Title();
  paintStep2StatusLine();
  scheduleConfigCompare();
}

function applyConfigCompare(text) {
  var parsed = null;
  if (text && syncStateApi) {
    try { parsed = syncStateApi.parseFingerprint(text); } catch (eParse) { parsed = null; }
  }
  if (!parsed || !text) {
    syncVisual = { status: 'unknown', identical: false, toCoop: 'neutral', toOriginal: 'neutral', originalMtime: null, coopMtime: null, originalReadable: false, coopReadable: false };
  } else {
    syncVisual = syncStateApi.compareConfigSides(parsed.original, parsed.coop);
  }
  if (syncVisual.status === 'identical') stepDone[2] = true;
  else stepDone[2] = false;
  try {
    var leftPres = syncPresentation('to-coop');
    var rightPres = syncPresentation('to-original');
    appendLogFile(
      '[sync-paint] domain=config status=' + syncVisual.status +
      ' identical=' + syncVisual.identical +
      ' originalMtime=' + syncVisual.originalMtime +
      ' coopMtime=' + syncVisual.coopMtime +
      ' left(syncToCoop)=' + leftPres.color +
      ' right(syncToOriginal)=' + rightPres.color +
      ' originalReadable=' + syncVisual.originalReadable +
      ' coopReadable=' + syncVisual.coopReadable +
      ' originalConfig=' + originalConfigDir() +
      ' coopConfig=' + coopConfigDir() + '\n'
    );
  } catch (ePaintLog) {}
  try {
    if (!configHelpSampleLogged) {
      configHelpSampleLogged = true;
      var helpSample = configFolderAccessHelpText().split('\n').slice(0, 6).join('\n');
      appendLogFile('[config-perm-help-sample]\n' + helpSample + '\n');
    }
  } catch (eHelpSample) {}
  paintSyncButtons(!busy);
  if (!busy) refreshGuide();
  else paintStepHeaders();
  var described = { zh: '', en: '' };
  try { described = syncStateApi.describeCompare(syncVisual); } catch (eDesc) {}
  var key = syncVisual.status + '|' + syncVisual.toCoop + '|' + syncVisual.toOriginal;
  if (key !== configLoggedKey) {
    configLoggedKey = key;
    appendLogFile(described.zh + '\n' + described.en + '\n');
    if (parsed && ((parsed.original && parsed.original.error === 'permission') || (parsed.coop && parsed.coop.error === 'permission'))) {
      appendLogFile('[config-perm-help]\n' + configFolderAccessHelpText() + '\n');
    } else if (syncVisual && syncVisual.status === 'unreadable') {
      appendLogFile('[config-perm-help]\n' + configFolderAccessHelpText() + '\n');
    }
  }
  // Auto-offer permission help once when detect settles without usable access/mtime.
  // 检测结束仍无权限/无可用 mtime 时，自动弹出授权说明（每启动一次）。
  var retried = false;
  try { retried = !!maybeOfferConfigPermissionHelp(parsed); } catch (eOffer) { retried = false; }
  // If dialog chose 「重试检测」, pending stays true until that compare finishes.
  // 若弹窗点了「重试检测」，保持 pending，等那次比较结束再解开。
  if (!retried) endStepRefresh(2);
}

function maybeOfferConfigPermissionHelp(parsed) {
  if (quitting || !syncVisual || containerAccessPrompted) return false;
  if (syncVisual.status === 'identical' || syncVisual.status === 'different') return false;
  if (syncVisual.status === 'missing') return false;
  var perm = false;
  if (syncVisual.status === 'unreadable') perm = true;
  if (parsed) {
    if (parsed.original && (parsed.original.error === 'permission' || parsed.original.readable === false)) perm = true;
    if (parsed.coop && (parsed.coop.error === 'permission' || parsed.coop.readable === false)) perm = true;
  }
  var noMtime = syncVisual.originalMtime == null && syncVisual.coopMtime == null;
  if (!perm && !(syncVisual.status === 'unknown' && noMtime)) return false;
  return !!offerContainerAccessHelp(
    '还不能读取原版配置，无法完成第二步检测。\n'
    + 'The original config is still unreadable, so Step 2 cannot finish detecting.'
  );
}



function objcNamesArray(names) {
  // Prefer NSArray count/objectAtIndex. Never touch .length on deepUnwrap results —
  // empty or odd arrays can deepUnwrap to NSNull and -[NSNull count] aborts JXA.
  // 优先 NSArray count/objectAtIndex；不要对 deepUnwrap 结果取 .length（空目录可能是 NSNull）。
  if (!names) return [];
  var out = [];
  var i;
  var counted = false;
  var n = 0;
  try {
    n = asNumber(objc(names.count));
    counted = true;
  } catch (eCount) {
    counted = false;
    n = 0;
  }
  if (counted) {
    for (i = 0; i < n; i++) {
      try { out.push(String(unwrap(names.objectAtIndex(i)) || '')); } catch (eItem) {}
    }
    return out;
  }
  // Fallback only when .count was unavailable: already-unwrapped JS arrays.
  try {
    if (Object.prototype.toString.call(names) === '[object Array]') {
      for (i = 0; i < names.length; i++) out.push(String(names[i] || ''));
    }
  } catch (eArr) {}
  return out;
}

// --- In-process config fingerprint + mirror (avoid /bin/bash FDA for Containers) ---
// Prefer NSFileManager / NSData in this process so TCC sees the window process,
// not /bin/bash. Hash via openssl on a /tmp copy so openssl never opens Containers.
// 配置指纹与镜像尽量在本进程完成，避免给 /bin/bash 完全磁盘访问；哈希在 /tmp 副本上算。

function fingerprintIgnoreBase(base) {
  var name = String(base || '');
  if (name === '.DS_Store' || name === '.localized') return true;
  if (name.length >= 2 && name.substring(0, 2) === '._') return true;
  // Legacy in-tree probes + any stray sibling-style write-probe names if mis-copied.
  // 旧版树内探测名，以及误拷进树的同级 write-probe 名。
  if (name.indexOf('.DuckovCoopPrepare-perm-probe-') === 0) return true;
  if (name.indexOf('.write-probe-') !== -1) return true;
  return false;
}

function nsFileTypeString(value) {
  // JXA: String($.NSFileTypeDirectory) does NOT yield "NSFileTypeDirectory".
  // It stringifies the bridge object; always unwrap (or compare to the literal).
  // JXA 里 String($.NSFileTypeDirectory) 得不到 "NSFileTypeDirectory"，必须 unwrap。
  try {
    return String(unwrap(value) || '');
  } catch (e) {
    return '';
  }
}

function pathIsSymlink(path) {
  if (!path) return false;
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var attrs = fm.attributesOfItemAtPathError($(String(path)), null);
    if (!attrs) return false;
    var typ = nsFileTypeString(attrs.objectForKey($.NSFileType));
    return typ === 'NSFileTypeSymbolicLink';
  } catch (e) {
    return false;
  }
}

function pathIsDirectory(path) {
  if (!path || !fileExists(path)) return false;
  if (pathIsSymlink(path)) return false;
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var attrs = fm.attributesOfItemAtPathError($(String(path)), null);
    if (!attrs) return false;
    var typ = nsFileTypeString(attrs.objectForKey($.NSFileType));
    return typ === 'NSFileTypeDirectory';
  } catch (e) {
    return false;
  }
}

function posixModeOctal(path) {
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var attrs = fm.attributesOfItemAtPathError($(String(path)), null);
    if (!attrs) return '0';
    var perms = Number(unwrap(attrs.objectForKey($.NSFilePosixPermissions)));
    if (!isFinite(perms)) return '0';
    var mode = (perms & 511).toString(8);
    return mode;
  } catch (e) {
    return '0';
  }
}

function mtimeEpochSeconds(path) {
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var attrs = fm.attributesOfItemAtPathError($(String(path)), null);
    if (!attrs) return '';
    var date = attrs.objectForKey($.NSFileModificationDate);
    if (!date) return '';
    var t = asNumber(objc(date.timeIntervalSince1970));
    if (!isFinite(t)) return '';
    return String(Math.floor(t));
  } catch (e) {
    return '';
  }
}

function noteFingerprintMtime(m, bucket, state) {
  if (!/^[0-9]+$/.test(String(m || ''))) return;
  var n = Number(m);
  if (bucket === 'leaf') {
    if (!state.leafHave || n > state.leafNewest) {
      state.leafNewest = n;
      state.leafHave = true;
    }
  } else {
    if (!state.dirHave || n > state.dirNewest) {
      state.dirNewest = n;
      state.dirHave = true;
    }
  }
}

function sha256FileViaTempCopy(path) {
  // Read with this process (TCC), hash a /tmp copy with openssl (no Containers open).
  // 本进程读入（走 TCC），在 /tmp 副本上用 openssl 哈希（不再打开 Containers）。
  var data = null;
  try { data = $.NSData.dataWithContentsOfFile($(String(path))); } catch (eRead) { return ''; }
  if (!data) return '';
  var tmp = joinPath(tempDir(), 'duckov-fp-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1e9)));
  try {
    if (!asBool(data.writeToFileAtomically($(tmp), true))) return '';
  } catch (eWrite) {
    return '';
  }
  var result = null;
  try {
    result = runSync(['/usr/bin/openssl', 'dgst', '-sha256', '-r', tmp]);
  } catch (eHash) {
    result = null;
  }
  try { removeFile(tmp); } catch (eRm) {}
  if (!result || result.code !== 0) return '';
  var out = trim(result.stdout || '');
  var sp = out.indexOf(' ');
  if (sp > 0) out = out.substring(0, sp);
  if (/^[0-9a-fA-F]{64}$/.test(out)) return out.toLowerCase();
  return '';
}

function readlinkText(path) {
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var dest = fm.destinationOfSymbolicLinkAtPathError($(String(path)), null);
    if (!dest) return '';
    return String(unwrap(dest) || '');
  } catch (e) {
    return '';
  }
}

function emitFingerprintSideLines(label, dir) {
  var lines = [];
  var records = [];
  var state = { leafNewest: 0, leafHave: false, dirNewest: 0, dirHave: false };
  var skipped = false;
  lines.push('SIDE ' + label);
  if (!dir || !fileExists(dir) || pathIsSymlink(dir) || !pathIsDirectory(dir)) {
    lines.push('EXISTS 0');
    lines.push('READABLE 1');
    lines.push('NEWEST_MTIME -');
    lines.push('NEWEST_DIR_MTIME -');
    return lines.join('\n');
  }
  lines.push('EXISTS 1');
  // List alone is not enough (false green after FDA revoke). Require create+delete probe.
  // 不能只靠列举（撤销 FDA 后会假绿）；必须创建+删除探测成功才算有权限。
  if (!probePathReadable(dir) || !probeConfigFolderAccess(dir)) {
    lines.push('READABLE 0');
    lines.push('ERROR permission');
    lines.push('NEWEST_MTIME -');
    lines.push('NEWEST_DIR_MTIME -');
    return lines.join('\n');
  }
  lines.push('READABLE 1');
  // Do not count the side root mtime (exclude-root). Write-probe is now a sibling
  // under the parent, but keep this guard if anything else touches the root.
  // 不算侧根目录时间（排除根）。写入探测已改到同级，仍保留此保护以防其它操作碰根。

  var fm = objc($.NSFileManager.defaultManager);
  var root = String(dir);
  var stack = [''];
  while (stack.length) {
    var relDir = stack.pop();
    var absDir = relDir ? joinPath(root, relDir) : root;
    var names = null;
    try { names = fm.contentsOfDirectoryAtPathError($(absDir), null); } catch (eList) { names = null; }
    if (!names) {
      lines = ['SIDE ' + label, 'EXISTS 1', 'READABLE 0', 'ERROR permission', 'NEWEST_MTIME -', 'NEWEST_DIR_MTIME -'];
      return lines.join('\n');
    }
    var rawNames = objcNamesArray(names);
    var i;
    for (i = 0; i < rawNames.length; i++) {
      var base = rawNames[i];
      if (!base || fingerprintIgnoreBase(base)) continue;
      var rel = relDir ? (relDir + '/' + base) : base;
      if (rel.indexOf('\t') !== -1 || rel.indexOf('\n') !== -1) {
        skipped = true;
        continue;
      }
      var abs = joinPath(root, rel);
      if (pathIsSymlink(abs)) {
        var target = readlinkText(abs);
        if (target.indexOf('\t') !== -1 || target.indexOf('\n') !== -1) {
          skipped = true;
          continue;
        }
        records.push('L\t' + posixModeOctal(abs) + '\t' + target + '\t' + rel);
        noteFingerprintMtime(mtimeEpochSeconds(abs), 'leaf', state);
      } else if (pathIsDirectory(abs)) {
        records.push('D\t' + posixModeOctal(abs) + '\t' + rel);
        noteFingerprintMtime(mtimeEpochSeconds(abs), 'dir', state);
        stack.push(rel);
      } else if (fileExists(abs)) {
        var hash = sha256FileViaTempCopy(abs);
        if (!hash) {
          skipped = true;
          continue;
        }
        records.push('F\t' + hash + '\t' + posixModeOctal(abs) + '\t' + rel);
        noteFingerprintMtime(mtimeEpochSeconds(abs), 'leaf', state);
      }
    }
  }

  if (state.leafHave) lines.push('NEWEST_MTIME ' + String(state.leafNewest));
  else if (state.dirHave) lines.push('NEWEST_MTIME ' + String(state.dirNewest));
  else lines.push('NEWEST_MTIME -');
  if (state.dirHave) lines.push('NEWEST_DIR_MTIME ' + String(state.dirNewest));
  else lines.push('NEWEST_DIR_MTIME -');
  if (skipped) lines.push('SKIPPED 1');
  records.sort();
  for (i = 0; i < records.length; i++) lines.push(records[i]);
  return lines.join('\n');
}

function buildConfigFingerprintText(originalDir, coopDir) {
  return emitFingerprintSideLines('original', originalDir) + '\n' + emitFingerprintSideLines('coop', coopDir) + '\n';
}

function listRelativePathsUnder(root) {
  var out = [];
  if (!root || !fileExists(root)) return out;
  var fm = objc($.NSFileManager.defaultManager);
  var stack = [''];
  while (stack.length) {
    var relDir = stack.pop();
    var absDir = relDir ? joinPath(root, relDir) : root;
    var names = null;
    try { names = fm.contentsOfDirectoryAtPathError($(absDir), null); } catch (e) { names = null; }
    if (!names) throw new Error('permission');
    var raw = objcNamesArray(names);
    var i;
    for (i = 0; i < raw.length; i++) {
      var base = raw[i];
      if (!base) continue;
      var rel = relDir ? (relDir + '/' + base) : base;
      var abs = joinPath(root, rel);
      out.push(rel);
      if (!pathIsSymlink(abs) && pathIsDirectory(abs)) stack.push(rel);
    }
  }
  return out;
}

function applySourceModificationDate(from, to) {
  // Copy NSFileModificationDate from source onto dest (dirs + optional files).
  // Needed because ensureDir is a no-op when the folder already exists, so
  // identical-content trees with unequal empty-folder mtimes never got times synced.
  // 把来源的修改时间套到目标。ensureDir 在文件夹已存在时直接返回，内容相同但空文件夹
  // 时间不同时以前不会把时间同步过去。
  try {
    var fm = objc($.NSFileManager.defaultManager);
    var attrs = fm.attributesOfItemAtPathError($(String(from)), null);
    if (!attrs) return false;
    var date = attrs.objectForKey($.NSFileModificationDate);
    if (!date) return false;
    var dict = objc($.NSDictionary.dictionaryWithObjectForKey(date, $.NSFileModificationDate));
    return asBool(fm.setAttributesOfItemAtPathError(dict, $(String(to)), null));
  } catch (eAttr) {
    return false;
  }
}

function mirrorConfigTreeInProcess(src, dest) {
  // Mirror src → dest with delete (rsync -a --delete semantics for normal trees).
  // 本进程镜像 src → dest，并删除目标多出的项（等价 rsync -a --delete 的常见用法）。
  var fm = objc($.NSFileManager.defaultManager);
  if (!src || !fileExists(src)) throw new Error('missing-source');
  if (!probePathReadable(src)) throw new Error('permission');
  ensureDir(dest);
  if (!probePathReadable(dest) && fileExists(dest)) {
    // empty brand-new dest may list fine; if exists but unlistable → permission
  }
  var srcRels = listRelativePathsUnder(src);
  var destRels = [];
  try { destRels = listRelativePathsUnder(dest); } catch (eDest) {
    if (String(eDest.message || eDest) === 'permission') throw eDest;
    destRels = [];
  }
  var keep = {};
  var i;
  for (i = 0; i < srcRels.length; i++) keep[srcRels[i]] = true;

  // Delete dest-only paths, deepest first.
  destRels.sort(function (a, b) { return b.length - a.length; });
  for (i = 0; i < destRels.length; i++) {
    if (keep[destRels[i]]) continue;
    try { fm.removeItemAtPathError($(joinPath(dest, destRels[i])), null); } catch (eRm) {}
  }

  // Create directories first (shortest path first), then files/symlinks.
  srcRels.sort(function (a, b) { return a.length - b.length; });
  for (i = 0; i < srcRels.length; i++) {
    var rel = srcRels[i];
    var from = joinPath(src, rel);
    var to = joinPath(dest, rel);
    if (pathIsSymlink(from)) {
      var target = readlinkText(from);
      try { fm.removeItemAtPathError($(to), null); } catch (e0) {}
      if (!asBool(fm.createSymbolicLinkAtPathWithDestinationPathError($(to), $(target), null))) {
        throw new Error('symlink-failed');
      }
    } else if (pathIsDirectory(from)) {
      ensureDir(to);
    } else {
      try { fm.removeItemAtPathError($(to), null); } catch (e1) {}
      if (!asBool(fm.copyItemAtPathToPathError($(from), $(to), null))) {
        throw new Error('copy-failed');
      }
    }
  }

  // After file copies (which bump parent dir mtimes on dest), re-apply every
  // source directory's modification date onto dest — including empty folders that
  // already existed (ensureDir no-op) so post-sync compare shows matching times.
  // 文件复制会抬高目标父目录时间；最后再把每个来源目录（含已存在的空文件夹）mtime 套过去，
  // 这样同步后比较才会时间一致 / 完全相同。
  for (i = 0; i < srcRels.length; i++) {
    var relDir = srcRels[i];
    var fromDir = joinPath(src, relDir);
    var toDir = joinPath(dest, relDir);
    if (pathIsSymlink(fromDir)) continue;
    if (!pathIsDirectory(fromDir)) continue;
    if (!fileExists(toDir) || !pathIsDirectory(toDir)) continue;
    applySourceModificationDate(fromDir, toDir);
  }
  return true;
}

var pendingSyncDirection = '';
var pendingSyncSrc = '';
var pendingSyncDest = '';

function startConfigCompare() {
  invalidateConfigTimer();
  if (quitting || !syncStateApi) return;
  if (configToken !== configArmedToken) return;
  // Probe in-process (may show App Management), then fingerprint on a short timer so
  // grey+⏳ detecting UI can paint first. Avoid a shell helper for Containers I/O.
  // 本进程探测（可弹 App 管理），再短延迟本进程算指纹，便于先画出灰底+⏳；不经 shell 读 Containers。
  try { originalConfigAccessible(); } catch (eProbe) {}
  configDeadlineMs = Date.now() + CONFIG_COMPARE_LIMIT_MS;
  configTimer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(
    0.05,
    controller,
    'configCompareInProcess:',
    null,
    false
  );
}

function fingerprintLooksOriginalBlocked(text) {
  if (!text) return true;
  var parsed = null;
  try { parsed = syncStateApi ? syncStateApi.parseFingerprint(text) : null; } catch (e) { parsed = null; }
  if (!parsed || !parsed.original) return true;
  if (parsed.original.exists && parsed.original.readable === false) return true;
  if (parsed.original.error === 'permission') return true;
  try {
    if (!parsed.original.exists && fileExists(originalConfigDir())) return true;
  } catch (eEx) {}
  return false;
}

function runBashConfigFingerprint() {
  var script = joinPath(resources, 'config-fingerprint.sh');
  if (!script || !fileExists(script)) return '';
  var result = null;
  try {
    result = runSync(['/bin/bash', script, originalConfigDir(), coopConfigDir()]);
  } catch (eRun) {
    return '';
  }
  if (!result || result.code !== 0) return '';
  return String(result.stdout || '');
}

function fingerprintSideDeniedText(label, exists) {
  return [
    'SIDE ' + label,
    'EXISTS ' + (exists ? '1' : '0'),
    exists ? 'READABLE 0' : 'READABLE 1',
    exists ? 'ERROR permission' : null,
    'NEWEST_MTIME -'
  ].filter(function (x) { return x !== null; }).join('\n');
}

function fingerprintSideMissingText(label) {
  return ['SIDE ' + label, 'EXISTS 0', 'READABLE 1', 'NEWEST_MTIME -'].join('\n');
}

function extractFingerprintSideBlock(text, label) {
  var lines = String(text || '').split('\n');
  var out = [];
  var capture = false;
  var i;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('SIDE ') === 0) {
      if (capture) break;
      capture = (line === ('SIDE ' + label));
      if (capture) out.push(line);
      continue;
    }
    if (capture) out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join('\n');
}

function enforceWriteProbesOnFingerprint(text) {
  // Bash/list may still report READABLE 1 + mtimes after FDA revoke.
  // Re-check each existing side with in-process create/delete; downgrade on failure.
  // bash/列举在撤销 FDA 后仍可能报有权限；用本进程创建+删除复核，失败则降级为无权限。
  if (!text) return text;
  var parsed = null;
  try { parsed = syncStateApi ? syncStateApi.parseFingerprint(text) : null; } catch (eParse) { parsed = null; }
  if (!parsed) return text;
  var originalBlock;
  var coopBlock;
  if (parsed.original && parsed.original.exists) {
    if (probeConfigFolderAccess(originalConfigDir())) {
      originalBlock = extractFingerprintSideBlock(text, 'original');
      if (!originalBlock) originalBlock = fingerprintSideDeniedText('original', true);
    } else {
      originalBlock = fingerprintSideDeniedText('original', true);
      try { appendLogFile('原版配置写入探测失败，视为无权限。\\nOriginal config write probe failed; treating as no permission.\\n'); } catch (e1) {}
    }
  } else {
    originalBlock = fingerprintSideMissingText('original');
  }
  if (parsed.coop && parsed.coop.exists) {
    if (probeConfigFolderAccess(coopConfigDir())) {
      coopBlock = extractFingerprintSideBlock(text, 'coop');
      if (!coopBlock) coopBlock = fingerprintSideDeniedText('coop', true);
    } else {
      coopBlock = fingerprintSideDeniedText('coop', true);
      try { appendLogFile('联机副本配置写入探测失败，视为无权限。\\nCo-op config write probe failed; treating as no permission.\\n'); } catch (e2) {}
    }
  } else {
    coopBlock = fingerprintSideMissingText('coop');
  }
  return originalBlock + '\n' + coopBlock + '\n';
}

function onConfigCompareInProcess() {
  var token = configArmedToken;
  if (quitting || configToken !== token) return;
  var text = '';
  try {
    text = buildConfigFingerprintText(originalConfigDir(), coopConfigDir());
  } catch (eBuild) {
    text = '';
    try { appendLogFile('本进程配置指纹失败 / In-process fingerprint failed: ' + eBuild + '\n'); } catch (eLog) {}
  }
  // If in-process cannot read Containers original, try bash for content — then still
  // enforce in-process write probes so revoked FDA cannot keep false greens.
  // 本进程读不了原版时可用 bash 补内容，但仍要用本进程写入探测，避免撤销 FDA 后假绿。
  if (fingerprintLooksOriginalBlocked(text)) {
    var viaBash = '';
    try { viaBash = runBashConfigFingerprint(); } catch (eBash) { viaBash = ''; }
    if (viaBash) {
      try { appendLogFile('原版配置改用 /bin/bash 指纹脚本读取。\nRe-read original config fingerprint via /bin/bash.\n'); } catch (eLogB) {}
      text = viaBash;
    }
  }
  try {
    text = enforceWriteProbesOnFingerprint(text);
  } catch (eEnf) {
    try { appendLogFile('写入探测复核失败 / write probe enforce failed: ' + eEnf + '\n'); } catch (eLogE) {}
  }
  if (configToken !== token) return;
  try {
    applyConfigCompare(text);
  } catch (eApply) {
    try { appendLogFile('应用配置比较失败 / applyConfigCompare failed: ' + eApply + '\n'); } catch (eLog2) {}
    syncVisual = { status: 'unknown', identical: false, toCoop: 'neutral', toOriginal: 'neutral', originalMtime: null, coopMtime: null, originalReadable: false, coopReadable: false };
    stepDone[2] = false;
    try { paintSyncButtons(!busy); } catch (eP) {}
    try { if (!busy) refreshGuide(); else paintStepHeaders(); } catch (eG) {}
    endStepRefresh(2);
  }
}

function onConfigPoll() {
  var token = configArmedToken;
  if (quitting || configToken !== token) {
    invalidateConfigTimer();
    if (configTask && taskIsRunning(configTask)) {
      try { objc(configTask.terminate); } catch (eTerm) {}
    }
    configTask = null;
    closeConfigHandles();
    return;
  }
  var running = false;
  try { running = taskIsRunning(configTask); } catch (eRun) { running = false; }
  var timedOut = Date.now() > configDeadlineMs;
  if (running && !timedOut) return;
  invalidateConfigTimer();
  if (running) {
    try { objc(configTask.terminate); } catch (eTerm2) {}
    configTask = null;
    closeConfigHandles();
    appendLogFile('比较配置文件夹超时，同步按钮保持灰色。\nComparing the config folders timed out. The sync buttons stay grey.\n');
    syncVisual = { status: 'unknown', identical: false, toCoop: 'neutral', toOriginal: 'neutral', originalMtime: null, coopMtime: null, originalReadable: false, coopReadable: false };
    paintSyncButtons(!busy);
    endStepRefresh(2);
    return;
  }
  var code = 1;
  try { code = taskExitCode(configTask); } catch (eCode) { code = 1; }
  configTask = null;
  closeConfigHandles();
  if (token !== configToken) return;
  applyConfigCompare(code === 0 ? readTextFile(configOutPath) : '');
}


function applyUiLanguage() {
  try { if (mainWindow) mainWindow.setTitle($(windowTitleText())); } catch (e0) {}
  try { if (releasesButton) releasesButton.setTitle($(openGithubTitle())); } catch (e1) {}
  try { if (langButton) langButton.setTitle($(langToggleTitle())); } catch (e2) {}
  try { if (refreshStep1Button) refreshStep1Button.setTitle($(refreshStepButtonTitle())); } catch (e2a) {}
  try { if (refreshStep2Button) refreshStep2Button.setTitle($(refreshStepButtonTitle())); } catch (e2b) {}
  try { if (refreshStep3Button) refreshStep3Button.setTitle($(refreshStepButtonTitle())); } catch (e2c) {}
  try { if (statusTitleLabel) statusTitleLabel.setStringValue($(statusTitleText())); } catch (e3) {}
  try { if (step1HelpLabel) step1HelpLabel.setStringValue($(step1HelpText())); } catch (e4) {}
  try { if (step3HelpLabel) step3HelpLabel.setStringValue($(step3HelpText())); } catch (e5) {}
  try { if (explainLabel) explainLabel.setStringValue($(step2HelpText())); } catch (e6) {}
  try { if (step1HelpLabel) step1HelpLabel.setTextColor(helpTextColor()); } catch (e6a) {}
  try { if (explainLabel) explainLabel.setTextColor(helpTextColor()); } catch (e6b) {}
  try { if (step3HelpLabel) step3HelpLabel.setTextColor(helpTextColor()); } catch (e6c) {}
  try { if (step2StatusLabel) paintStep2StatusLine(); } catch (e6d) {}
  try { if (sourceCaptionLabel) sourceCaptionLabel.setStringValue($(sourceCaptionText())); } catch (e7) {}
  try { if (destCaptionLabel) destCaptionLabel.setStringValue($(destCaptionText())); } catch (e8) {}
  try { if (progressLabel) progressLabel.setStringValue($(progressTitleText())); } catch (e9) {}
  try { if (clearLogButton) clearLogButton.setTitle($(clearLogButtonTitle())); } catch (e9b) {}
  try { if (modsField) modsField.setPlaceholderString($(modsPlaceholderText())); } catch (e10) {}
  function setBtn(btn, title) {
    if (!btn) return;
    try { btn.setTitle($(title)); } catch (e) {}
  }
  setBtn(openSourceButton, openBtnTitle());
  setBtn(chooseSourceButton, chooseBtnTitle());
  setBtn(openDestButton, openBtnTitle());
  setBtn(chooseDestButton, chooseBtnTitle());
  setBtn(openModsButton, openBtnTitle());
  setBtn(chooseModsButton, chooseBtnTitle());
  setBtn(clearModsButton, clearBtnTitle());
  try { paintStepHeaders(); } catch (e11) {}
  try { paintPrepareButton(!busy); } catch (e12) {}
  try { paintDownloadButton(!busy); } catch (e13) {}
  try { paintSyncButtons(!busy); } catch (e14) {}
  try { paintOpenConfigButtons(); } catch (e15) {}
  try { paintOpenModsButtons(); } catch (e16) {}
  try { refreshGuide(); } catch (e17) {}
}

function toggleUiLanguage() {
  uiLang = uiLang === 'en' ? 'zh' : 'en';
  saveUiLang(uiLang);
  try { appendLogFile('[ui-lang] lang=' + uiLang + '\n'); } catch (eLog) {}
  applyUiLanguage();
}

function buildInterface(app) {
  var windowWidth = 840;
  var outer = 10;
  var boxPadX = 7;
  var boxPadTop = 7;
  var boxPadBottom = 7;
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
  var captionZhH = 18;
  var captionZhGap = 2;
  var pathRowH = 28;
  var pathRowGap = 4;
  var prepareFont = $.NSFont.boldSystemFontOfSize(PREPARE_TITLE_SIZE);
  var prepareLine = measureText(prepareExistsTitle(), prepareFont).height;
  if (!(prepareLine > 0)) prepareLine = 16;
  // Single-language title → one line (+ padding), tighter than dual-line stack.
  var prepareH = Math.ceil(prepareLine + 18);
  if (prepareH < 44) prepareH = 44;
  if (prepareH > 56) prepareH = 56;
  var prepareW = Math.round(contentW * BIG_BUTTON_WIDTH_RATIO);
  var prepareTopGap = 5;
  var explainGap = 5;
  var configOpenH = CONFIG_OPEN_BUTTON_HEIGHT;
  // Action + optional 「最后更新于」 stamp (2 lines max now).
  var syncBtnH = Math.max(prepareH, 58);
  var configBtnGapY = 5;
  var fieldGap = 5;
  var downloadH = prepareH;
  var progressH = 16;
  var progressGap = 4;
  var logH = 96;

  var fontStep = $.NSFont.boldSystemFontOfSize(16);
  var fontHelp = $.NSFont.systemFontOfSize(12);
  var fontExplain = $.NSFont.systemFontOfSize(11);
  var fontStatus = $.NSFont.systemFontOfSize(12);
  var explainText = step2HelpText();
  var step1TitleMeasure = step1TitleText() + ' ✅';
  var step2TitleMeasure = step2TitleText() + ' ⚠️';
  var step3TitleMeasure = step3TitleText() + ' ✅';
  var step1HeaderH = measureWrappedHeight(step1TitleMeasure, contentW, fontStep, 20);
  var step1HelpH = measureWrappedHeight(step1HelpText(), contentW, fontHelp, 16);
  var step2HeaderH = measureWrappedHeight(step2TitleMeasure, contentW, fontStep, 20);
  var explainH = measureWrappedHeight(explainText, contentW, fontHelp, 16);
  var step2StatusH = 18;
  var step2StatusGapY = 4;
  var step3HeaderH = measureWrappedHeight(step3TitleMeasure, contentW, fontStep, 20);
  var step3HelpH = measureWrappedHeight(step3HelpText(), contentW, fontHelp, 16);
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

  var pathGroup = captionZhH + captionZhGap + pathRowH;
  var windowHeight = topInset
    + githubH + githubGap
    + boxPadTop + statusTitleH + 4 + statusBodyH + boxPadBottom + boxGap
    + boxPadTop + step1HeaderH + headerGap + step1HelpH + helpGap + pathGroup + pathRowGap + pathGroup + prepareTopGap + prepareH + boxPadBottom + boxGap
    + boxPadTop + step2HeaderH + headerGap + explainH + explainGap + configOpenH + configBtnGapY + step2StatusH + step2StatusGapY + syncBtnH + boxPadBottom + boxGap
    + boxPadTop + step3HeaderH + headerGap + step3HelpH + helpGap + pathRowH + fieldGap + configOpenH + configBtnGapY + downloadH + boxPadBottom + boxGap
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
  mainWindow.setTitle($(windowTitleText()));
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

  // Step title + top-right refresh (same row). Title width leaves room for the button.
  // 步骤标题 + 右上角刷新（同一行）；标题宽度给按钮留空。
  function addStepTitleWithRefresh(text, h, gap, refreshAction) {
    var refreshW = 72;
    var refreshGap = 6;
    var refreshH = 24;
    var y = row(h, gap);
    var titleW = contentW - refreshW - refreshGap;
    if (titleW < 120) titleW = contentW;
    var label = makeWrappingLabel(text, contentX, y, titleW, h, 15);
    label.setFont($.NSFont.boldSystemFontOfSize(15));
    try { label.setTextColor(stepColor); } catch (eColor) {}
    content.addSubview(label);
    var btn = null;
    if (titleW < contentW) {
      var btnY = y + h - refreshH;
      if (btnY < y) btnY = y;
      btn = makeButton(refreshStepButtonTitle(), contentX + titleW + refreshGap, btnY, refreshW, refreshH, refreshAction, 11);
      content.addSubview(btn);
      try { styleChromeButton(btn); } catch (eChrome) {}
    }
    return { label: label, button: btn };
  }

  var langW = 78;
  var topBtnGap = 7;
  var githubW = 148;
  var githubY = row(githubH, githubGap);
  var langX = boxX + boxW - langW;
  var githubX = langX - topBtnGap - githubW;
  releasesButton = makeButton(
    openGithubTitle(),
    githubX,
    githubY,
    githubW,
    githubH,
    'openReleases:',
    12
  );
  langButton = makeButton(
    langToggleTitle(),
    langX,
    githubY,
    langW,
    githubH,
    'toggleLanguage:',
    12
  );
  content.addSubview(releasesButton);
  content.addSubview(langButton);
  styleChromeButton(releasesButton);
  styleChromeButton(langButton);

  beginSection();
  statusTitleLabel = addText(statusTitleText(), statusTitleH, 4, 14, true, statusColor, false);
  statusField = addText('', statusBodyH, 0, 12, false, null, false);
  endSection(0.90, 0.95, 0.99, 0.32, 0.50, 0.70);

  beginSection();
  var step1Head = addStepTitleWithRefresh(step1TitleText(), step1HeaderH, headerGap, 'refreshStep1:');
  step1TitleLabel = step1Head.label;
  refreshStep1Button = step1Head.button;
  step1HelpLabel = addText(step1HelpText(), step1HelpH, helpGap, 11, false, null, false);
  try { step1HelpLabel.setTextColor(helpTextColor()); } catch (eHelp1) {}

  var pathOpenW = 78;
  var pathChooseW = 96;
  var pathGap = 5;
  function placePathRow(fieldValue, y, openAction, chooseAction) {
    var fieldW = contentW - pathOpenW - pathChooseW - pathGap * 2;
    var field = makeField(fieldValue, contentX, y + 2, fieldW, 24);
    var openButton = makeButton(openBtnTitle(), contentX + fieldW + pathGap, y, pathOpenW, 28, openAction);
    var chooseButton = makeButton(chooseBtnTitle(), contentX + fieldW + pathGap + pathOpenW + pathGap, y, pathChooseW, 28, chooseAction);
    content.addSubview(field);
    content.addSubview(openButton);
    content.addSubview(chooseButton);
    return { field: field, openButton: openButton, chooseButton: chooseButton };
  }

  sourceCaptionLabel = addText(
    sourceCaptionText(),
    captionZhH, captionZhGap, 12, true, null, false
  );
  var sourceRow = placePathRow('/Applications/Duckov.app', row(pathRowH, pathRowGap), 'openSource:', 'chooseSource:');
  sourceField = sourceRow.field;
  openSourceButton = sourceRow.openButton;
  chooseSourceButton = sourceRow.chooseButton;

  destCaptionLabel = addText(
    destCaptionText(),
    captionZhH, captionZhGap, 12, true, null, false
  );
  var destRow = placePathRow(
    joinPath(homeDir(), 'Applications/Duckov-COOP.app'),
    row(pathRowH, prepareTopGap),
    'openDest:',
    'chooseDest:'
  );
  destField = destRow.field;
  openDestButton = destRow.openButton;
  chooseDestButton = destRow.chooseButton;
  try { sourceField.setDelegate(controller); } catch (eSourceDelegate) {}
  try { destField.setDelegate(controller); } catch (eDestDelegate) {}

  var prepareX = contentX + Math.round((contentW - prepareW) / 2);
  var prepareY = row(prepareH, 0);
  var primary = makePrimaryButton(
    prepareButtonTitle(),
    prepareX, prepareY, prepareW, prepareH, 'prepare:'
  );
  prepareFill = primary.fill;
  prepareButton = primary.button;
  prepareSpinner = makeButtonSpinner(prepareButton, 16);
  if (prepareFill) content.addSubview(prepareFill);
  content.addSubview(prepareButton);
  paintPrepareButton(true);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  beginSection();
  var step2Head = addStepTitleWithRefresh(step2TitleText(), step2HeaderH, headerGap, 'refreshStep2:');
  step2TitleLabel = step2Head.label;
  refreshStep2Button = step2Head.button;
  explainLabel = addText(explainText, explainH, explainGap, 11, false, null, false);
  try { explainLabel.setFont($.NSFont.systemFontOfSize(11)); } catch (eExplainFont) {}
  try { explainLabel.setTextColor(helpTextColor()); } catch (eHelp2) {}
  var configBtnGap = 8;
  var step2RowW = Math.round(contentW * STEP2_BUTTON_ROW_RATIO);
  if (step2RowW < 200) step2RowW = contentW;
  var step2RowX = contentX + Math.round((contentW - step2RowW) / 2);
  var configBtnW = Math.floor((step2RowW - configBtnGap) / 2);
  var openConfigY = row(configOpenH, configBtnGapY);
  var openOriginalParts = makeFlatButton(
    step2RowX, openConfigY, configBtnW, configOpenH, 'openOriginalConfig:',
    openOriginalConfigTitle()
  );
  var openCoopParts = makeFlatButton(
    step2RowX + configBtnW + configBtnGap, openConfigY, configBtnW, configOpenH, 'openCoopConfig:',
    openCoopConfigTitle()
  );
  openOriginalFill = openOriginalParts.fill;
  openCoopFill = openCoopParts.fill;
  openOriginalConfigButton = openOriginalParts.button;
  openCoopConfigButton = openCoopParts.button;
  var step2StatusY = row(step2StatusH, step2StatusGapY);
  step2StatusLabel = makeWrappingLabel('', contentX, step2StatusY, contentW, step2StatusH, 11);
  try { step2StatusLabel.setFont($.NSFont.systemFontOfSize(11)); } catch (eStFont) {}
  try { step2StatusLabel.setAlignment(1); } catch (eStAlign) {}
  try { objc(step2StatusLabel.cell).setAlignment(1); } catch (eStAlign2) {}
  content.addSubview(step2StatusLabel);
  paintStep2StatusLine();
  var syncConfigY = row(syncBtnH, 0);
  syncLayoutGeom = {
    x: step2RowX,
    y: syncConfigY,
    halfW: configBtnW,
    gap: configBtnGap,
    rowW: step2RowW,
    h: syncBtnH,
    bigW: prepareW,
    bigX: prepareX
  };
  var syncToCoopParts = makeFlatButton(
    step2RowX, syncConfigY, configBtnW, syncBtnH, 'syncOriginalToCoop:',
    syncToCoopTitle()
  );
  var syncToOriginalParts = makeFlatButton(
    step2RowX + configBtnW + configBtnGap, syncConfigY, configBtnW, syncBtnH, 'syncCoopToOriginal:',
    syncToOriginalTitle()
  );
  syncToCoopFill = syncToCoopParts.fill;
  syncToOriginalFill = syncToOriginalParts.fill;
  syncToCoopButton = syncToCoopParts.button;
  syncToOriginalButton = syncToOriginalParts.button;
  syncToCoopSpinner = makeButtonSpinner(syncToCoopButton, 16);
  syncToOriginalSpinner = makeButtonSpinner(syncToOriginalButton, 16);
  if (openOriginalFill) content.addSubview(openOriginalFill);
  if (openCoopFill) content.addSubview(openCoopFill);
  if (syncToCoopFill) content.addSubview(syncToCoopFill);
  if (syncToOriginalFill) content.addSubview(syncToOriginalFill);
  content.addSubview(openOriginalConfigButton);
  content.addSubview(openCoopConfigButton);
  content.addSubview(syncToCoopButton);
  content.addSubview(syncToOriginalButton);
  paintOpenConfigButtons();
  paintSyncButtons(true);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  beginSection();
  var step3Head = addStepTitleWithRefresh(step3TitleText(), step3HeaderH, headerGap, 'refreshStep3:');
  step3TitleLabel = step3Head.label;
  refreshStep3Button = step3Head.button;
  step3HelpLabel = addText(step3HelpText(), step3HelpH, helpGap, 11, false, null, false);
  try { step3HelpLabel.setTextColor(helpTextColor()); } catch (eHelp3) {}

  var modsOpenW = 78;
  var modsChooseW = 96;
  var modsClearW = 78;
  var modsGap = 5;
  var modsRowY = row(pathRowH, fieldGap);
  var modsFieldW = contentW - modsOpenW - modsChooseW - modsClearW - modsGap * 3;
  modsField = makeField('', contentX, modsRowY + 2, modsFieldW, 26);
  try { modsField.setPlaceholderString($(modsPlaceholderText())); } catch (eMods) {}
  openModsButton = makeButton(openBtnTitle(), contentX + modsFieldW + modsGap, modsRowY, modsOpenW, 28, 'openMods:');
  chooseModsButton = makeButton(chooseBtnTitle(), contentX + modsFieldW + modsGap + modsOpenW + modsGap, modsRowY, modsChooseW, 28, 'chooseMods:');
  clearModsButton = makeButton(clearBtnTitle(), contentX + modsFieldW + modsGap + modsOpenW + modsGap + modsChooseW + modsGap, modsRowY, modsClearW, 28, 'clearMods:');
  content.addSubview(modsField);
  content.addSubview(openModsButton);
  content.addSubview(chooseModsButton);
  content.addSubview(clearModsButton);

  // Same size/placement math as Step2 open-config pair, above the Step3 download button.
  // 与第二步「打开配置位置」成对按钮同尺寸，放在第三步大下载按钮上方。
  var openModsY = row(configOpenH, configBtnGapY);
  var openOriginalModsParts = makeFlatButton(
    step2RowX, openModsY, configBtnW, configOpenH, 'openOriginalMods:',
    openOriginalModsTitle()
  );
  var openCoopModsParts = makeFlatButton(
    step2RowX + configBtnW + configBtnGap, openModsY, configBtnW, configOpenH, 'openCoopMods:',
    openCoopModsTitle()
  );
  openOriginalModsFill = openOriginalModsParts.fill;
  openCoopModsFill = openCoopModsParts.fill;
  openOriginalModsButton = openOriginalModsParts.button;
  openCoopModsButton = openCoopModsParts.button;
  if (openOriginalModsFill) content.addSubview(openOriginalModsFill);
  if (openCoopModsFill) content.addSubview(openCoopModsFill);
  content.addSubview(openOriginalModsButton);
  content.addSubview(openCoopModsButton);
  paintOpenModsButtons();

  var downloadY = row(downloadH, 0);
  var downloadParts = makeFlatButton(
    prepareX, downloadY, prepareW, prepareH, 'downloadMod:',
    downloadModTitle()
  );
  downloadFill = downloadParts.fill;
  downloadButton = downloadParts.button;
  downloadSpinner = makeButtonSpinner(downloadButton, 16);
  if (downloadFill) content.addSubview(downloadFill);
  content.addSubview(downloadButton);
  paintDownloadButton(true);
  endSection(0.985, 0.99, 0.995, 0.45, 0.55, 0.68);

  var progressY = row(progressH, progressGap);
  var clearLogW = 64;
  var clearLogH = 24;
  var clearLogGap = 6;
  var progressTitleW = boxW - clearLogW - clearLogGap;
  if (progressTitleW < 80) progressTitleW = boxW;
  progressLabel = makeWrappingLabel(progressTitleText(), boxX, progressY, progressTitleW, progressH, 12);
  content.addSubview(progressLabel);
  clearLogButton = null;
  if (progressTitleW < boxW) {
    var clearLogY = progressY + progressH - clearLogH;
    if (clearLogY < progressY) clearLogY = progressY;
    clearLogButton = makeButton(
      clearLogButtonTitle(),
      boxX + boxW - clearLogW,
      clearLogY,
      clearLogW,
      clearLogH,
      'clearLog:',
      11
    );
    content.addSubview(clearLogButton);
    try { styleChromeButton(clearLogButton); } catch (eClearChrome) {}
  }

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
  try { mainWindow.setInitialFirstResponder(null); } catch (eInitFocus) {}
  objc(mainWindow.center);
  mainWindow.makeKeyAndOrderFront(app);
  app.activateIgnoringOtherApps(true);
  clearInitialFocus();
  armFocusClear();
  paintPrepareButton(true);
  // Mod listing, the Release check, and the config compare start on the run
  // loop, after this window is ordered front.
  scheduleDestModScan();
  scheduleReleaseCheck();
  scheduleConfigCompare();
  queuePrepareCheck();
  paintDownloadButton(true);
  paintSyncButtons(true);
  try { maybeSmokeOpenMods(); } catch (eSmoke) {}
}
function startApp() {
  uiLang = loadUiLang();
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
  try {
    syncStateApi = loadSyncState(resources);
  } catch (error) {
    syncStateApi = null;
    syncStateError = String(error);
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
      alert.setMessageText($(L('无法打开', 'Could not open')));
      alert.setInformativeText($(String(error) + (error && error.stack ? '\n' + error.stack : '')));
      alert.addButtonWithTitle($(L('好', 'OK')));
      objc(alert.runModal);
    } catch (e2) {
      throw error;
    }
  }
}

main();
