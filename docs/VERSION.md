# Pay Tracker

**Current Version:** 3.0.6

## Status

✅ Stable — live deployed web app, actively used

## Development Stage

Active Development — v3 roadmap Phases 2, 4, 5, 6, 7 and 8 implemented (navigation redesign, Annual Leave engine, Gmail Annual Leave import, Pay Adjustments ledger, Money Movements ledger, Transaction Matching Rules). Phase 3 (Staffline) is blocked pending real Staffline export data.

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

v3 Phase 9 — analytics (see `Roadmap.md`). Phase 3 (Staffline schedule reconciliation) remains blocked pending real Staffline export data. Deferred follow-ups from earlier phases: Phase 7's account-balance import and automatic Money Movement creation from confirmed bank matches; Phase 8's fuel-budget-style category-vs-budget tracking and any automatic (Auto Confirm) rule application -- categories are always applied by explicit user action, never automatically.
