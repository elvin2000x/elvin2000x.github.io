/* Anatomy Sandbox install hook (card #421): registers the service worker and, when the page runs as an installed app
   or from a campus link (?c=), saves every model file for offline use and shows a small "Saved for offline" note.
   A plain visit only caches what it opens, so a friend on a phone never downloads 27 MB they didn't ask for. */
(() => {
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) return;
  const installed = matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone;
  const campus = new URLSearchParams(location.search).get('c');
  const wantAll = installed || !!campus;
  // A campus install must keep opening as the campus link, so it gets its own manifest: start_url and id are that
  // link. A blob: manifest can't resolve relative URLs, so every URL in it is absolute.
  const link = document.querySelector('link[rel="manifest"]');
  if (campus && link) {
    const here = new URL('./', location.href).href;
    fetch(link.href).then((r) => r.json()).then((m) => {
      const start = here + '?c=' + encodeURIComponent(campus);
      m.start_url = start; m.id = start; m.scope = here;
      m.icons = (m.icons || []).map((i) => ({ ...i, src: new URL(i.src, here).href }));
      link.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    }).catch(() => { /* keeps the plain manifest */ });
  }
  let note;
  const show = (text, ms) => {
    if (!note) {
      note = document.createElement('div');
      note.setAttribute('role', 'status');
      note.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;padding:6px 10px;border-radius:8px;'
        + 'font:12px/1.3 system-ui,sans-serif;background:rgba(19,32,30,.82);color:#fff;pointer-events:none';
      document.body.appendChild(note);
    }
    note.textContent = text; note.hidden = false;
    clearTimeout(note.t); if (ms) note.t = setTimeout(() => { note.hidden = true; }, ms);
  };
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'offline-progress' && m.done < m.total) show(`Saving for offline use: ${m.done} of ${m.total} files`);
    if (m.type === 'offline-done') {
      let seen = '';
      try { seen = localStorage.getItem('as-offline') || ''; localStorage.setItem('as-offline', m.ok ? m.version : ''); } catch { /* private window */ }
      if (!m.ok) show('Not all of it saved for offline yet. It will finish next time you open it online.', 6000);
      else if (seen !== m.version) show('Saved for offline use. It works without internet now.', 5000);
      else if (note) note.hidden = true;
    }
  });
  addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      if (!wantAll) return;
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const reg = await navigator.serviceWorker.ready;
      (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'offline-all' });
    } catch { /* no offline copy; the page still works online */ }
  });
})();
