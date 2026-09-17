#!/usr/bin/env node
/* Site Studio: the owned, zero-dependency admin for elvinpeters.com.
   Write posts, edit pages and the menu in a browser, preview the REAL build,
   publish = pull --rebase + build + verify + commit + push (Pages deploys).
   Git is the database, history, and rollback. No node_modules, ever.

   Run:   node studio/server.js --port 8820
   Binds 127.0.0.1 only. Auth is the reverse proxy's job (the studio login in
   production; nothing on localhost). Serves no dotfiles, no .git. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'content', '_schema');
const PREVIEWS = path.join(__dirname, '.previews');
const UPLOADS = path.join(ROOT, 'img', 'uploads');
const PORT = (() => { const i = process.argv.indexOf('--port'); return i > -1 ? +process.argv[i + 1] : 8796; })();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.xml': 'text/xml',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

// What an edit in the studio touches, and what the build regenerates from it.
// Anything else dirty in the clone means someone is working in it by hand, and a
// publish would sweep their files live.
// essays/ holds the hand-coded post bodies: the studio edits them too, so a failed
// publish must never reset them as if they were build output.
const EDITS = /^(content\/|img\/uploads\/|essays\/)/;
const GENERATED = /(\.html|^sitemap\.xml|^llms\.txt)$/;
const publishable = f => EDITS.test(f) || GENERATED.test(f);

let publishing = false;   // one publish (or roll back) at a time, ever
let lastSync = { at: 0, ok: true, msg: '' };

/* ---------- helpers ---------- */
function git(args, opts) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000, ...opts }).trim();
}
function porcelain() {
  // Not git(): its trim() would eat the leading space of the first " M file" line.
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 })
    .split('\n').filter(Boolean)
    .map(l => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '').replace(/^.* -> /, '') }));
}
function schemas() {
  return fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'))
    .map(f => ({ name: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')) }));
}
function allowed(name) {
  return /^[a-z][a-z0-9-]{0,40}$/.test(name) && fs.existsSync(path.join(SCHEMA_DIR, name + '.json'));
}
function contentPath(name) { return path.join(ROOT, 'content', name + '.json'); }
function version(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16); }
function textWords(html) {
  const t = String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return (t.match(/\S+/g) || []).length;
}
function fresh(mod) { const p = require.resolve(mod); delete require.cache[p]; return require(p); }

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
function stripTracking(html) {
  return html.replace(/<script async src="https:\/\/www\.googletagmanager\.com[^<]*<\/script>\s*<script>window\.dataLayer[^<]*<\/script>\s*<script>!function\(f,b,e,v,n,t,s\)[^<]*<\/script>/, '');
}

/* ---------- content validation ---------- */
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
function validate(name, data) {
  if (data === null || typeof data !== 'object') return 'content must be a JSON object';
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
function loadPosts() {
  const data = JSON.parse(fs.readFileSync(contentPath('essays'), 'utf8'));
  return Array.isArray(data) ? data : data.posts;
}
// A hand-coded post's body file, only if that post really points at it.
function bodyFileOf(slug) {
  const post = loadPosts().find(x => x.slug === slug);
  if (!post) return { error: 'no such post', code: 404 };
  if (!post.file) return { error: 'this post has no body file', code: 404 };
  if (!BODY_FILE.test(post.file)) return { error: 'bad body file on ' + slug, code: 422 };
  return { post, file: post.file, abs: path.join(ROOT, post.file) };
}
// A file as it was at a commit. Not git(): its trim() would change the bytes.
function showAt(sha, file) {
  return execFileSync('git', ['show', sha + ':' + file], { cwd: ROOT, encoding: 'utf8', timeout: 60000, ...BIG });
}

/* ---------- git sync ---------- */
// Keep the clone current while nobody has unpublished edits, so the editor never
// starts from a stale copy of the site.
function autoSync() {
  if (publishing || Date.now() - lastSync.at < 60000) return;
  lastSync.at = Date.now();
  try {
    if (porcelain().length) { lastSync = { at: Date.now(), ok: true, msg: 'unpublished edits; sync paused' }; return; }
    git(['pull', '--rebase', '--quiet'], { timeout: 30000 });
    lastSync = { at: Date.now(), ok: true, msg: 'up to date' };
  } catch (e) {
    try { git(['rebase', '--abort']); } catch (e2) {}
    lastSync = { at: Date.now(), ok: false, msg: String(e.message).split('\n')[0].slice(0, 160) };
  }
}
// Pull under unpublished edits: stash them, pull, put them back. If the same lines
// changed upstream the pull is undone and the edits stay safely in the stash.
function pullKeepingEdits(say) {
  const dirty = porcelain().length > 0;
  const stamp = 'site-studio ' + new Date().toISOString();
  if (dirty) git(['stash', 'push', '--include-untracked', '-m', stamp]);
  try { git(['pull', '--rebase']); }
  catch (e) {
    try { git(['rebase', '--abort']); } catch (e2) {}
    if (dirty) git(['stash', 'pop']);
    throw new Error('Could not pull the latest site from GitHub. Your edits are untouched. Try again in a minute.');
  }
  if (!dirty) return;
  try { git(['stash', 'pop']); }
  catch (e) {
    git(['reset', '--hard', 'HEAD']);
    const err = new Error('The site changed on GitHub in the same place you edited. Your edits are kept in the stash "' +
      stamp + '" on the server; reload the editor to see the latest, then redo the change.');
    err.stashed = true;
    throw err;
  }
  if (say) say('  (your unpublished edits were carried over)');
}

// Put regenerated pages back to their committed state; the studio's edits stay.
function resetBuildOutput() {
  try {
    const files = porcelain().filter(x => !EDITS.test(x.file) && GENERATED.test(x.file) && x.code !== '??').map(x => x.file);
    for (let i = 0; i < files.length; i += 100) git(['checkout', '--', ...files.slice(i, i + 100)]);
  } catch (e) {}
}

/* ---------- history ---------- */
function history() {
  const log = git(['log', '-25', '--pretty=%H|%h|%ad|%an|%s', '--date=iso-strict', '--', 'content/', 'essays/']).split('\n').filter(Boolean);
  return log.map(l => {
    const [full, sha, date, author, ...s] = l.split('|');
    const files = git(['show', '--pretty=format:', '--name-only', full]).split('\n').filter(Boolean);
    const offPath = files.filter(f => !publishable(f));
    return { sha, date, author, msg: s.join('|'), files: files.length,
      revertable: offPath.length === 0, why: offPath.length ? 'Also changed code (' + offPath.slice(0, 2).join(', ') + '). Roll this back by hand.' : '' };
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
  const log = git(['log', '--format=%H|%h|%aI|%s', '-n', '60', '--', target]).split('\n').filter(Boolean)
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

/* ---------- routes ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
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
      // renders with the exact converter the build uses.
      const src = fs.readFileSync(path.join(ROOT, 'md.js'), 'utf8').replace(/\/\* ---- self test[\s\S]*$/, '');
      return send(res, 200, '(function(){var module={exports:{}};\n' + src + '\nwindow.mdToHtml=module.exports.mdToHtml;})();',
        { 'Content-Type': 'text/javascript' });
    }

    if (p === '/api/state' && req.method === 'GET') {
      autoSync();
      let repo = {};
      try {
        const st = porcelain();
        repo = {
          branch: git(['branch', '--show-current']),
          head: git(['log', '-1', '--pretty=%h %s']),
          changed: st.filter(x => EDITS.test(x.file)).map(x => x.file),
          blocked: st.filter(x => !publishable(x.file)).map(x => x.file).slice(0, 8),
          sync: lastSync,
        };
      } catch (e) { repo.error = String(e.message).slice(0, 200); }
      return json(res, 200, { sections: schemas(), repo, publishing });
    }

    if (p === '/api/history' && req.method === 'GET') return json(res, 200, { history: history() });

    if (p.startsWith('/api/content/')) {
      const name = p.split('/')[3];
      if (!allowed(name)) return json(res, 404, { error: 'unknown section' });
      if (req.method === 'GET') {
        const buf = fs.readFileSync(contentPath(name));
        return send(res, 200, buf, { 'Content-Type': 'application/json', ETag: '"' + version(buf) + '"' });
      }
      if (req.method === 'PUT') {
        return readBody(req, 4 * 1024 * 1024, body => {
          let data;
          try { data = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { error: 'not valid JSON: ' + e.message }); }
          const bad = validate(name, data);
          if (bad) return json(res, 422, { error: bad });
          if (publishing) return json(res, 409, { error: 'A publish is running. Your change will save when it finishes.', retry: true });
          const cur = fs.readFileSync(contentPath(name));
          const want = String(req.headers['if-match'] || '').replace(/"/g, '');
          if (want && want !== version(cur))
            return json(res, 409, { error: 'This section changed somewhere else (another tab, or the site was updated). Reload to get the latest before saving.' });
          const out = Buffer.from(JSON.stringify(data, null, 2) + '\n');
          fs.writeFileSync(contentPath(name), out);
          json(res, 200, { saved: true, version: version(out) });
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
        const { essayPage } = fresh(path.join(ROOT, 'essay-page.js'));
        // body_override: a body typed in the studio that may not be saved yet.
        const override = typeof post.body_override === 'string' ? post.body_override : null;
        delete post.body_override;
        let inner;
        if (post.body_format === 'markdown') inner = '<div id="studio-body"></div>';
        else if (override !== null) inner = override;
        else if (post.file) inner = fs.readFileSync(path.join(ROOT, post.file), 'utf8');
        else inner = String(post.html || '');
        const html = stripTracking(essayPage({ ...post, slug: post.slug || 'untitled' }, inner));
        send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    }

    // A hand-coded post's body file: read it, or save it (stale-safe like content saves).
    if (p.startsWith('/api/post-body/')) {
      const slug = decodeURIComponent(p.split('/')[3] || '');
      const bf = bodyFileOf(slug);
      if (bf.error) return json(res, bf.code, { error: bf.error });
      if (req.method === 'GET') {
        const buf = fs.readFileSync(bf.abs);
        return json(res, 200, { html: buf.toString('utf8'), version: version(buf) });
      }
      if (req.method === 'PUT') {
        return readBody(req, 2 * 1024 * 1024, body => {
          if (publishing) return json(res, 409, { error: 'A publish is running. Your change will save when it finishes.', retry: true });
          const cur = fs.existsSync(bf.abs) ? fs.readFileSync(bf.abs) : Buffer.alloc(0);
          const want = String(req.headers['if-match'] || '').replace(/"/g, '');
          if (want !== version(cur))
            return json(res, 409, { error: 'This post body changed somewhere else (another tab, or the site was updated). Reload to get the latest before saving.' });
          fs.writeFileSync(bf.abs, body);
          json(res, 200, { saved: true, version: version(body) });
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
        const d = JSON.parse(showAt(sha, 'content/essays.json'));
        const old = (Array.isArray(d) ? d : d.posts || []).find(x => x && x.slug === slug);
        if (!old) return json(res, 404, { error: 'This post did not exist in that version.' });
        return json(res, 200, { post: old });
      } catch (e) { return json(res, 404, { error: 'That version could not be read.' }); }
    }

    if (p.startsWith('/api/convert/')) {
      const slug = decodeURIComponent(p.split('/')[3] || '');
      const file = contentPath('essays');
      const buf = fs.readFileSync(file);
      const data = JSON.parse(buf);
      const posts = Array.isArray(data) ? data : data.posts;
      const post = posts.find(x => x.slug === slug);
      if (!post) return json(res, 404, { error: 'no such post' });
      const { checkPost } = fresh(path.join(__dirname, 'convert.js'));
      const r = checkPost(post);
      if (req.method === 'GET') return json(res, 200, { ok: r.ok, reason: r.reason || '', words: r.ok ? (r.markdown.match(/\S+/g) || []).length : 0 });
      if (req.method === 'POST') {
        if (!r.ok) return json(res, 422, { error: r.reason });
        if (publishing) return json(res, 409, { error: 'A publish is running. Try again when it finishes.' });
        const want = String(req.headers['if-match'] || '').replace(/"/g, '');
        if (want && want !== version(buf)) return json(res, 409, { error: 'Posts changed somewhere else. Reload first.' });
        post.body_format = 'markdown';
        post.body = r.markdown;
        delete post.html;
        const out = Buffer.from(JSON.stringify(data, null, 2) + '\n');
        fs.writeFileSync(file, out);
        return json(res, 200, { converted: true, version: version(out) });
      }
    }

    if (p === '/api/upload' && req.method === 'POST') {
      return readBody(req, 8 * 1024 * 1024, buf => {
        const info = imageInfo(buf);
        if (!info || !info.w || !info.h) return json(res, 415, { error: 'Use a PNG, JPG, WebP or GIF image.' });
        const base = String(url.searchParams.get('name') || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '')
          .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
        fs.mkdirSync(UPLOADS, { recursive: true });
        let name = `${base}-${info.w}x${info.h}.${info.ext}`, n = 2;
        while (fs.existsSync(path.join(UPLOADS, name))) {
          if (fs.readFileSync(path.join(UPLOADS, name)).equals(buf)) break;     // same file again: reuse it
          name = `${base}-${n++}-${info.w}x${info.h}.${info.ext}`;
        }
        fs.writeFileSync(path.join(UPLOADS, name), buf);
        json(res, 200, { src: '/img/uploads/' + name, image: 'uploads/' + name, width: info.w, height: info.h, bytes: buf.length });
      }, () => json(res, 413, { error: 'Images must be under 8 MB. Export a smaller JPG or WebP.' }));
    }

    if (p === '/api/preview' && req.method === 'POST') {
      const id = crypto.randomBytes(6).toString('hex');
      const out = path.join(PREVIEWS, id);
      fs.mkdirSync(out, { recursive: true });
      return execFile(process.execPath, [path.join(ROOT, 'build.js'), '--out', out], { cwd: ROOT, timeout: 60000 }, (err, so, se) => {
        if (err) return json(res, 500, { error: 'build failed', detail: String(se || err.message).slice(0, 500) });
        const all = fs.readdirSync(PREVIEWS).map(d => ({ d, t: fs.statSync(path.join(PREVIEWS, d)).mtimeMs }))
          .sort((a, b) => b.t - a.t);
        for (const old of all.slice(5)) fs.rmSync(path.join(PREVIEWS, old.d), { recursive: true, force: true });
        json(res, 200, { id });
      });
    }

    if (p.startsWith('/preview/') && req.method === 'GET') {
      const [, , id, ...rest] = p.split('/');
      let rel = rest.join('/') || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      if (!/^[a-f0-9]{12}$/.test(id)) return send(res, 404, '');
      const built = safeJoin(path.join(PREVIEWS, id), rel);
      const fallback = safeJoin(ROOT, rel);
      const file = built && fs.existsSync(built) ? built : fallback && fs.existsSync(fallback) ? fallback : null;
      if (!file || fs.statSync(file).isDirectory()) return send(res, 404, 'not found');
      // The proxy says X-Frame-Options DENY for the whole host; frame-ancestors
      // overrides it in browsers, so previews can sit inside the studio page.
      const frame = { 'Content-Security-Policy': "frame-ancestors 'self'" };
      if (file.endsWith('.html'))
        return send(res, 200, stripTracking(fs.readFileSync(file, 'utf8')), { 'Content-Type': MIME['.html'], ...frame });
      return serveFile(res, file, frame);
    }

    if (p === '/api/publish' && req.method === 'POST') {
      if (publishing) return json(res, 409, { error: 'a publish is already running' });
      publishing = true;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const say = t => res.write(t + '\n');
      const run = (label, fn) => { say('▸ ' + label); const out = fn(); if (out) say(String(out).split('\n').slice(-4).map(l => l.length > 160 ? l.slice(0, 157) + '…' : l).join('\n')); };
      const before = git(['rev-parse', 'HEAD']);
      try {
        const blocked = porcelain().filter(x => !publishable(x.file));
        if (blocked.length) {
          say('✗ The server copy has files outside the website content that are not committed, so publishing could ship them:');
          blocked.slice(0, 5).forEach(x => say('   ' + x.file));
          throw new Error('dirty');
        }
        run('Getting the latest site from GitHub', () => pullKeepingEdits(say));
        run('Building', () => execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }));
        run('Checking (verify gate)', () => execFileSync(process.execPath, [path.join(ROOT, 'verify.js')], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }));
        const changed = porcelain();
        if (!changed.length) { say('✓ Nothing changed. Everything is published already.'); return; }
        const msg = String(url.searchParams.get('msg') || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
        run('Saving a version', () => { git(['add', '-A']); return git(['commit', '-m', 'Site Studio: ' + (msg || 'content edits')]); });
        run('Pushing (the site updates in about a minute)', () => git(['push']));
        say('✓ PUBLISHED. GitHub Pages takes about a minute, then it is live.');
      } catch (e) {
        const m = String(e.message);
        if (m !== 'dirty') {
          const detail = (e.stdout || '') + (e.stderr || '');
          say('✗ ' + (detail.includes('FAIL') ? 'The verify gate failed:\n' + detail.split('\n').filter(l => /✗|FAIL/.test(l)).slice(0, 8).join('\n') : m.split('\n').slice(0, 6).join('\n')));
        }
        // A commit that never reached GitHub must not linger and ride along later,
        // and half-built pages must not block the next publish.
        try { if (git(['rev-parse', 'HEAD']) !== before && git(['status', '-sb']).includes('ahead')) git(['reset', '--mixed', before]); } catch (e2) {}
        resetBuildOutput();
        say('Nothing shipped. The live site is untouched.' + (e.stashed ? '' : ' Your edits are still saved here.'));
      } finally {
        publishing = false;
        res.end();
      }
      return;
    }

    // Throw away unpublished studio edits: content back to the last version, unpublished uploads removed.
    if (p === '/api/discard' && req.method === 'POST') {
      if (publishing) return json(res, 409, { error: 'A publish is running.' });
      try {
        git(['checkout', '--', 'content/', 'essays/']);
        git(['clean', '-fdq', '--', 'content/', 'img/uploads/']);
        resetBuildOutput();
        return json(res, 200, { discarded: true });
      } catch (e) { return json(res, 500, { error: String(e.message).slice(0, 200) }); }
    }

    if (p === '/api/revert' && req.method === 'POST') {
      return readBody(req, 1024, body => {
        let sha;
        try { sha = JSON.parse(body.toString('utf8')).sha; } catch (e) { return json(res, 400, { error: 'bad body' }); }
        if (!/^[a-f0-9]{7,40}$/.test(sha || '')) return json(res, 400, { error: 'bad sha' });
        if (publishing) return json(res, 409, { error: 'A publish is running. Try again when it finishes.' });
        if (porcelain().length) return json(res, 409, { error: 'You have unpublished edits. Publish or discard them before rolling back.' });
        const item = history().find(h => h.sha.startsWith(sha) || sha.startsWith(h.sha));
        if (!item) return json(res, 404, { error: 'That version is not in the recent publish history.' });
        if (!item.revertable) return json(res, 422, { error: item.why });
        publishing = true;
        const before = git(['rev-parse', 'HEAD']);
        try {
          pullKeepingEdits();
          git(['revert', '--no-commit', sha]);
          execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, timeout: 120000 });
          execFileSync(process.execPath, [path.join(ROOT, 'verify.js')], { cwd: ROOT, timeout: 120000 });
          git(['add', '-A']);
          git(['commit', '-m', 'Site Studio: roll back "' + item.msg.replace(/^Site Studio: /, '').slice(0, 80) + '" (' + item.sha + ')']);
          git(['push']);
          json(res, 200, { reverted: sha });
        } catch (e) {
          try { git(['revert', '--abort']); } catch (e2) {}
          try { git(['reset', '--hard', before]); } catch (e2) {}
          const detail = String((e.stdout || '') + (e.stderr || '') || e.message);
          json(res, 500, { error: 'Roll back failed, nothing shipped: ' + detail.split('\n').filter(Boolean).slice(0, 4).join(' ').slice(0, 300) });
        } finally { publishing = false; }
      });
    }

    // Static assets for previews. A built page links absolute paths (/css/post.css,
    // /img/...), which are not under /preview/<id>/. Assets only, by extension, and
    // never source or content directories.
    if (req.method === 'GET' && (/\.(css|svg|png|jpg|jpeg|webp|gif|ico|woff2|pdf)$/i.test(p) || /^\/js\/[\w.-]+\.js$/.test(p))
        && !/^\/(studio|content|essays)\//i.test(p)) {
      const asset = safeJoin(ROOT, decodeURIComponent(p));
      if (asset && fs.existsSync(asset)) return serveFile(res, asset);
    }

    send(res, 404, 'not found');
  } catch (e) {
    try { json(res, 500, { error: String(e.message).slice(0, 300) }); } catch (e2) {}
  }
});

fs.mkdirSync(PREVIEWS, { recursive: true });
server.listen(PORT, '127.0.0.1', () => console.log('Site Studio on http://127.0.0.1:' + PORT + '  (repo: ' + ROOT + ')'));
