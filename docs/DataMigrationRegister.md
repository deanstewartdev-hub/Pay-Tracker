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
