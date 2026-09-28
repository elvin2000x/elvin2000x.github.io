/* One-time conversion of a hand-written page onto the section engine
   (Site Studio slice 2, 2026-09-27). Kept so the next page can be converted the
   same way.

     node scripts/stack-convert.js            convert, write, prove
     node scripts/stack-convert.js --check    prove only (no writes)

   For each page it reads the COMMITTED file (git HEAD, LF, byte-identical to the
   live site; the working tree may be CRLF), splits <main> into sections, reads
   each section's words back out with scripts/stack-extract.js, and writes
   content/page-<name>.json plus the page's frame. Then it renders the stack and
   requires the result to equal the committed page exactly, with the banner off,
   and exactly plus one banner line with it on. Any difference stops it. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const S = require('../sections.js');
const { extractSection } = require('./stack-extract.js');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const CHECK = process.argv.includes('--check');
const site = JSON.parse(fs.readFileSync(path.join(CONTENT, 'site.json'), 'utf8'));
const committed = (rel, ref = 'HEAD') => execFileSync('git', ['show', ref + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });

const MAIN_OPEN = '<main>\n\n', MAIN_CLOSE = '\n\n</main>';
function splitMain(html, file) {
  const a = html.indexOf(MAIN_OPEN), b = html.indexOf(MAIN_CLOSE);
  if (a < 0 || b < a || html.indexOf(MAIN_OPEN, a + 1) >= 0) throw new Error(file + ': expected exactly one <main> block');
  return { before: html.slice(0, a + MAIN_OPEN.length), main: html.slice(a + MAIN_OPEN.length, b), after: html.slice(b) };
}
// Everything between two strings, both included; each must appear once.
function between(html, from, to, file) {
  const a = html.indexOf(from);
  if (a < 0 || html.indexOf(from, a + 1) >= 0) throw new Error(file + ': need exactly one ' + JSON.stringify(from.slice(0, 60)));
  const b = html.indexOf(to, a);
  if (b < 0) throw new Error(file + ': no ' + JSON.stringify(to.slice(0, 60)) + ' after ' + JSON.stringify(from.slice(0, 60)));
  return html.slice(a, b + to.length);
}
function replaceOnce(html, find, repl, file) {
  const i = html.indexOf(find);
  if (i < 0 || html.indexOf(find, i + 1) >= 0) throw new Error(file + ': need exactly one ' + JSON.stringify(find.slice(0, 80)));
  return html.slice(0, i) + repl + html.slice(i + find.length);
}

/* ---- homepage v3: sections separated by a numbered note comment ---- */
const V3_TYPES = ['hero', 'demo-pairs', 'reviews', 'parts-accordion', 'who-list', 'author', 'faq', 'close', 'newsletter'];
const V3_IDS = ['hero', 'demo', 'reviews', 'inside', 'who', 'about', 'faq', 'close', 'newsletter'];
function convertV3(html) {
  const { before, main, after } = splitMain(html, 'index.html');
  const chunks = main.split('\n\n');
  if (chunks.length !== V3_TYPES.length) throw new Error('index.html: expected ' + V3_TYPES.length + ' sections, found ' + chunks.length);
  const sections = chunks.map((c, i) => {
    const m = c.match(/^<!-- (.*) -->\n([\s\S]*)$/);
    if (!m) throw new Error('index.html section ' + (i + 1) + ' has no note comment');
    return { id: V3_IDS[i], type: V3_TYPES[i], note: m[1], data: extractSection(V3_TYPES[i], m[2], { site, isHome: true, amazon: site.amazon_url }) };
  });
  return {
    frame: before + '{{sections}}' + after,
    stack: { title: 'Homepage v3 (short)', frame: 'home-v3', sections },
  };
}

