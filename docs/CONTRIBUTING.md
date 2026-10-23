# Development Guide

## Rules

Always develop one module at a time.

Never partially replace files.

Always preserve existing data.

Never break backwards compatibility.

Every change must be committed to Git.

Every completed feature should be tested before pushing to Apps Script.

---

## Promoting a release to production (checklist)

Production promotion is always a deliberate, human step. Nothing in an automated session deploys.

1. **Know what is live.** Open the Apps Script editor, **Deploy > Manage deployments**, and note the version of the production
   deployment. Compare it with the last promotion recorded in `docs/VERSION.md`. Merged PRs after that record are NOT live.
2. **Run the offline suite** on the commit you intend to promote: `node Tests/node/run-all.cjs` must pass.
3. **Test in an isolated deployment first** (a separate test deployment on the same spreadsheet, as for v3.1.0 and v3.2.0), never
   directly on production. Run `runAllPayTrackerTests()` there (it writes test rows to the sheets it touches).
4. **Read-only checks against real data**, in the editor: `diagnoseCalendarAccess()` must report every configured calendar
   accessible, and `reviewUnrecognisedCalendarEvents()` lists events that look like shifts but were not recognised.
   Neither changes anything. Fix titles in Google Calendar or add shifts by hand; do not widen the classifier to guess.
5. **Create a version and move the existing production deployment to it** (same deployment ID, same URL): `clasp version "<notes>"`
   then `clasp deploy -i <production deployment ID> -V <new version>`. Record the version, commit and date in `docs/VERSION.md`.
6. **Smoke test production**: open the app, confirm a clean start-up and a normal Calendar sync result.
7. **Rollback**: `clasp deploy -i <production deployment ID> -V <previous version>`. The previous version stays in the version
   list, so rollback never needs a rebuild.

## Local tests (no Google access)

Most of the logic can be tested without Apps Script. From the repository root:

    node Tests/node/run-all.cjs

This loads the real `Backend/*.js` files into a Node sandbox with in-memory sheets, runs every offline-safe
`run<Domain>Tests()` suite, then the end-to-end scenarios in `Tests/node/*_Scenarios.cjs`. It cannot reach
Google, a real spreadsheet or the network, so it is safe anywhere. `runStafflineReconciliationTests` is not
included because it needs the seeded Jobs sheet; it still runs in `runAllPayTrackerTests()` in the editor.
The `.cjs` extension keeps `clasp push` from uploading these files.

## Workflow

Edit

↓

Test

↓

Git Commit

↓

Git Push

↓

clasp push

↓

Production Test

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
