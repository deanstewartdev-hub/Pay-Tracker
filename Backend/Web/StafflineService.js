/*******************************************************
 * PAY TRACKER V3.0 - Staffline reconciliation browser API.
 *******************************************************/

function getPayTrackerStafflineReconciliation(options) {
  const result = PayTrackerStafflineReconciliationService.getReconciliation(options || {});
  return {
    success: true,
    generatedAt: result.generatedAt,
    rows: result.rows.map(serializePayTrackerReconciliationRecord_)
  };
}

function previewPayTrackerStafflineGmailScan(options) {
  const result = PayTrackerStafflineGmailImportService.previewGmailScan(options || {});
  return Object.assign({}, result, {
    startedAt: result.startedAt ? result.startedAt.toISOString() : null,
    completedAt: result.completedAt ? result.completedAt.toISOString() : null
  });
}

function scanPayTrackerStafflineGmail(options) {
  const result = PayTrackerStafflineGmailImportService.scanGmail(options || {});
  return Object.assign({}, result, {
    startedAt: result.startedAt ? result.startedAt.toISOString() : null,
    completedAt: result.completedAt ? result.completedAt.toISOString() : null,
    records: result.records.map(serializePayTrackerReconciliationRecord_)
  });
}

function getPayTrackerStafflineTimesheets() {
  return {
    success: true,
    timesheets: PayTrackerStafflineTimesheetRepository.getAll().map(serializePayTrackerReconciliationRecord_)
  };
}
