#!/usr/bin/env node
/* Site Studio — the owned, zero-dependency admin for elvinpeters.com.
   Edit content/*.json in a browser (phone-first), preview the REAL build,
   publish = pull --rebase + build + verify + commit + push (Pages deploys).
   Git is the database, history, and rollback. No node_modules, ever.

   Run:   node studio/server.js --port 8796
   Binds 127.0.0.1 only. Auth is the reverse proxy's job (Caddy basic-auth
   in production; nothing on localhost). Serves no dotfiles, no .git. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'content', '_schema');
const PREVIEWS = path.join(__dirname, '.previews');
const PORT = (() => { const i = process.argv.indexOf('--port'); return i > -1 ? +process.argv[i + 1] : 8796; })();

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.xml': 'text/xml',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

let publishing = false; // one publish at a time, ever

function git(args, opts) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}
function schemas() {
  return fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'))
    .map(f => ({ name: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')) }));
}
function allowed(name) {
  return /^[a-z][a-z0-9-]{0,40}$/.test(name) && fs.existsSync(path.join(SCHEMA_DIR, name + '.json'));
}
function contentPath(name) { return path.join(ROOT, 'content', name + '.json'); }

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req, cap, cb) {
  let buf = '';
  req.on('data', c => { buf += c; if (buf.length > cap) { req.destroy(); } });
  req.on('end', () => cb(buf));
}
function safeJoin(base, reqPath) {
  const p = path.normalize(path.join(base, reqPath));
  if (!p.startsWith(base) || p.includes('.git') || path.basename(p).startsWith('.')) return null;
  return p;
}
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/' && req.method === 'GET') return serveFile(res, path.join(__dirname, 'ui.html'));

    if (p === '/api/state' && req.method === 'GET') {
      let repo = {};
      try {
        repo = {
          branch: git(['branch', '--show-current']),
          dirty: git(['status', '--porcelain', '--', 'content/']).split('\n').filter(Boolean),
          otherDirty: git(['status', '--porcelain']).split('\n').filter(l => l && !l.includes('content/') && !l.includes('studio/')).length,
          publishes: git(['log', '-6', '--pretty=%h|%ad|%s', '--date=format:%b %d %H:%M', '--', 'content/']).split('\n').filter(Boolean)
            .map(l => { const [h, d, ...s] = l.split('|'); return { sha: h, date: d, msg: s.join('|') }; }),
        };
      } catch (e) { repo.error = String(e.message).slice(0, 200); }
      return json(res, 200, { sections: schemas(), repo, publishing });
    }

    if (p.startsWith('/api/content/')) {
      const name = p.split('/')[3];
      if (!allowed(name)) return json(res, 404, { error: 'unknown section' });
      if (req.method === 'GET') return serveFile(res, contentPath(name));
      if (req.method === 'PUT') {
        return readBody(req, 256 * 1024, body => {
          let data;
          try { data = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'not valid JSON: ' + e.message }); }
          fs.writeFileSync(contentPath(name), JSON.stringify(data, null, 2) + '\n');
          json(res, 200, { saved: true });
        });
      }
    }

    if (p === '/api/preview' && req.method === 'POST') {
      const id = crypto.randomBytes(6).toString('hex');
      const out = path.join(PREVIEWS, id);
      fs.mkdirSync(out, { recursive: true });
      return execFile(process.execPath, [path.join(ROOT, 'build.js'), '--out', out], { cwd: ROOT }, (err, so, se) => {
        if (err) return json(res, 500, { error: 'build failed', detail: String(se || err.message).slice(0, 500) });
        // keep only the 5 newest previews
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
      if (!/^[a-f0-9]{12}$/.test(id)) { res.writeHead(404); return res.end(); }
      const built = safeJoin(path.join(PREVIEWS, id), rel);
      const fallback = safeJoin(ROOT, rel);
      if (built && fs.existsSync(built)) return serveFile(res, built);
      if (fallback && fs.existsSync(fallback)) return serveFile(res, fallback);
      res.writeHead(404); return res.end('not found');
    }

    if (p === '/api/publish' && req.method === 'POST') {
      if (publishing) return json(res, 409, { error: 'a publish is already running' });
      publishing = true;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
      const say = t => res.write(t + '\n');
      const run = (label, fn) => { say('▸ ' + label); const out = fn(); if (out) say(out.split('\n').slice(-4).join('\n')); };
      try {
        const dirtyOther = git(['status', '--porcelain']).split('\n')
          .filter(l => l && !/ (content\/|studio\/|index\.html|book\.html|writing\/)/.test(' ' + l.slice(3)));
        if (dirtyOther.length) { say('✗ Repo has unrelated uncommitted changes; publish refused:'); dirtyOther.slice(0, 5).forEach(l => say('   ' + l)); throw new Error('dirty'); }
        run('Pulling latest', () => { try { return git(['pull', '--rebase']); } catch (e) { git(['rebase', '--abort']); throw new Error('The site changed underneath you. Your text is saved locally; retry in a minute.'); } });
        run('Building', () => execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, encoding: 'utf8' }));
        run('Checking (verify gate)', () => execFileSync(process.execPath, [path.join(ROOT, 'verify.js')], { cwd: ROOT, encoding: 'utf8' }));
        const changed = git(['status', '--porcelain']).split('\n').filter(Boolean);
        if (!changed.length) { say('✓ Nothing changed. All published already.'); publishing = false; return res.end(); }
        run('Committing', () => { git(['add', '-A']); return git(['commit', '-m', 'content: edited via Site Studio']); });
        run('Pushing (site deploys in ~60s)', () => git(['push']));
        say('✓ PUBLISHED. Give GitHub Pages about a minute, then check the live site.');
      } catch (e) {
        if (String(e.message) !== 'dirty') say('✗ ' + String(e.message).split('\n').slice(0, 6).join('\n'));
        say('Nothing shipped. The site is untouched.');
      }
      publishing = false;
      return res.end();
    }

    if (p === '/api/revert' && req.method === 'POST') {
      return readBody(req, 1024, body => {
        let sha;
        try { sha = JSON.parse(body).sha; } catch (e) { return json(res, 400, { error: 'bad body' }); }
        if (!/^[a-f0-9]{7,40}$/.test(sha || '')) return json(res, 400, { error: 'bad sha' });
        try {
          git(['revert', '--no-edit', sha]);
          execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT });
          execFileSync(process.execPath, [path.join(ROOT, 'verify.js')], { cwd: ROOT });
          git(['add', '-A']);
          try { git(['commit', '-m', 'content: rebuild after revert (Site Studio)']); } catch (e) {}
          git(['push']);
          json(res, 200, { reverted: sha });
        } catch (e) {
          try { git(['revert', '--abort']); } catch (e2) {}
          json(res, 500, { error: 'revert failed: ' + String(e.message).slice(0, 300) });
        }
      });
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    try { json(res, 500, { error: String(e.message).slice(0, 300) }); } catch (e2) {}
  }
});

fs.mkdirSync(PREVIEWS, { recursive: true });
server.listen(PORT, '127.0.0.1', () => console.log('Site Studio on http://127.0.0.1:' + PORT + '  (repo: ' + ROOT + ')'));
