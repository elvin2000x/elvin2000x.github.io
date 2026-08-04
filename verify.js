// verify.js — the polish gate. Zero dependencies. Run after build.js; a FAIL
// means DO NOT PUSH. Checks are split into FAIL (blocking) and WARN
// (visible debt) so the gate is green at birth and tightens over time.
// Usage: node verify.js          (static checks, <1s)
//        node verify.js --visual (optional Playwright layer; skips cleanly if absent)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

// Pages excluded from every check: other businesses, retired stubs,
// generated-elsewhere pipelines, binaries.
const EXCLUDE = /^(titles|books|play|book1-feedback|oto|dl|studio)([\\/]|$)|^index_v[0-9]\.html$|^apps\/index\.html$|^writing\/_homepage_cards\.html$|^toolkit\/index\.html$/;
// Pages fully on the design system: strictest rules apply here.
const TOKENIZED = new Set(['index.html', 'book.html']);

const fails = [], warns = [];
function fail(f, msg) { fails.push(f + ': ' + msg); }
function warn(f, msg) { warns.push(f + ': ' + msg); }

function* htmlFiles(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (EXCLUDE.test(r) || e.name === '.git' || e.name === '.claude' || e.name === 'node_modules') continue;
    if (e.isDirectory()) yield* htmlFiles(path.join(dir, e.name), r);
    else if (e.name.endsWith('.html')) yield r;
  }
}

const PAGES = [...htmlFiles(ROOT, '')];

