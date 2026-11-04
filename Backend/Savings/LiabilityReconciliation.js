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
    (preview.warnings || []).forEach(function(w) { log('CALC_WARNING', String(w)); });
    (preview.committed.likelyPaid || []).forEach(function(item) {
      log('LIKELY_PAID', { name: item.name, dueDate: item.dueDate, amount: item.amount, paidDate: item.paidDate, transactionId: item.transactionId });
    });
  } catch (error) {
    log('CALC_ERROR', String(error && error.message ? error.message : error));
  }

  // 2. Action Centre risk groups (one per bill or subscription series).
  try {
    const timeline = PayTrackerUpcomingPaymentsService.get({ horizonDays: 32 });
    let occurrences = 0;
    (timeline.history || []).filter(function(item) { return item.settled === false; }).forEach(function(item) {
      log('HISTORY_UNSETTLED', { name: item.name, kind: item.kind, dueDate: item.dueDate, amount: item.amount, status: item.status, sourceId: item.sourceId, projected: item.projected });
    });
    (timeline.risks || []).forEach(function(risk) {
      occurrences += Number(risk.count) || 0;
      log('TIMELINE', { name: risk.name, kind: risk.kind, sourceId: risk.sourceId, count: risk.count, oldestDue: risk.oldestDue, occurrences: risk.occurrences });
    });
    log('TIMELINE_TOTAL', { groups: (timeline.risks || []).length, occurrences: occurrences });
  } catch (error) {
    log('TIMELINE_ERROR', String(error && error.message ? error.message : error));
  }

  // 3. Every unpaid Finance Payments row dated before this month.
  // Header names are the sheet's own (see FinanceConfig.PAYMENTS.HEADERS). Blank rows are skipped.
  const payments = readRows(PayTrackerFinanceConfig.SHEETS.PAYMENTS).filter(function(row) {
    return String(row['Payment ID'] || '').trim() !== '' || String(row['Bill or Debt Name'] || '').trim() !== '';
  });
  const unpaidBefore = payments.filter(function(row) {
    return !T.isTrue(row['Paid?']) && T.dayKey(row['Due Date']) && T.dayKey(row['Due Date']) < monthStart;
  });
  unpaidBefore.forEach(function(row) {
    log('PAYMENT', {
      row: row.rowNumber, paymentId: row['Payment ID'], itemId: row['Item ID'], paymentType: row['Payment Type'],
      name: row['Bill or Debt Name'], dueDate: T.dayKey(row['Due Date']), amountDue: row['Amount Due'],
      paid: row['Paid?'], status: row['Status']
    });
  });
  log('PAYMENT_TOTAL', { rows: unpaidBefore.length, amount: unpaidBefore.reduce(function(s, r) { return s + (Number(r['Amount Due']) || 0); }, 0) });
  log('PAYMENT_ROWS_READ', { nonBlankRows: payments.length });

  // 4. Duplicates: the same payment ID twice, and the same obligation (name, date, amount) twice.
  const byId = {};
  payments.forEach(function(row) {
    const id = String(row['Payment ID'] || '').trim();
    if (id) (byId[id] = byId[id] || []).push(row.rowNumber);
  });
  Object.keys(byId).filter(function(id) { return byId[id].length > 1; }).forEach(function(id) {
    log('DUPLICATE_ID', { paymentId: id, rows: byId[id] });
  });
  const byObligation = {};
  payments.filter(function(row) { return !T.isTrue(row['Paid?']); }).forEach(function(row) {
    const key = T.normaliseName(row['Bill or Debt Name']) + '|' + T.dayKey(row['Due Date']) + '|' + Number(row['Amount Due']);
    (byObligation[key] = byObligation[key] || []).push({ row: row.rowNumber, paymentId: row['Payment ID'], paymentType: row['Payment Type'] });
  });
  Object.keys(byObligation).filter(function(key) { return byObligation[key].length > 1; }).forEach(function(key) {
    log('DUPLICATE_OBLIGATION', { obligation: key, records: byObligation[key] });
  });

  // 5. Definitions, for bill-versus-debt representation checks.
  readRows(PayTrackerFinanceConfig.SHEETS.BILLS).filter(function(row) {
    return String(row['Active'] || '').trim() === 'Yes';
  }).forEach(function(row) {
    log('BILL', { row: row.rowNumber, billId: row['Bill ID'], name: row['Bill Name'], amount: row['Amount'], frequency: row['Frequency'], nextDueDate: T.dayKey(row['Next Due Date']) });
  });
  readRows(PayTrackerFinanceConfig.SHEETS.DEBTS).filter(function(row) {
    return String(row['Debt ID'] || '').trim() !== '';
  }).forEach(function(row) {
    log('DEBT', { row: row.rowNumber, debtId: row['Debt ID'], name: row['Debt Name'], active: row['Active'], repaymentAmount: row['Repayment Amount'], frequency: row['Frequency'], nextPaymentDate: T.dayKey(row['Next Payment Date']) });
  });
  log('DONE', { today: today });
}
