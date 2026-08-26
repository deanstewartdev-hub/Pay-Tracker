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
  VERSION: '3.0.9',

  MONTHS_TO_INCLUDE: 12,

  EXCLUDED_METRICS: Object.freeze([
    Object.freeze({
      key: 'staffline-accuracy',
      label: 'Staffline-vs-Calendar and Staffline-vs-payslip accuracy',
      reason: 'Phase 3 (Staffline schedule import) is blocked pending real Staffline export data -- there is no Staffline record to compare against yet.'
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
