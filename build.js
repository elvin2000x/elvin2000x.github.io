// build.js — the site's one build engine. Rung 1 scope: essays (folds the old
// build_blog.js in, with the corrected site nav). Run: node build.js
// Preview mode: node build.js --out <dir>  (writes generated files there instead)
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : DIR;
const essays = JSON.parse(fs.readFileSync(path.join(DIR, 'essays.json'), 'utf8'));

const GA = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CLZ7N26J1Q"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-CLZ7N26J1Q');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1699232654449762');fbq('track','PageView');</script>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;

const CSS = `
:root{--bg:#e6ebf1;--bg-2:#dde4ec;--panel:#ffffff;--panel-2:#f3f6fa;--line:#c3cedd;--line-soft:#d3dce8;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#4f6076;--gold:#9c761f;--gold-2:#7a5a12;--cyan:#1c6ea8;--glow:rgba(156,118,31,.14);--shadow:0 18px 40px -24px rgba(14,26,43,.45);--serif:'EB Garamond',Georgia,'Times New Roman',serif;--sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0a1524;--bg-2:#060d18;--panel:#1b2c45;--panel-2:#131f33;--line:#2b405c;--line-soft:#223351;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#8ba2bd;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--glow:rgba(201,162,80,.16);--shadow:0 24px 50px -28px rgba(0,0,0,.7)}}
:root[data-theme="light"]{--bg:#e6ebf1;--bg-2:#dde4ec;--panel:#ffffff;--panel-2:#f3f6fa;--line:#c3cedd;--line-soft:#d3dce8;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#4f6076;--gold:#9c761f;--gold-2:#7a5a12;--cyan:#1c6ea8;--shadow:0 18px 40px -24px rgba(14,26,43,.45)}
:root[data-theme="dark"]{--bg:#0a1524;--bg-2:#060d18;--panel:#1b2c45;--panel-2:#131f33;--line:#2b405c;--line-soft:#223351;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#8ba2bd;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--shadow:0 24px 50px -28px rgba(0,0,0,.7)}
*{box-sizing:border-box}html,body{margin:0}
body{background:linear-gradient(180deg,var(--bg),var(--bg-2));color:var(--ink);font-family:var(--sans);line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 80%,transparent);border-bottom:1px solid var(--line-soft)}
.nav .in{max-width:1120px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:20px}
.brandmark{display:flex;align-items:center;gap:11px;font-family:var(--serif);font-size:18px}
.brandmark .sig{width:32px;height:32px;border:1px solid var(--line);border-radius:9px;display:grid;place-items:center;background:var(--panel)}
.nav .lk{margin-left:auto;display:flex;gap:24px;align-items:center}
.nav .lk a{font-size:14px;color:var(--ink-2)}.nav .lk a:hover{color:var(--ink)}
.themebtn{width:44px;height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:none;border:1px solid var(--line);border-radius:10px;color:var(--ink-2);cursor:pointer;font-size:15px;line-height:1}
.nav .lk a.cta{border:1px solid var(--gold);color:var(--gold-2);padding:11px 16px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;min-height:44px}
.eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-2);font-weight:600}
article{max-width:720px;margin:0 auto;padding:44px 24px 40px}
.arthead .cover{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:26px}
article h1{font-family:var(--serif);font-weight:400;font-size:clamp(2rem,4.6vw,3rem);line-height:1.08;letter-spacing:-.015em;margin:14px 0 0;text-wrap:balance}
.dek{font-size:1.2rem;color:var(--ink-2);margin:16px 0 0;font-family:var(--serif);font-style:italic}
.byline{display:flex;gap:14px;align-items:center;margin:22px 0 0;padding-bottom:26px;border-bottom:1px solid var(--line-soft);font-size:14px;color:var(--muted)}
.byline b{color:var(--ink-2);font-weight:600}
.body{font-size:18px;color:var(--ink)}
.body h2{font-family:var(--serif);font-weight:600;font-size:1.6rem;letter-spacing:-.01em;margin:38px 0 12px;line-height:1.2}
.body p{margin:0 0 20px}
.body ul{margin:0 0 20px;padding-left:22px}.body li{margin:0 0 8px}
.body blockquote{margin:26px 0;padding:4px 0 4px 22px;border-left:3px solid var(--gold);font-family:var(--serif);font-style:italic;font-size:1.25rem;color:var(--ink-2)}
.body strong{color:var(--ink);font-weight:700}
.body code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:var(--panel-2);border:1px solid var(--line-soft);border-radius:5px;padding:1px 6px}
.endcta{max-width:720px;margin:10px auto 0;padding:0 24px}
.endcta .card{background:linear-gradient(160deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:28px;text-align:center}
.endcta h3{font-family:var(--serif);font-weight:400;font-size:1.6rem;margin:0}
.endcta p{color:var(--ink-2);margin:10px 0 18px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px;border:1px solid transparent;cursor:pointer;font-family:var(--sans);background:transparent}
.btn.primary{background:linear-gradient(135deg,var(--gold),var(--gold-2));color:#1b1304}
.btn.ghost{border-color:var(--line);color:var(--ink);min-height:44px}
.backlink{display:inline-flex;gap:8px;align-items:center;color:var(--muted);font-size:14px;margin-bottom:8px}
footer{border-top:1px solid var(--line-soft);padding:30px 24px;color:var(--muted);font-size:13px;margin-top:56px}
footer .in{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{padding:10px 4px;margin:-10px -4px}
footer a:hover{color:var(--gold-2)}
:focus-visible{outline:2px solid var(--gold-2);outline-offset:3px;border-radius:4px}
@media(max-width:640px){.nav .lk a:not(.cta){display:none}}
`;

