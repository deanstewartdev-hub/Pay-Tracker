# Pay Tracker

**Current Version:** 3.1.0

## Status

✅ Stable — live deployed web app, actively used

## Development Stage

v3 roadmap complete — all ten phases implemented (reconciliation foundation, navigation redesign, Annual Leave engine, Gmail Annual Leave import, Staffline reconciliation, Pay Adjustments ledger, Money Movements ledger, Transaction Matching Rules, Ledger Analytics, production hardening).

## Version note

As of the Phase 0 audit (`v3-phase0-audit.md`, §11), internal module version constants had drifted independently across the codebase (`2.1.0` to `2.8.0` depending on file), while the web app's displayed version (`Frontend/Web/WebApp.js`) was stuck at `2.6.0`. This file now states `2.8.0` — the highest version already in use internally (Payroll Centre, Finance integration/Monzo modules) — as the actual current state. Unifying every module onto one shared version constant is tracked as v3 production-hardening work (Phase 10), not done as part of this audit, since it touches every module file.

## Backend

Google Apps Script

## Database

Google Sheets

## IDE

VS Code

## Source Control

Git + GitHub

## Current major modules

Pay/Calendar, Finance (bills/debts), Finance Integration (Monzo bank connection, transactions, subscriptions, bill matching), Savings (incl. Monzo Pot linkage), Life Goals, Payroll Centre (Gmail/manual payslip import, parsing, predicted-vs-actual comparison), Reports, Settings — see `Architecture.md` and `Database.md` for the full breakdown.

## Next milestone

All ten phases of the v3 roadmap are complete as of v3.1.0. There is no next roadmap milestone; further work is either a deferred follow-up (below) or a new initiative.

v3.1.0 builds Phase 3: Google Calendar → Staffline approved timesheet → payslip payment line reconciliation, unblocked once real Staffline Gmail approval emails and real payslip PDFs became available. New: a read-only Gmail importer for "Timesheet Approved" emails (Staffline Timesheets ledger, deduplicated by Timesheet ID); a fix to the existing (previously unused, and broken against real Staffline text) per-line payslip parser, now wired into the Payroll Centre's processing pipeline to populate a new Staffline Payment Lines ledger; Calendar↔Staffline↔Payslip three-way reconciliation, computed live (nothing stored, nothing estimated -- same approach as Ledger Analytics); a new "Timesheets" tab on the Pay workspace; and Action Centre/Pay Adjustments integration for anything unresolved. Validated against 5 real timesheets (Timesheet IDs 621093, 621105, 621137, 624148, 624186) and, live, an 80-email real Gmail backfill (0 errors, 0 needing review) -- see `docs/Changelog.md` for the full account, including two real, pre-existing issues found and fixed along the way (a Sheets numeric-string auto-conversion gotcha, and a `toKey()` header-parsing edge case with parentheses) and one found but deliberately left alone (see "Known blocker" below).

Production promotion is a deliberate step, gated on the checks documented in the release's PRs. v3.1.0 was promoted to the existing production deployment (`AKfycbz6IKFfwyucB2dPWzzFU9WcyJjJxeTTopK4mGfYBGCdoBkksTkqdID2QiKWYHSU6Jjg5g`, version @134) on 2026-08-29 from `main` commit `71e3d10ccc83bff0e6a4ce606e2d5ba3b0f3b50d`, after every gate below passed: static validation clean, `runAllPayTrackerTests()` 8/8 suites and 149/149 checks, a full isolated-deployment smoke test, and a post-promotion smoke test against production itself -- all documented in PRs [#30](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/30) and [#31](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/31).

Deferred follow-ups, all named in their owning phase's UI or docs rather than silently dropped: Phase 3's Staffline portal detail-level scraping (no authenticated session was available this round -- see `docs/Changelog.md`), and rolling Staffline accuracy into a Ledger Analytics card; Phase 7's account-balance import and automatic Money Movement creation from confirmed bank matches; Phase 8's fuel-budget-style category-vs-budget tracking and any automatic (Auto Confirm) rule application; Phase 9's fuel-budget-vs-actual and Monzo pot-level flow detail.

## Resolved since initial v3.1.0 merge

Three release blockers were closed before v3.1.0 was promoted to production (full detail in PRs [#30](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/30) and [#31](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/31)):

- **Payslip processing OAuth scope**: `processPayslip()` previously failed for every real payslip with a missing Docs API scope (`DocumentApp.openById` requires `https://www.googleapis.com/auth/documents`). Confirmed live against a real payslip PDF that this is the only working way to read a Drive-converted payslip's text -- `getAs('text/markdown')`, `getAs('text/plain')`, and the Advanced Drive Service's `Files.export` all fail for real, distinct reasons, not just missing scope. Added the minimal scope to `appsscript.json`; the user completed the resulting one-time re-authorization. The real `Staffline Payment Lines` ledger now holds genuine payment lines from a real payslip, no longer a placeholder.
- **Staffline portal detail**: a read-only, human-driven browse of the real, already-authenticated portal (Apps Script cannot sign in to Staffline itself) imported real Total Hours/Days, rate categories and approval history for the 5 known fixtures into a new `StafflineTimesheetDetailRepository` -- the "Known, deliberate scope limit" noted in the original v3.1.0 changelog entry no longer applies for these 5. Per-day/per-line hours were proven unreliable to scrape live (an AJAX timing issue) and are deliberately not imported.
- **Category-matching bug found in the v3.1.0 isolated smoke test**: `computePaymentStatus_` compared Staffline's rate-category text against the payslip parser's coarse `payCategory` bucket, which collapses every enhancement multiplier (e.g. "Enhanced 1.33", "Enhanced 1.50") down to one generic value -- this made every real multiplier-specific category read as Wrong Rate/Wrong Enhancement even when correctly paid, which would have produced false Payroll Underpayment alerts. Fixed to compare against the payslip line's own description, confirmed to match Staffline's category text verbatim across all real data. Caught before any Action Centre pollution happened, by the dry-run-first design added for exactly this kind of check.

All three of the 5 real Staffline fixtures with real payslip lines (621093, 621105, 621137) now reconcile as a genuine `Match`, live-verified via `runAllPayTrackerTests()` (149/149 checks) and directly against the live sheet.

## Known cosmetic cleanup (optional)

Phase 8's live verification against the real `Bank Transactions` sheet ran before a column-placement bug (`ensureCategoryColumns()` using the sheet's raw grid width instead of its last real header column) was found and fixed. As a result, the sheet currently has two empty header cells at columns AA (`Pay Tracker Category`) and AB (`Category Source`) with a blank gap at columns V-Z in between, instead of the intended immediately-after-U placement. Zero data rows reference either column -- this is purely cosmetic. Not required for anything to keep working.

Two ways to tidy it up, either is fine:
- **Manual**: select columns AA:AB on the `Bank Transactions` sheet and delete them, then reload the Finance > Rules tab once -- it will recreate the same two columns correctly at V/W.
- **Guarded function**: run `cleanupPayTrackerStrayCategoryColumns()` from the Apps Script editor. It only deletes the two columns after confirming every data row is genuinely blank in both of them and that they're not already in the right place -- it throws instead of deleting if either check fails. Verified against 5 scenarios (the real misplaced-columns shape, data present, already-correct, not-yet-created, data in a row other than the first) via a Node `vm` harness calling the real function directly. Not run automatically by anything.
