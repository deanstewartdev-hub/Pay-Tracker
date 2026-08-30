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
 * Task runner bodies below are intentionally stubbed in this PR
 * (v3.2 architecture) -- each one traces to a specific, cited,
 * already-proven-safe function in docs/v3.2-unified-sync-audit.md
 * and is wired to the real thing in the next PR (real source
 * integration + scheduler). Everything else here -- freshness,
 * dependency ordering, concurrency, result persistence -- is
 * real and fully tested against these stubs, since the engine
 * treats a runner as an opaque function returning a result shape
 * regardless of what's inside it.
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
   * taskId -> function(task) -> {status, created, updated,
   * skipped, message, error}. Stubbed here; wired to real,
   * already-audited functions in the next PR. Deliberately a
   * plain object (not frozen) so the follow-up PR's diff is a
   * simple, reviewable edit to each function body -- the engine
   * logic above never changes.
   */
  RUNNERS: {
    CALENDAR: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerCalendarService.sync().' };
    },
    STAFFLINE_GMAIL: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerStafflineGmailImportService.scanGmail().' };
    },
    PAYSLIP_GMAIL: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerPayslipImportService.scanGmail().' };
    },
    ANNUAL_LEAVE_GMAIL: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerAnnualLeaveGmailImportService.scanGmail().' };
    },
    MONZO_TRANSACTIONS: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerMonzoService.sync().' };
    },
    MONZO_POTS: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerMonzoService pot refresh.' };
    },
    RECONCILIATION: function() {
      return { status: PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE, message: 'Not yet wired to PayTrackerStafflineReconciliationService.getReconciliation().' };
    }
  }
});
