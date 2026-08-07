# Pay Tracker v3 — Complete Development Roadmap (Detail)

This is the full field-level v3 specification. `docs/Roadmap.md` links here for detail; that file stays high-level.
The Phase 0 audit that maps every section below against what already exists in this repo is `docs/v3-phase0-audit.md` — read that first, since several sections below ("Add X sheet") already have a close or exact existing equivalent.

## Project objective

Develop Pay Tracker into a complete personal employment, payroll and financial reconciliation system, connecting: Calendar shifts → Staffline timetables and timesheets → predicted pay → actual payslip lines → missing or delayed pay → Monzo income → bills and spending → savings and Monzo pots → reports and financial analysis.

Google Sheets must remain the single source of truth. The web application is the main user interface. GitHub is the canonical codebase.

## 1. Non-negotiable development rules

1. Inspect the latest `main` branch.
2. Inspect every repository branch.
3. Check whether work already exists before creating new code.
4. Do not merge the obsolete Payroll Centre frontend branch (`agent/connect-payroll-centre-frontend`) without reviewing whether it has been superseded — per the Phase 0 audit, it has been, and must not be merged.
5. Preserve all existing PaySheet, Finance, Savings, Life Goals, Payroll Centre and Monzo data.
6. Never delete or clear an existing sheet automatically.
7. All setup and migration functions must be safe to run repeatedly.
8. Every imported external record must preserve its source ID.
9. Every automated classification must be reversible.
10. Anything uncertain must be sent to a manual review queue.
11. Do not silently overwrite manually corrected records.
12. Use one feature branch per phase.
13. Open a pull request for each completed phase.
14. Update the README and version number after every major phase.
15. Validate Apps Script compatibility before merging.
16. Test the actual deployed web application, not only the source code.

## 2. Current confirmed foundation

Do not rebuild these systems (all confirmed present in the Phase 0 audit). Extend and connect them:

- PaySheet calculations for NHS, Relief Warden, Night Security and Logging Cash
- Google Calendar shift synchronisation
- Weekly pay forecasts
- Payroll Centre (Gmail + manual PDF payslip import, parsing, predicted-vs-actual comparison)
- Gmail payslip importing
- Private Google Drive payslip storage
- Staffline payslip parsing
- Staffline timesheet-*reference* mapping (a lookup table, not a schedule — see audit §5)
- Predicted-versus-actual payslip comparisons
- Finance bills and debts
- Payment history and payment undo
- Savings pots and contribution history, incl. Monzo Pot balance linkage
- Life Goals
- Reports
- Monzo OAuth connection, transaction import, token refresh
- Subscription detection
- Bank transaction → Bills/Debts payment matching
- Basic pay analytics

## 3. Target application navigation

### Overview

**Dashboard** — current week earnings, next expected payday, outstanding pay discrepancies, Annual Leave available by job, upcoming bills, current disposable income, Monzo balance, total savings, items requiring review.

**Action Centre** — every unresolved item in one place: unrecognised Staffline shifts, calendar mismatches, Staffline timetable mismatches, missing payslip hours, carried-forward pay corrections, unclassified Monzo transactions, suggested bill matches, unclear Annual Leave emails, unmatched holiday-pay lines, duplicate or conflicting records.

### Work and Pay

**Shifts** — combined view of Google Calendar shifts, Staffline scheduled shifts, Staffline submitted/approved timesheets, manual shifts, payslip timesheet lines.

**Timesheets** — Staffline timetable, Staffline timesheet, Calendar comparison, missing shifts, changed start/finish times, approved vs submitted hours, unrecognised references.

**Payroll** — payslips, pay periods, expected/actual gross, expected/actual take-home, basic/enhanced/overtime/unsocial/holiday hours, deductions, discrepancies.

**Adjustments** — missing hours, underpayments, overpayments, expected corrections, hours carried into the next payslip, partially/fully recovered pay, employer communication notes.

**Annual Leave** — separate balances per job (NHS, Relief Warden, Night Security, any future job). Several jobs appearing on one combined payslip must never combine their Annual Leave entitlement.

