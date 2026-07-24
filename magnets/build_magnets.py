#!/usr/bin/env python3
"""
build_magnets.py — generate an email-gated opt-in page for every lead magnet in
magnets.json, plus a /free/ hub. Config-driven, same spirit as the quiz and the
calculators: edit the registry, run this, deploy.

Each page: captures an email to the owned lead DB (POST /api/lead), fires the
Lead Magnet conversion (Google Ads + X, both gated on ids you paste later), then
delivers the PDF from /dl/. gclid/twclid ride along in the lead source.

The magnets already exist and are hosted at /dl/; this puts a capture gate in
front of them so ad traffic becomes leads instead of anonymous downloads.

Outputs into ../ (the site root): free/<slug>/index.html + free/index.html
Run:  python magnets/build_magnets.py
Stdlib only.
"""
import json, html
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # site/magnets
SITE = ROOT.parent                               # site/
DATA = json.loads((ROOT / "magnets.json").read_text(encoding="utf-8"))
MAGNETS = DATA["magnets"]

DOMAIN = "https://elvinpeters.com"
LEAD_API = "https://ultimateaidirectory.com/api/lead"

# ── tracking (gated: empty = installed but nothing fires) ─────────────────────
GA4 = "G-CLZ7N26J1Q"
GADS_ID = "AW-637214471"
GADS_MAGNET = "AW-637214471/bylsCMuW0NUcEIe-7K8C"   # Google "Lead Magnet Opt-in"
X_PIXEL = "re26u"
X_MAGNET = ""                 # X "Lead Magnet Opt-in" event id: tw-re26u-XXXXX (pending)


def esc(s):
    return html.escape(str(s), quote=True)


HEAD_TRACKING = f"""<!-- GA4 + Google Ads -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA4}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}
gtag('js',new Date());gtag('config','{GA4}');gtag('config','{GADS_ID}');</script>
<!-- X pixel -->
<script>!function(e,t,n,s,u,a){{e.twq||(s=e.twq=function(){{s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
}},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}}(window,document,'script');twq('config','{X_PIXEL}');</script>"""

CSS = """
:root{--navy:#0a0f1e;--navy2:#111a30;--card:#141d33;--gold:#d3b463;--gold2:#e7cd86;
--ink:#eef2fa;--muted:#9aa7c2;--line:rgba(255,255,255,.09);--ok:#4ad0a0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
background:var(--navy);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(900px 500px at 80% -10%,rgba(211,180,99,.10),transparent 60%),
radial-gradient(700px 500px at 0% 0%,rgba(60,90,160,.10),transparent 55%);background-attachment:fixed}
.wrap{max-width:1080px;margin:0 auto;padding:0 22px}
.top{padding:26px 0}.brand{font-weight:800;letter-spacing:.02em;color:var(--ink);font-size:17px}
.brand b{color:var(--gold)}
.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:44px;align-items:center;padding:26px 0 70px}
.eyebrow{display:inline-block;font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
color:var(--gold);background:rgba(211,180,99,.10);border:1px solid rgba(211,180,99,.25);padding:7px 14px;border-radius:999px;margin-bottom:22px}
h1{font-size:clamp(30px,4.4vw,46px);line-height:1.08;letter-spacing:-.02em}
.tagline{font-size:clamp(17px,2vw,20px);color:var(--muted);margin:18px 0 24px;max-width:52ch}
.hook{font-size:16px;color:var(--gold2);font-style:italic;margin-bottom:22px}
ul{list-style:none;margin:6px 0 0}
li{position:relative;padding:9px 0 9px 32px;font-size:16px;color:var(--ink)}
li::before{content:"";position:absolute;left:2px;top:15px;width:14px;height:14px;border-radius:50%;
background:radial-gradient(circle at 50% 40%,var(--gold2),var(--gold));box-shadow:0 0 0 4px rgba(211,180,99,.12)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px;
box-shadow:0 40px 90px -50px #000}
.card h2{font-size:22px;margin-bottom:6px}.card .sub{color:var(--muted);font-size:14.5px;margin-bottom:20px}
.field{margin-bottom:12px}
.field input{width:100%;font-family:inherit;font-size:16px;padding:14px 15px;border:1px solid var(--line);
border-radius:11px;background:#0c1426;color:var(--ink)}
.field input:focus{outline:none;border-color:var(--gold)}
.field input::placeholder{color:#67748f}
.btn{width:100%;font-family:inherit;font-size:16.5px;font-weight:800;padding:15px;border:none;border-radius:11px;cursor:pointer;
background:linear-gradient(180deg,var(--gold2),var(--gold));color:#20180a;transition:transform .12s,filter .12s}
.btn:hover{filter:brightness(1.05);transform:translateY(-1px)}.btn[disabled]{opacity:.6;cursor:not-allowed}
.fine{font-size:12.5px;color:#67748f;text-align:center;margin-top:13px}
.msg{font-size:14px;margin-top:12px;padding:11px 13px;border-radius:10px;display:none}
.msg.err{display:block;background:rgba(255,110,90,.12);border:1px solid rgba(255,110,90,.35);color:#ffb3a1}
.done{display:none;text-align:center}.done.on{display:block}
.done .tick{width:60px;height:60px;border-radius:50%;background:rgba(74,208,160,.14);border:1px solid rgba(74,208,160,.4);
display:grid;place-items:center;font-size:28px;color:var(--ok);margin:0 auto 16px}
.done h2{font-size:22px;margin-bottom:8px}.done p{color:var(--muted);font-size:15px;margin-bottom:18px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.foot{border-top:1px solid var(--line);padding:26px 0;color:#67748f;font-size:13px;text-align:center}
.foot a{color:var(--muted);text-decoration:none}
@media(max-width:820px){.grid{grid-template-columns:1fr;gap:30px;padding-bottom:48px}}
/* hub */
.hub-head{text-align:center;padding:34px 0 10px;max-width:640px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:28px 0 70px}
.mag{display:block;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:24px;text-decoration:none;
transition:transform .15s,border-color .15s}
.mag:hover{transform:translateY(-4px);border-color:rgba(211,180,99,.5)}
.mag h3{color:var(--ink);font-size:18px;margin-bottom:8px}.mag p{color:var(--muted);font-size:14px}
.mag .go{color:var(--gold);font-weight:700;font-size:14px;margin-top:14px;display:inline-block}
"""


