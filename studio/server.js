#!/usr/bin/env node
/* Site Studio: the owned, zero-dependency admin for elvinpeters.com.
   Write posts, edit pages and the menu in a browser, preview the REAL build,
   test the whole site with your drafts at a private address, and publish one
   page at a time (pull + build + verify + commit by name + push; Pages deploys).

   Drafts are private: they live in studio.db (studio/store.js), outside the public
   repo, and git only ever sees what is published. Git stays the record of
   everything live, its history, and rollback. No node_modules, ever.

   The blog lives on epeters.ca (#342, slice 5a): every Blog route reads and writes
   a second clone, the epeters-ca repo, and publishes there with that repo's own
   build.js and verify.js. The .com copies of the blog (content/essays.json,
   essays/, writing/, blog/) are locked out: no route edits them and a .com publish
   that would change them ships nothing.

   Run:   node studio/server.js --port 8820
   Env:   STUDIO_DATA (default /var/lib/sitestudio, else ~/.sitestudio)
          STUDIO_TEST_HOST (default test.elvinpeters.com): requests for that host
          get the test site and nothing else.
          STUDIO_BLOG_REPO (default /opt/site-studio/epeters-ca): the epeters-ca
          clone. Missing = the Blog tab says it is not set up; pages still work.
          STUDIO_BLOG_DIR: force the blog folder (blog or writing). Default: read
          from the epeters-ca build output, so the rename needs no Studio change.
   Test:  node studio/test-drafts.js  (the draft-leak test; throwaway clones only)
          node studio/test-blog.js    (the blog on epeters.ca; throwaway clones only)
   Binds 127.0.0.1 only. Auth is the reverse proxy's job (the studio login in
   production; nothing on localhost). Serves no dotfiles, no .git. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
// Long jobs (pull, build, verify, push) run async: a blocked event loop stalls every
// other request and lets idle keep-alive sockets time out under the publish request.
const execFileP = require('util').promisify(execFile);
const crypto = require('crypto');
const Store = require('./store.js');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'content', '_schema');
const store = Store.open();
const PREVIEWS = path.join(store.dir, 'previews');
const TESTS = path.join(store.dir, 'test');
const TEST_HOST = (process.env.STUDIO_TEST_HOST || 'test.elvinpeters.com').toLowerCase();
const PULL_MS = +process.env.STUDIO_PULL_MS || 5 * 60 * 1000;   // keep the server copy fresh
const PORT = (() => { const i = process.argv.indexOf('--port'); return i > -1 ? +process.argv[i + 1] : 8796; })();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.xml': 'text/xml',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

/* ---------- the two sites ---------- */
// What a publish may commit: the draft files it writes (edits) and what the build
// regenerates from them (generated). Anything else dirty in a clone means someone
// is working in it by hand, and a publish would sweep their files live.
// off: paths a publish on that site must never change (the .com blog copies).
const COM = { id: 'com', name: 'elvinpeters.com', root: ROOT, prefix: '',
  edits: /^(content\/|img\/uploads\/)/, generated: /(\.html|^sitemap\.xml|^llms\.txt)$/,
  off: /^(content\/essays\.json$|essays\/|writing\/|blog\/)/, logPaths: ['content/'] };
const CA_ROOT = (() => {
  const p = path.resolve(process.env.STUDIO_BLOG_REPO || '/opt/site-studio/epeters-ca');
  return fs.existsSync(path.join(p, 'build.js')) && fs.existsSync(path.join(p, 'essay-page.js')) && fs.existsSync(path.join(p, '.git')) ? p : null;
})();
const CA = CA_ROOT && { id: 'ca', name: 'epeters.ca', root: CA_ROOT, prefix: 'ca:',
  edits: /^(content\/essays\.json$|essays\/[a-z0-9-]+\.html$|img\/uploads\/)/, generated: /(\.html|^sitemap\.xml|^robots\.txt)$/,
  off: null, logPaths: ['content/essays.json', 'essays/'] };
const SITES = [CA, COM].filter(Boolean);
const publishable = (site, f) => !(site.off && site.off.test(f)) && (site.edits.test(f) || site.generated.test(f));
// A draft key is the repo path it replaces; blog keys carry the ca: prefix.
const ESSAYS = 'ca:content/essays.json';
const siteOf = key => String(key).startsWith('ca:') ? CA : COM;
const fileOf = key => String(key).replace(/^ca:/, '');
const blogKey = file => 'ca:' + file;
// The blog's folder on epeters.ca: one setting for every address the Studio shows.
// The rename writing/ -> blog/ is its own job (#367), so read it from the build
// output instead of hardcoding either.
function blogDir(root) {
  if (/^(blog|writing)$/.test(process.env.STUDIO_BLOG_DIR || '')) return process.env.STUDIO_BLOG_DIR;
  root = root || CA_ROOT;
  if (root && fs.existsSync(path.join(root, 'blog', 'index.html'))) return 'blog';
  if (root && fs.existsSync(path.join(root, 'writing', 'index.html'))) return 'writing';
  return 'blog';
}
const NO_BLOG = 'The epeters.ca copy is not set up on this server yet, so blog posts cannot be opened. Pages still work.';

// One job on the server copies at a time: a publish, a roll back or the pull.
// Saving a draft never waits for it: drafts don't touch the copies.
let busy = null;
let lastSync = { at: 0, ok: true, msg: '' }, lastSyncCa = { at: 0, ok: true, msg: '' };
let lastTest = null;   // { id, at }

/* ---------- helpers ---------- */
function git(args, opts) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000, ...opts }).trim();
}
function porcelain(root) {
  // Not git(): its trim() would eat the leading space of the first " M file" line.
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root || ROOT, encoding: 'utf8', timeout: 60000 })
    .split('\n').filter(Boolean)
    .map(l => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '').replace(/^.* -> /, '') }));
}
function schemas() {
  const list = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'))
    .map(f => ({ name: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')) }));
  // Pages made with New page (slice 3) have no schema file: a page-*.json is a stack.
  for (const name of madePages()) {
    let title = name.slice(5);
    try { title = JSON.parse(current(contentKey(name)).buf.toString('utf8')).title || title; } catch (e) {}
    list.push({ name, title, kind: 'stack', file: name + '.json', made: true, help: 'Made with New page. Hidden from Google until you switch that off.' });
  }
  return list;
}
const hasSchema = name => fs.existsSync(path.join(SCHEMA_DIR, name + '.json'));
// page-*.json files and drafts without a schema file: the pages made with New page.
function madePages() {
  const names = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'content'))) { const m = /^(page-[a-z0-9-]{1,40})\.json$/.exec(f); if (m) names.add(m[1]); }
  for (const d of store.list()) { const m = /^content\/(page-[a-z0-9-]{1,40})\.json$/.exec(d.key); if (m) names.add(m[1]); }
  return [...names].filter(n => !hasSchema(n)).sort();
}
function allowed(name) {
  return /^[a-z][a-z0-9-]{0,40}$/.test(name) && (hasSchema(name) || Sections.STACK_RE.test(name));
}
function contentPath(name) { return path.join(ROOT, 'content', name + '.json'); }
function version(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16); }