const NAV = `<nav class="nav"><div class="in">
  <a class="brandmark" href="/"><span class="sig"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 5v14M6 5h9M6 12h7M6 19h9" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/><circle cx="19.5" cy="18.6" r="1.9" fill="var(--gold)"/></svg></span>Elvin&nbsp;Peters</a>
  <div class="lk"><a href="/services/">Services</a><a href="/projects/">Projects</a><a href="/contact/">Contact</a><a class="cta" href="/book.html">Read the book</a></div>
</div></nav>`;

const FOOT = `<footer><div class="in"><span>&copy; 2026 Elvin Peters. Built and hosted by hand.</span><span><a href="/writing/">Blog</a> &middot; <a href="/book.html">The book</a> &middot; <a href="/updates/">Newsletter</a> &middot; Toronto</span></div></footer>`;

const THEME = `<script>(function(){var r=document.documentElement;document.addEventListener('click',function(e){if(e.target.closest('#tg')){var d=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');r.setAttribute('data-theme',d==='dark'?'light':'dark')}})})();</script>`;

const NLCSS = `
.nlrow{display:flex;gap:10px;max-width:440px;margin:18px auto 0;flex-wrap:wrap;justify-content:center}
.nlrow input{flex:1;min-width:210px;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:16px;font-family:var(--sans)}
.nlmsg{font-size:14px;color:var(--muted);margin:10px 0 0;min-height:18px}
.ctarow{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px}
`;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function head(title, desc, ogimg, canon){
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Elvin Peters</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="https://elvinpeters.com${ogimg}"><meta property="og:url" content="${canon}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:creator" content="@elvin_peters">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 5v14M6 5h9M6 12h7M6 19h9' stroke='%23c9a250' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='19.5' cy='18.6' r='1.9' fill='%23c9a250'/%3E%3C/svg%3E">
${GA}${FONTS}<style>${CSS}${NLCSS}</style></head><body>`;
}

// End-of-post CTA: book first, services second, owned newsletter capture third.
// Posts to the owned lead API (same pattern + bot-wall as the homepage form).
const ENDCTA = `<section class="endcta"><div class="card">
<h3>Liked this? The book goes deeper.</h3>
<p>The Artificial Advantage: the frameworks behind everything here, written for professionals, not programmers.</p>
<div class="ctarow"><a class="btn primary" href="/book.html">Read The Artificial Advantage</a><a class="btn ghost" href="/services/">Work with me</a></div>
<form id="nlform" class="nlrow" novalidate><input type="text" name="website" value="" style="position:absolute;left:-5000px" tabindex="-1" autocomplete="off" aria-hidden="true"><input id="nlemail" type="email" name="email" required placeholder="you@work.com" aria-label="Email address"><button class="btn ghost" type="submit">Get new posts</button></form>
<p class="nlmsg" id="nlmsg"></p>
<script>(function(){var f=document.getElementById('nlform'),m=document.getElementById('nlmsg');if(!f)return;f.addEventListener('submit',function(ev){ev.preventDefault();var em=document.getElementById('nlemail').value.trim();if(!em){m.textContent='Enter your email first.';return}m.textContent='One sec…';fetch('https://ultimateaidirectory.com/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,source:'newsletter-blog-'+location.pathname.split('/').filter(Boolean).pop(),website:f.website.value})}).then(function(r){return r.json().catch(function(){return{}})}).then(function(){m.textContent='Done. Watch your inbox.';f.reset()}).catch(function(){m.textContent='That did not go through. Try again in a minute.'})})})();</script>
</div></section>`;

// The blog post design system. Spec: BLOG-DESIGN-SYSTEM.md (canonical 2026-08-07).
// Shell, type, neutrals and the shared module library live in css/post.css and are
// scoped under .trp; each post file carries only its own modules. Every post ships
// fixed dark and opens on type, never a hero photograph.
const POSTCSS = `<link rel="stylesheet" href="/css/post.css">`;

fs.mkdirSync(path.join(OUT,'writing'), {recursive:true});
const cards = [];
for(const e of essays){
  const canon = `https://elvinpeters.com/writing/${e.slug}/`;
  const img = `/img/${e.image}`;
  const og = e.og ? `/img/${e.og}` : img;
  const body = e.file ? fs.readFileSync(path.join(DIR, e.file), 'utf8') : e.html;
  const accent = e.accent || 'amber';
  let page;
  if(e.custom){
    // Custom-bodied post: the body file brings its own post-specific styles,
    // markup and scripts. build.js supplies head, nav, CTA, footer, analytics.
    page = head(e.title, e.dek, og, canon) + NAV + body + ENDCTA + FOOT + THEME + `</body></html>`;
  } else {
    // Standard post: the design system's shell and header pattern wrapped around
    // the essay's own HTML. Content is never rewritten here, only skinned.
    page = head(e.title, e.dek, og, canon) + NAV +
    `<div class="trp accent-${accent}"><div class="wrap">`+
      `<div class="col"><a class="trp-back" href="/writing/">&larr; Blog</a></div>`+
      `<header class="col" style="padding-top:26px">`+
        `<div class="eyebrow">${esc(e.kicker||'Playbook')}</div>`+
        `<h1>${esc(e.title)}</h1>`+
        `<p class="dek">${esc(e.dek)}</p>`+
        `<div class="byline">Elvin Peters${e.date?' &middot; '+esc(e.date):''} &middot; ${e.readmins||8} min read</div>`+
      `</header>`+
      `<div class="col">${body}</div>`+
    `</div></div>`+
    ENDCTA +
    FOOT + THEME + `</body></html>`;
  }
  // Every post ships fixed dark, and loads the shared post stylesheet.
  page = page.replace('<html lang="en">', '<html lang="en" data-theme="dark">')
             .replace('</head>', POSTCSS + '</head>');
  fs.mkdirSync(path.join(OUT,'writing',e.slug), {recursive:true});
  fs.writeFileSync(path.join(OUT,'writing',e.slug,'index.html'), page);
  cards.push({slug:e.slug,title:e.short_title||e.title,dek:e.short_dek||e.dek,image:e.image,readmins:e.readmins||8});
}

// writing index page
const list = head('Blog','Posts on building software, games, and a company of one with AI as a co-worker.','/img/og.jpg','https://elvinpeters.com/writing/') + NAV +
  `<article style="max-width:820px"><span class="eyebrow">Blog</span><h1 style="margin-bottom:6px">Notes from a workshop of one.</h1><p class="dek" style="margin-bottom:30px">How I actually build: the harness around the AI, the zero-dependency habit, the tools that let one person ship like a team.</p>`+
  essays.map(e=>`<a href="/writing/${e.slug}/" style="display:grid;grid-template-columns:150px 1fr;gap:18px;padding:18px 0;border-top:1px solid var(--line-soft);align-items:center">`+
    `<img src="/img/${e.image}" alt="" width="150" height="94" loading="lazy" style="aspect-ratio:16/10;object-fit:cover;border-radius:10px;border:1px solid var(--line)">`+
    `<span><span class="eyebrow">Post${e.date?' &middot; '+e.date:''} &middot; ${e.readmins||8} min</span><h2 style="font-family:var(--serif);font-weight:600;font-size:1.35rem;margin:6px 0 4px">${esc(e.title)}</h2><span style="color:var(--ink-2);font-size:14px">${esc(e.dek)}</span></span></a>`).join('')+
  `</article>`+FOOT+THEME+`</body></html>`;
fs.writeFileSync(path.join(OUT,'writing','index.html'), list);

// homepage "Writing" section cards fragment — matches the homepage card markup
// exactly (short display fields when present), ready to become an ep: region.
const frag = cards.map(c=>
`      <a class="card" href="/writing/${c.slug}/">
        <div class="thumb" style="background-image:url(/img/${c.image})"></div>
        <div class="body"><div class="kicker"><span class="tag">Post</span><span class="pill read">${c.readmins} min</span></div>
        <h3>${esc(c.title)}</h3><p class="desc">${esc(c.dek)}</p><span class="go">Read <span class="arw">→</span></span></div>
      </a>`).join('\n');
fs.writeFileSync(path.join(OUT,'writing','_homepage_cards.html'), frag);

console.log('Built', essays.length, 'essays -> writing/<slug>/ + writing/ index', OUT !== DIR ? `(out: ${OUT})` : '');


/* ==========================================================================
   REGION ENGINE (CMS layer) — content/*.json renders into marked regions:
   <!-- ep:name --> ... <!-- /ep:name -->
   Pages without markers are never touched. Unknown or unbalanced markers are
   hard errors. In --out mode, region-applied copies are written to OUT and
   the repo files stay untouched (Site Studio preview uses this).
   ========================================================================== */
const NAVC = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'nav.json'), 'utf8'));
const HOME = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'home.json'), 'utf8'));
const SVCS = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'services.json'), 'utf8'));

