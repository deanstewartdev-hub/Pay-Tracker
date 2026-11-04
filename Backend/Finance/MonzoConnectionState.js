/*******************************************************
 * PAY TRACKER V3.3 - Monzo connection state (pure)
 * Decides what the stored Monzo status really means, from facts the app
 * already holds. It reads nothing, calls nothing and never exposes a token.
 * Callers pass hasToken (a local property check, not a Monzo request).
 *
 * States:
 *  CONNECTED     An access token is present, the last successful sync is
 *                recent (within the pot-sync freshness window), and the
 *                last sync did not error. Balances may be shown as verified.
 *  UNAVAILABLE   Previously connected but not usable now: the last sync
 *                errored, reauthorisation is needed, there is no successful
 *                sync yet, or the last successful sync is out of date.
 *  DISCONNECTED  No access token, or the stored status says disconnected,
 *                and a successful sync exists from before.
 *  NEVER         No access token and no successful sync ever.
 *
 * Only CONNECTED is "usable". Everything else must be shown as stale.
 *******************************************************/
const PayTrackerMonzoConnectionState = Object.freeze({
  STATES: Object.freeze({
    CONNECTED: 'CONNECTED',
    UNAVAILABLE: 'UNAVAILABLE',
    DISCONNECTED: 'DISCONNECTED',
    NEVER: 'NEVER'
  }),

  SHORT_LABELS: Object.freeze({
    CONNECTED: 'Connected',
    UNAVAILABLE: 'Unavailable',
    DISCONNECTED: 'Disconnected',
    NEVER: 'Not connected'
  }),

  /**
   * @param {Object} input {hasToken, storedStatus, lastSuccess (ISO, Date or ''), error, now (Date)}
   * @return {{state, usable, status, detail, lastSuccess, ageHours}}
   */
  derive: function(input) {
    const now = input.now instanceof Date ? input.now : new Date();
    const status = String(input.storedStatus || '');
    const message = String(input.error || '');
    const last = this.toDate_(input.lastSuccess);
    const ageHours = last ? (now.getTime() - last.getTime()) / 3600000 : null;
    const freshHours = PayTrackerMonzoPotSync.FRESH_HOURS;
    const lastText = last ? PayTrackerMonzoPotSync.formatSynced(last) : '';
    const errored = /error|fail/i.test(status) || /error|fail/i.test(message);
    const reauthorise = /reauthori[sz]/i.test(status + ' ' + message);
    const off = /disconnect|not connected/i.test(status + ' ' + message);

    let state;
    let detail;
    if (!input.hasToken || off) {
      state = last ? this.STATES.DISCONNECTED : this.STATES.NEVER;
      detail = last
        ? 'Disconnected. Last successful sync ' + lastText + '.'
        : 'Not connected to Monzo.';
    } else if (reauthorise || errored) {
      state = this.STATES.UNAVAILABLE;
      detail = 'Previously connected, currently unavailable: ' + (reauthorise ? 'reauthorisation is needed' : 'the last sync failed') +
        (last ? '. Last successful sync ' + lastText + '.' : '.');
    } else if (!last) {
      state = this.STATES.UNAVAILABLE;
      detail = 'Connected, but no successful sync yet.';
    } else if (ageHours < 0 || ageHours > freshHours) {
      state = this.STATES.UNAVAILABLE;
      detail = 'Previously connected, currently unavailable: the last successful sync ' + lastText + ' is out of date.';
    } else {
      state = this.STATES.CONNECTED;
      detail = 'Connected and usable. Last successful sync ' + lastText + '.';
    }

    return {
      state: state,
      usable: state === this.STATES.CONNECTED,
      status: this.SHORT_LABELS[state],
      detail: detail,
      lastSuccess: last ? last.toISOString() : '',
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10
    };
  },

  toDate_: function(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
});
