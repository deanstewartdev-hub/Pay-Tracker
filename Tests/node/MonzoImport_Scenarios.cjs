'use strict';
/**
 * PayTrackerMonzoService.storeTransactions() on an in-memory Bank Transactions sheet:
 * batched writes, no duplicates, and pending transactions updated when they settle
 * without disturbing their bill-match columns.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function fixture() {
  const sb = createSandbox({});
  const headers = sb.json('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.HEADERS');
  const sheet = sb.getSheet(sb.run('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME'));
  sheet.rows.push(headers.slice());
  // Count Sheets writes.
  const counts = { appendRow: 0, setValues: 0, setValue: 0 };
  const realAppend = sheet.appendRow.bind(sheet);
  sheet.appendRow = v => { counts.appendRow++; return realAppend(v); };
  const realGetRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...args) => {
    const range = realGetRange(...args);
    return new Proxy(range, { get(target, key) {
      if (key === 'setValues') return v => { counts.setValues++; return target.setValues(v); };
      if (key === 'setValue') return v => { counts.setValue++; return target.setValue(v); };
      return target[key];
    } });
  };
  const store = txs => { sb.context.__txs = txs; return sb.run('PayTrackerMonzoService.storeTransactions({ id: "acc_1" }, __txs)'); };
  const col = name => headers.indexOf(name);
  return { sb, sheet, counts, store, col };
}

const tx = (id, fields = {}) => Object.assign({
  id, created: '2026-10-20T10:00:00Z', settled: '2026-10-21T02:00:00Z', description: 'TESCO', amount: -1234,
  currency: 'GBP', category: 'groceries', merchant: { id: 'merch_1', name: 'Tesco' }
}, fields);

test('100 new transactions are written in ONE batched write, not 100 appendRow calls', () => {
  const { sheet, counts, store } = fixture();
  const txs = Array.from({ length: 100 }, (_, i) => tx('tx_' + i));
  assert.equal(store(txs), 100);
  assert.equal(counts.appendRow, 0);
  assert.equal(counts.setValues, 1);
  assert.equal(sheet.rows.length, 101);
});

test('the stored row layout is exactly what appendRow wrote before', () => {
  const { sheet, store, col } = fixture();
  store([tx('tx_a'), tx('tx_b', { amount: 5000, settled: '', merchant: null, description: 'SALARY' })]);
  const [a, b] = sheet.rows.slice(1);
  assert.equal(a.length, 21);
  assert.equal(a[col('Transaction ID')], 'tx_a');
  assert.equal(a[col('Connection ID')], 'MONZO-PERSONAL');
  assert.equal(a[col('Merchant Name')], 'Tesco');
  assert.equal(a[col('Amount')], 12.34);
  assert.equal(a[col('Debit or Credit')], 'Debit');
  assert.equal(a[col('Pending')], false);
  assert.equal(a[col('Match Status')], 'Unmatched');
  assert.equal(b[col('Merchant Name')], 'SALARY', 'no merchant: description is used');
  assert.equal(b[col('Debit or Credit')], 'Credit');
  assert.equal(b[col('Pending')], true);
});

test('repeat imports and duplicates inside one response add nothing', () => {
  const { sheet, store } = fixture();
  store([tx('tx_1'), tx('tx_2')]);
  assert.equal(store([tx('tx_1'), tx('tx_2'), tx('tx_3'), tx('tx_3')]), 1);
  assert.equal(sheet.rows.length, 4);
});

test('a pending transaction is updated when it settles; its match columns are untouched', () => {
  const { sb, sheet, store, col } = fixture();
  store([tx('tx_p', { settled: '', amount: -1000 })]);
  const row = sheet.rows[1];
  assert.equal(row[col('Pending')], true);
  // The matcher suggested a bill meanwhile.
  row[col('Matched Finance ID')] = 'PAY-1'; row[col('Match Status')] = 'Suggested'; row[col('Match Confidence')] = 80;
  assert.equal(store([tx('tx_p', { settled: '2026-10-22T03:00:00Z', amount: -1050 })]), 0, 'not a new transaction');
  assert.equal(row[col('Pending')], false);
  assert.equal(row[col('Amount')], 10.5, 'final settled amount');
  assert.ok(row[col('Settled At')] instanceof sb.run('Date'));
  assert.equal(row[col('Matched Finance ID')], 'PAY-1');
  assert.equal(row[col('Match Status')], 'Suggested');
  assert.equal(row[col('Match Confidence')], 80);
});

test('a settled transaction is never rewritten on later syncs', () => {
  const { sheet, counts, store } = fixture();
  store([tx('tx_s')]);
  const writes = counts.setValues + counts.setValue;
  const before = JSON.stringify(sheet.rows);
  store([tx('tx_s', { amount: -9999 })]);
  assert.equal(counts.setValues + counts.setValue, writes, 'no writes at all');
  assert.equal(JSON.stringify(sheet.rows), before);
});

test('a still-pending transaction is left alone', () => {
  const { sheet, store } = fixture();
  store([tx('tx_p', { settled: '' })]);
  const before = JSON.stringify(sheet.rows);
  store([tx('tx_p', { settled: '' })]);
  assert.equal(JSON.stringify(sheet.rows), before);
});

console.log(`Monzo import scenarios: ${passed}/${passed} passed.`);
