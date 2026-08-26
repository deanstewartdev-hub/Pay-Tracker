# Changelog

All notable changes to Pay Tracker are documented in this file.

The project follows Semantic Versioning where practical.

---

# v3.0.8 — Production hardening

- New `runAllPayTrackerTests()` consolidates every v3-era safe test suite (Reconciliation Foundation, Calendar Reconciliation, Annual Leave Engine, Pay Adjustments, Money Movements, Transaction Rules, Analytics -- 86 checks total) into one call, isolating a failing suite from the rest rather than letting one exception hide the other six results. Run live against the deployed test version: completed successfully. Deliberately does not include the older, pre-v3 `test<Domain>()` helpers scattered through the Payroll/Finance modules -- those are manual debug helpers that log output for a human to read, not assertions with a pass/fail signal, so bundling them into an automated suite would misrepresent what they actually check.
- Reviewed every `setupPayTracker*()` function (9 total, including the original core setup) against the roadmap's "no destructive migration possible": every one is additive-only -- creates a sheet if missing, backfills a blank header cell if the sheet already exists, and throws rather than overwrites on a genuine conflict. The oldest (`setupPayTracker()`, predating v3) additionally takes a safety backup before writing anything.
- Reviewed the `appsscript.json` OAuth scope list against actual usage: every scope traces to a real, still-used feature (Sheets, external requests for Monzo, the custom menu, triggers/authorization info, Drive for payslip storage, read-only Gmail import, read-only Calendar sync). No scope was removed -- Drive in particular is broader (`drive`, not `drive.file`) than ideal, but narrowing it without concrete evidence of exactly which Drive calls the Payroll Centre depends on risks breaking a proven, working feature for a cosmetic tightening, so it is documented here rather than changed blind.
- This version is tagged in git (`v3.0.8`) as the reviewed release point. Tagging is a git-only action -- it does not touch, redeploy, or repoint the live production Apps Script deployment. Promoting production to this code remains a deliberate, manual step.

# v3.0.7 — Ledger analytics

- New "Ledger analytics" section on the Reports page: every chart and stat is aggregated live from existing ledgers (Jobs, PaySheet, Annual Leave, Pay Adjustments, Money Movements, Bank Transactions, Payslips) -- nothing is estimated, and nothing is stored, so Analytics can never become a second source of truth.
- Filterable by job and by date range, per the roadmap's Phase 9 definition of done.
- Work and pay: hours and pay by job, broken down by shift type (basic/enhanced/overtime, reusing the exact classification the Pay workspace already computes); predicted-vs-actual gross pay trend from the Payroll Centre's stored comparisons; missing/recovered pay by job from the Pay Adjustments ledger.
- Annual Leave: accrued/available/value by job, reusing `AnnualLeaveBalanceService` directly rather than recomputing it.
- Money: cash flow by month (income vs spending, internal transfers excluded, same rule as the Money Movements ledger); spending by category, now possible because of Phase 8's Pay Tracker Category column; unclassified transaction count.
- Reconciliation: payslip match rate (excludes payslips that have not actually been compared yet, so an unprocessed payslip cannot silently drag the rate down), pay adjustments recovered vs outstanding, unclassified transaction count.
- An explicit "Not shown here" section names every roadmap analytic this phase cannot produce yet and why -- Staffline-based accuracy (Phase 3 is still blocked pending real export data), fuel-budget-vs-actual and Monzo pot-level inflow/outflow detail (both already-documented deferrals from Phases 7/8) -- so a gap reads as "not available", never as "covered".
- All aggregation math (date filtering, grouping, rate calculations, month-bucketing) is written as pure functions with no sheet access, and is unit tested directly (`runAnalyticsTests()`, 24 checks) rather than only proven via a mock, since none of it needs to touch a real sheet to be correct.

# v3.0.6 — Transaction Matching Rules

