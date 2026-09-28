#!/usr/bin/env node
/* Build the site with private drafts laid over it, without writing a draft into
   the repo. Studio previews and the test site run this; a publish runs build.js
   itself.

   Run: node studio/build-drafts.js --overlay <dir> --out <dir>

   <overlay> holds files at their repo paths (content/claude.json, essays/x.html,
   img/uploads/y.png). While build.js runs, any read of a repo file that has a copy
   in <overlay> gets the copy; directory listings include overlay-only files. Only
   reads are redirected: build.js in --out mode writes to <out> alone, so the
   working tree is never touched. build.js and verify.js stay unchanged. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? path.resolve(process.argv[i + 1]) : null; };
const OVERLAY = arg('--overlay'), OUT = arg('--out');
if (!OVERLAY || !OUT) { console.error('usage: build-drafts.js --overlay <dir> --out <dir>'); process.exit(2); }

const inRoot = p => { const r = path.relative(ROOT, p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : null; };
// The overlay copy of a repo path, if there is one. The out dir may sit anywhere, so
// only paths under ROOT and outside OUT are redirected.
function over(p) {
  if (typeof p !== 'string' && !(p instanceof URL)) return null;
  const abs = path.resolve(String(p instanceof URL ? p.pathname : p));
  if (!path.relative(OUT, abs).startsWith('..')) return null;
  const rel = inRoot(abs);
  if (!rel) return null;
  const o = path.join(OVERLAY, rel);
  return fs.realExistsSync(o) ? o : null;
}
fs.realExistsSync = fs.existsSync;
for (const fn of ['readFileSync', 'existsSync', 'statSync', 'lstatSync']) {
  const orig = fs[fn];
  fs[fn] = function (p, ...a) { const o = over(p); return orig.call(fs, o || p, ...a); };
}
const readdir = fs.readdirSync;
fs.readdirSync = function (p, opts) {
  const names = readdir.call(fs, p, opts);
  const abs = typeof p === 'string' ? path.resolve(p) : null;
  const rel = abs && inRoot(abs);
  const odir = rel != null && path.join(OVERLAY, rel);
  if (!odir || !fs.realExistsSync(odir) || (opts && opts.withFileTypes)) return names;
  for (const n of readdir.call(fs, odir)) if (!names.includes(n)) names.push(n);
  return names.sort();
};

process.argv = [process.argv[0], path.join(ROOT, 'build.js'), '--out', OUT];
require(path.join(ROOT, 'build.js'));
