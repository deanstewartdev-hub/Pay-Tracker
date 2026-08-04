/*******************************************************
 * PAY TRACKER V2.5
 * Main.gs
 *
 * Public triggers and menu entrypoints.
 *******************************************************/

function onOpen() {
  try {
    PayTrackerMenu.build();
  } catch (error) {
    PayTrackerUtils.logError(
      'Unable to build Pay Tracker menu',
      error
    );
  }
}

function onEdit(event) {
  try {
    PayTrackerPayCalculator.handleEdit(event);
    PayTrackerFinanceService.handleEdit(event);
    PayTrackerPaymentService.handleEdit(event);
    PayTrackerSavingsService.handleEdit(event);
    PayTrackerSavingsContributionService.handleEdit(event);
    PayTrackerLifeGoalsService.handleEdit(event);
  } catch (error) {
    PayTrackerUtils.logError(
      'Unable to process spreadsheet edit',
      error
    );

    try {
      PayTrackerUtils.showError(
        'Spreadsheet Update Error',
        error
      );
    } catch (ignoredError) {
      console.error(ignoredError);
    }
  }
}

/* CALENDAR */

function syncGoogleCalendarToPaySheet() {
  PayTrackerUtils.withDocumentLock(function () {
    const result = PayTrackerCalendarService.sync();

    PayTrackerUtils.showMessage(
      'Calendar Sync Complete',
      [
        'Imported: ' + result.imported,
        'Skipped existing/manual rows: ' + result.skipped,
        'Ignored non-work events: ' + result.ignored,
        'Duplicate events ignored: ' + result.duplicates
      ].join('\n')
    );
  });
}

function debugCalendarEvents() {
  try {
    const records = PayTrackerCalendarService.debugEvents();

    PayTrackerUtils.showMessage(
      'Calendar Debug Complete',
      records.length +
        ' events were written to the Apps Script execution log.'
    );
  } catch (error) {
    PayTrackerUtils.showError(
      'Calendar Debug Error',
      error
    );
  }
}

/* WEEKS */

function addNextWeek() {
  PayTrackerUtils.withDocumentLock(function () {
    const weekNumber =
      PayTrackerSheetBuilder.addNextCompleteWeek();

    PayTrackerUtils.showMessage(
      'Week Added',
      'Week ' +
        weekNumber +
        ' was added successfully.'
    );
  });
}

function generateAdditionalWeeks(numberOfWeeks) {
  PayTrackerUtils.withDocumentLock(function () {
    const createdWeeks =
      PayTrackerSheetBuilder.addCompleteWeeks(
        numberOfWeeks
      );

    PayTrackerUtils.showMessage(
      'Weeks Added',
      createdWeeks.length +
        ' weeks were added successfully.'
    );
  });
}

function fixAllWeekDatesOnly() {
  PayTrackerUtils.withDocumentLock(function () {
    const updatedWeeks =
      PayTrackerWeekManager.fixAllWeekDates();

    PayTrackerUtils.showMessage(
      'Week Dates Repaired',
      updatedWeeks +
        ' week blocks were updated. Shift and pay data were preserved.'
    );
  });
}

function showRelevantWeeksOnly() {
  PayTrackerWeekManager.showRelevantWeeksOnly();
}

function showAllWeeks() {
  PayTrackerWeekManager.showAllWeeks();
}

/* PAY AND SUMMARIES */

function recalculateAllPay() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerPayCalculator.recalculateAllPay();
    PayTrackerSummaryService.refreshAllSummaries();

    PayTrackerUtils.showMessage(
      'Pay Recalculation Complete',
      'All Pay values and summary panels were recalculated.'
    );
  });
}

function refreshPaySummaryPanels() {
  PayTrackerUtils.withDocumentLock(function () {
    const rebuiltWeeks =
      PayTrackerSummaryService.refreshAllSummaries();

    PayTrackerUtils.showMessage(
      'Summary Panels Updated',
      rebuiltWeeks +
        ' weekly summaries and the running totals were rebuilt.'
    );
  });
}

function applyMonthColoursToExistingWeeks() {
  PayTrackerUtils.withDocumentLock(function () {
    const updatedWeeks =
      PayTrackerWeekManager.applyMonthColours();

    PayTrackerUtils.showMessage(
      'Month Colours Applied',
      updatedWeeks +
        ' existing weeks were updated.'
    );
  });
}