for (const rel of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // PIXELS: analytics on every page (magnet/LP/legal pages all carry them today).
  if (!html.includes('G-CLZ7N26J1Q')) warn(rel, 'missing GA4');
  if (!html.includes('1699232654449762') && html.includes('G-CLZ7N26J1Q')) warn(rel, 'missing Meta pixel');

  // STALE-TRUTH tripwires (these were real incidents).
  for (const bad of ['elvin2000x.github.io', 'epeters.ca', 'href="/#apps"', 'href="/#games"', 'beehiiv'])
    if (html.includes(bad)) fail(rel, 'stale-truth tripwire: ' + bad);

  // SECRET tripwires (public repo).
  for (const re of [/sk-[A-Za-z0-9]{16}/, /ghp_[A-Za-z0-9]/, /github_pat_/, /AKIA[0-9A-Z]{12}/, /BEGIN [A-Z ]*PRIVATE KEY/])
    if (re.test(html)) fail(rel, 'possible secret matches ' + re);

  // FORM-16: no form control under 16px (iOS zoom).
  const controlRules = html.match(/[^{}]*(?:input|textarea|select)[^{}]*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px[^}]*\}/g) || [];
  for (const rule of controlRules) {
    const size = parseFloat(rule.match(/font-size:\s*(\d+(?:\.\d+)?)px/)[1]);
    if (size < 16) fail(rel, 'form control at ' + size + 'px (iOS zooms under 16px)');
  }
  const inlineControls = html.match(/<(?:input|textarea|select)[^>]*style="[^"]*font-size:\s*(\d+(?:\.\d+)?)px/g) || [];
  for (const tag of inlineControls) {
    const size = parseFloat(tag.match(/font-size:\s*(\d+(?:\.\d+)?)px/)[1]);
    if (size < 16) fail(rel, 'inline form control at ' + size + 'px');
  }

  // TYPE-FLOOR: nothing under 12px anywhere; fractional px are the old disease.
  for (const m of html.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    const size = parseFloat(m[1]);
    const report = TOKENIZED.has(rel) ? fail : warn;
    if (size < 12) report(rel, 'font-size ' + size + 'px under the 12px floor');
    else if (size % 1 !== 0) report(rel, 'fractional font-size ' + size + 'px');
  }

  // CSS-BALANCE: one missing brace silently kills every rule after it. This
  // shipped live on /system/ (2026-08-04): a dropped } swallowed the price
  // block, the guarantee and the trust row, and no other check could see it
  // because the HTML was perfectly valid.
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '');   // comments first
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth < 0) break;
    }
    if (depth !== 0)
      fail(rel, 'unbalanced braces in a <style> block (' +
        (depth > 0 ? depth + ' rule(s) never closed; everything after is dropped' : 'extra closing brace') + ')');
  }

  // IMG-INLINE-W: the stretched-cover bug class. Zero tolerance.
  if (/<img[^>]*style="[^"]*width\s*:\s*\d+px/.test(html))
    fail(rel, 'inline pixel width on an <img> (the sideways-book bug class)');

  // IMG-DIMS + IMG-LAZY on tokenized pages (others warn).
  const imgs = html.match(/<img[^>]*>/g) || [];
  let idx = 0;
  for (const tag of imgs) {
    if (tag.includes('display:none')) continue; // tracking pixels
    idx++;
    const report = TOKENIZED.has(rel) ? fail : warn;
    if (!/width="\d+"/.test(tag) || !/height="\d+"/.test(tag)) report(rel, 'img without width/height: ' + tag.slice(0, 60));
    if (idx > 2 && !tag.includes('loading=')) report(rel, 'below-fold img not lazy: ' + tag.slice(0, 60));
  }

  // DEAD-CTA: href="#" is a broken promise; #anchors must resolve on-page.
  if (/href="#"[^>]*>/.test(html)) fail(rel, 'dead href="#" CTA');
  for (const m of html.matchAll(/href="#([A-Za-z][\w-]*)"/g))
    if (!new RegExp('id="' + m[1] + '"').test(html)) fail(rel, 'anchor #' + m[1] + ' has no target');

  // BREAKPOINTS: canonical set is 640/920 (bp-exempt comment opts a line out).
  for (const m of html.matchAll(/@media[^{]*max-width:\s*(\d+)px[^{]*\{/g)) {
    const bp = +m[1];
    if (bp !== 640 && bp !== 920) {
      const line = html.slice(0, m.index).split('\n').length;
      const lineText = html.split('\n')[line - 1] || '';
      if (!lineText.includes('bp-exempt')) warn(rel, 'off-system breakpoint ' + bp + 'px (line ' + line + ')');
    }
  }

  // HEADINGS: exactly one h1.
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) warn(rel, h1s + ' h1 elements');

  // TOKEN-DISCIPLINE: hex literals belong in css/site.css only (tokenized pages).
  if (TOKENIZED.has(rel)) {
    const styleBlocks = html.match(/<style>[\s\S]*?<\/style>/g) || [];
    const hexes = (styleBlocks.join('').match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
    if (hexes > 12) warn(rel, hexes + ' hex literals in page CSS (target: 0, tokens only)');
  }
}

// CONTRAST-TOKENS: the palette defends itself. Pure math on css/site.css.
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'css/site.css'), 'utf8');
  const val = n => { const m = css.match(new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})')); return m && m[1]; };
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const contexts = { l: 'site-light', d: 'site-dark', b: 'book-light' };
  for (const p of Object.keys(contexts)) {
    const bg = val(p + '-bg'), panel = val(p + '-panel');
    for (const [role, min] of [['ink', 4.5], ['ink2', 4.5], ['muted', 4.5], ['accentink', 4.5], ['linestrong', 3]]) {
      const v = val(p + '-' + role);
      if (!v || !bg) continue;
      const r = Math.min(ratio(v, bg), panel ? ratio(v, panel) : 99);
      if (r < min) fail('css/site.css', contexts[p] + ' --' + role + ' contrast ' + r.toFixed(2) + ' < ' + min);
    }
  }
})();

