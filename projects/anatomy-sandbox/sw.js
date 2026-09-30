/* Anatomy Sandbox service worker (card #421). tools/pwa_kit.py stamps VERSION, DATA and FILES; don't edit the copy in coding\site.
   page       network first (4 s), then the saved copy, so a deploy shows up on the next online open
   model data cache first, keyed by each file's hash, so only changed files download again after a deploy
   three.js + fonts (vendor/, pinned)   cache first   campus API (#392/#399): never cached, so offline fails closed */
const VERSION = "916b3b5b2c";
const DATA = "https://api.elvinpeters.com/anatomy-sandbox/";
const FILES = {"data/exercises.bin": "0b6238d5c4", "data/info.bin": "e750e6ab2c", "data/parts.json": "eae380addd", "data/rig.json": "402a5fb90c", "models/attachments.bin": "780370bccd", "models/attachments.skin": "fa7700f6b8", "models/bones.bin": "53ff782a45", "models/fascia.bin": "24a1c38ffc", "models/fascia.skin": "82e45a3dbb", "models/fat.bin": "15f0f96256", "models/fat.fat": "290fe316bb", "models/fat.fem": "54152884da", "models/fat.skin": "0b124b2916", "models/joints.bin": "c995017a20", "models/joints.skin": "54f4c3b3af", "models/lymph.bin": "67b1441db4", "models/lymph.skin": "4b8e221304", "models/muscles.bin": "c76ce26b8d", "models/muscles.skin": "9e8b31e6b1", "models/nerves.bin": "b438bf9c95", "models/nerves.skin": "73f903d271", "models/organs.bin": "5b3568896a", "models/organs.skin": "347e62f49f", "models/skin.bin": "7a64c5772e", "models/skin.fat": "cc11a744c2", "models/skin.fem": "68de551914", "models/skin.skin": "d93f5dc39b", "models/vessels.bin": "d77076a157", "models/vessels.skin": "8e33263589"};
const PAGE = 'as-page', STORE = 'as-data', LIB = 'as-lib';
const SCOPE = self.registration.scope;
const LIBS = ["./vendor/three/0.170.0/build/three.module.js", "./vendor/three/0.170.0/examples/jsm/controls/OrbitControls.js", "./vendor/three/0.170.0/examples/jsm/controls/TransformControls.js", "./vendor/three/0.170.0/examples/jsm/environments/RoomEnvironment.js", "vendor/fonts/IBMPlexMono-normal-latin--F63fjpt.woff2", "vendor/fonts/IBMPlexMono-normal-latin--F6qfjpt.woff2", "vendor/fonts/IBMPlexMono-normal-latin-ext--F63fjpt.woff2", "vendor/fonts/IBMPlexMono-normal-latin-ext--F6qfjpt.woff2", "vendor/fonts/IBMPlexSans-normal-latin-ext-zYXzKVEl.woff2", "vendor/fonts/IBMPlexSans-normal-latin-zYXzKVEl.woff2", "vendor/fonts/SourceSerif4-italic-latin-ext-vEFK2_tT.woff2", "vendor/fonts/SourceSerif4-italic-latin-vEFK2_tT.woff2", "vendor/fonts/fonts.css"].map((u) => new URL(u, SCOPE).href);  // vendor/ next to the page (#434)

const keyFor = (url) => {  // a model file's cache key carries its hash; null for anything else
  if (!url.startsWith(DATA)) return null;
  const f = url.slice(DATA.length).split('?')[0];
  return FILES[f] ? `${DATA}${f}?v=${FILES[f]}` : null;
};

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(PAGE).then((c) => c.add(new Request(SCOPE, { cache: 'reload' }))).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const want = new Set(Object.keys(FILES).map((f) => `${DATA}${f}?v=${FILES[f]}`));
    const c = await caches.open(STORE);
    for (const r of await c.keys()) if (!want.has(r.url)) await c.delete(r);
    await self.clients.claim();
  })());
});

async function fromStore(key) {
  const c = await caches.open(STORE);
  const hit = await c.match(key);
  if (hit) return hit;
  const res = await fetch(key, { mode: 'cors', cache: 'no-cache' });
  if (res.ok) await c.put(key, res.clone());
  return res;
}

async function cacheFirst(name, req) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') await c.put(req, res.clone());
  return res;
}

async function page(req) {
  const c = await caches.open(PAGE);
  const net = fetch(req).then((res) => { if (res.ok) c.put(SCOPE, res.clone()); return res; });
  const saved = await c.match(SCOPE);
  if (!saved) return net;
  const late = new Promise((ok) => setTimeout(() => ok(saved), 4000));  // slow school wifi: the saved page after 4 s
  return Promise.race([net.catch(() => saved), late]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Only the app page itself: /schools/* (#422) sits inside this scope and must never be served or saved as the app.
  const u = new URL(req.url);
  const isApp = u.origin + u.pathname === SCOPE || u.origin + u.pathname === SCOPE + 'index.html';
  if (req.mode === 'navigate' && isApp) return e.respondWith(page(req));
  const key = keyFor(req.url);
  if (key) return e.respondWith(fromStore(key));
  if (LIBS.includes(req.url)) return e.respondWith(cacheFirst(LIB, req));
});

// "save everything for offline": the page asks when it runs as an installed app or from a campus link (see pwa.js)
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'offline-all') return;
  const client = e.source;
  e.waitUntil((async () => {
    const names = Object.keys(FILES);
    let done = 0, bytes = 0;
    const tell = (msg) => client && client.postMessage(msg);
    for (const lib of LIBS) { try { await cacheFirst(LIB, new Request(lib, { mode: 'cors' })); } catch { /* next time */ } }
    for (const f of names) {
      try {
        const res = await fromStore(`${DATA}${f}?v=${FILES[f]}`);
        bytes += Number(res.headers.get('content-length')) || 0;
        if (res.ok) done++;
      } catch { /* offline: stays missing, the next open tries again */ }
      tell({ type: 'offline-progress', done, total: names.length, bytes });
    }
    tell({ type: 'offline-done', ok: done === names.length, version: VERSION });
  })());
});