function refreshPayTrackerLayout() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerSheetBuilder.refreshLayout();

    PayTrackerUtils.showMessage(
      'Layout Updated',
      'The Pay Tracker layout was refreshed.'
    );
  });
}

/* BACKUP AND SETUP */

function backupPaySheet() {
  PayTrackerUtils.withDocumentLock(function () {
    const result =
      PayTrackerBackupService.createBackup();

    PayTrackerUtils.showMessage(
      'Backup Created',
      'A backup was created successfully:\n' +
        result.backupName
    );
  });
}

function setupPayTracker() {
  PayTrackerUtils.withDocumentLock(function () {
    const result = PayTrackerSheetBuilder.setup();

    if (result.cancelled) {
      return;
    }

    PayTrackerUtils.showMessage(
      'Pay Tracker Created',
      [
        result.createdWeeks +
          ' weeks were created successfully.',
        '',
        'Safety backup:',
        result.backupName
      ].join('\n')
    );
  });
}

/* FINANCE MODULE */

function setupFinanceModule() {
  PayTrackerUtils.withDocumentLock(function () {
    const result =
      PayTrackerFinanceService.setupFinanceModule();

    PayTrackerFinanceIntegrationSetupService
      .setup();

    PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Finance Module Ready',
      [
        'The finance module was created or upgraded successfully.',
        '',
        'Created or updated:',
        '• ' + result.billsSheet,
        '• ' + result.debtsSheet,
        '• ' + result.paymentsSheet,
        '• ' + result.paymentHistorySheet,
        '• ' + PayTrackerFinanceConfig.SHEETS.DASHBOARD
      ].join('\n')
    );
  });
}

function refreshFinanceDashboard() {
  PayTrackerUtils.withDocumentLock(function () {
    const figures =
      PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Finance Dashboard Updated',
      [
        'Estimated monthly take-home: £' +
          figures.estimatedMonthlyTakeHome.toFixed(2),
        'Monthly bills: £' +
          figures.monthlyBills.toFixed(2),
        'Monthly debt repayments: £' +
          figures.monthlyDebtRepayments.toFixed(2),
        'Planned savings: £' +
          figures.monthlySavings.toFixed(2),
        'Disposable after savings: £' +
          figures.disposableIncome.toFixed(2)
      ].join('\n')
    );
  });
}

function recalculateFinanceModule() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerFinanceService.recalculateAllFinanceRows();
    PayTrackerPaymentService.syncUpcomingPayments();

    if (
      typeof PayTrackerSavingsService !== 'undefined'
    ) {
      PayTrackerSavingsService.recalculateAll();
      PayTrackerSavingsContributionService.syncUpcomingContributions();
      PayTrackerLifeGoalsService.recalculateAllGoals();
    }

    PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Finance Calculations Updated',
      'Bills, debts, savings, upcoming items and the dashboard were refreshed.'
    );
  });
}

function syncUpcomingFinancePayments() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerPaymentService.syncUpcomingPayments();
    PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Upcoming Payments Updated',
      'Missing upcoming bill and debt payments were generated.'
    );
  });
}

function undoLastFinancePayment() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Undo Last Payment',
    [
      'This will reverse the most recently completed payment.',
      '',
      'Continue?'
    ].join('\n'),
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  PayTrackerUtils.withDocumentLock(function () {
    const result =
      PayTrackerPaymentService.undoLastPayment();

    PayTrackerUtils.showMessage(
      'Payment Undone',
      [
        result.itemName,
        result.paymentType,
        '£' + Number(result.amount || 0).toFixed(2),
        '',
        'The payment was returned to Finance Payments.'
      ].join('\n')
    );
  });
}

/* SAVINGS MODULE */

function setupSavingsModule() {
  PayTrackerUtils.withDocumentLock(function () {
    const result =
      PayTrackerSavingsService.setupSavingsModule();

    PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Savings Module Ready',
      [
        'The savings and life-goals module was created or upgraded successfully.',
        '',
        'Created or updated:',
        '• ' + result.settingsSheet,
        '• ' + result.potsSheet,
        '• ' + result.contributionsSheet,
        '• ' + result.historySheet,
        '• ' + result.goalsSheet
      ].join('\n')
    );
  });
}

function recalculateSavingsModule() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerSavingsService.recalculateAll();
    PayTrackerSavingsContributionService.syncUpcomingContributions();
    PayTrackerLifeGoalsService.recalculateAllGoals();
    PayTrackerFinanceDashboard.refresh();

    const allocation =
      PayTrackerSavingsService.validateAllocation();

    PayTrackerUtils.showMessage(
      'Savings Updated',
      [
        'Savings pots, contributions, goals and dashboard were refreshed.',
        '',
        'Active allocation total: ' +
          (allocation.totalAllocation * 100).toFixed(2) +
          '%'
      ].join('\n')
    );
  });
}

