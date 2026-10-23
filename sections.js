/* Section engine (Site Studio slice 2, 2026-09-27).

   A page is a STACK: content/page-<name>.json lists its sections in order. Each
   section names a TYPE from the library (sections/<type>/section.html + section.json)
   and carries the words for that type's slots. A FRAME (sections/_frames/<name>.html)
   holds everything around the sections: the <head> (SEO, pixels, JSON-LD, CSS), the
   chrome and the page scripts. The frame is hand-controlled; the stack is what
   Studio edits.

   content/homepage.json says which stack lives at elvinpeters.com/. Every other
   stack is built at its own preview_path. "Make this the homepage" in Studio is a
   draft of that one file, so swapping back is one tap too.

   Template syntax (a small Mustache subset, every value inserted as-is, because
   the copy carries entities and inline tags exactly as the live page ships them):
     {{name}}          value (dotted names like site.amazon_url walk objects)
     {{#name}}..{{/name}}  list: once per item; object: once, in its scope;
                       anything else truthy: once
     {{^name}}..{{/name}}  when name is missing, false, "" or an empty list
     {{>name}}         partial from sections/_partials/<name>.html, indented
                       like the line the tag sits on
   A section or partial tag alone on its line removes the whole line, so
   templates stay readable. A plain {{name}} that exists nowhere is an error:
   a typo must fail the build, never ship an empty slot. */
const fs = require('fs'), path = require('path');

const ROOT = __dirname;
const SEC_DIR = path.join(ROOT, 'sections');
const lf = s => s.replace(/\r\n/g, '\n');
const readTpl = f => lf(fs.readFileSync(f, 'utf8')).replace(/\n$/, '');

/* ---- template engine ---- */
const TAG = /\{\{([#^\/>]?)\s*([\w.\-]+)\s*\}\}/g;

function tokenize(src) {
  const toks = [];
  let last = 0, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    let start = m.index, end = TAG.lastIndex, indent = '', sa = false;
    if (m[1]) {
      // standalone: only whitespace before it on the line and a newline (or EOF) after
      const ls = src.lastIndexOf('\n', start - 1) + 1;
      const before = src.slice(ls, start);
      const nl = src.indexOf('\n', end);
      const after = src.slice(end, nl === -1 ? src.length : nl);
      if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
        indent = before; sa = true;
        start = ls;
        end = nl === -1 ? src.length : nl + 1;
      }
    }
    if (start > last) toks.push({ t: 'text', v: src.slice(last, start) });
    toks.push({ t: m[1] || 'var', name: m[2], indent, sa });
    last = end;
  }
  if (last < src.length) toks.push({ t: 'text', v: src.slice(last) });
  return toks;
}

function parse(src, label) {
  const root = [], stack = [{ name: null, kids: root }];
  for (const tok of tokenize(src)) {
    const top = stack[stack.length - 1];
    if (tok.t === '#' || tok.t === '^') {
      const node = { ...tok, kids: [] };
      top.kids.push(node);
      stack.push(node);
    } else if (tok.t === '/') {
      if (top.name !== tok.name) throw new Error(label + ': {{/' + tok.name + '}} closes ' + (top.name ? '{{#' + top.name + '}}' : 'nothing'));
      stack.pop();
    } else top.kids.push(tok);
  }
  if (stack.length > 1) throw new Error(label + ': {{#' + stack[stack.length - 1].name + '}} is never closed');
  return root;
}

const MISSING = Symbol('missing');
function lookup(scopes, name) {
  if (name === '.') return scopes[scopes.length - 1];
  const [head, ...rest] = name.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i];
    if (s && typeof s === 'object' && Object.prototype.hasOwnProperty.call(s, head)) {
      let v = s[head];
      for (const k of rest) { if (v == null || typeof v !== 'object' || !(k in v)) return MISSING; v = v[k]; }
      return v;
    }
  }
  return MISSING;
}
const truthy = v => v !== MISSING && v != null && v !== false && v !== '' && !(Array.isArray(v) && !v.length);

