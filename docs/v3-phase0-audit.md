# v3 Phase 0 — Repository Audit

Date: 2026-08-07
Scope: Read-only audit. No feature code was written in this phase.

---

## 1. Branch comparison against `main`

`git fetch --all` + ahead/behind counts vs `main` for every remote branch:

| Branch | Ahead of main | Behind main | Status |
|---|---:|---:|---|
| `agent/add-payroll-centre-ui-shell` | 0 | 25 | Fully merged already. Stale ref only — safe to delete, nothing unique on it. |
| `agent/complete-calendar-tab` | 0 | 9 | Fully merged. Stale ref. |
| `agent/complete-finance-tab` | 0 | 19 | Fully merged. Stale ref. |
| `agent/complete-goals-tab` | 0 | 15 | Fully merged. Stale ref. |
| `agent/complete-pay-tab` | 0 | 25 | Fully merged. Stale ref. |
| `agent/complete-reports-tab` | 0 | 13 | Fully merged. Stale ref. |
| `agent/complete-savings-tab` | 0 | 17 | Fully merged. Stale ref. |
| `agent/complete-settings-tab` | 0 | 11 | Fully merged. Stale ref. |
| `agent/connect-payroll-centre-frontend` | **1** | 24 | **Not merged. Do not merge — see §10.** |
| `agent/fix-oauth-authorization-prompt` | 0 | 5 | Fully merged. Stale ref. |
| `agent/fix-reports-double-read` | 0 | 7 | Fully merged. Stale ref. |
| `agent/monzo-pots-sync` | 0 | 3 | Fully merged. Stale ref. |
| `agent/monzo-transaction-matching` | 0 | 1 | Fully merged. Stale ref. |

**Finding:** every branch except `agent/connect-payroll-centre-frontend` is already fully merged into `main` — they're just leftover refs from the normal branch → PR → merge workflow this project already follows, safe to delete at any time with zero risk. `agent/connect-payroll-centre-frontend` is the one genuinely unmerged branch, and per rule 4 it needed explicit review before touching — see §10 for why it must **not** be merged.

`main` is current as of commit `adc841a` ("Match bank transactions to Bills/Debts payments, and fix Monzo token expiry").

---

## 2. Full repository file inventory

98 source files tracked by `clasp` (`.js`/`.gs`/`.html`/`appsscript.json`), plus 9 files under `docs/` and this repo's own tooling files (`.clasp.json`, `.claude/`). By area:

