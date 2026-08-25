# Changelog

All notable changes to Pay Tracker are documented in this file.

The project follows Semantic Versioning where practical.

---

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