const NAV_SVG_SIG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 5v14M6 5h9M6 12h7M6 19h9" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/><circle cx="19.5" cy="18.6" r="1.9" fill="var(--gold)"/></svg>`;
const NAV_SVG_ARROW = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HERO_SVG_ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderNav(pageKey) {
  const pg = (NAVC.pages || {})[pageKey] || {};
  const ind = ' '.repeat(pg.indent || 0);
  const cta = pg.cta || NAVC.cta;
  const links = NAVC.links.map(l => {
    let href = l.href;
    if (href === '/#about' && pg.aboutHref) href = pg.aboutHref;
    const active = pg.active && l.href === pg.active ? ' class="active"' : '';
    return `${ind}    <a href="${href}"${active}>${esc(l.label)}</a>`;
  });
  const brand = pg.brandStyle === 'multiline'
    ? `${ind}  <a class="brandmark" href="${pg.brandHref || '/'}">\n${ind}    <span class="sig">${NAV_SVG_SIG}</span>\n${ind}    ${esc(NAVC.brand).replace(' ', '&nbsp;')}\n${ind}  </a>`
    : `${ind}  <a class="brandmark" href="${pg.brandHref || '/'}"><span class="sig">${NAV_SVG_SIG}</span>${esc(NAVC.brand).replace(' ', '&nbsp;')}</a>`;
  const tail = [];
  if (pg.themebtn) tail.push(`${ind}    <button class="themebtn" id="themeBtn" data-theme-toggle aria-label="Toggle light or dark theme">\u25d1</button>`);
  tail.push(`${ind}    <a class="cta" href="${cta.href}">${esc(cta.label)}${pg.ctaArrow ? ' ' + NAV_SVG_ARROW : ''}</a>`);
  return [`${ind}<nav class="nav"><div class="container">`, brand,
          `${ind}  <div class="links">`, ...links, ...tail,
          `${ind}  </div>`, `${ind}</div></nav>`].join('\n');
}

