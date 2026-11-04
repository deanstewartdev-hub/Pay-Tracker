/*******************************************************
 * PAY TRACKER V3.3 - Liability reconciliation (READ-ONLY diagnostic)
 * Run runPayTrackerLiabilityReconciliation() from the STAGING editor.
 * It reads sheets and calls the existing calculations, and writes one
 * Logger line per record so the figures can be checked record by record:
 *   CALC        the Smart Savings potential-liability total and its items
 *   TIMELINE    the Action Centre risk groups and their occurrence counts
 *   PAYMENT     every unpaid Finance Payments row dated before this month
 *   DUPLICATE   payment IDs used more than once, and identical obligations
 *   BILL / DEBT the active bill and debt definitions
 * It writes nothing to any sheet, never syncs and never calls Monzo.
 *******************************************************/
function runPayTrackerLiabilityReconciliation() {
  const log = function(tag, value) { Logger.log(tag + ' ' + JSON.stringify(value)); };
  const T = PayTrackerPaymentTimeline;
  const today = T.dayKey(new Date());
  const monthStart = today.slice(0, 8) + '01';
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const readRows = function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function(h) { return String(h); });
    return values.slice(1).map(function(row, index) {
      const record = { rowNumber: index + 2 };
      headers.forEach(function(header, column) { record[header] = row[column]; });
      return record;
    });
  };

  log('PERIOD', { today: today, monthStart: monthStart });

  // 1. The figures the owner sees, from the existing code (no change to them).
  try {
    const preview = PayTrackerSmartSavingsService.getPreview();
    log('CALC', {
      potentialLiabilityTotal: preview.potentialLiabilities.total,
      potentialLiabilityCount: preview.potentialLiabilities.items.length,
      carriedOverCount: preview.committed.carriedOver.length,
      carriedOverTotal: preview.committed.carriedOver.reduce(function(s, i) { return s + (Number(i.amount) || 0); }, 0),
      disposable: preview.disposable,
      conservativeDisposable: preview.conservativeDisposable
    });
    preview.committed.carriedOver.forEach(function(item) {
      log('CALC_CARRIED', { name: item.name, kind: item.kind, dueDate: item.dueDate, amount: item.amount, status: item.status });
    });
    preview.potentialLiabilities.items.forEach(function(item) {
      log('CALC_LIABILITY', { name: item.name, kind: item.kind, dueDate: item.dueDate, amount: item.amount, status: item.status });
    });
  } catch (error) {
    log('CALC_ERROR', String(error && error.message ? error.message : error));
  }

  // 2. Action Centre risk groups (one per bill or subscription series).
  try {
    const timeline = PayTrackerUpcomingPaymentsService.get({ horizonDays: 32 });
    let occurrences = 0;
    (timeline.risks || []).forEach(function(risk) {
      occurrences += Number(risk.count) || 0;
      log('TIMELINE', { name: risk.name, kind: risk.kind, sourceId: risk.sourceId, count: risk.count, oldestDue: risk.oldestDue, occurrences: risk.occurrences });
    });
    log('TIMELINE_TOTAL', { groups: (timeline.risks || []).length, occurrences: occurrences });
  } catch (error) {
    log('TIMELINE_ERROR', String(error && error.message ? error.message : error));
  }

  // 3. Every unpaid Finance Payments row dated before this month.
  const payments = readRows(PayTrackerFinanceConfig.SHEETS.PAYMENTS);
  const unpaidBefore = payments.filter(function(row) {
    return !T.isTrue(row['paid?']) && T.dayKey(row['dueDate']) && T.dayKey(row['dueDate']) < monthStart;
  });
  unpaidBefore.forEach(function(row) {
    log('PAYMENT', {
      row: row.rowNumber, paymentId: row['paymentId'], itemId: row['itemId'], paymentType: row['paymentType'],
      name: row['billOrDebtName'], dueDate: T.dayKey(row['dueDate']), amountDue: row['amountDue'],
      paid: row['paid?'], status: row['status'], matchedFinanceId: row['matchedFinanceId'] || ''
    });
  });
  log('PAYMENT_TOTAL', { rows: unpaidBefore.length, amount: unpaidBefore.reduce(function(s, r) { return s + (Number(r['amountDue']) || 0); }, 0) });

  // 4. Duplicates: the same payment ID twice, and the same obligation (name, date, amount) twice.
  const byId = {};
  payments.forEach(function(row) {
    const id = String(row['paymentId'] || '').trim();
    if (id) (byId[id] = byId[id] || []).push(row.rowNumber);
  });
  Object.keys(byId).filter(function(id) { return byId[id].length > 1; }).forEach(function(id) {
    log('DUPLICATE_ID', { paymentId: id, rows: byId[id] });
  });
  const byObligation = {};
  payments.filter(function(row) { return !T.isTrue(row['paid?']); }).forEach(function(row) {
    const key = T.normaliseName(row['billOrDebtName']) + '|' + T.dayKey(row['dueDate']) + '|' + Number(row['amountDue']);
    (byObligation[key] = byObligation[key] || []).push({ row: row.rowNumber, paymentId: row['paymentId'], paymentType: row['paymentType'] });
  });
  Object.keys(byObligation).filter(function(key) { return byObligation[key].length > 1; }).forEach(function(key) {
    log('DUPLICATE_OBLIGATION', { obligation: key, records: byObligation[key] });
  });

  // 5. Definitions, for bill-versus-debt representation checks.
  readRows(PayTrackerFinanceConfig.SHEETS.BILLS || 'Bills').filter(function(row) {
    return String(row['active'] || '').trim() === 'Yes';
  }).forEach(function(row) {
    log('BILL', { row: row.rowNumber, billId: row['billId'], name: row['billName'], amount: row['amount'], frequency: row['frequency'], nextDueDate: T.dayKey(row['nextDueDate']) });
  });
  readRows(PayTrackerFinanceConfig.SHEETS.DEBTS || 'Debts').forEach(function(row) {
    log('DEBT', { row: row.rowNumber, debtId: row['debtId'], name: row['debtName'], active: row['active'], repaymentAmount: row['repaymentAmount'], frequency: row['frequency'], nextPaymentDate: T.dayKey(row['nextPaymentDate']) });
  });
  log('DONE', { today: today });
}