### Money

**Transactions** — every imported Monzo transaction with merchant, amount, date/time, Monzo category, Pay Tracker category, matched bill/income/savings movement, match confidence, manual label, notes.

**Bills and Debts** — expected payment, actual matched bank transaction, remaining budget, overdue payment, debt progress, fuel budget vs actual fuel spending.

**Savings and Pots** — current Pay Tracker pots, Monzo pots, deposits, withdrawals, transfers, interest, goal progress, source of each deposit, destination of each allocation.

### Planning and Analysis

Goals, Reports, Calendar, Settings.

## 4. Unified record structure

### Job record

Job ID, Job name, Employer, Payroll group, Staffline references, Calendar matching rules, Basic hourly rate, Enhancement rules, Taxable or non-taxable, Annual Leave enabled, Annual Leave accrual method, Annual Leave year start/end, Active status.

Suggested Job IDs: `JOB-NHS`, `JOB-RELIEF-WARDEN`, `JOB-NIGHT-SECURITY`, `JOB-LOGGING-CASH`.

Per the Phase 0 audit: seed this from the existing `Payroll/PayrollConfig.js` `EMPLOYERS` object and `Core/Config.js` `TABLES`, don't invent a third independent job list.

### Unified shift record

Shift ID, Job ID, Work date, Scheduled start/finish, Actual start/finish, Break duration, Paid/Basic/Enhanced/Overtime/Holiday hours, Source type, Calendar event ID, Staffline timetable ID, Staffline timesheet reference, Payslip ID, Reconciliation status, Manual override, Notes.

Supported source types: Google Calendar, Staffline timetable, Staffline timesheet, Payslip, Manual entry.

## 5. Annual Leave system

Track Annual Leave separately for every job. Even when NHS, Relief Warden and Night Security are all paid on one Staffline payslip: NHS-earned AL belongs to NHS, Relief Warden-earned AL belongs to Relief Warden, Night Security-earned AL belongs to Night Security. Taking leave from one job must not reduce another job's balance. The combined payslip may show a combined holiday-hours/holiday-pay total, but the internal Annual Leave ledger must allocate those hours to the correct job.

### Annual Leave Job Settings (new sheet)

AL Job Setting ID, Job ID, Job Name, Leave Year Start/End, Accrual Method, Accrual Rate, Opening Balance Hours, Basic Hourly Rate, Carryover Hours, Maximum Carryover, Rounding Method, Active, Notes, Created At, Updated At.

Supported accrual methods: percentage of eligible hours worked, fixed hours per week, fixed hours per month, contract entitlement, imported employer balance, manual calculation. Do not hardcode one accrual percentage for every job — it must be configurable per job/contract.

### Annual Leave Earnings (new sheet — ledger)

AL Earnings ID, Job ID, Work Week Start/End, Eligible Hours Worked, Accrual Rate, Hours Earned, Basic Hourly Rate, Estimated Value, Source Type, Source Shift IDs, Source Payslip ID, Calculation Status, Notes, Created At, Updated At.

Logging Cash should only earn Annual Leave if enabled in its Job Settings.

### Annual Leave Usage (new sheet — ledger)

AL Usage ID, Job ID, Leave Start/End, Hours Requested/Approved/Taken/Paid, Leave Status, Source Type, Gmail Message ID, Gmail Thread ID, Calendar Event ID, Payslip ID, Approval Confidence, Manual Review Status, Notes, Created At, Updated At.

Leave statuses: Requested, Approved, Rejected, Cancelled, Booked, Taken, Paid, Partially Paid, Needs Review.

### Annual Leave balances (computed, per job)

- **Accrued balance** = Opening balance + earned hours + manual adjustments − hours taken
- **Available-to-book balance** = Opening balance + earned hours + manual adjustments − approved future leave − hours taken
- **Outstanding holiday pay** = hours taken − hours confirmed as paid

"Taken" and "paid" are not the same event — track both.

### Allocation of combined payslip holiday lines

