/*******************************************************
 * PAY TRACKER V3.3 - Staging acceptance self-check.
 *
 * Run runPayTrackerAcceptanceChecks() from the Apps Script editor of
 * the STAGING copy after pushing v3.3. It automates every check that
 * does not need a person to look at the screen.
 *
 * READ-ONLY: it reads sheets, the calendar and the payroll rules and
 * writes nothing (the only side effect is refreshing the Upcoming
 * Payments cache, which is not a sheet). It never syncs, never calls
 * Monzo and never installs triggers.
 *******************************************************/

const PayTrackerAcceptanceChecks = Object.freeze({
  run: function() {
    const checks = [];
    const add = function(area, name, status, detail) {
      checks.push({ area: area, name: name, status: status, detail: detail || '' });
    };
    const attempt = function(area, name, fn) {
      try { fn(); } catch (error) { add(area, name, 'FAIL', 'Error: ' + (error && error.message ? error.message : error)); }
    };
    const self = PayTrackerAcceptanceChecks;

    attempt('Environment', 'Staging isolation', function() { self.checkEnvironment(add); });
    attempt('Calendar', 'Calendar access', function() {
      const report = PayTrackerCalendarDiagnosticsService.diagnoseAccess({});
      add('Calendar', 'Every configured calendar is readable', report.syncComplete ? 'PASS' : 'FAIL',
        report.accessibleCount + ' of ' + report.configuredCount + ' readable');
    });
    attempt('Calendar', 'NHS shift recognition', function() { self.checkNhsRecognition(add); });
    attempt('Payroll', 'Rates', function() { self.checkRates(add); });
    attempt('Payroll', 'October PaySheet rows', function() { self.checkOctoberRows(add); });
    attempt('Calendar', 'Manual corrections', function() {
      const report = previewCalendarManualOverrides();
      add('Calendar', 'Rows the first sync will keep as manual corrections', report.wouldBePreserved.length ? 'REVIEW' : 'PASS',
        report.wouldBePreserved.length + ' of ' + report.checked + ' calendar-owned rows (listed in the log)');
    });
    attempt('Staffline', 'Reconciliation', function() {
      // The Staffline repositories set their sheets up (and seed Job references) when a
      // sheet is missing, so only read the reconciliation when every sheet already exists.
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const missing = PayTrackerStafflineConfig.getDefinitions().filter(function(definition) {
        return !spreadsheet.getSheetByName(definition.NAME);
      });
      if (missing.length) {
        add('Staffline', 'Staffline sheets present', 'REVIEW', 'not set up here: ' + missing.map(function(d) { return d.NAME; }).join(', '));
        return;
      }
      const rows = PayTrackerStafflineReconciliationService.getReconciliation({}).rows || [];
      const differ = rows.filter(function(row) { return row.calendarStatus === 'Hours Differ'; });
      add('Staffline', 'Timesheets whose calendar hours differ', differ.length ? 'REVIEW' : 'PASS',
        differ.length + ' of ' + rows.length + ' rows' + (differ.length ? ': ' + differ.slice(0, 5).map(function(row) {
          return row.timesheetId + ' (' + row.calendarExpectedHours + 'h vs ' + row.stafflineSubmittedHours + 'h)';
        }).join(', ') : ''));
    });
    attempt('Monzo', 'Bank Transactions', function() { self.checkBankTransactions(add); });
    attempt('Finance', 'Upcoming Payments', function() {
      const view = getPayTrackerUpcomingPayments({ refresh: true });
      add('Finance', 'Upcoming Payments build', view.success ? 'PASS' : 'FAIL',
        view.upcoming.length + ' upcoming, next 30 days ' + view.totals.next30Days.amount);
    });
    attempt('Finance', 'Cash-flow preview', function() {
      const preview = getPayTrackerCashFlowPreview({});
      add('Finance', 'Cash-flow preview builds', preview.success ? 'PASS' : 'FAIL',
        preview.summary.transactionCount + ' transactions, ' + preview.summary.needsConfirmationCount + ' need confirmation');
    });
    attempt('Savings', 'Smart Savings', function() {
      const preview = getPayTrackerSmartSavingsPreview();
      add('Savings', 'Smart Savings preview builds', preview.success ? 'PASS' : 'FAIL',
        'genuinely available ' + preview.disposable + ', suggested ' + preview.suggestion.amount +
        (preview.warnings.length ? ' (' + preview.warnings.length + ' warning(s))' : ''));
    });

    const failed = checks.filter(function(c) { return c.status === 'FAIL'; }).length;
    const review = checks.filter(function(c) { return c.status === 'REVIEW'; }).length;
    Logger.log('Pay Tracker v3.3 acceptance: ' + failed + ' FAIL, ' + review + ' REVIEW, ' + checks.length + ' checks');
    checks.forEach(function(c) { Logger.log(c.status + '  [' + c.area + '] ' + c.name + (c.detail ? ' - ' + c.detail : '')); });
    return { failed: failed, review: review, checks: checks };
  },

  checkEnvironment: function(add) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const name = spreadsheet ? spreadsheet.getName() : '';
    add('Environment', 'Spreadsheet is the staging copy', /staging/i.test(name) ? 'PASS' : 'FAIL',
      '"' + name + '" (name the copy "... STAGING ..." so this check can tell it apart)');
    const triggers = ScriptApp.getProjectTriggers().length;
    add('Environment', 'No scheduled triggers in staging', triggers ? 'REVIEW' : 'PASS', triggers + ' trigger(s)');
    const monzoClient = Boolean(PropertiesService.getScriptProperties().getProperty(PayTrackerMonzoService.CLIENT_ID_PROPERTY));
    add('Environment', 'Monzo not connected in staging (production tokens untouched)', monzoClient ? 'REVIEW' : 'PASS',
      monzoClient ? 'Monzo client credentials are set in this project' : 'no Monzo credentials in this project');
  },

  /** The four NHS windows at both hospitals, weekday and weekend, on synthetic events. */
  checkNhsRecognition: function(add) {
    const expected = { '6-14': 'NHS 6am-2pm Basic', '8-16': 'Basic', '10-18': 'Basic', '14-22': 'NHS 2pm-10pm Split' };
    const problems = [];
    ['NHS Antrim', 'NHS Causeway Hospital'].forEach(function(hospital) {
      Object.keys(expected).forEach(function(window) {
        const hours = window.split('-').map(Number);
        [[26, expected[window]], [31, 'NHS Saturday'], [25, 'NHS Sunday']].forEach(function(day) {
          const event = {
            getTitle: function() { return hospital; },
            getStartTime: function() { return new Date(2026, 9, day[0], hours[0]); },
            getEndTime: function() { return new Date(2026, 9, day[0], hours[1]); },
            isAllDayEvent: function() { return false; }
          };
          const match = PayTrackerCalendarService.classifyEvent(event, new Date(2026, 9, day[0]), []);
          if (!match || match.shiftType !== day[1]) problems.push(hospital + ' ' + window + ' on ' + day[0] + ' Oct');
        });
      });
    });
    add('Calendar', 'NHS: 4 shifts x 2 hospitals x weekday/Sat/Sun recognised', problems.length ? 'FAIL' : 'PASS',
      problems.length ? problems.join(', ') : '24 combinations');
  },

  checkRates: function(add) {
    const pay = function(table, shift, hours, date) {
      return PayTrackerPayCalculator.calculatePay(table, shift, hours, date);
    };
    const results = [
      ['Night x1.50 on Sun 4 Oct 2026 (w/e 04/10): 4.5h = 90.95', pay('Night Security Warden', 'Enhanced 1.50', 4.5, new Date(2026, 9, 4)), 90.95],
      ['Night x1.50 from Mon 5 Oct 2026 (w/e 11/10): 8h = 166.96', pay('Night Security Warden', 'Enhanced 1.50', 8, new Date(2026, 9, 10)), 166.96],
      ['Night x1.33: 4h = 71.68', pay('Night Security Warden', 'Enhanced 1.33', 4, new Date(2026, 9, 10)), 71.68],
      ['NHS 7.5h basic = 95.33', pay('NHS', 'Basic', '', new Date(2026, 9, 7)), 95.33],
      ['NHS 2-10 split = 105.75', pay('NHS', 'NHS 2pm-10pm Split', '', new Date(2026, 9, 7)), 105.75]
    ];
    results.forEach(function(r) { add('Payroll', r[0], r[1] === r[2] ? 'PASS' : 'FAIL', 'got ' + r[1]); });
  },

  /** 7 Oct and 15 Oct NHS rows after the first staging sync. */
  checkOctoberRows: function(add) {
    const sheet = PayTrackerUtils.getPaySheet();
    const table = getConfiguredPayTableByName_('NHS');
    const rows = sheet.getRange(1, table.startColumn, sheet.getLastRow(), 5).getValues();
    [[7, '7 Oct (Antrim 10:00-18:00)'], [15, '15 Oct (Antrim 08:00-16:00)']].forEach(function(day) {
      const row = rows.filter(function(r) {
        return r[0] instanceof Date && r[0].getFullYear() === 2026 && r[0].getMonth() === 9 && r[0].getDate() === day[0];
      })[0];
      const ok = row && String(row[2]).trim() === 'Basic' && Math.abs(Number(row[4]) - 95.33) < 0.005;
      add('Payroll', 'PaySheet NHS ' + day[1] + ' = Basic 95.33', ok ? 'PASS' : 'REVIEW',
        row ? 'row shows "' + row[2] + '" ' + row[4] : 'date row not found');
    });
  },

  checkBankTransactions: function(add) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME);
    if (!sheet || sheet.getLastRow() <= 1) { add('Monzo', 'Bank Transactions present', 'REVIEW', 'no rows'); return; }
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function(r) { return String(r[0]); }).filter(Boolean);
    const seen = {};
    const duplicates = ids.filter(function(id) { if (seen[id]) return true; seen[id] = true; return false; });
    add('Monzo', 'No duplicate Monzo transaction IDs', duplicates.length ? 'FAIL' : 'PASS',
      ids.length + ' transactions' + (duplicates.length ? ', duplicates: ' + duplicates.slice(0, 5).join(', ') : ''));
  }
});

