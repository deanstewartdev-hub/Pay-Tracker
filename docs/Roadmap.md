# Roadmap

## Phase 1

Completed

✔ Pay Tracking

✔ Finance Module

✔ Savings Module

---

## Phase 2

Largely superseded by what actually shipped — see the v3 roadmap below.

✔ Standalone Web Application (shipped as the Apps Script web app, not a separate REST API)

✔ Dashboard

✔ Responsive Design (workspace pages)

✔ Monzo bank connection, transaction import, subscription detection, savings-pot balance sync, bill/debt transaction matching

✔ Payroll Centre: Gmail/manual payslip import, PDF parsing, predicted-vs-actual comparison

Disposable Income Savings Engine, Weekly Cash Flow, Budget Forecasting, Mortgage Planning, Vehicle Finance — still not built; superseded in priority by the v3 plan below.

---

## Phase 3 / Phase 4 (original)

Authentication, REST API, Mobile Application (Android/iOS), Notifications, Offline Support — not started. Superseded by the v3 plan below, which does not currently prioritise a native mobile app or a separate REST API.

---

# v3 — Reconciliation Platform

See `docs/v3-phase0-audit.md` for the Phase 0 audit this plan is based on.

## Objective

Connect Calendar shifts → Staffline timetables/timesheets → predicted pay → actual payslip lines → missing/delayed pay → Monzo income → bills/spending → savings/Monzo pots → reports, into one reconciliation system. Google Sheets remains the source of truth; the web app is the interface; GitHub is canonical.

## Non-negotiable rules

1. Inspect `main` and every branch before changing anything.
2. Check whether work already exists before writing new code.
3. ~~Never merge `agent/connect-payroll-centre-frontend` without re-reviewing~~ — resolved: re-reviewed one final time during v3.1.0 release closeout (2026-08-29), reconfirmed fully superseded by the shipped `PayrollCentreService.html` (see PR #2's closing comment), and the branch was deleted. Kept here as a record of the decision, not as an active rule.
4. Preserve all existing PaySheet, Finance, Savings, Life Goals, Payroll Centre and Monzo data.
5. Never auto-clear an existing sheet.
6. Setup/migration functions must be safe to run repeatedly.
7. Every imported external record preserves its source ID.
8. Every automated classification is reversible.
9. Anything uncertain goes to a manual review queue (Action Centre), never auto-decided.
10. Never silently overwrite a manually corrected record.
11. One feature branch per phase; one PR per phase; update README + version after every major phase; validate Apps Script compatibility; test the deployed web app, not just source.

## Phase order

0. Repository audit — `agent/v3-audit-and-roadmap` (this document + `docs/v3-phase0-audit.md`)
1. Unified data model (Job Registry) + Action Centre — `agent/v3-reconciliation-foundation` — complete
2. Navigation redesign (Work & Pay / Money / Planning & Analysis groups, mobile layout) — `agent/v3-navigation-redesign`
3. Staffline timetable/timesheet import + three-way reconciliation (Calendar ↔ Staffline ↔ payslip) — `agent/v3-phase3-staffline-reconciliation` — complete
4. Annual Leave engine — per-job settings, earnings ledger, usage ledger, combined-payslip allocation — `agent/v3-annual-leave-engine`
5. Gmail Annual Leave importer — `agent/v3-gmail-annual-leave-import`
6. Pay adjustments and recovery ledger (missing hours, carry-forward) — `agent/v3-pay-adjustment-ledger`
7. Advanced Monzo: balances, pot movement ledger, salary-to-payslip matching — `agent/v3-monzo-pots-and-ledger`
8. Transaction/bill reconciliation rules (fuel budgets, learned matching) — `agent/v3-transaction-matching`
9. Expanded analytics/reports — `agent/v3-analytics-and-diagrams`
10. Production hardening (tests, permissions, tagged release) — `agent/v3-production-release`

Annual Leave (Phase 4) must not start before the Job Registry (Phase 1) exists — every AL record must belong to exactly one job.

---

# v3.2 — Unified Sync Engine

Post-roadmap initiative, not a v3 phase — completed 2026-08-31. Replaces manual, per-page "sync now" clicking with one orchestrator: a task registry with per-task freshness gating, a startup screen showing real sync progress, a background schedule (three time-driven triggers), and a "Refresh Everything" action. See `docs/v3.2-unified-sync-audit.md` for the audit this was built from, and `docs/VERSION.md` / `docs/Changelog.md` for the full release record.

Changes how the v3 roadmap's existing features stay fresh, not what they do — the Staffline portal's manual-only limitation (no API, no headless auth path) is unchanged and always shown as such, never as a failed sync.

Full field-level specification for every sheet, ledger and phase (Job record, Unified Shift record, Annual Leave sheets, Pay Adjustments columns, Money Movements columns, Transaction Matching Rules, report list) lives in `docs/v3-Roadmap-Detail.md`. This file intentionally stays high-level so it doesn't drift out of sync with that detail again.
