'use strict';
/**
 * Integration: the assembled Index.html (every server include expanded from the source
 * files, as includePayTrackerHtml() does) running in a DOM with the real frontend scripts.
 * Proves the Savings workspace registers its handlers, the four Savings tabs respond, and
 * opening the Savings route calls the workspace loader. Uses jsdom (a development-only
 * dependency; see package.json). Google's google.script.run is replaced by a recorder.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const INCLUDE = /<\?!=\s*includePayTrackerHtml\(\s*'([^']+)'\s*\)\s*;?\s*\?>/g;

function expandIncludes(text, missing, depth) {
  assert.ok(depth < 8, 'include nesting is too deep');
  return text.replace(INCLUDE, (match, name) => {
    const file = path.join(REPO, name + '.html');
    if (!fs.existsSync(file)) {
      missing.push(name);
      return '';
    }
    return expandIncludes(fs.readFileSync(file, 'utf8'), missing, depth + 1);
  });
}

function assembleIndex() {
  const missing = [];
  const html = expandIncludes(
    fs.readFileSync(path.join(REPO, 'Frontend', 'Index.html'), 'utf8'),
    missing,
    0
  )
    .replace(/<\?=\s*PAY_TRACKER_WEB_CONFIG\.VERSION\s*\?>/g, '3.2.0')
    .replace(/<\?=\s*pageTitle\s*\?>/g, 'Pay Tracker')
    .replace(/<\?!=\s*bootstrapJson\s*\?>/g, '{"appName":"Pay Tracker","version":"3.2.0"}');
  assert.deepEqual(missing, [], 'every include resolves to a file');
  assert.deepEqual(html.match(/<\?[^>]*\?>/g) || [], [], 'no server scriptlets are left unexpanded');
  return html;
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('the assembled page binds the Savings tabs and loads the workspace on route', async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String(error && error.message || error)));
  virtualConsole.on('error', (value) => errors.push(String(value)));

  const dom = new JSDOM(assembleIndex(), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    url: 'https://example.test/'
  });
  const window = dom.window;
  const calls = [];
  const runner = new Proxy({}, {
    get(target, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') return () => runner;
      return () => { calls.push(String(name)); };
    }
  });
  window.google = { script: { run: runner } };

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const doc = window.document;

  assert.ok(doc.querySelector('[data-savings-workspace]'), 'the Savings page is in the assembled page');

  for (const name of ['pots', 'contributions', 'history', 'overview']) {
    doc.querySelector('[data-savings-tab="' + name + '"]').click();
    const active = doc.querySelector('.savings-tab.is-active');
    assert.equal(active.getAttribute('data-savings-tab'), name, 'the ' + name + ' tab responds to a click');
  }

  calls.length = 0;
  doc.dispatchEvent(new window.CustomEvent('paytracker:routechange', { detail: { route: 'savings' } }));
  assert.ok(calls.includes('getPayTrackerSavingsWorkspace'), 'opening the Savings route calls the workspace loader');

  assert.deepEqual(errors, [], 'no script errors while the page initialises');
  window.close();
});

module.exports = { tests };

if (require.main === module) {
  (async () => {
    let passed = 0;
    let failed = 0;
    for (const item of tests) {
      try {
        await item.run();
        passed++;
        console.log('PASS ' + item.name);
      } catch (error) {
        failed++;
        console.log('FAIL ' + item.name + ': ' + error.message);
      }
    }
    console.log('Savings page integration: ' + passed + '/' + tests.length + ' passed.');
    process.exit(failed ? 1 : 0);
  })();
}
