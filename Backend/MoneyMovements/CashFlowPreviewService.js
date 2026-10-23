/*******************************************************
 * PAY TRACKER V3.3 (Step 2A - Actual Cash Flow)
 * Read-only proposed Money Movements from imported bank data.
 *
 * STRICTLY READ-ONLY: every sheet is opened with getSheetByName
 * and only read. A missing sheet is treated as empty -- this
 * service never runs a setup, never adds the category columns
 * (TransactionCategoryService.readTransactions would), and never
 * writes the ledger. Writing approved proposals is a separate,
 * later step that needs the owner's sign-off.
 *******************************************************/

const PayTrackerCashFlowPreviewService = Object.freeze({
  /**
   * @param {Object=} options {from: Date|'yyyy-mm-dd', to: Date|'yyyy-mm-dd'} (inclusive, Europe/London days)
   */
  getPreview: function(options) {
    const range = this.resolveRange(options || {});
    const context = this.readContext();
    const proposals = PayTrackerCashFlowClassifier
      .classifyAll(context.transactions, context)
      .filter(function(proposal) {
        if (!range.from && !range.to) return true;
        if (!proposal.date) return false;
        const time = proposal.date.getTime();
        return (!range.from || time >= range.from.getTime()) &&
          (!range.to || time < range.to.getTime());
      });
    return {
      from: range.from, to: range.to,
      summary: this.summarise(proposals),
      proposals: proposals
    };
  },

  /**
   * Totals count each transaction once, only when it is New (not
   * already in the ledger, not a possible duplicate, not pending,
   * not excluded). Internal transfers are never income or spending.
   */
  summarise: function(proposals) {
    const C = PayTrackerCashFlowClassifier.CATEGORIES;
    const K = PayTrackerCashFlowClassifier.CONFIDENCE;
    const S = PayTrackerCashFlowClassifier.STATUSES;
    const INCOME = [C.SALARY, C.OTHER_INCOME, C.INTEREST];
    const SPENDING = [C.SPENDING, C.BILL, C.DEBT, C.SUBSCRIPTION];
    const empty = function() {
      return { income: 0, spending: 0, refunds: 0, internalTransfers: 0, unrecognisedIn: 0, unrecognisedOut: 0 };
    };
    const totals = { confirmed: empty(), needsConfirmation: empty() };
    const byCategory = {};
    const byStatus = {};

    proposals.forEach(function(p) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      if (p.status !== S.NEW) return;
      byCategory[p.category] = byCategory[p.category] || { count: 0, amount: 0 };
      byCategory[p.category].count++;
      byCategory[p.category].amount += p.amount;

      const bucket = p.confidence === K.NEEDS_CONFIRMATION ? totals.needsConfirmation : totals.confirmed;
      if (p.internalTransfer) bucket.internalTransfers += p.amount;
      else if (p.category === C.REFUND) bucket.refunds += p.amount;
      else if (INCOME.indexOf(p.category) !== -1) bucket.income += p.amount;
      else if (SPENDING.indexOf(p.category) !== -1) bucket.spending += p.amount;
      else if (p.direction === 'Credit') bucket.unrecognisedIn += p.amount;
      else bucket.unrecognisedOut += p.amount;
    });

    const round = PayTrackerMoneyMovementsSummaryService.round;
    [totals.confirmed, totals.needsConfirmation].forEach(function(bucket) {
      Object.keys(bucket).forEach(function(key) { bucket[key] = round(bucket[key]); });
      bucket.netSpending = round(bucket.spending - bucket.refunds);
      bucket.netCashFlow = round(bucket.income - bucket.netSpending);
    });
    Object.keys(byCategory).forEach(function(key) { byCategory[key].amount = round(byCategory[key].amount); });

    return {
      transactionCount: proposals.length,
      needsConfirmationCount: proposals.filter(function(p) {
        return p.status !== S.EXCLUDED && p.status !== S.ALREADY_RECORDED &&
          p.confidence === K.NEEDS_CONFIRMATION;
      }).length,
      totals: totals,
      byCategory: byCategory,
      byStatus: byStatus
    };
  },

  readContext: function() {
    const T = PayTrackerFinanceIntegrationConfig.SHEETS;
    const transactions = this.readSheet(T.BANK_TRANSACTIONS.NAME);
    const movements = this.readSheet(PayTrackerMoneyMovementsConfig.SHEETS.MOVEMENTS.NAME);
    const subscriptionLinks = this.readSheet(T.SUBSCRIPTION_TRANSACTIONS.NAME);
    const linkedPotIds = this.readSheet(PayTrackerSavingsConfig.SHEETS.POTS)
      .map(function(pot) { return pot.linkedMonzoPotId; })
      .filter(Boolean);
    const employerKeywords = [];
    this.readSheet(PayTrackerReconciliationConfig.SHEETS.JOBS.NAME).forEach(function(job) {
      if (job.active === false) return;
      [job.employer, job.employerKey].forEach(function(value) {
        if (value) employerKeywords.push(String(value));
      });
    });
    return {
      transactions: transactions,
      movements: movements,
      subscriptionLinks: subscriptionLinks,
      linkedPotIds: linkedPotIds,
      employerKeywords: employerKeywords
    };
  },

  /**
   * Header-keyed rows of a sheet, or [] when the sheet doesn't
   * exist. One getValues() per sheet; never creates or formats.
   */
  readSheet: function(name) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet && spreadsheet.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return [];
    const width = sheet.getLastColumn();
    const values = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
    const keys = values[0].map(function(header) {
      return PayTrackerJobRegistryRepository.toKey(header);
    });
    return values.slice(1).map(function(row, index) {
      const record = { rowNumber: index + 2 };
      keys.forEach(function(key, column) { if (key) record[key] = row[column]; });
      return record;
    });
  },

  resolveRange: function(options) {
    const toDay = function(value) {
      if (!value) return null;
      if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
      if (!match) throw new Error('Dates must be yyyy-mm-dd.');
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    };
    const from = toDay(options.from);
    const to = toDay(options.to);
    // "to" is inclusive: stop at the start of the following day.
    return { from: from, to: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : null };
  }
});

/**
 * Read-only: what Pay Tracker would record in Money Movements from
 * the imported Monzo transactions. Writes nothing.
 * e.g. previewPayTrackerCashFlow('2026-10-01', '2026-10-31')
 */
function previewPayTrackerCashFlow(from, to) {
  const preview = PayTrackerCashFlowPreviewService.getPreview({ from: from, to: to });
  Logger.log(JSON.stringify(preview.summary, null, 2));
  return preview;
}
