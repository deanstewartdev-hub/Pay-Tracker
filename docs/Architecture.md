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

Future Architecture

Google Sheets

↓

Apps Script API

↓

Standalone Web Application

↓

Desktop

↓

Mobile
