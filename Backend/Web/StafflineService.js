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

/**
 * Raises an Action Centre item for every reconciliation row whose
 * discrepancy is confidently classified -- never for 'None',
 * 'Delayed Payment' (still within the normal processing window, see
 * suggestReviewAction_), or a row where either side of the
 * comparison is itself 'Needs Review' (source not sufficiently
 * known yet). Reuses the existing Action Centre ledger and its
 * built-in (sourceType, sourceId, actionType) dedup -- this never
 * creates a parallel issue/recovery ledger, and re-running it is
 * always safe.
 *
 * A real first run against this account's full Calendar/Staffline
 * history classified 80 rows as actionable in one pass -- mostly
 * genuine (a Staffline-approved timesheet with no Calendar hours
 * logged against it at all is a real gap), but far too many to
 * surface at once without warning. options.dryRun (default true from
 * the UI, see PayStafflineService.html) computes the same counts
 * without writing anything, so the caller can show the scale of what
 * would be created before committing to it.
 */
function syncPayTrackerStafflineDiscrepancies(options) {
  const dryRun = Boolean((options || {}).dryRun);
  const result = PayTrackerStafflineReconciliationService.getReconciliation({});
  const openActions = PayTrackerActionCentreRepository.getAll({});
  const summary = { dryRun: dryRun, created: 0, alreadyOpen: 0, skippedAmbiguous: 0, skippedNoAction: 0 };

  result.rows.forEach(function(row) {
    const isActionableType = row.discrepancyType === 'Timesheet Discrepancy' ||
      row.discrepancyType === 'Payroll Underpayment';
    if (!isActionableType) { summary.skippedNoAction += 1; return; }

    const isAmbiguous = !row.timesheetId ||
      row.calendarStatus === 'Needs Review' || row.paymentStatus === 'Needs Review';
    if (isAmbiguous) { summary.skippedAmbiguous += 1; return; }

    const alreadyOpen = openActions.some(function(item) {
      return item.sourceType === 'Staffline' && item.sourceId === row.timesheetId &&
        item.actionType === row.discrepancyType &&
        item.status !== 'Resolved' && item.status !== 'Dismissed';
    });

    if (alreadyOpen) { summary.alreadyOpen += 1; return; }
    summary.created += 1;
    if (dryRun) return;

    PayTrackerActionCentreRepository.create({
      actionType: row.discrepancyType,
      title: row.discrepancyType + ': Timesheet ' + row.timesheetId + (row.jobId ? ' (' + row.jobId + ')' : ''),
      description: [
        'Week ending ' + (row.weekEnding || '?'),
        'Calendar ' + (row.calendarExpectedHours === null ? '?' : row.calendarExpectedHours) + 'h',
        'Staffline ' + (row.stafflineSubmittedHours === null ? 'unavailable' : row.stafflineSubmittedHours + 'h'),
        'Paid ' + (row.payslipPaidHours === null ? '0' : row.payslipPaidHours) + 'h' +
          (row.payslipPaidAmount !== null ? ' (£' + Number(row.payslipPaidAmount).toFixed(2) + ')' : ''),
        'Calendar status: ' + row.calendarStatus, 'Payment status: ' + row.paymentStatus
      ].join(' | '),
      priority: row.discrepancyType === 'Payroll Underpayment' ? 'High' : 'Normal',
      jobId: row.jobId || '',
      sourceType: 'Staffline', sourceId: row.timesheetId,
      suggestedResolution: row.reviewAction || ''
    });
  });

  return Object.assign({ success: true, generatedAt: new Date().toISOString() }, summary);
}
