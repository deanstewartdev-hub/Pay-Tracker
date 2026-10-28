/*******************************************************
 * PAY TRACKER V3.3 - page-load (STARTUP) sync cooldown.
 * Offline checks only: no sync pass is run here.
 *******************************************************/

function runSyncCooldownTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const C = PayTrackerSyncConfig;
  const Ctl = PayTrackerSyncController;
  const props = PropertiesService.getScriptProperties();
  const minutesAgo = function(minutes) { return new Date(Date.now() - minutes * 60000).toISOString(); };

  check('the page-load cooldown is ten minutes', C.STARTUP_COOLDOWN_MS === 10 * 60 * 1000);

  props.setProperty(C.LAST_FINISHED_PROPERTY_KEY, minutesAgo(2));
  check('a pass that finished two minutes ago blocks a page-load pass', Ctl.finishedWithinCooldown_() === true);

  props.setProperty(C.LAST_FINISHED_PROPERTY_KEY, minutesAgo(30));
  check('a pass that finished thirty minutes ago does not block a page-load pass', Ctl.finishedWithinCooldown_() === false);

  props.setProperty(C.LAST_FINISHED_PROPERTY_KEY, '');
  check('no recorded finish time does not block a pass', Ctl.finishedWithinCooldown_() === false);

  props.setProperty(C.LAST_FINISHED_PROPERTY_KEY, minutesAgo(2));
  const skipped = Ctl.runSync({ triggerSource: C.TRIGGER_SOURCES.STARTUP, force: false });
  check('a page-load pass inside the cooldown returns skipped without running the sync',
    skipped.skipped === true && skipped.alreadyRunning === false);

  // Opening a page must not start a costly sync: only the zero-cost recompute runs on page load.
  const startupTasks = C.TASKS.filter(function(task) { return task.enabled && task.startupEligible; })
    .map(function(task) { return task.id; });
  check('a page load runs only the zero-cost reconciliation', startupTasks.join(',') === 'RECONCILIATION');

  const costlyTasks = C.TASKS.filter(function(task) { return task.id !== 'RECONCILIATION'; });
  check('costly tasks stay on the scheduled and manual paths',
    costlyTasks.every(function(task) { return !task.startupEligible && task.scheduledEligible; }));

  props.setProperty(C.LAST_FINISHED_PROPERTY_KEY, '');
  return { success: true, passed: results.length, results: results };
}
