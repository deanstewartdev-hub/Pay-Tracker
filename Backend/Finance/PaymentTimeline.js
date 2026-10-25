/*******************************************************
 * PAY TRACKER V3.3 (Step 2B - Dynamic Upcoming Payments)
 * Pure payment timeline: one ordered list of upcoming Bill and
 * Subscription payments, their payment history and outstanding risks.
 *
 * No sheet access: UpcomingPaymentsService reads the existing
 * sheets and hands them in. Two stages, so the expensive part can
 * be cached and the date-dependent part is always current:
 *
 *   buildSeries(sources) -> plain JSON "series" (one per bill or
 *     subscription, with every piece of payment evidence found for
 *     it) + recorded history. Cacheable; independent of today.
 *   present(model, today) -> the timeline for that calendar day.
 *
 * Rules (date-driven timeline):
 * - Upcoming holds only occurrences due today or later, sorted by
 *   date. Each recurring bill or subscription always shows its next
 *   scheduled occurrence, generated from its recurrence rule.
 * - Once its due date has passed, an occurrence moves to History
 *   automatically, paid or not. Moving is NOT paying: its status
 *   comes only from evidence - Paid (confirmed Monzo match, Paid?
 *   tick, Payment History, confirmed subscription link), Needs review
 *   (an unconfirmed or likely Monzo match), Failed (the payment row
 *   reported an error) or Unverified (no evidence). `settled` is true
 *   only for Paid, so savings figures stay conservative.
 * - Unsettled past occurrences are reported as outstanding risks,
 *   one per bill or subscription, for the Action Centre.
 * - Monzo evidence only enriches statuses; it never holds the
 *   timeline back.
 * - A subscription linked to (or identical to) an active bill is
 *   shown once, as the bill. One bank transaction confirms at most
 *   one payment.
 * - Dates are calendar days in the script time zone (Europe/London),
 *   so "due today" lasts until midnight and advances after it.
 *******************************************************/