/** Run from the STAGING editor after pushing v3.3. Read-only. */
function runPayTrackerAcceptanceChecks() {
  return PayTrackerAcceptanceChecks.run();
}

/**
 * Read-only detail behind two acceptance results: the Smart Savings
 * figures (what is subtracted, and why) and every Staffline timesheet
 * whose calendar hours differ (with the calendar shifts in its window).
 */
function logPayTrackerAcceptanceDetail() {
  const preview = PayTrackerSmartSavingsService.getPreview();
  Logger.log('SMART SAVINGS ' + preview.period.from + '..' + preview.period.to + ' disposable=' + preview.disposable +
    ' saved=' + preview.savedThisMonth + ' suggested=' + preview.suggestion.amount);
  Logger.log('ACTUAL ' + JSON.stringify(preview.actual));
  Logger.log('COMMITTED bills=' + preview.committed.bills + ' subscriptions=' + preview.committed.subscriptions +
    ' debts=' + preview.committed.debts + ' total=' + preview.committed.total);
  preview.committed.items.forEach(function(item) {
    Logger.log('  due ' + item.dueDate + ' ' + item.kind + ' "' + item.name + '" ' + item.amount + ' ' + item.status);
  });
  preview.warnings.forEach(function(w) { Logger.log('WARNING ' + w); });

  // The largest unconfirmed outgoing transactions this month.
  const C = PayTrackerCashFlowClassifier;
  const context = PayTrackerCashFlowPreviewService.readContext();
  const from = preview.period.from;
  C.classifyAll(context.transactions, context).filter(function(p) {
    const day = PayTrackerPaymentTimeline.dayKey(p.date);
    return day >= from && p.direction !== 'Credit' && (p.categoryConfidence || p.confidence) === C.CONFIDENCE.NEEDS_CONFIRMATION;
  }).sort(function(a, b) { return b.amount - a.amount; }).slice(0, 15).forEach(function(p) {
    Logger.log('  unconfirmed out ' + PayTrackerPaymentTimeline.dayKey(p.date) + ' ' + p.amount + ' ' + p.category + ' "' + p.description + '"');
  });

  const S = PayTrackerStafflineReconciliationService;
  const shifts = PayTrackerCalendarSyncRepository.getActive();
  const timesheets = PayTrackerStafflineTimesheetRepository.getAll();
  (S.getReconciliation({}).rows || []).filter(function(row) { return row.calendarStatus === 'Hours Differ'; }).forEach(function(row) {
    const ts = timesheets.filter(function(t) { return t.timesheetId === row.timesheetId; })[0] || {};
    Logger.log('STAFFLINE ' + row.timesheetId + ' w/e ' + PayTrackerPaymentTimeline.dayKey(row.weekEnding) + ' job ' + row.jobId +
      ' calendar ' + row.calendarExpectedHours + 'h vs staffline ' + row.stafflineSubmittedHours + 'h; site=' + S.siteOfTimesheet_(ts) +
      ' placement="' + ts.placementDescription + '" address="' + ts.workAddress + '"');
    shifts.filter(function(shift) {
      return shift.jobId === row.jobId && S.dateWithin_(shift.eventStart, ts.timesheetStart, ts.timesheetEnd);
    }).forEach(function(shift) {
      Logger.log('  shift ' + PayTrackerPaymentTimeline.dayKey(shift.eventStart) + ' "' + shift.eventTitle + '" site=' +
        S.siteOf_(shift.eventTitle) + ' hours=' + shift.hours + ' counted=' + S.sameSite_(S.siteOfTimesheet_(ts), S.siteOf_(shift.eventTitle)));
    });
  });
}
