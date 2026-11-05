/*******************************************************
 * PAY TRACKER V3.3 - Monzo connection state (pure)
 * Decides what the stored Monzo status really means, from facts the app
 * already holds. It reads nothing, calls nothing and never exposes a token.
 * Callers pass hasToken (a local property check, not a Monzo request).
 *
 * Connection states (usability: credentials and the last sync outcome):
 *  CONNECTED     A local access token is present, the last sync did not error,
 *                and no reauthorisation is needed. The connection is usable.
 *  UNAVAILABLE   Token present but unusable now: reauthorisation is required,
 *                or the last sync failed.
 *  DISCONNECTED  No active authorised connection (no token, or the stored
 *                status says disconnected), but a successful sync exists.
 *  NEVER         No token and no successful sync ever (no connection history).
 *
 * Data freshness is a SEPARATE indicator (FRESH / STALE / NONE), based only on
 * the last successful sync time. Stale data does not make a connection
 * unusable; it only stops balances being shown as freshly verified.
 *
 * Token expiry is not probed (that would be a Monzo request). It shows up as
 * a failed or reauthorisation-required sync and is reported as UNAVAILABLE.
 *******************************************************/
const PayTrackerMonzoConnectionState = Object.freeze({
  STATES: Object.freeze({
    CONNECTED: 'CONNECTED',
    UNAVAILABLE: 'UNAVAILABLE',
    DISCONNECTED: 'DISCONNECTED',
    NEVER: 'NEVER'
  }),

  FRESHNESS: Object.freeze({
    FRESH: 'FRESH',
    STALE: 'STALE',
    NONE: 'NONE'
  }),

  SHORT_LABELS: Object.freeze({
    CONNECTED: 'Connected',
    UNAVAILABLE: 'Unavailable',
    DISCONNECTED: 'Disconnected',
    NEVER: 'Never connected'
  }),

  /**
   * @param {Object} input {hasToken, storedStatus, lastSuccess (ISO, Date or ''), error, now (Date)}
   * @return {{state, usable, freshness, status, detail, lastSuccess, ageHours}}
   */
  derive: function(input) {
    const now = input.now instanceof Date ? input.now : (input.now ? new Date(input.now) : new Date());
    const status = String(input.storedStatus || '');
    const message = String(input.error || '');
    const last = this.toDate_(input.lastSuccess);
    const ageHours = last ? (now.getTime() - last.getTime()) / 3600000 : null;
    const lastText = last ? PayTrackerMonzoPotSync.formatSynced(last) : '';
    const errored = /error|fail/i.test(status) || /error|fail/i.test(message);
    const reauthorise = /reauthori[sz]/i.test(status + ' ' + message);
    const off = /disconnect|not connected/i.test(status + ' ' + message);

    // Freshness: a future sync time is not trusted as current.
    let freshness = this.FRESHNESS.NONE;
    if (last) {
      freshness = ageHours >= 0 && ageHours <= PayTrackerMonzoPotSync.FRESH_HOURS
        ? this.FRESHNESS.FRESH
        : this.FRESHNESS.STALE;
    }

    let state;
    let detail;
    if (!input.hasToken || off) {
      state = last ? this.STATES.DISCONNECTED : this.STATES.NEVER;
      detail = last
        ? 'Disconnected. Last successful sync ' + lastText + '.'
        : 'Never connected to Monzo.';
    } else if (reauthorise || errored) {
      state = this.STATES.UNAVAILABLE;
      detail = 'Unavailable: ' + (reauthorise ? 'reauthorisation is needed' : 'the last sync failed') +
        (last ? '. Last successful sync ' + lastText + '.' : '.');
    } else {
      state = this.STATES.CONNECTED;
      detail = !last
        ? 'Connected. No successful sync yet.'
        : freshness === this.FRESHNESS.FRESH
          ? 'Connected. Last successful sync ' + lastText + '.'
          : 'Connected, but data is out of date: last successful sync ' + lastText + '. Sync to refresh.';
    }

    const label = state === this.STATES.CONNECTED && freshness === this.FRESHNESS.STALE
      ? 'Connected · data out of date'
      : this.SHORT_LABELS[state];

    return {
      state: state,
      usable: state === this.STATES.CONNECTED,
      freshness: freshness,
      status: label,
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
