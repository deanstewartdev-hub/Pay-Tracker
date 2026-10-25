#!/usr/bin/env node
'use strict';
/**
 * Push this checkout to a STAGING Apps Script project without touching .clasp.json.
 *
 *   node tools/staging-push.cjs <stagingScriptId>            # dry run: shows target and files
 *   node tools/staging-push.cjs <stagingScriptId> --push     # copies to a temp folder and runs clasp push there
 *   ... --user paytracker                                    # named clasp login (this project uses "paytracker")
 *
 * Safety:
 * - Refuses the production Script ID (the one in this repo's .clasp.json) and anything
 *   that is not a plausible Script ID.
 * - Never edits .clasp.json: the push runs from a temporary copy with its own .clasp.json.
 * - Copies only what clasp would push from this repo (.js/.gs/.html/.json under rootDir,
 *   excluding .git, node_modules, Tests/node, tools, docs, .github and .claude).
 * - Does not deploy: create the staging web-app deployment yourself in the staging editor.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.github', '.claude', 'docs', 'tools', '.ui-harness']);
const EXCLUDE_PATHS = new Set([path.join('Tests', 'node')]);

function fail(message) { console.error('REFUSED: ' + message); process.exit(1); }

function pushableFiles(dir = ROOT, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name) || EXCLUDE_PATHS.has(relPath)) return [];
      return pushableFiles(path.join(dir, entry.name), relPath);
    }
    if (relPath === '.clasp.json') return [];
    return /\.(js|gs|html)$/.test(entry.name) || relPath === 'appsscript.json' ? [relPath] : [];
  });
}

function main(argv) {
  const stagingId = String(argv[0] || '').trim();
  const push = argv.includes('--push');
  const userIndex = argv.indexOf('--user');
  const user = userIndex === -1 ? '' : String(argv[userIndex + 1] || '').trim();
  if (userIndex !== -1 && !/^[A-Za-z0-9_-]+$/.test(user)) fail('--user needs a clasp login name, e.g. --user paytracker');
  const clasp = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8'));
  const productionId = String(clasp.scriptId || '').trim();

  if (!stagingId) fail('give the STAGING Script ID (staging copy -> Extensions -> Apps Script -> Project Settings).');
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(stagingId)) fail('"' + stagingId + '" does not look like an Apps Script Script ID.');
  if (stagingId === productionId) fail('that is the PRODUCTION Script ID from .clasp.json. Use the staging copy\'s ID.');

  const files = pushableFiles();
  console.log('Target (staging) Script ID : ' + stagingId);
  console.log('Production Script ID       : ' + productionId + '  (never pushed by this tool)');
  console.log('Files to push              : ' + files.length);
  if (!push) {
    files.forEach(f => console.log('  ' + f));
    console.log('\nDry run only. Re-run with --push to push to the staging project.');
    return { stagingId, files, pushed: false };
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paytracker-staging-'));
  files.forEach(rel => {
    fs.mkdirSync(path.join(temp, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(temp, rel));
  });
  fs.writeFileSync(path.join(temp, '.clasp.json'), JSON.stringify(Object.assign({}, clasp, { scriptId: stagingId, rootDir: '' }), null, 2));
  console.log('Pushing from ' + temp + ' ...');
  const claspArgs = ['--no-install', 'clasp', 'push', '--force'].concat(user ? ['-u', user] : []);
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', claspArgs, { cwd: temp, stdio: 'inherit', shell: process.platform === 'win32' });
  fs.rmSync(temp, { recursive: true, force: true });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('Pushed to STAGING. Next: staging editor -> Deploy -> New deployment -> Web app (Execute as: Me, Access: Only myself).');
  return { stagingId, files, pushed: true };
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { main, pushableFiles };
