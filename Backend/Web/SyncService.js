/*******************************************************
 * PAY TRACKER V3.2 - Unified Sync Engine browser API.
 *******************************************************/

/**
 * Compact per-task freshness + status, for the global status pill
 * and for deciding what a startup pass actually needs to run.
 * Read-only -- runs nothing.
 */
function getPayTrackerSyncStatus() {
  return PayTrackerSyncController.getSyncStatusSummary();
}

/**
 * Runs (or joins) a sync pass. `options.triggerSource` should be
 * 'STARTUP' or 'MANUAL' from the browser (SCHEDULED is reserved for
 * the time-driven trigger handlers, which call the controller
 * directly). `options.force` bypasses freshness. `options.taskIds`
 * limits the run to specific tasks (e.g. a single page's own
 * refresh button). Collapses to the already-active run rather than
 * starting a second one if one is already in progress.
 */
function runPayTrackerSync(options) {
  const request = options || {};
  const triggerSource = request.triggerSource === PayTrackerSyncConfig.TRIGGER_SOURCES.STARTUP
    ? PayTrackerSyncConfig.TRIGGER_SOURCES.STARTUP
    : PayTrackerSyncConfig.TRIGGER_SOURCES.MANUAL;

  return PayTrackerSyncController.runSync({
    triggerSource: triggerSource,
    force: Boolean(request.force),
    taskIds: Array.isArray(request.taskIds) ? request.taskIds : undefined
  });
}

/**
 * Read-only poll for the frontend's long-running-sync UX ("Continue
 * with current data" while a sync keeps going in the background) --
 * never starts anything itself.
 */
function getPayTrackerActiveSyncRun() {
  return PayTrackerSyncController.getActiveRun();
}
