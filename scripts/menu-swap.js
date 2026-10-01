#!/usr/bin/env node
// menu-swap.js: the site-wide menu, the quiet footer, unlisting and the light lock.
//
// Re-runnable by design (2026-09-27): run it after any merge, then node build.js.
// It never deletes a page. Every change it makes checks the current state first,
// so a second run changes nothing.
//
//   node scripts/menu-swap.js             apply
//   node scripts/menu-swap.js --dry-run   report only
//   node scripts/menu-swap.js --only a.html,b/index.html   sample pages (Rule 30)
//
// The config lives in content/nav.json (menu, footer, unlisted, lightLock), which
// build.js reads too, so hand pages and generated pages cannot drift.
//
// What each part means:
// - menu: Home, Free Toolkit, Newsletter, Contact on every page that carries a site
//   menu. /newsletter/ falls back to /updates/ while newsletter/index.html is still
//   a redirect stub.
// - unlisted: off every menu, noindex, and so out of sitemap.xml (build.js skips
//   noindex pages). The addresses keep working for QR codes, emails and old posts.
// - lightLock: sales pages stay dark text on light (Rule 34). The theme toggle is
//   removed and <html data-theme="light" data-theme-lock> stops a saved "dark"
//   preference from flipping them (js/site.js honours the lock).
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const NAV_PATH = path.join(DIR, 'content', 'nav.json');
const DRY = process.argv.includes('--dry-run');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const read = f => fs.readFileSync(f, 'utf8');
const NAVC = JSON.parse(read(NAV_PATH));

// Never touched at all: separate businesses, generated elsewhere, binaries.
const OFF_LIMITS = ['titles/', 'books/', 'dl/', 'node_modules/', '.claude/', '.git/'];
// Unlisted (noindex) where needed, but their own header and footer stay as they are:
// standalone tools, games, quizzes, print sheets, redirect stubs, saved parts, and the
// audit page (its session gives it a standalone header, hub note 2026-09-27).
const KEEP_CHROME = ['play/', 'apps/', 'studio/', 'colour/', 'components/', 'archive/',
  'oto/', 'book1-feedback/', 'record/', 'review/', 'quiz/', 'quiz-ai-risk/',
  'quiz-time-waste/', 'quiz-tool-picker/', 'services/events/one-sheet/', 'links/',
  'system/', 'thank-you/', 'toolkit/', 'tsa-toolkit/', 'vault/', 'claude/',
  'content-machine/', 'projects/', 'essays/', 'google-ads-audit', 'index_v', 'book.html',
  'index.html',
  // A single-offer squeeze page with its own header CTA; a menu would compete with it.
  'free/ai-toolkit/', 'free/directors-cheat-sheet/',
  // Unlisted previews own their chrome (the long-form homepage goes live only on Elvin's yes).
  'preview/'];

const under = (rel, list) => list.some(p => rel === p || rel.startsWith(p));
const urlOf = rel => '/' + rel.replace(/(^|\/)index\.html$/, '$1');
const isStub = f => !fs.existsSync(f) || /http-equiv="refresh"/i.test(read(f));
const stats = {};
const bump = (k, rel) => { (stats[k] = stats[k] || []).push(rel); };

/* ---- 1. resolve the config in nav.json ---------------------------------- */
const nlLive = !isStub(path.join(DIR, 'newsletter', 'index.html'));
const resolve = l => {
  const o = { label: l.label, href: l.fallback && !nlLive ? l.fallback : l.href };
  if (l.ext) o.ext = true;
  return o;
};
const MENU = NAVC.menu.map(resolve);
const FOOT = NAVC.footer.map(resolve);
const navBefore = JSON.stringify(NAVC);
NAVC.links = MENU;
NAVC.footerLinks = FOOT;
for (const [key, pg] of Object.entries(NAVC.pages || {})) {
  if (pg.style === 'buybar' && pg.links) pg.links = MENU; // the rest take nav.json links (#486)
  if (pg.themebtn) pg.themebtn = false;
  const self = urlOf(key);
  const hit = MENU.find(l => l.href !== '/' && l.href === self);
  if (hit) pg.active = hit.href; else if (pg.active && !MENU.some(l => l.href === pg.active)) delete pg.active;
}
if (JSON.stringify(NAVC) !== navBefore) {
  bump('nav.json updated', 'content/nav.json');
  if (!DRY) fs.writeFileSync(NAV_PATH, JSON.stringify(NAVC, null, 1) + '\n');
}

