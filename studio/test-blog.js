#!/usr/bin/env node
/* The blog test (slice 5a): the Blog tab reads and writes epeters.ca, never the old
   blog files on elvinpeters.com.

   Runs entirely in a temp folder. Two bare repos stand in for GitHub (elvinpeters.com
   and epeters.ca); clones of them are the server copies Site Studio runs in. The
   epeters.ca side runs twice, once per blog folder layout, from real history:
     writing/  = 14ebe64 (before the move)      blog/ = ee80583 (the move, #367)
   The canaries are random per run. Touches nothing outside the temp folder: the
   epeters-ca repo on this PC is only read (git clone of committed history).

   Run: node studio/test-blog.js          (exit 0 = PASS)
        node studio/test-blog.js --keep   (leave the temp folder for a look)
   Env: EPETERS_CA=<path to an epeters-ca clone>   (default ../epeters-ca next to this repo) */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const SRC = path.resolve(__dirname, '..');
const CA_SRC = path.resolve(process.env.EPETERS_CA || path.join(SRC, '..', 'epeters-ca'));
const LAYOUTS = [{ dir: 'writing', ref: '14ebe64' }, { dir: 'blog', ref: 'ee80583' }];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-blog-'));
const COM_REMOTE = path.join(TMP, 'com.git'), COM_SRV = path.join(TMP, 'com-server'), COM_PC = path.join(TMP, 'com-pc');
const NO_HOOKS = path.join(TMP, 'no-hooks');
const PORT = 20000 + crypto.randomInt(20000);
const canary = tag => 'CANARY' + tag + crypto.randomBytes(6).toString('hex');

let passed = 0, failed = 0;
function check(ok, what, detail) {
  if (ok) { passed++; console.log('  ✓ ' + what); }
  else { failed++; console.log('  ✗ ' + what + (detail ? '\n      ' + String(detail).slice(0, 400) : '')); }
}
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ident = (d, name) => { git(d, 'config', 'user.name', name); git(d, 'config', 'user.email', 'blog-test@example.invalid'); git(d, 'config', 'core.hooksPath', NO_HOOKS); };
function treeHas(dir, needle) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { const r = treeHas(f, needle); if (r) return r; }
    else if (fs.readFileSync(f).includes(needle)) return f;
  }
  return null;
}

function req(method, p, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, agent: false,
      headers: { 'X-Studio': '1', ...(method !== 'GET' ? { 'Content-Length': body ? Buffer.byteLength(body) : 0 } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.setTimeout(300000, () => r.destroy(new Error('timeout ' + p)));
    if (body) r.write(body);
    r.end();
  });
}
const getJSON = async p => JSON.parse((await req('GET', p)).text);

