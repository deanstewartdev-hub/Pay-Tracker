/*******************************************************
 * PAY TRACKER V3.2 - Unified Sync Engine unit checks.
 *
 * Covers task registry shape, freshness calculation, dependency
 * ordering, concurrency/run-lock safety, result persistence, the
 * real-source result mappers (pure functions, tested with
 * synthetic inputs), and trigger management.
 *
 * Deliberately never calls a real RUNNERS.* entry -- every engine-
 * mechanics check below temporarily swaps in a fast, injected fake
 * runner (restored via try/finally), exactly the same convention
 * Tests/CalendarReconciliation_Tests.js already uses for
 * classifyEvent(): test pure logic with synthetic inputs, never
 * invoke live Calendar/Gmail/Monzo calls from the automated suite.
 * Real wiring correctness (does RUNNERS.CALENDAR actually call
 * PayTrackerCalendarService.sync() and get back what
 * mapCalendarResult_ expects) is verified once, live, outside this
 * suite -- see the PR description for that verification's result.
 *
 * Writes real rows to the live Sync Status sheet, upserted by
 * task ID (never appended) -- unlike other v3 suites' domain data
 * (where a leftover test row is harmless clutter), a real task ID's
 * Sync Status row is ACTIVE STATE the live Unified Sync Engine
 * reads to decide whether to skip a real sync as "still fresh".
 * Overwriting it with synthetic test data doesn't just leave
 * clutter -- it corrupts the freshness signal production depends
 * on (confirmed live: a full runAllPayTrackerTests() pass
 * immediately before a real production promotion left MONZO_POTS
 * showing a stale, fake "Injected test success." row instead of
 * its real last-sync time). Every real task ID this suite touches
 * (CALENDAR, STAFFLINE_GMAIL, PAYSLIP_GMAIL, MONZO_TRANSACTIONS,
 * MONZO_POTS, RECONCILIATION, ...) is snapshotted before the suite
 * runs and restored exactly in a finally block below -- the same
 * backup/restore convention this file already uses for trigger
 * state (see originalTriggerState further down). Only its own
 * synthetic TEST_ and _TASK-suffixed IDs are left as real, harmless rows.
 *******************************************************/

function snapshotPayTrackerSyncStateRows_(taskIds) {
  const snapshot = {};
  taskIds.forEach(function(taskId) {
    snapshot[taskId] = PayTrackerSyncStateRepository.getByTaskId(taskId);
  });
  return snapshot;
}

