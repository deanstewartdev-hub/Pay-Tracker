# Pay Tracker

## Overview

Pay Tracker is a production-quality Google Apps Script application designed to automate personal financial management.

The project has evolved beyond a simple paysheet into a full personal employment, payroll and financial reconciliation platform, connecting Calendar shifts, Staffline payslips, Monzo banking and financial planning in one Apps Script web app:

- NHS, Relief Warden, Night Security and Logging Cash earnings
- Google Calendar integration
- Payroll Centre — Gmail/manual payslip import, PDF parsing, predicted-vs-actual comparison
- Monzo bank connection — transactions, subscriptions, savings-pot balance sync, bill/debt matching
- Finance (bills, debts, payments)
- Savings and Life Goals
- Reports

The Google Sheet acts as the database, Google Apps Script provides the backend business logic, and a standalone Apps Script web app (`Frontend/`) is the primary interface — see `docs/Architecture.md`.

The v3 roadmap (`docs/Roadmap.md`, detail in `docs/v3-Roadmap-Detail.md`) is now complete: a unified Job Registry and Action Centre, Staffline schedule reconciliation, a per-job Annual Leave engine, and a pay-adjustment recovery ledger.

---

## Current Version

Pay Tracker v3.2.0 — a Unified Sync Engine that replaces manual, per-page "sync now" clicking with one orchestrator: real per-task freshness gating, automatic background scheduling, and a startup screen that shows real sync progress instead of a bare spinner. Builds on v3.1.1 (Calendar jobId maintenance fix) and the completed v3.1.0 roadmap (Staffline reconciliation, Annual Leave engine, Pay Adjustments/Money Movements ledgers, Transaction Matching Rules, Ledger Analytics, production hardening).

---

## Current Features

### Unified Sync Engine

- A central orchestrator (`Backend/Sync/`) wrapping every existing external-source sync (Calendar, Staffline Gmail, Payslip Gmail + processing, Annual Leave Gmail, Monzo transactions, Monzo pots) and one derived recompute (Staffline Reconciliation) behind one task registry, dependency ordering and per-task freshness TTL -- it never rewrites the underlying import logic, only decides when to call it.
- The startup screen (`#app-loading`) shows real per-task progress -- Waiting/Checking/Updated/Already current/Needs attention/Failed/Manual, with real counts and messages, never a fabricated percentage -- reading a fast freshness check first, then the real sync result once it lands.
- A stale sync is never allowed to block the app for more than a few seconds: past a short timeout (or on genuine failure), a "Continue to Pay Tracker" option appears and the sync keeps running in the background, surfacing its real result as a toast once it lands.
- The existing header refresh button now runs a full, forced re-check through the same engine and progress UI ("Refresh Everything"); every existing page-specific "Sync now"/"Refresh" button is unchanged and still calls its own source directly.
- Background schedule: three time-driven triggers (06:00 full, 12:00 lightweight -- Calendar/Monzo/Reconciliation only, 18:00 full), `Europe/London`, idempotent to install/remove, concurrency-safe (a second request while a sync is already running joins it rather than starting a duplicate).
- The Staffline portal has no API and no authenticated headless path -- it stays human/assistant-driven and is always shown as a distinct "Manual" source, never as a failed automatic sync.
- Sync health (last attempt/success, status, message, error) persists to a new "Sync Status" sheet, one row per task, upserted in place -- a failed attempt never erases the last known-good timestamp.

Run `setupPayTrackerSync()` once after deployment; it is safe to run repeatedly. Safe checks are available through `runUnifiedSyncTests()`.

### Navigation

- Sidebar grouped into Overview, Work and Pay, Money, and Planning and Analysis, following the work-to-money flow described in `docs/v3-Roadmap-Detail.md` §3
- Every existing workspace route unchanged and reachable; desktop collapse and mobile menu toggles unaffected

### Annual Leave

- Per-job leave ledger (Earnings, Usage) plus accrual settings on the Jobs sheet -- NHS, Relief Warden and Night Security balances never merge, even when one payslip shows a combined holiday-pay total
- Accrued / available-to-book / outstanding-holiday-pay balances, computed live, shown on a new "Annual Leave" tab on the Pay page
- Manual entry for leave taken and hours earned, plus per-job accrual settings
- Gmail import: searches for leave-related emails, matches them against configurable Annual Leave Email Rules (one rule = one Job ID), auto-imports only when the job, dates and approval wording are all unambiguous, and sends anything less certain to the Action Centre instead of guessing. A later cancellation email updates the existing record rather than creating a duplicate. Read-only -- emails are never modified, moved, labelled or deleted.