function renderHeroText() {
  const h = HOME.hero;
  return [
    `      <div class="herotext">`,
    `        <span class="eyebrow">${esc(h.eyebrow)}</span>`,
    `        <h1>${esc(h.headline_1)}<br><span class="amp">${esc(h.headline_2)}</span></h1>`,
    `        <p class="lede">${esc(h.lede)}</p>`,
    `        <div class="actions">`,
    `          <a class="btn primary" href="${h.cta_primary.href}">${esc(h.cta_primary.label)} ${HERO_SVG_ARROW}</a>`,
    `          <a class="btn ghost" href="${h.cta_secondary.href}">${esc(h.cta_secondary.label)}</a>`,
    `        </div>`,
    `      </div>`].join('\n');
}

function renderHomeServices() {
  const out = [];
  for (const b of SVCS.buckets) {
    out.push(`    <div class="bucket-label">${esc(b.label)}</div>`);
    out.push(`    <div class="svcgrid">`);
    for (const c of SVCS.cards.filter(x => x.bucket === b.id)) {
      out.push(`      <div class="svc">`);
      out.push(`        <h3>${esc(c.title)}</h3>`);
      out.push(`        <span class="who">${esc(c.who)}</span>`);
      out.push(`        <p>${esc(c.home_blurb)}</p>`);
      out.push(`        <div class="row"><a href="${c.href}">${esc(c.link_label)}</a></div>`);
      out.push(`      </div>`);
    }
    out.push(`    </div>`);
    out.push(``);
  }
  out.pop(); // no trailing blank line after the last grid
  return out.join('\n');
}

