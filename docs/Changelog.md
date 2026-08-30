# Changelog

All notable changes to Pay Tracker are documented in this file.

The project follows Semantic Versioning where practical.

---

# v3.1.1 — Calendar jobId maintenance fix

Maintenance patch on top of v3.1.0. No new roadmap features.

- **Fixed**: `CalendarService.js`'s four ordinary-shift classifiers (Night Security, NHS, Relief Warden, Logging Cash) computed a `tableName` for PaySheet routing but never set a `jobId`, so every real, non-leave Calendar shift synced to Sheets got `jobId: ''`. This silently broke `StafflineReconciliationService`'s Calendar-side job matching, surfacing as false "Job Mismatch" results even for timesheets with real, correctly-logged Calendar shifts. Found during a v3.1.0 release closeout audit; confirmed live that 100% of shifts checked across the 5 known fixtures had a blank Job ID. Fixed in [PR #34](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/34) by adding the correct canonical Job ID to all 10 return branches, matching the precedent `classifyAnnualLeaveEvent` already set. Purely additive -- confirmed `jobId` never touches PaySheet table/row/hours/pay, only a tracking field and one Action Centre label.
- **Resynced real Calendar Sync Records** via the existing "Sync now" mechanism (confirmed idempotent before running it: rewrites PaySheet cells with identical values for already-matching shifts, always upserts `jobId` regardless). Live-verified before/after: `imported: 0, updated: 0, adopted: 0, removed: 0` -- a genuine no-op for PaySheet content; `jobId` now correctly populated on every real event checked.
- **Re-audited all 5 known Staffline fixtures** (621093, 621105, 621137, 624148, 624186) post-resync:

  | Timesheet | Job | Before | After | Cause |
  |---|---|---|---|---|
  | 621137 | NHS | Job Mismatch | Hours Differ | jobId fix resolved the mismatch; NHS calendar hours are deliberately never captured (separate, confirmed-intentional design), so hours genuinely differ. Payslip payment status: Match. |
  | 624186 | NHS | Job Mismatch | Hours Differ | Same as above. Payslip payment status: Match. |
  | 621093 | Relief Warden | Job Mismatch | Hours Differ | jobId fix resolved the mismatch; the matching Calendar event's computed duration (24h, a fixed day-rate classification) genuinely differs from Staffline's submitted 10h. Payslip payment status: Match. |
  | 621105 | Night Security | Job Mismatch | Job Mismatch (unchanged) | No Night-Security-titled Calendar event exists in this week at all -- a genuine data-entry gap, not a code issue. Payslip payment status: Match. |
  | 624148 | Night Security | Job Mismatch | Job Mismatch (unchanged) | Same as above. Payslip payment status: Match. |

  In all 5 cases the underlying Staffline-vs-payslip payment status was, and remains, a genuine `Match` -- this fix never touched, and never risked, actual payroll figures. The two still-unresolved fixtures reflect real missing Calendar entries and are correctly left as "Job Mismatch" rather than being papered over.
- **Verification**: independent second-pass review of the fix (mapping, additivity, test-dispatch path) before merge; static validation clean; `runAllPayTrackerTests()` 8/8 suites, 155/155 checks; isolated-deployment smoke test (Dashboard, Pay/Timesheets/Payslips/Annual Leave, Calendar, Action Centre, Finance); post-promotion smoke test against production itself.
- **Production promotion**: promoted to the existing production deployment (same deployment ID, URL unchanged) on 2026-08-30 from `main` commit `149c28563fdf26709cdaa512165d695f0a2cc191`. See `docs/VERSION.md` for the exact deployment ID, version and commit SHA.

# v3.1.0 — Staffline reconciliation (Phase 3)

Completes the v3 roadmap: Google Calendar shift → Staffline approved timesheet → payslip payment line, reconciled three ways, unblocked once real Staffline Gmail approval emails and real payslip PDFs became available.

- **New `Backend/Staffline/` module**: a read-only Gmail importer for Staffline's "Timesheet Approved" emails (filtered by real sender `ithelpdeskire@stafflinerecruit.com`, not just a subject guess), a `Staffline Timesheets` ledger (deduplicated and idempotently updated by Timesheet ID), a `Staffline Payment Lines` ledger, and the reconciliation logic itself, computed live from Calendar-owned shifts, the Staffline ledger and the Payslip Register -- nothing is stored or estimated, the same approach `AnalyticsService.js` already uses. Run `setupPayTrackerStaffline()` once after deployment; safe to run repeatedly.
- **Placement → Job classification**: each job's new `Staffline References` field (Jobs sheet, seeded for the 3 Staffline-relevant jobs -- NHS, Relief Warden, Night Security -- from real placement text) is matched against the email's Placement Description the same way `calendarMatchingRules` already works. An unmatched or ambiguous placement is never guessed -- it is saved as `Needs Review` and sent to the Action Centre with a suggested fix.
- **Found and fixed a real, pre-existing bug**: `Backend/Payroll/PayrollTimesheetParser.gs` (present since v2.8, but never actually wired into anything until this release) extracted zero line items from every real Staffline payslip. Its section-boundary regex required the literal text "Week Ending", but real payslips abbreviate to "Wk Ending"; separately, its row regex used a lookahead for "the next date or end of string" that could not survive either of two real formatting quirks -- one template interleaves deduction-column text onto the same line as a payment row (`...136.90 Tax 157.60...`), the other has descriptions that legitimately embed their own decimal number (`Enhanced 1.33` followed by the real `4.00 17.92 71.68` columns). Confirmed broken (0/5 and 4/5 rows, with a corrupted last row) against the real text of two real payslip PDFs before touching the fix; confirmed correct (5/5 both) after. The fix slices the text at each row's own date+reference start, then greedily matches "description + 3 trailing numbers" per slice with no end anchor -- greedy backtracking naturally prefers the rightmost valid 3-number window, which is always the true data columns.
- This parser is now wired into the existing `PayrollPayslipProcessingService.processPayslip()` pipeline (additively -- a Staffline-side failure is caught and reported, never allowed to fail the whole-payslip fields that already saved) to populate the new Staffline Payment Lines ledger with per-line Timesheet ID, description, units, rate, amount and each job it resolves to.
- **Found and fixed two more real bugs while proving the above against a live spreadsheet, not just Node**: (1) Sheets auto-converts a purely-numeric string cell (the bare-digit Timesheet ID, e.g. `"999999"`) to a number on write, silently turning every stored/returned Timesheet ID from a string into a number -- every other ID in this codebase avoids this with a non-numeric prefix (`ACTION-`, `ADJ-`, `PAYSLIP-`...); Timesheet IDs cannot, since they must match the bare digits Staffline and Gmail both use, so the affected columns are now forced to plain-text format during setup. (2) The shared `toKey()` header→camelCase helper (reused from `JobRegistryRepository`) was never designed for a header containing parentheses -- `"Timesheet ID (Normalized)"` converted to the literal, broken key `"timesheetId (normalized)"` instead of clean camelCase, silently breaking every read of that field while the underlying sheet data was completely correct. Renamed the header to `"Normalized Timesheet ID"` rather than patching the shared utility for one caller.
- **New "Timesheets" tab** on the Pay workspace: week, job, Timesheet ID, Staffline status, Calendar hours, Staffline hours (left blank rather than guessed -- see below), payslip-paid hours and amount, Calendar-match status, payment status, discrepancy type, and a plain-English suggested action.
- **Scope limit at initial merge, resolved before production promotion (see below)**: at the time this Phase 3 work first merged, the Staffline portal was not reachable (no authenticated browser session), so "Staffline submitted hours" was not a real figure anywhere in the release -- Calendar's expected hours were compared directly against the payslip's paid hours instead. This was closed before v3.1.0 reached production; see "Release-blocker fixes" below.
- **Validated against real data at every layer**: the 3 placement mappings and all 5 given example timesheets (621093, 621105, 621137, 624148, 624186) confirmed against the real Gmail account; the parser fix confirmed against the real text of both real payslip PDFs; 22 real checks (`runStafflineReconciliationTests()`, wired into `runAllPayTrackerTests()`) plus 16 more covering repository round-trips and reconciliation-status edge cases, run clean against the live test deployment. Live: a 60-day dry-run Gmail preview (22/22 real emails matched, 0 needing review) followed by a real 400-day historical backfill (80/80 real emails imported, 0 errors, 0 needing review).
- **Discovered at initial merge, resolved before production promotion (see below)**: real payslip processing (`processPayslip()`, the step that turns a stored PDF into structured actual-pay figures) failed for every real payslip with a missing Docs API OAuth scope (`https://www.googleapis.com/auth/documents`).
- Fixed a stale `AnalyticsConfig.js` comment that still said Phase 3 was blocked; rolling Staffline accuracy into an Analytics summary card remains a real, named follow-up.

## Release-blocker fixes, before production promotion (PRs [#30](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/30), [#31](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/31))

- **Real Staffline portal detail for the 5 known fixtures**: a read-only, human-driven browse of the real, already-authenticated portal (Apps Script has no way to sign in to Staffline itself, so this is a one-off manual process, not an automated recurring scan) imported real Total Hours/Days, rate categories and approval history into a new `StafflineTimesheetDetailRepository`. Per-day/per-line hours read as `0` in the live DOM shortly after page load even when the header total was already correct (an AJAX timing issue) -- deliberately not imported, to avoid fabricating precision that wasn't actually, reliably observed. `StafflineReconciliationService` was rewritten around this for genuine three-way reconciliation (Calendar vs Staffline-submitted vs Payslip-paid), distinguishing Timesheet Discrepancy from Payroll Underpayment from Delayed Payment.
- **Payslip OAuth scope**: confirmed live against a real payslip PDF that `DocumentApp.openById` is the only working way to read a Drive-converted payslip's text -- `getAs('text/markdown')`, `getAs('text/plain')`, and the Advanced Drive Service's `Files.export` all fail for real, distinct API-level reasons, not just missing scope. Added the minimal `https://www.googleapis.com/auth/documents` scope to `appsscript.json`; the user completed the resulting one-time re-authorization. The real `Staffline Payment Lines` ledger now holds genuine payment lines from a real payslip.
- **Two pre-existing test failures fixed**: Pay Adjustments and Money Movements tests were non-idempotent against the live, permanently-accumulating spreadsheet (a fixed job ID and absolute-total assertions across repeated same-session runs), not real application defects -- fixed with a per-run-unique job ID and before/after delta assertions respectively.
- **Category-matching bug found in the isolated smoke test**: `computePaymentStatus_` compared Staffline's rate-category text against the payslip parser's coarse `payCategory` bucket, which collapses every enhancement multiplier (e.g. "Enhanced 1.33", "Enhanced 1.50") down to one generic value -- every real multiplier-specific category read as Wrong Rate/Wrong Enhancement even when correctly paid, which would have produced false Payroll Underpayment alerts. Fixed to compare against the payslip line's own description, confirmed to match Staffline's category text verbatim across all real data currently in the sheet. A dry-run-first design on the new Action Centre sync (`syncPayTrackerStafflineDiscrepancies`) caught this before any pollution happened.
- **Action Centre sync safety**: a first live test of `syncPayTrackerStafflineDiscrepancies` (raises Action Centre items for confidently-classified discrepancies, reusing the existing ledger rather than a parallel one) created 80 items in one pass -- mostly a real signal (Calendar history predating Staffline tracking, and the then-empty Payment Lines ledger), but too many to surface without warning. Cleaned up completely and gated behind a dry-run preview plus explicit confirmation showing the count before committing.
- **Full test suite**: `runAllPayTrackerTests()` is genuinely 8/8 suites, 149/149 checks, zero failures, live-verified on the exact commit promoted to production.
- **Production promotion**: v3.1.0 promoted to the existing production deployment (same deployment ID, URL unchanged) on 2026-08-29, after an isolated-deployment smoke test and a post-promotion smoke test against production itself both passed. See `docs/VERSION.md` for the exact deployment ID, version and commit SHA.

# v3.0.9 — Maintenance release

Packages three fixes merged to `main` after v3.0.8 shipped and was promoted to production. No new roadmap features.

- **Version string correction**: v3.0.8's own version bump missed the code constants -- `Backend/Core/Config.js`, `Frontend/Web/WebApp.js`, and every per-domain `Config.js` were still reporting `3.0.7`, so the app's own sidebar badge (rendered from `PAY_TRACKER_WEB_CONFIG.VERSION`) understated its own version. All 8 constants now correctly read `3.0.9`.
- **Route-scoped initial workspace loading**: Finance, Savings, Calendar, Settings, Reports, Life Goals and Analytics each called their own data-load function unconditionally on every page visit, regardless of which page was actually being viewed -- confirmed in the Apps Script executions log, a single page load was firing 8-10 workspace RPCs simultaneously (Finance alone: 29-45s, every time). Fixed by checking `PayTrackerAppRoutes.resolveFromLocation()` (the same approach `PayWorkspaceService.html` already used) before the initial load, on top of the pre-existing, unchanged route-change listener that already handled in-app navigation correctly. Live-verified via before/after executions-log comparison for Finance, Savings, Calendar and Reports+Analytics. Dashboard was also attempted, live-tested as a first-load regression (its `initialize()` is structured differently -- its own self-deferred async function rather than a plain `init()` off `DOMContentLoaded`), and reverted rather than shipped unverified; Dashboard's own RPC is also the least wasteful of the group (5-18s).
- **Guarded Bank Transactions cleanup utility**: `cleanupPayTrackerStrayCategoryColumns()`, editor-run-only, removes the two empty header columns a since-fixed Phase 8 bug left in the wrong place on the real sheet -- only after confirming every data row is genuinely blank in both columns, and only if they're not already correctly placed. Verified against 5 scenarios (13 assertions) calling the real function directly. Not run automatically by anything; the cosmetic artifact itself is left untouched by this release.

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