Run `setupPayTrackerAnnualLeave()` once after deployment; it is safe to run repeatedly. Configure at least one `Annual Leave Email Rules` row before scanning Gmail. Safe checks are available through `runAnnualLeaveEngineTests()`.

### Pay Adjustments

- A specific missing/incorrect amount from a specific payslip, followed through Identified → Reported → Expected Next Payslip → Partially Recovered → Recovered (or Rejected / Written Off). The original record is never changed or deleted, only its status and recovered amount -- the full history stays on one auditable row.
- Deliberately manual entry: the existing Payroll Comparison engine only compares a whole payslip's predicted-vs-actual gross/net, with no per-job or per-category breakdown to auto-detect a specific missing amount from, so this ledger doesn't guess one.
- New "Adjustments" tab on the Pay workspace with per-job outstanding/recovered totals and manual entry for new adjustments and recoveries.

Run `setupPayTrackerPayAdjustments()` once after deployment; it is safe to run repeatedly. Safe checks are available through `runPayAdjustmentsTests()`.

### Money Movements

- A single, typed ledger (salary/other income, savings allocation, pot deposit/withdrawal, bill/debt payment, refund, transfer, interest, manual adjustment) separating genuine income and spending from money simply moving between the user's own accounts and pots.
- Internal transfers (savings allocations, pot deposits/withdrawals, transfers) are tracked but never counted in the income or spending totals -- net cash flow is income minus spending only.
- New "Movements" tab on the Finance workspace with income/spending/transfer/net-cash-flow summary cards and manual entry.
- Deliberately manual entry for this phase: automatic creation from confirmed bank-transaction matches, and Monzo account-balance import, are real, valuable follow-ups deferred rather than rushed into `TransactionMatchingService.js`'s existing bill/debt payment write path without the same care given to everything else in this ledger.

Run `setupPayTrackerMoneyMovements()` once after deployment; it is safe to run repeatedly. Safe checks are available through `runMoneyMovementsTests()`.

### Transaction Matching Rules

- Configurable rules (merchant/description/Monzo-category/amount-range/direction conditions, priority-ordered) that suggest a Pay Tracker category for a Monzo transaction -- a separate concern from the existing bill/debt date-and-amount matching above, so it never touches that matching or payment-confirmation logic.
- Adds two additive columns to the existing Bank Transactions sheet (`Pay Tracker Category`, `Category Source`), found or created by name at the sheet's current end every time -- the existing column-index map that bill/debt matching depends on is never read or modified.
- Every suggested category requires an explicit user action to apply, individually or all at once -- nothing is ever categorised automatically, even for a rule with Auto Confirm set, matching the existing matcher's own "nothing auto-confirms" rule.
- Manually categorising a transaction can optionally create a new rule from that merchant ("rules learn from confirmed manual classifications"), opt-in per action.
- New "Rules" tab on the Finance workspace.

Run `setupPayTrackerTransactionRules()` once after deployment; it is safe to run repeatedly. Safe checks are available through `runTransactionRulesTests()`.

### Ledger Analytics

- A "Ledger analytics" section on the Reports page aggregating Work and Pay (hours/pay by job and shift type, predicted-vs-actual gross pay, missing/recovered pay), Annual Leave (accrued/available/value by job), Money (cash flow by month, spending by category, unclassified transactions) and Reconciliation (payslip match rate, adjustments recovered vs outstanding) -- all read live from existing ledgers, nothing stored, nothing estimated.
- Filterable by job and date range.
- Names what it cannot show yet and why (Staffline-based accuracy, fuel-budget-vs-actual, Monzo pot-level flow detail) instead of silently omitting them.

Safe checks for the aggregation math are available through `runAnalyticsTests()`.

### Production Hardening

- `runAllPayTrackerTests()` runs every v3-era safe test suite in one call (86 checks across Reconciliation Foundation, Calendar Reconciliation, Annual Leave, Pay Adjustments, Money Movements, Transaction Rules and Analytics) and reports which suite, if any, failed, instead of one suite's exception hiding the rest.
- Every `setupPayTracker*()` function was reviewed against "no destructive migration possible": all are additive-only, and the original core setup takes a safety backup before writing anything.
- `appsscript.json`'s OAuth scopes were reviewed against actual usage; every scope traces to a real feature. See `docs/Changelog.md` for the full review.

### v3.0.9 Maintenance Release

- Route-scoped initial workspace loading: Finance, Savings, Calendar, Settings, Reports, Life Goals and Analytics now only fetch their own data when they're the page actually being viewed, instead of every workspace fetching on every page visit. Dashboard keeps its original (always-loads) behaviour -- the same fix regressed its first load and was reverted rather than shipped unverified; a correct fix for Dashboard specifically remains a deferred follow-up.
- A guarded `cleanupPayTrackerStrayCategoryColumns()` utility (editor-run-only, not wired to any UI) is available to tidy up the two misplaced, empty header columns the Phase 8 column-placement bug left on the real `Bank Transactions` sheet. It refuses to run if it finds any data in either column. Not run automatically by anything -- see `docs/VERSION.md`.

