/*******************************************************
 * PAY TRACKER V3.2
 * Unified Sync Engine -- orchestrates every registered task:
 * checks freshness, runs what's due (in dependency order),
 * persists the result of every attempt, and returns a summary
 * the frontend startup screen renders real progress from.
 *
 * SYNC vs LOAD (the architectural rule this whole engine exists
 * to enforce): this service only ever calls a task's SYNC
 * function (import/update external data). It never calls a
 * workspace's own load() -- pages read the now-fresh Sheets data
 * themselves, exactly as they always have. See
 * docs/v3.2-unified-sync-audit.md for why PR #26's route-scoped
 * loading must not be reverted by this engine.
 *
 * Every task runner below wraps a real, already-proven function
 * cited in docs/v3.2-unified-sync-audit.md -- nothing here
 * reimplements Calendar/Gmail/Monzo import logic, it only
 * orchestrates when those existing functions run and maps their
 * real return values onto one common status shape. The
 * status/message mapping for each source is a separate, pure
 * function (mapCalendarResult_, mapGmailScanResult_, etc.) so it
 * can be unit tested with synthetic inputs -- the engine itself
 * never needs to make a live Calendar/Gmail/Monzo call to be
 * tested, matching how every other test suite in this codebase
 * already avoids live external calls.
 *******************************************************/

