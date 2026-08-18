# Database

The Google Sheet currently acts as the database. Every sheet name below is centrally defined in a `*Config.js` `SHEETS` object — see `docs/v3-phase0-audit.md` §3 for the full audit this list is based on.

## Pay / Calendar

- PaySheet

## Finance (bills, debts, payments)

- Bills
- Debts
- Finance Payments
- Payment History
- Finance Dashboard

## Finance Integration (Monzo / bank)

- Bank Connections
- Bank Transactions
- Subscriptions
- Subscription Transactions
- Bank Sync History

## Savings

- Savings Settings
- Savings Pots (incl. Monzo Pot linkage columns)
- Savings Contributions
- Savings History
- Life Goals

## Payroll / Staffline

- Payroll Groups
- Payroll Group Employers
- Payslip Register
- Payslip Email Rules
- Payroll Scan History
- Payroll Timesheet Mappings

## v3 reconciliation foundation sheets

- `Jobs` — canonical per-job registry linked to existing employer and payroll-group keys.
- `Action Centre` — unresolved, source-linked items requiring manual review.
- `Action Centre History` — append-only audit trail of status and manual decisions.

## Future sheets (v3 roadmap — not yet built)

- Annual Leave Job Settings / Annual Leave Earnings / Annual Leave Usage / Annual Leave Email Rules / Annual Leave Email Scan History
- Staffline Timetable (actual scheduled shifts — does not exist yet; `Payroll Timesheet Mappings` is a reference lookup, not schedule data)
- Pay Adjustments
- Money Movements
- Transaction Matching Rules

## Future sheets (older roadmap, not yet prioritised)

- Investments
- Mortgage
- Vehicles
- Net Worth
