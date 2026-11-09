/* Popups (Studio Editor, 2026-11-08).

   content/popups.json holds every popup on elvinpeters.com: its words, its picture,
   the pages it opens on and when it opens. build.js writes it to js/popups.js, which
   js/site.js loads before js/capture.js, so the popup reads its words from content
   and Site Studio (Website > Popups) can edit, duplicate and place them. A page no
   popup names renders and behaves exactly as it did with no popup.

   One popup:
     id        a-z, 0-9, dashes; unique
     name      what Studio calls it
     on        false keeps it in the file but off the site
     pages     where it may open: "/" or "/free/" (that page) or "/free/*" (every page under it)
     except    pages inside those it must never open on
     trigger   exit (desktop: the pointer leaves the top), scroll (percent of the page, 0 = off),
               delay (seconds, 0 = off). A desktop with exit on uses exit alone; a phone,
               or a desktop with exit off, uses scroll and delay. Never in the first 8 seconds.
     source    the sign-up label the lead carries ("newsletter-popup"), or "page" for the guide
               on the page it opens on (magnet:<slug>; hub_source on the folder page itself)
     message   the note sent with the sign-up; guide_message when source is "page" and the page is a guide
     image, image_alt   a picture across the top (optional; the description is required with it)
     eyebrow, heading, text, button, success, dismiss, fine   the words. {guide} becomes the guide's name. */
'use strict';

const ID_RE = /^[a-z][a-z0-9-]{0,40}$/;
const PAGE_RE = /^\/(?:[a-z0-9-]+\/)*\*?$/;
const SOURCE_RE = /^[a-z][a-z0-9-]{0,40}(:[a-z0-9-]{1,60})?$/;
const IMAGE_RE = /^\/img\/[a-z0-9][a-z0-9._\/-]{0,160}\.(png|jpe?g|webp|gif|svg)$/i;
const WORDS = [['eyebrow', 'Small line on top', 80], ['heading', 'Headline', 140], ['text', 'Text', 500], ['button', 'Button', 60],
  ['success', 'After they sign up', 300], ['dismiss', 'The "no thanks" link', 40], ['fine', 'Small print', 400]];
// Pages that never get a popup: sign-up and confirm pages, the funnel, pages a book QR code lands on.
const NEVER = ['/newsletter/', '/updates/', '/toolkit/', '/tsa-toolkit/', '/series/', '/review/', '/thank-you/', '/books/', '/quiz', '/free/link-expired/'];
const never = (p, prefix) => NEVER.some(n => p === n || p.startsWith(n)) || /\/confirm/.test(p) || (prefix && p.startsWith('/' + prefix + '/'));

function plain(v, max) { return typeof v === 'string' && v.length <= max && !/[<>]/.test(v); }

/* Everything wrong with the file, as plain sentences. `prefix` is the funnel folder
   (content/funnels.json), which no popup may name. */