const PayTrackerSyncService = Object.freeze({
  /**
   * Runs one full pass: for every enabled task eligible for
   * `triggerSource`, checks freshness (unless `force`), runs
   * whatever is due in dependency order, persists each attempt's
   * result, and returns the aggregate.
   *
   * @param {Object} options {triggerSource, force, taskIds,
   *   budgetMilliseconds, now}
   * @return {Object} {runId, triggerSource, startedAt,
   *   completedAt, durationMs, tasks: [...], summary}
   */
  run: function(options) {
    const opts = options || {};
    const triggerSource = opts.triggerSource || PayTrackerSyncConfig.TRIGGER_SOURCES.MANUAL;
    const runId = 'SYNCRUN-' + Utilities.getUuid().toUpperCase();
    const startedAt = opts.now || new Date();
    const budgetMs = opts.budgetMilliseconds || 0;
    const deadline = budgetMs > 0 ? startedAt.getTime() + budgetMs : 0;

    const requestedIds = Array.isArray(opts.taskIds) && opts.taskIds.length
      ? opts.taskIds : null;

    const eligibilityField = triggerSource === PayTrackerSyncConfig.TRIGGER_SOURCES.SCHEDULED
      ? 'scheduledEligible' : 'startupEligible';

    const candidates = PayTrackerSyncConfig.TASKS.filter(function(task) {
      if (!task.enabled) return false;
      if (requestedIds && requestedIds.indexOf(task.id) === -1) return false;
      if (triggerSource === PayTrackerSyncConfig.TRIGGER_SOURCES.MANUAL) return true;
      return Boolean(task[eligibilityField]);
    });

    const ordered = PayTrackerSyncService.orderByDependencies_(candidates);
    const attempted = {};
    const results = [];

    ordered.forEach(function(task) {
      if (deadline && Date.now() >= deadline) {
        results.push(PayTrackerSyncService.buildResult_(task, {
          status: PayTrackerSyncConfig.TASK_STATUSES.SKIPPED,
          message: 'Skipped -- scheduled run budget exhausted before this task started.'
        }, 0, runId, triggerSource));
        return;
      }

      const dependenciesOk = task.dependencies.every(function(depId) {
        return attempted[depId] !== 'failed';
      });
      if (!dependenciesOk) {
        const result = PayTrackerSyncService.buildResult_(task, {
          status: PayTrackerSyncConfig.TASK_STATUSES.SKIPPED,
          message: 'Skipped -- a dependency (' + task.dependencies.join(', ') + ') failed this run.'
        }, 0, runId, triggerSource);
        results.push(result);
        attempted[task.id] = 'failed';
        PayTrackerSyncStateRepository.recordResult(PayTrackerSyncService.toRecord_(result));
        return;
      }

      const freshness = opts.force ? { fresh: false } : PayTrackerSyncService.computeFreshness(task.id, opts.now);
      let result;

      if (freshness.fresh) {
        result = PayTrackerSyncService.buildResult_(task, {
          status: PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT,
          message: 'Already current (' + freshness.ageMinutes + 'm old, TTL ' + task.freshnessTtlMinutes + 'm).'
        }, 0, runId, triggerSource);
        attempted[task.id] = 'success';
      } else {
        const taskStart = Date.now();
        let outcome;
        try {
          outcome = PayTrackerSyncService.RUNNERS[task.id]
            ? PayTrackerSyncService.RUNNERS[task.id](task)
            : { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'No runner registered for this task.' };
        } catch (error) {
          outcome = {
            status: PayTrackerSyncConfig.TASK_STATUSES.FAILED,
            message: 'Sync failed.',
            error: error && error.message ? error.message : String(error)
          };
        }
        const durationMs = Date.now() - taskStart;
        result = PayTrackerSyncService.buildResult_(task, outcome, durationMs, runId, triggerSource);
        attempted[task.id] = (result.status === PayTrackerSyncConfig.TASK_STATUSES.FAILED) ? 'failed' : 'success';
      }

      results.push(result);
      PayTrackerSyncStateRepository.recordResult(PayTrackerSyncService.toRecord_(result));
    });

    const completedAt = new Date();
    return {
      runId: runId,
      triggerSource: triggerSource,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      tasks: results,
      summary: PayTrackerSyncService.summarize_(results)
    };
  },

  /**
   * @return {Object} {fresh, ageMinutes, lastSuccess}
   */
  computeFreshness: function(taskId, now) {
    const task = PayTrackerSyncConfig.getTask(taskId);
    if (!task) return { fresh: false, ageMinutes: null, lastSuccess: null };
    if (task.freshnessTtlMinutes <= 0) return { fresh: false, ageMinutes: null, lastSuccess: null };

    const record = PayTrackerSyncStateRepository.getByTaskId(taskId);
    if (!record || !record.lastSuccess) return { fresh: false, ageMinutes: null, lastSuccess: null };

    const lastSuccess = record.lastSuccess instanceof Date ? record.lastSuccess : new Date(record.lastSuccess);
    if (Number.isNaN(lastSuccess.getTime())) return { fresh: false, ageMinutes: null, lastSuccess: null };

    const reference = now || new Date();
    const ageMinutes = (reference.getTime() - lastSuccess.getTime()) / 60000;
    return {
      fresh: ageMinutes >= 0 && ageMinutes < task.freshnessTtlMinutes,
      ageMinutes: Math.round(ageMinutes),
      lastSuccess: lastSuccess
    };
  },

  /**
   * Topological sort by `dependencies`. Throws on a cycle rather
   * than silently picking an order -- a cycle is a config bug,
   * not something to guess through.
   */
  orderByDependencies_: function(tasks) {
    const byId = {};
    tasks.forEach(function(task) { byId[task.id] = task; });
    const ordered = [];
    const visited = {};
    const visiting = {};

    function visit(task) {
      if (visited[task.id]) return;
      if (visiting[task.id]) {
        throw new Error('Sync task dependency cycle detected at: ' + task.id);
      }
      visiting[task.id] = true;
      task.dependencies.forEach(function(depId) {
        if (byId[depId]) visit(byId[depId]);
      });
      visiting[task.id] = false;
      visited[task.id] = true;
      ordered.push(task);
    }

    tasks.forEach(visit);
    return ordered;
  },

  buildResult_: function(task, outcome, durationMs, runId, triggerSource) {
    return {
      taskId: task.id,
      taskName: task.name,
      status: outcome.status || PayTrackerSyncConfig.TASK_STATUSES.FAILED,
      durationMs: durationMs,
      runId: runId,
      triggerSource: triggerSource,
      created: outcome.created,
      updated: outcome.updated,
      skipped: outcome.skipped,
      message: outcome.message || '',
      error: outcome.error || ''
    };
  },

  toRecord_: function(result) {
    return result;
  },

  summarize_: function(results) {
    const summary = {
      totalTasks: results.length,
      updated: 0, alreadyCurrent: 0, skipped: 0, failed: 0, manual: 0, unavailable: 0,
      criticalFailure: false,
      needsAttention: []
    };
    results.forEach(function(result) {
      const task = PayTrackerSyncConfig.getTask(result.taskId);
      switch (result.status) {
        case PayTrackerSyncConfig.TASK_STATUSES.UPDATED: summary.updated++; break;
        case PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT: summary.alreadyCurrent++; break;
        case PayTrackerSyncConfig.TASK_STATUSES.SKIPPED: summary.skipped++; break;
        case PayTrackerSyncConfig.TASK_STATUSES.FAILED:
          summary.failed++;
          summary.needsAttention.push(result.taskId);
          if (task && task.critical) summary.criticalFailure = true;
          break;
        case PayTrackerSyncConfig.TASK_STATUSES.MANUAL: summary.manual++; break;
        default: summary.unavailable++;
      }
    });
    return summary;
  },

  /**
   * How many days back a Gmail-based scan looks each time the
   * engine runs it. Each source's own default (365 days via
   * PayTrackerPayslipImportService.normalizeScanOptions, shared by
   * Staffline/Payslip/Annual Leave) is a sensible one-off backfill
   * default for a human running a manual scan, but far too wide for
   * a routine 6-hourly automated check -- every dedup-safe function
   * would still have to read and skip hundreds of already-seen
   * messages every run. 7 days gives generous overlap against the
   * 360-minute freshness TTL these tasks use (see SyncConfig.js)
   * even if a run or two is missed, without re-scanning a year of
   * mail on every pass.
   */
  GMAIL_SCAN_LOOKBACK_DAYS: 7,

  /**
   * Pure result -> engine-shape mappers, deliberately separated
   * from the RUNNERS below that make the real external call. Every
   * existing test suite in this codebase (including Calendar's own)
   * avoids invoking live Calendar/Gmail/Monzo calls from the
   * automated runAllPayTrackerTests() suite -- only pure logic is
   * unit tested, exactly as CalendarReconciliation_Tests.js does
   * for classifyEvent(). Splitting the mapping out this way lets
   * Tests/UnifiedSync_Tests.js exercise every status/message branch
   * below with synthetic inputs, with zero live network calls.
   */
  mapCalendarResult_: function(result) {
    const changed = result.imported + result.updated + result.adopted + result.removed;
    return {
      status: changed > 0
        ? PayTrackerSyncConfig.TASK_STATUSES.UPDATED
        : PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT,
      created: result.imported,
      updated: result.updated + result.adopted,
      skipped: result.skipped,
      message: result.totalEvents + ' events checked, ' + result.imported + ' new, ' +
        result.reviewItems + ' review item(s), ' + result.ignored + ' not recognised.'
    };
  },

  /**
   * Shared by Staffline Gmail and Annual Leave Gmail -- both
   * PayTrackerStafflineGmailImportService.scanGmail and
   * PayTrackerAnnualLeaveGmailImportService.scanGmail return the
   * identical {success, recordsCreated, recordsUpdated,
   * messagesChecked, messagesMatched, needsReview, errors} shape
   * (both built on the same normalizeScanOptions/runScan
   * convention), so one mapper genuinely covers both rather than
   * two near-identical copies.
   */
  mapGmailScanResult_: function(result, sourceLabel) {
    if (!result.success) {
      return {
        status: PayTrackerSyncConfig.TASK_STATUSES.FAILED,
        message: sourceLabel + ' Gmail scan did not complete.',
        error: (result.errors || []).join('; ')
      };
    }
    const changed = result.recordsCreated + result.recordsUpdated;
    const hasErrors = (result.errors || []).length > 0;
    return {
      status: hasErrors
        ? PayTrackerSyncConfig.TASK_STATUSES.NEEDS_ATTENTION
        : (changed > 0 ? PayTrackerSyncConfig.TASK_STATUSES.UPDATED : PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT),
      created: result.recordsCreated,
      updated: result.recordsUpdated,
      skipped: result.messagesChecked - result.messagesMatched,
      message: result.messagesMatched + ' ' + sourceLabel + ' email(s) checked, ' + result.recordsCreated + ' new' +
        (result.needsReview ? ', ' + result.needsReview + ' needs review' : '') + '.',
      error: hasErrors ? result.errors.join('; ') : ''
    };
  },

  mapPayslipResult_: function(scan, processed) {
    if (!scan.success) {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.FAILED, message: 'Payslip Gmail scan did not complete.', error: (scan.errors || []).join('; ') };
    }
    const hasErrors = (scan.errors || []).length > 0 || processed.failed > 0;
    const changed = scan.payslipsImported + processed.completed;
    return {
      status: hasErrors
        ? PayTrackerSyncConfig.TASK_STATUSES.NEEDS_ATTENTION
        : (changed > 0 ? PayTrackerSyncConfig.TASK_STATUSES.UPDATED : PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT),
      created: scan.payslipsImported,
      updated: processed.completed,
      skipped: scan.messagesChecked - scan.messagesMatched,
      message: scan.messagesMatched + ' payslip email(s) checked, ' + scan.payslipsImported +
        ' new, ' + processed.completed + ' processed.',
      error: hasErrors ? [].concat(scan.errors || []).concat(
        processed.failed ? [processed.failed + ' payslip(s) failed processing'] : []
      ).join('; ') : ''
    };
  },

  mapMonzoTransactionsResult_: function(result) {
    return {
      status: result.imported > 0 || result.suggestions > 0 || result.paymentsMatched > 0
        ? PayTrackerSyncConfig.TASK_STATUSES.UPDATED
        : PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT,
      created: result.imported,
      updated: result.paymentsMatched,
      message: result.message
    };
  },

  mapMonzoPotsResult_: function(result) {
    return {
      status: result.potsUpdated > 0 ? PayTrackerSyncConfig.TASK_STATUSES.UPDATED : PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT,
      updated: result.potsUpdated,
      message: result.potsSeen + ' pot(s) seen, ' + result.potsUpdated + ' linked pot balance(s) updated.'
    };
  },

  /**
   * A function, not a static object literal -- a top-level object
   * literal inside this Object.freeze() would evaluate
   * PayTrackerSyncConfig.TASK_STATUSES.MANUAL at script-load time,
   * before every file is guaranteed loaded, which is exactly the
   * class of cross-file load-order bug this codebase's other
   * services avoid by only referencing another file's config from
   * inside a function body (called later, never at load time).
   */
  monzoNotConnectedResult_: function() {
    return {
      status: PayTrackerSyncConfig.TASK_STATUSES.MANUAL,
      message: 'Monzo is not connected. Connect it from Finance to enable automatic sync.'
    };
  },

  /**
   * taskId -> function(task) -> {status, created, updated,
   * skipped, message, error}. Each wraps a real, already-audited
   * function (see docs/v3.2-unified-sync-audit.md) in
   * PayTrackerUtils.withDocumentLock exactly as its own existing
   * callers already do (e.g. runAutomaticPayTrackerCalendarSync)
   * -- none of these source functions lock themselves, so the
   * caller always has. Nothing here rewrites the underlying import
   * logic; every call is to an existing, proven, unchanged function.
   */
  RUNNERS: {
    CALENDAR: function() {
      const result = PayTrackerUtils.withDocumentLock(function() {
        return PayTrackerCalendarService.sync();
      });
      return PayTrackerSyncService.mapCalendarResult_(result);
    },

    STAFFLINE_GMAIL: function() {
      const result = PayTrackerUtils.withDocumentLock(function() {
        return PayTrackerStafflineGmailImportService.scanGmail({
          lookbackDays: PayTrackerSyncService.GMAIL_SCAN_LOOKBACK_DAYS
        });
      });
      return PayTrackerSyncService.mapGmailScanResult_(result, 'Staffline approval');
    },

    PAYSLIP_GMAIL: function() {
      const result = PayTrackerUtils.withDocumentLock(function() {
        const scan = PayTrackerPayslipImportService.scanGmail({
          lookbackDays: PayTrackerSyncService.GMAIL_SCAN_LOOKBACK_DAYS
        });
        // Auditing this (docs/v3.2-unified-sync-audit.md, finding #8)
        // found scanning and processing were never wired together --
        // processPayslip() overwrites by Payslip ID (no duplicate
        // rows) and is safe to re-run, so it's safe to chain here.
        // Small, capped batch: this only needs to catch up on
        // whatever THIS scan just found, not clear a large backlog
        // in one automated pass.
        const processed = PayTrackerPayrollPayslipProcessingService.processBatch({
          limit: 5, onlyUnprocessed: true
        });
        return { scan: scan, processed: processed };
      });
      return PayTrackerSyncService.mapPayslipResult_(result.scan, result.processed);
    },

    ANNUAL_LEAVE_GMAIL: function() {
      const result = PayTrackerUtils.withDocumentLock(function() {
        return PayTrackerAnnualLeaveGmailImportService.scanGmail({
          lookbackDays: PayTrackerSyncService.GMAIL_SCAN_LOOKBACK_DAYS
        });
      });
      return PayTrackerSyncService.mapGmailScanResult_(result, 'Annual Leave');
    },

    // Monzo's OAuth refresh has no headless path (audit finding #5)
    // -- if it isn't connected at all, that's a real, distinct
    // condition from a failure: report it as Manual (connect from
    // Finance), not Failed, so the startup screen doesn't read it as
    // a broken sync. If it IS connected but the refresh token has
    // since expired, PayTrackerMonzoService.sync() throws a real,
    // already-actionable message ("...Reconnect Monzo from Finance
    // to continue syncing.") which the engine's own try/catch in
    // run() surfaces as this task's error -- no special-casing
    // needed for that path.
    MONZO_TRANSACTIONS: function() {
      if (!PayTrackerMonzoService.hasAccessToken()) return PayTrackerSyncService.monzoNotConnectedResult_();
      const result = PayTrackerUtils.withDocumentLock(function() {
        return PayTrackerMonzoService.sync();
      });
      return PayTrackerSyncService.mapMonzoTransactionsResult_(result);
    },

    // Deliberately its own independent Monzo /pots call (not shared
    // with MONZO_TRANSACTIONS's sync(), which also refreshes pots as
    // a side effect) -- keeps each task correctly self-contained and
    // individually freshness-gated, and /pots is a light, cheap,
    // read-mostly endpoint, so the occasional overlap with a
    // Transactions run costs nothing meaningful. Never creates a
    // Savings Pot and never fabricates a transaction -- only
    // overwrites the live balance on pots the user has explicitly
    // linked (PayTrackerSavingsService.applyMonzoPotBalances).
    MONZO_POTS: function() {
      if (!PayTrackerMonzoService.hasAccessToken()) return PayTrackerSyncService.monzoNotConnectedResult_();
      const result = PayTrackerUtils.withDocumentLock(function() {
        const accessToken = PayTrackerMonzoService.getAccessToken();
        const accounts = (PayTrackerMonzoService.request('/accounts', {}, accessToken).accounts) || [];
        if (!accounts.length) throw new Error('Monzo did not return an available account.');
        const pots = PayTrackerMonzoService.fetchPots(accounts[0].id, accessToken);
        const potsUpdated = PayTrackerSavingsService.applyMonzoPotBalances(pots);
        return { potsUpdated: potsUpdated, potsSeen: pots.length };
      });
      return PayTrackerSyncService.mapMonzoPotsResult_(result);
    },

    // Pure read, confirmed zero writes (docs/v3.2-unified-sync-audit.md)
    // -- never calls syncPayTrackerStafflineDiscrepancies, so this
    // can safely run unattended without ever bulk-creating Action
    // Centre items. It only ever reports a count of what would need
    // review, exactly as the v3.2 spec requires ("Startup may
    // calculate '2 items need review' without auto-writing false
    // alerts").
    RECONCILIATION: function() {
      const reconciliation = PayTrackerStafflineReconciliationService.getReconciliation();
      const rows = reconciliation.rows || [];
      const needsAttention = rows.filter(function(row) {
        return row.calendarStatus === 'Job Mismatch' || row.calendarStatus === 'Hours Differ' ||
          row.calendarStatus === 'Needs Review' || row.paymentStatus === 'Needs Review' ||
          row.paymentStatus === 'Payroll Underpayment';
      });
      return {
        status: PayTrackerSyncConfig.TASK_STATUSES.UPDATED,
        updated: rows.length,
        message: rows.length + ' timesheet(s) reconciled' +
          (needsAttention.length ? ', ' + needsAttention.length + ' item(s) need review.' : ', all current.')
      };
    }
  }
});