function run(nodes, scopes, ctx) {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.v;
    else if (n.t === 'var') {
      const v = lookup(scopes, n.name);
      if (v === MISSING) throw new Error(ctx.label + ': no value for {{' + n.name + '}}');
      out += v == null || v === false ? '' : String(v);
    } else if (n.t === '#') {
      const v = lookup(scopes, n.name);
      if (!truthy(v)) continue;
      if (Array.isArray(v)) for (const item of v) out += run(n.kids, [...scopes, item], ctx);
      else out += run(n.kids, typeof v === 'object' ? [...scopes, v] : scopes, ctx);
    } else if (n.t === '^') {
      if (!truthy(lookup(scopes, n.name))) out += run(n.kids, scopes, ctx);
    }
  }
  return out;
}

/* ---- library ---- */
// Partials are pasted into the template source before parsing, each line indented
// like the tag's own line. Rendering and extracting (scripts/stack-extract.js)
// then see the same single template.
function partialSrc(name) {
  const f = path.join(SEC_DIR, '_partials', name + '.html');
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name) || !fs.existsSync(f)) throw new Error('unknown partial ' + name);
  return expand(readTpl(f));
}
function expand(src) {
  return src
    .replace(/^([ \t]*)\{\{>\s*([\w-]+)\s*\}\}[ \t]*$/gm, (_, ind, n) => partialSrc(n).replace(/^(?=.)/gm, ind))
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => partialSrc(n));
}
const cache = new Map();
// Keyed by modified time too: Site Studio is a long-running process and pulls
// new templates from GitHub while it runs.
function compiled(file, label) {
  const k = file + '|' + fs.statSync(file).mtimeMs;
  if (!cache.has(k)) cache.set(k, parse(expand(readTpl(file)), label));
  return cache.get(k);
}
const TYPE_RE = /^[a-z][a-z0-9-]{0,40}$/;
const ORIGIN = 'https://elvinpeters.com';
const PAGE_PATH = /^[a-z0-9][a-z0-9-]{0,60}\/index\.html$/;
// Top-level folders a New page may never take (site code, Studio, generated areas).
const RESERVED = new Set(['api', 'books', 'content', 'css', 'dl', 'essays', 'fr', 'img', 'js', 'node_modules', 'play', 'preview', 'scripts', 'sections', 'studio', 'titles', 'writing']);

