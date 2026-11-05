'use strict';
/**
 * Regression for the Savings workspace hang on staging. The Apps Script template engine
 * (HtmlService evaluate()) reads tag-like text inside JavaScript strings. For the
 * balance-state badge it rewrote a '+' into "&#43;", and then a later variant made the whole
 * include fail with "Malformed HTML content", so the staging app would not start.
 * The badge is now built with the DOM. This check keeps the Savings service source free of
 * that tag text, and keeps the DOM build in place. Offline; reads the source file only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SAVINGS_SERVICE = path.resolve(__dirname, '..', '..', 'Frontend', 'Services', 'SavingsWorkspaceService.html');

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('the Savings service source contains no tag text for the balance badge', () => {
  const text = fs.readFileSync(SAVINGS_SERVICE, 'utf8');
  assert.equal(text.indexOf('<small class'), -1, 'the balance badge must be built with the DOM, not "<small class" text');
});

test('the balance badge is built with the DOM and keeps its verification classes', () => {
  const text = fs.readFileSync(SAVINGS_SERVICE, 'utf8');
  assert.ok(text.includes("document.createElement('small')"), 'badge element is created with the DOM');
  assert.ok(text.includes('savings-balance-state--verified'), 'verified class is kept');
  assert.ok(text.includes('savings-balance-state--stored'), 'stored class is kept');
});

module.exports = { tests };

if (require.main === module) {
  let passed = 0;
  let failed = 0;
  for (const item of tests) {
    try {
      item.run();
      passed++;
      console.log('PASS ' + item.name);
    } catch (error) {
      failed++;
      console.log('FAIL ' + item.name + ': ' + error.message.split('\n').slice(0, 6).join(' | '));
    }
  }
  console.log('Savings template markup: ' + passed + '/' + tests.length + ' passed.');
  process.exit(failed ? 1 : 0);
}
