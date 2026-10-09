# elvinpeters.com

This repo is the live site and it is public. Pushing to master deploys through GitHub Pages in about a minute. Never commit secrets, credentials, admin URLs or internal docs. `.env` is gitignored: never print or commit it.

**Read the full house rules before you change anything.** They are kept outside this public repo: `C:\Users\elvin\coding\site-studio\SITE-RULES.md` on the PC, `~/coding/site-studio/SITE-RULES.md` on the Mac.

The minimum, if you cannot read that file:
1. Before any push, run `node build.js && node verify.js`. The gate must print GREEN. A pre-push hook enforces it in every worktree (`node scripts/install-hooks.js` on a fresh clone). A FAIL means fix the cause, never the check.
2. Never hand-edit generated files. Change `content/*.json` (or use Site Studio), then run `node build.js`.
3. Read `DESIGN-SYSTEM.md` before styling anything.
4. The Site Studio admin code is not in this repo. Do not add a `studio/` folder back.