/* ---- landing pages (store build, 2026-10-23) ----
   A stack with a "landing" block is a selling page at elvinpeters.com/<prefix>/<slug>/.
   The prefix ("buy") and the checkout addresses live in content/funnels.json, so Elvin
   changes them in Studio, never in code. Every address a page ever had keeps working:
   old slugs and old prefixes build forward stubs that carry the query string and the
   #fragment (UTMs, and the checkout's one-time #t= token). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?)?$/;
const PREFIX_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const FUNNEL_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const FUNNEL_DEFAULTS = { prefix: 'buy', old_prefixes: [],
  store_base: 'https://api.elvinpeters.com/api/store', store_base_test: 'https://api.elvinpeters.com/store-test/api/store' };
function funnelSettings(contentDir) {
  const f = path.join(contentDir, 'funnels.json');
  const got = fs.existsSync(f) ? readJson(f) : {};
  return { ...FUNNEL_DEFAULTS, ...got, old_prefixes: Array.isArray(got.old_prefixes) ? got.old_prefixes : [] };
}
function checkFunnels(cfg) {
  const errs = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return ['funnels.json must be an object'];
  if (!PREFIX_RE.test(cfg.prefix || '')) errs.push('the address word can use a-z, 0-9 and dashes (up to 30)');
  if (RESERVED.has(cfg.prefix)) errs.push('elvinpeters.com/' + cfg.prefix + '/ is reserved for the site itself');
  if (cfg.old_prefixes != null && (!Array.isArray(cfg.old_prefixes) || cfg.old_prefixes.some(p => !PREFIX_RE.test(p) || p === cfg.prefix)))
    errs.push('old address words must be a list of other words');
  for (const k of ['store_base', 'store_base_test'])
    if (cfg[k] != null && !/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._\/-]*)?$/.test(cfg[k])) errs.push(k + ' must be an https address');
  return errs;
}
const landingDir = (prefix, slug) => prefix + '/' + slug + '/';
// Placeholder text in a template: "[Headline: the one promise]". It must never ship,
// so Studio's Publish and verify.js both refuse a visible section that still holds one.
const PLACEHOLDER = /\[[A-Z][A-Za-z0-9 ,'&\/()-]{0,40}:[^\[\]\n]{1,200}\]/g;
function placeholders(stack) {
  const out = [], lib = {};
  for (const t of library()) lib[t.type] = t;
  const scan = (v, where) => {
    if (typeof v === 'string') for (const m of v.match(PLACEHOLDER) || []) out.push({ where, text: m });
    else if (Array.isArray(v)) v.forEach(x => scan(x, where));
    else if (v && typeof v === 'object') Object.values(v).forEach(x => scan(x, where));
  };
  if (!stack || typeof stack !== 'object') return out;
  scan(stack.title, 'Page name');
  if (stack.landing) scan(stack.landing.description, 'Page settings');
  (stack.sections || []).forEach((s, i) => {
    if (s && !s.hidden) scan(s.data, 'Section ' + (i + 1) + ' (' + (lib[s.type] ? lib[s.type].label : s.type) + ')');
  });
  return out;
}
// The page an old address forwards to. JS keeps ?query and #fragment; the meta refresh is
// the no-JS fallback. verify.js checks every one of these (ep:forward).
function forwardStub(name, to) {
  return '<!DOCTYPE html>\n' + BANNER(name) + '\n<!-- ep:forward -->\n<html lang="en"><head><meta charset="UTF-8" />' +
    '<meta name="robots" content="noindex, follow" /><link rel="canonical" href="' + to + '" />' +
    "<script>location.replace('" + to + "' + location.search + location.hash);</script>" +
    '<meta http-equiv="refresh" content="0; url=' + to + '" /><title>Moved</title></head>' +
    '<body><p><a href="' + to + '">' + to + '</a></p></body></html>\n';
}
// Templates for a new landing page: sections/_templates/<name>.json, each {label, order, stack}.
function templates() {
  const dir = path.join(SEC_DIR, '_templates');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^[a-z][a-z0-9-]{0,40}\.json$/.test(f))
    .map(f => ({ name: f.slice(0, -5), ...readJson(path.join(dir, f)) }))
    .sort((a, b) => (a.order || 99) - (b.order || 99));
}
// A "buybox" field is shorthand for the object _partials/buybox.html reads.
const BUYBOX_FIELDS = [
  { key: 'label', type: 'html', label: 'Button', default: 'Get the book on Amazon &rarr;' },
  { key: 'href', type: 'text', label: 'Button link (empty: the book on Amazon)' },
  { key: 'aria', type: 'text', label: 'Button, read aloud', default: 'Get the book on Amazon' },
  { key: 'avail', type: 'text', label: 'Formats line under the Amazon badge (empty hides the badge)', default: 'Kindle, paperback and hardcover' },
  { key: 'price', type: 'text', label: 'Price line (optional)' },
  { key: 'sample', type: 'html', label: 'Free chapter link text (optional)' },
  { key: 'sample_href', type: 'text', label: 'Free chapter link' },
  { key: 'bid', type: 'text', label: 'Button id (analytics)', hidden: true },
  { key: 'style', type: 'text', label: 'Extra style', hidden: true },
  { key: 'spaced', type: 'bool', label: 'Legacy spacing', hidden: true },
  { key: 'eager', type: 'bool', label: 'Load the badge straight away (first screen only)', hidden: true },
];
function normalizeFields(fields) {
  return (fields || []).map(fd => fd.type === 'buybox' ? { ...fd, type: 'object', buybox: true, fields: BUYBOX_FIELDS }
    : fd.fields ? { ...fd, fields: normalizeFields(fd.fields) } : fd);
}
function sectionMeta(type) {
  const meta = JSON.parse(fs.readFileSync(path.join(SEC_DIR, type, 'section.json'), 'utf8'));
  return { type, ...meta, fields: normalizeFields(meta.fields) };
}
function library() {
  if (!fs.existsSync(SEC_DIR)) return [];
  return fs.readdirSync(SEC_DIR).filter(d => TYPE_RE.test(d) && fs.existsSync(path.join(SEC_DIR, d, 'section.json')))
    .sort().map(sectionMeta);
}
function renderTpl(file, label, scopes) {
  return run(compiled(file, label), scopes, { label });
}

/* Empty words for a new section of a type, shaped by its field list: text is "",
   a switch is off, a list has one empty item, an optional part (an object: a buy
   box, a review) is left out until it's added. A choice takes its first option;
   a field with a default starts with it. */