/* ---- 2. the markup ------------------------------------------------------ */
const EXT = l => (l.ext ? ' target="_blank" rel="noopener"' : '');
const menuLinks = self => MENU.map(l =>
  `<a href="${l.href}"${l.href === self ? ' aria-current="page"' : ''}>${l.label}</a>`).join('');
const footLinks = () => FOOT.map(l => `<a href="${l.href}"${EXT(l)}>${l.label}</a>`).join(' &middot; ');
// Hand pages with the small .mtop header (the /free/ guides, privacy, terms) get
// the menu as a second item in that header. Scoped to .mnav so it cannot restyle
// anything else on the page; tap targets are 44px (DESIGN-SYSTEM.md).
const MNAV_CSS = '<style id="ep-mnav">.mtop{flex-wrap:wrap;gap:4px 16px}' +
  '.mnav{display:flex;flex-wrap:wrap;gap:0 18px}' +
  '.mnav a{font-size:15px;color:var(--ink-2);text-decoration:none;min-height:44px;display:inline-flex;align-items:center}' +
  '.mnav a:hover,.mnav a[aria-current]{color:var(--ink)}</style>';

/* ---- 3. walk the pages --------------------------------------------------- */
const GEN = new Set();
for (const sub of ['pages', 'cities', 'provinces']) {
  const d = path.join(DIR, 'content', sub);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.json'))) {
    const slug = JSON.parse(read(path.join(d, f))).slug;
    if (slug) { GEN.add(slug + '/index.html'); GEN.add('fr/' + slug + '/index.html'); }
  }
}
function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!under(r + '/', OFF_LIMITS)) walk(path.join(dir, e.name), r, out); }
    else if (e.name.endsWith('.html') && !under(r, OFF_LIMITS)) out.push(r);
  }
  return out;
}
const pages = walk(DIR, '', []);