Allocation order: (1) Staffline timesheet reference → Job ID mapping (reuse `Payroll Timesheet Mappings`, per the audit), (2) match work/leave date, (3) match approved Annual Leave emails, (4) match Calendar leave events, (5) match basic hourly rate, (6) if still unclear, send to the Action Centre. Never guess the job when confidence is low.

## 6. Import Annual Leave already taken from Gmail

Reuse the `Payslip Email Rules` + `Payroll Scan History` pattern (per the audit, this shape is already proven).

### Annual Leave Email Rules (new sheet)

Rule ID, Job ID, Rule Name, Sender Contains/Equals, Subject Contains, Body Contains, Attachment Required, Priority, Active, Created At, Updated At.

Search terms to support: annual leave, AL, holiday request, holiday approved, leave approved, leave confirmation, time off, absence request, leave cancelled, holiday cancelled, rota change, leave balance. Rules configurable per employer/job.

### Gmail email processing

For every matched email: preserve Gmail Message ID + Thread ID, sender, subject, received date; extract job (sender/domain/subject/rule), leave start/end date, hours/days, request/approval/rejection/cancellation status; check attachments (PDF/document text, calendar invitations); create a review record if incomplete; prevent duplicate importing; link follow-up messages in the same thread; reverse/update leave on a cancellation email.

### Email confidence rules

- **High** (auto-import): known employer sender, recognised Job ID, explicit approved wording, exact dates/hours, no conflicting email in thread.
- **Medium**: known sender + dates, hours inferred from scheduled shift.
- **Low**: unknown sender, unclear job, missing dates, vague wording, multiple jobs possible.

Only high-confidence records import automatically. Medium/low go to the Action Centre.

### Historical Gmail import

Options: last 3 months, last 6 months, current leave year, previous leave year, custom range. Produces: messages checked, leave emails found, approved/cancelled leave found, records created, duplicates skipped, items needing review, errors — logged to a new `Annual Leave Email Scan History` sheet.

## 7. Staffline portal integration

### Preferred import order

1. Official Staffline export
2. Downloaded PDF
3. Downloaded CSV/spreadsheet
4. Staffline email notifications
5. Approved API
6. Browser-assisted automation only when no supported option exists

Never store Staffline passwords in Sheets or GitHub.

### Staffline timetable data (new sheet)

Staffline Record ID, Job ID, Shift date, Start/Finish time, Break, Scheduled hours, Status, Location, Department, Timesheet reference, Source file, Imported At, Last Updated At.

Statuses: Scheduled, Confirmed, Submitted, Approved, Rejected, Changed, Cancelled.

### Three-way reconciliation

Compare Google Calendar ↔ Staffline timetable/timesheet ↔ payslip. Possible results: fully matched, calendar missing, Staffline missing, payslip missing, hours differ, start/finish differs, enhancement missing, wrong job classification, wrong pay period, duplicate shift, manual review required.

## 8. Missing-hours and pay-adjustment ledger

### Pay Adjustments (new sheet)

Adjustment ID, Job ID, Original Shift ID, Original Pay Period, Original Payslip ID, Adjustment Type, Missing Hours, Missing Amount, Expected Rate, Expected Pay Category, Reported Date, Expected Recovery Pay Period, Expected Recovery Payslip, Recovered Hours, Recovered Amount, Adjustment Status, Previous Discrepancy Status, Notes, Created At, Updated At.

Adjustment types: missing basic/enhanced/overtime/unsocial/holiday hours, incorrect rate, incorrect deduction, overpayment, manual correction.

Statuses: Identified, Needs Review, Reported, Expected Next Payslip, Partially Recovered, Recovered, Rejected, Written Off.

### Carry-forward behaviour

1. Preserve the original discrepancy.
2. Mark the old discrepancy as explained.
3. Remove it from the active unresolved warning count.
4. Add the missing hours to the next payslip's expected adjustment total.
5. Compare the next payslip against the carried adjustment.
6. Mark the adjustment recovered when found.
7. Keep the complete history.

Never delete or modify the original shift to hide the discrepancy.

## 9. Advanced Monzo integration

