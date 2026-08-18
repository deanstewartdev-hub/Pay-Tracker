# Pay Tracker

## Overview

Pay Tracker is a production-quality Google Apps Script application designed to automate personal financial management.

The project has evolved beyond a simple paysheet into a full personal employment, payroll and financial reconciliation platform, connecting Calendar shifts, Staffline payslips, Monzo banking and financial planning in one Apps Script web app:

- NHS, Relief Warden, Night Security and Logging Cash earnings
- Google Calendar integration
- Payroll Centre — Gmail/manual payslip import, PDF parsing, predicted-vs-actual comparison
- Monzo bank connection — transactions, subscriptions, savings-pot balance sync, bill/debt matching
- Finance (bills, debts, payments)
- Savings and Life Goals
- Reports

The Google Sheet acts as the database, Google Apps Script provides the backend business logic, and a standalone Apps Script web app (`Frontend/`) is the primary interface — see `docs/Architecture.md`.

The v3 roadmap (`docs/Roadmap.md`, detail in `docs/v3-Roadmap-Detail.md`) is the current active development plan: a unified Job Registry and Action Centre, Staffline schedule reconciliation, a per-job Annual Leave engine, and a pay-adjustment recovery ledger.

---

## Current Version

Pay Tracker v3.0 — Phase 1 adds the unified Job Registry and Action Centre.

---

## Current Features

### Reconciliation Foundation

- Unified Jobs registry seeded from the four existing employer/pay definitions
- Action Centre for source-linked manual review items
- Append-only decision history so manual corrections remain auditable

Run `setupPayTrackerReconciliationFoundation()` once after deployment; it is safe to run repeatedly. Safe schema/config checks are available through `runReconciliationFoundationTests()`.

### Pay Tracking

- NHS, Relief Warden, Night Security, Logging Cash shifts
- Weekly calculations, estimated deductions, running totals
- Calendar import, automatic week creation

### Payroll Centre

- Gmail and manual-PDF payslip import
- PDF parsing into structured pay fields
- Predicted-vs-actual comparison with configurable discrepancy thresholds
- Multi-employer combined-payslip grouping

### Finance Module

- Bills, debts, payment tracking, payment history, undo payments

### Finance Integration (Monzo)

- Bank connection with automatic token refresh
- Transaction import and subscription detection
- Bank transaction → Bills/Debts payment matching (confidence-scored, manual confirm/reject)

### Savings Module

- Savings pots (with optional Monzo Pot balance linkage), goal tracking, interest forecasting, contribution queue, savings history, life goals

### Reports, Calendar, Settings

- Reporting workspace, calendar workspace, app settings

See `docs/Database.md` for the full sheet inventory and `docs/v3-phase0-audit.md` for a detailed audit of what exists today.

---

## Planned Features (v3)

See `docs/Roadmap.md` and `docs/v3-Roadmap-Detail.md` for the full plan: Action Centre, Staffline schedule import and three-way reconciliation, per-job Annual Leave engine, Gmail Annual Leave import, pay-adjustment recovery ledger, deeper Monzo/money-movement tracking, transaction matching rules, and expanded analytics.

---

## Technology

- Google Apps Script
- Google Sheets
- JavaScript
- Git
- GitHub
- VS Code
- clasp

---

## Development Workflow

Apps Script

↓

VS Code

↓

Git Commit

↓

GitHub

↓

clasp push

↓

Google Apps Script

---

## Repository Structure

Core

Pay

Finance

Savings

Calendar

Backup

Setup

Documentation

---

## Author

Dean Stewart