function syncUpcomingSavingsContributions() {
  PayTrackerUtils.withDocumentLock(function () {
    PayTrackerSavingsContributionService.syncUpcomingContributions();
    PayTrackerFinanceDashboard.refresh();

    PayTrackerUtils.showMessage(
      'Savings Contributions Updated',
      'Missing suggested savings deposits were generated.'
    );
  });
}

function undoLastSavingsDeposit() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Undo Last Savings Deposit',
    [
      'This will reverse the most recently completed savings deposit.',
      '',
      'Continue?'
    ].join('\n'),
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  PayTrackerUtils.withDocumentLock(function () {
    const result =
      PayTrackerSavingsContributionService.undoLastContribution();

    PayTrackerUtils.showMessage(
      'Savings Deposit Undone',
      [
        result.potName,
        '£' + Number(result.amount || 0).toFixed(2),
        '',
        'The deposit was returned to Savings Contributions.'
      ].join('\n')
    );
  });
}

/* OPEN SHEETS */

function openFinanceDashboard() {
  openModuleSheet_(
    PayTrackerFinanceConfig.SHEETS.DASHBOARD
  );
}

function openBillsSheet() {
  openModuleSheet_(
    PayTrackerFinanceConfig.SHEETS.BILLS
  );
}

function openDebtsSheet() {
  openModuleSheet_(
    PayTrackerFinanceConfig.SHEETS.DEBTS
  );
}

function openFinancePaymentsSheet() {
  openModuleSheet_(
    PayTrackerFinanceConfig.SHEETS.PAYMENTS
  );
}

function openPaymentHistorySheet() {
  openModuleSheet_(
    PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY
  );
}

function openSavingsSettingsSheet() {
  openModuleSheet_(
    PayTrackerSavingsConfig.SHEETS.SETTINGS
  );
}

function openSavingsPotsSheet() {
  openModuleSheet_(
    PayTrackerSavingsConfig.SHEETS.POTS
  );
}

function openSavingsContributionsSheet() {
  openModuleSheet_(
    PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS
  );
}

function openSavingsHistorySheet() {
  openModuleSheet_(
    PayTrackerSavingsConfig.SHEETS.HISTORY
  );
}

function openLifeGoalsSheet() {
  openModuleSheet_(
    PayTrackerSavingsConfig.SHEETS.GOALS
  );
}

function openModuleSheet_(sheetName) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    if (
      Object.keys(PayTrackerSavingsConfig.SHEETS)
        .some(function (key) {
          return (
            PayTrackerSavingsConfig.SHEETS[key] ===
            sheetName
          );
        })
    ) {
      PayTrackerSavingsService.setupSavingsModule();
    } else {
      PayTrackerFinanceService.setupFinanceModule();
    }

    PayTrackerFinanceDashboard.refresh();
    sheet = spreadsheet.getSheetByName(sheetName);
  }

  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  spreadsheet.setActiveSheet(sheet);
}

/* COMPATIBILITY WRAPPERS */

function buildMonthlyTotal(sheet) {
  PayTrackerSummaryService.buildRunningTotals(
    sheet || PayTrackerUtils.getPaySheet()
  );
}

function buildWeeklySummary(sheet, startRow) {
  PayTrackerSummaryService.buildWeeklySummary(
    sheet,
    startRow
  );
}

function calculatePay_(tableName, shiftType, hours) {
  return PayTrackerPayCalculator.calculatePay(
    tableName,
    shiftType,
    hours
  );
}

function getWeekStartDate_(weekNumber) {
  return PayTrackerUtils.getWeekStartDate(weekNumber);
}

function getWeekNumberFromDate_(date) {
  return PayTrackerUtils.getWeekNumberFromDate(date);
}

function getExistingWeekCount_(sheet) {
  return PayTrackerUtils.getExistingWeekCount(sheet);
}

function stripTime_(date) {
  return PayTrackerUtils.stripTime(date);
}

function getDayName_(date) {
  return PayTrackerUtils.getDayName(date);
}

function columnLetter(columnNumber) {
  return PayTrackerUtils.columnLetter(columnNumber);
}

function cellRef(row, column) {
  return PayTrackerUtils.cellReference(row, column);
}
