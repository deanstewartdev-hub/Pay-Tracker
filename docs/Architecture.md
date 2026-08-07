# Architecture

## Overview

Pay Tracker uses a modular service-based architecture.

The spreadsheet acts as the persistent data store.

Apps Script contains all business logic.

Each module owns its own functionality.

Modules communicate through public service methods rather than directly manipulating each other's data.

---

## Modules

Core

Responsible for:

- Configuration
- Utilities
- Main entry points
- Menus

---

Pay

Responsible for:

- Week creation
- Gross pay
- Tax estimates
- Weekly summaries
- Calendar integration

---

Finance

Responsible for:

- Bills
- Debt
- Payments
- Dashboard

---

Savings

Responsible for:

- Savings pots
- Contributions
- Interest
- Goals
- Forecasting

---

Backup

Responsible for:

Automatic backups.

---

Setup

Responsible for:

Building and upgrading sheets.

---

Finance Integration

Responsible for:

- Monzo OAuth connection and token refresh
- Bank transaction import
- Subscription detection
- Bank transaction → Bills/Debts matching
- Savings Pot ↔ Monzo Pot balance sync

---

Payroll

Responsible for:

- Gmail and manual payslip import
- PDF parsing
- Predicted-vs-actual payslip comparison
- Payroll groups (multi-employer combined payslips)
- Staffline timesheet-reference mapping

---

Web / Frontend

Responsible for:

- `Frontend/Web/WebApp.js` — `doGet` entry point, HTML templating, authorization handling
- One `Backend/Web/*WorkspaceService.js` RPC layer per page (Dashboard, Pay, Finance, Savings, Goals, Reports, Calendar, Settings)
- `Frontend/App/` — client-side routing between workspace pages
- `Frontend/Pages/` + `Frontend/Services/*WorkspaceService.html` — one page + one service file per workspace, communicating via `google.script.run`

The "Future Architecture" below (Standalone Web Application) has already shipped as the Apps Script web app described above — see `docs/v3-phase0-audit.md`.

---

Current live architecture

Google Sheets (source of truth)

↓

Apps Script backend services (Core, Pay, Finance, Finance Integration, Savings, Payroll)

↓

Backend/Web RPC layer (`google.script.run`)

↓

Apps Script-hosted single-page web app (`Frontend/`)

---

v3 direction (see `Roadmap.md`)

Add a unified Job Registry and Action Centre layer across all of the above, then extend into Staffline scheduling, Annual Leave, pay adjustments, and deeper Monzo/reconciliation — without replacing any of the modules above.
