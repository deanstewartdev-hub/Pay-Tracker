/*******************************************************
 * PAY TRACKER V3.0
 * Analytics/reporting definitions.
 *
 * Analytics owns no sheet and stores nothing -- it only reads and
 * aggregates records that already exist across the Jobs registry,
 * PaySheet, Annual Leave, Pay Adjustments, Money Movements, Bank
 * Transactions and Payslip ledgers, so it can never become a second
 * source of truth (the same rule ReportsWorkspaceService.js already
 * follows for the pre-v3 charts it keeps computing).
 *
 * Some roadmap analytics (Section 11) depend on data this codebase
 * cannot produce yet. Rather than silently omitting them, they are
 * named here so the UI can visibly label what is excluded and why --
 * the Phase 9 definition of done requires unclear data to be labelled,
 * not just left out.
 *******************************************************/

const PayTrackerAnalyticsConfig = Object.freeze({
  VERSION: '3.1.1',

  MONTHS_TO_INCLUDE: 12,

  EXCLUDED_METRICS: Object.freeze([
    Object.freeze({
      key: 'staffline-accuracy',
      label: 'Staffline-vs-Calendar and Staffline-vs-payslip accuracy',
      reason: 'Phase 3 built the Staffline Timesheets/Payment Lines ledgers and the Calendar/Staffline/Payslip reconciliation itself (see the Pay workspace Timesheets tab) -- rolling that up into an Analytics summary card is real follow-up work, not done as part of this metric list yet.'
    }),
    Object.freeze({
      key: 'fuel-budget',
      label: 'Fuel budget vs actual',
      reason: 'Deliberately deferred in Phase 8 -- category-vs-budget tracking needs a budget ledger that does not exist yet, so spending-by-category is shown without a budget comparison.'
    }),
    Object.freeze({
      key: 'monzo-pot-flow',
      label: 'Monzo pot inflows/outflows detail',
      reason: 'Money Movements records pot deposits/withdrawals as single entries, not the underlying pot-level running balance -- per-pot flow history is a real follow-up, not tracked at that granularity yet.'
    })
  ])
});
