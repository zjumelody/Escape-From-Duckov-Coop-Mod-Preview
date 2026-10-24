#!/usr/bin/env node
'use strict';
// Contract test for in-process mirror semantics used by mirrorConfigTreeInProcess
// in main.js: always create missing dirs (including empty), delete dest-only paths,
// and AFTER copies re-apply every source directory mtime onto dest so identical
// content + unequal empty-folder times become matching after sync.
// 对齐 main.js 本进程镜像：必建空目录、删目标多余项，并在复制后把来源目录 mtime 套到目标。

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child = require('child_process');

function listRelativePathsUnder(root) {
  var out = [];
  function walk(relDir) {
    var absDir = relDir ? path.join(root, relDir) : root;
    var names = fs.readdirSync(absDir);
    names.forEach(function (base) {
      if (!base) return;
      var rel = relDir ? relDir + '/' + base : base;
      var abs = path.join(root, rel);
      out.push(rel);
      var st = fs.lstatSync(abs);
      if (!st.isSymbolicLink() && st.isDirectory()) walk(rel);
    });
  }
  if (fs.existsSync(root)) walk('');
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function mtimeSec(p) {
  return Math.floor(fs.statSync(p).mtimeMs / 1000);
}

function setMtimeSec(p, sec) {
  var d = new Date(sec * 1000);
  fs.utimesSync(p, d, d);
}

function applySourceModificationDate(from, to) {
  setMtimeSec(to, mtimeSec(from));
}

function mirrorConfigTree(src, dest) {
  if (!fs.existsSync(src)) throw new Error('missing-source');
  ensureDir(dest);
  var srcRels = listRelativePathsUnder(src);
  var destRels = listRelativePathsUnder(dest);
  var keep = {};
  srcRels.forEach(function (r) { keep[r] = true; });
  destRels.sort(function (a, b) { return b.length - a.length; });
  destRels.forEach(function (rel) {
    if (keep[rel]) return;
    fs.rmSync(path.join(dest, rel), { recursive: true, force: true });
  });
  srcRels.sort(function (a, b) { return a.length - b.length; });
  srcRels.forEach(function (rel) {
    var from = path.join(src, rel);
    var to = path.join(dest, rel);
    var st = fs.lstatSync(from);
    if (st.isSymbolicLink()) {
      try { fs.rmSync(to, { recursive: true, force: true }); } catch (e) {}
      fs.symlinkSync(fs.readlinkSync(from), to);
    } else if (st.isDirectory()) {
      ensureDir(to);
    } else {
      try { fs.rmSync(to, { force: true }); } catch (e) {}
      fs.copyFileSync(from, to);
      // Preserve file mtime like NSFileManager copyItem / rsync -a.
      setMtimeSec(to, mtimeSec(from));
    }
  });
  // Critical: re-apply directory mtimes after file copies.
  srcRels.forEach(function (rel) {
    var from = path.join(src, rel);
    var to = path.join(dest, rel);
    var st = fs.lstatSync(from);
    if (st.isSymbolicLink() || !st.isDirectory()) return;
    if (!fs.existsSync(to)) return;
    applySourceModificationDate(from, to);
  });
}

function fingerprintDirs(root) {
  // Minimal content fingerprint: dirs by rel path, files by sha via openssl-ish size+content.
  var crypto = require('crypto');
  var records = [];
  listRelativePathsUnder(root).forEach(function (rel) {
    var abs = path.join(root, rel);
    var st = fs.lstatSync(abs);
    if (st.isDirectory()) records.push('D\t' + rel);
    else if (st.isSymbolicLink()) records.push('L\t' + fs.readlinkSync(abs) + '\t' + rel);
    else {
      var h = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      records.push('F\t' + h + '\t' + rel);
    }
  });
  records.sort();
  return records.join('\n');
}

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'duckov-mirror-'));
var left = path.join(root, 'original');
var right = path.join(root, 'coop');
try {
  // --- Case A: same-named empty folder both sides, different mtimes, identical content ---
  ensureDir(path.join(left, 'Saves'));
  ensureDir(path.join(right, 'Saves'));
  fs.writeFileSync(path.join(left, 'Saves', 'slot.txt'), 'same\n');
  fs.writeFileSync(path.join(right, 'Saves', 'slot.txt'), 'same\n');
  setMtimeSec(path.join(left, 'Saves', 'slot.txt'), 1000);
  setMtimeSec(path.join(right, 'Saves', 'slot.txt'), 1000);

  var emptyName = '新建文件夹';
  ensureDir(path.join(left, emptyName));
  ensureDir(path.join(right, emptyName));
  setMtimeSec(path.join(left, emptyName), 1200);
  setMtimeSec(path.join(right, emptyName), 1400);

  assert.strictEqual(fingerprintDirs(left), fingerprintDirs(right), 'pre: content fingerprint identical');
  assert.notStrictEqual(mtimeSec(path.join(left, emptyName)), mtimeSec(path.join(right, emptyName)), 'pre: empty folder times differ');

  // Sync left → right (older empty folder onto newer): dest empty folder time must become 1200.
  mirrorConfigTree(left, right);
  assert.ok(fs.existsSync(path.join(right, emptyName)), 'empty folder still on dest');
  assert.strictEqual(mtimeSec(path.join(right, emptyName)), 1200, 'dest empty folder mtime must match source after sync');
  assert.strictEqual(mtimeSec(path.join(left, emptyName)), 1200, 'source empty folder mtime unchanged');
  assert.strictEqual(fingerprintDirs(left), fingerprintDirs(right), 'post: content still identical');

  // Reset unequal times and sync right → left.
  setMtimeSec(path.join(left, emptyName), 1200);
  setMtimeSec(path.join(right, emptyName), 1400);
  mirrorConfigTree(right, left);
  assert.strictEqual(mtimeSec(path.join(left, emptyName)), 1400, 'left empty folder mtime must match right after reverse sync');

  // --- Case B: empty folder only on source → appears on dest with source mtime ---
  fs.rmSync(path.join(left, emptyName), { recursive: true, force: true });
  var onlySrc = 'OnlyOnSourceEmpty';
  ensureDir(path.join(right, onlySrc));
  setMtimeSec(path.join(right, onlySrc), 1600);
  assert.ok(!fs.existsSync(path.join(left, onlySrc)), 'pre: only on source (right)');
  mirrorConfigTree(right, left);
  assert.ok(fs.existsSync(path.join(left, onlySrc)), 'empty folder only on source must appear on dest');
  assert.strictEqual(mtimeSec(path.join(left, onlySrc)), 1600, 'new empty folder must get source mtime');

  // --- Case C: confirm main.js contains the real apply helper (GUI path) ---
  var mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(mainJs.indexOf('function applySourceModificationDate') !== -1, 'main.js missing applySourceModificationDate');
  assert.ok(mainJs.indexOf('function mirrorConfigTreeInProcess') !== -1, 'main.js missing mirrorConfigTreeInProcess');
  var start = mainJs.indexOf('function mirrorConfigTreeInProcess');
  var end = mainJs.indexOf('\nfunction ', start + 10);
  var body = mainJs.slice(start, end > 0 ? end : start + 2500);
  assert.ok(body.indexOf('applySourceModificationDate') !== -1, 'mirrorConfigTreeInProcess must call applySourceModificationDate');

  console.log('config-mirror.test.js ok');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
