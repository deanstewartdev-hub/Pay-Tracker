# Data Migration Register

An append-only log of every schema change made to an existing sheet (new columns, renamed headers, backfills). Add one entry per migration, oldest first. Never edit or remove a past entry — if a migration is reverted or corrected, add a new entry saying so.

Every entry must confirm the migration is safe to run repeatedly and does not clear or destroy existing rows (rule 6/7 of the v3 roadmap).

---

## Format

```
### YYYY-MM-DD — <sheet name> — <short description>

- **Change:** what columns/headers were added, renamed, or backfilled.
- **Safety mechanism:** how re-running this is a no-op (e.g. `ensureSheetColumns` width guard, header-name check).
- **Data preserved:** confirmation existing rows/columns were not cleared.
- **Related PR:** link or branch name.
```

---

### 2026-08-06 — Savings Pots — add Monzo Pot linkage columns

- **Change:** added `Linked Monzo Pot ID` (column 27) and `Linked Monzo Pot Name` (column 28) to the existing 26-column `Savings Pots` sheet.
- **Safety mechanism:** `PayTrackerFinanceService.ensureSheetColumns(sheet, config.HEADERS.length)` guard added at every full-width read/write call site across `SavingsService.js`, `SavingsDashboardService.js`, `SavingsContributionService.js`, `LifeGoalsServic.js` — widens the sheet to 28 columns on first use without touching existing data, and is a no-op on subsequent runs.
- **Data preserved:** confirmed — existing pot rows and their first 26 columns are untouched; new columns are blank until a pot is explicitly linked.
- **Related PR:** [#12](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/12) "Link Savings Pots to Monzo Pots for automatic balance sync".

### 2026-08-06 — Bank Transactions — add matching columns

- **Change:** added `Matched Finance Type`, `Matched Finance ID`, `Match Confidence`, `Match Status`, `Match Reason` columns (documented as a `COLUMNS` map in `FinanceIntegrationConfig.js`, matching the existing positional `appendRow` order in `MonzoService.storeTransactions`).
- **Safety mechanism:** columns were part of the original `appendRow` shape used since the sheet's creation — this migration documented the existing positions in config rather than changing the sheet layout, so it carries no runtime risk.
- **Data preserved:** yes — no structural change to existing rows.
- **Related PR:** [#13](https://github.com/deanstewartdev-hub/Pay-Tracker/pull/13) "Match bank transactions to Bills/Debts payments".

### 2026-08-19 — Jobs and Action Centre — v3 reconciliation foundation

- **Change:** added three new sheets: `Jobs`, `Action Centre`, and `Action Centre History`; seeded four stable Job IDs linked to the existing employer and payroll-group keys.
- **Safety mechanism:** `setupPayTrackerReconciliationFoundation()` creates missing sheets, validates existing headers before writing, and seeds only missing Job IDs. Re-running it is a no-op for existing records.
- **Data preserved:** confirmed — no existing sheet is cleared, renamed, widened, or rewritten.
- **Related PR:** branch `agent/v3-reconciliation-foundation`.

### 2026-08-19 — Calendar Sync Records — durable Calendar ownership

- **Change:** added the `Calendar Sync Records` ledger containing Calendar event identity, PaySheet target, and the exact shift/hours/pay values written by synchronisation.
- **Safety mechanism:** the setup service creates the sheet only when absent and validates every existing header before writing. Event records are upserted by stable sync key; no existing PaySheet schema is changed.
- **Data preserved:** Calendar removals clear only shift/hours/pay values that still exactly match the ledger snapshot. Any manual difference is preserved and sent to the Action Centre.
- **Related PR:** branch `agent/v3-reconciliation-foundation`.
