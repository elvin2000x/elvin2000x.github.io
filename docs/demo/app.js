/*
 * Document Engine PUBLIC DEMO (elvinpeters.com/docs/demo/).
 * The screens, labels and report renderer are the live app's (api.elvinpeters.com/docs/). The differences:
 * no sign-in, no API (data comes from demo-data.js, CSP connect-src 'none'), inline handlers moved to
 * listeners (the CSP blocks inline script), page cites open an in-page page viewer instead of the page
 * image, and every action that would change something shows the demo line instead.
 */
(function () {
  'use strict';
  const DEMO = window.DEMO;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = x => '$' + Number(x || 0).toFixed(2);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const DOC = Object.fromEntries(DEMO.DOCS.map(d => [d.id, d]));
  const docByPrefix = p => DEMO.DOCS.find(d => d.id.startsWith(p));

  function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.style.background = bad ? '#b91c1c' : '#1a1a1a'; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4200); }
  const only = () => toast(DEMO.COPY.only);

  /* ---------- views ---------- */
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.hidden = true);
    $('#v-' + name).hidden = false;
    document.querySelectorAll('nav button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === name));
    store.set('de_demo_view', name);
    ({ chat: loadChat, documents: loadDocs, tasks: loadTasks, artifacts: loadRuns, credits: loadCredits, account: loadAccount, help: () => {} })[name]();
  }
  document.querySelectorAll('nav button[data-v]').forEach(b => b.onclick = () => showView(b.dataset.v));

  const totalFacts = DEMO.DOCS.reduce((n, d) => n + d.facts.length, 0);
  function setHeader() { $('#hdr-sub').textContent = `· ${DEMO.WORKSPACE.name} · ${DEMO.DOCS.length} docs · ${totalFacts} facts · ${money(DEMO.CREDITS.remaining_usd)} credits`; }

  /* ---------- documents ---------- */
  function loadDocs() {
    $('#drop-hint').textContent = `Accepted: ${DEMO.LIMITS.extensions.join(' ')} · up to ${DEMO.LIMITS.max_upload_mb} MB per file`;
    $('#doc-count').textContent = DEMO.DOCS.length;
    $('#start').hidden = store.get('de_demo_start_hidden') === '1';
    $('#start-chips').innerHTML = chips(curMode().examples);
    const tb = $('#docs tbody'); tb.innerHTML = '';
    for (const d of DEMO.DOCS) {
      const parent = d.parent_document_id && DOC[d.parent_document_id];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${parent ? '<span class="muted small">↳ from ' + esc(parent.filename) + '</span><br>' : ''}<a href="#" data-page="${d.id}:1">${esc(d.filename)}</a>
        <div class="small muted">${d.file_kind}${d.ledger_candidate ? ' · <span class=warn>ledger candidate</span>' : ''}</div></td>
        <td><span class="pill">${esc(d.doc_type || 'unclassified')}</span></td><td class="hide-m">${d.page_count}</td>
        <td>${d.ocr_applied ? `<span class="${d.needs_review ? 'warn' : 'ok'}">${(d.ocr_confidence ?? 0).toFixed(2)}${d.needs_review ? ' review' : ''}</span>` : '<span class="muted">digital</span>'}</td>
        <td class="facts">${d.facts.map(f => `${esc(f.field)}: <b>${esc(f.value_text)}</b> <a href="#" data-page="${d.id}:${f.page_number}" data-hl="${esc(f.value_text)}">p${f.page_number}</a> ${f.verified ? '<span class=ok>✓</span>' : '<span class=warn>?</span>'}`).join('<br>') || '<span class="muted">no extracted fields</span>'}<div style="margin-top:6px"><button class="secondary small" data-askdoc="${d.id}">Ask about this file</button></div></td>`;
      tb.appendChild(tr);
    }
  }
  function search() {
    const q = $('#q').value.trim().toLowerCase(), o = $('#searchout'); o.hidden = false;
    if (!q) { o.textContent = '[]'; return; }
    const hits = [];
    for (const d of DEMO.DOCS) {
      for (const f of d.facts) if ((f.field + ' ' + f.value_text).toLowerCase().includes(q)) hits.push({ document: d.filename, page: f.page_number, fact: f.field, value: f.value_text });
      const pages = DEMO.PAGES[d.id] || {};
      for (const [p, text] of Object.entries(pages)) {
        const i = text.toLowerCase().indexOf(q);
        if (i >= 0) hits.push({ document: d.filename, page: Number(p), snippet: text.slice(Math.max(0, i - 40), i + q.length + 40).replace(/\s+/g, ' ') });
      }
    }
    o.textContent = JSON.stringify(hits, null, 1);
  }
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', only); // no file is opened or read in the demo
  drop.addEventListener('click', only);
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); only(); } });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  /* ---------- page viewer (the live app opens the page image) ---------- */
  function showPage(docId, page, hl) {
    const d = DOC[docId]; if (!d) return;
    const text = (DEMO.PAGES[docId] || {})[page];
    $('#pv-name').textContent = `${d.filename} · page ${page} of ${d.page_count}`;
    let html = text ? esc(text) : `<span class="muted">Page ${page} of ${esc(d.filename)}.</span>`;
    if (text && hl) { const h = esc(hl); html = html.split(h).join(`<mark>${h}</mark>`); }
    $('#pv-page').innerHTML = html;
    $('#pv-foot').textContent = d.ocr_applied ? `Scan · OCR confidence ${d.ocr_confidence.toFixed(2)}${d.needs_review ? ' · needs review' : ''}` : 'Digital text';
    $('#pv-modal').hidden = false;
    $('#pv-modal [data-act="pv-close"]').focus();
  }
  const closePage = () => { $('#pv-modal').hidden = true; };
  $('#pv-modal').addEventListener('click', e => { if (e.target.id === 'pv-modal') closePage(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#pv-modal').hidden) closePage(); });

  /* ---------- report renderer: the live app's, cites point at the page viewer ---------- */
  const CITE_RE = /\\?\[doc:([0-9a-f]{8})[0-9a-f]*((?:[\s,]+(?:pp?\.?|pages?)\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*(?:pp?\.?\s*)?\d+(?:\s*[-–]\s*\d+)?)*)?)\s*\\?\]/g;
  function inlineMd(s) {
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[\s(>])_([^_\n]+)_(?=[\s).,;:!?<]|$)/g, '$1<i>$2</i>');
    s = s.replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s).,;:!?<]|$)/g, '$1<i>$2</i>');
    s = s.replace(CITE_RE, (m, id, rest) => {
      const pages = (rest.match(/\d+(?:\s*[-–]\s*\d+)?/g) || []).map(x => x.replace(/\s*[-–]\s*/, '-'));
      const d = docByPrefix(id);
      if (!d) return `<span class="cite dead" title="Unresolved source">${pages.length ? 'p' + pages.join(', ') : 'source?'}</span>`;
      return (pages.length ? pages : ['1']).map(p => `<a class="cite" href="#" data-page="${d.id}:${parseInt(p, 10)}" title="${esc(d.filename)}">p${p}</a>`).join('');
    });
    s = s.replace(/\[computed: ([^\]]+)\]/g, '<span class="cite calc" title="computed in code and recomputed by the verifier: $1">calc</span>');
    s = s.replace(/\\?\[(?:doc|fact|calc):[^\]\n]{0,120}\\?\]/g, '');
    return s;
  }
  function renderMd(md) {
    const inl = inlineMd;
    const lines = esc(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [], stack = []; let para = [];
    const flush = () => { if (para.length) { out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; } };
    const closeTo = ind => { while (stack.length && stack[stack.length - 1].indent > ind) out.push('</li></' + stack.pop().type + '>'); };
    const isItem = l => /^\s*([-*+]|\d+[.)])\s+/.test(l || '');
    const isRule = r => /^\|?\s*:?-{3,}/.test(r);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], t = raw.trim();
      if (!t) { flush(); if (!isItem(lines[i + 1])) closeTo(-1); continue; }
      if (t.startsWith('|')) {
        flush(); closeTo(-1);
        const block = []; while (i < lines.length && lines[i].trim().startsWith('|')) { block.push(lines[i].trim()); i++; } i--;
        const head = block.length > 1 && isRule(block[1]);
        const rowsT = block.filter(r => !isRule(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        let h = '<div class="tbl"><table>';
        rowsT.forEach((r, k) => { const th = head && k === 0; h += (th ? '<thead>' : (head && k === 1 ? '<tbody>' : '')) + '<tr>' + r.map(c => th ? `<th>${inl(c)}</th>` : `<td>${inl(c)}</td>`).join('') + '</tr>' + (th ? '</thead>' : ''); });
        out.push(h + (head && rowsT.length > 1 ? '</tbody>' : '') + '</table></div>'); continue;
      }
      const hm = t.match(/^(#{1,6})\s+(.*)$/);
      if (hm) { flush(); closeTo(-1); const n = Math.min(hm[1].length, 4); out.push(`<h${n}>${inl(hm[2])}</h${n}>`); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); closeTo(-1); out.push('<hr>'); continue; }
      const lm = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (lm) {
        flush();
        const ind = lm[1].replace(/\t/g, '    ').length, type = /\d/.test(lm[2]) ? 'ol' : 'ul';
        const top = stack[stack.length - 1];
        if (!top || ind > top.indent) { out.push(`<${type}>`); stack.push({ type, indent: ind }); }
        else {
          closeTo(ind); const cur = stack[stack.length - 1];
          if (!cur) { out.push(`<${type}>`); stack.push({ type, indent: ind }); }
          else if (cur.type !== type && cur.indent === ind) { out.push('</li></' + stack.pop().type + `><${type}>`); stack.push({ type, indent: ind }); }
          else out.push('</li>');
        }
        out.push('<li>' + inl(lm[3])); continue;
      }
      if (stack.length && /^\s+/.test(raw)) { out.push(' ' + inl(t)); continue; }
      closeTo(-1); para.push(t);
    }
    flush(); closeTo(-1);
    return out.join('\n');
  }
  function citeIndex(md) {
    const idx = {}; let n = 0;
    String(md || '').replace(CITE_RE, (m, id, rest) => { const d = docByPrefix(id); idx['c' + (++n)] = { marker: m, document: d ? d.filename : null, pages: (rest.match(/\d+/g) || []).map(Number) }; return m; });
    return idx;
  }

  /* ---------- files produced by a run (downloads are off in the demo) ---------- */
  function fmtBytes(b) { if (b == null) return ''; return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function filesHtml(files) {
    if (!files || !files.length) return '';
    return '<div class="files">' + files.map(f => `<a class="file" href="#" data-act="only"><span class="kind">${esc((f.kind || 'file').toUpperCase())}</span><span>${esc(f.label || f.name)}</span><span class="muted small">${fmtBytes(f.bytes)}</span></a>`).join('') + '</div>';
  }

  /* ---------- chat ---------- */
  let CHAT = store.get('de_demo_chat') || DEMO.CHATS[0].id;
  function loadChat() {
    $('#chat-list').innerHTML = DEMO.CHATS.map(c => `<button class="${CHAT === c.id ? 'active' : ''}" data-chat="${c.id}"><span class="t">${esc(c.title || 'New chat')}</span><span class="small muted">${c.document_name ? 'about ' + esc(c.document_name) + ' · ' : ''}${c.messages.length} msgs · ${money(c.cost_usd)}</span></button>`).join('');
    renderChat();
  }
  function msgEl(role, html, meta) { const d = document.createElement('div'); d.className = 'msg ' + role; d.innerHTML = html + (meta ? `<div class="meta">${meta}</div>` : ''); return d; }
  function renderChat() {
    const c = DEMO.CHATS.find(x => x.id === CHAT) || DEMO.CHATS[0]; CHAT = c.id;
    $('#chat-title').textContent = c.title || 'Chat'; $('#chat-del').hidden = false;
    const box = $('#msgs'); box.innerHTML = '';
    for (const m of c.messages) {
      if (m.role === 'user') box.appendChild(msgEl('user', esc(m.content)));
      else box.appendChild(msgEl('bot', renderMd(m.content) + filesHtml(m.files), `${m.tools || 0} lookups · ${money(m.cost_usd)}${m.artifact ? ' · <a href="#" data-goto="artifacts">report in Artifacts</a>' : ''}`));
    }
    box.scrollTop = box.scrollHeight;
  }
  function openChat(id) { CHAT = id; store.set('de_demo_chat', id); loadChat(); }
  $('#chat-text').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); only(); } });

  /* ---------- modes and tasks ---------- */
  function curMode() { return DEMO.MODES.find(m => m.key === DEMO.WORKSPACE.mode) || DEMO.MODES[0]; }
  function chips(ex) { return (ex || []).map(e => `<button data-prompt>${esc(e)}</button>`).join(''); }
  function renderMode() {
    const m = curMode();
    $('#task-mode').innerHTML = DEMO.MODES.map(x => `<option value="${x.key}" ${x.key === m.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
    $('#mode-blurb').textContent = m.blurb || '';
    $('#task-chips').innerHTML = chips(m.examples);
    $('#oneclick').hidden = !(m.tasks && m.tasks.length);
  }
  function loadTasks() { renderMode(); $('#task-credit').textContent = `${money(DEMO.CREDITS.remaining_usd)} credits remaining · ${DEMO.DOCS.length} documents in workspace`; }
  $('#task-mode').addEventListener('change', () => { only(); renderMode(); }); // changing the mode saves it on the server
  function tryPrompt(b) { showView('tasks'); $('#task-text').value = b.textContent; $('#task-text').focus(); toast('Prompt loaded. Press Run when your files are in.'); }

  /* ---------- artifacts ---------- */
  function loadRuns() {
    const tb = $('#runs tbody'); tb.innerHTML = '';
    for (const r of DEMO.RUNS) {
      const v = r.verification; const tr = document.createElement('tr');
      tr.innerHTML = `<td class="small">${esc(r.started_at).replace('T', ' ').slice(0, 16)}</td><td>${esc(r.task_key)}<div class="small muted">${esc((r.instructions || '').slice(0, 90))}</div></td>
        <td class="${r.status === 'done' ? 'ok' : 'warn'}">${esc(r.status)}</td>
        <td class="small">${v ? `${v.verified} ✓ · ${v.unverified} ? · ${v.failed} ✗ ${v.blocked ? '<span class=bad>blocked</span>' : '<span class=ok>clear</span>'}` : ''}</td>
        <td class="small">${money(r.cost_usd)}</td><td>${(r.md || (r.deliverables || []).length) ? `<button class="secondary" data-run="${r.id}">${r.md ? 'view' : 'files'}</button>` : ''}${(r.deliverables || []).length ? `<div class="small muted">${r.deliverables.length} file(s)</div>` : ''}</td>`;
      tb.appendChild(tr);
    }
  }
  function showArtifact(id) {
    const run = DEMO.RUNS.find(r => r.id === id) || {};
    $('#art-box').hidden = false;
    $('#art-title').textContent = (run.task_key || 'Artifact').replace(/_/g, ' ');
    const files = run.deliverables || [];
    $('#art-files').innerHTML = files.length ? '<div class="files-h">Files to download</div>' + filesHtml(files) : '';
    $('#art').hidden = !run.md;
    $('#art').innerHTML = run.md ? renderMd(run.md) : '';
    $('#art-cites').textContent = JSON.stringify(citeIndex(run.md), null, 1);
    const names = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', md: 'Markdown' };
    const dl = ['pdf', 'docx', 'xlsx', 'md'].filter(f => run.files && run.files[f]).map(f => `<a class="btn-dl" href="#" data-act="only">${names[f]}</a>`);
    dl.push('<button class="secondary" data-act="only">Feedback on this report</button>');
    $('#art-dl').innerHTML = dl.join(' ');
    $('#art-tr').textContent = JSON.stringify(run.transcript || [], null, 1);
    $('#art-box').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- credits ---------- */
  function loadCredits() {
    const c = DEMO.CREDITS;
    $('#cr-remaining').innerHTML = `${money(c.remaining_usd)} <span class="muted small">remaining</span>`;
    $('#cr-detail').textContent = `${money(c.topups_usd)} added · ${money(c.spent_usd)} spent over ${c.calls} model calls · ${c.input_tokens.toLocaleString()} in / ${c.output_tokens.toLocaleString()} out tokens · ${c.model} at $${c.pricing.input}/M in, $${c.pricing.output}/M out`;
    $('#cr-calls tbody').innerHTML = c.recent_calls.map(x => `<tr><td class="small">${esc(x.called_at).replace('T', ' ').slice(0, 16)}</td><td>${esc(x.purpose)}</td><td>${x.input_tokens}</td><td>${x.output_tokens}</td><td>${x.cache_read || 0}</td><td>${money(x.cost_usd)}</td></tr>`).join('');
    $('#cr-topups tbody').innerHTML = c.topups.map(t => `<tr><td class="small">${esc(t.created_at).replace('T', ' ').slice(0, 16)}</td><td>${money(t.amount_usd)}</td><td>${esc(t.note)}</td></tr>`).join('');
  }

  /* ---------- account ---------- */
  function loadAccount() { $('#acct').innerHTML = `<b>${esc(DEMO.USER.label)}</b> · role ${esc(DEMO.USER.role)} · workspace ${esc(DEMO.WORKSPACE.name)}`; }

  /* ---------- one click handler for the whole page ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-page],[data-act],[data-chat],[data-run],[data-prompt],[data-askdoc],[data-goto]');
    if (!t) return;
    if (t.tagName === 'A') e.preventDefault();
    if (t.dataset.page) { const [id, p] = t.dataset.page.split(':'); showPage(id, Number(p), t.dataset.hl); return; }
    if (t.dataset.chat) return openChat(t.dataset.chat);
    if (t.dataset.run) return showArtifact(t.dataset.run);
    if (t.hasAttribute('data-prompt')) return tryPrompt(t);
    if (t.dataset.goto) return showView(t.dataset.goto);
    if (t.dataset.askdoc) { const c = DEMO.CHATS.find(x => x.document_id === t.dataset.askdoc); if (c) { showView('chat'); openChat(c.id); } else only(); return; }
    const act = t.dataset.act;
    if (act === 'pv-close') return closePage();
    if (act === 'search') return search();
    if (act === 'hide-start') { store.set('de_demo_start_hidden', '1'); $('#start').hidden = true; return; }
    only(); // feedback, run, send, new chat, delete, downloads, sign out, password, delete files
  });

  setHeader();
  const v = store.get('de_demo_view');
  showView(['chat', 'documents', 'tasks', 'artifacts', 'credits', 'help', 'account'].includes(v) ? v : 'documents');
})();
