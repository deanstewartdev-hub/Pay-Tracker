/*******************************************************
 * PAY TRACKER V3.2 - Unified Sync Engine unit checks.
 *
 * Scoped to what this PR actually builds: task registry shape,
 * freshness calculation, dependency ordering, concurrency/
 * run-lock safety, and result persistence. Task runners are
 * still stubs in this PR (see Backend/Sync/SyncService.js) --
 * source-specific idempotency (Calendar, Staffline, Monzo, etc.)
 * is tested where each of those already lives, and again once
 * this engine calls the real thing in the next PR.
 *
 * Writes real rows to the live Sync Status sheet, upserted by
 * task ID (never appended) -- safe to run repeatedly against a
 * live spreadsheet, same convention as every other v3 suite.
 *******************************************************/

function runUnifiedSyncTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  // --- Task registry shape ---

  check('every registered task has the required fields',
    PayTrackerSyncConfig.TASKS.every(function(task) {
      return typeof task.id === 'string' && task.id.length > 0 &&
        typeof task.name === 'string' &&
        typeof task.source === 'string' &&
        Array.isArray(task.dependencies) &&
        typeof task.freshnessTtlMinutes === 'number' &&
        typeof task.enabled === 'boolean' &&
        typeof task.startupEligible === 'boolean' &&
        typeof task.scheduledEligible === 'boolean' &&
        typeof task.critical === 'boolean';
    })
  );
  check('task IDs are unique', (function() {
    const ids = PayTrackerSyncConfig.TASKS.map(function(t) { return t.id; });
    return new Set(ids).size === ids.length;
  })());
  check('every dependency references a real task ID', (function() {
    const ids = PayTrackerSyncConfig.TASKS.map(function(t) { return t.id; });
    return PayTrackerSyncConfig.TASKS.every(function(task) {
      return task.dependencies.every(function(dep) { return ids.indexOf(dep) !== -1; });
    });
  })());
  check('RECONCILIATION depends on CALENDAR and STAFFLINE_GMAIL',
    PayTrackerSyncConfig.getTask('RECONCILIATION').dependencies.indexOf('CALENDAR') !== -1 &&
    PayTrackerSyncConfig.getTask('RECONCILIATION').dependencies.indexOf('STAFFLINE_GMAIL') !== -1
  );
  check('Monzo tasks are non-critical (no headless OAuth refresh path)',
    PayTrackerSyncConfig.getTask('MONZO_TRANSACTIONS').critical === false &&
    PayTrackerSyncConfig.getTask('MONZO_POTS').critical === false
  );
  check('getTask returns null for an unknown ID', PayTrackerSyncConfig.getTask('NOT_A_REAL_TASK') === null);

  // --- Dependency ordering ---

  const ordered = PayTrackerSyncService.orderByDependencies_(PayTrackerSyncConfig.TASKS.slice());
  const orderedIds = ordered.map(function(t) { return t.id; });
  check('dependency ordering places CALENDAR before RECONCILIATION',
    orderedIds.indexOf('CALENDAR') < orderedIds.indexOf('RECONCILIATION'));
  check('dependency ordering places STAFFLINE_GMAIL before RECONCILIATION',
    orderedIds.indexOf('STAFFLINE_GMAIL') < orderedIds.indexOf('RECONCILIATION'));
  check('dependency ordering includes every task exactly once',
    orderedIds.length === PayTrackerSyncConfig.TASKS.length &&
    new Set(orderedIds).size === orderedIds.length);

  check('a dependency cycle throws rather than silently ordering', (function() {
    const a = { id: 'CYCLE_A', dependencies: ['CYCLE_B'] };
    const b = { id: 'CYCLE_B', dependencies: ['CYCLE_A'] };
    try {
      PayTrackerSyncService.orderByDependencies_([a, b]);
      return false;
    } catch (error) {
      return /cycle/i.test(error.message);
    }
  })());

  // --- Freshness calculation ---

  const freshTaskId = 'TEST_FRESHNESS_TASK';
  PayTrackerSyncStateRepository.recordResult({
    taskId: freshTaskId, taskName: 'Test Freshness Task',
    status: PayTrackerSyncConfig.TASK_STATUSES.UPDATED,
    durationMs: 100, runId: 'TEST-RUN-1', triggerSource: 'MANUAL'
  });
  // computeFreshness reads task config from PayTrackerSyncConfig, so
  // exercise it against a real task ID instead, using an injected
  // `now` far enough in the future to force staleness deterministically.
  const calendarRecord = PayTrackerSyncStateRepository.getByTaskId('CALENDAR');
  if (calendarRecord && calendarRecord.lastSuccess) {
    const justNow = new Date(new Date(calendarRecord.lastSuccess).getTime() + 60 * 1000);
    const freshCheck = PayTrackerSyncService.computeFreshness('CALENDAR', justNow);
    check('a task synced 1 minute ago is fresh against a 15-minute TTL', freshCheck.fresh === true);

    const wayLater = new Date(new Date(calendarRecord.lastSuccess).getTime() + 20 * 60 * 1000);
    const staleCheck = PayTrackerSyncService.computeFreshness('CALENDAR', wayLater);
    check('a task synced 20 minutes ago is stale against a 15-minute TTL', staleCheck.fresh === false);
  } else {
    // No prior CALENDAR row exists yet on this sheet -- freshness
    // with no history must read as stale (never fresh by default).
    const neverSynced = PayTrackerSyncService.computeFreshness('CALENDAR', new Date());
    check('a task with no sync history is never reported fresh', neverSynced.fresh === false);
  }

  check('a zero-TTL task (RECONCILIATION) is always reported stale',
    PayTrackerSyncService.computeFreshness('RECONCILIATION', new Date()).fresh === false);

  check('freshness for an unknown task ID reports not fresh, not a throw',
    PayTrackerSyncService.computeFreshness('NOT_A_REAL_TASK', new Date()).fresh === false);

  // --- run() persistence, aggregation, and dependency-failure skip ---

  const runResult = PayTrackerSyncService.run({
    triggerSource: PayTrackerSyncConfig.TRIGGER_SOURCES.MANUAL,
    taskIds: ['CALENDAR', 'STAFFLINE_GMAIL', 'RECONCILIATION'],
    force: true,
    now: new Date()
  });

  check('run() returns one result per requested task', runResult.tasks.length === 3);
  check('run() summary totalTasks matches the number of results',
    runResult.summary.totalTasks === runResult.tasks.length);
  check('run() summary counts add up to totalTasks (no fake progress)', (function() {
    const s = runResult.summary;
    return (s.updated + s.alreadyCurrent + s.skipped + s.failed + s.manual + s.unavailable) === s.totalTasks;
  })());
  check('unwired stub tasks report Unavailable, not a false Updated',
    runResult.tasks.every(function(t) { return t.status === PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE; })
  );
  check('run() persisted a Sync Status row for each requested task', (function() {
    return ['CALENDAR', 'STAFFLINE_GMAIL', 'RECONCILIATION'].every(function(id) {
      const record = PayTrackerSyncStateRepository.getByTaskId(id);
      return Boolean(record) && record.runId === runResult.runId;
    });
  })());
  check('re-running the same task upserts in place rather than appending a new row', (function() {
    const before = PayTrackerSyncStateRepository.getAll().length;
    PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['CALENDAR'], force: true, now: new Date() });
    const after = PayTrackerSyncStateRepository.getAll().length;
    return after === before;
  })());

  // --- force / freshness-skip behaviour ---
  // Freshness only ever engages after a genuine success (Updated or
  // Already current) -- an Unavailable stub result must never look
  // "fresh" to a later run, so this needs a runner that actually
  // succeeds, not the real (still-stubbed) STAFFLINE_GMAIL one.

  const originalStafflineRunner = PayTrackerSyncService.RUNNERS.STAFFLINE_GMAIL;
  PayTrackerSyncService.RUNNERS.STAFFLINE_GMAIL = function() {
    return { status: PayTrackerSyncConfig.TASK_STATUSES.UPDATED, created: 1, updated: 0, skipped: 0, message: 'Injected test success.' };
  };

  const firstRun = PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['STAFFLINE_GMAIL'], force: true, now: new Date() });
  check('a genuinely successful run reports Updated, not a fake status',
    firstRun.tasks[0].status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED
  );
  const secondRun = PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['STAFFLINE_GMAIL'], force: false, now: new Date() });
  check('without force, a task synced moments ago is skipped as already-current',
    secondRun.tasks[0].status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT
  );
  const thirdRun = PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['STAFFLINE_GMAIL'], force: true, now: new Date() });
  check('with force:true, a task synced moments ago still runs',
    thirdRun.tasks[0].status !== PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT
  );

  PayTrackerSyncService.RUNNERS.STAFFLINE_GMAIL = originalStafflineRunner;
  check('an Unavailable (still-stubbed) result never counts as fresh for a later run', (function() {
    PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['PAYSLIP_GMAIL'], force: true, now: new Date() });
    const stillUnavailable = PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['PAYSLIP_GMAIL'], force: false, now: new Date() });
    return stillUnavailable.tasks[0].status === PayTrackerSyncConfig.TASK_STATUSES.UNAVAILABLE;
  })());

  // --- trigger-source eligibility filtering ---

  const scheduledRun = PayTrackerSyncService.run({
    triggerSource: PayTrackerSyncConfig.TRIGGER_SOURCES.SCHEDULED, now: new Date(), force: true
  });
  check('a SCHEDULED run only includes scheduledEligible tasks',
    scheduledRun.tasks.every(function(t) {
      return PayTrackerSyncConfig.getTask(t.taskId).scheduledEligible === true;
    })
  );

  // --- dependency-failure propagation ---

  const originalRunner = PayTrackerSyncService.RUNNERS.CALENDAR;
  PayTrackerSyncService.RUNNERS.CALENDAR = function() {
    return { status: PayTrackerSyncConfig.TASK_STATUSES.FAILED, error: 'Injected test failure.' };
  };
  const failureRun = PayTrackerSyncService.run({
    triggerSource: 'MANUAL', taskIds: ['CALENDAR', 'RECONCILIATION'], force: true, now: new Date()
  });
  PayTrackerSyncService.RUNNERS.CALENDAR = originalRunner;

  const reconciliationResult = failureRun.tasks.filter(function(t) { return t.taskId === 'RECONCILIATION'; })[0];
  check('a failed dependency causes the dependent task to be skipped, not run',
    reconciliationResult.status === PayTrackerSyncConfig.TASK_STATUSES.SKIPPED
  );
  check('a critical task failure is flagged at the summary level',
    failureRun.summary.criticalFailure === true
  );

  // --- last-known-good preserved across a failure ---

  PayTrackerSyncStateRepository.recordResult({
    taskId: 'TEST_LKG_TASK', taskName: 'Test LKG Task',
    status: PayTrackerSyncConfig.TASK_STATUSES.UPDATED,
    durationMs: 50, runId: 'TEST-LKG-SUCCESS', triggerSource: 'MANUAL'
  });
  const successRecord = PayTrackerSyncStateRepository.getByTaskId('TEST_LKG_TASK');
  const successTimestamp = successRecord.lastSuccess;

  PayTrackerSyncStateRepository.recordResult({
    taskId: 'TEST_LKG_TASK', taskName: 'Test LKG Task',
    status: PayTrackerSyncConfig.TASK_STATUSES.FAILED,
    durationMs: 50, runId: 'TEST-LKG-FAILURE', triggerSource: 'MANUAL', error: 'Injected'
  });
  const failedRecord = PayTrackerSyncStateRepository.getByTaskId('TEST_LKG_TASK');
  check('lastSuccess is preserved (not erased) after a subsequent failed attempt',
    new Date(failedRecord.lastSuccess).getTime() === new Date(successTimestamp).getTime()
  );
  check('lastAttempt still advances on a failed attempt',
    new Date(failedRecord.lastAttempt).getTime() >= new Date(successRecord.lastAttempt).getTime()
  );

  // --- run-lock concurrency safety ---

  const properties = PropertiesService.getScriptProperties();
  const savedLock = properties.getProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);

  try {
    const firstClaim = PayTrackerSyncController.claimRunSlot_();
    check('the first claim on a free run-lock succeeds', firstClaim.claimed === true);

    const secondClaim = PayTrackerSyncController.claimRunSlot_();
    check('a second claim while the first is still active is rejected (no duplicate run)',
      secondClaim.claimed === false && secondClaim.activeRun.runId === firstClaim.runId
    );

    PayTrackerSyncController.releaseRunSlot_(firstClaim.runId);
    const thirdClaim = PayTrackerSyncController.claimRunSlot_();
    check('a claim after release succeeds again', thirdClaim.claimed === true);
    PayTrackerSyncController.releaseRunSlot_(thirdClaim.runId);

    // Stale-lock recovery: simulate an abandoned run by writing a
    // marker whose startedAt is older than the staleness threshold.
    properties.setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY, JSON.stringify({
      runId: 'ABANDONED-RUN',
      startedAt: new Date(Date.now() - PayTrackerSyncConfig.RUN_LOCK_STALE_AFTER_MILLISECONDS - 60000).toISOString()
    }));
    const recoveryClaim = PayTrackerSyncController.claimRunSlot_();
    check('a claim recovers from a stale (abandoned) lock rather than blocking forever',
      recoveryClaim.claimed === true
    );

    // releaseRunSlot_ must only clear the marker if it still matches
    // the caller's own runId -- a late release from an old run must
    // never clobber a newer run that has since claimed the slot.
    PayTrackerSyncController.releaseRunSlot_('SOME-OTHER-STALE-RUN-ID');
    const stillActive = PayTrackerSyncController.getActiveRun();
    check('releasing with a mismatched runId does not clear a different active run',
      stillActive !== null && stillActive.runId === recoveryClaim.runId
    );
    PayTrackerSyncController.releaseRunSlot_(recoveryClaim.runId);
    check('getActiveRun reports null once genuinely released', PayTrackerSyncController.getActiveRun() === null);
  } finally {
    if (savedLock) properties.setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY, savedLock);
    else properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  }

  // --- runSync() end-to-end: duplicate request collapses to one run ---

  const savedLock2 = properties.getProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  try {
    properties.setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY, JSON.stringify({
      runId: 'SIMULATED-CONCURRENT-RUN', startedAt: new Date().toISOString()
    }));
    const duplicateAttempt = PayTrackerSyncController.runSync({ triggerSource: 'MANUAL', taskIds: ['CALENDAR'] });
    check('runSync() detects an already-active run instead of starting a second one',
      duplicateAttempt.alreadyRunning === true && duplicateAttempt.activeRun.runId === 'SIMULATED-CONCURRENT-RUN'
    );
    properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);

    const realRun = PayTrackerSyncController.runSync({ triggerSource: 'MANUAL', taskIds: ['CALENDAR'], force: true });
    check('runSync() runs and releases the lock when none was active', realRun.alreadyRunning === false);
    check('runSync() releases the lock after completing', PayTrackerSyncController.getActiveRun() === null);
  } finally {
    if (savedLock2) properties.setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY, savedLock2);
    else properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  }

  // --- budget/checkpoint behaviour ---

  const budgetRun = PayTrackerSyncService.run({
    triggerSource: 'MANUAL', taskIds: ['CALENDAR', 'STAFFLINE_GMAIL'],
    force: true, budgetMilliseconds: 1, now: new Date(Date.now() - 10000)
  });
  check('a task starting after the run budget is exhausted is marked Skipped, not silently dropped',
    budgetRun.tasks.some(function(t) { return t.status === PayTrackerSyncConfig.TASK_STATUSES.SKIPPED; })
  );

  // --- getSyncStatusSummary() shape ---

  const summary = PayTrackerSyncController.getSyncStatusSummary();
  check('getSyncStatusSummary returns one entry per enabled task',
    summary.tasks.length === PayTrackerSyncConfig.TASKS.filter(function(t) { return t.enabled; }).length
  );
  check('getSyncStatusSummary reports allCurrent as a real boolean', typeof summary.allCurrent === 'boolean');

  // --- Sync Status setup is additive-only ---

  const setupResult = PayTrackerSyncSetupService.setup();
  check('re-running sync setup is idempotent (no error, no data loss)', setupResult.success === true);

  return { success: true, passed: results.length, results: results };
}