let proc = null;
async function startServer(env) {
  proc = spawn(process.execPath, [path.join(COM_SRV, 'studio', 'server.js'), '--port', String(PORT)],
    { cwd: COM_SRV, env: { ...process.env, STUDIO_BLOG_DIR: '', STUDIO_TEST_HOST: 'test.local', STUDIO_PULL_MS: '3600000', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const keep = c => { log += c; fs.appendFileSync(path.join(TMP, 'server.log'), c); };
  proc.stdout.on('data', keep);
  proc.stderr.on('data', keep);
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (log.includes('Site Studio on')) return;
    if (proc.exitCode !== null) throw new Error('server died: ' + log);
  }
  throw new Error('server did not start: ' + log);
}
function stopServer() { return new Promise(r => { if (!proc || proc.exitCode !== null) return r(); proc.on('exit', () => r()); proc.kill(); }); }

const postsOf = d => (Array.isArray(d) ? d : d.posts) || [];
async function editPosts(fn) {
  const g = await req('GET', '/api/content/essays');
  const data = JSON.parse(g.text);
  fn(postsOf(data), data);
  const put = await req('PUT', '/api/content/essays', { body: JSON.stringify(data), headers: { 'If-Match': g.headers.etag } });
  return { get: g, put };
}
async function editBody(slug, fn) {
  const g = JSON.parse((await req('GET', '/api/post-body/' + slug)).text);
  const put = await req('PUT', '/api/post-body/' + slug, { body: fn(g.html), headers: { 'If-Match': '"' + g.version + '"' } });
  return { before: g, put };
}
const publishLines = t => t.split('\n').filter(Boolean).slice(-6).join(' | ');

function setupCom() {
  git(TMP, 'init', '--bare', '-q', '-b', 'master', COM_REMOTE);
  git(TMP, 'clone', '-q', SRC, COM_PC);
  git(COM_PC, 'checkout', '-q', '-B', 'master');
  for (const f of fs.readdirSync(path.join(SRC, 'studio'))) fs.copyFileSync(path.join(SRC, 'studio', f), path.join(COM_PC, 'studio', f));
  ident(COM_PC, 'Blog Test');
  git(COM_PC, 'add', '-A', '--', 'studio');
  try { git(COM_PC, 'commit', '-q', '-m', 'blog test: current studio code'); } catch (e) { /* nothing new */ }
  git(COM_PC, 'remote', 'set-url', 'origin', COM_REMOTE);
  git(COM_PC, 'push', '-q', '-u', 'origin', 'master');
  git(TMP, 'clone', '-q', COM_REMOTE, COM_SRV);
  ident(COM_SRV, 'Site Studio');
}

async function layout(L) {
  const T = path.join(TMP, L.dir);
  const REMOTE = path.join(T, 'ca.git'), SRV = path.join(T, 'ca-server'), PC = path.join(T, 'ca-pc'), DATA = path.join(T, 'data');
  fs.mkdirSync(T, { recursive: true });
  const D = canary('D'), C = canary('C'), H = canary('H'), H2 = canary('H2'), H3 = canary('H3'), U = canary('U').toLowerCase(), OLD = canary('OLD');
  const remoteLog = () => git(REMOTE, 'log', '-p', '--all', '--binary');
  const remoteHead = () => git(REMOTE, 'rev-parse', 'master');
  const comHead = git(COM_REMOTE, 'rev-parse', 'master');
  const comEssays = git(COM_REMOTE, 'show', 'master:content/essays.json');

  console.log('\n=== Layout ' + L.dir + '/ (epeters-ca ' + L.ref + ') ===');
  console.log('1. Fake epeters.ca GitHub and server copy');
  git(T, 'init', '--bare', '-q', '-b', 'master', REMOTE);
  git(T, 'clone', '-q', '--no-checkout', CA_SRC, PC);
  git(PC, 'checkout', '-q', '-B', 'master', L.ref);
  ident(PC, 'Blog Test');
  git(PC, 'remote', 'set-url', 'origin', REMOTE);
  git(PC, 'push', '-q', '-u', 'origin', 'master');
  git(T, 'clone', '-q', REMOTE, SRV);
  ident(SRV, 'Site Studio');
  check(fs.existsSync(path.join(SRV, L.dir, 'index.html')), 'the ' + L.dir + '/ layout is what this commit has');

  // A draft of the old .com blog file, as a store from before slice 5a holds it.
  const legacy = require(path.join(COM_SRV, 'studio', 'store.js')).open(DATA);
  const oldEssays = fs.readFileSync(path.join(COM_SRV, 'content', 'essays.json'));
  legacy.save('content/essays.json', Buffer.from(oldEssays.toString('utf8').replace('"dek": "', '"dek": "' + OLD + ' ')), 'p' + legacy.hash(oldEssays), oldEssays, 'elvin');
  legacy.close();
  await startServer({ STUDIO_DATA: DATA, STUDIO_BLOG_REPO: SRV });

  console.log('2. The Blog tab points at epeters.ca, and follows its blog folder');
  const st = await getJSON('/api/state');
  check(st.blog && st.blog.ready === true && st.blog.dir === L.dir, 'state: blog ready, folder ' + L.dir, JSON.stringify(st.blog));
  check(!st.repo.drafts.some(d => d.key === 'content/essays.json'), 'the old .com blog draft is not listed');
  const lock = await req('POST', '/api/publish?keys=content/essays.json');
  check(lock.status === 400 && remoteHead() === git(SRV, 'rev-parse', 'HEAD'), 'publishing the .com essays.json is refused (400)', lock.status + ' ' + lock.text);
  const lockD = await req('GET', '/api/drafts?key=content/essays.json');
  check(lockD.status === 404, 'the old .com blog draft cannot be opened', lockD.status);
  const g0 = await req('GET', '/api/content/essays');
  const posts0 = postsOf(JSON.parse(g0.text));
  const caPosts = postsOf(JSON.parse(fs.readFileSync(path.join(SRV, 'content', 'essays.json'), 'utf8')));
  check(g0.status === 200 && posts0.length === caPosts.length && !g0.text.includes(OLD), 'Blog posts come from the epeters.ca copy (' + posts0.length + ' posts)', g0.status);
  const filePost = posts0.find(p => p.file && !p.draft);
  const plainPost = posts0.find(p => !p.file && !p.draft) || posts0.find(p => !p.draft);
  check(!!filePost && !!plainPost, 'found a hand-coded post (' + (filePost && filePost.slug) + ') and a post to edit (' + (plainPost && plainPost.slug) + ')');

  console.log('3. Edit: a post, a new Draft-ticked post with an image, a hand-coded body');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = JSON.parse((await req('POST', '/api/upload?name=' + U, { body: png, headers: { 'Content-Type': 'image/png' } })).text);
  const upName = String(up.src || '').split('/').pop();
  check(up.src === '/img/uploads/' + upName && !fs.existsSync(path.join(SRV, 'img', 'uploads', upName)), 'image held in the store, not in the copy (' + up.src + ')');
  const draftSlug = 'blog-test-' + C.toLowerCase().slice(-8);
  const e1 = await editPosts(posts => {
    posts.find(p => p.slug === plainPost.slug).dek = 'Edited ' + D;
    posts.unshift({ slug: draftSlug, title: 'Blog test ' + C, dek: 'Private ' + C, date: plainPost.date, image: plainPost.image, og: plainPost.og,
      body_format: 'markdown', body: 'Private words ' + C + '\n\n![A test image](/img/uploads/' + upName + ')\n', draft: true });
  });
  check(e1.put.status === 200 && JSON.parse(e1.put.text).draft === true, 'blog posts draft saved (live edit D, Draft-ticked post C)', e1.put.text);
  const b1 = await editBody(filePost.slug, html => html.replace(/<p>/, '<p>' + H + ' '));
  check(b1.put.status === 200 && JSON.parse(b1.put.text).draft === true, 'hand-coded body draft saved (H)', b1.put.text);
  const drafts1 = (await getJSON('/api/state')).repo.drafts.map(d => d.key).sort().join();
  check(drafts1 === ['ca:content/essays.json', 'ca:' + filePost.file].sort().join(), 'the drafts are keyed to epeters.ca', drafts1);
  check(!treeHas(SRV, D) && !treeHas(SRV, H) && !treeHas(COM_SRV, H) && git(SRV, 'status', '--porcelain') === '', 'neither server copy has any draft text');

  console.log('4. Quick preview and the full Test');
  const pp = await req('POST', '/api/post-page', { body: JSON.stringify({ ...filePost }) });
  check(pp.status === 200 && pp.text.includes(H) && /(href|src)="\/ca\//.test(pp.text) && !/(href|src)="\/(css|img)\//.test(pp.text), 'post page uses epeters.ca\'s template and loads its files from /ca/', pp.status + ' ' + pp.text.slice(0, 200));
  check(!/googletagmanager|gtag\(|fbq\(/.test(pp.text), 'post page carries no analytics');
  const cssPath = (/href="(\/ca\/[^"]+\.css)"/.exec(pp.text) || [])[1];
  const css = cssPath && await req('GET', cssPath);
  check(css && css.status === 200, 'its stylesheet loads from the epeters.ca copy (' + cssPath + ')', css && css.status);
  const leak = await Promise.all(['/ca/content/essays.json', '/ca/build.js', '/ca/.git/config', '/ca/essays/' + path.basename(filePost.file)].map(p => req('GET', p)));
  check(leak.every(r => r.status === 404), '/ca/ serves no source, content or git files', leak.map(r => r.status).join(','));
  const t = await req('POST', '/api/blog-test');
  const tj = JSON.parse(t.text);
  check(t.status === 200 && tj.dir === L.dir && Array.isArray(tj.gate) && tj.gate.length === 0, 'Test builds the real epeters.ca with the drafts (folder ' + tj.dir + ', gate clean)', t.text);
  const base = '/preview/' + tj.id + '/' + L.dir + '/';
  const tp = await req('GET', base + filePost.slug + '/');
  check(tp.status === 200 && tp.text.includes(H) && !/googletagmanager|gtag\(|fbq\(/.test(tp.text), 'Test page of the hand-coded post has H and no analytics', tp.status);
  const assets = [...tp.text.matchAll(/(?:href|src)="(\/preview\/[a-f0-9]{12}\/[^"#?]+\.(?:css|js|png|jpg|svg|webp|ico))"/g)].map(m => m[1]).slice(0, 6);
  const ar = await Promise.all(assets.map(a => req('GET', a)));
  check(assets.length > 0 && ar.every(r => r.status === 200), 'its css, scripts and images load inside the Test (' + assets.length + ')', assets.map((a, i) => ar[i].status + ' ' + a).join(', '));
  check(!/(href|src)="\/(css|img|js)\//.test(tp.text), 'no root path escapes to elvinpeters.com files');
  const td = await req('GET', base + draftSlug + '/');
  check(td.status === 200 && td.text.includes(C) && td.text.includes('uploads/' + upName), 'the Draft-ticked post shows in the Test, with its image', td.status);
  const img = await req('GET', '/preview/' + tj.id + '/img/uploads/' + upName);
  check(img.status === 200, 'the held image loads inside the Test', img.status);
  const noSlash = await req('GET', base + filePost.slug);
  check(noSlash.status === 302 && noSlash.headers.location === base + filePost.slug + '/', 'an address without the slash goes to the folder', noSlash.status + ' ' + noSlash.headers.location);
  check(git(SRV, 'status', '--porcelain') === '' && !remoteLog().includes(H) && !remoteLog().includes(D), 'still nothing in git after preview and Test');

  console.log('5. A failing gate ships nothing and keeps the draft');
  const head0 = remoteHead();
  const bad = await editBody(filePost.slug, html => html.replace(H, H + ' dash — here'));
  check(bad.put.status === 200, 'a body with an em dash saves as a draft');
  let pub = await req('POST', '/api/publish?keys=' + encodeURIComponent('ca:' + filePost.file));
  check(/Nothing shipped/.test(pub.text) && !/PUBLISHED/.test(pub.text) && remoteHead() === head0, 'publish stops at the gate, nothing pushed', publishLines(pub.text));
  check(git(SRV, 'status', '--porcelain') === '' && git(SRV, 'rev-parse', 'HEAD') === head0, 'server copy back to where it started');
  check(/broken|dash|—|FAIL|✗/.test(pub.text.split('verify gate failed')[1] || ''), 'the publish log says what the gate found', publishLines(pub.text));
  const kept = await req('GET', '/api/post-body/' + filePost.slug);
  check(kept.status === 200 && JSON.parse(kept.text).html.includes('—'), 'the draft is still in the store', kept.status + ' ' + kept.text.slice(0, 120));
  const fix = await editBody(filePost.slug, html => html.replace(' dash — here', ''));
  check(fix.put.status === 200, 'the dash is taken out again');

  console.log('6. Publish: only the named files ship, Draft-ticked posts stay private');
  pub = await req('POST', '/api/publish?keys=' + encodeURIComponent('ca:content/essays.json,ca:' + filePost.file) + '&msg=blog%20test');
  check(/PUBLISHED/.test(pub.text) && /epeters\.ca/.test(pub.text), 'publish to epeters.ca succeeds', publishLines(pub.text));
  let log = remoteLog();
  check(log.includes(D) && log.includes(H), 'fake epeters.ca GitHub has D and H');
  check(!log.includes(C) && !log.includes(upName), 'it does NOT have the Draft-ticked post C or its image');
  const files = git(REMOTE, 'show', '--name-only', '--pretty=format:', 'master').split('\n').filter(Boolean);
  check(files.includes('content/essays.json') && files.includes(filePost.file) && files.includes(L.dir + '/' + filePost.slug + '/index.html'), 'the commit has essays.json, the body and the built ' + L.dir + '/ page', files.join(', '));
  check(files.every(f => f === 'content/essays.json' || f === filePost.file || /\.html$|^sitemap\.xml$|^robots\.txt$/.test(f)), 'and only generated pages besides', files.join(', '));
  check(git(SRV, 'status', '--porcelain') === '' && !treeHas(SRV, C), 'server copy clean, no C in it');
  const after = await req('GET', '/api/content/essays');
  check(after.text.includes(C) && /^"d\d+"$/.test(after.headers.etag), 'the Draft-ticked post is still in the private draft', after.headers.etag);
  check(git(COM_REMOTE, 'rev-parse', 'master') === comHead, 'elvinpeters.com GitHub untouched');

  console.log('7. GitHub turns the push away once: rebuild on the latest copy and retry');
  fs.appendFileSync(path.join(PC, 'CLAUDE.md'), '\nblog test: someone else pushed first\n');
  git(PC, 'pull', '-q', '--ff-only');
  git(PC, 'commit', '-q', '-am', 'blog test: someone else pushes first');
  git(PC, 'push', '-q', 'origin', 'HEAD:refs/heads/ahead');
  const hook = path.join(REMOTE, 'hooks', 'pre-receive'), flag = path.join(T, 'rejected-once').replace(/\\/g, '/');
  fs.writeFileSync(hook, '#!/bin/sh\nif [ ! -f "' + flag + '" ]; then\n  touch "' + flag + '"\n  unset GIT_QUARANTINE_PATH\n  git update-ref refs/heads/master refs/heads/ahead\n  echo "rejected: fetch first" >&2\n  exit 1\nfi\nexit 0\n', { mode: 0o755 });
  const b2 = await editBody(filePost.slug, html => html.replace(H, H2));
  check(b2.put.status === 200, 'a new body draft (H2)');
  pub = await req('POST', '/api/publish?keys=' + encodeURIComponent('ca:' + filePost.file));
  check(/turned the push away/.test(pub.text) && /PUBLISHED/.test(pub.text), 'the first push is turned away, the retry publishes', publishLines(pub.text));
  let ok = false; try { git(REMOTE, 'merge-base', '--is-ancestor', 'ahead', 'master'); ok = true; } catch (e) {}
  check(ok && git(REMOTE, 'show', 'master:' + filePost.file).includes(H2), 'the retry sits on top of the other push and has H2');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean after the retry');

  console.log('8. Turned away twice: stop, ship nothing, keep the draft');
  fs.writeFileSync(hook, '#!/bin/sh\necho "rejected: always" >&2\nexit 1\n', { mode: 0o755 });
  const head1 = remoteHead();
  const b3 = await editBody(filePost.slug, html => html.replace(H2, H3));
  check(b3.put.status === 200, 'a new body draft (H3)');
  pub = await req('POST', '/api/publish?keys=' + encodeURIComponent('ca:' + filePost.file));
  check(/Nothing shipped/.test(pub.text) && !/PUBLISHED/.test(pub.text) && remoteHead() === head1, 'the second refusal stops it, nothing pushed', publishLines(pub.text));
  check(git(SRV, 'status', '--porcelain') === '' && git(SRV, 'rev-parse', 'HEAD') === head1, 'server copy back on GitHub\'s commit');
  const kept3 = await req('GET', '/api/post-body/' + filePost.slug);
  check(kept3.text.includes(H3), 'the H3 draft is still saved');
  fs.rmSync(hook);
  await req('POST', '/api/discard', { body: JSON.stringify({ keys: ['ca:' + filePost.file] }) });

  console.log('9. History, Put this back, Roll back: all on epeters.ca');
  const ph = await getJSON('/api/post-history/' + filePost.slug);
  const v = (ph.versions || []).find(x => /blog test|Site Studio/.test(x.msg));
  check(v && ph.versions.length >= 2, 'the post\'s past versions come from epeters.ca (' + (ph.versions || []).length + ')', JSON.stringify(ph).slice(0, 200));
  const old = v && JSON.parse((await req('GET', '/api/post-version/' + filePost.slug + '?sha=' + ph.versions[ph.versions.length - 1].sha)).text);
  check(old && typeof old.html === 'string' && !old.html.includes(H), 'an older version reads back without the new text');
  const hist = await getJSON('/api/history?site=blog');
  check(hist.site === 'ca' && hist.dir === L.dir && hist.history[0] && /Site Studio/.test(hist.history[0].msg) && hist.history[0].revertable, 'publish history lists epeters.ca commits', JSON.stringify(hist.history.slice(0, 2)));
  const rb = await req('POST', '/api/revert', { body: JSON.stringify({ sha: hist.history[0].sha, site: 'blog' }) });
  check(rb.status === 200 && JSON.parse(rb.text).site === 'ca', 'roll back on epeters.ca succeeds', rb.text);
  const rolled = git(REMOTE, 'show', 'master:' + filePost.file);
  check(/roll back/.test(git(REMOTE, 'log', '-1', '--pretty=%s', 'master')) && !rolled.includes(H2) && rolled.includes(H), 'the live body is back to H');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean after the roll back');
  const comHist = await getJSON('/api/history');
  check(comHist.site === 'com', 'plain history is still elvinpeters.com');

  console.log('10. elvinpeters.com never changed');
  check(git(COM_REMOTE, 'rev-parse', 'master') === comHead && git(COM_REMOTE, 'show', 'master:content/essays.json') === comEssays, 'the .com GitHub and its essays.json are exactly as they started');
  check(git(COM_SRV, 'status', '--porcelain') === '', 'the .com server copy is clean');
  check(!git(COM_REMOTE, 'log', '-p', '--all').includes(OLD), 'the old .com blog draft never reached git');
  await stopServer();
}

async function main() {
  console.log('Temp folder: ' + TMP);
  if (!fs.existsSync(path.join(CA_SRC, '.git'))) throw new Error('no epeters-ca clone at ' + CA_SRC + ' (set EPETERS_CA)');
  setupCom();
  for (const L of LAYOUTS) await layout(L);
}

main().catch(e => { failed++; console.log('  ✗ crashed: ' + (e.stack || e)); })
  .then(stopServer)
  .then(() => {
    console.log('\n' + (failed ? 'FAIL' : 'PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
    if (!process.argv.includes('--keep') && !failed) fs.rmSync(TMP, { recursive: true, force: true });
    else console.log('Left for a look: ' + TMP);
    process.exit(failed ? 1 : 0);
  });
