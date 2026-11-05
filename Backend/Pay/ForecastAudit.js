/*******************************************************
 * PAY TRACKER V3.3 - Forecast audit (READ-ONLY diagnostic)
 * Run runPayTrackerForecastAudit() from the STAGING editor. It reads the PaySheet
 * and logs, for each week, the raw figures the monthly take-home estimate is built from.
 * It writes nothing to any sheet and never syncs.
 *******************************************************/
function runPayTrackerForecastAudit() {
  const sheet = PayTrackerUtils.getPaySheet();
  const weeks = PayTrackerUtils.getExistingWeekCount(sheet);
  const grid = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), Math.max(sheet.getLastColumn(), 1));
  const values = grid.getValues();
  const display = grid.getDisplayValues();
  const tables = getConfiguredPayTables_();
  const num = function (v) { return Number(v) || 0; };
  const cell = function (row, col) { return (values[row - 1] || [])[col - 1]; };
  const summaryCol = PayTrackerConfig.SHEET.WEEKLY_SUMMARY_VALUE_COLUMN;

  Logger.log('AUDIT_META ' + JSON.stringify({
    existingWeeks: weeks,
    today: PayTrackerEmploymentPeriods.dayKeyOf(new Date()),
    estimateNow: PayTrackerFinanceDashboard.calculateEstimatedMonthlyTakeHome()
  }));

  for (let weekNumber = 1; weekNumber <= weeks; weekNumber++) {
    const startRow = PayTrackerUtils.getWeekStartRow(weekNumber);
    const populated = PayTrackerWeekManager.weekHasShiftDataFromGrid(display, startRow);
    const rec = {
      week: weekNumber,
      startRow: startRow,
      weekLabel: String(display[startRow - 1] ? display[startRow - 1][0] : ''),
      populated: populated,
      taxableGross: num(cell(startRow + 1, summaryCol)),
      deductions: num(cell(startRow + 2, summaryCol)),
      stafflineTakeHome: num(cell(startRow + 3, summaryCol)),
      loggingCash: num(cell(startRow + 4, summaryCol)),
      totalTakeHome: num(cell(startRow + 5, summaryCol)),
      tables: {}
    };
    tables.forEach(function (table) {
      const hoursCol = table.startColumn + 3;
      const payCol = table.startColumn + 4;
      const shiftDays = [];
      for (let r = 0; r < 8; r++) {
        const row = startRow + PayTrackerConfig.SHEET.WEEK_DATA_ROW_OFFSET + r;
        const shift = String(cell(row, table.startColumn + 2) || '');
        if (shift) shiftDays.push((r + 1) + ':' + shift + ':' + num(cell(row, hoursCol)) + ':' + num(cell(row, payCol)));
      }
      rec.tables[table.name] = {
        totalHours: num(cell(startRow + PayTrackerConfig.SHEET.WEEK_TOTAL_ROW_OFFSET, hoursCol)),
        totalPay: num(cell(startRow + PayTrackerConfig.SHEET.WEEK_TOTAL_ROW_OFFSET, payCol)),
        rows: shiftDays
      };
    });
    Logger.log('AUDIT_WEEK ' + JSON.stringify(rec));
  }
  Logger.log('AUDIT_DONE');
}
