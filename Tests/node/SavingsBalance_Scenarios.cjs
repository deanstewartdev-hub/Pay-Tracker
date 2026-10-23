'use strict';
/**
 * Monzo-linked pot balance accuracy. Runs the REAL processContributionRow(),
 * undoLastContribution() and applyMonzoPotBalances() on in-memory Savings sheets:
 * Monzo is the only source of a linked pot's balance; manual pots are unchanged.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function seed(sb, name, headers, rows) {
  const sheet = sb.getSheet(name);
  sheet.rows.length = 0;
  sheet.rows.push(headers.slice());
  rows.forEach(r => sheet.rows.push(headers.map(h => (h in r ? r[h] : ''))));
  return sheet;
}

function fixture() {
  const sb = createSandbox({});
  // Undo ends by redrawing the Finance Dashboard sheet (formatting only, not under test here).
  sb.run('PayTrackerFinanceDashboard = Object.assign({}, PayTrackerFinanceDashboard, { refresh: function () {} })');
  const H = sb.json(`({
    pots: [PayTrackerSavingsConfig.SHEETS.POTS, PayTrackerSavingsConfig.POTS.HEADERS],
    contributions: [PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS, PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS],
    history: [PayTrackerSavingsConfig.SHEETS.HISTORY, PayTrackerSavingsConfig.HISTORY.HEADERS],
    settings: [PayTrackerSavingsConfig.SHEETS.SETTINGS, PayTrackerSavingsConfig.SETTINGS.HEADERS]
  })`);
  const d = (m, day) => sb.date(2026, m - 1, day);
  seed(sb, H.settings[0], H.settings[1], [{ 'Setting': 'Savings Mode', 'Value': 'Fixed Monthly Amount' }, { 'Setting': 'Fixed Monthly Savings Amount', 'Value': 0 }]);
  const pots = seed(sb, H.pots[0], H.pots[1], [
    { 'Pot ID': 'POT-MANUAL', 'Pot Name': 'Cash ISA', 'Current Balance': 1000, 'Active': 'Yes', 'Contribution Method': 'Fixed Amount', 'Contribution Frequency': 'Monthly', 'Contribution Amount': 50 },
    { 'Pot ID': 'POT-MONZO', 'Pot Name': 'House deposit', 'Current Balance': 8000, 'Active': 'Yes', 'Contribution Method': 'Fixed Amount', 'Contribution Frequency': 'Monthly', 'Contribution Amount': 100, 'Linked Monzo Pot ID': 'pot_HOUSE' }
  ]);
  const contributions = seed(sb, H.contributions[0], H.contributions[1], [
    { 'Contribution ID': 'CON-M', 'Due Date': d(10, 5), 'Pot ID': 'POT-MANUAL', 'Pot Name': 'Cash ISA', 'Contribution Amount': 50, 'Deposited?': false, 'Status': 'Upcoming', 'Contribution Method': 'Fixed Amount', 'Contribution Frequency': 'Monthly' },
    { 'Contribution ID': 'CON-Z', 'Due Date': d(10, 5), 'Pot ID': 'POT-MONZO', 'Pot Name': 'House deposit', 'Contribution Amount': 100, 'Deposited?': false, 'Status': 'Upcoming', 'Contribution Method': 'Fixed Amount', 'Contribution Frequency': 'Monthly' }
  ]);
  const history = seed(sb, H.history[0], H.history[1], []);
  const col = (headers, name) => headers.indexOf(name);
  const balance = id => pots.rows.find(r => r[0] === id)[col(H.pots[1], 'Current Balance')];
  const process = id => {
    const row = contributions.rows.findIndex(r => r[0] === id) + 1;
    sb.context.__row = row;
    sb.run(`PayTrackerSavingsContributionService.processContributionRow(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(${JSON.stringify(H.contributions[0])}), __row)`);
  };
  const undo = () => sb.run('PayTrackerSavingsContributionService.undoLastContribution()');
  const historyRow = id => {
    const row = history.rows.find(r => r[0] === id);
    return Object.fromEntries(H.history[1].map((h, i) => [h, row[i]]));
  };
  const monzoSync = (balanceValue) => { sb.context.__pots = [{ id: 'pot_HOUSE', balance: balanceValue, name: 'House deposit' }]; sb.run('PayTrackerSavingsService.applyMonzoPotBalances(__pots)'); };
  return { sb, H, pots, history, balance, process, undo, historyRow, monzoSync, col };
}

test('manually managed pot: recording adds to the balance and undo restores it (unchanged behaviour)', () => {
  const f = fixture();
  f.process('CON-M');
  assert.equal(f.balance('POT-MANUAL'), 1050);
  const h = f.historyRow('CON-M');
  assert.equal(h['Previous Balance'], 1000);
  assert.equal(h['Balance After Deposit'], 1050);
  f.undo();
  assert.equal(f.balance('POT-MANUAL'), 1000);
});

test('Monzo-linked pot: recording does NOT change the balance; history keeps the record and says why', () => {
  const f = fixture();
  f.process('CON-Z');
  assert.equal(f.balance('POT-MONZO'), 8000, 'no double count before Monzo shows the money');
  const h = f.historyRow('CON-Z');
  assert.equal(h['Amount Deposited'], 100, 'the contribution record is preserved');
  assert.equal(h['Previous Balance'], 8000);
  assert.equal(h['Balance After Deposit'], 8000);
  assert.match(String(h['Notes']), /Monzo-linked pot/);
});

test('Monzo-linked pot: the next Monzo sync sets the real balance, counted once', () => {
  const f = fixture();
  f.process('CON-Z');
  f.monzoSync(8100);
  assert.equal(f.balance('POT-MONZO'), 8100);
});

test('delayed or missing transfer: if Monzo still shows the old balance, the pot is not inflated', () => {
  const f = fixture();
  f.process('CON-Z');
  f.monzoSync(8000);
  assert.equal(f.balance('POT-MONZO'), 8000);
});

test('undo on a Monzo-linked pot never overwrites the real Monzo balance', () => {
  const f = fixture();
  f.process('CON-Z');
  f.monzoSync(8100);
  f.undo();
  assert.equal(f.balance('POT-MONZO'), 8100, 'Monzo balance kept');
  assert.equal(f.historyRow('CON-Z')['Undo Status'], 'Undone', 'the record itself is still undone');
});

test('legacy record (made before this fix, which changed the balance) undone on a linked pot keeps the Monzo balance', () => {
  const f = fixture();
  f.process('CON-Z');
  const row = f.history.rows.find(r => r[0] === 'CON-Z');
  row[f.col(f.H.history[1], 'Balance After Deposit')] = 8100; // as the old code would have written
  f.monzoSync(8250);
  f.undo();
  assert.equal(f.balance('POT-MONZO'), 8250);
});

test('pot unlinked after a Monzo-era record: undo does not apply a balance change that never happened', () => {
  const f = fixture();
  f.process('CON-Z');
  const pot = f.pots.rows.find(r => r[0] === 'POT-MONZO');
  pot[f.col(f.H.pots[1], 'Linked Monzo Pot ID')] = '';
  pot[f.col(f.H.pots[1], 'Current Balance')] = 8300; // owner now maintains it by hand
  f.undo();
  assert.equal(f.balance('POT-MONZO'), 8300);
});

console.log(`Savings balance scenarios: ${passed}/${passed} passed.`);
