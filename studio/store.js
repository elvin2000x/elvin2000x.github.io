/* Site Studio draft store: private drafts, their revisions and unpublished uploads,
   in one SQLite file OUTSIDE the site repo (the repo is public, and Pages serves
   every committed file). Git only ever sees what is published.

   A draft is keyed by the repo path it replaces: content/<name>.json or
   essays/<slug>.html. It holds the whole file. Every save takes a number from one
   global counter, so a stale tab can never match a newer save (even after a draft
   was published or discarded and a new one started). `base` is the hash of the
   live file the draft started from; publish refuses when the live file has moved
   on since, unless you say "mine wins".

   node:sqlite is built into Node 22.13+; no npm packages. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Silence the one-line "SQLite is experimental" warning in the service log.
const emit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w && w.message || w).includes('SQLite') ? undefined : emit.call(process, w, ...a));
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emit;

const KEEP_EVERY_MS = 5 * 60 * 1000;   // a revision is kept at least every 5 minutes of editing

function dataDir() {
  if (process.env.STUDIO_DATA) return path.resolve(process.env.STUDIO_DATA);
  if (fs.existsSync('/var/lib/sitestudio')) return '/var/lib/sitestudio';
  return path.join(os.homedir(), '.sitestudio');
}
function hash(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16); }
function now() { return new Date().toISOString(); }

function open(dir) {
  dir = dir || dataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'studio.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL);
    INSERT OR IGNORE INTO counter (id, n) VALUES (1, 0);
    CREATE TABLE IF NOT EXISTS drafts (
      key TEXT PRIMARY KEY, data BLOB NOT NULL, rev INTEGER NOT NULL, base TEXT NOT NULL,
      created TEXT NOT NULL, updated TEXT NOT NULL, author TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, rev INTEGER NOT NULL, kind TEXT NOT NULL,
      data BLOB, at TEXT NOT NULL, author TEXT NOT NULL, note TEXT);
    CREATE INDEX IF NOT EXISTS revisions_key ON revisions (key, id);
    CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, data BLOB NOT NULL, at TEXT NOT NULL);
    -- Presets (slice 3): a filled-in section kept as a reusable template in the
    -- library. Studio-only; a preset reaches the site only as a section on a page.
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      data TEXT NOT NULL, at TEXT NOT NULL, author TEXT NOT NULL);
  `);
  const q = {
    next: db.prepare('UPDATE counter SET n = n + 1 WHERE id = 1 RETURNING n'),
    get: db.prepare('SELECT key, data, rev, base, created, updated, author FROM drafts WHERE key = ?'),
    list: db.prepare('SELECT key, rev, base, created, updated, author, length(data) AS bytes FROM drafts ORDER BY updated DESC'),
    insert: db.prepare('INSERT INTO drafts (key, data, rev, base, created, updated, author) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE drafts SET data = ?, rev = ?, updated = ?, author = ? WHERE key = ?'),
    rebase: db.prepare('UPDATE drafts SET base = ? WHERE key = ?'),
    del: db.prepare('DELETE FROM drafts WHERE key = ?'),
    lastRev: db.prepare('SELECT id, at, author, kind FROM revisions WHERE key = ? ORDER BY id DESC LIMIT 1'),
    addRev: db.prepare('INSERT INTO revisions (key, rev, kind, data, at, author, note) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    fold: db.prepare('UPDATE revisions SET rev = ?, data = ?, at = ? WHERE id = ?'),
    revs: db.prepare('SELECT id, rev, kind, at, author, note, length(data) AS bytes FROM revisions WHERE key = ? ORDER BY id DESC LIMIT ?'),
    revData: db.prepare('SELECT key, rev, kind, data, at, author FROM revisions WHERE id = ?'),
    upPut: db.prepare('INSERT OR REPLACE INTO uploads (name, data, at) VALUES (?, ?, ?)'),
    upGet: db.prepare('SELECT data FROM uploads WHERE name = ?'),
    upHas: db.prepare('SELECT 1 AS x FROM uploads WHERE name = ?'),
    upList: db.prepare('SELECT name, length(data) AS bytes, at FROM uploads ORDER BY at'),
    upDel: db.prepare('DELETE FROM uploads WHERE name = ?'),
    preList: db.prepare('SELECT id, name, type, data, at, author FROM presets ORDER BY name COLLATE NOCASE, id'),
    preAdd: db.prepare('INSERT INTO presets (name, type, data, at, author) VALUES (?, ?, ?, ?, ?) RETURNING id'),
    preDel: db.prepare('DELETE FROM presets WHERE id = ?'),
  };
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const buf = x => Buffer.from(x);

  return {
    dir,
    hash,
    /* One draft, or null. data comes back as a Buffer. */
    get(key) { const r = q.get.get(key); return r ? { ...r, data: buf(r.data) } : null; },
    list() { return q.list.all().map(r => ({ ...r })); },
    /* Save a whole file as the draft of `key`.
       expect: the version the editor started from: 'd<rev>' for a draft,
       'p<hash>' for the live file. liveBuf: the live file now (null if none).
       Returns { version, rev } or throws { stale: true }. Saving the live bytes
       back ends the draft (nothing left to publish). */
    save(key, data, expect, liveBuf, author) {
      author = author || 'elvin';
      return tx(() => {
        const cur = q.get.get(key);
        const liveV = 'p' + hash(liveBuf || Buffer.alloc(0));
        const have = cur ? 'd' + cur.rev : liveV;
        if (expect !== have) { const e = new Error('stale'); e.stale = true; e.have = have; throw e; }
        if (liveBuf && data.equals(liveBuf)) {
          if (cur) { q.del.run(key); q.addRev.run(key, cur.rev, 'back-to-live', null, now(), author, null); }
          return { version: liveV, rev: 0, live: true };
        }
        const rev = q.next.get().n, t = now();
        if (cur) q.update.run(data, rev, t, author, key);
        else q.insert.run(key, data, rev, liveBuf ? hash(liveBuf) : 'new', t, t, author);
        const last = q.lastRev.get(key);
        if (last && last.kind === 'save' && last.author === author && Date.now() - Date.parse(last.at) < KEEP_EVERY_MS)
          q.fold.run(rev, data, t, last.id);
        else q.addRev.run(key, rev, 'save', data, t, author, null);
        return { version: 'd' + rev, rev };
      });
    },
    /* Take the live file as the new base (after "mine wins", or a publish that kept part of the draft). */
    rebase(key, liveBuf) { q.rebase.run(liveBuf ? hash(liveBuf) : 'new', key); },
    /* End a draft: published or discarded. Only if nobody saved since `rev` (0 = any). */
    end(key, kind, rev, author, note) {
      return tx(() => {
        const cur = q.get.get(key);
        if (!cur) return false;
        if (rev && cur.rev !== rev) return false;
        q.del.run(key);
        q.addRev.run(key, cur.rev, kind, cur.data, now(), author || 'elvin', note || null);
        return true;
      });
    },
    revisions(key, limit) { return q.revs.all(key, limit || 50).map(r => ({ ...r })); },
    revision(id) { const r = q.revData.get(id); return r ? { ...r, data: r.data ? buf(r.data) : null } : null; },
    putUpload(name, data) { q.upPut.run(name, data, now()); },
    getUpload(name) { const r = q.upGet.get(name); return r ? buf(r.data) : null; },
    hasUpload(name) { return !!q.upHas.get(name); },
    uploads() { return q.upList.all().map(r => ({ ...r })); },
    dropUpload(name) { q.upDel.run(name); },
    presets() { return q.preList.all().map(r => ({ ...r, data: JSON.parse(r.data) })); },
    addPreset(name, type, data, author) { return q.preAdd.get(name, type, JSON.stringify(data), now(), author || 'elvin').id; },
    dropPreset(id) { return q.preDel.run(id).changes > 0; },
    close() { db.close(); },
  };
}

module.exports = { open, dataDir, hash };