for (const rel of pages) {
  if (ONLY && !ONLY.has(rel)) continue;
  // Generated by build.js (bilingual engine) or essay-page.js (the blog): the
  // generators carry the same config, so the output files are left to them.
  if (GEN.has(rel) || rel.startsWith('writing/')) continue;
  const file = path.join(DIR, rel);
  let h = read(file);
  const before = h;
  const url = urlOf(rel);

  // Unlisted: noindex. An existing robots meta without noindex gets it added.
  // Fragments (no <head>: saved components, essay sources) are not pages; skip them.
  if (/<head[\s>]/i.test(h) && under(url.slice(1), NAVC.unlisted) && !under(url.slice(1), NAVC.unlistedExcept || [])) {
    const m = h.match(/<meta name="robots" content="([^"]*)"\s*\/?>/i);
    if (!m) {
      h = h.replace(/(<meta charset="?[^">]*"?>)/i, '$1\n<meta name="robots" content="noindex">');
      if (!/name="robots"/.test(h)) h = h.replace(/<\/head>/i, '<meta name="robots" content="noindex">\n</head>');
      bump('noindex added', rel);
    } else if (!/noindex/i.test(m[1])) {
      h = h.replace(m[0], `<meta name="robots" content="noindex, ${m[1]}">`);
      bump('noindex added', rel);
    }
  }

  // Light lock on sales pages: no toggle, pinned light.
  // Redirect stubs render nothing, and other sessions own them: leave them alone.
  if ((under(url.slice(1), NAVC.lightLock) || url === '/privacy.html' || url === '/tos.html') && !/http-equiv="refresh"/i.test(h)) {
    const n = (h.match(/<button[^>]*data-theme-toggle[^>]*>[\s\S]*?<\/button>/g) || []).length;
    if (n) { h = h.replace(/\s*<button[^>]*data-theme-toggle[^>]*>[\s\S]*?<\/button>/g, ''); bump('theme toggle removed', rel); }
    // data-theme="book" is its own light palette and already never flips (js/site.js).
    if (!/<html[^>]*(data-theme-lock|data-theme="book")/.test(h)) {
      h = h.replace(/<html([^>]*)>/i, (m, a) =>
        '<html' + a.replace(/\sdata-theme="[^"]*"/, '') + ' data-theme="light" data-theme-lock>');
      bump('light lock', rel);
    }
  }

  // Redirect stubs have no chrome to change.
  if (!under(rel, KEEP_CHROME) && !/http-equiv="refresh"/i.test(h)) {
    let menu = /<!-- ep:nav/.test(h); // ep:nav pages get the menu from build.js
    // The .mtop header.
    const mt = h.match(/<div class="mtop">(<a class="brand"[^>]*>[\s\S]*?<\/a>)([\s\S]*?)<\/div>/);
    if (mt) {
      const want = `<div class="mtop">${mt[1]}<nav class="mnav" aria-label="Main">${menuLinks(url)}</nav></div>`;
      if (mt[0] !== want) { h = h.replace(mt[0], want); bump('menu (mtop header)', rel); }
      if (!h.includes('id="ep-mnav"')) h = h.replace(/<\/head>/i, MNAV_CSS + '</head>');
      else h = h.replace(/<style id="ep-mnav">[\s\S]*?<\/style>/, MNAV_CSS);
      menu = true;
    }
    // A bare <nav> with a logo link and plain links (systematic-advantage.html).
    const bn = h.match(/<nav>\s*(<a href="\/" class="nav-logo">[\s\S]*?<\/a>)([\s\S]*?)<\/nav>/);
    if (bn) {
      const links = MENU.map(l => `<a href="${l.href}" class="nav-link">${l.label}</a>`).join('\n    ');
      const want = `<nav>\n    ${bn[1]}\n    <span class="nav-links">${links}</span>\n  </nav>`;
      if (bn[0] !== want) { h = h.replace(bn[0], want); bump('menu (bare nav)', rel); }
      menu = true;
    }
    if (!menu) bump('NO MENU (check by hand)', rel);

    // Quiet footer: swap the link span; odd footers get a rebuilt inside.
    const fm = h.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/);
    // A footer that already links exactly the quiet set is left as its author built it.
    const hrefs = fm && [...fm[0].matchAll(/href="([^"]*)"/g)].map(m => m[1]).sort().join(' ');
    if (fm && hrefs !== FOOT.map(l => l.href).sort().join(' ')) {
      const quiet = `<span>${footLinks()}</span>`;
      let f = fm[0];
      const spans = [...f.matchAll(/<span>((?:(?!<\/?span)[\s\S])*?<a [\s\S]*?)<\/span>/g)];
      if (spans.length) {
        const last = spans[spans.length - 1][0];
        if (last !== quiet) f = f.replace(last, quiet);
      } else {
        const yr = f.includes('id="yr"') ? '&copy; <span id="yr">2026</span>' : '&copy; 2026';
        const inner = `<span>${yr} Elvin M. Peters</span> ${quiet}`;
        const wrap = f.match(/^(<footer\b[^>]*>\s*<div class="[^"]*">)([\s\S]*?)(<\/div>\s*<\/footer>)$/);
        f = wrap ? wrap[1] + '\n  ' + inner + '\n' + wrap[3]
                 : f.replace(/^(<footer\b[^>]*>)[\s\S]*(<\/footer>)$/, `$1\n    ${inner}\n  $2`);
      }
      if (f !== fm[0]) { h = h.replace(fm[0], f); bump('quiet footer', rel); }
    }
    // The small .mfoot line under the .mtop pages.
    const mf = h.match(/<div class="mfoot">[\s\S]*?<\/div>/);
    if (mf) {
      const want = `<div class="mfoot">${footLinks()}</div>`;
      if (mf[0] !== want) { h = h.replace(mf[0], want); bump('quiet footer', rel); }
    }
  }

  if (h !== before && !DRY) fs.writeFileSync(file, h);
}

/* ---- 4. report ------------------------------------------------------------ */
console.log('menu-swap' + (DRY ? ' (dry run)' : '') + ': newsletter link -> ' +
  (nlLive ? '/newsletter/ (page is live)' : '/updates/ (newsletter/index.html is still a redirect stub)'));
for (const [k, list] of Object.entries(stats)) {
  console.log(`  ${k}: ${list.length}` + (list.length <= 12 || k.startsWith('NO MENU') ? '  ' + list.join(', ') : ''));
}
console.log('Next: node build.js && node verify.js');