/* ---------- drafts ---------- */
// A draft's key is the repo path it replaces.
const contentKey = name => 'content/' + name + '.json';
// .com: page content only. The blog's keys live on the ca: side; the .com
// essays.json, essays/, writing/ and blog/ are never a draft key.
function keyOk(key) {
  key = String(key || '');
  if (key.startsWith('ca:')) return !!CA && (key === ESSAYS || BODY_FILE.test(fileOf(key)));
  const m = /^content\/([a-z][a-z0-9-]{0,40})\.json$/.exec(key);
  return !!m && m[1] !== 'essays' && allowed(m[1]);
}
const drafts = site => store.list().filter(d => keyOk(d.key) && (!site || siteOf(d.key) === site));
function live(key) {
  const s = siteOf(key);
  if (!s) return null;
  const f = path.join(s.root, fileOf(key));
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
}
// What the editor sees: the draft if there is one, else the live file.
function current(key) {
  const d = store.get(key);
  if (d) return { buf: d.data, version: 'd' + d.rev, draft: d };
  const b = live(key);
  return b ? { buf: b, version: 'p' + version(b), draft: null } : null;
}
function stale(d) { const b = live(d.key); return d.base !== (b ? version(b) : 'new'); }
function saveDraft(req, key, buf) {
  const want = String(req.headers['if-match'] || '').replace(/"/g, '');
  return store.save(key, buf, want, live(key), author(req));
}
// Authelia passes the signed-in user; localhost has none.
function author(req) { return String(req.headers['remote-user'] || 'elvin').replace(/[^\w.@-]/g, '').slice(0, 40) || 'elvin'; }
// Every draft of one site and every unpublished upload, written at its repo path under dir.
function materialize(dir, site) {
  for (const d of drafts(site)) {
    const f = path.join(dir, fileOf(d.key));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, store.get(d.key).data);
  }
  for (const u of store.uploads()) {
    const f = path.join(dir, 'img', 'uploads', u.name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, store.getUpload(u.name));
  }
}
// The real build, with every draft laid over the repo. Output lands in <dir>/out.
// markers (editor previews only, never the test site): section comments so a tap
// on the preview finds its section.
function buildWithDrafts(dir, cb, markers) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'overlay'), { recursive: true });
  materialize(path.join(dir, 'overlay'), COM);
  execFile(process.execPath, [path.join(__dirname, 'build-drafts.js'), '--overlay', path.join(dir, 'overlay'), '--out', path.join(dir, 'out')],
    { cwd: ROOT, timeout: 120000, env: { ...process.env, SITE_STACK_MARKERS: markers ? '1' : '' } },
    (err, so, se) => cb(err ? String(se || err.message).slice(0, 500) : null));
}
// The blog Test: a copy of the epeters-ca repo (no .git) with the blog drafts and
// uploads laid over it, built by its own build.js. It writes in place, so it runs
// in the copy, never the clone. Posts ticked Draft show too: that is what Test is
// for. Output lands in <dir>/site, served by /preview/<id>/.
async function buildBlogTest(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const site = path.join(dir, 'site');
  fs.cpSync(CA.root, site, { recursive: true, filter: src => path.relative(CA.root, src).split(path.sep)[0] !== '.git' });
  materialize(site, CA);
  const ef = path.join(site, 'content', 'essays.json');
  const d = JSON.parse(fs.readFileSync(ef, 'utf8'));
  let hidden = 0;
  for (const p of postsOf(d)) if (p && p.draft) { delete p.draft; hidden++; }
  fs.writeFileSync(ef, JSON.stringify(d, null, 2) + '\n');
  const opt = { cwd: site, encoding: 'utf8', timeout: 120000, ...BIG };
  try { await execFileP(process.execPath, ['build.js'], opt); }
  catch (e) { throw new Error(String(e.stderr || e.stdout || e.message).split('\n').filter(Boolean).slice(-4).join(' ').slice(0, 400)); }
  // The gate, as a heads-up: a publish runs it for real.
  let gate = [];
  try { await execFileP(process.execPath, ['verify.js'], opt); }
  catch (e) { gate = gateLines((e.stdout || '') + (e.stderr || '')); }
  return { dir: blogDir(site), drafts: hidden, gate };
}
// What a verify gate said was wrong: its ✗ lines, or the lines under its FAIL line.
function gateLines(out) {
  const lines = String(out).split('\n').map(l => l.trim()).filter(Boolean);
  const x = lines.filter(l => /✗/.test(l));
  const at = lines.findIndex(l => /^FAIL\b/.test(l));
  const got = x.length ? x : at > -1 ? lines.slice(at + 1) : [];
  return got.length ? got.slice(0, 6) : ['the epeters.ca check did not pass'];
}
// A file of a built draft site: generated page, then draft or upload, then the repo.
// A blog Test (<dir>/site) serves its own built copy and nothing else.
function builtFile(dir, rel) {
  if (fs.existsSync(path.join(dir, 'site'))) {
    const f = safeJoin(path.join(dir, 'site'), rel);
    return f && fs.existsSync(f) ? f : null;
  }
  for (const base of [path.join(dir, 'out'), path.join(dir, 'overlay'), ROOT]) {
    const f = safeJoin(base, rel);
    if (f && fs.existsSync(f)) return f;
  }
  return null;
}
function prune(parent, keep) {
  if (!fs.existsSync(parent)) return;
  const all = fs.readdirSync(parent).filter(d => /^[a-f0-9]{12}$/.test(d))
    .map(d => ({ d, t: fs.statSync(path.join(parent, d)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const old of all.slice(keep)) fs.rmSync(path.join(parent, old.d), { recursive: true, force: true });
}
function textWords(html) {
  const t = String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return (t.match(/\S+/g) || []).length;
}
function fresh(mod) { const p = require.resolve(mod); delete require.cache[p]; return require(p); }
// An epeters-ca module with everything it requires re-read (the clone pulls every 5 minutes).
function freshCa(file) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(CA.root + path.sep)) delete require.cache[k];
  return require(path.join(CA.root, file));
}

function send(res, code, body, headers) {
  res.writeHead(code, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...headers });
  res.end(body);
}
function json(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  send(res, code, body, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers });
}
function readBody(req, cap, cb, onTooBig) {
  const chunks = []; let n = 0, dead = false;
  req.on('data', c => {
    if (dead) return;
    n += c.length;
    if (n > cap) { dead = true; if (onTooBig) onTooBig(); else req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => { if (!dead) cb(Buffer.concat(chunks)); });
}
function safeJoin(base, reqPath) {
  const p = path.normalize(path.join(base, reqPath));
  if (!p.startsWith(base) || p.includes('.git') || path.basename(p).startsWith('.')) return null;
  return p;
}
function serveFile(res, file, extra) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ...extra });
  });
}
// Preview pages must not count as visits: drop GA and the Meta pixel.
// Each script on its own, so every page template's layout is covered.
function stripTracking(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, s => /googletagmanager|gtag\(|dataLayer|fbq\(|connect\.facebook\.net/.test(s) ? '' : s)
    .replace(/<noscript>(?:(?!<\/noscript>)[\s\S])*facebook\.com\/tr(?:(?!<\/noscript>)[\s\S])*<\/noscript>/gi, '');
}
// An epeters.ca page shown inside the Studio: its root paths (/css/post.css,
// /img/x.png, /blog/other-post/) point under prefix, so it loads epeters.ca's own
// files, never elvinpeters.com's files with the same names.
function rootTo(text, prefix, css) {
  const t = String(text).replace(/url\(\s*(['"]?)\/(?!\/)/g, 'url($1' + prefix + '/');
  return css ? t : t.replace(/(\s(?:src|href|poster|action)\s*=\s*["'])\/(?!\/)/gi, '$1' + prefix + '/');
}

/* ---------- content validation ---------- */
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const Sections = require(path.join(ROOT, 'sections.js'));
const kindOf = name => { try { return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name + '.json'), 'utf8')).kind || ''; } catch (e) { return Sections.STACK_RE.test(name) ? 'stack' : ''; } };
// Every photo on a stack page needs its description (alt text), unless the
// section marks it decorative. Returns the first problem as a sentence.
function missingAlt(stack) {
  const lib = {}; for (const t of Sections.library()) lib[t.type] = t;
  const walk = (fields, data, where) => {
    for (const f of fields || []) {
      const v = data && data[f.key];
      if (f.type === 'image' && v && f.alt && !String(data[f.alt] || '').trim()) return where + ': describe the photo (' + f.label + ') for people who can\'t see it';
      if (f.type === 'object' && v) { const r = walk(f.fields, v, where); if (r) return r; }
      if (f.type === 'list' && Array.isArray(v)) for (const it of v) { const r = it && typeof it === 'object' && walk(f.fields, it, where); if (r) return r; }
    }
    return null;
  };
  for (const [i, s] of (stack.sections || []).entries()) {
    const t = lib[s.type]; if (!t) continue;
    const r = walk(t.fields, s.data, 'Section ' + (i + 1) + ' (' + t.label + ')');
    if (r) return r;
  }
  return null;
}
// Where a stack page builds, for every page (live or draft) except `skip`.
function stackTargets(skip) {
  const out = new Map();
  for (const n of Sections.stackNames(path.join(ROOT, 'content')).concat(madePages())) {
    if (n === skip || out.has(n)) continue;
    try { const s = JSON.parse(current(contentKey(n)).buf.toString('utf8')); out.set(n, s.path || s.preview_path || ''); } catch (e) {}
  }
  return out;
}
function validate(name, data) {
  if (data === null || typeof data !== 'object') return 'content must be a JSON object';
  // A stack page (slice 2): the section list must be sound AND render, so a
  // draft that would break the build is refused at save time, not at publish.
  if (kindOf(name) === 'stack') {
    const errs = Sections.checkStack(data, name);
    if (errs.length) return errs.slice(0, 3).join('; ');
    const alt = missingAlt(data);
    if (alt) return alt;
    // A New page's address: never a folder the site already has (unless this page
    // made it), never another page's address.
    if (data.path) {
      const dir = data.path.split('/')[0], was = live(contentKey(name));
      const mine = was && JSON.parse(was.toString('utf8')).path === data.path;
      if (!mine && fs.existsSync(path.join(ROOT, dir))) return 'elvinpeters.com/' + dir + '/ is already a page on the site. Pick another address.';
      for (const [n, p] of stackTargets(name)) if (p === data.path) return 'the page "' + n + '" already uses elvinpeters.com/' + dir + '/';
    }
    try {
      const site = JSON.parse(current(contentKey('site')).buf.toString('utf8'));
      Sections.renderStack(data, name, { site, isHome: false });
    } catch (e) { return 'this page would not build: ' + String(e.message).slice(0, 160); }
  }
  if (name === 'homepage') {
    if (typeof data.home !== 'string' || kindOf(data.home) !== 'stack' || !current(contentKey(data.home)))
      return 'the homepage must be one of the pages built from sections';
  }
  if (name === 'essays') {
    const posts = Array.isArray(data) ? data : data.posts;
    if (!Array.isArray(posts)) return 'essays.json needs a posts list';
    const seen = new Set();
    for (const p of posts) {
      if (!p || typeof p !== 'object') return 'every post must be an object';
      if (!SLUG.test(p.slug || '')) return 'web address "' + (p.slug || '') + '" can only use a-z, 0-9 and dashes';
      if (seen.has(p.slug)) return 'two posts use the web address ' + p.slug;
      seen.add(p.slug);
      if (p.file && !/^essays\/[a-z0-9-]+\.html$/.test(p.file)) return 'bad body file on ' + p.slug;
      for (const k of ['image', 'og']) if (p[k] && !/^[a-z0-9][a-z0-9._\/-]{0,120}$/i.test(p[k]) || String(p[k] || '').includes('..'))
        return 'bad ' + k + ' path on ' + p.slug;
    }
  }
  return null;
}

/* ---------- posts ---------- */
const BODY_FILE = /^essays\/[a-z0-9-]+\.html$/;
const BIG = { maxBuffer: 32 * 1024 * 1024 };
const postsOf = data => (Array.isArray(data) ? data : data.posts) || [];
// The posts as the editor sees them (draft if there is one).
function loadPosts() { return postsOf(JSON.parse(current(ESSAYS).buf.toString('utf8'))); }
// What of a draft may go live. essays.json: the draft minus posts still ticked
// Draft (those stay in the store, never in the public repo). A post body: only
// when its post is live after this publish. null = nothing to publish.
function publishForm(key, data, postsAfter) {
  if (key === ESSAYS) {
    const d = JSON.parse(data.toString('utf8'));
    const keep = p => p && !p.draft;
    const out = Array.isArray(d) ? d.filter(keep) : { ...d, posts: postsOf(d).filter(keep) };
    return Buffer.from(JSON.stringify(out, null, 2) + '\n');
  }
  if (siteOf(key) === CA && BODY_FILE.test(fileOf(key))) {
    const post = postsAfter.find(p => p && p.file === fileOf(key));
    return post && !post.draft ? data : null;
  }
  return data;
}
// Upload names a published file points at (/img/uploads/x.png or uploads/x.png).
function uploadsIn(buf) {
  const names = new Set(), re = /(?:^|[\/"'(\s])uploads\/([a-z0-9][a-z0-9._-]{0,120})/gi;
  let m; const s = buf.toString('utf8');
  while ((m = re.exec(s))) if (store.hasUpload(m[1])) names.add(m[1]);
  return [...names];
}
// A hand-coded post's body file, only if that post really points at it.
function bodyFileOf(slug) {
  const post = loadPosts().find(x => x.slug === slug);
  if (!post) return { error: 'no such post', code: 404 };
  if (!post.file) return { error: 'this post has no body file', code: 404 };
  if (!BODY_FILE.test(post.file)) return { error: 'bad body file on ' + slug, code: 422 };
  return { post, file: post.file, key: blogKey(post.file) };
}
// A file as it was at a commit (the blog's history is epeters.ca's). Not git():
// its trim() would change the bytes.
function showAt(sha, file, site) {
  return execFileSync('git', ['show', sha + ':' + file], { cwd: (site || CA).root, encoding: 'utf8', timeout: 60000, ...BIG });
}
// An upload no remaining draft points at can leave the store once it is in a repo.
function uploadInUse(name) {
  return drafts().some(d => { const x = store.get(d.key); return x && x.data.includes('uploads/' + name); });
}

/* ---------- git sync ---------- */
// Put regenerated pages back to their committed state (a build that ran here by hand
// or a publish that stopped halfway). Drafts are never in the copy, so this loses nothing.
function resetBuildOutput(site) {
  site = site || COM;
  try {
    const files = porcelain(site.root).filter(x => site.generated.test(x.file) && x.code !== '??').map(x => x.file);
    for (let i = 0; i < files.length; i += 100) git(['checkout', '--', ...files.slice(i, i + 100)], { cwd: site.root });
  } catch (e) {}
}
// A server copy must be clean between jobs. Returns the files that are not.
function dirtyFiles(site) {
  site = site || COM;
  let st = porcelain(site.root);
  if (st.length) { resetBuildOutput(site); st = porcelain(site.root); }
  return st.map(x => x.file);
}
// Fast-forward a server copy to GitHub. Never merges or rebases: the copy only
// ever holds what GitHub has, plus a publish in flight.
async function pull(site) {
  site = site || COM;
  const dirty = dirtyFiles(site);
  if (dirty.length) throw new Error('The ' + site.name + ' copy has files that are not committed (' + dirty.slice(0, 3).join(', ') + '), so it cannot update from GitHub.');
  try { await execFileP('git', ['pull', '--ff-only', '--quiet'], { cwd: site.root, timeout: 60000 }); }
  catch (e) { throw new Error('Could not get the latest ' + site.name + ' from GitHub: ' + (String(e.stderr || e.message).split('\n').filter(Boolean)[0] || '').slice(0, 160)); }
}
// The pull every few minutes, under the same lock as publish, so the two never
// run on a copy at once.
async function autoSync() {
  if (busy) return false;
  busy = 'pull';
  try {
    try { await pull(COM); lastSync = { at: Date.now(), ok: true, msg: 'up to date' }; }
    catch (e) { lastSync = { at: Date.now(), ok: false, msg: String(e.message).slice(0, 200) }; }
    if (CA) {
      try { await pull(CA); lastSyncCa = { at: Date.now(), ok: true, msg: 'up to date' }; }
      catch (e) { lastSyncCa = { at: Date.now(), ok: false, msg: String(e.message).slice(0, 200) }; }
    }
  } finally { busy = null; }
  return lastSync.ok && lastSyncCa.ok;
}
const node = (site, script) => execFileP(process.execPath, [path.join(site.root, script)], { cwd: site.root, encoding: 'utf8', timeout: 120000, ...BIG }).then(r => r.stdout);

/* ---------- history ---------- */
function history(site) {
  site = site || COM;
  const g = a => git(a, { cwd: site.root });
  const log = g(['log', '-25', '--pretty=%H|%h|%ad|%an|%s', '--date=iso-strict', '--', ...site.logPaths]).split('\n').filter(Boolean);
  return log.map(l => {
    const [full, sha, date, author, ...s] = l.split('|');
    const files = g(['show', '--pretty=format:', '--name-only', full]).split('\n').filter(Boolean);
    const blog = site.off ? files.filter(f => site.off.test(f)) : [];
    const offPath = files.filter(f => !publishable(site, f));
    return { sha, date, author, msg: s.join('|'), files: files.length, revertable: offPath.length === 0,
      why: blog.length ? 'This publish changed the old blog files on elvinpeters.com. The blog lives on epeters.ca now.'
        : offPath.length ? 'Also changed code (' + offPath.slice(0, 2).join(', ') + '). Roll this back by hand.' : '' };
  });
}

// Past versions of one post, newest first. Posts stored in essays.json are read out
// of that file at each commit; a commit counts when the post differs from the commit
// before it (older), so every entry is the commit that made that version. Hand-coded
// posts list the commits of their body file.
function postHistory(slug) {
  const post = loadPosts().find(x => x.slug === slug);
  if (!post) return null;
  const target = post.file && BODY_FILE.test(post.file) ? post.file : 'content/essays.json';
  const log = git(['log', '--format=%H|%h|%aI|%s', '-n', '60', '--', target], { cwd: CA.root }).split('\n').filter(Boolean)
    .map(l => { const [full, sha, date, ...m] = l.split('|'); return { full, sha, date, msg: m.join('|') }; });
  if (target !== 'content/essays.json') {
    return log.slice(0, 20).map(c => {
      let words = null;
      try { words = textWords(showAt(c.full, target)); } catch (e) {}
      return { sha: c.sha, date: c.date, msg: c.msg, title: post.title || slug, words };
    });
  }
  const snaps = log.map(c => {
    let obj = null;
    try {
      const d = JSON.parse(showAt(c.full, target));
      obj = (Array.isArray(d) ? d : d.posts || []).find(x => x && x.slug === slug) || null;
    } catch (e) {}
    return { c, obj, key: obj ? JSON.stringify(obj) : null };
  });
  const out = [];
  for (let i = 0; i < snaps.length && out.length < 20; i++) {
    const s = snaps[i], older = snaps[i + 1];
    if (!s.obj || (older && older.key === s.key)) continue;
    const words = s.obj.body_format === 'markdown' ? ((s.obj.body || '').match(/\S+/g) || []).length : textWords(s.obj.html);
    out.push({ sha: s.c.sha, date: s.c.date, msg: s.c.msg, title: s.obj.title || slug, words });
  }
  return out;
}

/* ---------- images ---------- */
function imageInfo(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ext: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { ext: 'gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { ext: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { ext: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') return { ext: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { ext: 'jpg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/* Drop the parts of an image that can carry GPS, the camera and dates (slice 3).
   The phone editor already re-encodes every photo, which drops them; this makes
   sure of it for anything else that uploads. JPEG: APP1 (Exif, XMP), APP3-APP13
   and comments (APP0 JFIF, APP2 colour profile and APP14 Adobe stay). PNG: eXIf
   and the text and time chunks. WebP: EXIF and XMP chunks. GIF has none. */
function stripMeta(b, ext) {
  if (ext === 'jpg') {
    const parts = [b.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const m = b[i + 1];
      if (m === 0xda) break;                                   // start of scan: the rest is image data
      if (m === 0xff) { i++; continue; }                       // fill byte
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
      const len = b.readUInt16BE(i + 2), end = i + 2 + len;
      if (end > b.length) break;
      const drop = m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xfe;
      if (!drop) parts.push(b.subarray(i, end));
      i = end;
    }
    parts.push(b.subarray(i));
    return Buffer.concat(parts);
  }
  if (ext === 'png') {
    const parts = [b.subarray(0, 8)];
    let i = 8;
    while (i + 12 <= b.length) {
      const len = b.readUInt32BE(i), type = b.toString('ascii', i + 4, i + 8), end = i + 12 + len;
      if (end > b.length) { parts.push(b.subarray(i)); break; }
      if (!['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type)) parts.push(b.subarray(i, end));
      i = end;
      if (type === 'IEND') break;
    }
    return Buffer.concat(parts);
  }
  if (ext === 'webp') {
    const parts = [];
    let i = 12;
    while (i + 8 <= b.length) {
      const type = b.toString('ascii', i, i + 4), len = b.readUInt32LE(i + 4), end = Math.min(b.length, i + 8 + len + (len & 1));
      if (type !== 'EXIF' && type !== 'XMP ') {
        const c = Buffer.from(b.subarray(i, end));
        if (type === 'VP8X') c[8] &= ~0x0c;                     // clear the EXIF and XMP flags
        parts.push(c);
      }
      i = end;
    }
    const body = Buffer.concat(parts), head = Buffer.from(b.subarray(0, 12));
    head.writeUInt32LE(body.length + 4, 4);
    return Buffer.concat([head, body]);
  }
  return b;
}

/* ---------- routes ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  // The test site's host gets the test site and nothing else: no editor, no API.
  if (String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '') === TEST_HOST) return serveTest(req, res, p);
  // Every change must come from the studio page itself. A custom header cannot be
  // sent cross-site without a CORS preflight this server never answers.
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-studio'] !== '1')
    return json(res, 403, { error: 'missing studio header' });
  try {
    if (p === '/' && req.method === 'GET') return serveFile(res, path.join(__dirname, 'ui.html'),
      { 'Content-Security-Policy': "frame-ancestors 'none'" });
    if (p === '/studio.css' || p === '/tools.json') return serveFile(res, path.join(__dirname, p.slice(1)));
    if (p === '/md.js') {
      // md.js is a CommonJS module; the browser gets it wrapped so the live preview
      // renders with the exact converter the build uses (the blog's: epeters.ca's).
      const src = fs.readFileSync(path.join(CA ? CA.root : ROOT, 'md.js'), 'utf8').replace(/\/\* ---- self test[\s\S]*$/, '');
      return send(res, 200, '(function(){var module={exports:{}};\n' + src + '\nwindow.mdToHtml=module.exports.mdToHtml;})();',
        { 'Content-Type': 'text/javascript' });
    }

    if (p === '/api/state' && req.method === 'GET') {
      if (Date.now() - lastSync.at > PULL_MS) autoSync();
      let repo = {};
      const blog = { ready: !!CA, host: 'epeters.ca', dir: blogDir(), error: CA ? '' : NO_BLOG };
      try {
        const st = porcelain();
        const list = drafts().map(d => ({ key: d.key, site: siteOf(d.key).id, rev: d.rev, updated: d.updated, author: d.author, stale: stale(d) }));
        repo = {
          branch: git(['branch', '--show-current']),
          head: git(['log', '-1', '--pretty=%h %s']),
          changed: list.map(d => d.key),
          drafts: list,
          blocked: st.filter(x => !publishable(COM, x.file)).map(x => x.file).slice(0, 8),
          sync: lastSync,
          test: lastTest && { at: lastTest.at, url: 'https://' + TEST_HOST + '/' },
        };
      } catch (e) { repo.error = String(e.message).slice(0, 200); }
      if (CA) {
        try {
          blog.head = git(['log', '-1', '--pretty=%h %s'], { cwd: CA.root });
          blog.blocked = porcelain(CA.root).filter(x => !publishable(CA, x.file)).map(x => x.file).slice(0, 8);
          blog.sync = lastSyncCa;
        } catch (e) { blog.error = 'Could not read the epeters.ca copy: ' + String(e.message).slice(0, 160); }
      }
      return json(res, 200, { sections: schemas(), repo, blog, publishing: busy === 'publish' || busy === 'revert' });
    }

    // Every blog route works on the epeters.ca copy; without one, say so plainly.
    if (!CA && (/^\/api\/(post-|convert\/|blog-test)/.test(p) || p === '/api/content/essays' || p.startsWith('/ca/') || (p === '/api/history' && url.searchParams.get('site') === 'blog')))
      return json(res, 503, { error: NO_BLOG });

    // Get the latest site from GitHub now (the editor's refresh; also runs every 5 minutes).
    if (p === '/api/sync' && req.method === 'POST') {
      if (busy) return json(res, 409, { error: 'The server copy is busy (' + busy + '). Try again in a moment.' });
      return autoSync().then(ok => json(res, ok ? 200 : 502, { sync: lastSync, blog: CA ? lastSyncCa : undefined,
        error: ok ? undefined : (lastSync.ok ? lastSyncCa.msg : lastSync.msg) }));
    }

    // Publish history: elvinpeters.com's pages, or ?site=blog for epeters.ca's posts.
    if (p === '/api/history' && req.method === 'GET') {
      const site = url.searchParams.get('site') === 'blog' ? CA : COM;
      return json(res, 200, { site: site.id, dir: site === CA ? blogDir() : undefined, history: history(site) });
    }

    // The section library: every type a stack page can use (sections/<type>/section.json).
    // Each type carries `blank`, the empty words a new section of it starts with;
    // presets are filled-in sections saved from a page (slice 3).
    if (p === '/api/library' && req.method === 'GET')
      return json(res, 200, { types: Sections.library().map(t => ({ ...t, blank: Sections.blankData(t.fields) })), presets: store.presets() });

    // Save a filled-in section as a preset: {name, type, data}.
    if (p === '/api/presets' && req.method === 'POST') {
      return readBody(req, 512 * 1024, body => {
        let b;
        try { b = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad body' }); }
        const name = String(b.name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
        if (!name) return json(res, 422, { error: 'Give the preset a name.' });
        if (!Sections.library().some(t => t.type === b.type)) return json(res, 422, { error: 'unknown section type' });
        if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return json(res, 422, { error: 'the section has no words' });
        try {
          const site = JSON.parse(current(contentKey('site')).buf.toString('utf8'));
          Sections.renderSection({ type: b.type, id: 'preset', data: b.data }, { site, isHome: false, amazon: site.amazon_url });
        } catch (e) { return json(res, 422, { error: 'this section would not build: ' + String(e.message).slice(0, 160) }); }
        json(res, 200, { id: store.addPreset(name, b.type, b.data, author(req)) });
      }, () => json(res, 413, { error: 'too large' }));
    }
    if (/^\/api\/presets\/\d+$/.test(p) && req.method === 'DELETE')
      return store.dropPreset(+p.split('/')[3]) ? json(res, 200, { deleted: true }) : json(res, 404, { error: 'no such preset' });

    // New page: {from: 'page-home', slug, title}. Copies that page's sections to a
    // private draft at elvinpeters.com/<slug>/, hidden from Google. Nothing is
    // public until it's published.
    if (p === '/api/pages' && req.method === 'POST') {
      return readBody(req, 64 * 1024, body => {
        let b;
        try { b = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad body' }); }
        const slug = String(b.slug || ''), title = String(b.title || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
        if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug) || /-$/.test(slug)) return json(res, 422, { error: 'The address can use a-z, 0-9 and dashes (up to 40).' });
        if (!title) return json(res, 422, { error: 'Give the page a name.' });
        if (Sections.RESERVED.has(slug)) return json(res, 422, { error: 'elvinpeters.com/' + slug + '/ is reserved for the site itself. Pick another address.' });
        const name = 'page-' + slug, key = contentKey(name);
        if (current(key)) return json(res, 409, { error: 'There is already a page called ' + slug + '.' });
        if (!allowed(String(b.from || '')) || kindOf(b.from) !== 'stack' || !current(contentKey(b.from))) return json(res, 422, { error: 'Pick a page to start from.' });
        const src = JSON.parse(current(contentKey(b.from)).buf.toString('utf8'));
        const data = { title, frame: src.frame, path: slug + '/index.html', noindex: true, sections: JSON.parse(JSON.stringify(src.sections)) };
        const bad = validate(name, data);
        if (bad) return json(res, 422, { error: bad });
        try {
          const r = store.save(key, Buffer.from(JSON.stringify(data, null, 2) + '\n'), 'p' + version(Buffer.alloc(0)), null, author(req));
          json(res, 200, { name, version: r.version, url: '/' + slug + '/' });
        } catch (e) { json(res, e.stale ? 409 : 500, { error: e.stale ? 'That page was just made somewhere else. Reload.' : String(e.message).slice(0, 200) }); }
      });
    }

    // Drafts: what's waiting, and each one's revisions (newest first).
    if (p === '/api/drafts' && req.method === 'GET') {
      if (url.searchParams.has('key')) {
        const key = url.searchParams.get('key');
        if (!keyOk(key)) return json(res, 404, { error: 'unknown page' });
        return json(res, 200, { key, revisions: store.revisions(key, 50) });
      }
      return json(res, 200, { drafts: drafts().map(d => ({ ...d, site: siteOf(d.key).id, stale: stale(d) })), uploads: store.uploads() });
    }
    if (p === '/api/drafts/revision' && req.method === 'GET') {
      const r = store.revision(+url.searchParams.get('id'));
      if (!r || !r.data || !keyOk(r.key)) return json(res, 404, { error: 'no such revision' });
      return send(res, 200, r.data, { 'Content-Type': r.key.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8' });
    }

    if (p.startsWith('/api/content/')) {
      const name = p.split('/')[3];
      if (!allowed(name)) return json(res, 404, { error: 'unknown section' });
      // Blog posts are epeters.ca's essays.json; the .com copy is never read or written.
      const key = name === 'essays' ? ESSAYS : contentKey(name);
      if (req.method === 'GET') {
        const c = current(key);
        if (!c) return json(res, 404, { error: 'That page does not exist (it may have been discarded).' });
        return send(res, 200, c.buf, { 'Content-Type': 'application/json', ETag: '"' + c.version + '"' });
      }
      if (req.method === 'PUT') {
        return readBody(req, 4 * 1024 * 1024, body => {
          let data;
          try { data = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { error: 'not valid JSON: ' + e.message }); }
          const bad = validate(name, data);
          if (bad) return json(res, 422, { error: bad });
          try {
            const r = saveDraft(req, key, Buffer.from(JSON.stringify(data, null, 2) + '\n'));
            json(res, 200, { saved: true, version: r.version, draft: !r.live });
          } catch (e) {
            if (!e.stale) return json(res, 500, { error: 'Could not save the draft: ' + String(e.message).slice(0, 200) });
            json(res, 409, { error: 'This page changed somewhere else (another tab or device, or it was just published). Reload to get the latest before saving.' });
          }
        }, () => json(res, 413, { error: 'too large' }));
      }
    }

    // One post, rendered by the same template the build uses. Markdown posts come back
    // with an empty #studio-body for the browser to fill as you type.
    if (p === '/api/post-page' && req.method === 'POST') {
      return readBody(req, 4 * 1024 * 1024, body => {
        let post;
        try { post = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad body' }); }
        const bad = validate('essays', { posts: [{ ...post, slug: post.slug || 'untitled' }] });
        if (bad) return json(res, 422, { error: bad });
        const { essayPage } = freshCa('essay-page.js');
        // body_override: a body typed in the studio that may not be saved yet.
        const override = typeof post.body_override === 'string' ? post.body_override : null;
        delete post.body_override;
        let inner;
        if (post.body_format === 'markdown') inner = '<div id="studio-body"></div>';
        else if (override !== null) inner = override;
        else if (post.file && BODY_FILE.test(post.file)) inner = (current(blogKey(post.file)) || { buf: '' }).buf.toString('utf8');
        else inner = String(post.html || '');
        // epeters.ca's own css, fonts and images, served under /ca/.
        const html = rootTo(stripTracking(essayPage({ ...post, slug: post.slug || 'untitled' }, inner)), '/ca');
        send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    }

    // A hand-coded post's body file: read it, or save it (stale-safe like content saves).
    if (p.startsWith('/api/post-body/')) {
      const slug = decodeURIComponent(p.split('/')[3] || '');
      const bf = bodyFileOf(slug);
      if (bf.error) return json(res, bf.code, { error: bf.error });
      if (req.method === 'GET') {
        const c = current(bf.key) || { buf: Buffer.alloc(0), version: 'p' + version(Buffer.alloc(0)) };
        return json(res, 200, { html: c.buf.toString('utf8'), version: c.version });
      }
      if (req.method === 'PUT') {
        return readBody(req, 2 * 1024 * 1024, body => {
          try {
            const r = saveDraft(req, bf.key, body);
            json(res, 200, { saved: true, version: r.version, draft: !r.live });
          } catch (e) {
            if (!e.stale) return json(res, 500, { error: 'Could not save the draft: ' + String(e.message).slice(0, 200) });
            json(res, 409, { error: 'This post body changed somewhere else (another tab or device, or it was just published). Reload to get the latest before saving.' });
          }
        }, () => json(res, 413, { error: 'The page body must be under 2 MB.' }));
      }
    }

    if (p.startsWith('/api/post-history/') && req.method === 'GET') {
      const versions = postHistory(decodeURIComponent(p.split('/')[3] || ''));
      if (!versions) return json(res, 404, { error: 'no such post' });
      return json(res, 200, { versions });
    }

    if (p.startsWith('/api/post-version/') && req.method === 'GET') {
      const slug = decodeURIComponent(p.split('/')[3] || '');
      const sha = String(url.searchParams.get('sha') || '');
      if (!/^[a-f0-9]{7,40}$/.test(sha)) return json(res, 400, { error: 'bad sha' });
      const post = loadPosts().find(x => x.slug === slug);
      if (!post) return json(res, 404, { error: 'no such post' });
      try {
        if (post.file) {
          if (!BODY_FILE.test(post.file)) return json(res, 422, { error: 'bad body file on ' + slug });
          return json(res, 200, { html: showAt(sha, post.file) });
        }
        const d = JSON.parse(showAt(sha, fileOf(ESSAYS)));
        const old = (Array.isArray(d) ? d : d.posts || []).find(x => x && x.slug === slug);
        if (!old) return json(res, 404, { error: 'This post did not exist in that version.' });
        return json(res, 200, { post: old });
      } catch (e) { return json(res, 404, { error: 'That version could not be read.' }); }
    }

    if (p.startsWith('/api/convert/')) {
      const slug = decodeURIComponent(p.split('/')[3] || '');
      const cur = current(ESSAYS);
      const data = JSON.parse(cur.buf.toString('utf8'));
      const posts = postsOf(data);
      const post = posts.find(x => x.slug === slug);
      if (!post) return json(res, 404, { error: 'no such post' });
      const { checkPost } = fresh(path.join(__dirname, 'convert.js'));
      const r = checkPost(post, freshCa('md.js').mdToHtml);
      if (req.method === 'GET') return json(res, 200, { ok: r.ok, reason: r.reason || '', words: r.ok ? (r.markdown.match(/\S+/g) || []).length : 0 });
      if (req.method === 'POST') {
        if (!r.ok) return json(res, 422, { error: r.reason });
        post.body_format = 'markdown';
        post.body = r.markdown;
        delete post.html;
        try {
          const s = saveDraft(req, ESSAYS, Buffer.from(JSON.stringify(data, null, 2) + '\n'));
          return json(res, 200, { converted: true, version: s.version });
        } catch (e) {
          if (!e.stale) throw e;
          return json(res, 409, { error: 'Posts changed somewhere else. Reload first.' });
        }
      }
    }

    if (p === '/api/upload' && req.method === 'POST') {
      return readBody(req, 8 * 1024 * 1024, raw => {
        const info = imageInfo(raw);
        if (!info || !info.w || !info.h) return json(res, 415, { error: 'Use a PNG, JPG, WebP or GIF image.' });
        let buf;
        try { buf = stripMeta(raw, info.ext); } catch (e) { return json(res, 415, { error: 'That image file looks damaged. Try exporting it again.' }); }
        const base = String(url.searchParams.get('name') || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '')
          .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
        // Held in the store until a publish that uses it; the post's repo only gets it
        // then. One name means one image in both repos, so a name taken in either with
        // different bytes is skipped.
        const inRepos = n => SITES.map(s => path.join(s.root, 'img', 'uploads', n)).filter(f => fs.existsSync(f));
        let name = `${base}-${info.w}x${info.h}.${info.ext}`, n = 2;
        for (;;) {
          const have = [store.getUpload(name), ...inRepos(name).map(f => fs.readFileSync(f))].filter(Boolean);
          if (have.every(h => h.equals(buf))) break;     // free name, or the same file again: reuse it
          name = `${base}-${n++}-${info.w}x${info.h}.${info.ext}`;
        }
        if (inRepos(name).length < SITES.length) store.putUpload(name, buf);
        json(res, 200, { src: '/img/uploads/' + name, image: 'uploads/' + name, width: info.w, height: info.h, bytes: buf.length });
      }, () => json(res, 413, { error: 'Images must be under 8 MB. Export a smaller JPG or WebP.' }));
    }

    if (p === '/api/preview' && req.method === 'POST') {
      const id = crypto.randomBytes(6).toString('hex');
      return buildWithDrafts(path.join(PREVIEWS, id), err => {
        if (err) return json(res, 500, { error: 'build failed', detail: err });
        prune(PREVIEWS, 5);
        json(res, 200, { id });
      }, true);
    }

    // Blog Test: the real epeters.ca build with the blog drafts in it, shown full
    // screen at /preview/<id>/<blog dir>/<slug>/. Nothing is pushed.
    if (p === '/api/blog-test' && req.method === 'POST') {
      if (busy === 'publish' || busy === 'revert') return json(res, 409, { error: 'A publish is running. Try again when it finishes.' });
      const id = crypto.randomBytes(6).toString('hex');
      return buildBlogTest(path.join(PREVIEWS, id)).then(r => {
        prune(PREVIEWS, 5);
        json(res, 200, { id, ...r });
      }, e => json(res, 500, { error: 'The epeters.ca build failed: ' + String(e.message).slice(0, 400) }));
    }

    // Test: the whole site with every draft in it, at the test address.
    if (p === '/api/test' && req.method === 'POST') {
      const id = crypto.randomBytes(6).toString('hex');
      return buildWithDrafts(path.join(TESTS, id), err => {
        if (err) return json(res, 500, { error: 'build failed', detail: err });
        lastTest = { id, at: new Date().toISOString() };
        fs.writeFileSync(path.join(TESTS, 'current'), id);
        prune(TESTS, 2);
        json(res, 200, { url: 'https://' + TEST_HOST + '/', at: lastTest.at, drafts: drafts(COM).length });
      });
    }

    if (p.startsWith('/preview/') && req.method === 'GET') {
      const [, , id, ...rest] = p.split('/');
      let rel = decodeURIComponent(rest.join('/')) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      if (!/^[a-f0-9]{12}$/.test(id)) return send(res, 404, '');
      const file = builtFile(path.join(PREVIEWS, id), rel);
      if (!file) return send(res, 404, 'not found');
      // /blog/x without the slash: go to the folder, so its relative links work.
      if (fs.statSync(file).isDirectory()) {
        if (!fs.existsSync(path.join(file, 'index.html'))) return send(res, 404, 'not found');
        res.writeHead(302, { Location: p + '/' + (url.search || ''), 'Cache-Control': 'no-store' });
        return res.end();
      }
      // The proxy says X-Frame-Options DENY for the whole host; frame-ancestors
      // overrides it in browsers, so previews can sit inside the studio page.
      const frame = { 'Content-Security-Policy': "frame-ancestors 'self'" };
      // A blog Test is a whole epeters.ca: its root paths stay inside this preview.
      const whole = fs.existsSync(path.join(PREVIEWS, id, 'site'));
      if (file.endsWith('.html')) {
        const html = stripTracking(fs.readFileSync(file, 'utf8'));
        return send(res, 200, whole ? rootTo(html, '/preview/' + id) : html, { 'Content-Type': MIME['.html'], ...frame });
      }
      if (whole && file.endsWith('.css'))
        return send(res, 200, rootTo(fs.readFileSync(file, 'utf8'), '/preview/' + id, true), { 'Content-Type': MIME['.css'], ...frame });
      return serveFile(res, file, frame);
    }

    // epeters.ca's live files for the quick post preview (/ca/css/post.css, its images,
    // its pages): held uploads first, then the ca copy. Never source or content.
    if (p.startsWith('/ca/') && req.method === 'GET') {
      let rel = decodeURIComponent(p.slice(3));
      if (/^\/(content|essays|node_modules)\//i.test(rel) || (/\.(js|json|md|txt)$/i.test(rel) && !/^\/js\/[\w.-]+\.js$/.test(rel))) return send(res, 404, 'not found');
      const up = /^\/img\/uploads\/([a-z0-9][a-z0-9._-]{0,120})$/i.exec(rel);
      const held = up && store.getUpload(up[1]);
      if (held) return send(res, 200, held, { 'Content-Type': MIME[path.extname(up[1]).toLowerCase()] || 'application/octet-stream' });
      if (rel.endsWith('/')) rel += 'index.html';
      const file = safeJoin(CA.root, rel);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found');
      const frame = { 'Content-Security-Policy': "frame-ancestors 'self'" };
      if (file.endsWith('.html')) return send(res, 200, rootTo(stripTracking(fs.readFileSync(file, 'utf8')), '/ca'), { 'Content-Type': MIME['.html'], ...frame });
      if (file.endsWith('.css')) return send(res, 200, rootTo(fs.readFileSync(file, 'utf8'), '/ca', true), { 'Content-Type': MIME['.css'] });
      return serveFile(res, file, frame);
    }

    // Publish: ?keys=content/claude.json,essays/x.html (the pages to ship; none = every
    // draft), &force=1 (mine wins over a live file that changed since the draft began),
    // &msg=. Streams progress lines.
    if (p === '/api/publish' && req.method === 'POST') {
      const want = String(url.searchParams.get('keys') || '').split(',').map(s => s.trim()).filter(Boolean);
      const bad = want.find(k => !keyOk(k));
      if (bad) return json(res, 400, { error: 'unknown page ' + bad });
      if (busy) return json(res, 409, { error: busy === 'pull' ? 'The server copy is updating from GitHub. Try again in a few seconds.' : 'A publish is already running.' });
      busy = 'publish';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const say = t => res.write(t + '\n');
      return publish({ keys: want, force: url.searchParams.get('force') === '1', say, who: author(req),
          msg: String(url.searchParams.get('msg') || '').replace(/[\r\n]+/g, ' ').slice(0, 120) })
        .catch(e => say('✗ ' + String(e.message).slice(0, 200)))
        .finally(() => { busy = null; res.end(); });
    }

    // Throw away drafts: {keys: [...]} or every draft. Each one stays in its revision
    // history (kind "discard"), so a slip can be recovered.
    if (p === '/api/discard' && req.method === 'POST') {
      return readBody(req, 64 * 1024, body => {
        let keys = null;
        try { const b = body.length ? JSON.parse(body.toString('utf8')) : {}; keys = Array.isArray(b.keys) && b.keys.length ? b.keys : null; }
        catch (e) { return json(res, 400, { error: 'bad body' }); }
        const list = keys || store.list().map(d => d.key);
        let n = 0;
        for (const k of list) if (keyOk(k) && store.end(k, 'discard', 0, author(req))) n++;
        json(res, 200, { discarded: n });
      });
    }

    if (p === '/api/revert' && req.method === 'POST') {
      return readBody(req, 1024, body => {
        let sha, site;
        try { const b = JSON.parse(body.toString('utf8')); sha = b.sha; site = b.site === 'blog' ? CA : COM; } catch (e) { return json(res, 400, { error: 'bad body' }); }
        if (!site) return json(res, 503, { error: NO_BLOG });
        if (!/^[a-f0-9]{7,40}$/.test(sha || '')) return json(res, 400, { error: 'bad sha' });
        if (busy) return json(res, 409, { error: 'A publish is running. Try again when it finishes.' });
        const g = (a, o) => git(a, { cwd: site.root, ...o });
        const item = history(site).find(h => h.sha.startsWith(sha) || sha.startsWith(h.sha));
        if (!item) return json(res, 404, { error: 'That version is not in the recent publish history.' });
        if (!item.revertable) return json(res, 422, { error: item.why });
        busy = 'revert';
        const before = g(['rev-parse', 'HEAD']);
        (async () => {
          await pull(site);
          g(['revert', '--no-commit', sha]);
          await node(site, 'build.js');
          await node(site, 'verify.js');
          // Tracked files only: the copy was clean before, so this is the revert plus
          // the pages the build regenerated from it. Never the old .com blog files.
          const touched = porcelain(site.root).map(x => x.file).filter(f => !publishable(site, f));
          if (touched.length) throw new Error('The roll back would change ' + touched.slice(0, 3).join(', ') + '.');
          g(['add', '-u']);
          g(['commit', '-m', 'Site Studio: roll back "' + item.msg.replace(/^Site Studio: /, '').slice(0, 80) + '" (' + item.sha + ')']);
          await execFileP('git', ['push'], { cwd: site.root, timeout: 60000 });
        })().then(() => json(res, 200, { reverted: sha, site: site.id }), e => {
          try { g(['revert', '--abort']); } catch (e2) {}
          try { g(['reset', '--hard', before]); } catch (e2) {}
          try { for (const x of porcelain(site.root)) if (x.code === '??' && site.generated.test(x.file)) fs.rmSync(path.join(site.root, x.file), { force: true }); } catch (e2) {}
          const detail = String((e.stdout || '') + (e.stderr || '') || e.message);
          json(res, 500, { error: 'Roll back failed, nothing shipped: ' + detail.split('\n').filter(Boolean).slice(0, 4).join(' ').slice(0, 300) });
        }).finally(() => { busy = null; });
      });
    }

    // Static assets for previews. A built page links absolute paths (/css/post.css,
    // /img/...), which are not under /preview/<id>/. Assets only, by extension, and
    // never source or content directories.
    if (req.method === 'GET' && (/\.(css|svg|png|jpg|jpeg|webp|gif|ico|woff2|pdf)$/i.test(p) || /^\/js\/[\w.-]+\.js$/.test(p))
        && !/^\/(studio|content|essays)\//i.test(p)) {
      const up = /^\/img\/uploads\/([a-z0-9][a-z0-9._-]{0,120})$/i.exec(p);
      const held = up && store.getUpload(up[1]);
      if (held) return send(res, 200, held, { 'Content-Type': MIME[path.extname(up[1]).toLowerCase()] || 'application/octet-stream' });
      const asset = safeJoin(ROOT, decodeURIComponent(p));
      if (asset && fs.existsSync(asset)) return serveFile(res, asset);
      // A blog post's images live in epeters.ca (the markdown preview asks the studio's root).
      const caAsset = CA && /^\/img\//.test(p) && safeJoin(CA.root, decodeURIComponent(p));
      if (caAsset && fs.existsSync(caAsset)) return serveFile(res, caAsset);
    }

    send(res, 404, 'not found');
  } catch (e) {
    try { json(res, 500, { error: String(e.message).slice(0, 300) }); } catch (e2) {}
  }
});

/* ---------- publish ---------- */
// Ship the chosen drafts and nothing else: write them into the clean server copy,
// build, verify, commit those files and the pages the build regenerated BY NAME,
// push. Any other draft never leaves the store. If anything fails, the copy goes
// back to the commit it started from and every draft stays as it was.
async function publish({ keys, force, msg, say, who }) {
  const all = drafts();
  const picked = keys.length ? all.filter(d => keys.includes(d.key)) : all;
  if (!picked.length) { say('✓ Nothing to publish: no drafts' + (keys.length ? ' for that page.' : '.')); return; }
  // One site at a time, the blog first. A site that fails stops the rest.
  for (const site of SITES) {
    const mine = picked.filter(d => siteOf(d.key) === site).map(d => d.key);
    if (!mine.length) continue;
    if (!(await publishSite(site, mine, { force, msg, say, who }))) return;
  }
}

// Ship the chosen drafts of one site and nothing else: write them into the clean
// server copy, build, verify, commit those files and the pages the build regenerated
// BY NAME, push. Any other draft never leaves the store. If GitHub turns the push
// away (someone pushed first), start again once from the new GitHub copy. If
// anything fails, the copy goes back to the commit it started from and every draft
// stays as it was. Returns true when the site is live or had nothing to ship.
async function publishSite(site, keys, { force, msg, say, who }) {
  const run = async (label, fn) => { say('▸ ' + label); const out = await fn(); if (out) say(String(out).trim().split('\n').slice(-4).map(l => l.length > 160 ? l.slice(0, 157) + '…' : l).join('\n')); };
  const g = (a, o) => git(a, { cwd: site.root, ...o });
  let before = g(['rev-parse', 'HEAD']);
  const wrote = [];
  const cleanUp = () => {
    try { g(['reset', '--hard', before]); } catch (e2) {}
    for (const f of wrote) { try { if (porcelain(site.root).some(x => x.file === f && x.code === '??')) fs.rmSync(path.join(site.root, f)); } catch (e2) {} }
    try { for (const x of porcelain(site.root)) if (x.code === '??' && site.generated.test(x.file)) fs.rmSync(path.join(site.root, x.file), { force: true }); } catch (e2) {}
    wrote.length = 0;
  };
  // Pull, check, write, build, verify, commit. Returns the plan, or null when there
  // is nothing to push.
  const attempt = async () => {
    await run('Getting the latest ' + site.name + ' from GitHub', () => pull(site));
    before = g(['rev-parse', 'HEAD']);
    const picked = keys.map(k => store.get(k)).filter(Boolean);
    if (!picked.length) { say('✓ Nothing to publish on ' + site.name + '.'); return null; }

    // Live changed under a draft (a Claude push, another device's publish): stop
    // unless the editor chose "mine wins", so nobody's work is overwritten silently.
    const moved = picked.filter(d => stale(d));
    if (moved.length && !force) {
      say('✗ ' + moved.map(d => pageTitle(d.key)).join(', ') + ' changed on the live site after this draft started.');
      say('  Open the page and check it. Publishing anyway replaces the live version with yours.');
      throw Object.assign(new Error('stale'), { quiet: true, stale: moved.map(d => d.key) });
    }

    // Posts as they will be after this publish decide which post bodies may go.
    let postsAfter = [];
    if (site === CA) {
      const e = picked.find(d => d.key === ESSAYS);
      postsAfter = postsOf(JSON.parse((e ? e.data : live(ESSAYS) || Buffer.from('[]')).toString('utf8')));
    }
    const plan = [], held = [];
    for (const d of picked) {
      const out = publishForm(d.key, d.data, postsAfter);
      if (!out) { held.push(d.key); continue; }
      plan.push({ d, out });
    }
    held.forEach(k => say('  ' + pageTitle(k) + ' stays private: its post is still a draft.'));
    if (!plan.length) { say('✓ Nothing to publish: only private drafts.'); return null; }

    await run('Writing ' + plan.map(x => pageTitle(x.d.key)).join(', '), () => {
      for (const { d, out } of plan) {
        const file = fileOf(d.key);
        fs.mkdirSync(path.dirname(path.join(site.root, file)), { recursive: true });
        fs.writeFileSync(path.join(site.root, file), out);
        wrote.push(file);
        for (const u of uploadsIn(out)) {
          const rel = 'img/uploads/' + u, abs = path.join(site.root, rel);
          if (wrote.includes(rel)) continue;
          const img = store.getUpload(u);
          if (fs.existsSync(abs) && fs.readFileSync(abs).equals(img)) continue;
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, img);
          wrote.push(rel);
        }
      }
    });
    await run('Building ' + site.name, () => node(site, 'build.js'));
    await run('Checking (verify gate)', () => node(site, 'verify.js'));

    // Commit by name: the files written above plus pages the build regenerated.
    // Anything else changed means something is wrong; ship nothing.
    const changed = porcelain(site.root).map(x => x.file);
    const odd = changed.filter(f => !wrote.includes(f) && !site.generated.test(f));
    if (odd.length) throw new Error('The build changed files it should not have (' + odd.slice(0, 3).join(', ') + ').');
    const off = site.off ? changed.filter(f => site.off.test(f)) : [];
    if (off.length) throw new Error('This publish would change the old blog files (' + off.slice(0, 3).join(', ') + '). The blog lives on epeters.ca now.');
    if (!changed.length) {
      say('✓ Nothing changed. That page is live already.');
      for (const { d } of plan) store.end(d.key, 'publish', d.rev, who, 'already live');
      return null;
    }
    const titles = plan.map(x => pageTitle(x.d.key)).join(', ');
    await run('Saving a version', () => {
      for (let i = 0; i < changed.length; i += 100) g(['add', '--', ...changed.slice(i, i + 100)]);
      return g(['commit', '-m', 'Site Studio: ' + (msg || titles)]);
    });
    return { plan, titles };
  };
  const push = () => run('Pushing to ' + site.name + ' (it updates in about a minute)', () => execFileP('git', ['push', '--quiet'], { cwd: site.root, timeout: 60000 }).then(() => ''));

  try {
    let done = await attempt();
    if (!done) return true;
    try { await push(); }
    catch (e) {
      // Someone pushed first. Start over from GitHub's copy, once.
      say('  GitHub turned the push away (' + (String(e.stderr || e.message).split('\n').filter(Boolean)[0] || '').slice(0, 120) + '). Trying again on the latest copy.');
      cleanUp();
      done = await attempt();
      if (!done) return true;
      await push();
    }
    const sha = g(['rev-parse', '--short', 'HEAD']);

    // Close what shipped. A draft saved again during the publish, or one that keeps
    // private posts, stays open against the new live file.
    for (const { d, out } of done.plan) {
      if (!out.equals(d.data) || !store.end(d.key, 'publish', d.rev, who, sha)) store.rebase(d.key, live(d.key));
    }
    // An image leaves the store once no draft still points at it (a later upload of
    // the same file for the other site puts it back).
    for (const { out } of done.plan) for (const u of uploadsIn(out)) if (!uploadInUse(u)) store.dropUpload(u);
    const where = site === CA ? ' to ' + site.name : '';
    say('✓ PUBLISHED ' + done.titles + where + ' (' + sha + '). GitHub Pages takes about a minute, then it is live.');
    return true;
  } catch (e) {
    if (!e.quiet) {
      const detail = (e.stdout || '') + (e.stderr || '');
      say('✗ ' + (detail.includes('FAIL') || detail.includes('✗') ? 'The verify gate failed:\n' + gateLines(detail).map(l => '  ' + l).join('\n') : String(e.message).split('\n').slice(0, 6).join('\n')));
    }
    // Back to where we started: no commit left to ride along later, no half-built
    // pages, no draft file left in the copy.
    cleanUp();
    say('Nothing shipped to ' + site.name + '. The live site is untouched. Your drafts are still saved.');
    return false;
  }
}
function pageTitle(key) {
  if (key === ESSAYS) return 'Blog posts';
  if (String(key).startsWith('ca:')) {
    const post = (() => { try { return loadPosts().find(p => p && p.file === fileOf(key)); } catch (e) { return null; } })();
    return post ? 'Blog post "' + String(post.title || post.slug).slice(0, 60) + '"' : fileOf(key);
  }
  const m = /^content\/([a-z0-9-]+)\.json$/.exec(key);
  if (!m) return key;
  if (m[1] === 'nav') return 'Menu';
  try { return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, m[1] + '.json'), 'utf8')).title || m[1]; } catch (e) {}
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, key), 'utf8')).title || m[1]; } catch (e) { return m[1]; }
}

/* ---------- the test site ---------- */
// test.elvinpeters.com: the latest Test build (every draft laid over the repo),
// served like GitHub Pages serves the live site. Behind the studio login, never
// indexed, analytics stripped so test visits never count.
function serveTest(req, res, p) {
  const noindex = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'read only', noindex);
  if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', { 'Content-Type': MIME['.txt'], ...noindex });
  let id = lastTest && lastTest.id;
  if (!id) { try { id = fs.readFileSync(path.join(TESTS, 'current'), 'utf8').trim(); } catch (e) {} }
  if (!id || !/^[a-f0-9]{12}$/.test(id) || !fs.existsSync(path.join(TESTS, id)))
    return send(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>No test yet</title><p style="font:18px system-ui;margin:3em">No test build yet. Open Site Studio and tap <b>Test</b>.</p>',
      { 'Content-Type': MIME['.html'], ...noindex });
  let rel;
  try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch (e) { return send(res, 400, 'bad path', noindex); }
  if (/^studio(\/|$)/i.test(rel)) return send(res, 404, 'not found', noindex);
  const dir = path.join(TESTS, id);
  const cands = !rel || rel.endsWith('/') ? [rel + 'index.html'] : path.extname(rel) ? [rel] : [rel, rel + '.html', rel + '/index.html'];
  let file = null;
  for (const c of cands) { const f = builtFile(dir, c); if (f && fs.statSync(f).isFile()) { file = f; break; } }
  if (!file && !rel.endsWith('/') && !path.extname(rel) && builtFile(dir, rel + '/index.html')) {
    res.writeHead(301, { Location: '/' + rel + '/', ...noindex }); return res.end();
  }
  let code = 200;
  if (!file) { file = builtFile(dir, '404.html'); code = 404; if (!file) return send(res, 404, 'not found', noindex); }
  if (file.endsWith('.html'))
    return send(res, code, stripTracking(fs.readFileSync(file, 'utf8')), { 'Content-Type': MIME['.html'], ...noindex });
  fs.readFile(file, (err, data) => err ? send(res, 404, 'not found', noindex)
    : send(res, code, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', ...noindex }));
}

fs.mkdirSync(PREVIEWS, { recursive: true });
fs.mkdirSync(TESTS, { recursive: true });
try {   // the last Test survives a restart
  const id = fs.readFileSync(path.join(TESTS, 'current'), 'utf8').trim();
  if (/^[a-f0-9]{12}$/.test(id)) lastTest = { id, at: fs.statSync(path.join(TESTS, id)).mtime.toISOString() };
} catch (e) {}
setInterval(autoSync, PULL_MS).unref();
server.listen(PORT, '127.0.0.1', () => console.log('Site Studio on http://127.0.0.1:' + PORT + '  (repo: ' + ROOT + ', drafts: ' + store.dir + ')'));