function applyRegions(pagePath, regions) {
  const src = path.join(DIR, pagePath);
  let html = fs.readFileSync(src, 'utf8');
  for (const [name, render] of Object.entries(regions)) {
    const open = new RegExp('([ \t]*)<!-- ep:' + name + ' -->\r?\n');
    const close = new RegExp('[ \t]*<!-- /ep:' + name + ' -->');
    const mOpen = html.match(open);
    const mClose = html.match(close);
    if (!mOpen || !mClose) throw new Error(pagePath + ': region ep:' + name + ' markers missing/unbalanced');
    const start = mOpen.index + mOpen[0].length;
    const end = html.search(close);
    if (end < start) throw new Error(pagePath + ': region ep:' + name + ' inverted');
    html = html.slice(0, start) + render() + '\n' + html.slice(end);
  }
  const dest = path.join(OUT, pagePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

/* ---- money pages: /system/ and /claude/ ------------------------------
   These render the exact markup that used to be hand-written, so the page is
   byte-identical until someone actually edits the JSON (or Site Studio does). */
const SYS = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'system.json'), 'utf8'));
const CLA = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'claude.json'), 'utf8'));
const CMA = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'content-machine.json'), 'utf8'));

function renderSysHero() {
  const h = SYS.hero;
  return [
    `    <span class="badge">${h.badge}</span>`,
    `    <h1>${h.headline_1} <span>${h.headline_2}</span></h1>`,
    `    <p class="lead">${h.lede}</p>`,
    `    <a href="#order" class="btn big buy">${h.cta_label}</a>`,
    `    <p class="cta-sub">${h.cta_sub}</p>`,
  ].join('\n');
}
function renderSysPrice() {
  const x = SYS.price;
  return [
    `      <div class="today">${x.label}</div>`,
    `      <div class="big">${x.amount}</div>`,
    `      <div class="note">${x.note}</div>`,
  ].join('\n');
}
function renderSysGuarantee() {
  const g = SYS.guarantee;
  return `      <h3>${g.heading}</h3>\n      <p>${g.body}</p>`;
}
function renderSysFaq() {
  // Canonical .faq accordion, same as every other page on the site. This used
  // to emit static .fitem divs that could not be opened, which is the
  // inconsistency Elvin spotted between /book.html and /system/.
  return SYS.faq.map(f => `    <details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('\n');
}
function renderClHero() {
  const h = CLA.hero;
  return [
    `    <span class="label">${h.label}</span>`,
    `    <h1>${h.headline}</h1>`,
    `    <p class="dek">${h.dek}</p>`,
  ].join('\n');
}
function renderClPrice() {
  const x = CLA.price;
  return `  <div class="big">${x.amount}</div>\n  <div class="sub">${x.sub}</div>`;
}
function renderCmHero() {
  const h = CMA.hero;
  return [
    `    <span class="label">${h.label}</span>`,
    `    <h1>${h.headline}</h1>`,
    `    <p class="dek">${h.dek}</p>`,
  ].join('\n');
}
function renderCmPrice() {
  const x = CMA.price;
  return `  <div class="big">${x.amount}</div>\n  <div class="sub">${x.sub}</div>`;
}

applyRegions('system/index.html', {
  'sys-hero': renderSysHero,
  'sys-price': renderSysPrice,
  'sys-guarantee': renderSysGuarantee,
  'sys-faq': renderSysFaq,
});
applyRegions('claude/index.html', {
  'cl-hero': renderClHero,
  'cl-price': renderClPrice,
});
/* The unit charts are one mark per real thing counted, emitted here rather than
   hand-written so the marks can never drift from the audit they describe. The
   numbers are the verified ones: 200 of 200 titles, and 21 of 75 stories.
   Sourced to Brain/deliverables/VERIFIED-NUMBERS.md. */
const FIG_TITLES_TOTAL = 200;   // pieces audited
const FIG_STORIES_TOTAL = 75;   // short stories
const FIG_STORIES_HIT = 21;     // protagonist named Marina

function renderFigTitles() {
  return '<i></i>'.repeat(FIG_TITLES_TOTAL);
}
function renderFigMarina() {
  // Spread the hits through the set rather than clustering them at the front,
  // because a solid block reads as two groups instead of one distribution.
  const every = FIG_STORIES_TOTAL / FIG_STORIES_HIT;
  let hits = 0, out = '';
  for (let i = 0; i < FIG_STORIES_TOTAL; i++) {
    const on = hits < FIG_STORIES_HIT && Math.floor(i / every) === hits;
    if (on) hits++;
    out += on ? '<i></i>' : '<i data-off></i>';
  }
  return out;
}

applyRegions('content-machine/index.html', {
  'cm-hero': renderCmHero,
  'cm-price': renderCmPrice,
  'fig-titles': renderFigTitles,
  'fig-marina': renderFigMarina,
});

/* ---- /receipts/ -------------------------------------------------------
   The ledger renders itself from content/receipts.json so adding a row is a
   data edit, not a markup edit. That matters because the value of this page
   compounds with the date range: every system built adds a line, and a
   competitor starting today has nothing to put in one. */
const RCP = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'receipts.json'), 'utf8'));

function renderRcIntro() {
  const i = RCP.intro;
  return [
    `    <span class="label">${i.label}</span>`,
    `    <h1>${i.headline}</h1>`,
    `    <p class="sub">${i.body}</p>`,
  ].join('\n');
}
function renderRcSpend() {
  return '    <ul class="ledger">\n' + RCP.spend.map(r => [
    '      <li>',
    `        <span class="amt">${r.figure}</span>`,
    `        <div><b>${r.what}</b><p>${r.detail}</p>`,
    `          <span class="src">Source: ${r.source}</span></div>`,
    '      </li>',
  ].join('\n')).join('\n') + '\n    </ul>';
}
function renderRcFails() {
  return '    <ul class="fails">\n' + RCP.failures.map(f => [
    '      <li>',
    `        <span class="cnt">${f.count}</span>`,
    `        <b>${f.what}</b>`,
    `        <p>${f.detail}</p>`,
    '      </li>',
  ].join('\n')).join('\n') + '\n    </ul>';
}
function renderRcGap() {
  const g = RCP.gap;
  return `    <div class="gap">\n      <h3>${g.headline}</h3>\n      <p>${g.body}</p>\n    </div>`;
}

/* ---- book.html reusable blocks ---------------------------------------
   The reader review and the author bio were hand-written HTML, which is why
   neither could be edited anywhere. They are content, so they live in
   content/book.json and Site Studio can reach them from the phone. */
const BK = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'book.json'), 'utf8'));

function renderBkReview() {
  const r = BK.review;
  return [
    `    <div class="section-label">${r.label}</div>`,
    '    <div class="review-card">',
    '      <div class="review-head"><span class="review-stars" aria-label="Rated 5 out of 5 stars">★★★★★</span>' +
      `<span class="review-badge">${r.badge}</span></div>`,
    `      <h3 class="review-title">&ldquo;${r.headline}&rdquo;</h3>`,
    ...r.paragraphs.map(p => `      <p>${p}</p>`),
    `      <div class="review-meta">${r.meta} &middot; ` +
      `<a href="${r.link_url}" target="_blank" rel="noopener">${r.link_label}</a></div>`,
    '    </div>',
  ].join('\n');
}

function renderBkAuthor() {
  const a = BK.author;
  return [
    `    <div class="section-label">${a.label}</div>`,
    '    <div class="author-inner">',
    `      <div class="author-avatar"><img src="${a.photo}" alt="${a.name}" width="400" height="400" loading="lazy" onerror="this.parentElement.textContent='EP'" /></div>`,
    '      <div>',
    `        <div class="author-name">${a.name}</div>`,
    `        <div class="author-title">${a.title}</div>`,
    `        <p class="author-bio">${a.paragraphs.join('<br/><br/>')}</p>`,
    '      </div>',
    '    </div>',
  ].join('\n');
}

/* Copy for the opt-in on each money page. The offer has to match the page:
   somebody reading the Content Machine page has already met the volume problem
   and is not looking for a starter kit for the book. Every source tag is unique
   so the lead DB shows which page and which position actually converts. */
const OPTINS = {
  'system': {
    magnet: '/dl/50-Best-AI-Prompts.pdf',
    magnet_label: 'Download the prompt pack now →',
    eyebrow: 'Free starter kit',
    headline: 'Try the method before you spend anything',
    body: 'The prompts for the jobs that keep sliding to tomorrow, the cheat sheets for briefing a model properly, and the first chapter of the book. It lands in about a minute and it is yours either way.',
    button: 'Send me the kit',
    note: 'One email, four files. Unsubscribe in one click, and it never removes your access to anything.',
    success: 'Done. Check your inbox in about a minute, and look in promotions if it is not there.',
  },
  'claude': {
    magnet: '/dl/Claude-Manual-Talking-to-Claude-Well.pdf',
    magnet_label: 'Download the chapter now →',
    eyebrow: 'Free sample',
    headline: 'Read a chapter before you buy the manual',
    body: 'I will send you the chapter on giving Claude a job description, which is the one that changes how people work within a day. Plus the briefing cheat sheet from the appendix.',
    button: 'Send me the chapter',
    note: 'One email, two files. Unsubscribe in one click.',
    success: 'On its way. Check your inbox in about a minute, and look in promotions if it is not there.',
  },
  'content-machine': {
    magnet: '/dl/The-Content-Machine-Quality-Gate.pdf',
    magnet_label: 'Download the gate now →',
    eyebrow: 'Free, from inside the guide',
    headline: 'The quality gate, before you buy anything',
    body: 'The banned-phrase list I run every piece against, and the scoring rubric a draft has to clear before I ever see it. One printable page from inside the guide. Run it against anything you wrote this week.',
    button: 'Send me the gate',
    note: 'One email, one PDF. Unsubscribe in one click.',
    success: 'Sent. Check your inbox in about a minute, and look in promotions if it is not there.',
  },
};

/* One opt-in block, rendered wherever it is needed. Each instance carries its
   own source tag so the lead DB shows which position actually converts. */
function renderOptin(slot, page) {
  const o = page ? { ...BK.optin, ...OPTINS[page] }
                 : { ...BK.optin, magnet: '/dl/50-Best-AI-Prompts.pdf', magnet_label: 'Download the prompt pack now →' };
  const tag = page ? `${page}-optin-${slot}` : `book-optin-${slot}`;
  const id = 'oi-' + (page ? page + '-' : '') + slot;
  return [
    '  <div class="optin">',
    `    <span class="oi-eyebrow">${o.eyebrow}</span>`,
    `    <h2>${o.headline}</h2>`,
    `    <p>${o.body}</p>`,
    `    <form class="oi-form" data-source="${tag}"${o.magnet ? ` data-magnet="${o.magnet}" data-magnet-label="${o.magnet_label}"` : ''} novalidate>`,
    '      <input type="text" name="website" value="" style="display:none" tabindex="-1" autocomplete="off">',
    `      <label class="visually-hidden" for="${id}">Your email</label>`,
    `      <input id="${id}" type="email" required autocomplete="email" placeholder="${o.placeholder}">`,
    `      <button type="submit">${o.button}</button>`,
    '    </form>',
    `    <p class="oi-note">${o.note}</p>`,
    `    <p class="oi-msg" data-success="${o.success}"></p>`,
    '  </div>',
  ].join('\n');
}

applyRegions('book.html', {
  'bk-review': renderBkReview,
  'bk-author': renderBkAuthor,
  'bk-optin-top': () => renderOptin('top'),
  'bk-optin-bottom': () => renderOptin('bottom'),
});
console.log('Regions applied: book.html (review, author, optin x2)');

/* The three money pages get the same component with page-matched copy. Until
   now /system/ had only a desktop exit-intent popup (mouseout never fires on
   touch, so the $37 page had zero mobile capture), and /claude/ and
   /content-machine/ had no capture at all. */
applyRegions('system/index.html', { 'sys-optin': () => renderOptin('end', 'system') });
applyRegions('claude/index.html', { 'cl-optin': () => renderOptin('end', 'claude') });
applyRegions('content-machine/index.html', { 'cm-optin': () => renderOptin('end', 'content-machine') });
console.log('Regions applied: money-page opt-ins (system, claude, content-machine)');

/* One honest Amazon-vs-System table, rendered on both pages from this source.
   The rows Amazon wins outright (paper, formats, reviews) are what make it
   read as information instead of a funnel; the System wins speed, the kit
   and the guarantee. Nothing on the book page explained the difference
   between the two ways to buy, which was Elvin's original complaint. */
const COMPARE_ROWS = [
  ['What you get',
   '<span class="win">Paperback, hardcover or Kindle</span> of the book itself',
   'The ebook <span class="win">plus the whole working kit</span>: 7-day workbook, the prompts, 12 role packs, the 10-guide library'],
  ['In your hands',
   'Kindle instantly; <span class="no">paper in a few days</span>',
   '<span class="win">Instant download</span>, on any device, no app'],
  ['A copy on your shelf',
   '<span class="win">Yes, and it is the better way to read cover to cover</span>',
   '<span class="no">No paper copy</span>'],
  ['Guarantee',
   '<span class="no">Amazon’s return policy</span>',
   '<span class="win">14 days, money back, keep the files</span>'],
  ['Your purchase helps the book',
   '<span class="win">Yes: every Amazon copy and review moves it up the rankings</span>',
   'It supports me directly'],
  ['Price',
   '$9.99 Kindle · $24.99 paperback',
   '$37 for the ebook and everything above'],
];

function renderCompare() {
  const rows = COMPARE_ROWS.map(([label, az, sys]) =>
    `      <tr><td>${label}</td><td>${az}</td><td>${sys}</td></tr>`).join('\n');
  return [
    '  <div class="compare"><table>',
    '    <thead><tr><th scope="col"></th><th scope="col">The book on Amazon</th><th scope="col">The System, here</th></tr></thead>',
    '    <tbody>',
    rows,
    '    </tbody>',
    '  </table></div>',
    '  <p class="compare-note">My honest advice is both: paper for reading, the System for doing. Start with either.</p>',
  ].join('\n');
}

applyRegions('book.html', { 'bk-compare': renderCompare });
applyRegions('system/index.html', { 'sys-compare': renderCompare });
console.log('Regions applied: Amazon-vs-System comparison (book.html, system)');

applyRegions('receipts/index.html', {
  'rc-intro': renderRcIntro,
  'rc-spend': renderRcSpend,
  'rc-fails': renderRcFails,
  'rc-gap': renderRcGap,
});
console.log('Regions applied: receipts/index.html (intro, spend, fails, gap)');
console.log('Regions applied: system/index.html (hero, price, guarantee, faq), claude/index.html (hero, price), content-machine/index.html (hero, price)');

applyRegions('index.html', {
  'nav': () => renderNav('index.html'),
  'hero-text': renderHeroText,
  'home-services': renderHomeServices,
});
applyRegions('book.html', {
  'nav': () => renderNav('book.html'),
});
console.log('Regions applied: index.html (nav, hero-text, home-services), book.html (nav)');



/* ------------------------------------------------------------------ */
/* sitemap.xml - generated from the page walk so it can never go stale.
   No lastmod on purpose: builds must be byte-idempotent. */
const SM_EXCLUDE = ['titles', 'books', 'play', 'book1-feedback', 'oto', 'dl', 'studio', 'toolkit', 'thank-you'];
const SM_SKIP_FILES = ['apps/index.html', 'writing/_homepage_cards.html'];
function smWalk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (SM_EXCLUDE.includes(r) || SM_SKIP_FILES.includes(r)) continue;
    if (!rel && /^index_v[0-9]\.html$/.test(e.name)) continue;
    if (e.isDirectory()) smWalk(path.join(dir, e.name), r, out);
    else if (e.name === 'index.html' || (!rel && e.name.endsWith('.html'))) out.push(r);
  }
  return out;
}
function smUrl(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -10);
  return '/' + rel;
}
function smPriority(u) {
  if (u === '/') return '1.0';
  if (u === '/system/' || u === '/book.html' || u === '/services/') return '0.9';
  if (u === '/projects/' || u === '/writing/') return '0.8';
  if (u.startsWith('/free/') || u.startsWith('/apps/calculators/') || u.startsWith('/quiz')) return '0.7';
  return '0.6';
}
const smPages = smWalk(DIR, '', []).map(smUrl).sort();
const smXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  smPages.map(u => '  <url><loc>https://elvinpeters.com' + u + '</loc><priority>' + smPriority(u) + '</priority></url>').join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), smXml);
console.log('Sitemap: ' + smPages.length + ' URLs');