def page(m):
    bullets = "".join(f"<li>{esc(b)}</li>" for b in m["bullets"])
    dl = f"/dl/{m['file']}"
    return """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Free Download | Elvin Peters</title>
<meta name="description" content="{tagline}">
<link rel="canonical" href="{domain}/free/{slug}/">
{tracking}
<style>{css}</style></head><body>
<div class="wrap"><div class="top"><a class="brand" href="/">ELVIN <b>PETERS</b></a></div>
<div class="grid">
<div class="copy">
<span class="eyebrow">Free Guide</span>
<h1>{title}</h1>
<div class="hook">{hook}</div>
<p class="tagline">{tagline}</p>
<ul>{bullets}</ul>
</div>
<div class="card" id="card">
<div class="form-in">
<h2>Get it free</h2>
<div class="sub">Enter your email and it is yours. No spam, unsubscribe anytime.</div>
<form id="f" novalidate>
<div class="field"><input id="name" type="text" placeholder="First name (optional)" maxlength="80" autocomplete="given-name"></div>
<div class="field"><input id="email" type="email" placeholder="Your best email" maxlength="120" required autocomplete="email"></div>
<div class="hp" aria-hidden="true"><input type="text" id="website" tabindex="-1" autocomplete="off"></div>
<button class="btn" type="submit" id="btn">Send me the guide</button>
<div class="msg" id="msg"></div>
<div class="fine">Instant access. We will also email you a copy.</div>
</form>
</div>
<div class="done" id="done">
<div class="tick">&#10003;</div>
<h2>It is yours</h2>
<p>Thanks<span id="dn"></span>. Your guide is ready, and a copy is on its way to your inbox.</p>
<a class="btn" id="dl" href="{dl}" target="_blank" rel="noopener">Download the PDF</a>
</div>
</div>
</div>
<div class="foot"><a href="/free/">See all free guides</a> &nbsp;&middot;&nbsp; <a href="/">elvinpeters.com</a> &nbsp;&middot;&nbsp; <a href="/privacy.html">Privacy</a></div>
</div>
<script>
(function(){{
  var SLUG="{slug}", TITLE="{title_js}", DL="{dl}";
  var GADS="{gads}", XEVT="{xevt}";
  var f=document.getElementById('f'),msg=document.getElementById('msg'),btn=document.getElementById('btn');
  function val(id){{var e=document.getElementById(id);return e?e.value.trim():'';}}
  function fail(t){{msg.className='msg err';msg.textContent=t;}}
  function source(){{
    var base='magnet:'+SLUG;
    try{{var p=new URLSearchParams(location.search),b=[];
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){{var v=p.get(k);if(v)b.push(k.replace('utm_','')+'='+v);}});
      var g=p.get('gclid');if(g)b.push('gclid='+g);var tw=p.get('twclid');if(tw)b.push('twclid='+tw);
      if(b.length)base=(base+' | '+b.join('&')).slice(0,290);
    }}catch(e){{}}
    return base;
  }}
  function convert(email){{
    // Enhanced conversions: hand Google the email (it hashes client-side) so it
    // can match conversions cookies would lose. Set before firing the event.
    try{{if(email&&typeof gtag==='function')gtag('set','user_data',{{email:email}});}}catch(e){{}}
    try{{if(XEVT&&typeof twq==='function')twq('event',XEVT,{{}});}}catch(e){{}}
    try{{if(GADS&&typeof gtag==='function')gtag('event','conversion',{{'send_to':GADS}});}}catch(e){{}}
  }}
  function reveal(name){{
    document.getElementById('dn').textContent=name?(' '+name):'';
    document.querySelector('#card .form-in').style.display='none';
    document.getElementById('done').classList.add('on');
  }}
  f.addEventListener('submit',function(e){{
    e.preventDefault();msg.className='msg';msg.textContent='';
    if(val('website')){{reveal('');return;}}
    var email=val('email'),name=val('name');
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){{return fail('Please enter a valid email.');}}
    btn.disabled=true;btn.textContent='Sending...';
    var body=new URLSearchParams({{name:name||'Magnet lead',email:email,message:'Lead magnet: '+TITLE,source:source(),website:''}}).toString();
    fetch("{lead_api}",{{method:'POST',mode:'cors',keepalive:true,headers:{{'Content-Type':'application/x-www-form-urlencoded'}},body:body}})
      .then(function(){{convert(email);reveal(name);}})
      .catch(function(){{convert(email);reveal(name);}});  // always deliver the guide
  }});
}})();
</script>
</body></html>""".format(
        title=esc(m["title"]), tagline=esc(m["tagline"]), hook=esc(m["hook"]),
        bullets=bullets, slug=esc(m["slug"]), domain=DOMAIN, dl=dl,
        tracking=HEAD_TRACKING, css=CSS, lead_api=LEAD_API,
        gads=GADS_MAGNET, xevt=X_MAGNET,
        title_js=m["title"].replace('"', ""))


