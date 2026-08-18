# Changelog

All notable changes to Pay Tracker are documented in this file.

The project follows Semantic Versioning where practical.

---

# v3.0.1 — Calendar and Annual Leave reconciliation

- Highlights Annual Leave dates and their basic-pay shift cards in red on the weekly Pay calendar.
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
