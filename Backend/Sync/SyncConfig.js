/*******************************************************
 * PAY TRACKER V3.2
 * Unified Sync Engine -- task registry and sheet schema.
 *
 * See docs/v3.2-unified-sync-audit.md for the read-only audit
 * this registry is built from. Every TTL/critical/eligibility
 * value below traces back to a real, cited finding there --
 * none of it is guessed.
 *
 * Staffline portal detail is deliberately NOT a task here: the
 * audit confirmed there is no API and no web entry point for it
 * at all (Backend/Staffline/StafflineTimesheetDetailRepository.js).
 * It stays human/assistant-driven and is surfaced in the UI as a
 * "Manual" source, never as a failed automatic sync.
 *******************************************************/

const PayTrackerSyncConfig = Object.freeze({
  VERSION: '3.2.0',

  SHEET: Object.freeze({
    NAME: 'Sync Status',
    HEADERS: Object.freeze([
      'Task ID', 'Task Name', 'Last Attempt', 'Last Success',
      'Status', 'Duration Ms', 'Run ID', 'Trigger Source',
      'Created', 'Updated', 'Skipped', 'Message', 'Last Error',
      'Updated At'
    ])
  }),

  TRIGGER_SOURCES: Object.freeze({
    STARTUP: 'STARTUP',
    MANUAL: 'MANUAL',
    SCHEDULED: 'SCHEDULED'
  }),

  TASK_STATUSES: Object.freeze({
    WAITING: 'Waiting',
    CHECKING: 'Checking',
    SYNCING: 'Syncing',
    UPDATED: 'Updated',
    ALREADY_CURRENT: 'Already current',
    SKIPPED: 'Skipped',
    NEEDS_ATTENTION: 'Needs attention',
    FAILED: 'Failed',
    MANUAL: 'Manual',
    UNAVAILABLE: 'Unavailable'
  }),

  /**
   * Every task the engine knows about. Each id is stable and
   * referenced by the Sync Status sheet, the run-lock, and the
   * frontend startup UI -- do not rename an existing id without
   * a migration, since Sync Status rows are keyed by it.
   *
   * dependencies: task ids that must be attempted (not
   * necessarily succeed) before this one runs in a given pass.
   * freshnessTtlMinutes: below this age, the task is skipped as
   * "Already current" rather than re-run. 0 means always run
   * (only true for the zero-cost, zero-write Reconciliation
   * recompute).
   * critical: a failure is surfaced more prominently in the UI,
   * but NEVER blocks entry to the app -- see the Failure
   * Experience rule in the v3.2 spec. Calendar/Staffline/
   * Reconciliation are critical because they are the core of
   * what this app reconciles; Monzo is deliberately non-critical
   * because its OAuth refresh has no headless path (audit
   * finding #5) and Payslip/Annual Leave arrive too infrequently
   * to justify blocking anything on them.
   */
  TASKS: Object.freeze([
    Object.freeze({
      id: 'CALENDAR', name: 'Calendar', source: 'Google Calendar',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 15,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: true
    }),
    Object.freeze({
      id: 'STAFFLINE_GMAIL', name: 'Staffline', source: 'Gmail (Staffline approvals)',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 360,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: true
    }),
    Object.freeze({
      id: 'PAYSLIP_GMAIL', name: 'Payslips', source: 'Gmail (Payroll Centre)',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 360,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: false
    }),
    Object.freeze({
      id: 'ANNUAL_LEAVE_GMAIL', name: 'Annual Leave', source: 'Gmail (Annual Leave)',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 360,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: false
    }),
    Object.freeze({
      id: 'MONZO_TRANSACTIONS', name: 'Monzo Transactions', source: 'Monzo API',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 15,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: false
    }),
    Object.freeze({
      id: 'MONZO_POTS', name: 'Savings Pots', source: 'Monzo API',
      dependencies: Object.freeze([]), freshnessTtlMinutes: 15,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: false
    }),
    Object.freeze({
      id: 'RECONCILIATION', name: 'Reconciliation', source: 'Derived (no external call)',
      dependencies: Object.freeze(['CALENDAR', 'STAFFLINE_GMAIL']), freshnessTtlMinutes: 0,
      enabled: true, startupEligible: true, scheduledEligible: true,
      critical: true
    })
  ]),

  getTask: function(taskId) {
    return PayTrackerSyncConfig.TASKS.filter(function(task) {
      return task.id === taskId;
    })[0] || null;
  },

  /**
   * Conservative per-run execution budget for a SCHEDULED pass,
   * in milliseconds. Apps Script's own trigger execution limit is
   * far higher than this; this is a deliberately smaller,
   * self-imposed ceiling so a scheduled run always leaves margin
   * to persist state and release the run-lock cleanly rather than
   * ever risking a hard platform timeout mid-write. See Phase 6
   * of the v3.2 spec ("Runtime / quota safety").
   */
  SCHEDULED_RUN_BUDGET_MILLISECONDS: 4 * 60 * 1000,

  /**
   * A run-lock older than this is treated as abandoned (e.g. the
   * execution that held it crashed/was killed) rather than a
   * genuinely still-active run, and a new run is allowed to start
   * in its place. See PayTrackerSyncController's stale-lock
   * recovery.
   */
  RUN_LOCK_STALE_AFTER_MILLISECONDS: 10 * 60 * 1000,

  RUN_LOCK_PROPERTY_KEY: 'PAY_TRACKER_SYNC_ACTIVE_RUN'
});
