---
what: Source of the LIVE book-funnel website — static site deployed via GitHub Pages (elvin2000x.github.io) at elvinpeters.com.
status: live
project: book-sales-funnel
run: n/a
entry: index.html
---
This folder IS a git repo (origin = github.com/elvin2000x/elvin2000x.github.io); pushing to it deploys the live site. index.html is the $37 System sales page with GA4 (G-CLZ7N26J1Q), Meta Pixel, and TikTok pixel wired; thank-you/ is the post-purchase delivery page that calls the checkout backend at api.elvinpeters.com (coding\checkout\); quiz/ hosts the quiz funnel at elvinpeters.com/quiz/; dl/, privacy.html, tos.html, CNAME, sitemap.xml round it out. index_v1-v4.html are kept prior sales-page versions — the promoted one is copied to index.html. Gotchas: .env here contains keys (gitignored — never commit or print it); edits go live on push, so treat this folder as production.
