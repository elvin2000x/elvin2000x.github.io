// Installs the pre-push gate (build + verify) for this repo.
// Usage: node scripts/install-hooks.js
// Hooks live in the git common dir, so one install covers the main checkout
// and every worktree (git worktree add), current and future.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const git = (...a) => execFileSync('git', a, { cwd: __dirname, encoding: 'utf8' }).trim();
let hooksPath = '';
try { hooksPath = git('config', '--get', 'core.hooksPath'); } catch (e) { /* unset: exit 1, the normal case */ }
if (hooksPath) {
  // Not an error to ignore: with core.hooksPath set, git never reads the common hooks dir.
  console.error('core.hooksPath is set; unset it or copy scripts/pre-push there by hand.');
  process.exit(1);
}
const common = path.resolve(__dirname, git('rev-parse', '--git-common-dir'));
const dest = path.join(common, 'hooks', 'pre-push');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, 'pre-push'), 'utf8').replace(/\r\n/g, '\n'));
fs.chmodSync(dest, 0o755);
console.log('pre-push gate installed: ' + dest);
console.log('Worktrees covered: ' + git('worktree', 'list', '--porcelain')
  .split('\n').filter(l => l.startsWith('worktree ')).length);