const PayTrackerPaymentTimeline = Object.freeze({
  KINDS: Object.freeze({ BILL: 'Bill', SUBSCRIPTION: 'Subscription' }),

  STATUSES: Object.freeze({
    UPCOMING: 'Upcoming',
    DUE_TODAY: 'Due today',
    PAID: 'Paid',
    UNVERIFIED: 'Unverified',
    FAILED: 'Failed',
    NEEDS_REVIEW: 'Needs review'
  }),

  // Bank payments can post a day or two after the due date: an unverified
  // payment is only reported as an outstanding risk after this many days.
  AWAITING_GRACE_DAYS: 3,
  HORIZON_DAYS: 30,
  // A payment this close to a due date is evidence for that occurrence.
  MATCH_BEFORE_DAYS: 5,
  MATCH_AFTER_DAYS: 10,
  // Past occurrences kept per bill/subscription (the oldest open one is always kept).
  PAST_OCCURRENCES_PER_SERIES: 12,
  HISTORY_LIMIT_PER_KIND: 40,
  // Risks: the oldest open occurrence always, plus unsettled ones from the last
  // RISK_LOOKBACK_DAYS. Older projected ones stay in History only, so the Action
  // Centre lists what can still be acted on rather than every missed week.
  RISK_LOOKBACK_DAYS: 35,
  MAX_STEPS: 1200,

  /* ---------------- calendar-day helpers ---------------- */

  toDate: function(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (value === '' || value === null || value === undefined) return null;
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  },

  /** 'yyyy-mm-dd' of the date's calendar day in the script time zone. */
  dayKey: function(value) {
    const date = this.toDate(value);
    if (!date) return '';
    const pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  },

  fromKey: function(key) {
    const parts = String(key).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  },

  /** Whole calendar days from one day to another (DST-safe). */
  daysBetween: function(fromKey, toKey) {
    const a = String(fromKey).split('-').map(Number);
    const b = String(toKey).split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  },

  addDaysKey: function(key, days) {
    const date = this.fromKey(key);
    return this.dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
  },

  /**
   * The day `count` frequency steps after `anchorKey`. Month-based
   * steps keep the anchor's day of month and clamp to short months,
   * always counted from the anchor (31 Jan -> 28 Feb -> 31 Mar,
   * never 31 Jan -> 3 Mar, and no drift to the 28th).
   * Returns '' for one-off, irregular or unknown frequencies.
   */
  stepKey: function(anchorKey, frequency, count) {
    const name = String(frequency || '').trim();
    const days = { 'Weekly': 7, 'Fortnightly': 14, 'Four Weekly': 28 }[name];
    if (days) return this.addDaysKey(anchorKey, days * count);
    const months = { 'Monthly': 1, 'Quarterly': 3, 'Six Monthly': 6, 'Annual': 12, 'Annually': 12, 'Yearly': 12 }[name];
    if (!months) return '';
    return this.dayKey(this.addMonthsClamped(this.fromKey(anchorKey), months * count));
  },

  addMonthsClamped: function(date, months) {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
  },

  /* ---------------- stage 1: series (cacheable) ---------------- */

  /**
   * @param {Object} sources Header-keyed sheet rows:
   *   {bills, payments, paymentHistory, subscriptions, subscriptionLinks, bankTransactions}
   * @return {{series: Array<Object>, history: Array<Object>, notes: Array<string>}}
   */
  buildSeries: function(sources) {
    const self = this;
    const src = sources || {};
    const notes = [];
    const usedTransactions = {};
    const series = [];

    // Bank evidence for Finance Payments rows, from the existing matcher.
    const bankByPayment = {};
    (src.bankTransactions || []).forEach(function(tx) {
      const paymentId = String(tx.matchedFinanceId || '').trim();
      const status = String(tx.matchStatus || '').trim();
      if (!paymentId || status === 'Rejected' || status === 'Unmatched' || status === '') return;
      const confirmed = status === 'Confirmed' || status === 'Automatic';
      const existing = bankByPayment[paymentId];
      if (!existing || (confirmed && !existing.confirmed)) {
        bankByPayment[paymentId] = {
          confirmed: confirmed, transactionId: String(tx.transactionId || ''),
          date: self.dayKey(tx.settledAt || tx.createdAt)
        };
      }
    });

    const billPayments = {};
    (src.payments || []).forEach(function(row) {
      if (String(row.paymentType || '').trim() !== 'Bill Payment') return;
      const itemId = String(row.itemId || '').trim();
      const due = self.dayKey(row.dueDate);
      if (!itemId || !due) return;
      (billPayments[itemId] = billPayments[itemId] || []).push({ row: row, due: due });
    });

    const recordedByBill = {};
    const unshownHistory = [];
    (src.paymentHistory || []).forEach(function(row) {
      if (String(row.paymentType || '').trim() !== 'Bill Payment' || String(row.undoStatus || '').trim() === 'Undone') return;
      const paid = self.dayKey(row.paidDate);
      if (!paid) return;
      const record = {
        id: 'H:' + String(row.paymentId || row.rowNumber || paid), due: self.dayKey(row.originalDueDate), date: paid,
        state: 'paid', source: 'Recorded in Payment History', transactionId: '',
        amount: Math.round((Number(row.amountPaid) || 0) * 100) / 100, name: String(row.billOrDebtName || '')
      };
      const itemId = String(row.itemId || '').trim();
      (recordedByBill[itemId] = recordedByBill[itemId] || []).push(record);
    });

    const activeBills = {};
    (src.bills || []).forEach(function(bill) {
      const id = String(bill.billId || '').trim();
      if (!id || String(bill.active || '').trim() !== 'Yes') return;
      const queue = (billPayments[id] || []).slice().sort(function(a, b) { return a.due < b.due ? -1 : (a.due > b.due ? 1 : 0); });
      // The earliest queued payment row anchors the series (it holds the open occurrence).
      const anchor = queue[0];
      const name = String(bill.billName || (anchor && anchor.row.billOrDebtName) || id);
      const due = anchor ? anchor.due : self.dayKey(bill.nextDueDate);
      if (!due) {
        notes.push(name + ' has no valid due date, so it is not on the timeline. Set its Next Due Date in Finance.');
        return;
      }
      const records = [];
      queue.forEach(function(entry) {
        const paymentId = String(entry.row.paymentId || '').trim();
        let record = null;
        if (self.isTrue(entry.row.paid)) record = { state: 'paid', source: 'Marked paid in Pay Tracker' };
        else if (String(entry.row.status || '').trim() === 'Error') record = { state: 'failed', source: 'Payment processing reported an error' };
        else if (paymentId && bankByPayment[paymentId]) {
          const bank = bankByPayment[paymentId];
          record = bank.confirmed
            ? { state: 'paid', source: 'Confirmed Monzo transaction', transactionId: bank.transactionId, date: bank.date }
            : { state: 'review', source: 'Possible Monzo transaction - confirm the match', transactionId: bank.transactionId, date: bank.date };
        }
        if (!record) return;
        record.id = 'P:' + (paymentId || entry.due);
        record.due = entry.due;
        record.date = record.date || (record.state === 'paid' ? entry.due : '');
        record.transactionId = record.transactionId || '';
        if (record.transactionId) usedTransactions[record.transactionId] = true;
        records.push(record);
      });
      (recordedByBill[id] || []).forEach(function(record) { records.push(record); });
      delete recordedByBill[id];
      const amount = anchor ? Number(anchor.row.amountDue) : Number(bill.amount);
      activeBills[id] = { name: name, amount: Number(bill.amount) || 0 };
      series.push({
        seriesId: 'BILL:' + id, kind: self.KINDS.BILL, sourceId: id,
        paymentId: anchor ? String(anchor.row.paymentId || '').trim() : '',
        name: name, category: String(bill.category || ''), frequency: String(bill.frequency || ''),
        amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
        nextDue: due, priceChange: 0, records: records
      });
    });
    // Payment History of bills that are no longer shown stays visible as history.
    Object.keys(recordedByBill).forEach(function(itemId) {
      recordedByBill[itemId].forEach(function(record) {
        unshownHistory.push({
          kind: self.KINDS.BILL, sourceId: itemId, name: record.name, amount: record.amount,
          dueDate: record.due, paidDate: record.date, status: self.STATUSES.PAID, settled: true,
          source: record.source, evidence: record.source
        });
      });
    });

    const linksBySubscription = {};
    (src.subscriptionLinks || []).forEach(function(link) {
      const id = String(link.subscriptionId || '').trim();
      if (!id) return;
      (linksBySubscription[id] = linksBySubscription[id] || []).push(link);
    });

    let awaitingReview = 0;
    (src.subscriptions || []).forEach(function(sub) {
      const id = String(sub.subscriptionId || '').trim();
      if (!id) return;
      const status = String(sub.subscriptionStatus || 'Active').trim() || 'Active';
      const review = String(sub.reviewStatus || '').trim();
      if (status !== 'Active' || review === 'Rejected') return;
      if (review !== 'Confirmed') { awaitingReview++; return; }
      const name = String(sub.subscriptionName || sub.merchantDisplayName || id);
      const linkedBill = String(sub.linkedBillId || '').trim();
      const amount = Number(sub.latestAmount);
      if (linkedBill && activeBills[linkedBill]) {
        notes.push(name + ' is shown once, as the bill "' + activeBills[linkedBill].name + '".');
        return;
      }
      const twin = Object.keys(activeBills).filter(function(billId) {
        const bill = activeBills[billId];
        return self.normaliseName(bill.name) === self.normaliseName(name) &&
          Math.abs(bill.amount - (amount || 0)) <= Math.max(0.01, 0.01 * bill.amount);
      })[0];
      if (twin) {
        notes.push(name + ' looks like the bill "' + activeBills[twin].name + '" (same name and amount), so it is shown once, as the bill.');
        return;
      }
      const due = self.dayKey(sub.nextExpectedDate);
      if (!due) {
        notes.push(name + ' has no valid next expected date, so it is not on the timeline.');
        return;
      }
      const records = [];
      (linksBySubscription[id] || []).forEach(function(link) {
        const txId = String(link.transactionId || '').trim();
        const paid = self.dayKey(link.paymentDate);
        if (!paid || (txId && usedTransactions[txId])) return;
        if (txId) usedTransactions[txId] = true;
        const confirmed = self.isTrue(link.confirmed);
        records.push({
          id: 'L:' + String(link.linkId || txId || paid), due: '', date: paid,
          state: confirmed ? 'paid' : 'review',
          source: confirmed ? 'Confirmed Monzo transaction' : 'Possible Monzo transaction - confirm the match',
          transactionId: txId, amount: Math.round((Number(link.amount) || 0) * 100) / 100
        });
      });
      series.push({
        seriesId: 'SUB:' + id, kind: self.KINDS.SUBSCRIPTION, sourceId: id, paymentId: '',
        name: name, category: String(sub.category || ''), frequency: String(sub.frequency || ''),
        amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
        nextDue: due, priceChange: Number(sub.priceChangeAmount) || 0, records: records
      });
    });
    if (awaitingReview) notes.push(awaitingReview + ' detected subscription(s) are waiting for your review and are not shown yet.');

    this.addLikelyBankPayments(series, src.bankTransactions || [], usedTransactions);

    // Debt repayments are not bills or subscriptions, but an unpaid past one is
    // still an obligation: present() reports it as a risk, never as settled.
    const debtsDue = (src.payments || []).filter(function(row) {
      const paymentId = String(row.paymentId || '').trim();
      return /debt/i.test(String(row.paymentType || '')) && self.dayKey(row.dueDate) && !self.isTrue(row.paid) &&
        !(bankByPayment[paymentId] && bankByPayment[paymentId].confirmed);
    }).map(function(row) {
      const amount = Number(row.amountDue);
      return {
        paymentId: String(row.paymentId || '').trim(), itemId: String(row.itemId || '').trim(),
        name: String(row.billOrDebtName || row.itemId || 'Debt repayment'), dueDate: self.dayKey(row.dueDate),
        amount: amount > 0 ? Math.round(amount * 100) / 100 : null
      };
    });

    const newestFirst = function(a, b) { return a.paidDate === b.paidDate ? 0 : (a.paidDate < b.paidDate ? 1 : -1); };
    return { series: series, history: unshownHistory.sort(newestFirst).slice(0, this.HISTORY_LIMIT_PER_KIND), debtsDue: debtsDue, notes: notes };
  },

  /**
   * Monzo debits not linked to anything that look like a series' payment
   * (same amount within 1p or 1%, and the payee contains the name or the
   * reverse) become "Needs review" evidence. They enrich History; they
   * never mark anything paid.
   */
  addLikelyBankPayments: function(series, transactions, usedTransactions) {
    const self = this;
    const debits = transactions.filter(function(tx) {
      const id = String(tx.transactionId || '').trim();
      const status = String(tx.matchStatus || '').trim();
      const linked = String(tx.matchedFinanceId || '').trim() && status && status !== 'Rejected' && status !== 'Unmatched';
      return id && !usedTransactions[id] && !linked && String(tx.debitOrCredit || '').trim() === 'Debit' &&
        !self.isTrue(tx.declined) && Number(tx.amount);
    });
    series.forEach(function(item) {
      const name = self.normaliseName(item.name);
      if (item.amount === null || name.length < 3) return;
      debits.forEach(function(tx) {
        const id = String(tx.transactionId);
        if (usedTransactions[id]) return;
        const amount = Math.abs(Number(tx.amount));
        const payee = self.normaliseName(tx.merchantName || tx.description);
        if (payee.length < 3 || Math.abs(amount - item.amount) > Math.max(0.01, 0.01 * item.amount)) return;
        if (payee.indexOf(name) === -1 && name.indexOf(payee) === -1) return;
        const date = self.dayKey(tx.settledAt || tx.createdAt);
        if (!date) return;
        usedTransactions[id] = true;
        item.records.push({
          id: 'T:' + id, due: '', date: date, state: 'review', transactionId: id,
          source: 'Likely Monzo payment on ' + date + ' - confirm the match', amount: Math.round(amount * 100) / 100
        });
      });
    });
  },

  /* ---------------- stage 2: present (always current) ---------------- */

  /**
   * @param {Object} model buildSeries() output (possibly from cache).
   * @param {Date|string} today
   * @param {Object=} options {kind: 'Bill'|'Subscription', limit, horizonDays}
   *   horizonDays: how far ahead to project (default 30; Smart Savings
   *   asks for more so a month that ends 30+ days away is covered).
   */
  present: function(model, today, options) {
    const self = this;
    const S = this.STATUSES;
    const opts = options || {};
    const todayKey = this.dayKey(today);
    const horizonKey = this.addDaysKey(todayKey, Number(opts.horizonDays) || this.HORIZON_DAYS);
    const graceKey = this.addDaysKey(todayKey, -this.AWAITING_GRACE_DAYS);
    const riskFromKey = this.addDaysKey(todayKey, -this.RISK_LOOKBACK_DAYS);
    const upcoming = [];
    let history = [];
    const risks = [];

    (model.series || []).forEach(function(series) {
      if (opts.kind && series.kind !== opts.kind) return;
      const records = (series.records || []).slice().sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
      const used = {};
      const evidenceFor = function(dueKey) {
        const rank = { paid: 0, failed: 1, review: 2 };
        const candidates = records.filter(function(record) {
          if (used[record.id]) return false;
          if (record.due) return record.due === dueKey;
          const offset = record.date ? self.daysBetween(dueKey, record.date) : NaN;
          return offset >= -self.MATCH_BEFORE_DAYS && offset <= self.MATCH_AFTER_DAYS;
        }).sort(function(a, b) {
          return (rank[a.state] - rank[b.state]) ||
            (Math.abs(self.daysBetween(dueKey, a.date || dueKey)) - Math.abs(self.daysBetween(dueKey, b.date || dueKey)));
        });
        if (candidates[0]) used[candidates[0].id] = true;
        return candidates[0] || null;
      };

      // Past occurrences: from the anchor up to yesterday. All of them move to History.
      const past = [];
      let index = 0;
      let dueKey = series.nextDue;
      while (dueKey && dueKey < todayKey && index < self.MAX_STEPS) {
        past.push({ dueKey: dueKey, index: index });
        index++;
        dueKey = self.stepKey(series.nextDue, series.frequency, index);
      }
      const kept = past.filter(function(entry, position) {
        return entry.index === 0 || position >= past.length - self.PAST_OCCURRENCES_PER_SERIES;
      });
      const unsettled = [];
      kept.forEach(function(entry) {
        const evidence = evidenceFor(entry.dueKey);
        const status = !evidence ? S.UNVERIFIED : evidence.state === 'paid' ? S.PAID : evidence.state === 'failed' ? S.FAILED : S.NEEDS_REVIEW;
        const item = self.occurrence(series, entry.dueKey, todayKey, evidence, entry.index, status);
        history.push(item);
        if (!item.settled && entry.dueKey < graceKey && (entry.index === 0 || entry.dueKey >= riskFromKey)) unsettled.push(item);
      });
      if (unsettled.length) risks.push(self.risk(series, unsettled));

      // Today and later: the next scheduled occurrence always shows, then
      // recurrences inside the horizon. One already paid moves to History.
      let shown = false;
      while (dueKey && (!shown || dueKey < horizonKey) && index < self.MAX_STEPS) {
        const evidence = evidenceFor(dueKey);
        if (evidence && evidence.state === 'paid') {
          history.push(self.occurrence(series, dueKey, todayKey, evidence, index, S.PAID));
        } else {
          upcoming.push(self.occurrence(series, dueKey, todayKey, evidence, index, dueKey === todayKey ? S.DUE_TODAY : S.UPCOMING));
          shown = true;
        }
        index++;
        dueKey = self.stepKey(series.nextDue, series.frequency, index);
      }

      // Recorded payments that matched no occurrence shown here are still history.
      records.forEach(function(record) {
        if (used[record.id] || record.state !== 'paid') return;
        history.push({
          kind: series.kind, sourceId: series.sourceId, name: series.name, frequency: series.frequency,
          amount: record.amount === undefined ? series.amount : record.amount,
          dueDate: record.due || '', paidDate: record.date, status: S.PAID, settled: true,
          source: record.source, evidence: record.source, transactionId: record.transactionId || ''
        });
      });
    });

    upcoming.sort(function(a, b) {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const historyDay = function(item) { return item.paidDate || item.dueDate; };
    history = history.concat(model.history || [])
      .filter(function(item) { return !opts.kind || item.kind === opts.kind; })
      .sort(function(a, b) {
        const left = historyDay(a);
        const right = historyDay(b);
        return left === right ? 0 : (left < right ? 1 : -1);
      });
    history = [this.KINDS.BILL, this.KINDS.SUBSCRIPTION].reduce(function(kept, kind) {
      return kept.concat(history.filter(function(item) { return item.kind === kind; }).slice(0, self.HISTORY_LIMIT_PER_KIND));
    }, []).sort(function(a, b) {
      const left = historyDay(a);
      const right = historyDay(b);
      return left === right ? 0 : (left < right ? 1 : -1);
    });

    if (!opts.kind) {
      (model.debtsDue || []).filter(function(debt) { return debt.dueDate < graceKey; }).forEach(function(debt) {
        risks.push({
          riskId: 'DEBT:' + (debt.paymentId || debt.itemId + '@' + debt.dueDate), kind: 'Debt', sourceId: debt.itemId, name: debt.name,
          count: 1, amount: debt.amount || 0, unknownAmountCount: debt.amount === null ? 1 : 0,
          oldestDue: debt.dueDate, latestDue: debt.dueDate, statuses: { Unverified: 1 },
          message: 'Debt repayment due on ' + debt.dueDate + ' is not marked paid and has no confirmed Monzo match. ' +
            'It is still owed until you confirm it in Finance.',
          occurrences: [{ dueDate: debt.dueDate, amount: debt.amount, status: S.UNVERIFIED, evidence: 'No bank confirmation yet' }]
        });
      });
    }
    risks.sort(function(a, b) { return a.oldestDue < b.oldestDue ? -1 : (a.oldestDue > b.oldestDue ? 1 : 0); });

    return {
      today: todayKey,
      upcoming: opts.limit ? upcoming.slice(0, opts.limit) : upcoming,
      totals: {
        next7Days: this.totalWithin(upcoming, 7),
        next30Days: this.totalWithin(upcoming, 30)
      },
      totalsByKind: [this.KINDS.BILL, this.KINDS.SUBSCRIPTION].reduce(function(byKind, kind) {
        const ofKind = upcoming.filter(function(item) { return item.kind === kind; });
        byKind[kind] = { next7Days: self.totalWithin(ofKind, 7), next30Days: self.totalWithin(ofKind, 30) };
        return byKind;
      }, {}),
      history: history,
      risks: risks,
      notes: (model.notes || []).slice()
    };
  },

  occurrence: function(series, dueKey, todayKey, evidence, index, status) {
    const days = this.daysBetween(todayKey, dueKey);
    const settled = status === this.STATUSES.PAID;
    const source = evidence ? evidence.source : (days < 0 ? 'No bank confirmation yet' : '');
    return {
      occurrenceId: series.seriesId + '@' + dueKey,
      kind: series.kind, sourceId: series.sourceId, paymentId: index === 0 ? series.paymentId : '',
      name: series.name, category: series.category, frequency: series.frequency,
      amount: series.amount, priceChange: series.priceChange || 0,
      dueDate: dueKey, daysRemaining: days, countdown: this.countdownText(days),
      status: status, settled: settled, projected: index > 0,
      paidDate: settled && evidence ? evidence.date || '' : '',
      evidence: source, source: source,
      evidenceTransactionId: (evidence && evidence.transactionId) || '',
      transactionId: (evidence && evidence.transactionId) || ''
    };
  },

  /** One Action Centre risk per bill/subscription: its unsettled past payments. */
  risk: function(series, items) {
    const known = items.filter(function(item) { return item.amount !== null; });
    const amount = Math.round(known.reduce(function(sum, item) { return sum + item.amount; }, 0) * 100) / 100;
    const statuses = {};
    items.forEach(function(item) { statuses[item.status] = (statuses[item.status] || 0) + 1; });
    const summary = Object.keys(statuses).map(function(status) { return statuses[status] + ' ' + status.toLowerCase(); }).join(', ');
    return {
      riskId: series.seriesId, kind: series.kind, sourceId: series.sourceId, name: series.name,
      count: items.length, amount: amount, unknownAmountCount: items.length - known.length,
      oldestDue: items[0].dueDate, latestDue: items[items.length - 1].dueDate,
      statuses: statuses,
      message: items.length + ' past ' + (items.length === 1 ? 'payment' : 'payments') + ' (' + summary + ') due ' +
        (items.length === 1 ? 'on ' + items[0].dueDate : 'between ' + items[0].dueDate + ' and ' + items[items.length - 1].dueDate) +
        ' with no confirmed payment. Check your bank, then mark it paid in Finance or confirm the Monzo match.',
      occurrences: items.map(function(item) {
        return { dueDate: item.dueDate, amount: item.amount, status: item.status, evidence: item.evidence };
      })
    };
  },

  countdownText: function(days) {
    if (days === 0) return 'Due today';
    if (days === 1) return 'Tomorrow';
    if (days > 1) return 'In ' + days + ' days';
    if (days === -1) return '1 day ago';
    return (-days) + ' days ago';
  },

  /** Amounts genuinely scheduled from today up to (not including) today + days. */
  totalWithin: function(upcoming, days) {
    const within = upcoming.filter(function(item) { return item.daysRemaining >= 0 && item.daysRemaining < days; });
    const known = within.filter(function(item) { return item.amount !== null; });
    return {
      amount: Math.round(known.reduce(function(sum, item) { return sum + item.amount; }, 0) * 100) / 100,
      count: within.length,
      unknownAmountCount: within.length - known.length
    };
  },

  normaliseName: function(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  isTrue: function(value) {
    return value === true || String(value).toUpperCase() === 'TRUE';
  }
});
