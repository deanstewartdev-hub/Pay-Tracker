/*******************************************************
 * PAY TRACKER V3.3 - Monzo savings pot sync planner: mocked-snapshot checks.
 * The balances below are the user-confirmed reference values, used as
 * regression fixtures only. Nothing here writes a real balance.
 *******************************************************/

function runMonzoPotSyncTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const S = PayTrackerMonzoPotSync;
  const syncedAt = new Date(2026, 9, 26, 9, 15);
  // Mocked Monzo snapshot (pence). Holiday Scotland was renamed Holiday Spain in Monzo.
  const monzoPots = [
    { id: 'pot_home', name: 'Home Mortgage', balanceMinor: 25, deleted: false },
    { id: 'pot_prague', name: 'Holiday Prague', balanceMinor: 0, deleted: false },
    { id: 'pot_scotland', name: 'Holiday Spain', balanceMinor: 36, deleted: false },
    { id: 'pot_emergency', name: 'Emergency', balanceMinor: 10000, deleted: false }
  ];
  // Stored sheet rows (stale figures). Names differ from Monzo on purpose: matching is by ID.
  const sheetPots = [
    { potId: 'P1', potName: 'Home Deposit', linkedMonzoPotId: 'pot_home', currentBalance: 500 },
    { potId: 'P2', potName: 'Holiday - Prague', linkedMonzoPotId: 'pot_prague', currentBalance: 120 },
    { potId: 'P3', potName: 'Holiday - Scotland', linkedMonzoPotId: 'pot_scotland', currentBalance: 300 }
  ];
  const connected = S.plan({ connected: true, syncedAt: syncedAt, monzoPots: monzoPots, sheetPots: sheetPots });
  const updateFor = function(potId) { return connected.updates.filter(function(u) { return u.potId === potId; })[0]; };

  check('fixture total across the three pots is £0.61',
    Math.round((25 + 0 + 36)) / 100 === 0.61);
  check('pots match by Monzo ID even when the display names differ', updateFor('P1') !== undefined);
  check('Home Mortgage balance syncs to £0.25', updateFor('P1').change.balance.to === 0.25);
  check('Holiday Prague zero balance syncs to £0.00', updateFor('P2').change.balance.to === 0);
  check('a renamed pot updates in place: Holiday Scotland becomes Holiday Spain',
    updateFor('P3').change.name.to === 'Holiday Spain' && updateFor('P3').change.name.from === 'Holiday - Scotland');
  check('a renamed pot does not create a duplicate row',
    connected.unmatchedSheet.length === 0 && connected.unmatchedMonzo.every(function(p) { return p.monzoPotId !== 'pot_scotland'; }));
  check('withdrawals reduce the stored balance (£3.00 down to £0.36)', updateFor('P3').change.balance.to === 0.36);
  check('a Monzo pot with no matching row is reported, not created',
    connected.unmatchedMonzo.length === 1 && connected.unmatchedMonzo[0].monzoPotId === 'pot_emergency' && connected.updates.every(function(u) { return u.potId !== 'pot_emergency'; }));
  check('updates change only the name and balance (goals, contributions and history are untouched)',
    connected.updates.every(function(u) { return Object.keys(u.change).every(function(k) { return k === 'name' || k === 'balance'; }); }));
  check('a synced pot is labelled with the sync time, not as stale',
    /^Synced 2026-10-26 09:15$/.test(connected.labels.P1));

  // Disconnected: nothing is presented as live.
  const offline = S.plan({ connected: false, syncedAt: syncedAt, monzoPots: monzoPots, sheetPots: sheetPots });
  check('with Monzo disconnected, no balance is changed', offline.updates.length === 0 && offline.connected === false);
  check('with Monzo disconnected, every pot says it is a stored balance, not currently synced',
    sheetPots.every(function(p) { return offline.labels[p.potId] === 'Stored balance — not currently synced'; }));
  const noSyncTime = S.plan({ connected: true, syncedAt: null, monzoPots: monzoPots, sheetPots: sheetPots });
  check('without a successful sync time, balances are not presented as synced',
    noSyncTime.updates.length === 0 && noSyncTime.labels.P1 === 'Stored balance — not currently synced');

  // Archived in Monzo: flagged, never zeroed.
  const archivedSnapshot = monzoPots.map(function(p) { return p.id === 'pot_prague' ? Object.assign({}, p, { deleted: true }) : p; });
  const archived = S.plan({ connected: true, syncedAt: syncedAt, monzoPots: archivedSnapshot, sheetPots: sheetPots });
  check('an archived Monzo pot is reported and its stored balance is left alone',
    archived.archived.length === 1 && archived.archived[0].potId === 'P2' && archived.updates.every(function(u) { return u.potId !== 'P2'; }));
  check('an archived pot is labelled for confirmation, not as live', /archived/.test(archived.labels.P2));

  // Unchanged balances produce no update.
  const unchanged = S.plan({ connected: true, syncedAt: syncedAt,
    monzoPots: [{ id: 'pot_home', name: 'Home Deposit', balanceMinor: 50000, deleted: false }],
    sheetPots: [{ potId: 'P9', potName: 'Home Deposit', linkedMonzoPotId: 'pot_home', currentBalance: 500 }] });
  check('an unchanged pot produces no update', unchanged.updates.length === 0);

  return { success: true, passed: results.length, results: results };
}
