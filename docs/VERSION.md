# Pay Tracker

**Current Version:** 3.2.0

## Status

✅ Stable — live deployed web app, actively used

## Development Stage

v3 roadmap complete — all ten phases implemented (reconciliation foundation, navigation redesign, Annual Leave engine, Gmail Annual Leave import, Staffline reconciliation, Pay Adjustments ledger, Money Movements ledger, Transaction Matching Rules, Ledger Analytics, production hardening). v3.1.1 was a maintenance patch on top of v3.1.0. v3.2.0 is a post-roadmap initiative: a Unified Sync Engine that orchestrates every existing external-source sync behind one task registry, freshness gating and background schedule -- see below.

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

## v3.1.1 — Calendar jobId maintenance fix

A v3.1.0 release closeout audit (read-only, no code changes) found that `CalendarService.js`'s four ordinary-shift classifiers (`classifyNightSecurityEvent`, `classifyNhsEvent`, `classifyReliefEvent`, `classifyLoggingEvent`) computed a `tableName` for PaySheet routing but never set a `jobId` -- so every real, non-leave Calendar shift synced to Sheets got `jobId: ''`, regardless of correct classification. This broke `StafflineReconciliationService`'s Calendar-side job matching (`shift.jobId === timesheet.jobId` can never match a blank ID), surfacing as false "Job Mismatch" results for Staffline timesheets that did have real, correctly-logged Calendar shifts in their window. Confirmed live against the real Calendar Sync Records sheet: 100% of shifts checked across the 5 known fixtures (621093, 621105, 621137, 624148, 624186) had a blank Job ID.

