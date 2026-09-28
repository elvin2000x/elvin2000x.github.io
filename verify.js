// verify.js — the polish gate. Zero dependencies. Run after build.js; a FAIL
// means DO NOT PUSH. Checks are split into FAIL (blocking) and WARN
// (visible debt) so the gate is green at birth and tightens over time.
// Usage: node verify.js          (static checks, <1s)
//        node verify.js --visual (optional Playwright layer; skips cleanly if absent)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

// Pages excluded from every check: other businesses, retired stubs, parked
// component fragments (components/: not pages, styled by the page that embeds them),
// generated-elsewhere pipelines, binaries.
const EXCLUDE = /^essays([\/]|$)|^(titles|books|book1-feedback|oto|dl|studio|components|sections)([\\/]|$)|^index_v[0-9]\.html$|^system\/index\.html$|^toolkit\/index\.html$|^google-ads-audit\/index\.html$/;
// Pages fully on the design system: strictest rules apply here.
const TOKENIZED = new Set(['index.html', 'book.html']);

const BOOK_ASIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8')).amazon_url.match(/dp\/([A-Z0-9]{10})/)[1];
const fails = [], warns = [];
function fail(f, msg) { fails.push(f + ': ' + msg); }
function warn(f, msg) { warns.push(f + ': ' + msg); }

// epeters.ca (ticket #12, 2026-09-27). The public address stays elvin@elvinpeters.com;
// epeters.ca mail is private routing, so that address never ships. The domain itself may
// appear only as a UTM-tagged link from .com (footer "Fun stuff", cross-links) or as a
// moved-section stub's target. Anything else is the old tripwire's incident again.
const isMovedStub = html => html.includes('<!-- ep:moved-stub -->');
function epcaTripwire(html) {
  const out = [];
  if (/elvin@epeters\.ca/i.test(html)) out.push('stale-truth tripwire: elvin@epeters.ca (public address is elvin@elvinpeters.com)');
  let rest = html.replace(/href="https:\/\/epeters\.ca\/[^"]*[?&](?:amp;)?utm_source=elvinpeters\.com[^"]*"/g, '');
  if (isMovedStub(html)) {
    const to = (html.match(/<link rel="canonical" href="(https:\/\/epeters\.ca\/[^"]*)"/) || [])[1];
    if (to) rest = rest.split(to).join('');
  }
  if (/epeters\.ca/i.test(rest)) out.push('stale-truth tripwire: epeters.ca outside a UTM-tagged link or a moved-section stub');
  return out;
}
function movedStubCheck(html) {
  const out = [], to = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (!to || !to.startsWith('https://epeters.ca/')) return ['moved stub without an epeters.ca canonical'];
  if (!/<meta name="robots" content="noindex/.test(html)) out.push('moved stub is not noindex');
  if (!html.includes(`<meta http-equiv="refresh" content="0; url=${to}">`)) out.push('moved stub refresh does not match its canonical');
  // Calculators read ?amount= and posts use #anchors, so the JS redirect must carry both.
  if (!html.includes(`location.replace('${to}' + location.search + location.hash)`)) out.push('moved stub JS redirect drops the query string or hash');
  return out;
}
// Done-test: the tripwire must still catch the address and must pass a real stub and footer.
(function () {
  const stub = `<!-- ep:moved-stub --><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://epeters.ca/apps/calculators/mortgage-payment/"><script>location.replace('https://epeters.ca/apps/calculators/mortgage-payment/' + location.search + location.hash);</script><meta http-equiv="refresh" content="0; url=https://epeters.ca/apps/calculators/mortgage-payment/"><a href="https://epeters.ca/apps/calculators/mortgage-payment/">Go</a>`;
  const foot = '<a href="https://epeters.ca/?utm_source=elvinpeters.com&utm_medium=footer&utm_campaign=crosslink">Fun stuff</a>';
  const cases = [
    ['planted elvin@epeters.ca', '<a href="mailto:elvin@epeters.ca">mail</a>', true],
    ['bare epeters.ca link', '<a href="https://epeters.ca/play/">Play</a>', true],
    ['epeters.ca in copy', '<p>See epeters.ca</p>', true],
    ['address on a stub', stub + 'elvin@epeters.ca', true],
    ['moved stub', stub, false],
    ['footer cross-link', foot, false],
  ];
  for (const [name, html, shouldFail] of cases)
    if ((epcaTripwire(html).length > 0) !== shouldFail) fail('verify.js', `tripwire done-test "${name}" expected ${shouldFail ? 'FAIL' : 'pass'}`);
  if (movedStubCheck(stub).length) fail('verify.js', 'stub done-test: ' + movedStubCheck(stub).join('; '));
  if (!movedStubCheck(stub.replace(" + location.search + location.hash", '')).length) fail('verify.js', 'stub done-test: a redirect that drops ?amount= passed');
})();

function* htmlFiles(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (EXCLUDE.test(r) || e.name === '.git' || e.name === '.claude' || e.name === 'node_modules') continue;
    if (e.isDirectory()) yield* htmlFiles(path.join(dir, e.name), r);
    else if (e.name.endsWith('.html')) yield r;
  }
}