function blankData(fields) {
  const d = {};
  for (const f of fields || []) {
    if (f.default !== undefined) d[f.key] = f.default;
    else if (f.type === 'bool') d[f.key] = false;
    else if (f.type === 'list') d[f.key] = f.fields ? [blankData(f.fields)] : [''];
    else if (f.type === 'object') d[f.key] = null;
    else if (f.type === 'choice') d[f.key] = (f.options || [''])[0];
    else d[f.key] = '';
  }
  return d;
}

/* ---- stacks ---- */
const STACK_RE = /^page-[a-z0-9-]{1,40}$/;
function stackNames(contentDir) {
  return fs.readdirSync(contentDir).filter(f => /^page-[a-z0-9-]+\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
}
function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

/* Everything wrong with a stack, as plain sentences (Studio shows them). */
function checkStack(stack, name) {
  const errs = [];
  if (!stack || typeof stack !== 'object') return ['content must be a JSON object'];
  if (!TYPE_RE.test(stack.frame || '') || !fs.existsSync(path.join(SEC_DIR, '_frames', stack.frame + '.html')))
    errs.push('unknown frame "' + stack.frame + '"');
  if (stack.preview_path != null && !/^preview\/[a-z0-9-]+\/index\.html$/.test(stack.preview_path))
    errs.push('preview_path must look like preview/<name>/index.html');
  // A page made in Studio with New page (slice 3) lives at its own address.
  if (stack.path != null && !PAGE_PATH.test(stack.path)) errs.push('path must look like <name>/index.html');
  if (stack.path != null && stack.preview_path != null) errs.push('a page has a path or a preview_path, not both');
  if (stack.path != null && RESERVED.has(String(stack.path).split('/')[0])) errs.push('the address /' + String(stack.path).split('/')[0] + '/ is reserved');
  if (stack.landing != null) {
    const L = stack.landing;
    if (typeof L !== 'object' || Array.isArray(L)) errs.push('landing must be an object');
    else {
      if (!SLUG_RE.test(L.slug || '')) errs.push('the address can use a-z, 0-9 and dashes (one / at most)');
      if (stack.path != null || stack.preview_path != null) errs.push('a landing page has its own address, not a path');
      if (L.old_slugs != null && (!Array.isArray(L.old_slugs) || L.old_slugs.some(s => !SLUG_RE.test(s) || s === L.slug))) errs.push('old addresses must be a list of other addresses');
      if (L.funnel != null && L.funnel !== '' && !FUNNEL_RE.test(L.funnel)) errs.push('the funnel key can use a-z, 0-9 and dashes');
      if (L.hide_menu != null && typeof L.hide_menu !== 'boolean') errs.push('hide_menu must be true or false');
      for (const k of ['description'])
        if (L[k] != null && (typeof L[k] !== 'string' || /[<>"]/.test(L[k]))) errs.push(k + ' must be plain text');
    }
    if (typeof stack.title !== 'string' || /[<>"]/.test(stack.title)) errs.push('the page name must be plain text');
  }
  if ((stack.frame === 'landing') !== (stack.landing != null)) errs.push(stack.landing != null ? 'a landing page uses the landing frame' : 'the landing frame is for landing pages');
  if (!Array.isArray(stack.sections)) return errs.concat('sections must be a list');
  const lib = new Map(library().map(t => [t.type, t])), ids = new Set();
  stack.sections.forEach((s, i) => {
    const at = 'section ' + (i + 1);
    if (!s || typeof s !== 'object') return errs.push(at + ' is not an object');
    const t = lib.get(s.type);
    if (!t) errs.push(at + ' uses unknown section type "' + s.type + '"');
    else {
      if (t.frames && !t.frames.includes(stack.frame)) errs.push(at + ' (' + t.label + ') works on landing pages only');
      for (const f of t.fields) if (f.max && s.data && Array.isArray(s.data[f.key]) && s.data[f.key].length > f.max)
        errs.push(at + ' (' + t.label + ') has room for ' + f.max + ' ' + f.label.toLowerCase());
    }
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(s.id || '')) errs.push(at + ' needs an id (a-z, 0-9, dashes)');
    else if (ids.has(s.id)) errs.push('two sections use the id ' + s.id);
    ids.add(s.id);
    if (s.data == null || typeof s.data !== 'object' || Array.isArray(s.data)) errs.push(at + ' (' + s.id + ') needs its words (data)');
  });
  return errs;
}

function renderSection(s, globals) {
  const file = path.join(SEC_DIR, s.type, 'section.html');
  // store and funnel are a landing page's checkout address; empty everywhere else.
  const html = renderTpl(file, s.type + ' (' + s.id + ')', [{ store: '', funnel: '', page_url: '', ...globals }, s.data]);
  const note = s.note ? '<!-- ' + s.note + ' -->\n' : '';
  return note + html;
}

/* Render one stack to a full page. `site` is content/site.json. `markers` (Studio
   previews only, never the real build) wraps every section in ep:sec comments so
   a tap on the preview can find its section. */
function renderStack(stack, name, { site, isHome, markers, funnels, store }) {
  const errs = checkStack(stack, name);
  if (errs.length) throw new Error('content/' + name + '.json: ' + errs.join('; '));
  // page_url: a New page's own address, a landing page's /<prefix>/<slug>/; the two
  // homepages keep elvinpeters.com/. robots_off: hidden from Google. Every page that is
  // not the homepage, unless a New page switched it off ("noindex": false).
  const L = stack.landing;
  const fcfg = funnels || FUNNEL_DEFAULTS;
  const page_url = ORIGIN + '/' + (L ? landingDir(fcfg.prefix, L.slug) : !isHome && stack.path ? stack.path.replace(/index\.html$/, '') : '');
  const robots_off = !isHome && stack.noindex !== false;
  const globals = { site, isHome: !!isHome, amazon: site.amazon_url, page_url,
    store: L ? store || fcfg.store_base : '', funnel: L ? L.funnel || '' : '' };
  const parts = stack.sections.filter(s => !s.hidden).map(s => {
    const html = renderSection(s, globals);
    return stack.markers || markers ? '<!-- ep:sec:' + s.id + ' -->\n' + html + '\n<!-- /ep:sec:' + s.id + ' -->' : html;
  });
  const frame = path.join(SEC_DIR, '_frames', stack.frame + '.html');
  const page = { title: stack.title || '', description: (L && L.description) || '', hide_menu: !!(L && L.hide_menu) };
  return renderTpl(frame, '_frames/' + stack.frame, [{ ...globals, robots_off, page, sections: parts.join('\n\n') }]) + '\n';
}

/* The page a stack becomes: which file, and whether it's the homepage.
   Returns [{ file, html }] for every page the stacks produce. */
const BANNER = name => '<!-- GENERATED by build.js from content/' + name + '.json and sections/. ' +
  'Do not edit this file by hand: edit the page in Site Studio (edit.elvinpeters.com) or its JSON. ' +
  'verify.js fails a hand edit. -->';
function withBanner(html, name) {
  // Straight after the doctype: before it would put browsers in quirks mode.
  return html.replace(/^(<!DOCTYPE html>\n)/i, '$1' + BANNER(name) + '\n');
}
function redirectStub(name) {
  return '<!DOCTYPE html>\n' + BANNER(name) + '\n<html lang="en"><head><meta charset="UTF-8" />' +
    '<meta name="robots" content="noindex" /><link rel="canonical" href="https://elvinpeters.com/" />' +
    '<meta http-equiv="refresh" content="0; url=/" /><title>Moved</title></head>' +
    '<body><p>This page is now the homepage: <a href="/">elvinpeters.com</a>.</p></body></html>\n';
}

// storeTest: Studio previews and the Test host point every checkout button at the
// test checkout, so a QA click can never reach live Stripe. A real build never sets it.
function buildAll(contentDir, { site, banner = true, markers = false, storeTest = false } = {}) {
  const names = stackNames(contentDir);
  if (!names.length) return [];
  const homeCfg = readJson(path.join(contentDir, 'homepage.json'));
  if (!names.includes(homeCfg.home)) throw new Error('content/homepage.json: "' + homeCfg.home + '" is not a page (have ' + names.join(', ') + ')');
  const funnels = funnelSettings(contentDir);
  const ferrs = checkFunnels(funnels);
  if (ferrs.length) throw new Error('content/funnels.json: ' + ferrs.join('; '));
  const store = storeTest ? funnels.store_base_test : funnels.store_base;
  const out = [];
  for (const name of names) {
    const stack = readJson(path.join(contentDir, name + '.json'));
    const isHome = name === homeCfg.home;
    if (stack.landing) {
      if (isHome) throw new Error('content/homepage.json: a landing page cannot be the homepage');
      let html = renderStack(stack, name, { site, isHome: false, markers, funnels, store });
      if (banner) html = withBanner(html, name);
      const L = stack.landing, to = ORIGIN + '/' + landingDir(funnels.prefix, L.slug);
      out.push({ name, file: landingDir(funnels.prefix, L.slug) + 'index.html', html, isHome: false, landing: true, hideMenu: !!L.hide_menu });
      for (const p of [funnels.prefix, ...funnels.old_prefixes])
        for (const s of [L.slug, ...(L.old_slugs || [])])
          if (p !== funnels.prefix || s !== L.slug)
            out.push({ name, file: landingDir(p, s) + 'index.html', html: forwardStub(name, to), stub: true, forward: true });
      continue;
    }
    let html = renderStack(stack, name, { site, isHome, markers });
    if (banner) html = withBanner(html, name);
    if (isHome) {
      out.push({ name, file: 'index.html', html, isHome });
      if (stack.preview_path) out.push({ name, file: stack.preview_path, html: redirectStub(name), stub: true });
    } else if (stack.preview_path || stack.path) {
      out.push({ name, file: stack.preview_path || stack.path, html, isHome, made: !!stack.path });
    }
    // A stack that is neither the homepage nor has a preview address builds nothing
    // public; Studio still previews it.
  }
  const seen = new Map();
  for (const p of out) {
    if (seen.has(p.file)) throw new Error('content/' + p.name + '.json and content/' + seen.get(p.file) + '.json both build ' + p.file);
    seen.set(p.file, p.name);
  }
  return out;
}

module.exports = { parse, run, expand, readTpl, renderStack, renderSection, buildAll, checkStack, library, sectionMeta, stackNames, withBanner, blankData, BANNER, STACK_RE, SEC_DIR, PAGE_PATH, RESERVED,
  SLUG_RE, PREFIX_RE, FUNNEL_RE, PLACEHOLDER, funnelSettings, checkFunnels, placeholders, forwardStub, templates, landingDir };