- **Core** (5): `Config.js`, `Utilities.js`, `Main.js`, `Menu.js`, `Backup/BackupService.js`
- **Setup** (1): `SheetBuilder.js`
- **Pay/Calendar** (4): `PayCalculator.js`, `SummaryService.js`, `WeekManager.js`, `Calendar/CalendarService.js`
- **Finance (bills/debts)** (4): `FinanceConfig.js`, `FinanceDashboard.js`, `FinanceService.js`, `PaymentService.js`
- **Finance integration (Monzo/bank)** (6): `FinanceIntegrationConfig.js`, `FinanceIntegrationSetupService.js`, `MonzoService.js`, `SubscriptionDetectionService.js`, `SubscriptionRepository.js`, `TransactionMatchingService.js`
- **Savings** (5): `SavingsConfig.js`, `SavingsService.js`, `SavingsContributionService.js`, `SavingsDashboardService.js`, `LifeGoalsServic.js` *(filename typo, pre-existing — see §10)*
- **Payroll/Staffline** (18): every `Backend/Payroll/*.gs`/`*.js` file — see §5 for the breakdown
- **Web/RPC layer** (8): one `Backend/Web/*WorkspaceService.js` per page (Dashboard, Pay, Finance, Savings, Goals, Reports, Calendar, Settings) plus `Frontend/Web/WebApp.js`
- **Frontend shell** (7): `Index.html`, `App/AppRoutes.html`, `App/AppController.html`, `Layout/*.html` (Navigation, Header, Footer), `UI/Scripts.html`, `UI/Styles.html`
- **Frontend pages** (8): one `Frontend/Pages/*.html` per workspace
- **Frontend page services** (8): one `Frontend/Services/*WorkspaceService.html` per workspace, plus `PayAnalyticsService.html`, `PayCalendarService.html`, `PayForecastService.html`, `PayTimelineService.html`, `ShiftTableService.html`, `PayrollCentreService.html` as sub-services of the Pay page
- **Frontend CSS** (13): `Frontend/Assets/CSS/*.html`
- **Config** (1): `appsscript.json`
- **Docs** (9): `docs/Architecture.md`, `Database.md`, `Roadmap.md`, `VERSION.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `PayEngine.md`, `FinanceModule.md`, `SavingsEngine.md` — all last touched at the "v2.6.0 Initial GitHub Release" milestone; see §11.

---

## 3. Existing sheet inventory

Every sheet tab the app reads or writes, by module. All are centrally named in a `*Config.js` `SHEETS` object — no orphaned/undocumented sheet names were found.

| Sheet Tab | Purpose | Defined In |
|---|---|---|
| `PaySheet` | Weekly shift/pay grid for NHS, Relief Warden, Night Security, Logging Cash | `Core/Config.js` |
| `Bills` | Recurring bills | `Finance/FinanceConfig.js` |
| `Debts` | Loans/debts and repayment progress | `Finance/FinanceConfig.js` |
| `Finance Payments` | Upcoming payment queue (bills + debts) | `Finance/FinanceConfig.js` |
| `Payment History` | Completed payments, undo-capable | `Finance/FinanceConfig.js` |
| `Finance Dashboard` | Cached dashboard figures | `Finance/FinanceConfig.js` |
| `Bank Connections` | Monzo connection status/tokens metadata | `Finance/FinanceIntegrationConfig.js` |
| `Bank Transactions` | Imported Monzo transactions + match status | `Finance/FinanceIntegrationConfig.js` |
| `Subscriptions` | Detected/confirmed recurring subscriptions | `Finance/FinanceIntegrationConfig.js` |
| `Subscription Transactions` | Transaction lines backing a subscription | `Finance/FinanceIntegrationConfig.js` |
| `Bank Sync History` | Monzo sync run log | `Finance/FinanceIntegrationConfig.js` |
| `Savings Settings` | Global savings allocation rules | `Savings/SavingsConfig.js` |
| `Savings Pots` | Savings pots, incl. linked Monzo Pot ID/name (added this session) | `Savings/SavingsConfig.js` |
| `Savings Contributions` | Upcoming contribution queue | `Savings/SavingsConfig.js` |
| `Savings History` | Completed contributions, undo-capable | `Savings/SavingsConfig.js` |
| `Life Goals` | Goals linked to pots, with forecasting | `Savings/SavingsConfig.js` |
| `Payroll Groups` | A payslip grouping (e.g. "Combined Payroll") | `Payroll/PayrollConfig.js` |
| `Payroll Group Employers` | Which employers (NHS/Relief/Security) belong to a group | `Payroll/PayrollConfig.js` |
| `Payslip Register` | One row per imported payslip: predicted vs actual, difference, comparison status | `Payroll/PayrollConfig.js` |
| `Payslip Email Rules` | Gmail sender/subject/filename matching rules for payslip import | `Payroll/PayrollConfig.js` |
| `Payroll Scan History` | Gmail payslip-scan run log | `Payroll/PayrollConfig.js` |
| `Payroll Timesheet Mappings` | Maps free-text Staffline references found on payslips → employer/job | `Payroll/PayrollTimesheetMappingService.gs` |

**Finding:** there is no sheet anywhere that stores an actual Staffline *schedule* (a shift with a date/start/finish independent of a payslip). `Payroll Timesheet Mappings` is a **reference-string → employer lookup table**, not shift data — see §5.

There is also no `Job`/job-registry sheet: job identity today is a mix of (a) hardcoded `TABLES`/`PAY_RULES` keys in `Core/Config.js` (PaySheet side) and (b) an `EMPLOYERS` object with different keys (`nhs`, `relief`, `security`, `logging`) in `Payroll/PayrollConfig.js` (Payroll Centre side) — the same four jobs, defined twice, in two different shapes, in two different files. See §5 and §12.

---

## 4. Service dependency map

**Triggers:** only `onOpen` (builds the spreadsheet menu) and `onEdit` (wired to `PayCalculator`, `FinanceService`, `PaymentService`, `SavingsService`, `SavingsContributionService`, `LifeGoalsService`). **No time-based (`ScriptApp.newTrigger`) triggers exist anywhere in the repo** — Monzo sync, Gmail payslip scanning, and every other "sync" action is 100% on-demand, fired only by a button click or menu item. Nothing runs automatically in the background today.

**Request flow:** browser → `Frontend/Web/WebApp.js` `doGet()` serves `Frontend/Index.html` (which inlines every CSS/page/service file via `HtmlService` includes) → `Frontend/App/AppRoutes.html` + `AppController.html` handle client-side routing between the 8 workspace pages → each page's `Frontend/Services/*WorkspaceService.html` calls `google.script.run` against one `Backend/Web/*WorkspaceService.js` RPC entry point → that delegates to the real domain service (`FinanceService`, `SavingsService`, `MonzoService`, `PayrollCentreController`, etc.) → which reads/writes the spreadsheet directly.

RPC entry points found (`Backend/Web/*.js`, one file per page):

| Page | Backend Web Service | Confirmed RPC functions |
|---|---|---|
| Dashboard | `DashboardService.js` | `getPayTrackerWebDashboardData` |
| Pay | `PayWorkspaceService.js` | `getPayTrackerWebPayWorkspaceData` (Payroll Centre RPCs live separately — see §5) |
| Finance | `FinanceWorkspaceService.js` | `getPayTrackerFinanceWorkspace`, `markPayTrackerFinancePaymentPaid`, `undoPayTrackerFinancePayment`, `confirmPayTrackerSubscription`, `rejectPayTrackerSubscription`, `confirmPayTrackerBankMatch`, `rejectPayTrackerBankMatch` |
| Savings | `SavingsWorkspaceService.js` | `getPayTrackerSavingsWorkspace`, `markPayTrackerSavingsContributionDeposited`, `undoPayTrackerSavingsContribution`, `getPayTrackerMonzoPotOptions`, `linkPayTrackerSavingsPotToMonzo`, `unlinkPayTrackerSavingsPotFromMonzo` |
| Goals | `LifeGoalsWorkspaceService.js` | `getPayTrackerLifeGoalsWorkspace` |
| Reports | `ReportsWorkspaceService.js` | `getPayTrackerReportsWorkspace` |
| Calendar | `CalendarWorkspaceService.js` | `getPayTrackerCalendarWorkspace`, `runPayTrackerCalendarSync` |
| Settings | `SettingsWorkspaceService.js` | `getPayTrackerSettingsWorkspace`, `updatePayTrackerSavingsSettings` |

**Payroll Centre RPCs** (`Backend/Payroll/PayrollCentreController.gs`, separate from the pattern above): `getPayTrackerPayrollCentre`, `getPayTrackerPayslips`, `getPayTrackerPayslip`, `scanPayTrackerPayrollCentreGmail`, plus `uploadPayTrackerPayslipPdf` (`PayrollManualUploadService.gs`) and `comparePayTrackerPayslip` / `compareAllPayTrackerPayslips` (`PayrollComparisonService.gs`). These are called from `Frontend/Services/PayrollCentreService.html` (the current, live 4,635-line file — see §10 for why this matters).

**Finding — no live wiring for Staffline scheduling:** `PayrollTimesheetMappingService.gs` and `PayrollTimesheetParser.gs` exist and are functional in isolation, but neither exposes a `get`-style RPC that a frontend page actually calls today. They're invoked internally during payslip processing (to resolve a reference string to an employer), not to show a "Timesheets" view. This matches the roadmap's Phase 3 gap precisely.

---

## 5. Existing Staffline functionality

**Import methods (confirmed, not assumed):**
- **Gmail** — `PayslipImportService.gs` calls `GmailApp.search(...)` (2 call sites) against rules stored in the `Payslip Email Rules` sheet (sender-contains/equals, subject-contains, filename-contains, requires-PDF, priority, active). Matches are scored into `Payslip Register` with `Match Confidence` (`NONE`/`LOW`/`MEDIUM`/`HIGH`/`EXACT`) and `Match Reason`. Every scan run is logged to `Payroll Scan History` (messages checked, PDFs found, payslips registered, duplicates skipped, review items, errors) — this is the exact shape the roadmap's §6 "Annual Leave Email Scan History" wants, so §6 can reuse this pattern almost verbatim rather than inventing a new one.
- **Manual upload** — `PayrollManualUploadService.gs` / `uploadPayTrackerPayslipPdf(input)` lets a PDF be registered directly, bypassing Gmail.
- No Drive-folder-watch, CSV/API import, or browser-automation path exists — only Gmail search + manual PDF upload.

**Parsing:** `PayrollPayslipParser.gs` + `PayrollPdfTextService.gs` extract structured pay fields from the PDF text (gross, net, tax, NI, pension, student loan, other deductions) into `Payslip Register`'s `*_Actual` columns.

**Timesheet handling:** there is **no scheduled-shift "timetable" concept**. `Payroll Timesheet Mappings` (`PayrollTimesheetMappingService.gs`) is a lookup table mapping a free-text reference string (as it appears on a payslip line) to an employer/job — used to classify payslip lines, not to store or compare actual scheduled shifts. `PayrollTimesheetParser.gs` parses whatever timesheet-shaped text is embedded in a payslip PDF (hours per category), not an independently-imported Staffline schedule export.

**Comparison/discrepancy engine (already real and working):** `PayrollComparisonEngine.gs` + `PayrollComparisonService.gs` + `PayrollFieldComparisonService.gs` compare, per payslip: basic/unsocial/overtime/**holiday** hours actual vs predicted, gross/net/tax/NI/pension/student-loan actual vs predicted, producing a `Comparison Status` of `Not Ready` / `Matched` / `Minor Variance` / `Review` / `Major Discrepancy` / `Incomplete`, driven by configurable thresholds (`MATCHED_MAX_AMOUNT: 2`, `MINOR_VARIANCE_MAX_AMOUNT: 10`, `REVIEW_MAX_AMOUNT: 25`, `REVIEW_PERCENTAGE: 2`, `MAJOR_PERCENTAGE: 5`). **This is a payslip-level (whole-payslip-vs-whole-prediction) comparison, not a per-shift or per-adjustment ledger** — there's no "this specific missing 4 hours carried forward to next payslip" tracking. That gap is exactly roadmap Phase 6.

**Job/group model:** `PayrollGroupRepository.js` + `Payroll Groups`/`Payroll Group Employers` sheets already model the exact "combined payslip, multiple employers" scenario the roadmap is worried about for Annual Leave: one `Payroll Group` ("Combined Payroll") has three `Payroll Group Employers` rows (nhs, relief, security), each flagged `Included In Taxable Payroll`, and Logging Cash is deliberately excluded as its own thing. **This existing structure is directly reusable as the backbone of the roadmap's "Job Registry"** — it already has the right shape (a job/employer key, a taxable flag, a group membership), it just doesn't yet carry hourly rates, AL settings, or calendar-matching rules, and it duplicates the *separate* job list hardcoded in `Core/Config.js`'s `TABLES`/`PAY_RULES` (see §12).

**Annual Leave / holiday pay:** confirmed absent as a system — see §8.

**Frontend wiring:** `Frontend/Services/PayrollCentreService.html` (4,635 lines, live on `main`) and `Frontend/Services/PayAnalyticsService.html` are the real, currently-deployed frontends calling the RPCs listed in §4. A *different*, much smaller (1,042-line) file named `PayPayrollCentreService.html` exists only on the stale `agent/connect-payroll-centre-frontend` branch — it is not part of `main` and should not be treated as the current implementation. See §10.

---

## 6. Existing Gmail functionality

All Gmail access in the repo is in **one file**: `Backend/Payroll/PayslipImportService.gs` (2 `GmailApp.search()` call sites). It is payslip-specific — searches for payslip emails, extracts PDF attachments, computes a file hash to detect duplicates, and registers a row per payslip. There is no historical-range picker beyond whatever the search query itself encodes, no thread-level tracking, and no calendar-invite handling.

**No leave/holiday/absence email handling exists anywhere** — repo-wide search for "leave", "holiday", "absence", "annual leave", "time off" outside of the `Payroll Comparison`/`Payslip Register` "Holiday Hours" field (a payslip total, see §8) returns nothing. Roadmap §6/Phase 5 (Gmail Annual Leave importer) is a genuinely new build, though it can and should reuse the `Payslip Email Rules` + `Payroll Scan History` sheet pattern already proven in §5.

---

## 7. Existing Monzo functionality

(Well-established from this session's own work, restated here for completeness of the audit.)

- OAuth2 confidential-client flow (`MonzoService.js`): authorization URL + state, callback token exchange, and — as of the latest merged PR — automatic refresh-token exchange on a 401, since Monzo access tokens expire in a few hours.
- Transaction import (`/transactions`) into `Bank Transactions`, with a 30-day sync window (reduced from 90 to stay under Monzo's Strong Customer Authentication re-verification threshold).
- Subscription detection (`SubscriptionDetectionService.js`/`SubscriptionRepository.js`) — merchant-recurrence heuristics writing to `Subscriptions`/`Subscription Transactions`.
- Monzo Pots (`fetchPots`/`listPots`) linked to `Savings Pots` via `Linked Monzo Pot ID`/`Linked Monzo Pot Name`, auto-syncing pot balances on every Monzo sync.
- Bank-transaction-to-Bills/Debts matching (`TransactionMatchingService.js`) — confidence-scored, writes `Suggested` status only, never auto-confirms; user Confirms/Rejects via the Finance page.
- No account-balance (current/available) import exists yet, no money-movement/transfer ledger, and matching rules are hardcoded logic rather than a user-editable `Transaction Matching Rules` sheet — both are explicitly still-open items matching roadmap Phase 7/8.

---

## 8. Existing Annual Leave / holiday-pay functionality

**Confirmed: does not exist as a system.** The only trace anywhere in the codebase is a single field, `Actual Holiday Hours`, on the `Payslip Register` sheet (`PayrollComparisonEngine.gs`/`PayrollFieldComparisonService.gs`) — one number per payslip, compared against a predicted total the same way basic/unsocial/overtime hours are compared. There is:
- no per-job balance,
- no accrual calculation,
- no "booked vs taken vs paid" distinction,
- no leave-year concept,
- no Gmail leave-email handling,
- no UI surface for it beyond whatever generic "Holiday Hours" comparison row appears in the payslip diff.

`docs/PayEngine.md` independently corroborates this — it lists "Holiday pay" and "Sick pay" explicitly under a **Future** heading, never under what's built. Roadmap Phase 4 (Annual Leave engine) and Phase 5 (Gmail AL import) are correctly scoped as net-new builds, not extensions of something partial.

---

## 9. Existing discrepancy functionality

Covered in detail in §5. Summary: a real, working, configurable discrepancy classifier exists (`Not Ready`/`Matched`/`Minor Variance`/`Review`/`Major Discrepancy`/`Incomplete`) but operates only at the **whole-payslip** level (predicted totals vs actual totals). There is no per-shift reconciliation (Calendar ↔ Staffline ↔ payslip three-way match doesn't exist — there's no Staffline schedule data to reconcile against, per §5), and no carry-forward ledger for a specific missing-hours amount that gets resolved on a later payslip. Roadmap Phase 1 (Action Centre) and Phase 6 (Pay Adjustments ledger) are additive on top of this, not replacements for it.

---

## 10. Obsolete or duplicated code

1. **`agent/connect-payroll-centre-frontend` branch — do not merge.** Its one unmerged commit adds `Frontend/Services/PayPayrollCentreService.html` (1,042 lines) and edits `Frontend/Index.html`, but the branch was cut *before* the Finance-integration, Savings-Monzo, Reports, and current Payroll Centre backend work landed on `main`. Diffing it against current `main` shows **63 files changed, 1,430 insertions, 42,253 deletions** — merging it would delete `FinanceIntegrationConfig.js`, `MonzoService.js`, `TransactionMatchingService.js`, every `*WorkspaceService.js`, most of the CSS, and replace the current live 4,635-line `PayrollCentreService.html` with an unrelated, much smaller file. This branch is superseded, not aligned with a superset of `main`. Recommendation: close the PR (if one exists) and delete the branch once confirmed with the user; do not merge under any circumstances.
2. **10 fully-merged stale branch refs** (`agent/add-payroll-centre-ui-shell`, `agent/complete-*-tab` ×6, `agent/fix-oauth-authorization-prompt`, `agent/fix-reports-double-read`, `agent/monzo-pots-sync`, `agent/monzo-transaction-matching`) — zero risk, safe to delete, no unique commits.
3. **`Backend/Savings/LifeGoalsServic.js`** — pre-existing filename typo (missing final "e"). Functional, actively used, low-priority cosmetic fix; rename only in a dedicated small PR since Apps Script/clasp treats filenames as significant and a rename touches every `require`-equivalent reference.
4. **Duplicate job/employer definitions** — see §12. `Core/Config.js` `TABLES`/`PAY_RULES` and `Payroll/PayrollConfig.js` `EMPLOYERS` both define the same four jobs independently, with different keys and different data. Not "obsolete" (both are live and used), but a direct duplication that Phase 1's Job Registry must resolve rather than add a third copy of.
5. **Version-number drift** — see §11.

---

## 11. Documentation debt (found during the audit, in scope of rule 14)

Every file under `docs/` (`Architecture.md`, `Database.md`, `Roadmap.md`, `VERSION.md`, `CHANGELOG.md`) and the root `README.md` is frozen at the "v2.6.0 Initial GitHub Release" milestone and does not mention: the Payroll Centre module (18 files), the Monzo/Finance-integration module (6 files), the Reports/Calendar/Settings workspaces, or the standalone web app frontend (`Frontend/`) at all — despite these being the majority of the current codebase. Internal module version constants have also drifted independently: `Core/Config.js` says `2.1.0`, `Finance/FinanceConfig.js` says `2.4.0`, `Frontend/Web/WebApp.js` (what the UI footer actually displays) says `2.6.0`, while `Payroll/PayrollConfig.js`, `PayrollGroupRepository.js`, `PayrollSetupService.js`, and `Finance/FinanceIntegrationConfig.js` all say `2.8.0`. There is no single canonical version number today.

This audit updates `README.md`, `docs/VERSION.md`, `docs/CHANGELOG.md`, `docs/Architecture.md`, and `docs/Database.md` to reflect actual current state, and appends the v3 roadmap to `docs/Roadmap.md` rather than creating a competing document.

---

## 12. Recommended v3 migration approach

1. **Job Registry is additive, not a rewrite.** `Payroll/PayrollConfig.js`'s `EMPLOYERS` object (`nhs`/`relief`/`security`/`logging`, each with a `TAXABLE` flag) and `Payroll Groups`/`Payroll Group Employers` sheets are the right foundation — they already model multi-employer combined payslips correctly. Phase 1 should promote this into a proper `Job Registry` sheet (per the roadmap's field list: hourly rate, enhancement rules, AL settings, calendar-matching rules) and have `Core/Config.js`'s `TABLES`/`PAY_RULES` become *derived from* it (or explicitly cross-referenced by the same job key) instead of maintaining two independent hardcoded job lists. This is the single highest-leverage unification in the whole v3 plan — nearly everything else (AL, Action Centre, three-way reconciliation) needs one authoritative Job ID.
2. **Reuse the Gmail rules pattern, don't reinvent it.** `Payslip Email Rules` + `Payroll Scan History` is exactly the shape roadmap §6 wants for Annual Leave email rules/scan history — copy the pattern (sender/subject/filename rules sheet + a scan-run log sheet with the same counters) rather than designing a new one.
3. **Extend the existing comparison engine downward, don't replace it.** The payslip-level `Comparison Status`/thresholds system works and should keep owning "is this whole payslip right." Phase 6's Pay Adjustments ledger is a new, finer-grained layer underneath it (per-discrepancy, carry-forward-capable), not a replacement.
4. **No sheet has ever been found undocumented or orphaned** (§3) — the existing `*Config.js` SHEETS pattern is consistent and should be the template for every new sheet in Phases 1–8 (`Job Registry`, `Annual Leave Job Settings`, `Annual Leave Earnings`, `Annual Leave Usage`, `Pay Adjustments`, `Money Movements`, `Transaction Matching Rules`, etc.).
5. **`ensureSheetColumns`-style safe-widening** (used this session when Savings Pots gained 2 new columns for Monzo linkage) is the established, working pattern for adding columns to an existing sheet without breaking old rows — reuse it for every new column added to an existing sheet in later phases, per rule 7.
6. **No automatic/scheduled behaviour exists yet** (§4) — anything in the roadmap implying "automatically" (e.g. periodic Gmail scans) will need real `ScriptApp.newTrigger` setup as new, explicit infrastructure; today literally everything is button-triggered.
7. **Do not merge `agent/connect-payroll-centre-frontend`** (§10). If any part of its `PayPayrollCentreService.html` contains UI ideas worth keeping, cherry-pick concepts manually into the current `PayrollCentreService.html` — never merge the branch itself.

---

## 13. Phase 1 implementation plan (proposed, not started)

Branch: `agent/v3-reconciliation-foundation`

1. **Job Registry sheet** — new `Job Registry` sheet per the roadmap's field list, seeded from the existing `PayrollConfig.EMPLOYERS` + `Core/Config.js` `TABLES` data (same four jobs: `JOB-NHS`, `JOB-RELIEF-WARDEN`, `JOB-NIGHT-SECURITY`, `JOB-LOGGING-CASH`), so no existing behaviour changes on setup.
2. **Cross-reference, don't duplicate** — `Core/Config.js` `TABLES`/`PAY_RULES` and `Payroll/PayrollConfig.js` `EMPLOYERS` keep working exactly as they do today (rule 5: preserve existing data/behaviour), but both gain a documented mapping to the new Job Registry's Job ID so later phases (AL, three-way reconciliation) have one join key.
3. **Action Centre sheet/service** — new sheet + `Backend/Web/ActionCentreWorkspaceService.js`, initially populated from three things that *already produce reviewable state* today: `Payslip Register` rows with `Comparison Status` in (`Review`, `Major Discrepancy`), `Bank Transactions` rows with `Match Status = Suggested` (already exists, from this session's work), and `Payroll Scan History` rows with unresolved review items. This makes Phase 1 genuinely additive — it surfaces existing data in one place rather than inventing new detection logic.
4. **Shared source-link + confidence/review-status shape** — a small shared object (`sourceType`, `sourceId`, `confidence`, `reviewStatus`) used consistently by the Action Centre and, going forward, by every phase that needs a review queue (AL emails, pay adjustments, transaction matches) — modeled directly on the `Match Confidence`/`Match Reason`/`Comparison Status` fields that already exist in `Payslip Register` and `Bank Transactions`, so it's a generalization of a proven pattern, not a new invention.
5. **No UI navigation changes in Phase 1** — Action Centre ships as a new page reachable like any other workspace; the sidebar reorganization is explicitly Phase 2's job (roadmap ordering), so Phase 1 stays backend-and-data-model-focused and low-risk.

Definition of done (from the roadmap, restated): every unresolved item (Payslip Register reviews, Suggested bank matches, scan-history review items) appears in one Action Centre view; every record links back to its source; no manual decision already recorded anywhere is overwritten by this phase.