// Moved-section stubs are only redirects (ticket #12): their own checks, none of the page checks.
const MOVED_STUBS = [], PAGES = [];
for (const rel of htmlFiles(ROOT, ''))
  (isMovedStub(fs.readFileSync(path.join(ROOT, rel), 'utf8')) ? MOVED_STUBS : PAGES).push(rel);
for (const rel of MOVED_STUBS) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const msg of [...epcaTripwire(html), ...movedStubCheck(html)]) fail(rel, msg);
}

for (const rel of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // PIXELS: analytics on every page (magnet/LP/legal pages all carry them today).
  if (!html.includes('G-CLZ7N26J1Q')) warn(rel, 'missing GA4');
  if (!html.includes('1699232654449762') && html.includes('G-CLZ7N26J1Q')) warn(rel, 'missing Meta pixel');

  // STALE-TRUTH tripwires (these were real incidents).
  for (const bad of ['elvin2000x.github.io', 'href="/#apps"', 'href="/#games"', 'beehiiv'])
    if (html.includes(bad)) fail(rel, 'stale-truth tripwire: ' + bad);
  for (const msg of epcaTripwire(html)) fail(rel, msg);

  // ASIN: every Amazon product link is the book in content/site.json amazon_url (one source of truth).
  for (const m of html.matchAll(/amazon\.[a-z.]+\/(?:[^"'\s]*\/)?dp\/([A-Z0-9]{10})/g))
    if (m[1] !== BOOK_ASIN) fail(rel, 'Amazon link to ' + m[1] + ', expected ' + BOOK_ASIN + ' (content/site.json amazon_url)');

  // ASSOCIATES (Runway v2 item 6, 2026-09-28): every amazon.com book link carries the one
  // tag; the tag is US-store only, so a tagged .ca/.co.uk/.com.au link is a mistake; a
  // page with tagged links shows the disclosure the Operating Agreement requires.
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?amazon\.com\/(?:[^"'\s]*\/)?dp\/[A-Z0-9]{10}[^"'\s<]*/g))
    if (!/[?&]tag=elvinpeters-20\b/.test(m[0])) fail(rel, 'amazon.com link without tag=elvinpeters-20: ' + m[0].slice(0, 80));
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?amazon\.(?:ca|co\.uk|com\.au)\/[^"'\s<]*/g))
    if (/[?&]tag=elvinpeters-20\b/.test(m[0])) fail(rel, 'elvinpeters-20 is a US tag, not for ' + m[0].slice(0, 60));
  if (html.includes('tag=elvinpeters-20') && !html.includes('amz-disclosure')) fail(rel, 'tagged Amazon links but no Associates disclosure');

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
    // fetchpriority="high" marks the LCP image: it must never be lazy.
    if (idx > 2 && !tag.includes('loading=') && !tag.includes('fetchpriority="high"')) report(rel, 'below-fold img not lazy: ' + tag.slice(0, 60));
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
// Line endings are normalised: a Windows checkout (autocrlf) is CRLF, a build is LF.
function eol(s) { return s.replace(/\r\n/g, '\n'); }
function* builtHtml(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) yield* builtHtml(path.join(dir, e.name), r);
    else if (e.name.endsWith('.html')) yield r;
  }
}
(function () {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-verify-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--out', tmp], { stdio: 'pipe' });
    // Stack pages (the homepage and every content/page-*.json output, slice 2):
    // the section engine owns the whole file, so any hand edit fails here.
    const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site.json'), 'utf8'));
    const stackFiles = new Set(require(path.join(ROOT, 'sections.js'))
      .buildAll(path.join(ROOT, 'content'), { site }).map(p => p.file));
    // The blog moved to epeters.ca (ticket #12): writing/ is stubs now, built there.
    const gen = [...new Set(['index.html', ...stackFiles])];
    for (const g of gen) {
      const a = path.join(ROOT, g), b = path.join(tmp, g);
      if (!fs.existsSync(a) || !fs.existsSync(b)) { warn(g, 'missing from build comparison'); continue; }
      if (eol(fs.readFileSync(a, 'utf8')) !== eol(fs.readFileSync(b, 'utf8')))
        fail(g, stackFiles.has(g)
          ? 'generated page differs from its stack (a hand edit, or a stale build): edit content/page-*.json or Site Studio, then node build.js'
          : 'committed file differs from a fresh build (stale build — run node build.js)');
    }
    // REGION-DRIFT: inside every <!-- ep:name --> region build.js fills, the
    // committed page must hold exactly what the content JSON renders. A hand
    // edit there is silently lost on the next Studio publish, so it fails here.
    const REGION = /<!-- ep:([a-z0-9-]+)(?: [^>]*?)? -->\r?\n([\s\S]*?)[ \t]*<!-- \/ep:\1 -->/g;
    const regions = html => new Map([...eol(html).matchAll(REGION)].map(m => [m[1], m[2]]));
    for (const rel of builtHtml(tmp, '')) {
      const a = path.join(ROOT, rel);
      if (!fs.existsSync(a)) continue;
      const built = regions(fs.readFileSync(path.join(tmp, rel), 'utf8'));
      if (!built.size) continue;
      const committed = regions(fs.readFileSync(a, 'utf8'));
      for (const [name, body] of built)
        if (committed.has(name) && committed.get(name) !== body)
          fail(rel, 'region ep:' + name + ' was edited by hand (differs from content/*.json; edit the JSON or Site Studio, then node build.js)');
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

// GOLD AS TEXT.
// --accent-hi is a fill (2.68:1 on the light background). The only legal gold
// for text is --accent-ink. Six pages failed WCAG this way in the level 5
// diagnostic; this stops the seventh.
for (const rel of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/color:\s*var\(--accent-hi\)/.test(html))
    fail(rel, 'gold fill used as a text colour (use --accent-ink; --accent-hi is 2.68:1)');
}

// LEAD CAPTURE CONTRACT.
// Every owned email form carries the honeypot and its own source tag, and no
// tag is reused: the lead DB's per-position conversion data is only real if
// each form reports as itself.
(() => {
  const seen = new Map(); // source tag -> first file
  for (const rel of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!html.includes('/api/lead')) continue;
    if (!/name=["']website["']/.test(html))
      fail(rel, 'posts to /api/lead without the honeypot field (name="website")');
    const tags = [
      ...[...html.matchAll(/data-source=["']([^"']+)["']/g)].map(m => m[1]),
      // the closing quote must end the value ("," or "}"): a literal followed
      // by "+" is a computed prefix, not a complete tag
      ...[...html.matchAll(/source:\s*['"]([^'"]+)['"]\s*[,}\)]/g)].map(m => m[1]),
    ].filter(t => !t.includes('${') && !t.includes("' +"));
    // A source computed at runtime (the magnet pages build theirs from the
    // page title + UTM params) satisfies the contract without a literal.
    const computed = /source:\s*(source\(|[A-Za-z_$][\w$]*\s*\+|['"][^'"]*['"]\s*\+)/.test(html);
    if (!tags.length && !computed)
      fail(rel, 'posts to /api/lead with no source tag');
    for (const t of new Set(tags)) {
      if (seen.has(t) && seen.get(t) !== rel)
        fail(rel, `lead source tag "${t}" is already used by ${seen.get(t)}`);
      if (!seen.has(t)) seen.set(t, rel);
    }
  }
})();

// VOICE GATE: no em-dashes or en-dashes in blog content, ever.
// This is a hard house rule (DESIGN-SYSTEM section 7 / VOICE-RULES.md) and it was
// being checked by hand, which is exactly the kind of check that eventually slips.
// Covers every authored surface: the essay records, the scoped body files, and the
// built pages. Entities like &ndash; are fine; this only catches literal characters.
(() => {
  const DASH = /[–—]/;
  const where = (t) => {
    const i = t.search(DASH);
    return JSON.stringify(t.slice(Math.max(0, i - 40), i + 40));
  };
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'essays.json'), 'utf8'));
  const posts = Array.isArray(raw) ? raw : raw.posts;
  for (const e of posts) {
    for (const k of ['title', 'short_title', 'dek', 'short_dek', 'kicker', 'body', 'html']) {
      const v = e[k];
      if (typeof v === 'string' && DASH.test(v))
        fail('content/essays.json', `post "${e.slug}" field ${k} has an em-dash or en-dash: ${where(v)}`);
    }
    if (e.file) {
      const abs = path.join(ROOT, e.file);
      if (fs.existsSync(abs)) {
        const t = fs.readFileSync(abs, 'utf8');
        if (DASH.test(t)) fail(e.file, `em-dash or en-dash in post body: ${where(t)}`);
      }
    }
  }
  for (const rel of PAGES) {
    if (!rel.startsWith('writing/')) continue;
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (DASH.test(t)) fail(rel, `em-dash or en-dash on a built blog page: ${where(t)}`);
  }
})();

// INTERNAL LINKS: every internal href/src must resolve to a file in the built
// tree (GitHub Pages serves the repo as-is). Added 2026-09-27 after the 2026-08-28
// gap: /receipts/ was deleted and the gate stayed GREEN with 4 links to a 404.
// Unlisted pages (noindex, sitemap-excluded, EXCLUDE'd from the other checks)
// are valid targets: only the file has to exist. Absolute links to
// elvinpeters.com count as internal. Placeholders (${...}, {{...}}) are skipped.
(() => {
  const SELF = /^https?:\/\/(www\.)?elvinpeters\.com(?=\/|$)/i;
  const cache = new Map();
  const exists = (abs) => {
    if (!cache.has(abs)) cache.set(abs, fs.existsSync(abs) ? (fs.statSync(abs).isDirectory() ? 'dir' : 'file') : null);
    return cache.get(abs);
  };
  const resolves = (abs, trailingSlash) => {
    const k = exists(abs);
    if (k === 'file') return !trailingSlash;
    if (k === 'dir') return exists(path.join(abs, 'index.html')) === 'file';
    return !trailingSlash && exists(abs + '.html') === 'file';   // Pages serves /tos as tos.html
  };
  const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (s) => s.replace(/>[\s\S]*<\/script>$/i, '>'));
  for (const rel of PAGES) {
    const html = strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const seen = new Set();
    for (const m of html.matchAll(/\s(?:href|src)\s*=\s*["']([^"']*)["']/gi)) {
      let u = m[1].trim().replace(/&amp;/g, '&');
      if (!u || u.startsWith('#') || /\$\{|\{\{|<%/.test(u)) continue;
      if (SELF.test(u)) u = u.replace(SELF, '') || '/';
      else if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) continue;   // other hosts, mailto:, tel:, data:, javascript:
      u = u.split('#')[0].split('?')[0];
      if (!u) continue;
      try { u = decodeURI(u); } catch (e) { /* keep raw */ }
      const abs = u.startsWith('/') ? path.join(ROOT, u) : path.join(ROOT, path.dirname(rel), u);
      if (!abs.startsWith(ROOT)) { fail(rel, 'internal link escapes the site root: ' + m[1]); continue; }
      if (seen.has(abs + u.endsWith('/'))) continue;
      seen.add(abs + u.endsWith('/'));
      if (!resolves(abs, u.endsWith('/'))) fail(rel, 'broken internal link: ' + m[1]);
    }
  }
  // The sitemap is a promise to crawlers: every <loc> must be a real page too.
  const sm = path.join(ROOT, 'sitemap.xml');
  if (fs.existsSync(sm))
    for (const m of fs.readFileSync(sm, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = decodeURI(m[1].trim().replace(SELF, '') || '/');
      if (!resolves(path.join(ROOT, u), u.endsWith('/'))) fail('sitemap.xml', 'loc points at a missing page: ' + m[1]);
    }
})();

// KEY PAGES exist and are non-trivial. links/index.html is not here: since #258 it is
// a small forwarder to links.elvinpeters.com, by design.
// book.html is not here either: since 2026-09-27 it is a redirect stub to the homepage.
// projects/ and writing/ are not here: since ticket #12 they are stubs to epeters.ca.
for (const key of ['index.html', 'services/index.html', 'contact/index.html']) {
  try {
    if (fs.statSync(path.join(ROOT, key)).size < 2000) fail(key, 'suspiciously small');
  } catch (e) { fail(key, 'MISSING'); }
}

// Optional visual layer (never a dependency; skips cleanly).
if (process.argv.includes('--visual')) {
  try { require('playwright'); console.log('visual layer: run  python verify_visual.py  (rendered aspect/overflow/JS-error checks)'); }
  catch (e) { console.log('visual layer skipped (playwright for node not installed)'); }
}

// --live: every moved stub's target answers 200 on epeters.ca itself (no redirect).
// Before the ticket #12 DNS flip epeters.ca 301s to the Studio login, so a push of the
// stubs would send every old blog, game and app link to a login wall. Run before pushing.
(async () => {
if (process.argv.includes('--live')) {
  const targets = [...new Set(MOVED_STUBS.map(rel =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/<link rel="canonical" href="([^"]+)"/)[1]))];
  const bad = [];
  for (let i = 0; i < targets.length; i += 8) await Promise.all(targets.slice(i, i + 8).map(async u => {
    try {
      const r = await fetch(u, { redirect: 'manual' });
      if (r.status !== 200) bad.push(u + ' -> ' + r.status + (r.headers.get('location') ? ' ' + r.headers.get('location') : ''));
    } catch (e) { bad.push(u + ' -> ' + (e.cause && e.cause.code || e.message)); }
  }));
  for (const b of bad) fail('live', 'moved stub target not 200: ' + b);
  console.log('live: ' + (targets.length - bad.length) + '/' + targets.length + ' stub targets answer 200');
}

// TOOLKIT LEAK (Runway v2 item 7, 2026-09-28): the Book 1 Toolkit is reader-only and goes
// out by private email link. No public copy, and no page links one (toolkit/ is excluded
// from the page loop above, so this scans every page, including excluded ones).
for (const p of ['dl/The-Artificial-Advantage-Toolkit.zip', 'dl/taa-toolkit'])
  if (fs.existsSync(path.join(ROOT, p))) fail(p, 'public Toolkit file is back (reader-only, Rule 37)');
(function scanToolkitLinks(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanToolkitLinks(p);
    else if (e.name.endsWith('.html') && /\/dl\/(?:The-Artificial-Advantage-Toolkit\.zip|taa-toolkit\/)/.test(fs.readFileSync(p, 'utf8')))
      fail(path.relative(ROOT, p), 'links the retired public Toolkit download');
  }
})(ROOT);

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
console.log('verify: GREEN (' + PAGES.length + ' pages checked, ' + MOVED_STUBS.length + ' moved stubs, ' + warns.length + ' warnings)');
})();
