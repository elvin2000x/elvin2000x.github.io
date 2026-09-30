/* Lead magnet pages (/free/*), edited as fields (#464, 2026-09-29).

   The 19 /free/ pages are hand-built HTML. Each one's words live in
   content/free/<slug>.json; the page file itself is the FRAME: its head, pixels,
   styles, menu (scripts/menu-swap.js owns that) and its gated-delivery script stay
   exactly as they are. build.js fills the SLOTS below from the JSON, so an edit in
   Site Studio changes the words and nothing else.

   Values are inserted as-is, like sections.js: the copy carries entities and
   inline tags exactly as the live page ships them, so the round trip is byte for
   byte (node scripts/free-convert.js --check proves it for every page).
   A slot a page doesn't have is simply not in its JSON. Tracking ids (GADS, XEVT)
   and the scripts are never a slot.

   Share fields (og:*) follow the page title and description unless the JSON
   carries its own share_title / share_description / share_image. */
'use strict';
const fs = require('fs'), path = require('path');

const SITE = 'https://elvinpeters.com';
const SUFFIX = ' | Elvin Peters';
const NAME_TOKEN = '{name}', NAME_SPAN = '<span id="dn"></span>';

// key: JSON field. re: (before)(value)(after), must match at most once in a page.
// Values never span another tag of the same kind (lazy match to the first close).
const SLOTS = [
  { key: 'title', re: /(<title>)([^<]*)(<\/title>)/ },
  { key: 'description', re: /(<meta name="description" content=")([^"]*)(">)/ },
  { key: 'share_title', re: /(<meta property="og:title" content=")([^"]*)(">)/, share: true },
  { key: 'share_description', re: /(<meta property="og:description" content=")([^"]*)(">)/, share: true },
  { key: 'share_image', re: /(<meta property="og:image" content=")([^"]*)(">)/, share: true },
  // The guide layout (.copy) and the squeeze layout (.head, directors-cheat-sheet).
  { key: 'label', re: /(<div class="(?:copy|head)">\s*<span class="label">)([\s\S]*?)(<\/span>)/ },
  { key: 'headline', re: /(<div class="(?:copy|head)">(?:(?!<\/div>)[\s\S])*?<h1>)([\s\S]*?)(<\/h1>)/ },
  { key: 'hook', re: /(<div class="hook">)([\s\S]*?)(<\/div>)/ },
  { key: 'tagline', re: /(<p class="tagline">|<div class="head">(?:(?!<\/div>)[\s\S])*?<p class="sub">)([\s\S]*?)(<\/p>)/ },
  { key: 'bullets', re: /(<ul class="blist">)([\s\S]*?)(<\/ul>)/, list: true },
  { key: 'cover', re: /((?:<img class="mcover" |<div class="shot"><img )src=")([^"]*)(")/ },
  { key: 'cover_alt', re: /((?:<img class="mcover" |<div class="shot"><img )src="[^"]*" alt=")([^"]*)(")/ },
  { key: 'cover_width', re: /((?:<img class="mcover" |<div class="shot"><img )src="[^"]*" alt="[^"]*" width=")(\d+)(")/, num: true },
  { key: 'cover_height', re: /((?:<img class="mcover" |<div class="shot"><img )src="[^"]*" alt="[^"]*" width="\d+" height=")(\d+)(")/, num: true },
  { key: 'form_heading', re: /(<div class="form-in">(?:(?!<\/form>)[\s\S])*?<h2>)([\s\S]*?)(<\/h2>)/ },
  { key: 'form_sub', re: /(<div class="sub">)([\s\S]*?)(<\/div>)/ },
  { key: 'button', re: /(<button class="btn btn--primary btn--full" type="submit" id="btn">)([\s\S]*?)(<\/button>)/ },
  { key: 'fine_print', re: /(<div class="fine">)([\s\S]*?)(<\/div>)/ },
  { key: 'thanks_heading', re: /(<div class="done" id="done"[^>]*>\s*<div class="tick"[^>]*>[^<]*<\/div>\s*<h2>)([\s\S]*?)(<\/h2>)/ },
  { key: 'thanks_text', re: /(<div class="done" id="done"[^>]*>\s*<div class="tick"[^>]*>[^<]*<\/div>\s*<h2>[\s\S]*?<\/h2>\s*<p>)([\s\S]*?)(<\/p>)/, name: true },
  { key: 'download_label', re: /(<a class="btn btn--primary btn--full" id="dl" href="[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/ },
  { key: 'pdf', re: /(<a class="btn btn--primary btn--full" id="dl" href=")([^"]*)(")/ },
];

// What the share fields default to, from the page's own fields.
const shareDefault = {
  share_title: d => d.title == null ? null : String(d.title).endsWith(SUFFIX) ? String(d.title).slice(0, -SUFFIX.length) : d.title,
  share_description: d => d.description,
  share_image: d => d.cover ? (/^https?:/.test(d.cover) ? d.cover : SITE + d.cover) : null,
};

const LI = /<li>([\s\S]*?)<\/li>/g;
function splitList(v) {
  const items = [...v.matchAll(LI)].map(m => m[1]);
  return items.map(i => '<li>' + i + '</li>').join('') === v ? items : null;
}
const joinList = items => items.map(i => '<li>' + i + '</li>').join('');

function once(html, re) {
  const g = new RegExp(re.source, 'g');
  const all = [...html.matchAll(g)];
  return all.length === 1 ? all[0] : all.length ? 'many' : null;
}

/* The words of a page, as content/free/<slug>.json holds them. Throws when a
   slot is ambiguous or a value can't be held as a field. */
function extract(html, file) {
  const d = {};
  for (const s of SLOTS) {
    const m = once(html, s.re);
    if (m === 'many') throw new Error(file + ': slot ' + s.key + ' matches more than once');
    if (!m) continue;
    let v = m[2];
    if (s.list) { v = splitList(v); if (!v) throw new Error(file + ': bullets are not a plain <li> run'); }
    else if (s.num) v = +v;
    else if (s.name) {
      if (v.includes(NAME_TOKEN)) throw new Error(file + ': thank-you text already holds ' + NAME_TOKEN);
      v = v.split(NAME_SPAN).join(NAME_TOKEN);
    }
    d[s.key] = v;
  }
  // Share fields that follow the page's own fields are left out of the JSON.
  for (const k of Object.keys(shareDefault)) if (k in d && d[k] === shareDefault[k](d)) delete d[k];
  return d;
}

/* The page with its slots filled from data. Slots the data doesn't carry keep
   whatever the frame has. */
function render(html, data, file) {
  for (const s of SLOTS) {
    let v = data[s.key], derived = false;
    if (v == null && s.share) { v = shareDefault[s.key](data); derived = true; }
    if (v == null) continue;
    const m = once(html, s.re);
    if (m === 'many') throw new Error(file + ': slot ' + s.key + ' matches more than once');
    if (!m) { if (derived) continue; throw new Error(file + ': the page has no place for ' + s.key); }
    if (s.list) { if (!Array.isArray(v)) throw new Error(file + ': bullets must be a list'); v = joinList(v.map(String)); }
    else if (s.name) v = String(v).split(NAME_TOKEN).join(NAME_SPAN);
    else v = String(v);
    // Attribute values can't hold a raw quote; tag bodies can't open a tag by accident here.
    if (/"$/.test(m[1]) && v.includes('"')) v = v.replace(/"/g, '&quot;');
    html = html.slice(0, m.index) + m[1] + v + m[3] + html.slice(m.index + m[0].length);
  }
  return html;
}

// Every lead magnet page: the hub, then the guides in name order.
function pages(root) {
  const dir = path.join(root, 'free');
  const out = [];
  if (fs.existsSync(path.join(dir, 'index.html'))) out.push({ slug: 'index', file: 'free/index.html' });
  for (const n of fs.readdirSync(dir).sort()) {
    if (fs.existsSync(path.join(dir, n, 'index.html'))) out.push({ slug: n, file: 'free/' + n + '/index.html' });
  }
  return out;
}
const fileOfSlug = slug => slug === 'index' ? 'free/index.html' : 'free/' + slug + '/index.html';
const urlOfSlug = slug => slug === 'index' ? '/free/' : '/free/' + slug + '/';

module.exports = { SLOTS, extract, render, pages, fileOfSlug, urlOfSlug, splitList, NAME_TOKEN };
