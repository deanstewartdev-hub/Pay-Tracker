/*******************************************************
 * PAY TRACKER V3.3 (Step 2B - Dynamic Upcoming Payments)
 * Reads the existing Bills, Finance Payments, Payment History,
 * Subscriptions, Subscription Transactions and Bank Transactions
 * sheets (read-only, one getValues() each) and caches the result
 * so the Dashboard can show upcoming payments immediately.
 *
 * It never runs a sync, never calls Monzo and never writes a sheet.
 * Freshness comes from the Unified Sync Engine's Sync Status row.
 *
 * The cache holds PaymentTimeline.buildSeries() output, which does
 * not depend on today's date; statuses and countdowns are always
 * computed at request time, so a cached answer is never "stale"
 * about which day it is, only about bank data newer than builtAt.
 *******************************************************/

const PayTrackerUpcomingPaymentsService = Object.freeze({
  // V2: series carry their payment evidence (date-driven timeline). Older cached shapes are ignored.
  CACHE_KEY: 'PAYTRACKER_UPCOMING_PAYMENTS_V2',
  CACHE_SECONDS: 6 * 60 * 60,

  /**
   * @param {Object=} options {kind, limit, refresh, horizonDays}
   */
  get: function(options) {
    const opts = options || {};
    let model = opts.refresh === true ? null : this.readCache();
    let source = 'cache';
    if (!model) {
      model = this.build();
      this.writeCache(model);
      source = 'live';
    }
    const view = PayTrackerPaymentTimeline.present(model, new Date(), {
      kind: opts.kind || '', limit: Number(opts.limit) || 0, horizonDays: Number(opts.horizonDays) || 0
    });
    return Object.assign(view, {
      source: source,
      builtAt: model.builtAt,
      bank: model.bank
    });
  },

  build: function() {
    const read = PayTrackerCashFlowPreviewService.readSheet;
    const finance = PayTrackerFinanceConfig.SHEETS;
    const integration = PayTrackerFinanceIntegrationConfig.SHEETS;
    const model = PayTrackerPaymentTimeline.buildSeries({
      bills: read(finance.BILLS),
      // "Paid?" keys as "paid?"; give it a plain name.
      payments: read(finance.PAYMENTS).map(function(row) {
        row.paid = row['paid?'];
        return row;
      }),
      paymentHistory: read(finance.PAYMENT_HISTORY),
      subscriptions: read(integration.SUBSCRIPTIONS.NAME),
      subscriptionLinks: read(integration.SUBSCRIPTION_TRANSACTIONS.NAME),
      bankTransactions: read(integration.BANK_TRANSACTIONS.NAME)
    });
    model.builtAt = new Date().toISOString();
    model.bank = this.readBankFreshness();
    return model;
  },

  readBankFreshness: function() {
    const row = PayTrackerCashFlowPreviewService.readSheet(PayTrackerSyncConfig.SHEET.NAME)
      .filter(function(record) { return record.taskId === 'MONZO_TRANSACTIONS'; })[0];
    if (!row) return { lastSuccess: '', status: 'Unknown', message: 'Monzo has not synced yet.' };
    const lastSuccess = PayTrackerPaymentTimeline.toDate(row.lastSuccess);
    return {
      lastSuccess: lastSuccess ? lastSuccess.toISOString() : '',
      status: String(row.status || ''),
      message: String(row.message || row.lastError || '')
    };
  },

  readCache: function() {
    try {
      const text = CacheService.getScriptCache().get(this.CACHE_KEY);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      return null;
    }
  },

  writeCache: function(model) {
    try {
      CacheService.getScriptCache().put(this.CACHE_KEY, JSON.stringify(model), this.CACHE_SECONDS);
    } catch (error) {
      // Over the cache size limit or cache unavailable: the next request reads the sheets again.
    }
  },

  invalidate: function() {
    try { CacheService.getScriptCache().remove(this.CACHE_KEY); } catch (error) { /* best effort */ }
  }
});

/**
 * Browser API. Returns cached data immediately unless refresh is
 * true. kind: '' (both), 'Bill' or 'Subscription'.
 */
function getPayTrackerUpcomingPayments(input) {
  const options = input || {};
  return Object.assign({ success: true }, PayTrackerUpcomingPaymentsService.get({
    kind: options.kind === 'Bill' || options.kind === 'Subscription' ? options.kind : '',
    limit: options.limit,
    refresh: options.refresh === true
  }));
}
