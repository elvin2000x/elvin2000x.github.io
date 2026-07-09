// Generates blog article pages + a blog index from essays.json, and prints the
// homepage "Writing" cards fragment. Run: node build_blog.js
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const essays = JSON.parse(fs.readFileSync(path.join(DIR, 'essays.json'), 'utf8'));

const GA = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CLZ7N26J1Q"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-CLZ7N26J1Q');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1699232654449762');fbq('track','PageView');</script>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;

const CSS = `
:root{--bg:#e9edf2;--bg-2:#e2e7ee;--panel:#f6f8fb;--panel-2:#eef2f7;--line:#cdd6e2;--line-soft:#dbe2ec;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#6a7c93;--gold:#9c761f;--gold-2:#b3892f;--cyan:#1c6ea8;--glow:rgba(156,118,31,.14);--shadow:0 18px 40px -24px rgba(14,26,43,.45);--serif:'EB Garamond',Georgia,'Times New Roman',serif;--sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0a1524;--bg-2:#060d18;--panel:#101d30;--panel-2:#0c1626;--line:#213249;--line-soft:#1a2942;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#7f96b1;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--glow:rgba(201,162,80,.16);--shadow:0 24px 50px -28px rgba(0,0,0,.7)}}
:root[data-theme="light"]{--bg:#e9edf2;--bg-2:#e2e7ee;--panel:#f6f8fb;--panel-2:#eef2f7;--line:#cdd6e2;--line-soft:#dbe2ec;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#6a7c93;--gold:#9c761f;--gold-2:#b3892f;--cyan:#1c6ea8;--shadow:0 18px 40px -24px rgba(14,26,43,.45)}
:root[data-theme="dark"]{--bg:#0a1524;--bg-2:#060d18;--panel:#101d30;--panel-2:#0c1626;--line:#213249;--line-soft:#1a2942;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#7f96b1;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--shadow:0 24px 50px -28px rgba(0,0,0,.7)}
*{box-sizing:border-box}html,body{margin:0}
body{background:linear-gradient(180deg,var(--bg),var(--bg-2));color:var(--ink);font-family:var(--sans);line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 80%,transparent);border-bottom:1px solid var(--line-soft)}
.nav .in{max-width:1120px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:20px}
.brandmark{display:flex;align-items:center;gap:11px;font-family:var(--serif);font-size:18px}
.brandmark .sig{width:32px;height:32px;border:1px solid var(--line);border-radius:9px;display:grid;place-items:center;background:var(--panel)}
.nav .lk{margin-left:auto;display:flex;gap:24px;align-items:center}
.nav .lk a{font-size:14px;color:var(--ink-2)}.nav .lk a:hover{color:var(--ink)}
.nav .lk a.cta{border:1px solid var(--gold);color:var(--gold-2);padding:8px 15px;border-radius:999px;font-weight:600}
.eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-2);font-weight:600}
article{max-width:720px;margin:0 auto;padding:44px 24px 40px}
.arthead .cover{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:26px}
article h1{font-family:var(--serif);font-weight:400;font-size:clamp(2rem,4.6vw,3rem);line-height:1.08;letter-spacing:-.015em;margin:14px 0 0;text-wrap:balance}
.dek{font-size:1.2rem;color:var(--ink-2);margin:16px 0 0;font-family:var(--serif);font-style:italic}
.byline{display:flex;gap:14px;align-items:center;margin:22px 0 0;padding-bottom:26px;border-bottom:1px solid var(--line-soft);font-size:13.5px;color:var(--muted)}
.byline b{color:var(--ink-2);font-weight:600}
.body{font-size:17.5px;color:var(--ink)}
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
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14.5px;border:1px solid transparent;cursor:pointer;font-family:var(--sans)}
.btn.primary{background:linear-gradient(135deg,var(--gold),var(--gold-2));color:#1b1304}
.btn.ghost{border-color:var(--line);color:var(--ink)}
.backlink{display:inline-flex;gap:8px;align-items:center;color:var(--muted);font-size:14px;margin-bottom:8px}
footer{border-top:1px solid var(--line-soft);padding:30px 24px;color:var(--muted);font-size:13px;margin-top:56px}
footer .in{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a:hover{color:var(--gold-2)}
:focus-visible{outline:2px solid var(--gold-2);outline-offset:3px;border-radius:4px}
@media(max-width:520px){.nav .lk a:not(.cta){display:none}}
`;

const NAV = `<nav class="nav"><div class="in">
  <a class="brandmark" href="/"><span class="sig"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 19V5h9M5 12h7" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="17" r="2.4" fill="var(--gold)"/></svg></span>Elvin&nbsp;Peters</a>
  <div class="lk"><a href="/#apps">Apps</a><a href="/#games">Games</a><a href="/writing/">Writing</a><a class="cta" href="/book.html">Read the book</a></div>
</div></nav>`;

