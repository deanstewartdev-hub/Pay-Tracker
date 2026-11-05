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

/** Polls a condition until it holds, or fails with a clear message after a generous ceiling. */
async function waitUntil(predicate, label, ceilingMs = 15000) {
  const deadline = Date.now() + ceilingMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(label + ' did not appear within ' + ceilingMs + ' ms');
}

async function waitForSavingsBinding(window) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const pots = window.document.querySelector('[data-savings-tab="pots"]');
    if (pots) {
      pots.click();
      const active = window.document.querySelector('.savings-tab.is-active');
      if (active && active.getAttribute('data-savings-tab') === 'pots') {
        window.document.querySelector('[data-savings-tab="overview"]').click();
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Savings handlers did not bind within 8 seconds');
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

  await waitForSavingsBinding(window);
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

test('repeated navigation to Savings starts one workspace load while one is in flight', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleIndex(), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' });
  const window = dom.window;
  const calls = [];
  const runner = new Proxy({}, {
    get(target, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') return () => runner;
      return () => { calls.push(String(name)); };
    }
  });
  window.google = { script: { run: runner } };
  await waitForSavingsBinding(window);
  const navigate = () => window.document.dispatchEvent(new window.CustomEvent('paytracker:routechange', { detail: { route: 'savings' } }));
  navigate();
  navigate();
  navigate();
  const workspaceCalls = calls.filter((name) => name === 'getPayTrackerSavingsWorkspace');
  assert.equal(workspaceCalls.length, 1, 'only one workspace request is sent while one is in flight');
  window.close();
});

test('a workspace request that never returns shows the timeout notice and stops loading', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleIndex(), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/',
    beforeParse(window) {
      // Shorten only the 45-second workspace timeout so the real timeout path runs quickly.
      const realSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 45000 ? 50 : ms, ...args);
    }
  });
  const window = dom.window;
  const runner = new Proxy({}, {
    get(target, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') return () => runner;
      return () => {};
    }
  });
  window.google = { script: { run: runner } };
  await waitForSavingsBinding(window);
  window.document.dispatchEvent(new window.CustomEvent('paytracker:routechange', { detail: { route: 'savings' } }));
  // Deterministic readiness: wait for the timeout notice itself (no fixed sleep).
  await waitUntil(() => {
    const n = window.document.querySelector('[data-savings-notice]');
    return Boolean(n && /taking too long to load/.test(n.textContent));
  }, 'the timeout notice');
  const notice = window.document.querySelector('[data-savings-notice]');
  assert.match(notice.textContent, /taking too long to load/);
  assert.equal(window.document.querySelector('[data-savings-loading]').hidden, true, 'the loading state is cleared');
  window.close();
});

test('a failed workspace request shows the error and clears the loading state', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(assembleIndex(), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' });
  const window = dom.window;
  // Pair each server call with the failure handler set just before it.
  let pendingFailure = null;
  const failureFor = {};
  const runner = new Proxy({}, {
    get(target, name) {
      if (name === 'withSuccessHandler') return () => runner;
      if (name === 'withFailureHandler') return (handler) => { pendingFailure = handler; return runner; };
      return () => { failureFor[String(name)] = pendingFailure; pendingFailure = null; };
    }
  });
  window.google = { script: { run: runner } };
  await waitForSavingsBinding(window);
  window.document.dispatchEvent(new window.CustomEvent('paytracker:routechange', { detail: { route: 'savings' } }));
  const failureHandler = failureFor.getPayTrackerSavingsWorkspace;
  assert.ok(failureHandler, 'a failure handler was registered for the workspace request');
  failureHandler(new Error('Required sheet not found: Savings Pots'));
  const notice = window.document.querySelector('[data-savings-notice]');
  assert.match(notice.textContent, /Required sheet not found/);
  assert.equal(window.document.querySelector('[data-savings-loading]').hidden, true);
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