- New `Transaction Matching Rules` sheet: configurable, priority-ordered rules (merchant/description contains, Monzo category, amount range, direction) that suggest a Pay Tracker category for a transaction. Deliberately a separate concern from `TransactionMatchingService.js`'s existing bill/debt date-and-amount matching -- nothing here reads or modifies that matcher, its `Bank Transactions` column-index map, or its payment-confirmation write path.
- Two additive columns (`Pay Tracker Category`, `Category Source`) appended to the existing `Bank Transactions` sheet, found or created by name at the sheet's current end -- verified with a Node `vm` harness against a mock sheet shaped like the real 21-column one: original data is byte-for-byte unchanged both before and after applying a category, and the column-creation step is idempotent.
- Every suggestion requires an explicit user action to apply (individually or all at once). A rule's `Auto Confirm` field is stored but never acted on automatically in this phase -- matching the existing matcher's own "nothing auto-confirms" rule.
- Manually applying a category can optionally create a new rule from that transaction's merchant, opt-in per action -- the roadmap's "rules should learn from confirmed manual classifications".
- New "Rules" tab on the Finance workspace: uncategorised count, rule-matched suggestions with one-click apply, rule creation form, and rule list.
- Caught a wrong `FinanceIntegrationConfig.js` column-key reference (`DEBIT_OR_CREDIT` instead of the real `DIRECTION`) by checking the actual config before writing code against it, rather than after a test failure.
- Fixed a real bug found during live verification: `ensureCategoryColumns()` used `sheet.getMaxColumns()` to decide where to place the two new columns, but that's the sheet's raw grid width, not the last column with an actual header -- on the real `Bank Transactions` sheet (21 header columns inside a default 26-column grid), this placed `Pay Tracker Category`/`Category Source` at columns AA/AB instead of directly after column U, leaving columns V-Z blank in between. No data was ever at risk (nothing writes to those columns until a category is applied, and the fix was verified against a Node `vm` mock before shipping), but it's untidy. The fix finds the true last-content column from the header row's actual text instead. Because the live verification run already created the columns at AA/AB on the real sheet before the fix landed, they stay there -- the fix prevents this placement from happening again, it doesn't move what's already there. Cleanup (select columns AA:AB and delete) is optional and cosmetic only; see `docs/VERSION.md`.
- Deliberately deferred: fuel-budget-style category-vs-budget tracking (the roadmap's fuel example) and any automatic rule application -- both real follow-ups, not silently dropped.

# v3.0.5 — Money Movements ledger

- New `Money Movements` sheet: a single typed ledger (salary/other income, savings allocation, pot deposit/withdrawal, bill/debt payment, refund, transfer, interest, manual adjustment).
- Internal transfers (savings allocations, pot deposits/withdrawals, transfers) are auto-flagged and excluded from income/spending totals -- `netCashFlow` is income minus spending only, matching the roadmap's "internal transfers must not be counted as spending".
- New "Movements" tab on the Finance workspace: income/spending/internal-transfer/net-cash-flow summary cards plus manual entry.
- Deliberately manual entry for this phase. Two real follow-ups deferred rather than rushed: automatic movement creation from `TransactionMatchingService.js`'s `confirmMatch()` (which already processes real bill/debt payments -- extending it deserves the same care given to everything else in this session, not a rushed edit under time pressure), and Monzo account-balance import (`GET /balance`, no existing method to extend, safe to add later as its own small change).
- Caught and fixed a real HtmlService-corruption risk before it shipped: a bare `summary.netCashFlow >= 0 ? ... : ...` ternary in the new frontend file, the same bug class fixed twice earlier in this branch's history. Rewritten using `Math.sign(...) === -1`, matching the pattern already established in `FinanceWorkspaceService.html`'s `renderAlerts()`.

# v3.0.4 — Pay Adjustments ledger

- New `Pay Adjustments` sheet tracking a specific missing/incorrect amount from a specific payslip through to recovery: Identified → Reported → Expected Next Payslip → Partially Recovered → Recovered (or Rejected / Written Off).
- `carryForward()` accumulates recovered hours/amount onto the same row and only advances status when the full missing amount is matched -- the original `Missing Hours`/`Missing Amount` are never rewritten, so the complete history stays on one auditable record rather than being deleted and recreated.
- Deliberately manual-entry: the existing Payroll Comparison engine (`PayrollComparisonEngine.gs`) compares a whole payslip's predicted-vs-actual gross/net with no per-job or per-category breakdown, so there's nothing reliable to auto-detect a specific missing amount from yet -- this ledger doesn't guess one.
- New "Adjustments" tab on the Pay workspace: per-job outstanding/recovered summary cards, and manual entry for new adjustments and recoveries.

# v3.0.3 — Annual Leave engine and Gmail import

Covers both Phase 4 and Phase 5 of the v3 roadmap. Phase 4 (Annual Leave engine) merged without its own version bump -- the version constant stayed at 3.0.2 through that change, so this entry documents both phases together rather than backdating a changelog entry that was never actually tagged.

**Annual Leave engine (Phase 4):**
- Per-job leave ledger: two new sheets (`Annual Leave Earnings`, `Annual Leave Usage`) plus five new settings columns on the existing `Jobs` sheet, instead of a separate settings sheet that would duplicate job identity.
- Balance computation: accrued = opening balance + earned hours − taken; available to book = accrued − approved future leave; outstanding holiday pay = taken − paid.
- New "Annual Leave" tab on the Pay workspace with per-job balance cards and manual entry for usage, earnings, and accrual settings.
- Fixed a real bug in the shared `ensureSheet()` migration helper: it previously only handled "sheet fully blank" or "headers already match exactly", so extending an existing sheet's headers would have thrown a false "header mismatch" the next time setup ran. Rewritten to fill blank header cells while still throwing on a genuine conflict with existing data.

**Gmail Annual Leave import (Phase 5):**
- Configurable `Annual Leave Email Rules` (sender/subject/body conditions, one rule = one Job ID) and `Annual Leave Email Scan History`, mirroring the existing Payslip Gmail import's proven shape.
- Read-only Gmail search restricted to leave-related subject terms; emails are never modified, moved, labelled or deleted.
- Only High-confidence matches (known job, an extracted date, and unambiguous approval/rejection/cancellation wording) auto-import into the Annual Leave Usage ledger; everything else is sent to the Action Centre for manual review rather than guessed.
- Duplicate-safe by Gmail message ID; a later cancellation email in the same thread updates the existing record instead of creating a second one.
- New "Scan Gmail for Annual Leave emails" control on the Annual Leave tab.

# v3.0.2 — Navigation redesign

- Regrouped the sidebar into Overview, Work and Pay, Money, and Planning and Analysis, matching the work-to-money flow in `docs/v3-Roadmap-Detail.md` §3.
- Every existing route (`?page=...`) and workspace stays reachable — this phase is a pure information-architecture change, not a new-page build. The finer-grained Work and Pay items (Shifts, Timesheets, Payroll, Adjustments, Annual Leave) described in the target navigation arrive as their own pages in Phases 3–6, once the underlying features exist.
- Fixed three bugs found while validating the v3.0.1 reconciliation merge against production: an Action Centre HtmlService template-corruption bug (`<=` silently escaped to `&lt;=`, killing the whole script block), a Finance Transactions table calling an undefined `setHtml`, and six workspaces listening for the wrong route-change event name.

# v3.0.1 — Calendar and Annual Leave reconciliation

- Highlights Annual Leave dates and their basic-pay shift cards in red on the weekly Pay calendar, labelled `A/L - [base shift name]`.
- Connects the Pay page's Sync calendar button to live reconciliation and refreshes the selected week when it finishes.
- Recognises the live Calendar abbreviations `A/L` and bare `NIGHT 8pm-12pm` events used for Night Security leave inference.
- Recognises `AL` and `Annual Leave` events and assigns basic pay to NHS, Relief Warden, or Night Security using role evidence from event details or a same-day shift.
- Sends ambiguous Annual Leave roles to the Action Centre instead of guessing.
- Adds a Calendar ownership ledger so moved, edited, and deleted events update the PaySheet safely.
- Preserves manually changed PaySheet rows and creates a review item when a deleted event conflicts with a manual edit.
- Skips all removal reconciliation when any configured Calendar cannot be read.
- Adds optional six-hour automatic Calendar reconciliation.

# v3.0.0 — Reconciliation foundation

- Added a canonical Jobs registry seeded from the existing employer and pay-rule definitions.
- Added a source-linked Action Centre with priority/status filters and manual resolution controls.
- Added append-only Action Centre decision history.
- Added an idempotent, non-destructive reconciliation setup function.
- Added safe reconciliation configuration tests and updated the web app route/version metadata.

# [Unreleased / v2.8] - Payroll Centre, Monzo integration and reconciliation (undocumented until this audit)

The following shipped across many PRs after the v2.6.0 release below, but was never recorded in this changelog. Recorded now as part of the v3 Phase 0 audit (`docs/v3-phase0-audit.md`).

### Standalone web application

- Full Apps Script web app (`Frontend/`) serving Dashboard, Pay, Finance, Savings, Goals, Reports, Calendar and Settings as one single-page app — the "standalone web application" milestone from the old roadmap's Phase 3, delivered inside Apps Script rather than as a separate REST API.
- Deployment-level authorization handling (`ScriptApp.getAuthorizationInfo`) so the app self-serves a "review permissions" page instead of failing silently.

### Payroll Centre

- Gmail and manual-PDF payslip import, PDF text extraction, structured field parsing.
- Predicted-vs-actual payslip comparison engine with configurable discrepancy thresholds and statuses (Matched / Minor Variance / Review / Major Discrepancy).
- Payroll Groups / Payroll Group Employers model for combined payslips spanning multiple employers.
- Staffline timesheet-reference-to-employer mapping.

### Finance integration / Monzo

- Monzo OAuth2 connection, transaction import, and (this session) automatic access-token refresh on expiry.
- Subscription detection from recurring transactions.
- Savings Pot ↔ Monzo Pot linkage with automatic balance sync.
- Bank transaction → Bills/Debts payment matching with confidence scoring; user confirms/rejects, nothing auto-confirms.

### Fixes

- Reports tab HtmlService templating bug (`>=` silently corrupted to `&gt;=` by the template evaluator).
- Monzo Strong Customer Authentication failures caused by a 90-day sync window (reduced to 30 days).

---

# [v2.6.0] - Initial GitHub Release

## Added

### Pay Module

- NHS pay tracking
- Relief Warden pay tracking
- Night Security pay tracking
- Logging income
- Automatic week generation
- Weekly summaries
- Running totals
- Estimated deductions
- Google Calendar integration
- Automatic backups

### Finance Module

- Bills
- Debts
- Finance payments
- Payment history
- Finance dashboard
- Undo payments

### Savings Module

- Savings pots
- Allocation percentages
- Interest calculations
- Contribution queue
- Savings dashboard
- Savings history
- Life goals
- Goal forecasting

### Development

- GitHub repository
- VS Code development environment
- clasp integration
- Modular project structure
- Project documentation

---

# Upcoming (v2.7)

## Savings Engine

- Weekly disposable income calculations
- PaySheet-driven savings
- Weekly cash-flow calculations
- Weekly reserve bill handling
- Disposable income forecasting
- Emergency buffer support
- Weekly contribution generation

---

## Planned (v2.8)

- Mortgage planner
- Vehicle finance planner
- Budget forecasting
- Net worth dashboard
- Investment tracking

---

## Future (v3)

- Standalone web application
- Responsive UI
- Mobile support
- Authentication
- API layer