const FOOT = `<footer><div class="in"><span>&copy; 2026 Elvin Peters. Built and hosted by hand.</span><span><a href="/writing/">Writing</a> &middot; <a href="/book.html">The book</a> &middot; Toronto</span></div></footer>`;

const THEME = `<script>(function(){var r=document.documentElement;document.addEventListener('click',function(e){if(e.target.closest('#tg')){var d=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');r.setAttribute('data-theme',d==='dark'?'light':'dark')}})})();</script>`;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function head(title, desc, ogimg, canon){
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Elvin Peters</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="https://elvinpeters.com${ogimg}"><meta property="og:url" content="${canon}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:creator" content="@elvin_peters">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 19V5h9M5 12h7' stroke='%23c9a250' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='18' cy='17' r='2.4' fill='%23c9a250'/%3E%3C/svg%3E">
${GA}${FONTS}<style>${CSS}</style></head><body>`;
}

const BEEHIIV = `<script async src="https://subscribe-forms.beehiiv.com/v3/loader.js" data-beehiiv-form="d4799f36-e61d-43a8-88cf-fbcb0b24fd5b"></script>`;

fs.mkdirSync(path.join(DIR,'writing'), {recursive:true});
const cards = [];
for(const e of essays){
  const canon = `https://elvinpeters.com/writing/${e.slug}/`;
  const img = `/img/${e.image}`;
  const page = head(e.title, e.dek, img, canon) + NAV +
    `<article><div class="arthead">`+
      `<a class="backlink" href="/writing/">&larr; Writing</a>`+
      `<img class="cover" src="${img}" alt="" loading="eager">`+
      `<span class="eyebrow">Essay</span>`+
      `<h1>${esc(e.title)}</h1>`+
      `<p class="dek">${esc(e.dek)}</p>`+
      `<div class="byline"><b>Elvin Peters</b> <span>${e.readmins||8} min read</span> <button id="tg" style="margin-left:auto;background:none;border:1px solid var(--line);color:var(--muted);width:30px;height:30px;border-radius:8px;cursor:pointer">&#9681;</button></div>`+
    `</div><div class="body">${e.html}</div></article>`+
    `<section class="endcta"><div class="card"><h3>I write about building things solo with AI.</h3><p>Occasional, practical, no spam. Get the next one.</p>${BEEHIIV}<div style="margin-top:16px"><a class="btn ghost" href="https://twitter.com/elvin_peters">Follow on X</a></div></div></section>`+
    FOOT + THEME + `</body></html>`;
  fs.mkdirSync(path.join(DIR,'writing',e.slug), {recursive:true});
  fs.writeFileSync(path.join(DIR,'writing',e.slug,'index.html'), page);
  cards.push({slug:e.slug,title:e.title,dek:e.dek,image:e.image,readmins:e.readmins||8});
}

// writing index page
const list = head('Writing','Essays on building software, games, and a company of one with AI as a co-worker.','/img/og.jpg','https://elvinpeters.com/writing/') + NAV +
  `<article style="max-width:820px"><span class="eyebrow">Writing</span><h1 style="margin-bottom:6px">Notes from a workshop of one.</h1><p class="dek" style="margin-bottom:30px">How I actually build: the harness around the AI, the zero-dependency habit, the tools that let one person ship like a team.</p>`+
  cards.map(c=>`<a href="/writing/${c.slug}/" style="display:grid;grid-template-columns:150px 1fr;gap:18px;padding:18px 0;border-top:1px solid var(--line-soft);align-items:center">`+
    `<img src="/img/${c.image}" alt="" style="width:150px;aspect-ratio:16/10;object-fit:cover;border-radius:10px;border:1px solid var(--line)">`+
    `<span><span class="eyebrow">Essay &middot; ${c.readmins} min</span><h2 style="font-family:var(--serif);font-weight:600;font-size:1.35rem;margin:6px 0 4px">${esc(c.title)}</h2><span style="color:var(--ink-2);font-size:14px">${esc(c.dek)}</span></span></a>`).join('')+
  `</article>`+FOOT+THEME+`</body></html>`;
fs.writeFileSync(path.join(DIR,'writing','index.html'), list);

// homepage "Writing" section cards fragment (for manual injection into index.html)
const frag = cards.map(c=>
`  <a class="card" href="/writing/${c.slug}/">
    <div class="thumb" style="background-image:url(/img/${c.image});background-size:cover;background-position:center"></div>
    <div class="body"><div class="kicker"><span class="tag">Essay</span><span class="pill read">${c.readmins} min</span></div>
    <h3>${esc(c.title)}</h3><p class="desc">${esc(c.dek)}</p><span class="go">Read <span class="arw">&rarr;</span></span></div>
  </a>`).join('\n');
fs.writeFileSync(path.join(DIR,'writing','_homepage_cards.html'), frag);

console.log('Built', essays.length, 'essays -> /writing/<slug>/ + /writing/ index');
console.log('Homepage cards fragment -> writing/_homepage_cards.html');
