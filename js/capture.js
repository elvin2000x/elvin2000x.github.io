/* capture.js — the email popup (#388, 2026-09-28; words from content since 2026-11-08).
   Loaded by site.js straight after js/popups.js, which build.js writes from
   content/popups.json (Site Studio > Website > Popups edits the words, the picture,
   the pages and the trigger). This file holds the behaviour only.
   Owned end to end (Rule 03): posts to the same intake as every site form
   (honeypot, per-IP rate limit, dedupe, then the double opt-in confirm).
   Never on first paint, never twice: closing it keeps it away 30 days,
   signing up (here or in a page form) keeps it away for good.
   Desktop opens on exit intent; a phone opens at a scroll depth or after a delay,
   and never in the first 8 s. Amazon is never inside it (Associates rule on
   links in pop-ups), and the page's own Amazon buttons stay where they are.
   ?ep-popup=<id> opens that popup at once (previews and checks only; it changes
   nothing about what is sent). */
(function () {
  'use strict';

  var CFG = window.EP_POPUPS, LIST = CFG && CFG.popups;
  if (!LIST || !LIST.length) return;

  var API = 'https://ultimateaidirectory.com/api/lead';
  var KEY = 'ep_cap';                 // "sub" or the time it was last closed
  var QUIET = 30 * 864e5;             // 30 days after a close
  var MIN_WAIT = 8000;
  var ERROR = 'Something went wrong. Try again in a moment.';
  var BAD = 'Please check your email address.';
  var path = location.pathname.replace(/index\.html$/, '');
  var guideSlug = (/^\/free\/([a-z0-9-]+)\/$/.exec(path) || [])[1] || '';

  // Which popup this page gets: the first one whose pages name it and whose except list does not.
  function hit(pat) {
    if (pat === path) return true;
    if (pat.charAt(pat.length - 1) !== '*') return false;
    var base = pat.slice(0, -1);
    return path.indexOf(base) === 0 && path.length > base.length;
  }
  function names(p) { return (p.pages || []).some(hit) && !(p.except || []).some(hit); }
  var POP = null, i;
  for (i = 0; i < LIST.length && !POP; i++) if (names(LIST[i])) POP = LIST[i];
  var force = (/[?&]ep-popup=([a-z0-9-]+)/.exec(location.search) || [])[1] || '';
  if (force) for (i = 0; i < LIST.length; i++) if (LIST[i].id === force) POP = LIST[i];
  if (!POP) return;
  var T = POP.trigger || {};

  function get(k, store) { try { return (store || localStorage).getItem(k); } catch (e) { return null; } }
  function set(k, v, store) { try { (store || localStorage).setItem(k, v); } catch (e) {} }

  /* First-touch ad tags: an ad ending lands on /free/?utm_content=ending-a and the
     visitor may sign up two pages later, so the tags ride along for the visit. */
  var TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  (function keepTags() {
    try {
      var p = new URLSearchParams(location.search), b = [];
      TAGS.forEach(function (k) { var v = p.get(k); if (v) b.push(k.replace('utm_', '') + '=' + v.slice(0, 60)); });
      if (b.length && !get('ep_tags', sessionStorage)) set('ep_tags', b.join('&'), sessionStorage);
    } catch (e) {}
  })();

  // Any form sent on this page counts: the popup would only ask again.
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id !== 'ep-cap-form') set('ep_cap_page', '1', sessionStorage);
  }, true);

  function blocked() {
    if (!window.HTMLDialogElement) return true;
    if (force) return false;
    var v = get(KEY);
    if (v === 'sub') return true;
    if (v && Date.now() - +v < QUIET) return true;
    if (get('ep_cap_page', sessionStorage) || get('ep_nl_reader')) return true;
    return false;
  }
  if (blocked()) return;

  // "page" means the guide on this page: its name comes from the title, the folder page has its own.
  var onPage = POP.source === 'page';
  function guideName() {
    if (!guideSlug) return POP.hub_name || 'this guide';
    var t = document.title.split(/\s[·|]\s|\s\(Free\)/)[0].trim();
    return t.length > 60 ? 'this guide' : t;
  }
  function fill(s) { return String(s == null ? '' : s).replace('{guide}', guideName()); }
  function baseSource() {
    if (!onPage) return POP.source;
    return guideSlug ? 'magnet:' + guideSlug : (POP.hub_source || POP.source);
  }
  function source(door) {
    var b = ['pos=' + door, 'path=' + path];
    var tags = get('ep_tags', sessionStorage);
    if (tags) b.push(tags);
    return (baseSource() + ' | ' + b.join('&')).slice(0, 290);
  }
  function track(name, params) {
    try { if (typeof gtag === 'function') gtag('event', name, params); } catch (e) {}
  }

  var CSS = '' +
    '#ep-cap{border:0;padding:0;margin:auto;width:min(440px,calc(100% - 32px));max-height:calc(100% - 32px);' +
    'background:var(--bg,#fff);color:var(--ink,#1a1a1a);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:auto}' +
    '#ep-cap::backdrop{background:rgba(10,12,16,.55)}' +
    '#ep-cap .cap-in{position:relative;padding:28px 24px 20px}' +
    '#ep-cap .cap-img{display:block;width:100%;height:auto;max-height:200px;object-fit:cover}' +
    '#ep-cap .cap-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;' +
    'color:var(--ink,#1a1a1a);font-size:26px;line-height:1;cursor:pointer}' +
    '#ep-cap .cap-img~.cap-in .cap-x{background:var(--bg,#fff)}' +
    '#ep-cap .cap-x:hover,#ep-cap .cap-x:focus-visible{background:var(--line-soft,rgba(0,0,0,.06))}' +
    '#ep-cap .cap-eye{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--accent-ink,var(--accent,#8a6a12))}' +
    '#ep-cap h2{margin:0 44px 10px 0;font-size:22px;line-height:1.25}' +
    '#ep-cap .cap-body{margin:0 0 16px;font-size:16px;line-height:1.5;color:var(--ink-2,var(--ink,#333))}' +
    '#ep-cap form{display:flex;flex-direction:column;gap:10px}' +
    '#ep-cap input[type=email]{font:inherit;font-size:16px;min-height:48px;padding:0 14px;border:1px solid var(--line-strong,#999);' +
    'border-radius:10px;background:var(--bg,#fff);color:var(--ink,#1a1a1a);width:100%;box-sizing:border-box}' +
    '#ep-cap button[type=submit]{font:inherit;font-weight:700;font-size:16px;min-height:48px;border:0;border-radius:10px;cursor:pointer;' +
    'background:var(--accent,#c9a227);color:var(--accent-on,#111)}' +
    '#ep-cap button[type=submit][disabled]{opacity:.6;cursor:wait}' +
    '#ep-cap .cap-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '#ep-cap .cap-fine{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:var(--muted,#555)}' +
    '#ep-cap .cap-msg{margin:10px 0 0;font-size:15px;line-height:1.45}' +
    '#ep-cap .cap-msg.err{color:var(--warn,#b3261e)}' +
    '#ep-cap .cap-no{display:block;margin:12px auto 0;min-height:44px;padding:0 12px;border:0;background:transparent;' +
    'color:var(--muted,#555);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}' +
    '@media (max-width:600px){#ep-cap{margin:auto 0 0;width:100%;max-width:100%;border-radius:16px 16px 0 0}' +
    '#ep-cap .cap-in{padding:24px 16px calc(16px + env(safe-area-inset-bottom))}}' +
    '@media (prefers-reduced-motion:no-preference){#ep-cap[open]{animation:epcap .22s ease-out}}' +
    '@keyframes epcap{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var dlg, shown = false, lastFocus = null;
  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.id = 'ep-cap';
    dlg.setAttribute('aria-labelledby', 'ep-cap-h');
    dlg.setAttribute('aria-describedby', 'ep-cap-b');
    dlg.innerHTML =
      (POP.image ? '<img class="cap-img" src="' + esc(POP.image) + '" alt="' + esc(POP.image_alt || '') + '">' : '') +
      '<div class="cap-in">' +
      '<button type="button" class="cap-x" aria-label="Close">&times;</button>' +
      (POP.eyebrow ? '<p class="cap-eye">' + esc(fill(POP.eyebrow)) + '</p>' : '') +
      '<h2 id="ep-cap-h">' + esc(fill(POP.heading)) + '</h2>' +
      '<p class="cap-body" id="ep-cap-b">' + esc(fill(POP.text)) + '</p>' +
      '<form id="ep-cap-form" novalidate>' +
      '<label for="ep-cap-email" class="cap-hp">Email address</label>' +
      '<input type="email" id="ep-cap-email" name="email" autocomplete="email" inputmode="email" placeholder="you@work.com" aria-label="Email address" required>' +
      '<div class="cap-hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<button type="submit">' + esc(fill(POP.button)) + '</button>' +
      '</form>' +
      '<p class="cap-msg" role="status" aria-live="polite"></p>' +
      (POP.fine ? '<p class="cap-fine">' + esc(fill(POP.fine)) + '</p>' : '') +
      '<button type="button" class="cap-no">' + esc(fill(POP.dismiss) || 'Maybe later') + '</button>' +
      '</div>';
    document.body.appendChild(dlg);

    dlg.querySelector('.cap-x').addEventListener('click', function () { close('x'); });
    dlg.querySelector('.cap-no').addEventListener('click', function () { close('no'); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close('esc'); });   // Esc
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close('backdrop'); }); // outside the card
    dlg.querySelector('form').addEventListener('submit', send);
  }

  function close(how) {
    if (!dlg || !dlg.open) return;
    dlg.close();
    if (get(KEY) !== 'sub') { set(KEY, String(Date.now())); track('capture_dismiss', { how: how, page_path: path }); }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }

  function send(e) {
    e.preventDefault();
    var f = e.target, msg = dlg.querySelector('.cap-msg'), btn = f.querySelector('button');
    var email = f.email.value.trim();
    msg.className = 'cap-msg'; msg.textContent = '';
    if (f.website.value) { done(); return; }              // a bot: look finished, send nothing
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = 'cap-msg err'; msg.textContent = BAD; f.email.focus(); return; }
    btn.disabled = true;
    var src = source('popup'), label = src.split(' | ')[0];
    var note = onPage && guideSlug && POP.guide_message ? fill(POP.guide_message) : fill(POP.message);
    var body = new URLSearchParams({ name: 'Popup lead', email: email, source: src, website: '', message: note }).toString();
    fetch(API, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
      .then(function (r) {
        if (r && r.success === false) { btn.disabled = false; msg.className = 'cap-msg err'; msg.textContent = r.error || ERROR; return; }
        done();
        try { if (typeof gtag === 'function') gtag('set', 'user_data', { email: email }); } catch (x) {}
        try { if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: label + '-popup' }); } catch (x) {}
        track('generate_lead', { method: 'popup' });
        if (label.indexOf('magnet:') === 0) track('free_optin', { magnet: label.replace('magnet:', ''), page_path: path, pos: 'popup' });
        else track('newsletter_signup', { source: label, page_path: path });
      })
      .catch(function () { btn.disabled = false; msg.className = 'cap-msg err'; msg.textContent = ERROR; });
  }

  function done() {
    set(KEY, 'sub');
    dlg.querySelector('form').style.display = 'none';
    var msg = dlg.querySelector('.cap-msg');
    msg.className = 'cap-msg'; msg.textContent = fill(POP.success);
    dlg.querySelector('.cap-no').textContent = 'Close';
  }

  function open(trigger) {
    if (shown || blocked()) return;
    if (document.querySelector('dialog[open]')) return;   // never on top of another modal
    shown = true;
    detach();
    build();
    lastFocus = document.activeElement;
    dlg.showModal();                                      // inert page behind, focus stays inside
    try { dlg.querySelector('#ep-cap-email').focus({ preventScroll: true }); } catch (e) {}
    track('capture_view', { trigger: trigger, page_path: path });
  }

  var t0 = Date.now(), timer = null;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  function ready() { return Date.now() - t0 >= MIN_WAIT; }
  function onOut(e) { if (!e.relatedTarget && e.clientY <= 0 && ready()) open('exit'); }
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0 && scrollY / h >= T.scroll / 100 && ready()) open('scroll');
  }
  function detach() {
    document.removeEventListener('mouseout', onOut);
    removeEventListener('scroll', onScroll);
    if (timer) clearTimeout(timer);
  }
  if (force) { open('force'); return; }
  if (fine && T.exit) document.addEventListener('mouseout', onOut);
  else {
    if (T.scroll > 0) addEventListener('scroll', onScroll, { passive: true });
    if (T.delay > 0) timer = setTimeout(function () { open('time'); }, T.delay * 1000);
  }
})();
