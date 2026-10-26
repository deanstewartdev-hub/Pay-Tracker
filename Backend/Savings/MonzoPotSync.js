/*******************************************************
 * PAY TRACKER V3.3 - Monzo savings pot balance sync (planner)
 * Pure: decides what a Monzo pot snapshot would change on the
 * Savings Pots sheet. It reads nothing and writes nothing.
 *
 * Rules:
 *  - Pots are matched ONLY by Monzo's permanent pot ID
 *    (Savings Pots "linkedMonzoPotId"). Names are never used to match,
 *    so a renamed pot updates in place and never duplicates.
 *  - Only the display name and the current balance can change. Goals,
 *    contribution settings, planned amounts and history are untouched.
 *  - Monzo's balance is in minor units (pence); converted here.
 *  - A Monzo pot with no matching row is reported, never created.
 *  - An archived/deleted Monzo pot is reported, not zeroed.
 *  - When Monzo is not connected, no balance is shown as live: every
 *    pot is labelled "Stored balance — not currently synced".
 *
 * Mocked snapshots only. Live Monzo calls and applying the plan are
 * separate, approved steps.
 *******************************************************/

const PayTrackerMonzoPotSync = Object.freeze({
  STALE_LABEL: 'Stored balance — not currently synced',

  /**
   * @param {Object} input
   *   connected: boolean, syncedAt: Date|null (last successful sync),
   *   monzoPots: [{id, name, balanceMinor, deleted}],
   *   sheetPots: [{potId, potName, linkedMonzoPotId, currentBalance}]
   */
  plan: function(input) {
    const connected = Boolean(input.connected) && Boolean(input.syncedAt);
    const monzoById = {};
    (input.monzoPots || []).forEach(function(pot) { monzoById[String(pot.id)] = pot; });
    const linked = {};
    const updates = [];
    const labels = {};
    const archived = [];
    const unmatchedSheet = [];

    (input.sheetPots || []).forEach(function(row) {
      const id = String(row.linkedMonzoPotId || '').trim();
      const monzo = id ? monzoById[id] : null;
      if (!monzo) {
        if (id) unmatchedSheet.push({ potId: row.potId, potName: row.potName, linkedMonzoPotId: id });
        labels[row.potId] = this.STALE_LABEL;
        return;
      }
      linked[id] = true;
      if (monzo.deleted) {
        archived.push({ potId: row.potId, potName: row.potName, linkedMonzoPotId: id });
        labels[row.potId] = 'Monzo pot archived — confirm before relying on this balance';
        return;
      }
      if (!connected) {
        labels[row.potId] = this.STALE_LABEL;
        return;
      }
      const balance = this.round(Math.max(Number(monzo.balanceMinor) || 0, 0) / 100);
      const newName = String(monzo.name || '').trim() || row.potName;
      const change = {};
      if (newName !== String(row.potName || '')) change.name = { from: row.potName, to: newName };
      if (balance !== this.round(row.currentBalance)) change.balance = { from: this.round(row.currentBalance), to: balance };
      if (Object.keys(change).length) updates.push({ potId: row.potId, linkedMonzoPotId: id, change: change });
      labels[row.potId] = 'Synced ' + this.formatSynced(input.syncedAt);
    }, this);

    const unmatchedMonzo = (input.monzoPots || []).filter(function(pot) {
      return !pot.deleted && !linked[String(pot.id)];
    }).map(function(pot) {
      return { monzoPotId: String(pot.id), name: pot.name, balance: this.round((Number(pot.balanceMinor) || 0) / 100) };
    }, this);

    return {
      connected: connected,
      syncedAt: connected ? input.syncedAt : null,
      updates: updates,
      unmatchedMonzo: unmatchedMonzo,
      unmatchedSheet: unmatchedSheet,
      archived: archived,
      labels: labels
    };
  },

  formatSynced: function(date) {
    const pad = function(n) { return (n < 10 ? '0' : '') + n; };
    const d = new Date(date);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  round: function(value) { return Math.round((Number(value) || 0) * 100) / 100; }
});
