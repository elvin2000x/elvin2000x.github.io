#!/usr/bin/env node
/* The draft-leak test: proves a draft reaches git (and so the live site) only when
   that page is published, and nothing else rides along.

   Runs entirely in a temp folder: a bare repo stands in for GitHub, a clone of it is
   the server copy Site Studio runs in, and another clone plays "Claude pushing from
   the PC". The canaries are random per run, so no unpublished text is ever in this
   file or the repo. Touches nothing outside the temp folder.

   Run: node studio/test-drafts.js          (exit 0 = PASS)
        node studio/test-drafts.js --keep   (leave the temp folder for a look) */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const SRC = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-leak-'));
const REMOTE = path.join(TMP, 'github.git'), SRV = path.join(TMP, 'server'), PC = path.join(TMP, 'pc'), DATA = path.join(TMP, 'data');
const TEST_HOST = 'test.local';
const PORT = 20000 + crypto.randomInt(20000);
const canary = tag => 'CANARY' + tag + crypto.randomBytes(6).toString('hex');
const A = canary('A'), B = canary('B'), C = canary('C'), D = canary('D'), U = canary('U').toLowerCase();

let passed = 0, failed = 0;
function check(ok, what, detail) {
  if (ok) { passed++; console.log('  ✓ ' + what); }
  else { failed++; console.log('  ✗ ' + what + (detail ? '\n      ' + String(detail).slice(0, 300) : '')); }
}
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const remoteLog = () => git(REMOTE, 'log', '-p', '--all', '--binary');
const remoteHead = () => git(REMOTE, 'rev-parse', 'master');
function treeHas(dir, needle) {   // any file in a working tree (not .git) containing needle
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { const r = treeHas(f, needle); if (r) return r; }
    else if (fs.readFileSync(f).includes(needle)) return f;
  }
  return null;
}