def hub():
    cards = ""
    for m in MAGNETS:
        cards += (f'<a class="mag" href="/free/{esc(m["slug"])}/"><h3>{esc(m["title"])}</h3>'
                  f'<p>{esc(m["tagline"])}</p><span class="go">Get it free &rarr;</span></a>')
    return """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Free AI Guides | Elvin Peters</title>
<meta name="description" content="Free, practical AI guides for non-technical professionals. No jargon, no hype.">
<link rel="canonical" href="{domain}/free/">
{tracking}<style>{css}</style></head><body>
<div class="wrap"><div class="top"><a class="brand" href="/">ELVIN <b>PETERS</b></a></div>
<div class="hub-head"><span class="eyebrow">Free Guides</span>
<h1>Practical AI, no jargon</h1>
<p class="tagline" style="margin:16px auto 0">Real guides for real work. Pick one, drop your email, and it is yours.</p></div>
<div class="cards">{cards}</div>
<div class="foot"><a href="/">elvinpeters.com</a></div></div></body></html>""".format(
        domain=DOMAIN, tracking=HEAD_TRACKING, css=CSS, cards=cards)


def main():
    n = 0
    for m in MAGNETS:
        # confirm the PDF the page will hand out actually exists
        if not (SITE / "dl" / m["file"]).exists():
            print(f"  ! WARNING: /dl/{m['file']} missing for '{m['slug']}'")
        out = SITE / "free" / m["slug"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(m), encoding="utf-8")
        n += 1
    (SITE / "free" / "index.html").write_text(hub(), encoding="utf-8")
    armed = "ARMED" if (GADS_MAGNET or X_MAGNET) else "DORMANT (paste ids to arm)"
    print(f"Built {n} magnet opt-in pages + hub -> {SITE / 'free'}")
    print(f"Conversions: {armed}  (Google={GADS_MAGNET or '-'}  X={X_MAGNET or '-'})")


if __name__ == "__main__":
    main()