Fixed in [PR #34](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/34): added the correct canonical Job ID to all 10 return branches, following the precedent `classifyAnnualLeaveEvent` already set for booked-leave events. Traced every downstream consumer of `jobId` and confirmed it only feeds a Calendar Sync Records tracking field and one Action Centre item label -- never PaySheet table/row/hours/pay values -- so the fix is purely additive with no PaySheet regression risk. Independently re-verified by a second, fresh review pass before merge (mapping, additivity, and test-dispatch path all confirmed correct).

The fix only changes how *future* Calendar syncs classify events -- it cannot retroactively repair `jobId` on shifts already written to Calendar Sync Records. A real resync was run (the existing "Sync now" mechanism, confirmed idempotent: it rewrites PaySheet cells with identical values for already-matching shifts and always upserts the tracking record's `jobId` regardless) against the real spreadsheet, live-verified before/after: `imported: 0, updated: 0, adopted: 0, removed: 0` -- a genuine no-op for PaySheet content, with `jobId` now correctly populated on the tracking records.

Re-auditing the 5 known fixtures after the resync (see `Changelog.md` for the full table) confirmed: 2 fixtures (621137, 624186 -- both NHS) moved off the false "Job Mismatch" onto "Hours Differ", since `classifyNhsEvent` deliberately never computes `hours` (a separate, confirmed-intentional design, not a bug) -- so this is now an honest signal, not a false alert. 2 fixtures (621105, 624148 -- both Night Security) correctly remain "Job Mismatch": no Night-Security-titled Calendar event exists in either audited week at all, a genuine human calendar-logging gap that no code change can or should paper over. 1 fixture (621093, Relief Warden) moved off "Job Mismatch" onto "Hours Differ" -- a real Relief-Warden-titled event now matches, but its computed duration (24h, a fixed day-rate classification) genuinely differs from Staffline's submitted 10h. In all 5 cases, the underlying Staffline-vs-payslip payment status remains a genuine `Match` -- this fix and its resync never touched, and never risked, actual payroll figures.

Promoted to the existing production deployment (`AKfycbz6IKFfwyucB2dPWzzFU9WcyJjJxeTTopK4mGfYBGCdoBkksTkqdID2QiKWYHSU6Jjg5g`, same URL, version @136) on 2026-08-30 from `main` commit `149c28563fdf26709cdaa512165d695f0a2cc191`, after: independent review, static validation clean, `runAllPayTrackerTests()` 8/8 suites and 155/155 checks, an isolated-deployment smoke test (Dashboard, Pay/Timesheets/Payslips/Annual Leave, Calendar, Action Centre, Finance -- all clean, no console errors), the real Calendar resync verified before/after, a full re-audit of all 5 known fixtures, and a post-promotion smoke test against production itself.

## v3.2.0 — Unified Sync Engine

A central orchestrator (`Backend/Sync/`) replacing manual, per-page "sync now" clicking as the app's primary freshness mechanism. Full detail (task registry, freshness TTLs, real findings) in `docs/Changelog.md`; audit basis in `docs/v3.2-unified-sync-audit.md`.

**What shipped**: a task registry wrapping all 6 real external syncs (Calendar, Staffline Gmail, Payslip Gmail + processing, Annual Leave Gmail, Monzo transactions, Monzo pots) plus Staffline Reconciliation's zero-write recompute, with dependency ordering, per-task freshness TTLs, and two-tier concurrency safety (a short-lived Properties-backed run-lock, plus each task's own existing document lock); a "Sync Status" sheet persisting per-task health, upserted by task ID, never erasing a last-known-good timestamp on a later failure; a startup screen showing real per-task progress with a time-boxed "Continue to Pay Tracker" fallback so a slow sync (a stale Calendar re-check genuinely took 3.5-4.5 minutes against the real dataset -- see below) never blocks entry to the app; a "Refresh Everything" action (the existing header refresh button) running a forced full re-check through the same engine and progress UI; three time-driven triggers (06:00 full, 12:00 lightweight, 18:00 full, `Europe/London`).

**Real, live-caught findings during the build** (each fixed and re-verified before shipping):
- `mapPayslipResult_` read a field (`scan.recordsCreated`) that doesn't exist on `PayTrackerPayslipImportService.scanGmail()`'s real return shape (`payslipsImported`) -- caught by the deliberate one-time live-wiring verification, not the mocked automated suite. Beyond a cosmetic `"undefined new"` message, it made a real batch of processed payslips incorrectly report "Already current" instead of "Updated".
- A bare `<`/`>`/`<=`/`>=` comparison in new frontend JS (inside `Frontend/App/AppController.html`'s relative-time helpers) got HTML-entity-escaped by `HtmlService`'s template evaluation, silently killing the entire containing `<script>` block -- a previously-documented recurring platform pitfall for this codebase. Confirmed via the Apps Script executions log (the new sync RPCs never fired at all) and fixed with `Math.sign()`-based comparisons.
- Live testing against the real deployment surfaced that a stale Calendar sync can legitimately run several minutes -- the original design only offered a "Continue to Pay Tracker" fallback on a hard failure, which would have trapped a routine stale-Calendar startup at the loading screen for minutes. Fixed by racing the sync against a 7-second timer, after which Continue is offered regardless of whether the sync failed or is just still working; the eventual real result surfaces as a toast once it lands.
- `runUnifiedSyncTests()` writes real rows to the live "Sync Status" sheet keyed by real task IDs -- unlike other v3 suites' domain data, that sheet is active state the live engine reads to decide whether to skip a real sync as "still fresh", not harmless clutter. Caught at the worst possible moment: a full test run as the final pre-promotion gate check left `MONZO_POTS` showing fake test data instead of its real last-sync time, right as v3.2 went live. Fixed by snapshotting every real task's row before the suite runs and restoring it exactly in a `finally` block, mirroring the trigger-state backup/restore convention already used elsewhere in the same file.
- The pre-existing standalone `runAutomaticPayTrackerCalendarSync` trigger (installed before v3.2, calling the same `PayTrackerCalendarService.sync()` the new engine's own Calendar task now also calls) became actively redundant once the new engine's own Calendar task existed, and was observed failing/timing out in production from lock contention with a concurrent real sync request. Disabled (`disableAutomaticPayTrackerCalendarSync()`) once the new engine's own triggers were installed and verified.

**Verification**: static validation clean; `runAllPayTrackerTests()` 9/9 suites, 218/218 checks; a dedicated isolated test deployment (separate from production, same shared spreadsheet) smoke-tested clean; a real, live full sync run repeatedly against production data with no unexplained writes (confirmed via `duplicatesSkipped` counts on every Gmail-based source and Monzo's own existing dedup logic); Annual Leave's real, pre-existing "no email rules configured" account gap correctly surfaces as a graceful, non-fatal Failed status rather than a crash.

**Production promotion**: promoted to the existing production deployment (`AKfycbz6IKFfwyucB2dPWzzFU9WcyJjJxeTTopK4mGfYBGCdoBkksTkqdID2QiKWYHSU6Jjg5g`, same URL) on 2026-08-31, from `main` commit `979f3ad` (v3.1.1 was version @137, `main` commit `1b66fef`; v3.2.0 is version @140). Post-promotion smoke test against production itself confirmed a clean startup (real per-task progress, correct freshness gating) and a clean forced full re-sync. The three new time-driven triggers were installed and verified live (exact handler names/hours/timezone, no duplicates) only after that smoke test passed, per the release gate; one further manual production sync was run and inspected through the released code before leaving the triggers enabled.

**Known limitation, unchanged from prior releases**: the Staffline portal has no API and no authenticated headless path reachable from Apps Script -- it is not, and will not become, part of the automatic sync. It stays human/assistant-driven and is always shown as a distinct "Manual" source in the sync UI, never as a failed automatic sync.

**Rollback plan** (not needed -- documented for completeness): remove the three new triggers (`removePayTrackerSyncTriggers()`), redeploy the same production deployment ID back to version @137 (`clasp deploy -i <id> -V 137`), verify a clean post-rollback smoke test, and never leave a known-bad version live in the interim.

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
