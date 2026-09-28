/* Reverse of the section engine: read a section's words back out of HTML.

   Given a section type (its template and field list) and the HTML a page ships
   today, find the field values that make the template render that exact HTML.
   This is how a hand-written page moves onto the section engine without anyone
   retyping its copy: extract, render, and the render must equal the original
   byte for byte (scripts/stack-convert.js checks that).

   Used by Claude when a new page or section design is converted. Not used by the
   build or by Studio. */
const path = require('path');
const S = require('../sections.js');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GLOBAL_NAMES = new Set(['amazon', 'isHome']);

function field(fields, name) { return (fields || []).find(f => f.key === name); }
function globalValue(globals, name) {
  if (name.startsWith('site.')) return name.slice(5).split('.').reduce((v, k) => v == null ? v : v[k], globals.site);
  return GLOBAL_NAMES.has(name) ? globals[name] : undefined;
}
const isGlobal = (globals, name) => name.startsWith('site.') || GLOBAL_NAMES.has(name);

/* Turn template nodes into a regex. With capture on, every slot is one group and
   `slots` says what each group means; nested parts are re-matched afterwards. */
function compile(nodes, fields, globals, capture) {
  let re = '';
  const slots = [];
  for (const n of nodes) {
    if (n.t === 'text') { re += esc(n.v); continue; }
    if (isGlobal(globals, n.name)) {
      const v = globalValue(globals, n.name);
      if (n.t === 'var') re += esc(String(v));
      else if ((n.t === '#') === !!v) re += compile(n.kids, fields, globals, false).re;
      continue;
    }
    if (n.t === 'var') {
      re += capture ? '([\\s\\S]*?)' : '[\\s\\S]*?';
      if (capture) slots.push({ kind: 'var', name: n.name });
      continue;
    }
    const def = n.name === '.' ? null : field(fields, n.name);
    if (!def) throw new Error('template uses {{' + n.t + n.name + '}} but section.json has no field "' + n.name + '"');
    const inner = n.t === '#' && def.type === 'list'
      ? compile(n.kids, def.fields, globals, false).re
      : compile(n.kids, def.type === 'object' || def.type === 'list' ? def.fields : fields, globals, false).re;
    if (n.t === '#' && def.type === 'list') {
      re += capture ? '((?:' + inner + ')*)' : '(?:' + inner + ')*';
      if (capture) slots.push({ kind: 'list', name: n.name, node: n, def });
    } else {
      re += capture ? '(' + inner + ')?' : '(?:' + inner + ')?';
      if (capture) slots.push({ kind: n.t === '^' ? 'inv' : 'cond', name: n.name, node: n, def });
    }
  }
  return { re, slots };
}

function extractNodes(nodes, text, fields, globals, where) {
  const { re, slots } = compile(nodes, fields, globals, true);
  const m = new RegExp('^' + re + '$').exec(text);
  if (!m) throw new Error(where + ': the template does not match.\n' + diagnose(nodes, text, fields, globals));
  const out = {};
  const set = (k, v) => {
    if (k in out && JSON.stringify(out[k]) !== JSON.stringify(v))
      throw new Error(where + ': "' + k + '" would need two different values: ' + JSON.stringify(out[k]).slice(0, 80) + ' vs ' + JSON.stringify(v).slice(0, 80));
    out[k] = v;
  };
  slots.forEach((s, i) => {
    const got = m[i + 1];
    if (s.kind === 'var') return set(s.name, got);
    if (s.kind === 'list') {
      const itemRe = new RegExp(compile(s.node.kids, s.def.fields, globals, false).re, 'y');
      const items = [];
      let pos = 0;
      while (pos < got.length) {
        itemRe.lastIndex = pos;
        const im = itemRe.exec(got);
        if (!im || !im[0].length) throw new Error(where + ': list "' + s.name + '" item ' + (items.length + 1) + ' does not match');
        const item = extractNodes(s.node.kids, im[0], s.def.fields, globals, where + ' > ' + s.name + '[' + items.length + ']');
        items.push(s.def.fields ? item : item['.']);
        pos = itemRe.lastIndex;
      }
      return set(s.name, items);
    }
    if (s.kind === 'inv') {
      if (got !== undefined) set(s.name, s.def.type === 'bool' ? false : '');
      else if (s.def.type === 'bool') set(s.name, true);
      return;
    }
    // cond
    if (got === undefined) { if (!(s.name in out)) out[s.name] = s.def.type === 'bool' ? false : s.def.type === 'object' ? null : ''; return; }
    if (s.def.type === 'object') return set(s.name, extractNodes(s.node.kids, got, s.def.fields, globals, where + ' > ' + s.name));
    if (s.def.type === 'bool') return set(s.name, true);
    const inner = extractNodes(s.node.kids, got, fields, globals, where + ' > ' + s.name);
    for (const [k, v] of Object.entries(inner)) set(k, v);
  });
  return out;
}

/* Find the first template node the text stops matching at, for a readable error. */
function diagnose(nodes, text, fields, globals) {
  let ok = 0;
  for (let k = 1; k <= nodes.length; k++) {
    try {
      const { re } = compile(nodes.slice(0, k), fields, globals, false);
      if (new RegExp('^' + re).test(text)) ok = k; else break;
    } catch (e) { break; }
  }
  const { re } = compile(nodes.slice(0, ok), fields, globals, false);
  const at = (new RegExp('^' + re).exec(text) || [''])[0].length;
  const n = nodes[ok];
  const what = !n ? 'end of template' : n.t === 'text' ? 'text ' + JSON.stringify(n.v.slice(0, 80)) : '{{' + n.t + n.name + '}}';
  return '  matched up to char ' + at + ', then expected ' + what + '\n  page has: ' + JSON.stringify(text.slice(at, at + 120));
}

function extractSection(type, html, globals) {
  const meta = S.sectionMeta(type);
  const nodes = S.parse(S.expand(S.readTpl(path.join(S.SEC_DIR, type, 'section.html'))), type);
  return extractNodes(nodes, html, meta.fields, globals, type);
}

module.exports = { extractSection, extractNodes, compile };
