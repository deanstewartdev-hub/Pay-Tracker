# Pay Tracker

**Current Version:** 3.0.9

## Status

✅ Stable — live deployed web app, actively used

## Development Stage

Active Development — v3 roadmap Phases 1, 2, 4, 5, 6, 7, 8, 9 and 10 implemented (reconciliation foundation, navigation redesign, Annual Leave engine, Gmail Annual Leave import, Pay Adjustments ledger, Money Movements ledger, Transaction Matching Rules, Ledger Analytics, production hardening). Phase 3 (Staffline) is blocked pending real Staffline export data -- the only roadmap phase not yet implemented.

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

The v3 roadmap's Phases 1–2 and 4–10 are complete. The only remaining phase is Phase 3 (Staffline schedule/timesheet import and three-way reconciliation), blocked pending real Staffline export data -- there is nothing further to build until that data is available.

v3.0.9 is a maintenance release only -- no new roadmap work. It packages three things merged to `main` after the v3.0.8 release/promotion: a version-string correction (the code constants were still reporting 3.0.8's predecessor after that release shipped), route-scoped initial workspace loading for Finance/Savings/Calendar/Settings/Reports/Life Goals/Analytics (each now only loads its own data when it's actually the visible page, instead of every workspace loading on every page view), and a guarded, tested cleanup utility for the Bank Transactions cosmetic artifact below. Dashboard intentionally keeps its original loading behaviour -- the same route-scoping fix regressed its first load and was reverted rather than shipped unverified.

Production promotion is a deliberate step, gated on the checks documented in this release's PR -- it is not something any automated session does without those checks passing first.

Deferred follow-ups, all named in their owning phase's UI or docs rather than silently dropped: Phase 7's account-balance import and automatic Money Movement creation from confirmed bank matches; Phase 8's fuel-budget-style category-vs-budget tracking and any automatic (Auto Confirm) rule application; Phase 9's Staffline-based accuracy metrics (blocked with Phase 3), fuel-budget-vs-actual and Monzo pot-level flow detail.

## Known cosmetic cleanup (optional)

Phase 8's live verification against the real `Bank Transactions` sheet ran before a column-placement bug (`ensureCategoryColumns()` using the sheet's raw grid width instead of its last real header column) was found and fixed. As a result, the sheet currently has two empty header cells at columns AA (`Pay Tracker Category`) and AB (`Category Source`) with a blank gap at columns V-Z in between, instead of the intended immediately-after-U placement. Zero data rows reference either column -- this is purely cosmetic. Not required for anything to keep working.

Two ways to tidy it up, either is fine:
- **Manual**: select columns AA:AB on the `Bank Transactions` sheet and delete them, then reload the Finance > Rules tab once -- it will recreate the same two columns correctly at V/W.
- **Guarded function**: run `cleanupPayTrackerStrayCategoryColumns()` from the Apps Script editor. It only deletes the two columns after confirming every data row is genuinely blank in both of them and that they're not already in the right place -- it throws instead of deleting if either check fails. Verified against 5 scenarios (the real misplaced-columns shape, data present, already-correct, not-yet-created, data in a row other than the first) via a Node `vm` harness calling the real function directly. Not run automatically by anything.