function req(method, p, { body, headers, host } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, agent: false,
      headers: { 'X-Studio': '1', ...(host ? { Host: host } : {}), ...(method !== 'GET' ? { 'Content-Length': body ? Buffer.byteLength(body) : 0 } : {}), ...headers } }, res => {
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
async function startServer() {
  proc = spawn(process.execPath, [path.join(SRV, 'studio', 'server.js'), '--port', String(PORT)],
    { cwd: SRV, env: { ...process.env, STUDIO_BLOG_REPO: path.join(TMP, 'no-blog-here'), STUDIO_BLOG_DIR: '', STUDIO_DATA: DATA, STUDIO_TEST_HOST: TEST_HOST, STUDIO_PULL_MS: '3600000' }, stdio: ['ignore', 'pipe', 'pipe'] });
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

// Edit a page the way the editor does: GET for the version, PUT the whole file back.
async function editContent(name, fn, ifMatch) {
  const g = await req('GET', '/api/content/' + name);
  const data = JSON.parse(g.text);
  fn(data);
  const put = await req('PUT', '/api/content/' + name, { body: JSON.stringify(data), headers: { 'If-Match': ifMatch || g.headers.etag } });
  return { before: g.headers.etag, put, json: JSON.parse(put.text) };
}

async function main() {
  console.log('Temp folder: ' + TMP);
  console.log('\n1. Fake GitHub, server copy and PC clone');
  git(TMP, 'init', '--bare', '-q', '-b', 'master', REMOTE);
  git(TMP, 'clone', '-q', SRC, PC);
  git(PC, 'checkout', '-q', '-B', 'master');
  for (const f of fs.readdirSync(path.join(SRC, 'studio'))) fs.copyFileSync(path.join(SRC, 'studio', f), path.join(PC, 'studio', f));
  for (const d of [PC]) { git(d, 'config', 'user.name', 'Leak Test'); git(d, 'config', 'user.email', 'leak-test@example.invalid'); git(d, 'config', 'core.hooksPath', path.join(TMP, 'no-hooks')); }
  git(PC, 'add', '-A', '--', 'studio');
  try { git(PC, 'commit', '-q', '-m', 'leak test: current studio code'); } catch (e) { /* nothing new to commit */ }
  git(PC, 'remote', 'set-url', 'origin', REMOTE);
  git(PC, 'push', '-q', '-u', 'origin', 'master');
  git(TMP, 'clone', '-q', REMOTE, SRV);
  git(SRV, 'config', 'user.name', 'Site Studio'); git(SRV, 'config', 'user.email', 'studio@example.invalid');
  git(SRV, 'config', 'core.hooksPath', path.join(TMP, 'no-hooks'));
  check(![A, B, C, D, U].some(x => remoteLog().includes(x)), 'fake GitHub starts with none of this run\'s canaries');
  // A draft of the old .com blog file, as a store from before slice 5a holds it.
  const legacy = require(path.join(SRV, 'studio', 'store.js')).open(DATA);
  const oldEssays = fs.readFileSync(path.join(SRV, 'content', 'essays.json'));
  legacy.save('content/essays.json', Buffer.from(oldEssays.toString('utf8').replace('"dek": "', '"dek": "' + C + ' ')), 'p' + legacy.hash(oldEssays), oldEssays, 'elvin');
  legacy.close();
  await startServer();

  console.log('\n2. Drafts are saved privately');
  const a = await editContent('claude', d => { d.hero.headline = A; });
  check(a.put.status === 200 && a.json.draft === true && /^d\d+$/.test(a.json.version), 'claude page draft saved (' + a.json.version + ')', a.put.text);
  const b = await editContent('content-machine', d => { d.hero.headline = B; });
  check(b.put.status === 200 && b.json.draft === true, 'content-machine page draft saved', b.put.text);
  const staleTab = await editContent('claude', d => { d.hero.headline = 'old tab'; }, a.before);
  check(staleTab.put.status === 409, 'a save from a stale tab is refused (409)', staleTab.put.status);
  check(!treeHas(SRV, A) && !treeHas(SRV, B), 'server copy working tree has no draft text');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy is clean (git status)');
  const st = await getJSON('/api/state');
  check(st.repo.drafts.length === 2 && st.repo.changed.includes('content/claude.json'), 'state lists 2 drafts', JSON.stringify(st.repo.drafts));

  console.log('\n3. Preview and the test site show drafts, privately');
  const pv = JSON.parse((await req('POST', '/api/preview')).text);
  const pvPage = await req('GET', '/preview/' + pv.id + '/claude/');
  check(pvPage.status === 200 && pvPage.text.includes(A), 'preview of the claude page shows draft A', pvPage.status + ' ' + pvPage.text.slice(0, 120));
  const t = await req('POST', '/api/test');
  check(t.status === 200, 'Test build succeeds', t.text);
  const t1 = await req('GET', '/claude/', { host: TEST_HOST });
  const t2 = await req('GET', '/content-machine/', { host: TEST_HOST });
  check(t1.status === 200 && t1.text.includes(A), 'test site: claude page has draft A');
  check(t2.status === 200 && t2.text.includes(B), 'test site: content-machine page has draft B');
  check(/noindex/.test(t1.headers['x-robots-tag'] || ''), 'test site sends X-Robots-Tag noindex', t1.headers['x-robots-tag']);
  check(!/googletagmanager|fbq\(/.test(t1.text + t2.text), 'test site pages carry no analytics');
  const robots = await req('GET', '/robots.txt', { host: TEST_HOST });
  check(/Disallow: \/\s*$/.test(robots.text), 'test site robots.txt disallows everything', robots.text);
  const api = await req('GET', '/api/state', { host: TEST_HOST });
  check(api.status === 404 && !api.text.includes('"sections"'), 'test site does not expose the studio API', api.status);
  const post = await req('POST', '/api/publish', { host: TEST_HOST });
  check(post.status === 405, 'test site refuses POST (read only)', post.status);
  const ui = await req('GET', '/studio/ui.html', { host: TEST_HOST });
  check(ui.status === 404, 'test site does not serve the studio folder', ui.status);
  check(git(SRV, 'status', '--porcelain') === '' && ![A, B].some(x => remoteLog().includes(x)), 'still nothing in git after preview and test');

  console.log('\n4. Publish one page: only that page ships');
  let pub = await req('POST', '/api/publish?keys=content/claude.json&msg=leak%20test');
  check(/PUBLISHED/.test(pub.text), 'publish of the claude page succeeds', pub.text);
  let log = remoteLog();
  check(log.includes(A), 'fake GitHub now has A (the published page)');
  check(!log.includes(B), 'fake GitHub does NOT have B (the other draft)');
  const files = git(REMOTE, 'show', '--name-only', '--pretty=format:', 'master').split('\n').filter(Boolean);
  check(files.every(f => f === 'content/claude.json' || /\.html$|^sitemap\.xml$|^llms\.txt$/.test(f)), 'the commit holds claude.json plus generated pages only', files.join(', '));
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean after publish');
  const st2 = await getJSON('/api/state');
  check(st2.repo.drafts.map(d => d.key).join() === 'content/content-machine.json', 'only the content-machine draft is left', JSON.stringify(st2.repo.drafts));

  console.log('\n5. The blog lives on epeters.ca: the .com blog files are locked out (no blog copy here)');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await req('POST', '/api/upload?name=' + U, { body: png, headers: { 'Content-Type': 'image/png' } });
  const upJ = JSON.parse(up.text);
  check(up.status === 200 && upJ.src.startsWith('/img/uploads/'), 'image upload held (' + upJ.src + ')', up.text);
  const upName = upJ.src.split('/').pop();
  check(!fs.existsSync(path.join(SRV, 'img', 'uploads', upName)), 'the upload is not in the server copy');
  const lock = await req('POST', '/api/publish?keys=content/essays.json');
  check(lock.status === 400 && remoteHead() === git(SRV, 'rev-parse', 'HEAD'), 'publishing the .com essays.json is refused (400)', lock.status + ' ' + lock.text);
  const lockD = await req('GET', '/api/drafts?key=content/essays.json');
  check(lockD.status === 404, 'the old .com blog draft cannot be opened', lockD.status);
  const lockC = await req('GET', '/api/content/essays');
  check(lockC.status === 503 && /epeters\.ca/.test(lockC.text), 'Blog posts say plainly the epeters.ca copy is not set up (503)', lockC.status + ' ' + lockC.text);
  const lockP = await req('PUT', '/api/post-body/assembly-line', { body: 'x', headers: { 'If-Match': '"p0"' } });
  check(lockP.status === 503, 'a post body cannot be saved without the blog copy', lockP.status);
  const stL = await getJSON('/api/state');
  check(stL.blog && stL.blog.ready === false && !stL.repo.drafts.some(d => d.key === 'content/essays.json'), 'state: blog not ready, the old blog draft is not listed', JSON.stringify(stL.blog));
  const dis = JSON.parse((await req('POST', '/api/discard', { body: JSON.stringify({ keys: ['content/essays.json'] }) })).text);
  check(dis.discarded === 0, 'discard does not touch the old blog draft (it stays in the store)', JSON.stringify(dis));
  log = remoteLog();
  check(!log.includes(C) && !treeHas(SRV, C), 'the old blog draft never reaches git or the server copy');

  console.log('\n6. Live changed under a draft: publish refuses unless "mine wins"');
  git(PC, 'pull', '-q', '--ff-only');
  const cmFile = path.join(PC, 'content', 'content-machine.json');
  const cm = JSON.parse(fs.readFileSync(cmFile, 'utf8'));
  cm.hero.sub = (cm.hero.sub || '') + ' Upstream edit.';
  fs.writeFileSync(cmFile, JSON.stringify(cm, null, 2) + '\n');
  git(PC, 'commit', '-q', '-am', 'leak test: someone else edits content-machine');
  git(PC, 'push', '-q');
  const sync = await req('POST', '/api/sync');
  check(sync.status === 200, 'sync pulls the upstream change', sync.text);
  const st3 = await getJSON('/api/state');
  check((st3.repo.drafts.find(d => d.key === 'content/content-machine.json') || {}).stale === true, 'the content-machine draft is marked stale');
  const head = remoteHead();
  pub = await req('POST', '/api/publish?keys=content/content-machine.json');
  check(/changed on the live site/.test(pub.text) && remoteHead() === head, 'publish refuses the stale draft, nothing pushed', pub.text);
  check(!remoteLog().includes(B), 'B is still not in fake GitHub');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean after the refusal');

  console.log('\n7. Drafts survive a restart');
  await stopServer();
  await startServer();
  const dr = await getJSON('/api/drafts');
  const keys = dr.drafts.map(d => d.key).sort().join();
  check(keys === 'content/content-machine.json', 'the open draft is back after restart', keys);
  check(dr.uploads.some(u => u.name === upName), 'the held image is back after restart');
  const t3 = await req('GET', '/claude/', { host: TEST_HOST });
  check(t3.status === 200, 'the last Test build is still served after restart', t3.status);

  console.log('\n8. "Mine wins" publishes the stale draft on purpose');
  pub = await req('POST', '/api/publish?keys=content/content-machine.json&force=1');
  check(/PUBLISHED/.test(pub.text) && remoteLog().includes(B), 'force publish ships B', pub.text);
  check(!remoteLog().includes(C), 'C is still not in fake GitHub');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean at the end');
  console.log('\n9. Slice 3: presets stay in Studio, photos lose GPS, alt text is required, New page ships');
  const P = canary('P'), G = canary('G'), N = canary('N');
  const faq = (await getJSON('/api/library')).types.find(t => t.type === 'faq');
  const pre = await req('POST', '/api/presets', { body: JSON.stringify({ name: 'Leak preset', type: 'faq', data: { ...faq.blank, heading: P } }) });
  check(pre.status === 200, 'preset saved', pre.text);
  const lib = await getJSON('/api/library');
  check(lib.presets.some(p => p.data.heading === P), 'the library lists the preset');
  const badPre = await req('POST', '/api/presets', { body: JSON.stringify({ name: 'x', type: 'no-such-type', data: {} }) });
  check(badPre.status === 422, 'a preset of an unknown type is refused', badPre.status);

  // A JPEG carrying an Exif block with a GPS tag and a canary, plus a comment.
  const seg = (m, body) => { const b = Buffer.from(body); const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]),
    seg(0xe1, 'Exif\0\0GPSLatitude ' + G), seg(0xfe, 'comment ' + G),
    Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
    Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x00, 0xff, 0xd9])]);
  const gup = await req('POST', '/api/upload?name=gps-photo.jpg', { body: jpg, headers: { 'Content-Type': 'application/octet-stream' } });
  const gJ = JSON.parse(gup.text);
  check(gup.status === 200, 'a phone photo with GPS uploads (' + gJ.src + ')', gup.text);
  const gName = gJ.src.split('/').pop();
  const gBack = await req('GET', gJ.src);
  check(gBack.status === 200 && !gBack.text.includes(G) && !gBack.text.includes('GPSLatitude'), 'the held photo has no GPS or comment left', gBack.status);

  const slug = 'leak-' + N.toLowerCase().slice(-6);
  const reserved = await req('POST', '/api/pages', { body: JSON.stringify({ from: 'page-home', slug: 'books', title: 'x' }) });
  check(reserved.status === 422, 'New page refuses a reserved address (/books/)', reserved.status);
  const taken = await req('POST', '/api/pages', { body: JSON.stringify({ from: 'page-home', slug: 'claude', title: 'x' }) });
  check(taken.status === 422, 'New page refuses an address a hand-built page already uses (/claude/)', taken.status + ' ' + taken.text);
  const np = await req('POST', '/api/pages', { body: JSON.stringify({ from: 'page-home', slug, title: 'Leak page' }) });
  const npJ = JSON.parse(np.text);
  check(np.status === 200 && npJ.name === 'page-' + slug, 'New page made as a draft (' + npJ.url + ')', np.text);
  check(!fs.existsSync(path.join(SRV, slug)) && git(SRV, 'status', '--porcelain') === '', 'the new page is not in the server copy yet');
  const again = await req('POST', '/api/pages', { body: JSON.stringify({ from: 'page-home', slug, title: 'Leak page' }) });
  check(again.status === 409, 'the same address cannot be made twice', again.status);

  const noAlt = await editContent('page-' + slug, d => { const h = d.sections.find(s => s.data && 'image_alt' in s.data); h.data.image = gJ.src; h.data.image_alt = ''; });
  check(noAlt.put.status === 422 && /descri|alt/i.test(noAlt.put.text), 'a photo with no description is refused', noAlt.put.status + ' ' + noAlt.put.text);
  const withAlt = await editContent('page-' + slug, d => {
    const h = d.sections.find(s => s.data && 'image_alt' in s.data); h.data.image = gJ.src; h.data.image_alt = 'A test photo';
    d.sections[0].data.headline = N;
    d.sections.push({ id: 'faq-9', type: 'faq', data: lib.presets.find(p => p.data.heading === P).data });
    d.sections[d.sections.length - 1].data.heading = 'Questions';   // the preset's words stay out of git
  });
  check(withAlt.put.status === 200, 'the new page saves with the photo, its description and a preset section', withAlt.put.text);
  const pv2 = JSON.parse((await req('POST', '/api/preview')).text);
  const pvNew = await req('GET', '/preview/' + pv2.id + '/' + slug + '/');
  check(pvNew.status === 200 && pvNew.text.includes(N) && /<!-- ep:sec:/.test(pvNew.text), 'preview shows the new page with its tap-to-edit markers', pvNew.status);
  const t4 = await req('POST', '/api/test');
  const tNew = await req('GET', '/' + slug + '/', { host: TEST_HOST });
  check(t4.status === 200 && tNew.status === 200 && tNew.text.includes(N) && !/ep:sec/.test(tNew.text), 'test site has the new page, with no markers', tNew.status);
  check(/<meta name="robots" content="noindex, nofollow"/.test(tNew.text), 'the new page starts hidden from Google');

  pub = await req('POST', '/api/publish?keys=content/page-' + slug + '.json');
  check(/PUBLISHED/.test(pub.text), 'publishing the new page succeeds', pub.text);
  const nFiles = git(REMOTE, 'show', '--name-only', '--pretty=format:', 'master').split('\n').filter(Boolean);
  check(nFiles.includes('content/page-' + slug + '.json') && nFiles.includes(slug + '/index.html') && nFiles.includes('img/uploads/' + gName), 'the commit has the page, its built HTML and its photo', nFiles.join(', '));
  check(nFiles.every(f => f === 'content/page-' + slug + '.json' || f === 'img/uploads/' + gName || /\.html$|^sitemap\.xml$|^llms\.txt$/.test(f)), 'and nothing else', nFiles.join(', '));
  const built = fs.readFileSync(path.join(SRV, slug, 'index.html'), 'utf8');
  check(!/ep:sec/.test(built) && /noindex/.test(built) && built.includes('https://elvinpeters.com/' + slug + '/'), 'the live page has no markers, is noindex and has its own canonical');
  check(!fs.readFileSync(path.join(SRV, 'sitemap.xml'), 'utf8').includes('/' + slug + '/'), 'the hidden page is not in the sitemap');
  log = remoteLog();
  check(!log.includes(P) && !treeHas(SRV, P), 'the preset never reaches git or the server copy');
  check(!log.includes(G), 'the photo\'s GPS canary never reaches git');
  check(git(SRV, 'status', '--porcelain') === '', 'server copy clean after the new page ships');
  const home = await req('GET', '/api/state');
  check(home.status === 200, 'Studio still serves after the new page ships', home.status);
}

main().catch(e => { failed++; console.log('  ✗ crashed: ' + (e.stack || e)); })
  .then(stopServer)
  .then(() => {
    console.log('\n' + (failed ? 'FAIL' : 'PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
    if (!process.argv.includes('--keep') && !failed) fs.rmSync(TMP, { recursive: true, force: true });
    else console.log('Left for a look: ' + TMP);
    process.exit(failed ? 1 : 0);
  });
