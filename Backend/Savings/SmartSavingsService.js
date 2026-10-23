/*******************************************************
 * PAY TRACKER V3.3 (Step 3 - Smart Savings)
 * Read-only Smart Savings preview, plus one guarded confirmation.
 *
 * getPreview() reads the existing sheets once each (via Step 2A's
 * read-only reader), reuses the cash-flow classifier (2A) and the
 * payment timeline (2B), and writes nothing. It never moves money.
 *
 * confirmContribution() is the only write, and only on an explicit
 * user click: it re-checks the queued contribution is still due and
 * unchanged, then hands it to the EXISTING Savings "mark deposited"
 * path (PayTrackerWebSavingsWorkspaceService.markContributionDeposited).
 * It records that the owner moved the money; it moves none itself.
 *******************************************************/

const PayTrackerSmartSavingsService = Object.freeze({
  getPreview: function() {
    const read = PayTrackerCashFlowPreviewService.readSheet;
    const savings = PayTrackerSavingsConfig.SHEETS;
    const finance = PayTrackerFinanceConfig.SHEETS;
    const now = new Date();

    const context = PayTrackerCashFlowPreviewService.readContext();
    const cashFlow = PayTrackerCashFlowClassifier.classifyAll(context.transactions, context);

    const matchedPaymentIds = {};
    context.transactions.forEach(function(tx) {
      const status = String(tx.matchStatus || '').trim();
      if (tx.matchedFinanceId && status && status !== 'Rejected' && status !== 'Unmatched') {
        matchedPaymentIds[String(tx.matchedFinanceId)] = true;
      }
    });

    const payments = read(finance.PAYMENTS).map(function(row) { row.paid = row['paid?']; return row; });
    // Same (cached) timeline the Upcoming Payments cards show.
    const timeline = PayTrackerUpcomingPaymentsService.get({});

    const result = PayTrackerSmartSavingsCalculator.calculate({
      today: now,
      cashFlow: cashFlow,
      upcoming: timeline.upcoming,
      payments: payments,
      matchedPaymentIds: matchedPaymentIds,
      // "Allocation %" keys as "allocation %"; give it a plain name.
      pots: read(savings.POTS).map(function(row) { row.allocation = row['allocation %']; return row; }),
      contributions: read(savings.CONTRIBUTIONS).map(function(row) { row.deposited = row['deposited?']; return row; }),
      history: read(savings.HISTORY),
      goals: read(savings.GOALS),
      settings: this.readSettings(read(savings.SETTINGS))
    });
    result.generatedAt = new Date().toISOString();
    return result;
  },

  readSettings: function(rows) {
    const keys = PayTrackerSavingsConfig.SETTINGS.KEYS;
    const value = {};
    rows.forEach(function(row) { value[String(row.setting || '').trim()] = row.value; });
    return {
      mode: value[keys.MODE] || 'Percentage of Disposable Income',
      percentage: value[keys.PERCENTAGE],
      fixedAmount: value[keys.FIXED_AMOUNT],
      maximumAmount: value[keys.MAXIMUM_AMOUNT]
    };
  },

  /**
   * @param {string} contributionId
   * @param {number} expectedAmount the amount the owner saw and confirmed
   */
  confirmContribution: function(contributionId, expectedAmount) {
    const id = String(contributionId || '').trim();
    if (!id) throw new Error('No savings contribution was given.');
    const row = PayTrackerCashFlowPreviewService.readSheet(PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS)
      .filter(function(record) { return String(record.contributionId || '').trim() === id; })[0];
    if (!row) throw new Error('Savings contribution "' + id + '" was not found. Refresh and try again.');
    if (PayTrackerPaymentTimeline.isTrue(row['deposited?']) || String(row.status || '') === 'Completed') {
      throw new Error('This contribution is already marked as deposited.');
    }
    const amount = Math.round((Number(row.contributionAmount) || 0) * 100) / 100;
    if (Math.abs(amount - (Number(expectedAmount) || 0)) >= 0.005) {
      throw new Error('This contribution changed to £' + amount.toFixed(2) + ' since you loaded the page. Refresh and check it again.');
    }
    // A Monzo-linked pot is recorded only when Monzo itself shows the deposit (re-checked here, not trusted from the page).
    const listed = this.getPreview().confirmations.filter(function(item) { return item.contributionId === id; })[0];
    if (listed && listed.monzoLinked && !listed.bankEvidence) {
      throw new Error('Monzo does not show this ' + '£' + amount.toFixed(2) + ' deposit into ' + listed.potName +
        ' yet. Move the money in Monzo, run "Check Monzo now", then try again.');
    }
    return PayTrackerWebSavingsWorkspaceService.markContributionDeposited(id);
  }
});

/** Browser API: read-only Smart Savings preview. */
function getPayTrackerSmartSavingsPreview() {
  return JSON.parse(JSON.stringify(Object.assign({ success: true }, PayTrackerSmartSavingsService.getPreview())));
}

/**
 * Browser API: the owner confirms they moved a queued contribution
 * themselves. Records it through the existing Savings workflow.
 */
function confirmPayTrackerSmartSavingsContribution(contributionId, expectedAmount) {
  PayTrackerSmartSavingsService.confirmContribution(contributionId, expectedAmount);
  return getPayTrackerSmartSavingsPreview();
}