### Staffline Reconciliation

- Three-way reconciliation for Staffline placements: Google Calendar shift → Staffline approved timesheet → payslip payment line, so it is obvious where in the chain a mismatch happened (a shift never submitted to Staffline, a timesheet approved under the wrong job, or a payslip that paid the wrong hours).
- Read-only Gmail import of Staffline "Timesheet Approved" emails (metadata only -- Timesheet ID, placement, client, approval date range, portal link) into a new Staffline Timesheets ledger. Deduplicated by Timesheet ID; rescans update the same row rather than creating a duplicate. The Staffline portal itself is never scraped, so a timesheet's actually-submitted hours are not always known -- reconciliation compares Calendar's expected hours directly against the payslip's paid hours instead of inventing a submitted-hours figure.
- Placement wording (e.g. "Night Security C/Dun & C/Dall") maps to a Job automatically via each job's new Staffline References field (Jobs sheet) -- an unrecognised placement is never guessed, it goes to the Action Centre instead.
- The existing Payroll Centre payslip parser is extended (not replaced) to also extract per-line Timesheet ID, description, units, rate and amount, since one combined Staffline payslip can cover several Timesheet IDs across different jobs. Stored in a new Staffline Payment Lines ledger, linked back to the Payslip Register by Payslip ID.
- New "Timesheets" tab on the Pay workspace showing week, job, Timesheet ID, Staffline status, Calendar hours, payslip-paid hours and amount, and a plain-English reconciliation status and suggested action for every row that needs one.
- Unresolved discrepancies go to the Action Centre; a genuine missing or incorrect amount can be tracked to recovery through the existing Pay Adjustments ledger -- neither is duplicated here.

Run `setupPayTrackerStaffline()` once after deployment; it is safe to run repeatedly. Safe checks (including the 5 real fixture timesheets used during development) are available through `runStafflineReconciliationTests()`.

### Reconciliation Foundation

- Unified Jobs registry seeded from the four existing employer/pay definitions
- Action Centre for source-linked manual review items
- Append-only decision history so manual corrections remain auditable
- Annual Leave/AL Calendar events recorded at the matched role's basic pay
- Calendar-owned shifts updated or removed when Calendar changes, while manual edits are preserved
- Optional six-hour automatic Calendar reconciliation

Run `setupPayTrackerReconciliationFoundation()` once after deployment; it is safe to run repeatedly. Safe schema/config checks are available through `runReconciliationFoundationTests()` and `runCalendarReconciliationTests()`.

### Pay Tracking

- NHS, Relief Warden, Night Security, Logging Cash shifts
- Weekly calculations, estimated deductions, running totals
- Calendar import, automatic week creation

### Payroll Centre

- Gmail and manual-PDF payslip import
- PDF parsing into structured pay fields
- Predicted-vs-actual comparison with configurable discrepancy thresholds
- Multi-employer combined-payslip grouping

### Finance Module

- Bills, debts, payment tracking, payment history, undo payments

### Finance Integration (Monzo)

- Bank connection with automatic token refresh
- Transaction import and subscription detection
- Bank transaction → Bills/Debts payment matching (confidence-scored, manual confirm/reject)

### Savings Module

- Savings pots (with optional Monzo Pot balance linkage), goal tracking, interest forecasting, contribution queue, savings history, life goals

### Reports, Calendar, Settings

- Reporting workspace, calendar workspace, app settings

See `docs/Database.md` for the full sheet inventory and `docs/v3-phase0-audit.md` for a detailed audit of what exists today.

---

## v3 Roadmap Status

All ten phases of the v3 roadmap are complete as of v3.1.0 -- see `docs/Roadmap.md` and `docs/v3-Roadmap-Detail.md` for the full plan. Real, valuable follow-ups that were deliberately deferred rather than rushed are named in their owning feature's section above (or in `docs/VERSION.md`) rather than silently dropped. v3.2.0's Unified Sync Engine is a post-roadmap initiative -- it changes how the existing v3 features stay fresh, not what they do.

---

## Technology

- Google Apps Script
- Google Sheets
- JavaScript
- Git
- GitHub
- VS Code
- clasp

---

## Development Workflow

Apps Script

↓

VS Code

↓

Git Commit

↓

GitHub

↓

clasp push

↓

Google Apps Script

---

## Repository Structure

Core

Pay

Finance

Savings

Calendar

Sync

Backup

Setup

Documentation

---

## Author

Dean Stewart
