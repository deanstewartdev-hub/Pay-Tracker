# Development Guide

## Rules

Always develop one module at a time.

Never partially replace files.

Always preserve existing data.

Never break backwards compatibility.

Every change must be committed to Git.

Every completed feature should be tested before pushing to Apps Script.

---

## Testing safety rules (apply to every step)

- **Automated tests run offline, against fixtures.** `node Tests/node/run-all.cjs` loads the code into a Node sandbox with in-memory sheets. It never opens a spreadsheet and never reaches Google.
- **Staging checks run only against the authorised staging project**, and only read-only: `runPayTrackerAcceptanceChecks()`.
- **Do not run any test suite that creates or modifies financial records in production.** Earlier `run*Tests()` and `runAllPayTrackerTests()` functions write rows to the sheets they touch. They are not part of the release bundle (`Tests/` is excluded by `.claspignore`) and must never be run against production.
- **Do not copy test data or staging records into production.**

---

## Promoting a release to production (checklist)

Production promotion is always a deliberate, human step. Nothing in an automated session deploys, and nothing here may be run before the owner has approved the release.

1. **Know what is live.** Open the Apps Script editor, **Deploy > Manage deployments**, and record the **current production version** and deployment ID. Compare it with the last promotion recorded in `docs/VERSION.md`. Merged PRs after that record are NOT live.
2. **Run the offline suite** on the commit to be promoted, in both time zones:
   `TZ=Europe/London node Tests/node/run-all.cjs` and `TZ=UTC node Tests/node/run-all.cjs`. Both must pass.
3. **Confirm the bundle:** `node tools/staging-push.cjs <staging Script ID>` (dry run) must list no `Tests/` files and no diagnostics. Never run it with the production Script ID; the tool refuses it.
4. **Back up production before deployment.** In the production spreadsheet use **File > Make a copy**, store the copy outside the live sheet, and record its name and date in `docs/VERSION.md`. Do not copy staging records into production.
5. **Read-only checks on staging** (authorised staging project only): `runPayTrackerAcceptanceChecks()` must report 0 FAIL. Record the result.
6. **Read-only checks on production, before deploying:** `diagnoseCalendarAccess()` should report every configured calendar accessible, and `reviewUnrecognisedCalendarEvents()` lists events that look like shifts but were not recognised. Neither changes anything. Fix titles in Google Calendar or add shifts by hand; do not widen the classifier to guess.
7. **Record the rollback target:** the current production version number (from step 1) is the version to roll back to.
8. **Create a version and move the existing production deployment to it** (same deployment ID, same URL):
   `clasp version "<notes>"`, then
   `clasp deploy --deploymentId <production deployment ID> --versionNumber <new version> --description "<notes>"`.
   Record the version, commit, date and backup reference in `docs/VERSION.md`.
9. **Read-only smoke test of production:** the app opens, the Dashboard loads, the footer reads "Server connected", and no sync starts automatically. Do not press any sync or write action during the smoke test.
10. **Rollback:** `clasp deploy --deploymentId <production deployment ID> --versionNumber <previous version>`.
    **Rollback changes which code runs. It does not reverse spreadsheet data changes.** v3.3 adds no columns and no schema changes, so redeploying the previous version is enough for v3.3. If a data change has happened, restore from the backup in step 4, and only with the owner's approval.

---

## Local tests (no Google access)

Most of the logic can be tested without Apps Script. From the repository root:

    node Tests/node/run-all.cjs

This loads the real `Backend/*.js` files into a Node sandbox with in-memory sheets, runs the offline suites and the end-to-end scenarios in `Tests/node/*_Scenarios.cjs`. It cannot reach Google, a real spreadsheet or the network, so it is safe anywhere. Run it in both time zones (`TZ=Europe/London` and `TZ=UTC`).

The `Tests/` folder is development-only. It is excluded from the Apps Script bundle by `.claspignore`, so the Apps Script editor does not contain these tests.

## Workflow

Edit

↓

Test (offline, both time zones)

↓

Git Commit

↓

Git Push

↓

clasp push to staging only

↓

Staging acceptance (read-only)

---

## Coding Standards

- Modular
- Small functions
- No duplicated code
- Strong validation
- Error handling
- Logging
- Versioned

---

## Known Pitfalls

### HtmlService bare-comparison escaping

A bare `<`, `>`, `<=`, or `>=` comparison operator sitting in raw `.html` frontend file text (`Frontend/**/*.html`, included via `includePayTrackerHtml()`) — outside a recognisable HTML tag shape — can be silently HTML-entity-escaped by `HtmlService.createTemplateFromFile(...).evaluate()` (e.g. `<=` becomes `&lt;=`), producing invalid JS that kills the entire containing `<script>` block with no visible error in the browser (the deployed web app renders in a sandboxed cross-origin iframe that most browser-devtools access can't reach).

This has recurred at least four times across this project's history (the pre-v3 Reports tab; `ActionCentreService.html` and `MoneyMovementsService.html` during the v3 build; `AppController.html`'s relative-time helpers during v3.2.0's startup screen work, where it silently killed the whole Unified Sync Engine startup call). It is a recurring platform pitfall, not a one-off bug — any new `.html` file under `Frontend/` is at risk regardless of how careful the surrounding code looks.

**How to avoid it**: never write a bare `<`/`>`/`<=`/`>=` comparison in a `.html` file's script content. Use `Math.sign(x) === -1/0/1`, `Math.max`/`Math.min`, or restructure the comparison instead (e.g. `Math.sign(value - 60) === -1` instead of `value < 60`). Prefer DOM construction (`document.createElement`/`.textContent`/`.append`) over string-concatenated `innerHTML` for dynamic content.

**How to check**: after writing or editing any frontend `.html` file, grep it with pattern `[a-zA-Z0-9_\)\]]\s*[<>]=?\s*[a-zA-Z0-9_\(]` before considering the file done. A match inside genuine HTML markup (e.g. `<h3>Text</h3>`) or a JSDoc type (`Promise<void>`) is a false positive and fine; a match inside a `<script>` block's live JS logic is the real risk. If the app stops calling a server function that a recent `.html` edit should have wired up, and the Apps Script executions log shows that function was never invoked at all, suspect this before anything else.
