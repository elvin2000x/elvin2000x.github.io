/* capture.js — the email popup (#388, 2026-09-28). Loaded by site.js.
   Owned end to end (Rule 03): posts to the same intake as every site form
   (honeypot, per-IP rate limit, dedupe, then the double opt-in confirm).
   Never on first paint, never twice: closing it keeps it away 30 days,
   signing up (here or in a page form) keeps it away for good.
   Desktop opens on exit intent; a phone opens at half the page or 30 s,
   and never in the first 8 s. Amazon is never inside it (Associates rule on
   links in pop-ups), and the page's own Amazon buttons stay where they are.
   COPY below is the one place to edit the words. */
(function () {
  'use strict';

  var COPY = {
    // Default: the homepage. The free chapter plus the monthly letter.
    main: {
      eyebrow: 'Stop prompting. Start directing.',
      head: 'Get better answers from the AI you already use',
      body: 'Get Chapter 8 of The Artificial Advantage free, plus 50 prompts and a cheat sheet. Then one letter a month from me.',
      button: 'Send me the chapter',
      success: 'Check your inbox and click confirm. Your free chapter, 50 prompts and cheat sheet come next.'
    },
    // /free/ and /free/<guide>/ pages. {guide} becomes the guide's name.
    guide: {
      eyebrow: '{guide}',
      head: 'Keep it for the day you need it',
      body: "I'll email it to you so it's in your inbox when that day comes, along with my monthly letter.",
      button: 'Email it to me',
      success: 'Check your inbox and click confirm. Your guide comes next.'
    },
    dismiss: 'Maybe later',
    consent: "You'll get a few welcome emails and a monthly letter from Elvin Peters. Unsubscribe anytime. Questions: elvin@elvinpeters.com",
    error: 'Something went wrong. Try again in a moment.',
    bad: 'Please check your email address.'
  };

  var API = 'https://ultimateaidirectory.com/api/lead';
  var KEY = 'ep_cap';                 // "sub" or the time it was last closed
  var QUIET = 30 * 864e5;             // 30 days after a close
  var MIN_WAIT = 8000, PHONE_WAIT = 30000, PHONE_DEPTH = 0.5;
  // Where it may open: the homepage and the free guides (the ad's landing pages).
  var path = location.pathname.replace(/index\.html$/, '');
  var guideSlug = (/^\/free\/([a-z0-9-]+)\/$/.exec(path) || [])[1] || '';
  var ALLOWED = path === '/' || path === '/free/' || (guideSlug && guideSlug !== 'link-expired');

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
    if (!ALLOWED || !window.HTMLDialogElement) return true;
    var v = get(KEY);
    if (v === 'sub') return true;
    if (v && Date.now() - +v < QUIET) return true;
    if (get('ep_cap_page', sessionStorage) || get('ep_nl_reader')) return true;
    return false;
  }
  if (blocked()) return;

  function copy() { return (guideSlug || path === '/free/') ? COPY.guide : COPY.main; }
  function guideName() {
    if (path === '/free/') return "The Director's Cheat Sheet";   // the hub's own offer
    var t = document.title.split(/\s[·|]\s|\s\(Free\)/)[0].trim();
    return t.length > 60 ? 'this guide' : t;
  }
  function source(door) {
    var base = guideSlug ? 'magnet:' + guideSlug : (path === '/free/' ? 'magnet:directors-cheat-sheet' : 'newsletter-popup');
    var b = ['pos=' + door, 'path=' + path];
    var tags = get('ep_tags', sessionStorage);
    if (tags) b.push(tags);
    return (base + ' | ' + b.join('&')).slice(0, 290);
  }
  function track(name, params) {
    try { if (typeof gtag === 'function') gtag('event', name, params); } catch (e) {}
  }

  var CSS = '' +
    '#ep-cap{border:0;padding:0;margin:auto;width:min(440px,calc(100% - 32px));max-height:calc(100% - 32px);' +
    'background:var(--bg,#fff);color:var(--ink,#1a1a1a);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:auto}' +
    '#ep-cap::backdrop{background:rgba(10,12,16,.55)}' +
    '#ep-cap .cap-in{position:relative;padding:28px 24px 20px}' +
    '#ep-cap .cap-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;' +
    'color:var(--ink,#1a1a1a);font-size:26px;line-height:1;cursor:pointer}' +
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
    var c = copy();
    var head = c.head.replace('{guide}', guideName());
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.id = 'ep-cap';
    dlg.setAttribute('aria-labelledby', 'ep-cap-h');
    dlg.setAttribute('aria-describedby', 'ep-cap-b');
    dlg.innerHTML =
      '<div class="cap-in">' +
      '<button type="button" class="cap-x" aria-label="Close">&times;</button>' +
      '<p class="cap-eye">' + esc(c.eyebrow.replace('{guide}', guideName())) + '</p>' +
      '<h2 id="ep-cap-h">' + esc(head) + '</h2>' +
      '<p class="cap-body" id="ep-cap-b">' + esc(c.body) + '</p>' +
      '<form id="ep-cap-form" novalidate>' +
      '<label for="ep-cap-email" class="cap-hp">Email address</label>' +
      '<input type="email" id="ep-cap-email" name="email" autocomplete="email" inputmode="email" placeholder="you@work.com" aria-label="Email address" required>' +
      '<div class="cap-hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<button type="submit">' + esc(c.button) + '</button>' +
      '</form>' +
      '<p class="cap-msg" role="status" aria-live="polite"></p>' +
      '<p class="cap-fine">' + esc(COPY.consent) + '</p>' +
      '<button type="button" class="cap-no">' + esc(COPY.dismiss) + '</button>' +
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = 'cap-msg err'; msg.textContent = COPY.bad; f.email.focus(); return; }
    btn.disabled = true;
    var src = source('popup');
    var body = new URLSearchParams({
      name: 'Popup lead', email: email, source: src, website: '',
      message: guideSlug ? 'Lead magnet: ' + guideName() : 'Popup: free chapter + monthly letter'
    }).toString();
    fetch(API, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
      .then(function (r) {
        if (r && r.success === false) { btn.disabled = false; msg.className = 'cap-msg err'; msg.textContent = r.error || COPY.error; return; }
        done();
        try { if (typeof gtag === 'function') gtag('set', 'user_data', { email: email }); } catch (x) {}
        try { if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: src.split(' | ')[0] + '-popup' }); } catch (x) {}
        track('generate_lead', { method: 'popup' });
        if (guideSlug || path === '/free/') track('free_optin', { magnet: src.split(' | ')[0].replace('magnet:', ''), page_path: path, pos: 'popup' });
        else track('newsletter_signup', { source: 'newsletter-popup', page_path: path });
      })
      .catch(function () { btn.disabled = false; msg.className = 'cap-msg err'; msg.textContent = COPY.error; });
  }

  function done() {
    set(KEY, 'sub');
    dlg.querySelector('form').style.display = 'none';
    var msg = dlg.querySelector('.cap-msg');
    msg.className = 'cap-msg'; msg.textContent = copy().success;
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
    if (h > 0 && scrollY / h >= PHONE_DEPTH && ready()) open('scroll');
  }
  function detach() {
    document.removeEventListener('mouseout', onOut);
    removeEventListener('scroll', onScroll);
    if (timer) clearTimeout(timer);
  }
  if (fine) document.addEventListener('mouseout', onOut);
  else {
    addEventListener('scroll', onScroll, { passive: true });
    timer = setTimeout(function () { open('time'); }, PHONE_WAIT);
  }
})();
