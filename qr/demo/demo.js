/*
 * QR Studio public demo (card #544). View-only copy of the real dashboard
 * (coding/qr-studio/server/admin.template.html). Every fetch is replaced by the
 * sample data below; the page's CSP (connect-src 'none') blocks any network call.
 * Every action shows Elvin's approved line instead of doing anything.
 * Sample QR codes encode this demo page, never a live /q/ redirect, so a phone
 * scan cannot log a scan in the real QR Studio database.
 */
"use strict";
(function () {
  const ONLY = 'Login to use full functionality. This is a demo version only.';
  const DEMO_URL = 'https://elvinpeters.com/qr/demo/';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  // Sample links (made-up demo data, not real scan counts).
  const LINKS = [
    { id: 'demo-poster', name: 'Sample poster', campaign: 'cleaner-recruit', target_url: 'https://ultimateonlinedirectory.com/', scans: 142, fg: '#173D30', bg: '#F6F3EC' },
    { id: 'demo-book', name: 'Sample book insert', campaign: 'book-launch', target_url: 'https://elvinpeters.com/book.html', scans: 96, fg: '#0E1A2B', bg: '#FFFFFF' },
    { id: 'demo-card', name: 'Sample business card', campaign: 'networking', target_url: 'https://elvinpeters.com/links/', scans: 58, fg: '#000000', bg: '#FFFFFF' },
    { id: 'demo-talk', name: 'Sample talk slide', campaign: 'speaking', target_url: 'https://elvinpeters.com/newsletter/', scans: 37, fg: '#1A1204', bg: '#F3E6C4' },
    { id: 'demo-flyer', name: 'Sample event flyer', campaign: 'speaking', target_url: 'https://elvinpeters.com/contact/', scans: 21, fg: '#173D30', bg: '#FFFFFF' }
  ];
  const TOTAL = LINKS.reduce((a, l) => a + l.scans, 0);
  const DAY_SHAPE = [9, 14, 11, 18, 22, 17, 25, 31, 24, 28, 35, 30, 41, 49];
  const shapeSum = DAY_SHAPE.reduce((a, b) => a + b, 0);
  const BY_DAY = DAY_SHAPE.map((v, i) => {
    const d = new Date(); d.setDate(d.getDate() - (DAY_SHAPE.length - 1 - i));
    return { d: d.toISOString().slice(0, 10), n: Math.round(v / shapeSum * TOTAL) };
  });
  const byCampaign = {};
  LINKS.forEach(l => { byCampaign[l.campaign] = (byCampaign[l.campaign] || 0) + l.scans; });
  const BY_CAMPAIGN = Object.entries(byCampaign).map(([campaign, n]) => ({ campaign, n })).sort((a, b) => b.n - a.n);
  const BY_DEVICE = [{ device: 'iPhone', n: Math.round(TOTAL * .54) }, { device: 'Android', n: Math.round(TOTAL * .39) }, { device: 'Desktop', n: Math.round(TOTAL * .07) }];
  const BY_GEO = [{ country: 'CA', n: Math.round(TOTAL * .81) }, { country: 'US', n: Math.round(TOTAL * .15) }, { country: 'GB', n: Math.round(TOTAL * .04) }];

  let tt;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'toast show'; clearTimeout(tt); tt = setTimeout(() => t.className = 'toast', 2600); }
  const only = e => { if (e) e.preventDefault(); toast(ONLY); };

  function qrSVG(text, fg, bg, size) {
    const q = qrcode(0, 'H'); q.addData(text); q.make(); const n = q.getModuleCount(), m = 4, dim = n + m * 2; let rc = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { if (!q.isDark(r, c)) continue; rc += `<rect x="${c + m}" y="${r + m}" width="1.02" height="1.02"/>`; }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Sample QR code"><rect width="${dim}" height="${dim}" fill="${bg}"/><g fill="${fg}">${rc}</g></svg>`;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  function show(v) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.v === v));
    $('#v-links').className = v === 'links' ? '' : 'hide';
    $('#v-analytics').className = v === 'analytics' ? '' : 'hide';
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => { show(t.dataset.v); if (t.dataset.v === 'analytics') loadAnalytics(); }));

  function loadLinks() {
    const tb = $('#linksTbl tbody'); tb.innerHTML = '';
    LINKS.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="qmini">${qrSVG(DEMO_URL, l.fg, l.bg, 46)}</div></td>
        <td>${esc(l.name)}<div class="k">${esc(l.campaign)}</div></td>
        <td><span class="short">/q/${esc(l.id)}</span><div class="k"><a href="#" data-demo>open ↗</a></div></td>
        <td style="max-width:240px;min-width:180px"><input value="${esc(l.target_url)}" readonly data-demo aria-label="Destination for ${esc(l.name)}"></td>
        <td><span class="pill">${l.scans}</span></td>
        <td style="white-space:nowrap">
          <button class="btn sm" type="button" data-demo>Save</button>
          <button class="btn sm" type="button" data-demo>QR</button>
          <button class="btn sm" type="button" data-demo aria-label="Deactivate">✕</button>
        </td>`;
      tb.appendChild(tr);
    });
  }
  function bars(el, rows, label) {
    const max = Math.max(1, ...rows.map(r => r.n));
    $(el).innerHTML = rows.map(r => `<div class="bar"><span class="lbl">${esc(label(r))}</span><div class="track"><div class="fill" style="width:${Math.round(r.n / max * 100)}%"></div></div><b>${r.n}</b></div>`).join('');
  }
  function loadAnalytics() {
    $('#a-total').textContent = TOTAL;
    $('#a-links').textContent = LINKS.length;
    $('#a-today').textContent = BY_DAY[BY_DAY.length - 1].n;
    bars('#a-day', BY_DAY, r => r.d.slice(5));
    bars('#a-campaign', BY_CAMPAIGN, r => r.campaign);
    bars('#a-device', BY_DEVICE, r => r.device);
    bars('#a-geo', BY_GEO, r => r.country);
    $('#a-links-tbl tbody').innerHTML = LINKS.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.campaign)}</td><td><span class="pill">${l.scans}</span></td></tr>`).join('');
  }

  // Every action in the demo shows the approved line; nothing is created, saved or sent.
  document.addEventListener('click', e => { if (e.target.closest('[data-demo], #createBtn')) only(e); });
  ['n-name', 'n-campaign', 'n-property', 'n-target', 'n-id', 'n-fg', 'n-bg'].forEach(id => {
    const el = document.getElementById(id);
    el.readOnly = true;
    el.addEventListener('focus', () => toast(ONLY));
  });

  loadLinks();
})();