// BUILD-IDEMPOTENT: generated pages must match a fresh build.
(function () {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-verify-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--out', tmp], { stdio: 'pipe' });
    const gen = ['writing/index.html', 'writing/the-harness/index.html',
      'writing/zero-dependencies/index.html', 'writing/thirteen-games-solo/index.html',
      'writing/_homepage_cards.html'];
    for (const g of gen) {
      const a = path.join(ROOT, g), b = path.join(tmp, g);
      if (!fs.existsSync(a) || !fs.existsSync(b)) { warn(g, 'missing from build comparison'); continue; }
      if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8'))
        fail(g, 'committed file differs from a fresh build (stale build — run node build.js)');
    }
  } catch (e) {
    fail('build.js', 'build failed: ' + String(e.message).slice(0, 120));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

// DEAD CUSTOM PROPERTIES.
// A var() naming a property nothing defines is not a graceful fallback, it is a
// declaration the browser throws away. Nothing rendered an error, nothing turned
// red, and the gate stayed green while book.html quietly lost its opt-in accent
// bar, its email focus ring, its success colour and a path-card highlight
// (--gold2, --green), and while a new component asked for --r instead of
// --r-card. This is the check that would have caught all of it.
(() => {
  const defsIn = (t) => {
    const s = new Set();
    // a definition is `--name:` NOT preceded by `var(`
    for (const m of t.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      if (!/var\(\s*$/.test(t.slice(Math.max(0, m.index - 5), m.index))) s.add(m[1]);
    }
    return s;
  };
  const cssCache = new Map();
  const cssDefs = (abs) => {
    if (!cssCache.has(abs)) {
      cssCache.set(abs, fs.existsSync(abs) ? defsIn(fs.readFileSync(abs, 'utf8')) : new Set());
    }
    return cssCache.get(abs);
  };

  const cssPath = path.join(ROOT, 'css', 'site.css');
  const siteCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const siteDefs = defsIn(siteCss);

  // site.css must not reference a token it never defines, either.
  for (const m of siteCss.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([^)]*))?\)/g)) {
    if (!siteDefs.has(m[1]) && m[2] === undefined)
      fail('css/site.css', 'undefined custom property ' + m[1] + ' (no fallback)');
  }

  for (const rel of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // A page can only rely on tokens from the stylesheets it actually loads.
    // /projects/ is on apps-kit.css, not site.css, so resolve every local link
    // rather than assuming the design system is present.
    const known = new Set(defsIn(html));
    for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)) {
      const href = m[1];
      if (/^https?:|^\/\//.test(href)) continue;             // remote sheet, not ours
      const abs = href.startsWith('/')
        ? path.join(ROOT, href.slice(1))
        : path.join(ROOT, path.dirname(rel), href);
      for (const d of cssDefs(abs)) known.add(d);
    }
    const dead = new Set();
    for (const m of html.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([^)]*))?\)/g)) {
      // a var() with a fallback still renders something, so it is not a defect
      if (m[2] === undefined && !known.has(m[1])) dead.add(m[1]);
    }
    for (const d of dead) fail(rel, 'undefined custom property ' + d + ' (declaration is dropped)');
  }
})();

// KEY PAGES exist and are non-trivial.
for (const key of ['index.html', 'book.html', 'services/index.html', 'contact/index.html',
  'links/index.html', 'projects/index.html', 'system/index.html', 'writing/index.html']) {
  try {
    if (fs.statSync(path.join(ROOT, key)).size < 2000) fail(key, 'suspiciously small');
  } catch (e) { fail(key, 'MISSING'); }
}

// Optional visual layer (never a dependency; skips cleanly).
if (process.argv.includes('--visual')) {
  try { require('playwright'); console.log('visual layer: run  python verify_visual.py  (rendered aspect/overflow/JS-error checks)'); }
  catch (e) { console.log('visual layer skipped (playwright for node not installed)'); }
}

// Report.
if (warns.length) {
  console.log('WARN (' + warns.length + ') — visible debt, does not block:');
  for (const w of warns.slice(0, 40)) console.log('  ~ ' + w);
  if (warns.length > 40) console.log('  ~ ... and ' + (warns.length - 40) + ' more');
}
if (fails.length) {
  console.log('FAIL (' + fails.length + ') — DO NOT PUSH:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('verify: GREEN (' + PAGES.length + ' pages checked, ' + warns.length + ' warnings)');
