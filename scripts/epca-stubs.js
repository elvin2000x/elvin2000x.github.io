// epca-stubs.js: the blog and fun sections moved to epeters.ca (ticket #12, 2026-09-27).
// Every page that lived under a moved folder becomes a redirect stub at its old address,
// so old links, ads, emails and QR codes still land. Everything else in those folders
// (scripts, styles, data, the generated homepage cards) is deleted: it now lives in
// the epeters-ca repo. Re-runnable: a stub is rewritten to the same bytes.
//   node scripts/epca-stubs.js
// The JS redirect carries the query string and hash (calculators read ?amount=);
// the meta refresh is the no-JS fallback.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
// .com folder -> path on epeters.ca. Colour Match sits under Projects there. The blog
// is /blog/ on epeters.ca since #367 (its old /writing/ there is stubs too), so these
// point straight at /blog/ and a reader takes one hop, not two.
// quiz/ (the AI-style quiz) is not here: it stays on .com as an ad-funnel lead
// magnet, Meta ads and conversions run through it (Elvin, 2026-09-27, card #358).
const MOVED = {
  'writing': 'blog', 'play': 'play', 'apps': 'apps', 'projects': 'projects',
  'quiz-ai-risk': 'quiz-ai-risk', 'quiz-time-waste': 'quiz-time-waste',
  'quiz-tool-picker': 'quiz-tool-picker', 'colour': 'projects/colour',
};
const DROP = new Set(['writing/_homepage_cards.html']);

function walk(rel) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const r = rel + '/' + e.name;
    if (e.isDirectory()) out.push(...walk(r)); else out.push(r);
  }
  return out;
}
const stub = to => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- ep:moved-stub -->
<title>This page moved to The Rabbit Hole</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${to}">
<script>location.replace('${to}' + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body><p>This page moved. <a href="${to}">Go to the new page</a>.</p></body>
</html>
`;

let stubs = 0, removed = 0;
for (const [from, to] of Object.entries(MOVED)) {
  if (!fs.existsSync(path.join(ROOT, from))) continue;
  for (const r of walk(from)) {
    const f = path.join(ROOT, r);
    if (!r.endsWith('.html') || DROP.has(r)) { fs.unlinkSync(f); removed++; continue; }
    const rest = r.slice(from.length + 1).replace(/(^|\/)index\.html$/, '$1');
    fs.writeFileSync(f, stub(`https://epeters.ca/${to}/${rest}`));
    stubs++;
  }
}
// Drop folders the deletes left empty.
for (const from of Object.keys(MOVED)) if (fs.existsSync(path.join(ROOT, from))) {
  (function prune(rel) {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }))
      if (e.isDirectory()) prune(rel + '/' + e.name);
    if (!fs.readdirSync(path.join(ROOT, rel)).length) fs.rmdirSync(path.join(ROOT, rel));
  })(from);
}
console.log(`${stubs} redirect stubs written, ${removed} moved file(s) removed`);
