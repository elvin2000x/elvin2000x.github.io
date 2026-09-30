/* Lead magnet pages onto fields (#464, 2026-09-29). Same method as
   scripts/stack-convert.js: prove before anything ships.

     node scripts/free-convert.js            write content/free/<slug>.json, then prove
     node scripts/free-convert.js --check    prove only (no writes)
     node scripts/free-convert.js --list     which fields each page has

   The proof works on the COMMITTED page (git HEAD, LF; the working tree may be
   CRLF). For each page it
     1. fills the committed page from its JSON and requires the exact bytes back;
     2. blanks every slot the JSON fills (so the frame alone can't pass the test),
        fills it again from the JSON and requires the exact bytes back.
   Any difference stops it with the first differing line. */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const F = require('../free-pages.js');

const ROOT = path.join(__dirname, '..');
const OUTDIR = path.join(ROOT, 'content', 'free');
const CHECK = process.argv.includes('--check'), LIST = process.argv.includes('--list');
// --ref <commit>: prove against another commit (default HEAD).
const refArg = process.argv.indexOf('--ref');
const REF = refArg > -1 ? process.argv[refArg + 1] : 'HEAD';

const committed = rel => execFileSync('git', ['show', REF + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
const lf = s => s.replace(/\r\n/g, '\n');

function firstDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i])
    return 'line ' + (i + 1) + '\n    want: ' + String(x[i]).slice(0, 160) + '\n    got:  ' + String(y[i]).slice(0, 160);
  return 'same lines, different bytes';
}
function blank(html, data) {
  const empty = {};
  for (const s of F.SLOTS) if (s.key in data || (s.share && new RegExp(s.re.source).test(html))) empty[s.key] = s.list ? [] : s.num ? 0 : '\u0000';
  return F.render(html, empty, 'blank');
}

let bad = 0, n = 0;
for (const { slug, file } of F.pages(ROOT)) {
  const html = committed(file);
  let data;
  const jf = path.join(OUTDIR, slug + '.json');
  if (CHECK) {
    if (!fs.existsSync(jf)) { console.log('✗ ' + file + ': no content/free/' + slug + '.json'); bad++; continue; }
    data = JSON.parse(fs.readFileSync(jf, 'utf8'));
  } else {
    try { data = F.extract(html, file); } catch (e) { console.log('✗ ' + e.message); bad++; continue; }
  }
  if (LIST) { console.log(slug.padEnd(22) + Object.keys(data).join(', ')); continue; }
  let ok = true;
  try {
    const a = F.render(html, data, file);
    if (a !== html) { console.log('✗ ' + file + ' (fill): ' + firstDiff(html, a)); ok = false; }
    const b = F.render(blank(html, data), data, file);
    if (b !== html) { console.log('✗ ' + file + ' (from blank): ' + firstDiff(html, b)); ok = false; }
  } catch (e) { console.log('✗ ' + e.message); ok = false; }
  if (!ok) { bad++; continue; }
  n++;
  if (!CHECK) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    const body = JSON.stringify(data, null, 2) + '\n';
    if (!fs.existsSync(jf) || lf(fs.readFileSync(jf, 'utf8')) !== body) fs.writeFileSync(jf, body);
  }
}
if (LIST) process.exit(bad ? 1 : 0);
console.log((bad ? 'FAIL' : 'OK') + ': ' + n + ' of ' + (n + bad) + ' /free/ pages rebuild byte for byte from content/free/*.json (ref ' + REF + ')');
process.exit(bad ? 1 : 0);