- Account data: current/available balance, account details, last successful sync, sync errors.
- Monzo pots: Pot ID, name, current balance, goal amount, created date, deleted status, last updated — already partly done (balance sync); extend to full pot metadata.
- Mapping between Monzo pot and Pay Tracker savings pot — already done.

### Money Movements (new sheet — ledger)

Movement ID, Date, Movement Type, Source Account, Source Pot, Destination Account, Destination Pot, Amount, Related Transaction ID, Related Payslip ID, Related Savings Contribution ID, Internal Transfer, Notes, Created At.

Movement types: salary income, other income, savings allocation, pot deposit/withdrawal, bill payment, debt payment, refund, transfer, interest, manual adjustment. Internal transfers must not be counted as spending.

## 10. Transaction classification and bill matching

Every Monzo transaction supports: automatic category, suggested category, manual category, match confidence, matched bill/debt/subscription/savings-contribution/income, manual notes.

### Fuel example

Weekly fuel budget £100; Monzo records BP £42, Tesco Fuel £38, GO £15 → fuel spending £95, remaining £5. Transactions should contribute to the related fuel budget record.

### Transaction Matching Rules (new sheet)

Rule ID, Rule Name, Merchant Contains, Description Contains, Monzo Category, Amount Minimum/Maximum, Direction, Pay Tracker Category, Finance Type, Finance ID, Job ID, Auto Confirm, Priority, Active, Notes. Rules should learn from confirmed manual classifications.

## 11. Reporting and diagrams

**Work and pay:** hours by job, basic vs enhanced, overtime by job, holiday hours by job, Staffline-vs-Calendar accuracy, Staffline-vs-payslip accuracy, missing pay, recovered pay, predicted vs actual gross/take-home.

**Annual Leave:** earned/taken/booked/paid/remaining by job, AL value at basic pay, accrual trend, leave-year carryover risk.

**Money:** earnings by employer, salary deposits matched to payslips, spending by category, fuel budget vs actual, bills expected vs paid, savings allocated, Monzo pot inflows/outflows, monthly cash flow, disposable income, unclassified transactions.

**Reconciliation:** % shifts fully matched, % payslips matched, unresolved discrepancies, recovered adjustments, unclassified Staffline references, unclassified Monzo transactions.

## 12. Phase roadmap

See `docs/Roadmap.md` for the phase list and branch names. Definitions of done for each phase:

- **Phase 0** — complete repository inventory; no unknown active branches; README reflects reality; current deployment version documented.
- **Phase 1** — every unresolved item can appear in one Action Centre; every record links to its original source; manual decisions are preserved.
- **Phase 2** — navigation follows the work-to-money flow; no existing workspace becomes inaccessible; mobile navigation usable.
- **Phase 3** — a Staffline shift can be traced through Calendar and payslip; differences clearly displayed; duplicate imports blocked.
- **Phase 4** — user can see exactly how many AL hours are available per job; combined payslip totals do not merge job balances; every AL balance auditable back to shifts/emails/payslips.
- **Phase 5** — previously approved leave importable from Gmail; assigned to the correct job; cancellations reverse/update records; low-confidence emails require confirmation.
- **Phase 6** — missing hours followed until paid; old weeks no longer falsely unresolved; recovered pay visible in analytics.
- **Phase 7** — user can see where payday money went; pot balances/movements traceable; income/spending/transfers correctly separated.
- **Phase 8** — actual bank spending updates financial records; fuel and other categories show budget vs actual; no double-counting.
- **Phase 9** — every chart based on traceable ledger data; filterable by job and date; unclear data visibly excluded/labelled.
- **Phase 10** — all major workflows pass end-to-end testing; no destructive migration possible; deployment matches `main`; production release tagged.

## 13. Recommended implementation order

1. Repository audit
2. Unified Job and Action Centre model
3. Navigation redesign
4. Staffline timetable import
5. Annual Leave engine
6. Gmail Annual Leave import
7. Pay adjustment ledger
8. Monzo pots and money ledger
9. Transaction matching
10. Analytics
11. Production hardening

Annual Leave must not be implemented before the Job Registry exists — every earned or used leave record must belong to one exact job.
