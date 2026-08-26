/*******************************************************
 * PAY TRACKER V3.0
 * Backend/Analytics/AnalyticsService.js
 *
 * Aggregates existing ledgers into traceable, job/date-filterable
 * report data (roadmap Phase 9). Reads only -- never writes to any
 * sheet, never creates one. Every number here can be traced back to
 * a specific ledger record; nothing is estimated or invented here.
 *
 * Split deliberately into two halves:
 * - Pure functions (top section): take already-fetched arrays/plain
 *   values in, return plain data out. No SpreadsheetApp calls, so
 *   these run unmodified in a Node vm test.
 * - Orchestration functions (bottom section): read the real ledgers
 *   via the same repositories/services every other workspace already
 *   uses (PayTrackerJobRegistryRepository, PayTrackerAnnualLeaveBalanceService,
 *   PayTrackerPayAdjustmentsSummaryService, PayTrackerMoneyMovementsRepository,
 *   PayTrackerTransactionCategoryService, PayTrackerPayslipRepository) --
 *   nothing here re-implements a calculation that already exists
 *   elsewhere.
 *******************************************************/

const PayTrackerAnalyticsService = Object.freeze({
  MONTH_NAMES: Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]),

  READY_COMPARISON_STATUSES: Object.freeze([
    'Matched', 'Minor Variance', 'Review', 'Major Discrepancy'
  ]),

  // ---------------------------------------------------------------
  // Pure functions
  // ---------------------------------------------------------------

  round: function(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  },

  toDate: function(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  },

  toTime: function(value) {
    const date = this.toDate(value);
    return date ? date.getTime() : 0;
  },

  monthKey: function(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  },

  monthLabel: function(date) {
    return this.MONTH_NAMES[date.getMonth()] + ' ' + String(date.getFullYear()).slice(-2);
  },

  isWithinRange: function(date, from, to) {
    // A record with no date is never excluded by a date filter --
    // there is nothing to compare, so hiding it would look like data
    // loss rather than "not applicable".
    if (!(date instanceof Date)) return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  },

  sumBy: function(items, valueFn) {
    return items.reduce(function(total, item) {
      return total + (Number(valueFn(item)) || 0);
    }, 0);
  },

  groupSum: function(items, keyFn, valueFn) {
    const self = this;
    const map = {};
    items.forEach(function(item) {
      const key = keyFn(item) || 'Uncategorised';
      map[key] = (map[key] || 0) + (Number(valueFn(item)) || 0);
    });
    return Object.keys(map)
      .map(function(key) { return { key: key, total: self.round(map[key]) }; })
      .sort(function(a, b) { return b.total - a.total; });
  },

  /**
   * @param {Object} job One Jobs registry record (needs jobId,
   *   jobName, employerKey).
   * @param {Object[]} weeks PaySheet weeks from readPaySheet().weeks
   *   (each with weekStart: Date, employers: {<employerKey>: {entries}}).
   * @param {Date|null} dateFrom
   * @param {Date|null} dateTo
   */
  buildWorkAndPayForJob: function(job, weeks, dateFrom, dateTo) {
    const self = this;
    const entries = [];

    weeks.forEach(function(week) {
      if (!self.isWithinRange(week.weekStart instanceof Date ? week.weekStart : null, dateFrom, dateTo)) return;
      const employer = week.employers && week.employers[job.employerKey];
      if (!employer) return;
      (employer.entries || []).forEach(function(entry) { entries.push(entry); });
    });

    return {
      jobId: job.jobId,
      jobName: job.jobName,
      shiftCount: entries.length,
      totalHours: this.round(this.sumBy(entries, function(e) { return e.hours; })),
      totalPay: this.round(this.sumBy(entries, function(e) { return e.pay; })),
      hoursByType: this.groupSum(entries, function(e) { return e.enhancement; }, function(e) { return e.hours; }),
      payByType: this.groupSum(entries, function(e) { return e.enhancement; }, function(e) { return e.pay; })
    };
  },

  /**
   * @param {Object[]} payslips PayTrackerPayslipRepository.getAll() shape.
   */
  buildPayslipTrend: function(payslips, dateFrom, dateTo) {
    const self = this;
    return payslips
      .filter(function(payslip) {
        return self.isWithinRange(self.toDate(payslip.payDate), dateFrom, dateTo);
      })
      .map(function(payslip) {
        return {
          payslipId: payslip.payslipId,
          payDate: payslip.payDate,
          predictedGross: Number(payslip.predictedGross) || 0,
          grossPayActual: Number(payslip.grossPayActual) || 0,
          predictedTakeHome: Number(payslip.predictedTakeHome) || 0,
          netPayActual: Number(payslip.netPayActual) || 0,
          comparisonStatus: payslip.comparisonStatus || ''
        };
      })
      .sort(function(a, b) { return self.toTime(a.payDate) - self.toTime(b.payDate); });
  },

  /**
   * @param {Object[]} payslips
   * @param {Object[]} adjustmentSummaries PayTrackerPayAdjustmentsSummaryService.getAllSummaries() shape.
   * @param {number} uncategorisedTransactionCount
   */
  buildReconciliationSummary: function(payslips, adjustmentSummaries, uncategorisedTransactionCount) {
    const self = this;
    const compared = payslips.filter(function(payslip) {
      return self.READY_COMPARISON_STATUSES.indexOf(payslip.comparisonStatus) !== -1;
    });
    const matched = compared.filter(function(payslip) { return payslip.comparisonStatus === 'Matched'; });

    const adjustmentTotals = adjustmentSummaries.reduce(function(sum, record) {
      sum.recoveredAmount += Number(record.recoveredAmount) || 0;
      sum.outstandingAmount += Number(record.outstandingAmount) || 0;
      return sum;
    }, { recoveredAmount: 0, outstandingAmount: 0 });

    return {
      payslipsComparedCount: compared.length,
      payslipsMatchedCount: matched.length,
      payslipMatchRatePercent: compared.length ? this.round((matched.length / compared.length) * 100) : null,
      adjustmentsRecoveredAmount: this.round(adjustmentTotals.recoveredAmount),
      adjustmentsOutstandingAmount: this.round(adjustmentTotals.outstandingAmount),
      uncategorisedTransactionCount: uncategorisedTransactionCount
    };
  },

  /**
   * @param {Object[]} movements PayTrackerMoneyMovementsRepository.getAll() shape.
   * @param {number} monthCount
   * @param {string[]} internalTransferTypes
   * @param {string[]} incomeTypes
   * @param {string[]} spendingTypes
   * @param {Date} [referenceDate] Defaults to now; passed explicitly in tests for a deterministic bucket range.
   */
  buildCashFlowTrend: function(movements, monthCount, internalTransferTypes, incomeTypes, spendingTypes, referenceDate) {
    const self = this;
    const now = referenceDate instanceof Date ? referenceDate : new Date();
    const months = [];

    for (let offset = monthCount - 1; offset >= 0; offset--) {
      const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({
        key: this.monthKey(bucketDate),
        label: this.monthLabel(bucketDate),
        income: 0,
        spending: 0
      });
    }

    const monthByKey = {};
    months.forEach(function(month) { monthByKey[month.key] = month; });

    movements.forEach(function(record) {
      const date = self.toDate(record.date);
      if (!date) return;
      const bucket = monthByKey[self.monthKey(date)];
      if (!bucket) return;

      const isInternal = record.internalTransfer === true || internalTransferTypes.indexOf(record.movementType) !== -1;
      if (isInternal) return;

      const amount = Math.abs(Number(record.amount) || 0);
      if (incomeTypes.indexOf(record.movementType) !== -1) bucket.income += amount;
      else if (spendingTypes.indexOf(record.movementType) !== -1) bucket.spending += amount;
    });

    return months.map(function(month) {
      return {
        monthKey: month.key,
        monthLabel: month.label,
        income: self.round(month.income),
        spending: self.round(month.spending),
        net: self.round(month.income - month.spending)
      };
    });
  },

  /**
   * @param {Object[]} transactions PayTrackerTransactionCategoryService.readTransactions() shape.
   */
  buildSpendingByCategory: function(transactions, dateFrom, dateTo) {
    const self = this;
    const filtered = transactions.filter(function(tx) {
      return String(tx.direction) === 'Debit' &&
        Boolean(tx.payTrackerCategory) &&
        self.isWithinRange(self.toDate(tx.settledAt), dateFrom, dateTo);
    });

    return this.groupSum(
      filtered,
      function(tx) { return tx.payTrackerCategory; },
      function(tx) { return Math.abs(Number(tx.amount) || 0); }
    );
  },

  // ---------------------------------------------------------------
  // Orchestration -- reads the real ledgers, delegates all shaping
  // to the pure functions above.
  // ---------------------------------------------------------------

  getFilters: function() {
    return {
      jobs: PayTrackerJobRegistryRepository.getAll(false).map(function(job) {
        return { jobId: job.jobId, jobName: job.jobName };
      })
    };
  },

  readPayWeeks: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet && spreadsheet.getSheetByName(PayTrackerWebPayWorkspaceService.getPaySheetName());
    if (!sheet) return [];
    return PayTrackerWebPayWorkspaceService.readPaySheet(sheet).weeks.filter(function(week) { return week.hasData; });
  },

  getWorkAndPaySummary: function(options) {
    const settings = options || {};
    const dateFrom = this.toDate(settings.dateFrom);
    const dateTo = this.toDate(settings.dateTo);
    const self = this;

    const jobs = PayTrackerJobRegistryRepository.getAll(false)
      .filter(function(job) { return !settings.jobId || job.jobId === settings.jobId; });

    const weeks = this.readPayWeeks();
    const byJob = jobs.map(function(job) { return self.buildWorkAndPayForJob(job, weeks, dateFrom, dateTo); });
    const adjustments = jobs.map(function(job) { return PayTrackerPayAdjustmentsSummaryService.getSummaryForJob(job.jobId); });
    const payslipTrend = this.buildPayslipTrend(PayTrackerPayslipRepository.getAll(), dateFrom, dateTo);

    return { byJob: byJob, adjustments: adjustments, payslipTrend: payslipTrend };
  },

  getAnnualLeaveSummary: function(options) {
    const settings = options || {};
    return {
      byJob: PayTrackerAnnualLeaveBalanceService.getAllBalances()
        .filter(function(balance) { return !settings.jobId || balance.jobId === settings.jobId; })
    };
  },

  getMoneySummary: function(options) {
    const settings = options || {};
    const dateFrom = this.toDate(settings.dateFrom);
    const dateTo = this.toDate(settings.dateTo);

    const cashFlowTrend = this.buildCashFlowTrend(
      PayTrackerMoneyMovementsRepository.getAll(),
      PayTrackerAnalyticsConfig.MONTHS_TO_INCLUDE,
      PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES,
      PayTrackerMoneyMovementsSummaryService.INCOME_TYPES,
      PayTrackerMoneyMovementsSummaryService.SPENDING_TYPES
    );

    const transactions = PayTrackerTransactionCategoryService.readTransactions();
    const spendingByCategory = this.buildSpendingByCategory(transactions, dateFrom, dateTo);
    const uncategorisedTransactionCount = transactions.filter(function(tx) { return !tx.payTrackerCategory; }).length;

    return {
      summary: PayTrackerMoneyMovementsSummaryService.getSummary(),
      cashFlowTrend: cashFlowTrend,
      spendingByCategory: spendingByCategory,
      uncategorisedTransactionCount: uncategorisedTransactionCount
    };
  },

  getReconciliationSummary: function() {
    const jobs = PayTrackerJobRegistryRepository.getAll(false);
    const adjustmentSummaries = jobs.map(function(job) { return PayTrackerPayAdjustmentsSummaryService.getSummaryForJob(job.jobId); });
    return this.buildReconciliationSummary(
      PayTrackerPayslipRepository.getAll(),
      adjustmentSummaries,
      PayTrackerTransactionCategoryService.getUncategorized().length
    );
  },

  getData: function(options) {
    return {
      generatedAt: new Date().toISOString(),
      filters: this.getFilters(),
      workAndPay: this.getWorkAndPaySummary(options),
      annualLeave: this.getAnnualLeaveSummary(options),
      money: this.getMoneySummary(options),
      reconciliation: this.getReconciliationSummary(),
      excludedMetrics: PayTrackerAnalyticsConfig.EXCLUDED_METRICS
    };
  }
});