function restorePayTrackerSyncStateRows_(snapshot) {
  const sheet = PayTrackerSyncStateRepository.getSheet();
  const headers = PayTrackerSyncConfig.SHEET.HEADERS;
  Object.keys(snapshot).forEach(function(taskId) {
    const original = snapshot[taskId];
    const current = PayTrackerSyncStateRepository.getByTaskId(taskId);
    if (original) {
      const row = headers.map(function(header) {
        return original[PayTrackerJobRegistryRepository.toKey(header)];
      });
      sheet.getRange(current ? current.rowNumber : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    } else if (current) {
      // No row existed for this task before the suite ran -- remove
      // the one it created so the sheet returns to its prior shape.
      sheet.deleteRow(current.rowNumber);
    }
  });
}

function runUnifiedSyncTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  function withFakeRunner(taskId, fakeRunner, callback) {
    const original = PayTrackerSyncService.RUNNERS[taskId];
    PayTrackerSyncService.RUNNERS[taskId] = fakeRunner;
    try {
      return callback();
    } finally {
      PayTrackerSyncService.RUNNERS[taskId] = original;
    }
  }

  const realTaskSyncStateSnapshot = snapshotPayTrackerSyncStateRows_(
    PayTrackerSyncConfig.TASKS.map(function(task) { return task.id; })
  );

  try {

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
  // Read-only against whatever's already in the Sync Status sheet
  // (from real app usage or a prior live wiring check) -- never
  // triggers a new sync itself.

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

  // --- run() persistence, aggregation ---
  // CALENDAR and STAFFLINE_GMAIL swapped to fast fake successes --
  // RECONCILIATION is left real since it's a pure, cheap Sheets
  // read with zero external calls (confirmed in the v3.2 audit).

  const fakeSuccess = function() {
    return { status: PayTrackerSyncConfig.TASK_STATUSES.UPDATED, created: 1, updated: 0, skipped: 0, message: 'Injected test success.' };
  };

  const runResult = withFakeRunner('CALENDAR', fakeSuccess, function() {
    return withFakeRunner('STAFFLINE_GMAIL', fakeSuccess, function() {
      return PayTrackerSyncService.run({
        triggerSource: PayTrackerSyncConfig.TRIGGER_SOURCES.MANUAL,
        taskIds: ['CALENDAR', 'STAFFLINE_GMAIL', 'RECONCILIATION'],
        force: true, now: new Date()
      });
    });
  });

  check('run() returns one result per requested task', runResult.tasks.length === 3);
  check('run() summary totalTasks matches the number of results',
    runResult.summary.totalTasks === runResult.tasks.length);
  check('run() summary counts add up to totalTasks (no fake progress)', (function() {
    const s = runResult.summary;
    return (s.updated + s.alreadyCurrent + s.skipped + s.failed + s.manual + s.unavailable) === s.totalTasks;
  })());
  check('every requested task reports a real, recognised status', (function() {
    const validStatuses = Object.keys(PayTrackerSyncConfig.TASK_STATUSES).map(function(key) {
      return PayTrackerSyncConfig.TASK_STATUSES[key];
    });
    return runResult.tasks.every(function(t) { return validStatuses.indexOf(t.status) !== -1; });
  })());
  check('run() persisted a Sync Status row for each requested task', (function() {
    return ['CALENDAR', 'STAFFLINE_GMAIL', 'RECONCILIATION'].every(function(id) {
      const record = PayTrackerSyncStateRepository.getByTaskId(id);
      return Boolean(record) && record.runId === runResult.runId;
    });
  })());
  check('re-running the same task upserts in place rather than appending a new row', withFakeRunner('CALENDAR', fakeSuccess, function() {
    const before = PayTrackerSyncStateRepository.getAll().length;
    PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['CALENDAR'], force: true, now: new Date() });
    const after = PayTrackerSyncStateRepository.getAll().length;
    return after === before;
  }));

  // --- force / freshness-skip behaviour ---
  // Freshness only ever engages after a genuine success (Updated or
  // Already current) -- a Failed result must never look "fresh" to
  // a later run.

  withFakeRunner('STAFFLINE_GMAIL', fakeSuccess, function() {
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
  });

  const fakeFailure = function() {
    return { status: PayTrackerSyncConfig.TASK_STATUSES.FAILED, error: 'Injected test failure.' };
  };
  // computeFreshness needs a real task ID (it looks up that task's own
  // TTL from PayTrackerSyncConfig), but by this point in the suite
  // PAYSLIP_GMAIL may already carry a lastSuccess timestamp from an
  // earlier real run in this same environment -- and per the
  // last-known-good design (tested above), a Failed attempt correctly
  // preserves that old success rather than erasing it. So this check
  // explicitly clears the Last Success cell first, to control for
  // "never succeeded" rather than assume it.
  check('a Failed result never counts as fresh for a later run', withFakeRunner('PAYSLIP_GMAIL', fakeFailure, function() {
    const sheet = PayTrackerSyncStateRepository.getSheet();
    const existing = PayTrackerSyncStateRepository.getByTaskId('PAYSLIP_GMAIL');
    if (existing) sheet.getRange(existing.rowNumber, 4).setValue('');

    PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['PAYSLIP_GMAIL'], force: true, now: new Date() });
    const stillFailed = PayTrackerSyncService.run({ triggerSource: 'MANUAL', taskIds: ['PAYSLIP_GMAIL'], force: false, now: new Date() });
    return stillFailed.tasks[0].status === PayTrackerSyncConfig.TASK_STATUSES.FAILED;
  }));

  // --- trigger-source eligibility filtering ---
  // Every real runner swapped to a fast fake -- this block tests
  // WHICH tasks get selected for a SCHEDULED pass, not what any one
  // source actually does.

  const allFakeRunners = {};
  PayTrackerSyncConfig.TASKS.forEach(function(task) { allFakeRunners[task.id] = fakeSuccess; });
  const scheduledRun = (function() {
    const originals = {};
    Object.keys(allFakeRunners).forEach(function(id) {
      originals[id] = PayTrackerSyncService.RUNNERS[id];
      PayTrackerSyncService.RUNNERS[id] = allFakeRunners[id];
    });
    try {
      return PayTrackerSyncService.run({ triggerSource: PayTrackerSyncConfig.TRIGGER_SOURCES.SCHEDULED, now: new Date(), force: true });
    } finally {
      Object.keys(originals).forEach(function(id) { PayTrackerSyncService.RUNNERS[id] = originals[id]; });
    }
  })();
  check('a SCHEDULED run only includes scheduledEligible tasks',
    scheduledRun.tasks.every(function(t) {
      return PayTrackerSyncConfig.getTask(t.taskId).scheduledEligible === true;
    })
  );

  // --- dependency-failure propagation ---

  const failureRun = withFakeRunner('CALENDAR', fakeFailure, function() {
    return PayTrackerSyncService.run({
      triggerSource: 'MANUAL', taskIds: ['CALENDAR', 'RECONCILIATION'], force: true, now: new Date()
    });
  });

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

    const realRun = withFakeRunner('CALENDAR', fakeSuccess, function() {
      return PayTrackerSyncController.runSync({ triggerSource: 'MANUAL', taskIds: ['CALENDAR'], force: true });
    });
    check('runSync() runs and releases the lock when none was active', realRun.alreadyRunning === false);
    check('runSync() releases the lock after completing', PayTrackerSyncController.getActiveRun() === null);
  } finally {
    if (savedLock2) properties.setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY, savedLock2);
    else properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
  }

  // --- budget/checkpoint behaviour ---
  // The run budget is already exhausted before the loop starts (see
  // `now`), so the budget check fires before any runner would ever
  // be invoked -- no fake needed, this never reaches a real call.

  const budgetRun = PayTrackerSyncService.run({
    triggerSource: 'MANUAL', taskIds: ['CALENDAR', 'STAFFLINE_GMAIL'],
    force: true, budgetMilliseconds: 1, now: new Date(Date.now() - 10000)
  });
  check('a task starting after the run budget is exhausted is marked Skipped, not silently dropped',
    budgetRun.tasks.every(function(t) { return t.status === PayTrackerSyncConfig.TASK_STATUSES.SKIPPED; })
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

  // --- Real-source result mappers (PR B) ---
  // These are pure functions -- given a real function's already-
  // observed return shape as a synthetic input, they must classify
  // status/message correctly with zero Calendar/Gmail/Monzo calls
  // of their own, exactly like CalendarReconciliation_Tests.js
  // tests classifyEvent() without ever touching a real calendar.

  check('mapCalendarResult_ reports Updated when anything changed', (function() {
    const r = PayTrackerSyncService.mapCalendarResult_({
      imported: 2, updated: 1, adopted: 0, removed: 0, skipped: 3, reviewItems: 1, ignored: 4, totalEvents: 11
    });
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED && r.created === 2 && r.updated === 1;
  })());
  check('mapCalendarResult_ reports Already current when nothing changed', (function() {
    const r = PayTrackerSyncService.mapCalendarResult_({
      imported: 0, updated: 0, adopted: 0, removed: 0, skipped: 5, reviewItems: 0, ignored: 2, totalEvents: 7
    });
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT;
  })());

  check('mapGmailScanResult_ reports Failed when the scan itself did not succeed', (function() {
    const r = PayTrackerSyncService.mapGmailScanResult_({ success: false, errors: ['Gmail quota exceeded'] }, 'Test');
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.FAILED && r.error === 'Gmail quota exceeded';
  })());
  check('mapGmailScanResult_ reports Needs attention when the scan succeeded but had per-message errors', (function() {
    const r = PayTrackerSyncService.mapGmailScanResult_({
      success: true, recordsCreated: 1, recordsUpdated: 0, messagesChecked: 5, messagesMatched: 2, needsReview: 0,
      errors: ['One message could not be parsed']
    }, 'Test');
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.NEEDS_ATTENTION;
  })());
  check('mapGmailScanResult_ reports Updated when records changed with no errors', (function() {
    const r = PayTrackerSyncService.mapGmailScanResult_({
      success: true, recordsCreated: 3, recordsUpdated: 0, messagesChecked: 5, messagesMatched: 3, needsReview: 0, errors: []
    }, 'Test');
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED && r.created === 3;
  })());
  check('mapGmailScanResult_ reports Already current when nothing changed with no errors', (function() {
    const r = PayTrackerSyncService.mapGmailScanResult_({
      success: true, recordsCreated: 0, recordsUpdated: 0, messagesChecked: 5, messagesMatched: 0, needsReview: 0, errors: []
    }, 'Test');
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT;
  })());

  check('mapPayslipResult_ reports Failed when the scan itself did not succeed',
    PayTrackerSyncService.mapPayslipResult_({ success: false, errors: ['boom'] }, { completed: 0, failed: 0 }).status
      === PayTrackerSyncConfig.TASK_STATUSES.FAILED
  );
  check('mapPayslipResult_ reports Needs attention when processing had failures', (function() {
    const r = PayTrackerSyncService.mapPayslipResult_(
      { success: true, payslipsImported: 2, messagesChecked: 3, messagesMatched: 2, errors: [] },
      { completed: 1, failed: 1 }
    );
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.NEEDS_ATTENTION && /1 payslip\(s\) failed processing/.test(r.error);
  })());
  check('mapPayslipResult_ reports Updated when scanned and processed cleanly', (function() {
    const r = PayTrackerSyncService.mapPayslipResult_(
      { success: true, payslipsImported: 2, messagesChecked: 3, messagesMatched: 2, errors: [] },
      { completed: 2, failed: 0 }
    );
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED && r.created === 2 && r.updated === 2;
  })());
  check('mapPayslipResult_ reports Updated (not Already current) when nothing was newly imported but the batch processed existing payslips -- regression for the real PayslipImportService.scanGmail() shape (payslipsImported, not recordsCreated)', (function() {
    const r = PayTrackerSyncService.mapPayslipResult_(
      { success: true, payslipsImported: 0, duplicatesSkipped: 2, messagesChecked: 2, messagesMatched: 2, errors: [] },
      { completed: 5, failed: 0 }
    );
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED && r.created === 0 && r.updated === 5 &&
      r.message.indexOf('undefined') === -1;
  })());

  check('mapMonzoTransactionsResult_ reports Updated when anything happened', (function() {
    const r = PayTrackerSyncService.mapMonzoTransactionsResult_({ imported: 2, suggestions: 0, paymentsMatched: 0, message: 'ok' });
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED && r.message === 'ok';
  })());
  check('mapMonzoTransactionsResult_ reports Already current when nothing happened', (function() {
    const r = PayTrackerSyncService.mapMonzoTransactionsResult_({ imported: 0, suggestions: 0, paymentsMatched: 0, message: 'ok' });
    return r.status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT;
  })());

  check('mapMonzoPotsResult_ reports Updated when a linked pot changed',
    PayTrackerSyncService.mapMonzoPotsResult_({ potsUpdated: 1, potsSeen: 3 }).status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED
  );
  check('mapMonzoPotsResult_ reports Already current when no linked pot changed',
    PayTrackerSyncService.mapMonzoPotsResult_({ potsUpdated: 0, potsSeen: 3 }).status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT
  );

  check('monzoNotConnectedResult_ reports Manual, not Failed (never reads as a broken sync)',
    PayTrackerSyncService.monzoNotConnectedResult_().status === PayTrackerSyncConfig.TASK_STATUSES.MANUAL
  );

  // --- Scheduled trigger management (real ScriptApp triggers -- safe
  // and fully reversible: create, verify, remove, verify gone) ---

  const originalTriggerState = PayTrackerSyncAutomationService.getStatus();
  try {
    PayTrackerSyncAutomationService.disable();
    check('disable() leaves no v3.2 sync triggers installed',
      PayTrackerSyncAutomationService.getStatus().triggerCount === 0
    );

    const enabled = PayTrackerSyncAutomationService.enable();
    check('enable() installs exactly one trigger per schedule',
      enabled.triggerCount === PayTrackerSyncAutomationService.SCHEDULES.length &&
      enabled.schedules.every(function(s) { return s.triggerCount === 1; })
    );
    check('enable() reports the correct timezone', enabled.timezone === 'Europe/London');

    const reEnabled = PayTrackerSyncAutomationService.enable();
    check('calling enable() again does not create duplicate triggers',
      reEnabled.triggerCount === PayTrackerSyncAutomationService.SCHEDULES.length
    );

    const disabled = PayTrackerSyncAutomationService.disable();
    check('disable() removes every v3.2 sync trigger', disabled.triggerCount === 0 && disabled.enabled === false);
  } finally {
    // Restore whatever state existed before this test ran.
    if (originalTriggerState.enabled) PayTrackerSyncAutomationService.enable();
    else PayTrackerSyncAutomationService.disable();
  }

  check('getPayTrackerSyncTriggerStatus() is callable and returns the same shape',
    typeof getPayTrackerSyncTriggerStatus().enabled === 'boolean'
  );
  } finally {
    restorePayTrackerSyncStateRows_(realTaskSyncStateSnapshot);
  }

  return { success: true, passed: results.length, results: results };
}
