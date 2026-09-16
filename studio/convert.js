/* convert.js: turn an old raw-HTML post into Markdown for the editor, but only when
   nothing is lost. Zero dependencies.

   The rule is proof, not trust: convert the HTML to Markdown, render that Markdown
   back with md.js, and compare the two pages. If they differ in anything a reader
   could see, the post stays as it is and the editor says why. Hand-coded posts
   (a file in essays/ with their own styles and scripts) are never converted.

   Treated as the same when comparing, because css/post.css styles them identically:
     <strong> and <b>     (.trp b,.trp strong)
     <blockquote> and <div class="pull">   (.trp .pull,.trp blockquote)
   plus whitespace between tags, and character references versus the characters. */
'use strict';
const { mdToHtml } = require('../md.js');

const NAMED = { rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–',
  hellip: '…', nbsp: ' ', middot: '·', rarr: '→', larr: '←', times: '×', copy: '©',
  trade: '™', eacute: 'é', apos: "'" };

// Decode every character reference except the four that must stay escaped in HTML text.
function decodeSoft(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, n) => {
    let ch;
    if (n[0] === '#') ch = String.fromCodePoint(n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : +n.slice(1));
    else ch = NAMED[n.toLowerCase()];
    if (ch == null || '&<>"'.includes(ch)) return m;
    return ch;
  });
}
function unesc(s) {
  return decodeSoft(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function normalize(html) {
  let s = decodeSoft(String(html));
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>');
  // a one-paragraph blockquote and the pull-quote module render the same
  s = s.replace(/<blockquote>\s*(?:<p>)?([\s\S]*?)(?:<\/p>)?\s*<\/blockquote>/g, '<div class="pull">$1</div>');
  s = s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  return s;
}

function inlineMd(h) {
  let s = h.replace(/\s*\n\s*/g, ' ');
  s = s.replace(/<code>([\s\S]*?)<\/code>/g, (_, c) => '`' + unesc(c) + '`');
  s = s.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/g, '**$1**');
  s = s.replace(/<em>([\s\S]*?)<\/em>/g, '*$1*');
  s = s.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, '[$2]($1)');
  return unesc(s).trim();
}

function htmlToMd(html) {
  const out = [];
  const re = /<(h2|h3|p|ul|ol|pre|blockquote|table|figure|div)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m, last = 0;
  while ((m = re.exec(html))) {
    if (html.slice(last, m.index).trim()) return null;       // stray text or an unknown element
    last = re.lastIndex;
    const [, tag, attrs = '', inner] = m;
    const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
    if (tag === 'h2' || tag === 'h3') out.push((tag === 'h2' ? '## ' : '### ') + inlineMd(inner));
    else if (tag === 'p') out.push(inlineMd(inner));
    else if (tag === 'ul' || tag === 'ol') {
      const items = inner.match(/<li>[\s\S]*?<\/li>/g) || [];
      out.push(items.map((li, n) => (tag === 'ul' ? '- ' : (n + 1) + '. ') + inlineMd(li.slice(4, -5))).join('\n'));
    } else if (tag === 'pre') {
      const kind = cls === 'prompt' ? 'prompt' : cls === 'tree' ? 'tree' : '';
      out.push('```' + kind + '\n' + unesc(inner.replace(/^<code>|<\/code>$/g, '')) + '\n```');
    } else if (tag === 'blockquote' || (tag === 'div' && cls === 'pull')) {
      out.push('> ' + inlineMd(inner.replace(/<\/?p>/g, ' ')));
    } else if (tag === 'div' && /^(note|warn|series|foot)$/.test(cls)) {
      const paras = inner.match(/<p>[\s\S]*?<\/p>/g) || [inner];
      out.push('> [!' + cls + ']\n' + paras.map(p => '> ' + inlineMd(p.replace(/<\/?p>/g, ''))).join('\n>\n'));
    } else return null;                                    // tables, figures, custom divs: keep as HTML
  }
  if (html.slice(last).trim()) return null;
  return out.join('\n\n') + '\n';
}

/* -> { ok: true, markdown } or { ok: false, reason } */
function checkPost(post) {
  if (post.body_format === 'markdown') return { ok: false, reason: 'Already in the editor.' };
  if (post.file || post.custom)
    return { ok: false, reason: 'Hand-coded page with its own layout and styles (' + (post.file || 'custom') + '). It stays as built; edit its settings here.' };
  if (typeof post.html !== 'string') return { ok: false, reason: 'No body to convert.' };
  const md = htmlToMd(post.html);
  if (md == null) return { ok: false, reason: 'Uses HTML the editor cannot express (tables, figures or custom blocks), so converting would change the page.' };
  if (normalize(mdToHtml(md)) !== normalize(post.html))
    return { ok: false, reason: 'A test conversion did not render identically, so the post stays as HTML.' };
  return { ok: true, markdown: md };
}

module.exports = { checkPost, htmlToMd, normalize };