function check(data, prefix) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['popups.json must be an object'];
  if (!Array.isArray(data.popups)) return ['popups must be a list'];
  const errs = [], ids = new Set();
  data.popups.forEach((p, i) => {
    const at = 'popup ' + (i + 1) + (p && p.name ? ' (' + String(p.name).slice(0, 40) + ')' : '');
    if (!p || typeof p !== 'object' || Array.isArray(p)) return errs.push(at + ' is not an object');
    if (!ID_RE.test(p.id || '')) errs.push(at + ' needs an id (a-z, 0-9, dashes)');
    else if (ids.has(p.id)) errs.push('two popups use the id ' + p.id);
    ids.add(p.id);
    if (!plain(p.name, 80) || !String(p.name).trim()) errs.push(at + ' needs a name');
    if (typeof p.on !== 'boolean') errs.push(at + ': on must be true or false');
    for (const k of ['pages', 'except']) {
      if (p[k] == null && k === 'except') continue;
      if (!Array.isArray(p[k])) { errs.push(at + ': ' + k + ' must be a list of page addresses'); continue; }
      for (const pg of p[k]) {
        if (!PAGE_RE.test(pg)) errs.push(at + ': "' + String(pg).slice(0, 60) + '" is not a page address (like / or /free/ or /free/*)');
        else if (k === 'pages' && never(pg.replace(/\*$/, ''), prefix)) errs.push(at + ': popups never open on ' + pg);
      }
    }
    const t = p.trigger;
    if (!t || typeof t !== 'object' || Array.isArray(t)) errs.push(at + ': trigger must be an object');
    else {
      if (typeof t.exit !== 'boolean') errs.push(at + ': trigger.exit must be true or false');
      if (!Number.isInteger(t.scroll) || t.scroll < 0 || t.scroll > 100) errs.push(at + ': trigger.scroll is a whole number from 0 to 100');
      if (!Number.isInteger(t.delay) || t.delay < 0 || t.delay > 600) errs.push(at + ': trigger.delay is whole seconds from 0 to 600');
      if (!t.exit && !t.scroll && !t.delay) errs.push(at + ': pick at least one way for it to open');
    }
    if (p.source !== 'page' && !SOURCE_RE.test(p.source || '')) errs.push(at + ': source is "page" or a label like newsletter-popup');
    if (p.source === 'page') {
      if (p.hub_source != null && p.hub_source !== '' && !SOURCE_RE.test(p.hub_source)) errs.push(at + ': hub_source must be a label like magnet:directors-cheat-sheet');
      if (p.hub_name != null && !plain(p.hub_name, 80)) errs.push(at + ': hub_name must be plain text');
      if (p.guide_message != null && !plain(p.guide_message, 120)) errs.push(at + ': guide_message must be plain text (120 characters)');
    }
    if (!plain(p.message, 120) || !String(p.message).trim()) errs.push(at + ': message must be plain text (up to 120 characters)');
    if (p.image != null && p.image !== '') {
      if (!IMAGE_RE.test(p.image)) errs.push(at + ': the picture must be an image on this site under /img/');
      if (!plain(p.image_alt, 200) || !String(p.image_alt || '').trim()) errs.push(at + ': describe the picture (image_alt) for people who cannot see it');
    }
    for (const [k, label, max] of WORDS) {
      if (p[k] == null) { if (k === 'eyebrow' || k === 'fine') continue; errs.push(at + ': ' + label.toLowerCase() + ' is missing'); continue; }
      if (!plain(p[k], max)) errs.push(at + ': ' + label.toLowerCase() + ' must be plain text up to ' + max + ' characters');
      else if (!String(p[k]).trim() && k !== 'eyebrow' && k !== 'fine') errs.push(at + ': ' + label.toLowerCase() + ' is empty');
    }
  });
  return errs;
}

/* One popup with its keys in a fixed order, so an unchanged save is byte-equal to the
   live file and two versions compare as text. Unknown keys are dropped. */
function shape(p) {
  const t = p.trigger || {};
  const out = { id: p.id, name: p.name, on: !!p.on, pages: (p.pages || []).slice(), except: (p.except || []).slice(),
    trigger: { exit: !!t.exit, scroll: +t.scroll || 0, delay: +t.delay || 0 }, source: p.source || '' };
  if (p.source === 'page') { out.hub_source = p.hub_source || ''; out.hub_name = p.hub_name || ''; out.guide_message = p.guide_message || ''; }
  out.message = p.message || '';
  out.image = p.image || ''; out.image_alt = p.image_alt || '';
  for (const [k] of WORDS) out[k] = p[k] == null ? '' : p[k];
  return out;
}
const blank = () => shape({ id: 'popup', name: 'New popup', on: false, pages: [], trigger: { exit: true, scroll: 50, delay: 30 }, source: 'newsletter-popup',
  message: 'Popup sign-up', heading: '', text: '', button: 'Send it to me', success: 'Check your inbox and click confirm.', dismiss: 'Maybe later',
  fine: "You'll get a few welcome emails and a monthly letter from Elvin Peters. Unsubscribe anytime. Questions: elvin@elvinpeters.com" });

/* js/popups.js: the popups that are on, as the page script reads them. */
function render(data) {
  const list = (data.popups || []).filter(p => p.on).map(p => { const s = shape(p); delete s.name; delete s.on; return s; });
  return '/* GENERATED by build.js from content/popups.json. Do not edit: edit the popups in Site Studio (Website > Popups) or that file, then node build.js. */\n' +
    'window.EP_POPUPS=' + JSON.stringify({ popups: list }) + ';\n';
}

module.exports = { check, shape, blank, render, never, WORDS, ID_RE, PAGE_RE, SOURCE_RE, IMAGE_RE };