/* ---- long-form preview: sections wrapped in ep:sec markers ---- */
const LONG_TYPES = {
  hero: 'hero', demo: 'demo-swipe', familiar: 'checklist', beliefs: 'detail-cards', mirror: 'brief-builder',
  reviews: 'reviews', inside: 'chapter-map', stack: 'detail-cards', who: 'who-cast', marcus: 'timeline',
  plan: 'timeline', verify: 'story-strip', tax: 'cost-curve', about: 'author-cards', formats: 'format-picker',
  faq: 'faq', close: 'close', newsletter: 'newsletter',
};
function convertLong(html, v3html) {
  const F = 'preview/home-long/index.html';
  const { before, main, after } = splitMain(html, F);
  const re = /<!-- ep:sec:([a-z0-9-]+) -->\n([\s\S]*?)\n<!-- \/ep:sec:\1 -->/g;
  const found = [...main.matchAll(re)];
  if (found.map(m => m[0]).join('\n\n') !== main) throw new Error(F + ': <main> is not a clean run of ep:sec blocks');
  const sections = found.map(([, id, body]) => {
    const type = LONG_TYPES[id];
    if (!type) throw new Error(F + ': no section type mapped for ' + id);
    return { id, type, data: extractSection(type, body, { site, isHome: false, amazon: site.amazon_url }) };
  });

  // Frame: the preview-only parts show only while this page is NOT the homepage;
  // the homepage parts (ad pixels, canonical and social tags, Book JSON-LD) are
  // copied from homepage v3's head and show only when it IS.
  let fr = before;
  const previewHead = between(fr, '  <!-- PREVIEW (', 'content="noindex, nofollow" />\n', F);
  fr = replaceOnce(fr, previewHead, '{{^isHome}}\n' + previewHead + '{{/isHome}}\n{{#isHome}}\n  <!-- Google Analytics (GA4) -->\n{{/isHome}}\n', F);
  fr = replaceOnce(fr, "    gtag('config', 'G-CLZ7N26J1Q');\n  </script>\n",
    "    gtag('config', 'G-CLZ7N26J1Q');\n{{#isHome}}\n    gtag('config', 'AW-637214471');\n{{/isHome}}\n  </script>\n{{#isHome}}\n" +
    between(v3html, '  <!-- Meta Pixel Code -->', '<!-- TikTok Pixel Code End -->\n', 'index.html') + '{{/isHome}}\n', F);
  const desc = fr.match(/  <meta name="description" content="[^"]*" \/>\n/)[0];
  fr = replaceOnce(fr, desc, desc + '{{#isHome}}\n' + between(v3html, '  <link rel="canonical"', 'name="twitter:creator" content="@elvin_peters" />\n', 'index.html') + '{{/isHome}}\n', F);
  fr = replaceOnce(fr, '  <script src="/js/site.js"></script>\n',
    '  <script src="/js/site.js"></script>\n{{#isHome}}\n' + between(v3html, '  <script type="application/ld+json">', '  </script>\n', 'index.html') + '{{/isHome}}\n', F);
  const bar = between(fr, '<!-- ep:sec:preview-bar -->', '<!-- /ep:sec:preview-bar -->\n\n', F);
  fr = replaceOnce(fr, bar, '{{^isHome}}\n' + bar + '{{/isHome}}\n', F);
  return {
    frame: fr + '{{sections}}' + after,
    stack: { title: 'Long-form homepage', frame: 'home-long', markers: true, preview_path: F, sections },
  };
}

/* ---- run ---- */
const v3 = committed('index.html');
const long = committed('preview/home-long/index.html');
const pages = [
  { name: 'page-home', file: 'index.html', html: v3, ...convertV3(v3) },
  { name: 'page-home-long', file: 'preview/home-long/index.html', html: long, ...convertLong(long, v3) },
];

if (!CHECK) {
  fs.mkdirSync(path.join(S.SEC_DIR, '_frames'), { recursive: true });
  for (const p of pages) {
    fs.writeFileSync(path.join(S.SEC_DIR, '_frames', p.stack.frame + '.html'), p.frame);
    fs.writeFileSync(path.join(CONTENT, p.name + '.json'), JSON.stringify(p.stack, null, 2) + '\n');
  }
  if (!fs.existsSync(path.join(CONTENT, 'homepage.json')))
    fs.writeFileSync(path.join(CONTENT, 'homepage.json'), JSON.stringify({ home: 'page-home' }, null, 2) + '\n');
}

// Proof: render from what is on disk now and compare with the committed pages.
let bad = 0;
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
for (const p of pages) {
  const stack = JSON.parse(fs.readFileSync(path.join(CONTENT, p.name + '.json'), 'utf8'));
  const got = S.renderStack(stack, p.name, { site, isHome: p.file === 'index.html' });
  const banner = S.withBanner(got, p.name);
  const want = p.html;
  const wantBanner = want.replace(/^(<!DOCTYPE html>\n)/i, '$1' + S.BANNER(p.name) + '\n');
  if (got === want && banner === wantBanner) console.log('EXACT  ' + p.file + '  (' + stack.sections.length + ' sections, ' + want.length + ' bytes)');
  else {
    bad++;
    const i = firstDiff(got, want);
    console.log('DIFF   ' + p.file + ' at char ' + i + '\n  want: ' + JSON.stringify(want.slice(i, i + 140)) + '\n  got:  ' + JSON.stringify(got.slice(i, i + 140)));
  }
}
process.exit(bad ? 1 : 0);
