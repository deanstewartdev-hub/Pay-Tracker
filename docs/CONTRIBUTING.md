# Development Guide

## Rules

Always develop one module at a time.

Never partially replace files.

Always preserve existing data.

Never break backwards compatibility.

Every change must be committed to Git.

Every completed feature should be tested before pushing to Apps Script.

---

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
